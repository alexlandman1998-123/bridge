import {
  getAuthenticatedUser,
  isPermissionDeniedError,
  isMissingTableError,
  normalizeText,
  requireClient,
} from '../services/attorneyFirmServiceShared'
import {
  ATTORNEY_DEMO_DEPARTMENTS,
  ATTORNEY_DEMO_FIRM_ID,
  buildAttorneyDemoMembership,
  isAttorneyDemoContextEnabled,
} from './attorneyDemoContext'

export const ATTORNEY_FIRM_ROLE_VALUES = [
  'firm_admin',
  'director_partner',
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
  'conveyancing_secretary',
  'admin_staff',
  'reception_scheduling',
  'candidate_attorney',
]

export const ATTORNEY_FIRM_MEMBER_STATUS_VALUES = ['invited', 'active', 'suspended', 'removed']

export const ATTORNEY_FIRM_DEPARTMENT_TYPES = ['transfer', 'bond', 'cancellation', 'admin', 'management']

export const ATTORNEY_INVITATION_STATUS_VALUES = ['pending', 'accepted', 'expired', 'cancelled']

export const ATTORNEY_FIRM_ADMIN_ROLES = new Set(['firm_admin'])
export const ATTORNEY_FIRM_MANAGER_ROLES = new Set(['firm_admin', 'director_partner'])
export const ATTORNEY_LANE_ROLES = ['transfer', 'bond', 'cancellation']

export const ATTORNEY_PERMISSION_KEYS = [
  'can_view_firm_dashboard',
  'can_manage_firm_settings',
  'can_manage_branding',
  'can_invite_firm_members',
  'can_manage_members',
  'can_manage_departments',
  'can_view_all_firm_matters',
  'can_view_assigned_matters',
  'can_view_transfer_matters',
  'can_view_bond_matters',
  'can_view_cancellation_matters',
  'can_create_attorney_assignments',
  'can_update_attorney_assignments',
  'can_remove_attorney_assignments',
  'can_edit_transfer_workflow',
  'can_edit_bond_workflow',
  'can_edit_cancellation_workflow',
  'can_request_documents',
  'can_review_documents',
  'can_upload_documents',
  'can_reject_documents',
  'can_mark_documents_complete',
  'can_comment_shared',
  'can_comment_internal',
  'can_view_internal_comments',
  'can_manage_signing_appointments',
  'can_generate_otp',
  'can_export_reports',
  'can_view_client_visible_updates',
  'can_publish_client_visible_updates',
]

function buildPermissionRecord(enabledKeys = []) {
  const enabledSet = new Set(enabledKeys)
  return ATTORNEY_PERMISSION_KEYS.reduce((accumulator, key) => {
    accumulator[key] = enabledSet.has(key)
    return accumulator
  }, {})
}

const FULL_ACCESS = buildPermissionRecord(ATTORNEY_PERMISSION_KEYS)

