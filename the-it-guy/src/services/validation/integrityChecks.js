import { APP_ROLES, isCanonicalAppRole, normalizeCanonicalAppRole } from '../../constants/appRoles'
import { MEMBERSHIP_STATUSES, normalizeMembershipStatus } from '../../constants/membershipStatuses'
import { isWorkspaceAuthorityRole, normalizeOrgRole, ORG_ROLE_VALUES } from '../../constants/orgRoles'
import { WORKSPACE_TYPE_VALUES, WORKSPACE_TYPES, inferWorkspaceTypeFromAppRole, normalizeWorkspaceType } from '../../constants/workspaceTypes'

export const INTEGRITY_SEVERITIES = Object.freeze({
  info: 'info',
  warning: 'warning',
  error: 'error',
  critical: 'critical',
})

export const INTEGRITY_ISSUES = Object.freeze({
  profileMissing: 'profile_missing',
  invalidAppRole: 'invalid_app_role',
  membershipMissing: 'membership_missing',
  invalidMembershipStatus: 'invalid_membership_status',
  invalidOrganisationRole: 'invalid_organisation_role',
  workspaceMissing: 'workspace_missing',
  invalidWorkspaceType: 'invalid_workspace_type',
  ownerMissing: 'owner_missing',
  settingsMissing: 'settings_missing',
  defaultBranchMissing: 'default_branch_missing',
  invalidAssignment: 'invalid_assignment',
  onboardingCorrupted: 'onboarding_corrupted',
  orphanedMembership: 'orphaned_membership',
  orphanedBranch: 'orphaned_branch',
  orphanedDepartment: 'orphaned_department',
  orphanedTransaction: 'orphaned_transaction',
  invalidStageTransition: 'invalid_stage_transition',
  schemaMissing: 'schema_missing',
})

export function createIntegrityIssue({
  code,
  severity = INTEGRITY_SEVERITIES.warning,
  entityType = '',
  entityId = '',
  message = '',
  metadata = {},
} = {}) {
  return {
    code,
    severity,
    entityType,
    entityId,
    message,
    metadata,
  }
}

export function summarizeIssues(issues = []) {
  const severityRank = {
    [INTEGRITY_SEVERITIES.info]: 0,
    [INTEGRITY_SEVERITIES.warning]: 1,
    [INTEGRITY_SEVERITIES.error]: 2,
    [INTEGRITY_SEVERITIES.critical]: 3,
  }
  const highest = issues.reduce((current, issue) => {
    return severityRank[issue.severity] > severityRank[current] ? issue.severity : current
  }, INTEGRITY_SEVERITIES.info)

  return {
    ok: !issues.some((issue) => ['error', 'critical'].includes(issue.severity)),
    status: issues.length ? (highest === 'critical' || highest === 'error' ? 'invalid' : 'warning') : 'valid',
    issueCount: issues.length,
    criticalCount: issues.filter((issue) => issue.severity === INTEGRITY_SEVERITIES.critical).length,
    highestSeverity: issues.length ? highest : INTEGRITY_SEVERITIES.info,
  }
}

export function validateAppRoleValue(role, entity = {}) {
  const normalized = normalizeCanonicalAppRole(role, '')
  if (isCanonicalAppRole(normalized)) return []
  return [
    createIntegrityIssue({
      code: INTEGRITY_ISSUES.invalidAppRole,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: entity.type || 'profile',
      entityId: entity.id,
      message: 'Profile has an invalid app role.',
      metadata: { role },
    }),
  ]
}

export function validateWorkspaceTypeValue(workspaceType, entity = {}) {
  const normalized = normalizeWorkspaceType(workspaceType, '')
  if (WORKSPACE_TYPE_VALUES.includes(normalized)) return []
  return [
    createIntegrityIssue({
      code: INTEGRITY_ISSUES.invalidWorkspaceType,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: entity.type || 'workspace',
      entityId: entity.id,
      message: 'Workspace has an invalid workspace type.',
      metadata: { workspaceType },
    }),
  ]
}

export function validateMembershipRecord(membership = {}, { profile = null, workspace = null } = {}) {
  const issues = []
  const appRole = normalizeCanonicalAppRole(membership.app_role || membership.appRole || profile?.role, '')
  const workspaceType = normalizeWorkspaceType(
    membership.workspace_type || membership.workspaceType || workspace?.type,
    inferWorkspaceTypeFromAppRole(appRole),
  )
  const status = normalizeMembershipStatus(membership.status)
  const orgRole = normalizeOrgRole(membership.role || membership.organisation_role || membership.organisationRole, { appRole, workspaceType })

  if (!membership.user_id && !membership.userId) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.profileMissing,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'membership',
      entityId: membership.id,
      message: 'Membership is not linked to a user.',
    }))
  }

  if (!membership.organisation_id && !membership.workspaceId && !membership.firm_id) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.workspaceMissing,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'membership',
      entityId: membership.id,
      message: 'Membership is not linked to a workspace.',
    }))
  }

  if (!Object.values(MEMBERSHIP_STATUSES).includes(status)) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.invalidMembershipStatus,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'membership',
      entityId: membership.id,
      message: 'Membership status is invalid.',
      metadata: { status: membership.status },
    }))
  }

  if (!ORG_ROLE_VALUES.includes(orgRole)) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.invalidOrganisationRole,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'membership',
      entityId: membership.id,
      message: 'Membership organisation role is invalid.',
      metadata: { role: membership.role || membership.organisation_role },
    }))
  }

  if (workspace?.type && workspaceType && normalizeWorkspaceType(workspace.type) !== workspaceType) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.invalidWorkspaceType,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'membership',
      entityId: membership.id,
      message: 'Membership workspace type does not match its workspace.',
      metadata: { membershipWorkspaceType: workspaceType, workspaceType: workspace.type },
    }))
  }

  return issues
}

export function requiresDefaultBranch(workspaceType) {
  return normalizeWorkspaceType(workspaceType) === WORKSPACE_TYPES.agency
}

export function hasAuthorityMembership(memberships = []) {
  return memberships.some((membership) => {
    const status = normalizeMembershipStatus(membership.status)
    return status === MEMBERSHIP_STATUSES.active && isWorkspaceAuthorityRole(membership.role || membership.organisation_role)
  })
}

export function isPlatformAdminProfile(profile = null) {
  return normalizeCanonicalAppRole(profile?.role, '') === APP_ROLES.platformAdmin
}
