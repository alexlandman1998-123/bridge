import { getBranches } from './agencyBranchService'
import {
  AGENCY_AUTHORITY_ACTIONS,
  canPerformAgencyAuthorityAction,
  getAgencyAuthorityLabel,
  normalizeAgencyAuthorityRole,
} from './agencyAuthorityService'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function isActiveStatus(value) {
  const normalized = normalizeLower(value)
  return !['inactive', 'archived', 'withdrawn', 'cancelled', 'canceled', 'completed', 'sold'].includes(normalized)
}

function getBranchManager(branch = {}) {
  const members = Array.isArray(branch.members) ? branch.members : []
  return members.find((member) => normalizeAgencyAuthorityRole(member.role || member.workspace_role || member.organisation_role) === 'branch_manager') || null
}

function getAgentMembers(branch = {}) {
  const members = Array.isArray(branch.members) ? branch.members : []
  return members.filter((member) => {
    const role = normalizeAgencyAuthorityRole(member.role || member.workspace_role || member.organisation_role)
    return role === 'agent' || role === 'team_lead'
  })
}

export const BRANCH_OWNERSHIP_AWARENESS_MATRIX = Object.freeze([
  { object: 'Leads', branchField: 'branch_id', status: 'branch_aware' },
  { object: 'Listings', branchField: 'branch_id', status: 'branch_aware' },
  { object: 'Transactions', branchField: 'assigned_branch_id', status: 'branch_aware' },
  { object: 'Appointments', branchField: 'branch_id / assigned owner fallback', status: 'needs_rls_verification' },
  { object: 'Documents', branchField: 'parent asset branch', status: 'inherits_parent_visibility' },
])

export const BRANCH_MANAGER_GOVERNANCE_RULES = Object.freeze([
  { action: 'View branch agents', allowed: true },
  { action: 'Invite branch agents', allowed: true },
  { action: 'Reassign branch leads', allowed: true },
  { action: 'Reassign branch listings', allowed: true },
  { action: 'Reassign branch transactions', allowed: true },
  { action: 'Manage other branches', allowed: false },
  { action: 'Create principals', allowed: false },
  { action: 'Delete organisation', allowed: false },
  { action: 'Change billing', allowed: false },
])

export function calculateBranchHealth(branch = {}) {
  const kpis = branch.kpis || {}
  const activeAgents = toNumber(kpis.activeAgents)
  const activeListings = toNumber(kpis.activeListings)
  const activeTransactions = toNumber(kpis.activeTransactions)
  const pipelineValue = toNumber(kpis.pipelineValue)
  const conversionRate = toNumber(kpis.conversionRate)
  const hasManager = Boolean(getBranchManager(branch) || normalizeText(branch.principalName) !== 'Principal pending')
  const isActive = branch.isActive !== false

  const score = clampScore(
    (isActive ? 12 : 0) +
      (hasManager ? 12 : 0) +
      Math.min(activeAgents, 8) * 5 +
      Math.min(activeListings, 12) * 2 +
      Math.min(activeTransactions, 10) * 2.5 +
      Math.min(conversionRate, 35) * 0.45 +
      Math.min(pipelineValue / 1000000, 10) * 1.5,
  )

  let status = 'Critical'
  let tone = 'red'
  if (!isActive) {
    status = 'Inactive'
    tone = 'slate'
  } else if (score >= 88) {
    status = 'Excellent'
    tone = 'green'
  } else if (score >= 72) {
    status = 'Good'
    tone = 'blue'
  } else if (score >= 56) {
    status = 'Stable'
    tone = 'gold'
  } else if (score >= 36) {
    status = 'Needs Attention'
    tone = 'orange'
  }

  return {
    score,
    status,
    tone,
    breakdown: {
      isActive,
      hasManager,
      activeAgents,
      activeListings,
      activeTransactions,
      pipelineValue,
      conversionRate,
    },
  }
}

export function getBranchAttentionItems(branch = {}) {
  const health = calculateBranchHealth(branch)
  const kpis = branch.kpis || {}
  const items = []

  if (branch.isActive === false) {
    items.push({ severity: 'critical', label: 'Branch is inactive', action: 'Review branch status' })
  }
  if (!health.breakdown.hasManager) {
    items.push({ severity: 'critical', label: 'No branch manager assigned', action: 'Assign manager' })
  }
  if (toNumber(kpis.activeAgents) === 0) {
    items.push({ severity: 'critical', label: 'No active agents', action: 'Invite or assign agents' })
  }
  if (toNumber(kpis.activeListings) === 0) {
    items.push({ severity: 'warning', label: 'No active listings', action: 'Review listing pipeline' })
  }
  if (toNumber(kpis.activeTransactions) === 0) {
    items.push({ severity: 'warning', label: 'No active transactions', action: 'Review transactions' })
  }
  if (toNumber(kpis.conversionRate) < 10 && toNumber(kpis.activeTransactions) > 0) {
    items.push({ severity: 'warning', label: 'Low conversion rate', action: 'Review branch coaching' })
  }

  return items.slice(0, 5)
}