export const ATTORNEY_ROLE_PERMISSION_MAP = {
  firm_admin: FULL_ACCESS,
  director_partner: buildPermissionRecord([
    'can_view_firm_dashboard',
    'can_view_all_firm_matters',
    'can_view_transfer_matters',
    'can_view_bond_matters',
    'can_view_cancellation_matters',
    'can_create_attorney_assignments',
    'can_update_attorney_assignments',
    'can_remove_attorney_assignments',
    'can_request_documents',
    'can_review_documents',
    'can_upload_documents',
    'can_reject_documents',
    'can_mark_documents_complete',
    'can_comment_shared',
    'can_comment_internal',
    'can_view_internal_comments',
    'can_manage_signing_appointments',
    'can_generate_otp',
    'can_export_reports',
    'can_view_client_visible_updates',
    'can_publish_client_visible_updates',
  ]),
  transfer_attorney: buildPermissionRecord([
    'can_view_assigned_matters',
    'can_view_transfer_matters',
    'can_edit_transfer_workflow',
    'can_request_documents',
    'can_review_documents',
    'can_upload_documents',
    'can_reject_documents',
    'can_mark_documents_complete',
    'can_comment_shared',
    'can_comment_internal',
    'can_view_internal_comments',
    'can_manage_signing_appointments',
    'can_generate_otp',
    'can_view_client_visible_updates',
    'can_publish_client_visible_updates',
  ]),
  bond_attorney: buildPermissionRecord([
    'can_view_assigned_matters',
    'can_view_bond_matters',
    'can_edit_bond_workflow',
    'can_request_documents',
    'can_review_documents',
    'can_upload_documents',
    'can_reject_documents',
    'can_mark_documents_complete',
    'can_comment_shared',
    'can_comment_internal',
    'can_view_internal_comments',
    'can_manage_signing_appointments',
    'can_view_client_visible_updates',
    'can_publish_client_visible_updates',
  ]),
  cancellation_attorney: buildPermissionRecord([
    'can_view_assigned_matters',
    'can_view_cancellation_matters',
    'can_edit_cancellation_workflow',
    'can_request_documents',
    'can_review_documents',
    'can_upload_documents',
    'can_reject_documents',
    'can_mark_documents_complete',
    'can_comment_shared',
    'can_comment_internal',
    'can_view_internal_comments',
    'can_manage_signing_appointments',
    'can_view_client_visible_updates',
    'can_publish_client_visible_updates',
  ]),
  conveyancing_secretary: buildPermissionRecord([
    'can_view_assigned_matters',
    'can_request_documents',
    'can_review_documents',
    'can_upload_documents',
    'can_reject_documents',
    'can_mark_documents_complete',
    'can_comment_shared',
    'can_comment_internal',
    'can_view_internal_comments',
    'can_manage_signing_appointments',
    'can_view_client_visible_updates',
    'can_publish_client_visible_updates',
  ]),
  admin_staff: buildPermissionRecord([
    'can_view_assigned_matters',
    'can_request_documents',
    'can_review_documents',
    'can_upload_documents',
    'can_comment_internal',
    'can_view_internal_comments',
  ]),
  reception_scheduling: buildPermissionRecord([
    'can_view_assigned_matters',
    'can_comment_internal',
    'can_manage_signing_appointments',
  ]),
  candidate_attorney: buildPermissionRecord([
    'can_view_assigned_matters',
    'can_upload_documents',
    'can_comment_internal',
    'can_view_internal_comments',
  ]),
}

export function normalizeAttorneyFirmRole(value, fallback = 'candidate_attorney') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_FIRM_ROLE_VALUES.includes(normalized) ? normalized : fallback
}

export function normalizeAttorneyFirmMemberStatus(value, fallback = 'active') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_FIRM_MEMBER_STATUS_VALUES.includes(normalized) ? normalized : fallback
}

export function normalizeAttorneyDepartmentType(value, fallback = 'admin') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_FIRM_DEPARTMENT_TYPES.includes(normalized) ? normalized : fallback
}

export function normalizeAttorneyInvitationStatus(value, fallback = 'pending') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_INVITATION_STATUS_VALUES.includes(normalized) ? normalized : fallback
}

export function getAttorneyRolePermissions(role) {
  const normalizedRole = normalizeAttorneyFirmRole(role)
  return ATTORNEY_ROLE_PERMISSION_MAP[normalizedRole] || ATTORNEY_ROLE_PERMISSION_MAP.candidate_attorney
}

export function hasAttorneyPermission(role, permissionKey) {
  if (!ATTORNEY_PERMISSION_KEYS.includes(permissionKey)) {
    return false
  }
  return Boolean(getAttorneyRolePermissions(role)[permissionKey])
}

export function attorneyRoleHasPermission(role, permissionKey) {
  return hasAttorneyPermission(role, permissionKey)
}

export function normalizeAttorneyLaneRole(value, fallback = 'transfer') {
  const normalized = String(value || '').trim().toLowerCase().replace(/_attorney$/, '')
  if (normalized === 'transfer_and_bond') return 'transfer'
  return ATTORNEY_LANE_ROLES.includes(normalized) ? normalized : fallback
}

function isMissingColumnLikeError(error, columnName) {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return error.code === 'PGRST204' || message.includes(String(columnName || '').toLowerCase())
}

function isAssignmentActive(assignment = {}) {
  return String(assignment.assignment_status || assignment.status || '').trim().toLowerCase() === 'active'
}

