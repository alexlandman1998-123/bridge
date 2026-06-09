import { ORG_ROLES, normalizeOrgRole } from '../constants/orgRoles'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import { recordSecurityAuditEvent } from './auditLogService'

export const AGENCY_AUTHORITY_LEVELS = Object.freeze({
  owner: 500,
  principal: 400,
  branch_manager: 300,
  team_lead: 200,
  agent: 100,
  assistant: 50,
  viewer: 0,
})

export const AGENCY_AUTHORITY_ACTIONS = Object.freeze({
  deleteOrganisation: 'delete_organisation',
  transferOwnership: 'transfer_ownership',
  manageBilling: 'manage_billing',
  invitePrincipal: 'invite_principal',
  removePrincipal: 'remove_principal',
  inviteAgent: 'invite_agent',
  removeAgent: 'remove_agent',
  deactivateAgent: 'deactivate_agent',
  transferAgent: 'transfer_agent',
  promoteUser: 'promote_user',
  demoteUser: 'demote_user',
  manageBranches: 'manage_branches',
  manageBranchAgents: 'manage_branch_agents',
  assignBranch: 'assign_branch',
  reassignAssets: 'reassign_assets',
  assignListing: 'assign_listing',
  transferListing: 'transfer_listing',
  assignLead: 'assign_lead',
  transferTransaction: 'transfer_transaction',
  viewAgencyReports: 'view_agency_reports',
  viewBranchReports: 'view_branch_reports',
  viewAgentReports: 'view_agent_reports',
})

const OWNER_ROLES = new Set([ORG_ROLES.owner, 'super_admin'])
const PRINCIPAL_ROLES = new Set([ORG_ROLES.principal, 'admin'])
const BRANCH_MANAGER_ROLES = new Set([ORG_ROLES.branchManager, 'branch_admin'])
const TEAM_LEAD_ROLES = new Set([ORG_ROLES.teamLead, ORG_ROLES.manager])
const AGENT_ROLES = new Set([ORG_ROLES.agent, 'senior_agent'])
const SUPPORT_ROLES = new Set([
  ORG_ROLES.assistant,
  ORG_ROLES.transactionCoordinator,
  ORG_ROLES.listingCoordinator,
  ORG_ROLES.adminCoordinator,
  ORG_ROLES.adminStaff,
])

