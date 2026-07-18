import { ACCESS_SCOPES, PERMISSIONS, permissionsByWorkspaceRole } from '../auth/permissions/permissionRegistry'
import { normalizeOrgRole } from '../constants/orgRoles'
import { WORKSPACE_TYPES, normalizeWorkspaceType } from '../constants/workspaceTypes'

const ROLE_OPTION_SETS = Object.freeze({
  [WORKSPACE_TYPES.agency]: Object.freeze([
    ['owner', 'Organisation Owner'],
    ['principal', 'Principal'],
    ['branch_manager', 'Branch Manager'],
    ['manager', 'Manager'],
    ['team_lead', 'Team Lead'],
    ['agent', 'Agent'],
    ['assistant', 'Assistant'],
    ['transaction_coordinator', 'Transaction Coordinator'],
    ['listing_coordinator', 'Listing Coordinator'],
    ['admin_coordinator', 'Admin Coordinator'],
    ['admin_staff', 'Admin Staff'],
    ['viewer', 'Viewer'],
  ]),
  [WORKSPACE_TYPES.developerCompany]: Object.freeze([
    ['owner', 'Organisation Owner'],
    ['director', 'Director'],
    ['sales_manager', 'Sales Manager'],
    ['development_manager', 'Development Manager'],
    ['sales_agent', 'Sales Agent'],
    ['admin_staff', 'Admin Staff'],
    ['viewer', 'Viewer'],
  ]),
  [WORKSPACE_TYPES.attorneyFirm]: Object.freeze([
    ['owner', 'Firm Owner'],
    ['partner', 'Partner'],
    ['director', 'Director'],
    ['branch_manager', 'Branch Manager'],
    ['attorney', 'Attorney'],
    ['conveyancer', 'Conveyancer'],
    ['paralegal', 'Paralegal'],
    ['admin_staff', 'Admin Staff'],
    ['viewer', 'Viewer'],
  ]),
  [WORKSPACE_TYPES.bondOriginator]: Object.freeze([
    ['owner', 'Organisation Owner'],
    ['director', 'Director'],
    ['hq_manager', 'HQ Manager'],
    ['regional_manager', 'Regional Manager'],
    ['branch_manager', 'Branch Manager'],
    ['team_lead', 'Team Lead'],
    ['consultant', 'Consultant'],
    ['processor', 'Processor'],
    ['compliance', 'Compliance'],
    ['admin_staff', 'Admin Staff'],
    ['viewer', 'Viewer'],
  ]),
})

const SCOPE_LABELS = Object.freeze({
  [ACCESS_SCOPES.allWorkspace]: 'All organisation data',
  [ACCESS_SCOPES.workspaceHq]: 'HQ data',
  [ACCESS_SCOPES.regionOnly]: 'Region data',
  [ACCESS_SCOPES.branchOnly]: 'Branch data',
  [ACCESS_SCOPES.departmentOnly]: 'Department data',
  [ACCESS_SCOPES.teamOnly]: 'Team data',
  [ACCESS_SCOPES.assignedOnly]: 'Assigned records',
  [ACCESS_SCOPES.clientLinkOnly]: 'Linked client records',
  [ACCESS_SCOPES.none]: 'No access',
})

const CAPABILITY_LABELS = Object.freeze([
  [PERMISSIONS.manageWorkspaceSettings, 'Manage workspace settings'],
  [PERMISSIONS.manageUsers, 'Manage users'],
  [PERMISSIONS.manageBilling, 'Manage billing'],
  [PERMISSIONS.manageBranches, 'Manage branches'],
  [PERMISSIONS.manageDevelopmentTeam, 'Manage development team'],
  [PERMISSIONS.manageAttorneyTeam, 'Manage legal team'],
  [PERMISSIONS.manageBondTeam, 'Manage bond team'],
  [PERMISSIONS.assignLeads, 'Assign leads'],
  [PERMISSIONS.publishListings, 'Publish listings'],
  [PERMISSIONS.advanceTransactionStage, 'Advance transactions'],
  [PERMISSIONS.manageTransferWorkflow, 'Manage transfer workflow'],
  [PERMISSIONS.submitToBanks, 'Submit applications to banks'],
  [PERMISSIONS.viewReports, 'View reports'],
  [PERMISSIONS.exportReports, 'Export reports'],
])