function assignmentCoversLane(assignmentType, laneRole) {
  const normalizedType = String(assignmentType || '').trim().toLowerCase()
  const normalizedLane = normalizeAttorneyLaneRole(laneRole)
  if (normalizedLane === 'transfer') return normalizedType === 'transfer' || normalizedType === 'transfer_and_bond' || normalizedType === 'transfer_attorney'
  if (normalizedLane === 'bond') return normalizedType === 'bond' || normalizedType === 'transfer_and_bond' || normalizedType === 'bond_attorney'
  if (normalizedLane === 'cancellation') return normalizedType === 'cancellation' || normalizedType === 'cancellation_attorney'
  return false
}

function normalizeMembershipRow(row) {
  if (!row) return null
  return {
    id: row.id,
    firmId: row.firm_id,
    userId: row.user_id,
    departmentId: row.department_id || null,
    role: normalizeAttorneyFirmRole(row.role, 'candidate_attorney'),
    status: normalizeAttorneyFirmMemberStatus(row.status, 'active'),
    invitedBy: row.invited_by || null,
    joinedAt: row.joined_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function buildOwnerAdminMembership({ firmId, userId } = {}) {
  const nowIso = new Date().toISOString()
  return {
    id: `owner-admin-${firmId}-${userId}`,
    firmId,
    userId,
    departmentId: null,
    role: 'firm_admin',
    status: 'active',
    invitedBy: userId,
    joinedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    isActive: true,
  }
}

async function resolveOwnerAdminMembershipFallback(client, firmId, userId) {
  const firmLookup = await client
    .from('attorney_firms')
    .select('id, created_by')
    .eq('id', firmId)
    .eq('created_by', userId)
    .maybeSingle()

  if (firmLookup.error || !firmLookup.data?.id) {
    return null
  }

  return buildOwnerAdminMembership({ firmId, userId })
}

async function resolveAuthenticatedUserId(client, userId) {
  const normalizedUserId = normalizeText(userId)
  if (normalizedUserId) return normalizedUserId
  const authUser = await getAuthenticatedUser(client)
  return authUser.id
}

async function resolveFirmIdFromProfile(client, userId) {
  const query = await client
    .from('profiles')
    .select('primary_attorney_firm_id')
    .eq('id', userId)
    .maybeSingle()

  if (query.error) {
    return null
  }

  return normalizeText(query.data?.primary_attorney_firm_id) || null
}

export async function getCurrentUserAttorneyMembership(firmId = null, userId = null) {
  const client = requireClient()
  const resolvedUserId = await resolveAuthenticatedUserId(client, userId)
  let resolvedFirmId = normalizeText(firmId) || (await resolveFirmIdFromProfile(client, resolvedUserId))

  if (!resolvedFirmId && isAttorneyDemoContextEnabled()) {
    resolvedFirmId = ATTORNEY_DEMO_FIRM_ID
  }

  if (!resolvedFirmId) {
    return null
  }

  if (isAttorneyDemoContextEnabled() && resolvedFirmId === ATTORNEY_DEMO_FIRM_ID) {
    return {
      ...buildAttorneyDemoMembership({
        userId: resolvedUserId,
        departmentId: ATTORNEY_DEMO_DEPARTMENTS[0]?.id || null,
        role: 'firm_admin',
      }),
      isActive: true,
    }
  }

  const query = await client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, department_id, role, status, invited_by, joined_at, created_at, updated_at')
    .eq('firm_id', resolvedFirmId)
    .eq('user_id', resolvedUserId)
    .maybeSingle()

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_firm_members')) {
      if (isAttorneyDemoContextEnabled()) {
        return {
          ...buildAttorneyDemoMembership({
            userId: resolvedUserId,
            departmentId: ATTORNEY_DEMO_DEPARTMENTS[0]?.id || null,
            role: 'firm_admin',
          }),
          isActive: true,
        }
      }
      return null
    }
    if (isPermissionDeniedError(query.error)) {
      const ownerFallback = await resolveOwnerAdminMembershipFallback(client, resolvedFirmId, resolvedUserId)
      if (ownerFallback) return ownerFallback
    }
    throw query.error
  }

  const membership = normalizeMembershipRow(query.data)
  if (!membership) {
    const ownerFallback = await resolveOwnerAdminMembershipFallback(client, resolvedFirmId, resolvedUserId)
    if (ownerFallback) return ownerFallback
    if (isAttorneyDemoContextEnabled()) {
      return {
        ...buildAttorneyDemoMembership({
          userId: resolvedUserId,
          departmentId: ATTORNEY_DEMO_DEPARTMENTS[0]?.id || null,
          role: 'firm_admin',
        }),
        isActive: true,
      }
    }
    return null
  }
  return {
    ...membership,
    isActive: membership.status === 'active',
  }
}