export const AGENCY_AUTHORITY_MATRIX = Object.freeze({
  [AGENCY_AUTHORITY_ACTIONS.deleteOrganisation]: Object.freeze({ owner: true, principal: false, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.transferOwnership]: Object.freeze({ owner: true, principal: false, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.manageBilling]: Object.freeze({ owner: true, principal: false, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.invitePrincipal]: Object.freeze({ owner: true, principal: false, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.removePrincipal]: Object.freeze({ owner: true, principal: false, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.inviteAgent]: Object.freeze({ owner: true, principal: true, branch_manager: true, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.removeAgent]: Object.freeze({ owner: true, principal: true, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.deactivateAgent]: Object.freeze({ owner: true, principal: true, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.transferAgent]: Object.freeze({ owner: true, principal: true, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.promoteUser]: Object.freeze({ owner: true, principal: true, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.demoteUser]: Object.freeze({ owner: true, principal: true, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.manageBranches]: Object.freeze({ owner: true, principal: true, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.manageBranchAgents]: Object.freeze({ owner: true, principal: true, branch_manager: true, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.assignBranch]: Object.freeze({ owner: true, principal: true, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.reassignAssets]: Object.freeze({ owner: true, principal: true, branch_manager: true, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.assignListing]: Object.freeze({ owner: true, principal: true, branch_manager: true, team_lead: true, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.transferListing]: Object.freeze({ owner: true, principal: true, branch_manager: true, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.assignLead]: Object.freeze({ owner: true, principal: true, branch_manager: true, team_lead: true, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.transferTransaction]: Object.freeze({ owner: true, principal: true, branch_manager: true, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.viewAgencyReports]: Object.freeze({ owner: true, principal: true, branch_manager: false, team_lead: false, agent: false }),
  [AGENCY_AUTHORITY_ACTIONS.viewBranchReports]: Object.freeze({ owner: true, principal: true, branch_manager: true, team_lead: false, agent: false, assistant: false }),
  [AGENCY_AUTHORITY_ACTIONS.viewAgentReports]: Object.freeze({ owner: true, principal: true, branch_manager: true, team_lead: true, agent: true, assistant: false }),
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function getUserId(user = {}) {
  return normalizeText(user.userId || user.user_id || user.id || user.profileId || user.profile_id)
}

function getUserEmail(user = {}) {
  return normalizeLower(user.email)
}

function sameUser(left = {}, right = {}) {
  const leftId = getUserId(left)
  const rightId = getUserId(right)
  if (leftId && rightId && leftId === rightId) return true
  const leftEmail = getUserEmail(left)
  const rightEmail = getUserEmail(right)
  return Boolean(leftEmail && rightEmail && leftEmail === rightEmail)
}

export function normalizeAgencyAuthorityRole(role = '') {
  const raw = normalizeLower(role)
  if (OWNER_ROLES.has(raw)) return 'owner'
  if (PRINCIPAL_ROLES.has(raw)) return 'principal'
  if (BRANCH_MANAGER_ROLES.has(raw)) return 'branch_manager'
  if (TEAM_LEAD_ROLES.has(raw)) return 'team_lead'
  if (AGENT_ROLES.has(raw)) return 'agent'
  if (SUPPORT_ROLES.has(raw)) return 'assistant'

  const normalized = normalizeOrgRole(raw, { workspaceType: WORKSPACE_TYPES.agency })
  if (OWNER_ROLES.has(normalized)) return 'owner'
  if (PRINCIPAL_ROLES.has(normalized)) return 'principal'
  if (BRANCH_MANAGER_ROLES.has(normalized)) return 'branch_manager'
  if (TEAM_LEAD_ROLES.has(normalized)) return 'team_lead'
  if (AGENT_ROLES.has(normalized)) return 'agent'
  if (SUPPORT_ROLES.has(normalized)) return 'assistant'
  return 'viewer'
}

export function getAgencyAuthorityLevel(role = '') {
  return AGENCY_AUTHORITY_LEVELS[normalizeAgencyAuthorityRole(role)] ?? AGENCY_AUTHORITY_LEVELS.viewer
}

export function getAgencyAuthorityLabel(role = '') {
  const normalized = normalizeAgencyAuthorityRole(role)
  if (normalized === 'owner') return 'Organisation Owner'
  if (normalized === 'principal') return 'Principal'
  if (normalized === 'branch_manager') return 'Branch Manager'
  if (normalized === 'team_lead') return 'Team Lead'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'assistant') return 'Assistant / Coordinator'
  return 'Viewer'
}

export function canPerformAgencyAuthorityAction(action, actor = {}, target = {}, options = {}) {
  const actorRole = normalizeAgencyAuthorityRole(actor.authorityRole || actor.role || actor.membershipRole || actor.organisationRole)
  const targetRole = normalizeAgencyAuthorityRole(target.authorityRole || target.role || target.membershipRole || target.organisationRole)
  const rule = AGENCY_AUTHORITY_MATRIX[action]
  if (!rule?.[actorRole]) return false

  if (sameUser(actor, target) && [
    AGENCY_AUTHORITY_ACTIONS.promoteUser,
    AGENCY_AUTHORITY_ACTIONS.demoteUser,
    AGENCY_AUTHORITY_ACTIONS.removeAgent,
    AGENCY_AUTHORITY_ACTIONS.deactivateAgent,
    AGENCY_AUTHORITY_ACTIONS.transferAgent,
    AGENCY_AUTHORITY_ACTIONS.transferOwnership,
  ].includes(action)) {
    return false
  }

  if (targetRole === 'owner' && actorRole !== 'owner') return false
  if (targetRole === 'principal' && actorRole !== 'owner' && [
    AGENCY_AUTHORITY_ACTIONS.removePrincipal,
    AGENCY_AUTHORITY_ACTIONS.deactivateAgent,
    AGENCY_AUTHORITY_ACTIONS.removeAgent,
    AGENCY_AUTHORITY_ACTIONS.transferAgent,
    AGENCY_AUTHORITY_ACTIONS.demoteUser,
  ].includes(action)) {
    return false
  }

  if (action === AGENCY_AUTHORITY_ACTIONS.promoteUser) {
    const nextRole = normalizeAgencyAuthorityRole(options.nextRole)
    if (nextRole === 'owner') return actorRole === 'owner'
    if (nextRole === 'principal') return actorRole === 'owner'
    return getAgencyAuthorityLevel(actorRole) > getAgencyAuthorityLevel(nextRole)
  }

  if (action === AGENCY_AUTHORITY_ACTIONS.demoteUser) {
    return getAgencyAuthorityLevel(actorRole) > getAgencyAuthorityLevel(targetRole)
  }

  if (actorRole === 'branch_manager') {
    const actorBranchId = normalizeText(actor.branchId || actor.branch_id || actor.primaryBranchId || actor.primary_branch_id)
    const targetBranchId = normalizeText(target.branchId || target.branch_id || target.primaryBranchId || target.primary_branch_id || options.branchId)
    if (!actorBranchId && [
      AGENCY_AUTHORITY_ACTIONS.inviteAgent,
      AGENCY_AUTHORITY_ACTIONS.manageBranchAgents,
      AGENCY_AUTHORITY_ACTIONS.reassignAssets,
      AGENCY_AUTHORITY_ACTIONS.assignListing,
      AGENCY_AUTHORITY_ACTIONS.transferListing,
      AGENCY_AUTHORITY_ACTIONS.assignLead,
      AGENCY_AUTHORITY_ACTIONS.transferTransaction,
      AGENCY_AUTHORITY_ACTIONS.viewBranchReports,
    ].includes(action)) return false
    if (targetBranchId && actorBranchId && targetBranchId !== actorBranchId) return false
    if ([AGENCY_AUTHORITY_ACTIONS.removeAgent, AGENCY_AUTHORITY_ACTIONS.deactivateAgent, AGENCY_AUTHORITY_ACTIONS.transferAgent].includes(action)) return false
  }

  return true
}

export function assertAgencyAuthority(action, actor = {}, target = {}, options = {}) {
  if (canPerformAgencyAuthorityAction(action, actor, target, options)) return true
  const error = new Error(options.message || 'You do not have authority to perform this agency governance action.')
  error.code = 'agency_authority_denied'
  error.action = action
  throw error
}

export function classifyRoleTransition(previousRole = '', nextRole = '') {
  const previousLevel = getAgencyAuthorityLevel(previousRole)
  const nextLevel = getAgencyAuthorityLevel(nextRole)
  if (nextLevel > previousLevel) return 'promotion'
  if (nextLevel < previousLevel) return 'demotion'
  return 'role_change'
}

export async function recordAgencyGovernanceAudit({
  actor = {},
  workspaceId = '',
  action = '',
  target = {},
  previousRole = '',
  nextRole = '',
  reason = '',
  metadata = {},
} = {}) {
  return recordSecurityAuditEvent({
    userId: getUserId(actor),
    workspaceId,
    action,
    targetType: 'organisation_user',
    targetId: target.id || target.organisationUserId || getUserId(target) || getUserEmail(target),
    metadata: {
      targetUserId: getUserId(target) || null,
      targetEmail: getUserEmail(target) || null,
      previousRole: normalizeText(previousRole) || null,
      nextRole: normalizeText(nextRole) || null,
      transitionType: previousRole || nextRole ? classifyRoleTransition(previousRole, nextRole) : null,
      reason: normalizeText(reason) || null,
      ...metadata,
    },
  })
}
