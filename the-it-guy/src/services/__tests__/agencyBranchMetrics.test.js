import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const server = await createServer({ root: PROJECT_ROOT, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const { __agencyBranchServiceTestUtils } = await server.ssrLoadModule('/src/services/agencyBranchService.js')
  const { buildBranchWorkspaceOverview } = await server.ssrLoadModule('/src/services/branchWorkspaceOverviewService.js')
  const { buildBranchWorkspacePerformance } = await server.ssrLoadModule('/src/services/branchWorkspacePerformanceService.js')
  const branch = __agencyBranchServiceTestUtils.buildBranchViewModel(
    { id: 'head-office', organisation_id: 'org-1', name: 'Head Office', agent_count: 2 },
    {
      members: [
        { id: 'principal-1', status: 'active', role: 'principal' },
        { id: 'principal-2', status: 'active', role: 'principal' },
        { id: 'agent-1', status: 'active', role: 'agent' },
        { id: 'former-agent', status: 'deactivated', role: 'agent' },
      ],
    },
  )

  assert.equal(branch.kpis.activeSalesAgents, 1)
  assert.equal(branch.kpis.activeAgents, 1)
  assert.equal(branch.kpis.activeOperationalTeam, 3)
  assert.equal(branch.kpis.activeMembers, 3)
  assert.equal(branch.kpis.declaredAgentCapacity, 2)

  const overview = __agencyBranchServiceTestUtils.buildAgencyBranchOverview([branch])
  assert.equal(overview.totals.salesAgents, 1)
  assert.equal(overview.totals.operationalTeam, 3)
  assert.equal(overview.branches[0].activeSalesAgents, 1)
  assert.equal(overview.branches[0].activeOperationalTeam, 3)

  const now = new Date('2026-09-15T12:00:00Z')
  const workspaceBranch = {
    members: [{ id: 'agent-1', role: 'agent', status: 'active', created_at: '2026-09-02' }],
    listings: [{ id: 'listing-1', title: '12 Main Road', listing_status: 'active', mandate_status: 'signed', assigned_agent_id: 'agent-1', created_at: '2026-09-03' }],
    leads: [{ lead_id: 'lead-1', stage: 'qualified', assigned_agent_id: 'agent-1', created_at: '2026-09-04' }],
    transactions: [{ id: 'transaction-1', lifecycle_state: 'offer', sales_price: 1000000, gross_commission_percentage: 5, compliance_status: 'not_started', documents_missing: true, missing_documents_count: 2, assigned_agent_id: 'agent-1', created_at: '2026-09-05' }],
  }
  const workspaceOverview = buildBranchWorkspaceOverview(workspaceBranch, { now })
  assert.equal(workspaceOverview.kpis.find((item) => item.key === 'pipeline').value, 1000000)
  assert.equal(workspaceOverview.kpis.find((item) => item.key === 'commission').value, 50000)
  assert.equal(workspaceOverview.staff[0].transactions, 1)

  const performance = buildBranchWorkspacePerformance(workspaceBranch, { now })
  assert.equal(performance.funnel.find((item) => item.key === 'qualified').count, 1)
  assert.equal(performance.compliance.mandate.complete, 1)
  assert.equal(performance.compliance.transaction.complete, 0)
  assert.equal(performance.compliance.exceptions.length, 2)

  console.log('agency branch metrics: passed')
} finally {
  await server.close()
}