export async function canAccessAttorneyFirm(firmId, userId = null) {
  const membership = await getCurrentUserAttorneyMembership(firmId, userId)
  return Boolean(membership?.isActive)
}

function canDepartmentViewAssignment(assignment = {}, permissions = {}, membership = {}) {
  const assignmentDepartmentId = normalizeText(assignment.attorney_department_id || assignment.department_id || assignment.departmentId)
  const membershipDepartmentId = normalizeText(membership.departmentId)
  if (!assignmentDepartmentId || !membershipDepartmentId || assignmentDepartmentId !== membershipDepartmentId) {
    return false
  }

  const assignmentType = String(assignment.attorney_role || assignment.assignment_type || assignment.assignmentType || '').trim().toLowerCase()
  if (assignmentType === 'transfer' || assignmentType === 'transfer_attorney') {
    return Boolean(permissions.can_view_transfer_matters)
  }
  if (assignmentType === 'bond' || assignmentType === 'bond_attorney') {
    return Boolean(permissions.can_view_bond_matters)
  }
  if (assignmentType === 'transfer_and_bond') {
    return Boolean(permissions.can_view_transfer_matters || permissions.can_view_bond_matters)
  }
  if (assignmentType === 'cancellation' || assignmentType === 'cancellation_attorney') {
    return Boolean(permissions.can_view_cancellation_matters)
  }
  return false
}

async function getAttorneyTransactionAssignmentsForPermission(client, transactionId, firmId = null) {
  const resolvedTransactionId = normalizeText(transactionId)
  if (!resolvedTransactionId) return []

  let query = client
    .from('transaction_attorney_assignments')
    .select('id, transaction_id, firm_id, attorney_firm_id, assignment_type, attorney_role, department_id, attorney_department_id, primary_attorney_id, attorney_user_id, secretary_id, admin_handler_id, status, assignment_status, is_primary, can_update_workflow_lane')
    .eq('transaction_id', resolvedTransactionId)

  const resolvedFirmId = normalizeText(firmId)
  if (resolvedFirmId) {
    query = query.eq('firm_id', resolvedFirmId)
  }

  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_attorney_assignments')) {
      return []
    }
    throw result.error
  }

  return result.data || []
}

function findActiveLaneAssignment(assignments = [], attorneyRole = 'transfer') {
  const laneRole = normalizeAttorneyLaneRole(attorneyRole)
  return (
    assignments.find(
      (assignment) =>
        isAssignmentActive({
          status: assignment.assignment_status || assignment.status,
        }) &&
        assignment.is_primary !== false &&
        assignmentCoversLane(assignment.attorney_role || assignment.assignment_type || assignment.assignmentType, laneRole),
    ) || null
  )
}

async function getMembershipsByFirmForUser(client, userId, firmIds = []) {
  const uniqueFirmIds = [...new Set(firmIds.map((firmId) => normalizeText(firmId)).filter(Boolean))]
  const memberships = await Promise.all(
    uniqueFirmIds.map(async (firmId) => {
      try {
        return await getCurrentUserAttorneyMembership(firmId, userId)
      } catch {
        return null
      }
    }),
  )

  return memberships.reduce((accumulator, membership) => {
    if (membership?.firmId) {
      accumulator[membership.firmId] = membership
    }
    return accumulator
  }, {})
}

async function getAttorneyFirmOverrideSetting(client, firmId) {
  const resolvedFirmId = normalizeText(firmId)
  if (!resolvedFirmId) return false

  const result = await client
    .from('attorney_firms')
    .select('id, allow_management_lane_override')
    .eq('id', resolvedFirmId)
    .maybeSingle()

  if (result.error) {
    if (
      isMissingTableError(result.error, 'attorney_firms') ||
      isMissingColumnLikeError(result.error, 'allow_management_lane_override')
    ) {
      return false
    }
    throw result.error
  }

  return Boolean(result.data?.allow_management_lane_override)
}