export function buildBranchTeamRows(branch = {}) {
  return getAgentMembers(branch).map((member) => {
    const userId = normalizeText(member.user_id || member.userId || member.id)
    const email = normalizeLower(member.email)
    const ownsRecord = (row = {}) => {
      const assignedUserId = normalizeText(row.assigned_user_id || row.assignedUserId || row.assigned_agent_id || row.assignedAgentId)
      const assignedEmail = normalizeLower(row.assigned_agent_email || row.assignedAgentEmail)
      return Boolean((userId && assignedUserId === userId) || (email && assignedEmail === email))
    }

    return {
      id: normalizeText(member.id || userId || email),
      userId,
      name: [member.first_name, member.last_name].map(normalizeText).filter(Boolean).join(' ') || member.email || 'Branch agent',
      email,
      role: getAgencyAuthorityLabel(member.role || member.workspace_role || member.organisation_role),
      status: member.status || 'active',
      lastActive: member.last_active_at || member.updated_at || member.accepted_at || member.created_at || null,
      leads: (branch.leads || []).filter(ownsRecord).length,
      listings: (branch.listings || []).filter(ownsRecord).length,
      transactions: (branch.transactions || []).filter(ownsRecord).length,
    }
  })
}

export function buildBranchCommandCentreModel(branches = [], actor = {}) {
  const normalizedBranches = (branches || []).map((branch) => ({
    ...branch,
    health: calculateBranchHealth(branch),
    attentionItems: getBranchAttentionItems(branch),
    teamRows: buildBranchTeamRows(branch),
  }))

  const activeBranches = normalizedBranches.filter((branch) => branch.isActive !== false)
  const totals = normalizedBranches.reduce((accumulator, branch) => {
    accumulator.agents += toNumber(branch.kpis?.activeAgents)
    accumulator.listings += toNumber(branch.kpis?.activeListings)
    accumulator.transactions += toNumber(branch.kpis?.activeTransactions)
    accumulator.pipelineValue += toNumber(branch.kpis?.pipelineValue)
    accumulator.leads += Array.isArray(branch.leads) ? branch.leads.filter((lead) => isActiveStatus(lead.status || lead.stage)).length : 0
    return accumulator
  }, { agents: 0, listings: 0, transactions: 0, pipelineValue: 0, leads: 0 })

  const averageHealth = normalizedBranches.length
    ? clampScore(normalizedBranches.reduce((sum, branch) => sum + branch.health.score, 0) / normalizedBranches.length)
    : 0

  const attentionBranches = normalizedBranches
    .filter((branch) => branch.attentionItems.length || branch.health.score < 56)
    .sort((left, right) => left.health.score - right.health.score)

  const topBranches = normalizedBranches
    .slice()
    .sort((left, right) => toNumber(right.kpis?.pipelineValue) - toNumber(left.kpis?.pipelineValue))

  const branchManagerCanReassign = canPerformAgencyAuthorityAction(
    AGENCY_AUTHORITY_ACTIONS.reassignAssets,
    actor,
    { branchId: actor.branchId || actor.primaryBranchId },
    { branchId: actor.branchId || actor.primaryBranchId },
  )

  return {
    branches: normalizedBranches,
    activeBranches,
    topBranches,
    attentionBranches,
    totals,
    averageHealth,
    permissions: {
      canInviteAgents: canPerformAgencyAuthorityAction(
        AGENCY_AUTHORITY_ACTIONS.inviteAgent,
        actor,
        { branchId: actor.branchId || actor.primaryBranchId },
        { branchId: actor.branchId || actor.primaryBranchId },
      ),
      canReassignAssets: branchManagerCanReassign,
      canViewBranchReports: canPerformAgencyAuthorityAction(
        AGENCY_AUTHORITY_ACTIONS.viewBranchReports,
        actor,
        { branchId: actor.branchId || actor.primaryBranchId },
        { branchId: actor.branchId || actor.primaryBranchId },
      ),
    },
  }
}

export async function getBranchCommandCentre(actor = {}) {
  const branches = await getBranches()
  return buildBranchCommandCentreModel(branches, actor)
}
