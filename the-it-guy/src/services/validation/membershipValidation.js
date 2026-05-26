import { MEMBERSHIP_STATUSES, normalizeMembershipStatus } from '../../constants/membershipStatuses'
import { normalizeWorkspaceType } from '../../constants/workspaceTypes'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { resolveWorkspaceRole } from '../roleResolutionService'
import {
  createIntegrityIssue,
  INTEGRITY_ISSUES,
  INTEGRITY_SEVERITIES,
  summarizeIssues,
  validateMembershipRecord,
} from './integrityChecks'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is required for validation.')
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

export async function loadMembershipsForUser(userId) {
  const id = normalizeText(userId)
  if (!id) return []
  const client = requireClient()
  const selectWithScopeFields =
    'id, organisation_id, user_id, branch_id, email, role, workspace_role, organisation_role, app_role, workspace_type, status, scope_level, region_id, workspace_unit_id, scope_metadata, is_primary_owner, active_workspace_selected_at, organisations:organisation_id(id, type, name, display_name)'
  const fallbackSelect =
    'id, organisation_id, user_id, branch_id, email, role, organisation_role, app_role, workspace_type, status, organisations:organisation_id(id, type, name, display_name)'

  let result = await client
    .from('organisation_users')
    .select(selectWithScopeFields)
    .eq('user_id', id)

  if (
    result.error &&
    (isMissingSchemaError(result.error, 'workspace_role') ||
      isMissingSchemaError(result.error, 'scope_level') ||
      isMissingSchemaError(result.error, 'region_id') ||
      isMissingSchemaError(result.error, 'workspace_unit_id') ||
      isMissingSchemaError(result.error, 'scope_metadata') ||
      isMissingSchemaError(result.error, 'is_primary_owner') ||
      isMissingSchemaError(result.error, 'active_workspace_selected_at'))
  ) {
    result = await client
      .from('organisation_users')
      .select(fallbackSelect)
      .eq('user_id', id)
  }

  if (result.error) {
    if (isMissingSchemaError(result.error, 'organisation_users')) return []
    throw result.error
  }
  return (result.data || []).map((row) => ({
    ...row,
    workspace_role: resolveWorkspaceRole(row, {
      appRole: row.app_role,
      workspaceType: row.organisations?.type || row.workspace_type,
    }),
  }))
}

export async function loadAttorneyMembershipsForUser(userId) {
  const id = normalizeText(userId)
  if (!id) return []
  const result = await requireClient()
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, department_id, role, status, attorney_firms:firm_id(id, name, is_active)')
    .eq('user_id', id)

  if (result.error) {
    if (isMissingSchemaError(result.error, 'attorney_firm_members')) return []
    throw result.error
  }
  return (result.data || []).map((row) => ({
    ...row,
    organisation_id: row.firm_id,
    workspace_type: 'attorney_firm',
    workspace_role: resolveWorkspaceRole({ ...row, app_role: 'attorney', workspace_type: 'attorney_firm' }),
    app_role: 'attorney',
    organisations: row.attorney_firms ? { ...row.attorney_firms, type: 'attorney_firm' } : null,
  }))
}

export async function validateMembershipState(membershipId, options = {}) {
  const membership = options.membership || null
  const issues = membership ? validateMembershipRecord(membership, {
    profile: options.profile,
    workspace: membership.organisations || options.workspace,
  }) : [
    createIntegrityIssue({
      code: INTEGRITY_ISSUES.orphanedMembership,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'membership',
      entityId: membershipId,
      message: 'Membership could not be found.',
    }),
  ]

  return {
    entityType: 'membership',
    entityId: membershipId || membership?.id || '',
    membership,
    issues,
    ...summarizeIssues(issues),
  }
}

export async function validateUserMemberships(userId, options = {}) {
  const organisationMemberships = options.organisationMemberships || await loadMembershipsForUser(userId)
  const attorneyMemberships = options.attorneyMemberships || await loadAttorneyMembershipsForUser(userId)
  const memberships = [...organisationMemberships, ...attorneyMemberships]
  const issues = []

  if (!memberships.length) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.membershipMissing,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'user',
      entityId: userId,
      message: 'User has no workspace membership.',
    }))
  }

  for (const membership of memberships) {
    issues.push(...validateMembershipRecord(membership, {
      profile: options.profile,
      workspace: membership.organisations,
    }))
    if (normalizeMembershipStatus(membership.status) === MEMBERSHIP_STATUSES.active && !membership.organisations?.id) {
      issues.push(createIntegrityIssue({
        code: INTEGRITY_ISSUES.workspaceMissing,
        severity: INTEGRITY_SEVERITIES.error,
        entityType: 'membership',
        entityId: membership.id,
        message: 'Active membership points to a missing workspace.',
      }))
    }
  }

  const activeKeys = new Map()
  for (const membership of memberships) {
    if (normalizeMembershipStatus(membership.status) !== MEMBERSHIP_STATUSES.active) continue
    const key = `${normalizeWorkspaceType(membership.workspace_type || membership.organisations?.type)}:${membership.organisation_id || membership.firm_id}`
    activeKeys.set(key, (activeKeys.get(key) || 0) + 1)
  }
  for (const [key, count] of activeKeys.entries()) {
    if (count > 1) {
      issues.push(createIntegrityIssue({
        code: 'duplicate_active_membership',
        severity: INTEGRITY_SEVERITIES.warning,
        entityType: 'user',
        entityId: userId,
        message: 'User has duplicate active memberships for the same workspace.',
        metadata: { key, count },
      }))
    }
  }

  return {
    entityType: 'user_memberships',
    entityId: userId,
    memberships,
    issues,
    ...summarizeIssues(issues),
  }
}