export async function isAttorneyFirmAdmin(userId, firmId) {
  const membership = await getCurrentUserAttorneyMembership(firmId, userId)
  return Boolean(membership?.isActive && ATTORNEY_FIRM_ADMIN_ROLES.has(membership.role))
}

export async function isAttorneyFirmManager(userId, firmId) {
  const membership = await getCurrentUserAttorneyMembership(firmId, userId)
  return Boolean(membership?.isActive && ATTORNEY_FIRM_MANAGER_ROLES.has(membership.role))
}

export async function getAttorneyLaneAccessContext({ userId = null, transactionId, attorneyRole = 'transfer', firmId = null } = {}) {
  const client = requireClient()
  const resolvedTransactionId = normalizeText(transactionId)
  if (!resolvedTransactionId) {
    return {
      canViewMatter: false,
      canManageMatter: false,
      canAssignLane: false,
      canActAsAttorney: false,
      isAssignedAttorney: false,
      isManagementUser: false,
      managementOverrideEnabled: false,
      laneRole: normalizeAttorneyLaneRole(attorneyRole),
      firmId: normalizeText(firmId) || null,
      firmRole: null,
      assignment: null,
      reason: 'missing_transaction',
    }
  }

  const resolvedUserId = await resolveAuthenticatedUserId(client, userId)
  const laneRole = normalizeAttorneyLaneRole(attorneyRole)
  const assignments = await getAttorneyTransactionAssignmentsForPermission(client, resolvedTransactionId, firmId)
  const activeLaneAssignment = findActiveLaneAssignment(assignments, laneRole)
  const scopedFirmIds = [...new Set(assignments.map((assignment) => assignment.attorney_firm_id || assignment.firm_id).filter(Boolean))]
  const membershipsByFirmId = await getMembershipsByFirmForUser(client, resolvedUserId, scopedFirmIds)
  const primaryMembership =
    ((activeLaneAssignment?.attorney_firm_id || activeLaneAssignment?.firm_id) && membershipsByFirmId[activeLaneAssignment.attorney_firm_id || activeLaneAssignment.firm_id]) ||
    (firmId && membershipsByFirmId[normalizeText(firmId)]) ||
    Object.values(membershipsByFirmId)[0] ||
    null
  const activeMembership = primaryMembership?.isActive ? primaryMembership : null
  const permissions = activeMembership ? getAttorneyRolePermissions(activeMembership.role) : {}
  const isManagementUser = Boolean(activeMembership && ATTORNEY_FIRM_MANAGER_ROLES.has(activeMembership.role))
  const isAssignedAttorney = Boolean(
    activeLaneAssignment &&
      isAssignmentActive(activeLaneAssignment) &&
      String(activeLaneAssignment.attorney_user_id || activeLaneAssignment.primary_attorney_id || '') === resolvedUserId,
  )
  const canViewMatter = await canAccessAttorneyMatter(resolvedTransactionId, firmId, resolvedUserId)
  const canManageMatter = Boolean(canViewMatter && isManagementUser && permissions.can_view_all_firm_matters)
  const canAssignLane = Boolean(
    canManageMatter && (permissions.can_create_attorney_assignments || permissions.can_update_attorney_assignments),
  )
  const overrideFirmId = activeLaneAssignment?.attorney_firm_id || activeLaneAssignment?.firm_id || activeMembership?.firmId || normalizeText(firmId)
  const managementOverrideEnabled = isManagementUser ? await getAttorneyFirmOverrideSetting(client, overrideFirmId) : false
  const canActAsAttorney = Boolean(
    (isAssignedAttorney && activeLaneAssignment?.can_update_workflow_lane !== false) ||
      (isManagementUser && managementOverrideEnabled && canViewMatter && overrideFirmId),
  )

  return {
    canViewMatter,
    canManageMatter,
    canAssignLane,
    canUpdateLane: canActAsAttorney,
    canActAsAttorney,
    isAssignedAttorney,
    isManagementUser,
    managementOverrideEnabled,
    laneRole,
    firmId: overrideFirmId || null,
    firmRole: activeMembership?.role || null,
    assignment: activeLaneAssignment,
    reason: canActAsAttorney
      ? isAssignedAttorney
        ? 'assigned_attorney'
        : 'management_override'
      : canManageMatter
        ? 'management_view_only'
        : canViewMatter
          ? 'matter_view_only'
          : 'no_matter_access',
  }
}

