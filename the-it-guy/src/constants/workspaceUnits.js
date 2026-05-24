import { ORG_ROLES, normalizeOrgRole } from './orgRoles'
import { WORKSPACE_TYPES, normalizeWorkspaceType } from './workspaceTypes'

export const BRANCH_SCOPES = Object.freeze({
  own: 'own',
  assignedBranch: 'assigned_branch',
  allBranches: 'all_branches',
})

export const BRANCH_SCOPE_VALUES = Object.freeze(Object.values(BRANCH_SCOPES))

const AUTHORITY_ROLES = new Set([
  ORG_ROLES.owner,
  ORG_ROLES.principal,
  ORG_ROLES.director,
  ORG_ROLES.partner,
])

const BRANCH_AUTHORITY_ROLES = new Set([
  ORG_ROLES.branchManager,
  ORG_ROLES.manager,
  ORG_ROLES.adminStaff,
  ORG_ROLES.processor,
  ORG_ROLES.paralegal,
])

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
