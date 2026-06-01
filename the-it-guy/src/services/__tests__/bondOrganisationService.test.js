/* global process */
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const service = await server.ssrLoadModule('/src/services/bondOrganisationService.js')

  assert.equal(service.getBondOrganisationRouteForTab('regions'), '/bond/organisation?view=regions')
  assert.equal(
    service.getBondOrganisationRouteForTab('branches', { branchId: 'branch-hq-1' }),
    '/bond/organisation?view=branches&branchId=branch-hq-1',
  )

  const scope = {
    regions: [
      { id: 'region-central', name: 'Gauteng Central', manager_user_id: 'user-hq' },
    ],
    branches: [
      { id: 'branch-hq', name: 'Sandton HQ', region_id: 'region-central', region: 'Gauteng Central', manager_user_id: 'user-hq' },
      { id: 'branch-waterfall', name: 'Waterfall Desk', region_id: 'region-central', region: 'Gauteng Central', manager_user_id: 'user-branch' },
    ],
    consultants: [
      { id: 'consultant-1', user_id: 'consultant-1', name: 'Lerato', email: 'lerato@example.com', workspaceUnitId: 'branch-hq', regionId: 'region-central' },
      { id: 'consultant-2', user_id: 'consultant-2', name: 'Aisha', email: 'aisha@example.com', workspaceUnitId: 'branch-waterfall', regionId: 'region-central' },
      { id: 'user-hq', user_id: 'user-hq', name: 'Maya Pillay', email: 'maya@example.com', workspaceUnitId: 'branch-hq', regionId: 'region-central' },
    ],
    applications: [
      {
        key: 'app-1',
        regionId: 'region-central',
        branchId: 'branch-hq',
        consultant: 'Lerato',
        assignedUserId: 'consultant-1',
        financeStageLabel: 'Bank Feedback',
        status: 'active',
        lastActivityAt: new Date().toISOString(),
        lastActivityLabel: 'Today',
        createdAt: new Date().toISOString(),
      },
      {
        key: 'app-2',
        regionId: 'region-central',
        branchId: 'branch-waterfall',
        consultant: 'Aisha',
        assignedUserId: 'consultant-2',
        financeStageLabel: 'Approved',
        status: 'approved',
        lastActivityAt: new Date().toISOString(),
        lastActivityLabel: 'Today',
        createdAt: new Date().toISOString(),
      },
    ],
  }

  const branchPerformance = service.getBranchPerformance(scope)
  const regionPerformance = service.getRegionPerformance(scope, branchPerformance)
  assert.equal(regionPerformance.length, 1)
  assert.equal(regionPerformance[0].region, 'Gauteng Central')
  assert.equal(regionPerformance[0].branches, 2)
  assert.equal(regionPerformance[0].consultants, 3)
  assert.equal(regionPerformance[0].activeApplications, 2)

  console.log('bondOrganisationService tests passed')
} finally {
  await server.close()
}
