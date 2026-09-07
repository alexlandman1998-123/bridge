import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const server = await createServer({ root: PROJECT_ROOT, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const { __agencyBranchServiceTestUtils } = await server.ssrLoadModule('/src/services/agencyBranchService.js')
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

  console.log('agency branch metrics: passed')
} finally {
  await server.close()
}
