import { ORG_ROLES, normalizeOrgRole } from './orgRoles'
import { WORKSPACE_TYPES, normalizeWorkspaceType } from './workspaceTypes'

export const BRANCH_SCOPES = Object.freeze({
  own: 'own',
  assignedBranch: 'assigned_branch',
  allBranches: 'all_branches',
})

export const BRANCH_SCOPE_VALUES = Object.freeze(Object.values(BRANCH_SCOPES))

export const BOND_SCOPE_LEVELS = Object.freeze({
  workspaceHq: 'workspace_hq',
  region: 'region',
  branch: 'branch',
  team: 'team',
  assigned: 'assigned',
})

export const BOND_SCOPE_LEVEL_VALUES = Object.freeze(Object.values(BOND_SCOPE_LEVELS))

export const WORKSPACE_UNIT_TYPES = Object.freeze({
  branch: 'branch',
  team: 'team',
  processingHub: 'processing_hub',
  hqDepartment: 'hq_department',
  adminTeam: 'admin_team',
  complianceTeam: 'compliance_team',
})

const AUTHORITY_ROLES = new Set([
  ORG_ROLES.owner,
  ORG_ROLES.principal,
  ORG_ROLES.director,
  ORG_ROLES.partner,
  ORG_ROLES.hqManager,
  ORG_ROLES.regionalManager,
  ORG_ROLES.teamLead,
])

const BRANCH_AUTHORITY_ROLES = new Set([
  ORG_ROLES.branchManager,
  ORG_ROLES.manager,
  ORG_ROLES.adminStaff,
  ORG_ROLES.processor,
  ORG_ROLES.paralegal,
  ORG_ROLES.consultant,
])

const BOND_SCOPE_FALLBACK_BY_ROLE = Object.freeze({
  [ORG_ROLES.owner]: BOND_SCOPE_LEVELS.workspaceHq,
  [ORG_ROLES.director]: BOND_SCOPE_LEVELS.workspaceHq,
  [ORG_ROLES.hqManager]: BOND_SCOPE_LEVELS.workspaceHq,
  [ORG_ROLES.regionalManager]: BOND_SCOPE_LEVELS.region,
  [ORG_ROLES.branchManager]: BOND_SCOPE_LEVELS.branch,
  [ORG_ROLES.teamLead]: BOND_SCOPE_LEVELS.team,
  [ORG_ROLES.processor]: BOND_SCOPE_LEVELS.assigned,
  [ORG_ROLES.consultant]: BOND_SCOPE_LEVELS.assigned,
  [ORG_ROLES.adminStaff]: BOND_SCOPE_LEVELS.assigned,
  [ORG_ROLES.compliance]: BOND_SCOPE_LEVELS.workspaceHq,
})

export const LEGACY_SCOPE_TO_BOND_SCOPE = Object.freeze({
  all_branches: BOND_SCOPE_LEVELS.workspaceHq,
  allBranches: BOND_SCOPE_LEVELS.workspaceHq,
  branch_only: BOND_SCOPE_LEVELS.branch,
  branchOnly: BOND_SCOPE_LEVELS.branch,
  assigned_branch: BOND_SCOPE_LEVELS.branch,
  assignedBranch: BOND_SCOPE_LEVELS.branch,
  team_only: BOND_SCOPE_LEVELS.team,
  teamOnly: BOND_SCOPE_LEVELS.team,
  assigned_only: BOND_SCOPE_LEVELS.assigned,
  assignedOnly: BOND_SCOPE_LEVELS.assigned,
  own: BOND_SCOPE_LEVELS.assigned,
})

export const WORKSPACE_UNIT_LABELS = Object.freeze({
  [WORKSPACE_TYPES.agency]: Object.freeze({
    singular: 'Branch',
    plural: 'Branches',
    manager: 'Branch Manager',
    all: 'All branches',
    defaultName: 'Main Branch',
  }),
  [WORKSPACE_TYPES.attorneyFirm]: Object.freeze({
    singular: 'Office',
    plural: 'Offices',
    manager: 'Office Manager',
    all: 'All offices',
    defaultName: 'Head Office',
  }),
  [WORKSPACE_TYPES.bondOriginator]: Object.freeze({
    singular: 'Team',
    plural: 'Teams',
    manager: 'Team Manager',
    all: 'All teams',
    defaultName: 'Main Team',
  }),
  [WORKSPACE_TYPES.developerCompany]: Object.freeze({
    singular: 'Team',
    plural: 'Teams',
    manager: 'Team Manager',
    all: 'All teams',
    defaultName: 'Head Office',
  }),
})

function normalizeText(value) {
  return String(value || '').trim()
}

export function normalizeBranchScope(value, fallback = BRANCH_SCOPES.own) {
  const normalized = normalizeText(value).toLowerCase()
  return BRANCH_SCOPE_VALUES.includes(normalized) ? normalized : fallback
}

export function normalizeScopeLevel(value, fallback = BOND_SCOPE_LEVELS.assigned) {
  const normalized = normalizeText(value).toLowerCase()
  return BOND_SCOPE_LEVEL_VALUES.includes(normalized) ? normalized : fallback
}

export function mapLegacyScopeToBondScope(value) {
  const normalized = normalizeText(value)
  return LEGACY_SCOPE_TO_BOND_SCOPE[normalized] || LEGACY_SCOPE_TO_BOND_SCOPE[normalized.toLowerCase()] || null
}

export function getDefaultBondScope(role, { appRole = '', workspaceType = '' } = {}) {
  const normalizedRole = normalizeOrgRole(role, { appRole, workspaceType })
  return BOND_SCOPE_FALLBACK_BY_ROLE[normalizedRole] || BOND_SCOPE_LEVELS.assigned
}

export function getWorkspaceUnitLabels(workspaceType = '') {
  const normalized = normalizeWorkspaceType(workspaceType)
  return WORKSPACE_UNIT_LABELS[normalized] || WORKSPACE_UNIT_LABELS[WORKSPACE_TYPES.agency]
}

export function getDefaultBranchScope(role, { appRole = '', workspaceType = '' } = {}) {
  const normalizedRole = normalizeOrgRole(role, { appRole, workspaceType })
  if (AUTHORITY_ROLES.has(normalizedRole)) return BRANCH_SCOPES.allBranches
  if (BRANCH_AUTHORITY_ROLES.has(normalizedRole)) return BRANCH_SCOPES.assignedBranch
  return BRANCH_SCOPES.own
}

export function canUseAllBranches(role, context = {}) {
  return getDefaultBranchScope(role, context) === BRANCH_SCOPES.allBranches
}

export function canAccessWorkspaceRecord({
  branchScope = '',
  assignedBranchId = '',
  userId = '',
  recordBranchId = '',
  assignedUserId = '',
  ownerUserId = '',
} = {}) {
  const scope = normalizeBranchScope(branchScope)
  if (scope === BRANCH_SCOPES.allBranches) return true

  const user = normalizeText(userId)
  const branch = normalizeText(assignedBranchId)
  const recordBranch = normalizeText(recordBranchId)
  const assignee = normalizeText(assignedUserId)
  const owner = normalizeText(ownerUserId)

  if (scope === BRANCH_SCOPES.assignedBranch) {
    if (branch && recordBranch && branch === recordBranch) return true
    return Boolean(user && (assignee === user || owner === user))
  }

  return Boolean(user && (assignee === user || owner === user))
}