export async function isAssignedAttorneyForLane(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLaneAccessContext({ userId, transactionId, attorneyRole })
  return Boolean(context.isAssignedAttorney)
}

export async function canManageAttorneyFirmMatter(userId, transactionId) {
  const context = await getAttorneyLaneAccessContext({ userId, transactionId, attorneyRole: 'transfer' })
  return Boolean(context.canManageMatter)
}

export async function canAssignAttorneyToLane(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLaneAccessContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canAssignLane)
}

export async function canActAsAttorneyOnLane(userId, transactionId, attorneyRole) {
  const context = await getAttorneyLaneAccessContext({ userId, transactionId, attorneyRole })
  return Boolean(context.canActAsAttorney)
}

export async function canUpdateAttorneyLane(userId, transactionId, attorneyRole) {
  return canActAsAttorneyOnLane(userId, transactionId, attorneyRole)
}

export async function canUserViewAttorneyAssignment(user, transactionId) {
  const userId = typeof user === 'string' ? user : user?.id
  return canAccessAttorneyMatter(transactionId, null, userId)
}

export async function canUserEditAttorneyAssignment(user, assignmentId) {
  const userId = typeof user === 'string' ? user : user?.id
  return canEditAttorneyAssignment(assignmentId, null, userId)
}

export async function canUserAssignAttorneyRole(user, transactionId, attorneyRole) {
  const userId = typeof user === 'string' ? user : user?.id
  return canAssignAttorneyToLane(userId, transactionId, attorneyRole)
}

export async function canUserUpdateAttorneyLane(user, transactionId, attorneyRole) {
  const userId = typeof user === 'string' ? user : user?.id
  return canUpdateAttorneyLane(userId, transactionId, attorneyRole)
}

export async function getUserAttorneyRolesForTransaction(userId, transactionId) {
  const client = requireClient()
  const resolvedUserId = await resolveAuthenticatedUserId(client, userId)
  const resolvedTransactionId = normalizeText(transactionId)
  if (!resolvedTransactionId) return []

  const query = await client
    .from('transaction_attorney_assignments')
    .select('attorney_role, assignment_type, attorney_user_id, primary_attorney_id, secretary_id, admin_handler_id, assignment_status, status')
    .eq('transaction_id', resolvedTransactionId)
    .neq('assignment_status', 'removed')

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_attorney_assignments')) return []
    throw query.error
  }

  return [
    ...new Set(
      (query.data || [])
        .filter((assignment) =>
          [assignment.attorney_user_id, assignment.primary_attorney_id, assignment.secretary_id, assignment.admin_handler_id].some(
            (candidate) => candidate && String(candidate) === String(resolvedUserId),
          ),
        )
        .map((assignment) => normalizeAttorneyLaneRole(assignment.attorney_role || assignment.assignment_type))
        .filter(Boolean),
    ),
  ]
}

