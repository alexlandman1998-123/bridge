import { resolveWorkspaceRole } from '../services/roleResolutionService'

const AGENT_ROLES = new Set(['agent', 'sales_agent'])
const LEADERSHIP_OPERATIONAL_ROLES = new Set([
  'principal',
  'owner',
  'director',
  'partner',
  'branch_manager',
  'manager',
  'sales_manager',
  'development_manager',
])

function normalizeText(value) {
  return String(value || '').trim()
}

export function normalizeReportingRole(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

export function getReportingRole(row = {}) {
  return normalizeReportingRole(resolveWorkspaceRole(row))
}

export function isAgentProductionRole(role = '') {
  return AGENT_ROLES.has(normalizeReportingRole(role))
}

export function isLeadershipProductionRole(role = '') {
  return LEADERSHIP_OPERATIONAL_ROLES.has(normalizeReportingRole(role))
}

export function isActiveReportingUser(row = {}) {
  const status = normalizeReportingRole(row.status)
  return !status || status === 'active'
}

export function getReportingRoleLabel(role = '') {
  const normalized = normalizeReportingRole(role)
  const labels = {
    agent: 'Agent',
    sales_agent: 'Agent',
    principal: 'Principal',
    owner: 'Owner',
    director: 'Director',
    partner: 'Partner',
    branch_manager: 'Branch Manager',
    manager: 'Manager',
    sales_manager: 'Sales Manager',
    development_manager: 'Development Manager',
    assistant: 'Assistant',
    transaction_coordinator: 'Transaction Coordinator',
    listing_coordinator: 'Listing Coordinator',
    admin_coordinator: 'Admin Coordinator',
    admin_staff: 'Admin Staff',
    viewer: 'Viewer',
  }
  return labels[normalized] || (normalized ? normalized.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unassigned')
}

export function shouldIncludeInAgentLeaderboard(user = {}, { includeLeadership = false } = {}) {
  const role = getReportingRole(user)
  if (isAgentProductionRole(role)) return true
  return Boolean(includeLeadership && isLeadershipProductionRole(role))
}

export function buildRoleHeadcount(users = []) {
  return (users || []).reduce((summary, row) => {
    if (!isActiveReportingUser(row)) return summary
    const role = getReportingRole(row)
    if (isAgentProductionRole(role)) summary.activeAgents += 1
    else if (role === 'principal') summary.activePrincipals += 1
    else if (isLeadershipProductionRole(role)) summary.activeManagers += 1
    else summary.activeSupportUsers += 1
    summary.activeOperationalUsers += 1
    return summary
  }, {
    activeAgents: 0,
    activePrincipals: 0,
    activeManagers: 0,
    activeSupportUsers: 0,
    activeOperationalUsers: 0,
  })
}

export function getOperationalOwnerKeys(row = {}) {
  return [
    row.assigned_user_id,
    row.assignedUserId,
    row.assigned_agent_id,
    row.assignedAgentId,
    row.agent_id,
    row.agentId,
    row.created_by,
    row.createdBy,
    row.owner_user_id,
    row.ownerUserId,
    row.user_id,
    row.userId,
    row.assigned_agent_email,
    row.assignedAgentEmail,
    row.agent_email,
    row.agentEmail,
    row.created_by_email,
    row.createdByEmail,
    row.email,
  ].map((value) => normalizeText(value).toLowerCase()).filter(Boolean)
}