const ROLE_AUTHORITY_LEVELS = Object.freeze({
  owner: 500,
  super_admin: 500,
  principal: 400,
  director: 400,
  partner: 400,
  admin: 400,
  hq_manager: 400,
  regional_manager: 350,
  branch_manager: 300,
  manager: 200,
  team_lead: 200,
  sales_manager: 200,
  development_manager: 200,
  senior_agent: 100,
  sales_agent: 100,
  agent: 100,
  attorney: 100,
  conveyancer: 100,
  bond_originator: 100,
  consultant: 100,
  processor: 100,
  compliance: 100,
  assistant: 50,
  transaction_coordinator: 50,
  listing_coordinator: 50,
  admin_coordinator: 50,
  admin_staff: 50,
  paralegal: 50,
  viewer: 0,
})

function resolveWorkspaceType(workspaceType = '') {
  return normalizeWorkspaceType(workspaceType, WORKSPACE_TYPES.agency)
}

export function getOrganisationRoleOptions(workspaceType = '') {
  const resolvedType = resolveWorkspaceType(workspaceType)
  return (ROLE_OPTION_SETS[resolvedType] || ROLE_OPTION_SETS[WORKSPACE_TYPES.agency])
    .map(([value, label]) => ({ value, label }))
}

export function getOrganisationRoleLabel(role = '', workspaceType = '') {
  const normalizedRole = normalizeOrgRole(role, { workspaceType: resolveWorkspaceType(workspaceType) })
  return getOrganisationRoleOptions(workspaceType).find((option) => option.value === normalizedRole)?.label ||
    String(role || 'Viewer').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function getOrganisationRolePermissionSummary(role = '', workspaceType = '') {
  const resolvedType = resolveWorkspaceType(workspaceType)
  const normalizedRole = normalizeOrgRole(role, { workspaceType: resolvedType })
  const grants = permissionsByWorkspaceRole[resolvedType]?.[normalizedRole] || Object.freeze({})
  const permissionEntries = Object.entries(grants).filter(([, scope]) => scope && scope !== ACCESS_SCOPES.none)
  const scopeLabels = [...new Set(permissionEntries.map(([, scope]) => SCOPE_LABELS[scope] || scope))]
  const capabilities = CAPABILITY_LABELS
    .filter(([permission]) => Boolean(grants[permission] && grants[permission] !== ACCESS_SCOPES.none))
    .map(([, label]) => label)

  return {
    role: normalizedRole,
    roleLabel: getOrganisationRoleLabel(normalizedRole, resolvedType),
    permissionCount: permissionEntries.length,
    scopeLabels,
    capabilities,
  }
}

export function getOrganisationRoleAuthorityLevel(role = '') {
  return ROLE_AUTHORITY_LEVELS[String(role || '').trim().toLowerCase()] ?? 0
}

export function canGovernOrganisationRoleChange({ actor = {}, target = {}, nextRole = '' } = {}) {
  const actorId = String(actor.userId || actor.user_id || actor.id || '').trim()
  const targetId = String(target.userId || target.user_id || target.id || '').trim()
  const actorEmail = String(actor.email || '').trim().toLowerCase()
  const targetEmail = String(target.email || '').trim().toLowerCase()
  if ((actorId && targetId && actorId === targetId) || (actorEmail && targetEmail && actorEmail === targetEmail)) return false

  const actorLevel = getOrganisationRoleAuthorityLevel(actor.role || actor.membershipRole)
  const targetLevel = getOrganisationRoleAuthorityLevel(target.role || target.membershipRole)
  const nextLevel = getOrganisationRoleAuthorityLevel(nextRole)
  if (actorLevel < 400 || targetLevel >= actorLevel || nextLevel >= actorLevel) return false
  return !['owner', 'super_admin'].includes(String(nextRole || '').trim().toLowerCase())
}
