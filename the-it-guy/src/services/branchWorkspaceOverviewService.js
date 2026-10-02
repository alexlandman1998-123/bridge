import { buildBranchDashboard } from './branchDashboardModel'
import { getBranchDashboardData } from './branchDashboardDataService'

export function buildBranchWorkspaceOverview(branch, options) {
  return buildBranchDashboard(branch, options)
}
export async function getBranchWorkspaceOverview(branchId, options) {
  return buildBranchDashboard(await getBranchDashboardData(branchId), options)
}
