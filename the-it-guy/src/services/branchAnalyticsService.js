import { getBranch, getBranches } from './agencyBranchService'

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

export async function getAgentLeaderboard(branchId = '') {
  const branch = branchId ? await getBranch(branchId) : null
  const members = branch ? branch.members || [] : []

  if (!members.length) {
    return []
  }

  return members
    .filter((member) => String(member?.role || '').toLowerCase() === 'agent')
    .map((member) => ({
      id: member.id,
      name: [member?.first_name, member?.last_name].filter(Boolean).join(' ') || member.email || 'Agent',
      email: member.email || '',
      role: member.role || 'agent',
      listings: 0,
      transactions: 0,
      revenue: 0,
      status: member.status || 'active',
      lastActive: member.last_active_at || member.updated_at || member.created_at || null,
    }))
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
