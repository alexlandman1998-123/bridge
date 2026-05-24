import { getBranch, getBranches } from './agencyBranchService'
import {
  getOperationalOwnerKeys,
  getReportingRole,
  getReportingRoleLabel,
  shouldIncludeInAgentLeaderboard,
} from '../lib/reportingRoleLogic'

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getBranchRevenue(branchId) {
  const branch = await getBranch(branchId)
  if (!branch) return 0
  return toNumber(branch.kpis?.pipelineValue) * 0.03
}

export async function getBranchPerformance(branchId) {
  const branch = await getBranch(branchId)
  if (!branch) return null

  return {
    activeAgents: toNumber(branch.kpis?.activeAgents),
    activeListings: toNumber(branch.kpis?.activeListings),
    activeTransactions: toNumber(branch.kpis?.activeTransactions),
    registeredDeals: toNumber(branch.kpis?.registeredDeals),
    pipelineValue: toNumber(branch.kpis?.pipelineValue),
    conversionRate: toNumber(branch.kpis?.conversionRate),
  }
}

export async function getBranchConversionRate(branchId) {
  const branch = await getBranch(branchId)
  return toNumber(branch?.kpis?.conversionRate)
}

function buildMemberKeys(member = {}) {
  return [
    member.user_id,
    member.id,
    member.email,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
}

function countOwnedRecords(records = [], member = {}) {
  const memberKeys = new Set(buildMemberKeys(member))
  if (!memberKeys.size) return 0
  return (records || []).filter((record) => getOperationalOwnerKeys(record).some((key) => memberKeys.has(key))).length
}

export async function getAgentLeaderboard(branchId = '', { includeLeadership = false } = {}) {
  const branch = branchId ? await getBranch(branchId) : null
  const members = branch ? branch.members || [] : []

  if (!members.length) {
    return []
  }

  return members
    .filter((member) => shouldIncludeInAgentLeaderboard(member, { includeLeadership }))
    .map((member) => ({
      id: member.id,
      name: [member?.first_name, member?.last_name].filter(Boolean).join(' ') || member.email || getReportingRoleLabel(getReportingRole(member)),
      email: member.email || '',
      role: member.role || 'agent',
      roleLabel: getReportingRoleLabel(getReportingRole(member)),
      listings: countOwnedRecords(branch.listings, member),
      leads: countOwnedRecords(branch.leads, member),
      transactions: countOwnedRecords(branch.transactions, member),
      revenue: branch.transactions
        .filter((record) => {
          const memberKeys = new Set(buildMemberKeys(member))
          return getOperationalOwnerKeys(record).some((key) => memberKeys.has(key))
        })
        .reduce((sum, row) => sum + toNumber(row.sales_price || row.purchase_price) * 0.03, 0),
      status: member.status || 'active',
      lastActive: member.last_active_at || member.updated_at || member.created_at || null,
    }))
    .filter((member) => member.roleLabel === 'Agent' || member.listings || member.leads || member.transactions)
    .sort((left, right) => right.revenue - left.revenue || right.transactions - left.transactions || right.listings - left.listings)
}

export async function getPortfolioLeaderboard() {
  const branches = await getBranches()
  return branches
    .map((branch) => ({
      branchId: branch.id,
      branchName: branch.name,
      pipelineValue: toNumber(branch.kpis?.pipelineValue),
      activeTransactions: toNumber(branch.kpis?.activeTransactions),
      conversionRate: toNumber(branch.kpis?.conversionRate),
    }))
    .sort((left, right) => right.pipelineValue - left.pipelineValue)
}
