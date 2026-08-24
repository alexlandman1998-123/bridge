const ORGANISATION_WIDE_ROLES = new Set([
  'owner',
  'principal',
  'director',
  'partner',
  'admin',
  'agency_admin',
  'hq_manager',
])

const BRANCH_SCOPED_ROLES = new Set([
  'branch_manager',
  'branch_admin',
])

const BRANCH_SCOPE_MARKERS = new Set([
  'branch',
  'branch_only',
  'assigned_branch',
  'assignedbranch',
])

const ORGANISATION_SCOPE_MARKERS = new Set([
  'organisation',
  'organization',
  'all',
  'all_workspace',
  'all_branches',
  'allbranches',
  'workspace_hq',
  'hq',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function firstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

export function resolveRentalWorkspaceScope(workspaceContext = {}) {
  const membership = workspaceContext.currentMembership || {}
  const raw = membership.raw || {}
  const role = normalizeKey(
    workspaceContext.workspaceRole ||
      membership.workspaceRole ||
      membership.workspace_role ||
      membership.organisationRole ||
      membership.organisation_role ||
      membership.role ||
      raw.workspace_role ||
      raw.organisation_role ||
      raw.role,
  )
  const scope = normalizeKey(
    membership.scopeLevel ||
      membership.scope_level ||
      membership.scope ||
      raw.scope_level ||
      raw.scope,
  )
  const branchScope = normalizeKey(
    membership.branchScope ||
      membership.branch_scope ||
      raw.branch_scope,
  )
  const organisationId = firstText(
    workspaceContext.currentWorkspace?.id,
    workspaceContext.workspace?.id,
    membership.organisationId,
    membership.organisation_id,
    membership.organizationId,
    membership.organization_id,
    membership.workspaceId,
    membership.workspace_id,
    raw.organisation_id,
    raw.organization_id,
  )
  const assignedAgentId = firstText(
    workspaceContext.profile?.id,
    membership.userId,
    membership.user_id,
    raw.user_id,
  )
  const branchId = firstText(
    membership.branchId,
    membership.branch_id,
    membership.primaryBranchId,
    membership.primary_branch_id,
    membership.organisationBranchId,
    membership.organisation_branch_id,
    raw.branch_id,
    raw.primary_branch_id,
    raw.organisation_branch_id,
  )
  const departmentId = firstText(
    membership.departmentId,
    membership.department_id,
    raw.department_id,
  )
  const teamId = firstText(
    membership.teamId,
    membership.team_id,
    raw.team_id,
  )
  const workspaceUnitId = firstText(
    membership.workspaceUnitId,
    membership.workspace_unit_id,
    raw.workspace_unit_id,
  )

  const organisationWide = ORGANISATION_WIDE_ROLES.has(role) ||
    ORGANISATION_SCOPE_MARKERS.has(scope) ||
    ORGANISATION_SCOPE_MARKERS.has(branchScope)
  const branchScoped = !organisationWide && Boolean(branchId) && (
    BRANCH_SCOPED_ROLES.has(role) ||
    role === 'manager' ||
    BRANCH_SCOPE_MARKERS.has(scope) ||
    BRANCH_SCOPE_MARKERS.has(branchScope)
  )
  const departmentScoped = !organisationWide && !branchScoped && Boolean(departmentId || teamId || workspaceUnitId)

  return {
    organisationId,
    assignedAgentId,
    branchId,
    departmentId,
    teamId,
    workspaceUnitId,
    includeAllOrganisationListings: Boolean(organisationWide || branchScoped),
    listingBranchId: branchScoped ? branchId : '',
    scopeLevel: organisationWide ? 'organisation' : branchScoped ? 'branch' : departmentScoped ? 'department' : 'assigned',
  }
}

export function buildRentalListingQueryOptions(scope = {}) {
  return {
    organisationId: scope.organisationId || '',
    branchId: scope.listingBranchId || '',
    includeAllOrganisationListings: scope.includeAllOrganisationListings === true,
  }
}