export async function canAccessAttorneyMatter(transactionId, firmId = null, userId = null) {
  const client = requireClient()
  const resolvedTransactionId = normalizeText(transactionId)
  if (!resolvedTransactionId) return false

  const resolvedUserId = await resolveAuthenticatedUserId(client, userId)

  const assignmentsQuery = await client
    .from('transaction_attorney_assignments')
    .select('id, transaction_id, firm_id, attorney_firm_id, assignment_type, attorney_role, department_id, attorney_department_id, primary_attorney_id, attorney_user_id, secretary_id, admin_handler_id, status, assignment_status')
    .eq('transaction_id', resolvedTransactionId)

  if (assignmentsQuery.error) {
    if (isMissingTableError(assignmentsQuery.error, 'transaction_attorney_assignments')) {
      return false
    }
    throw assignmentsQuery.error
  }

  const scopedAssignments = (assignmentsQuery.data || []).filter((assignment) => {
    const status = String(assignment.assignment_status || assignment.status || '').trim().toLowerCase()
    if (status === 'removed') return false
    if (firmId && String(assignment.attorney_firm_id || assignment.firm_id || '').trim() !== String(firmId).trim()) return false
    return true
  })

  if (!scopedAssignments.length) {
    return false
  }

  for (const assignment of scopedAssignments) {
    if (
      String(assignment.primary_attorney_id || '') === resolvedUserId ||
      String(assignment.attorney_user_id || '') === resolvedUserId ||
      String(assignment.secretary_id || '') === resolvedUserId ||
      String(assignment.admin_handler_id || '') === resolvedUserId
    ) {
      return true
    }
  }

  const scopedFirmIds = [...new Set(scopedAssignments.map((assignment) => assignment.attorney_firm_id || assignment.firm_id).filter(Boolean))]
  if (!scopedFirmIds.length) return false

  const membershipsQuery = await client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, department_id, role, status, invited_by, joined_at, created_at, updated_at')
    .eq('user_id', resolvedUserId)
    .in('firm_id', scopedFirmIds)
    .eq('status', 'active')

  if (membershipsQuery.error) {
    if (isMissingTableError(membershipsQuery.error, 'attorney_firm_members')) {
      return false
    }
    throw membershipsQuery.error
  }

  const membershipsByFirmId = (membershipsQuery.data || []).reduce((accumulator, row) => {
    const membership = normalizeMembershipRow(row)
    if (membership?.firmId) {
      accumulator[membership.firmId] = membership
    }
    return accumulator
  }, {})

  for (const assignment of scopedAssignments) {
    const membership = membershipsByFirmId[assignment.attorney_firm_id || assignment.firm_id]
    if (!membership) continue

    const permissions = getAttorneyRolePermissions(membership.role)
    if (permissions.can_view_all_firm_matters) {
      return true
    }

    if (canDepartmentViewAssignment(assignment, permissions, membership)) {
      return true
    }
  }

  return false
}

export async function canEditAttorneyAssignment(assignmentId, firmId = null, userId = null) {
  const client = requireClient()
  const resolvedAssignmentId = normalizeText(assignmentId)
  if (!resolvedAssignmentId) return false

  const assignmentQuery = await client
    .from('transaction_attorney_assignments')
    .select('id, firm_id, attorney_firm_id, department_id, attorney_department_id, primary_attorney_id, attorney_user_id, secretary_id, admin_handler_id, status, assignment_status')
    .eq('id', resolvedAssignmentId)
    .maybeSingle()

  if (assignmentQuery.error) {
    if (isMissingTableError(assignmentQuery.error, 'transaction_attorney_assignments')) {
      return false
    }
    throw assignmentQuery.error
  }

  const assignment = assignmentQuery.data
  if (!assignment) return false

  const resolvedFirmId = normalizeText(firmId) || normalizeText(assignment.attorney_firm_id || assignment.firm_id)
  if (!resolvedFirmId) return false

  const membership = await getCurrentUserAttorneyMembership(resolvedFirmId, userId)
  if (!membership?.isActive) return false

  const permissions = getAttorneyRolePermissions(membership.role)
  if (!permissions.can_update_attorney_assignments) {
    return false
  }

  if (permissions.can_view_all_firm_matters) {
    return true
  }

  const resolvedUserId = await resolveAuthenticatedUserId(client, userId)
  if (
    String(assignment.primary_attorney_id || '') === resolvedUserId ||
    String(assignment.attorney_user_id || '') === resolvedUserId ||
    String(assignment.secretary_id || '') === resolvedUserId ||
    String(assignment.admin_handler_id || '') === resolvedUserId
  ) {
    return true
  }

  return Boolean(
    normalizeText(membership.departmentId) &&
      normalizeText(assignment.attorney_department_id || assignment.department_id) &&
      normalizeText(membership.departmentId) === normalizeText(assignment.attorney_department_id || assignment.department_id),
  )
}

export async function canViewInternalAttorneyNotes(transactionId, firmId = null, userId = null) {
  const access = await canAccessAttorneyMatter(transactionId, firmId, userId)
  if (!access) return false
  const membership = await getCurrentUserAttorneyMembership(firmId, userId)
  if (!membership?.isActive) return false
  return hasAttorneyPermission(membership.role, 'can_view_internal_comments')
}

export async function canPublishClientVisibleAttorneyUpdate(transactionId, firmId = null, userId = null) {
  const access = await canAccessAttorneyMatter(transactionId, firmId, userId)
  if (!access) return false
  const membership = await getCurrentUserAttorneyMembership(firmId, userId)
  if (!membership?.isActive) return false
  return hasAttorneyPermission(membership.role, 'can_publish_client_visible_updates')
}
