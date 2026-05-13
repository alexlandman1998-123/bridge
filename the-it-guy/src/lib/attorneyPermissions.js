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
  'conveyancing_secretary',
  'admin_staff',
  'reception_scheduling',
  'candidate_attorney',
]

export const ATTORNEY_FIRM_MEMBER_STATUS_VALUES = ['invited', 'active', 'suspended', 'removed']

export const ATTORNEY_FIRM_DEPARTMENT_TYPES = ['transfer', 'bond', 'admin', 'management']

export const ATTORNEY_INVITATION_STATUS_VALUES = ['pending', 'accepted', 'expired', 'cancelled']

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
  'can_create_attorney_assignments',
  'can_update_attorney_assignments',
  'can_remove_attorney_assignments',
  'can_edit_transfer_workflow',
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
  const assignmentDepartmentId = normalizeText(assignment.department_id || assignment.departmentId)
  const membershipDepartmentId = normalizeText(membership.departmentId)
  if (!assignmentDepartmentId || !membershipDepartmentId || assignmentDepartmentId !== membershipDepartmentId) {
    return false
  }

  const assignmentType = String(assignment.assignment_type || assignment.assignmentType || '').trim().toLowerCase()
  if (assignmentType === 'transfer') {
    return Boolean(permissions.can_view_transfer_matters)
  }
  if (assignmentType === 'bond') {
    return Boolean(permissions.can_view_bond_matters)
  }
  if (assignmentType === 'transfer_and_bond') {
    return Boolean(permissions.can_view_transfer_matters || permissions.can_view_bond_matters)
  }
  return false
}

export async function canAccessAttorneyMatter(transactionId, firmId = null, userId = null) {
  const client = requireClient()
  const resolvedTransactionId = normalizeText(transactionId)
  if (!resolvedTransactionId) return false

  const resolvedUserId = await resolveAuthenticatedUserId(client, userId)

  const assignmentsQuery = await client
    .from('transaction_attorney_assignments')
    .select('id, transaction_id, firm_id, assignment_type, department_id, primary_attorney_id, secretary_id, admin_handler_id, status')
    .eq('transaction_id', resolvedTransactionId)

  if (assignmentsQuery.error) {
    if (isMissingTableError(assignmentsQuery.error, 'transaction_attorney_assignments')) {
      return false
    }
    throw assignmentsQuery.error
  }

  const scopedAssignments = (assignmentsQuery.data || []).filter((assignment) => {
    const status = String(assignment.status || '').trim().toLowerCase()
    if (status === 'removed') return false
    if (firmId && String(assignment.firm_id || '').trim() !== String(firmId).trim()) return false
    return true
  })

  if (!scopedAssignments.length) {
    return false
  }

  for (const assignment of scopedAssignments) {
    if (
      String(assignment.primary_attorney_id || '') === resolvedUserId ||
      String(assignment.secretary_id || '') === resolvedUserId ||
      String(assignment.admin_handler_id || '') === resolvedUserId
    ) {
      return true
    }
  }

  const scopedFirmIds = [...new Set(scopedAssignments.map((assignment) => assignment.firm_id).filter(Boolean))]
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
    const membership = membershipsByFirmId[assignment.firm_id]
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
    .select('id, firm_id, department_id, primary_attorney_id, secretary_id, admin_handler_id, status')
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

  const resolvedFirmId = normalizeText(firmId) || normalizeText(assignment.firm_id)
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
    String(assignment.secretary_id || '') === resolvedUserId ||
    String(assignment.admin_handler_id || '') === resolvedUserId
  ) {
    return true
  }

  return Boolean(
    normalizeText(membership.departmentId) &&
      normalizeText(assignment.department_id) &&
      normalizeText(membership.departmentId) === normalizeText(assignment.department_id),
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
