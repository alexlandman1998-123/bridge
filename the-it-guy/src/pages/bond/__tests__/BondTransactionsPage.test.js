/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const NOW = Date.parse('2026-06-04T12:00:00.000Z')

try {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const page = await server.ssrLoadModule('/src/pages/bond/BondTransactionsPage.jsx')
    const {
      buildHqApplicationRegisterRows,
      filterHqApplicationRegisterRows,
      getHqApplicationFilterOptions,
      getHqApplicationKpis,
      isHqApplicationsScope,
    } = page

    assert.equal(isHqApplicationsScope({ reportingScope: { dashboardMode: 'owner_director' } }, {}), true)
    assert.equal(isHqApplicationsScope({}, { currentMembership: { scope_level: 'workspace_hq' } }), true)
    assert.equal(isHqApplicationsScope({}, { currentMembership: { workspace_role: 'consultant', scope_level: 'assigned' } }), false)

    const rows = buildHqApplicationRegisterRows([
      {
        key: 'tx-ready',
        transactionId: 'tx-ready',
        transactionReference: 'APP-003',
        client: 'New Buyer',
        property: '1 National Road',
        createdAt: '2026-06-04T08:00:00.000Z',
        regionName: 'Western Cape',
        regionId: 'region-western-cape',
        branchName: 'Cape Town',
        branchId: 'branch-cape-town',
        consultantName: 'Mira Manager',
        assignedUserId: 'user-mira',
        financeStageKey: 'ready_for_review',
        riskLevel: 'low',
      },
      {
        key: 'tx-unassigned',
        transactionId: 'tx-unassigned',
        transactionReference: 'APP-001',
        client: 'Unassigned Buyer',
        property: '2 Pending Street',
        createdAt: '2026-04-01T08:00:00.000Z',
        regionName: '',
        branchName: '',
        consultantName: 'Consultant',
        financeStageKey: 'awaiting_otp',
        nextAction: 'No next action set',
        riskScore: 88,
      },
      {
        key: 'tx-feedback',
        transactionId: 'tx-feedback',
        transactionReference: 'APP-002',
        client: 'Feedback Buyer',
        property: '3 Lender Lane',
        createdAt: '2026-06-01T08:00:00.000Z',
        regionName: 'Gauteng',
        regionId: 'region-gauteng',
        branchName: 'Sandton',
        branchId: 'branch-sandton',
        consultantName: 'Tumi Consultant',
        assignedUserEmail: 'tumi@example.test',
        financeStageKey: 'bank_feedback',
        riskLevel: 'medium',
      },
    ], NOW)

    assert.equal(rows.find((row) => row.key === 'tx-unassigned').branchDisplay, 'Unassigned branch')
    assert.equal(rows.find((row) => row.key === 'tx-unassigned').consultantDisplay, 'Unassigned consultant')
    assert.equal(rows.find((row) => row.key === 'tx-unassigned').regionDisplay, 'No region')
    assert.equal(rows.find((row) => row.key === 'tx-unassigned').nextActionLabel, 'Assign branch')

    assert.deepEqual(filterHqApplicationRegisterRows(rows).map((row) => row.key), ['tx-ready', 'tx-feedback', 'tx-unassigned'])
    assert.deepEqual(filterHqApplicationRegisterRows(rows, { tab: 'unassigned' }).map((row) => row.key), ['tx-unassigned'])
    assert.deepEqual(filterHqApplicationRegisterRows(rows, { branch: 'Sandton' }).map((row) => row.key), ['tx-feedback'])
    assert.deepEqual(filterHqApplicationRegisterRows(rows, { risk: 'high' }).map((row) => row.key), ['tx-unassigned'])
    assert.deepEqual(filterHqApplicationRegisterRows(rows, { dateRange: '7d' }, NOW).map((row) => row.key), ['tx-ready', 'tx-feedback'])

    const options = getHqApplicationFilterOptions(rows)
    assert.equal(options.regions.some((option) => option.label === 'Western Cape'), true)
    assert.equal(options.branches.some((option) => option.label === 'Unassigned branch'), true)
    assert.equal(options.consultants.some((option) => option.label === 'Tumi Consultant'), true)

    const kpis = Object.fromEntries(getHqApplicationKpis(rows, NOW).map((item) => [item.key, item.value]))
    assert.equal(kpis.total, 3)
    assert.equal(kpis.new_this_week, 2)
    assert.equal(kpis.unassigned, 1)
    assert.equal(kpis.ready_for_review, 1)
    assert.equal(kpis.awaiting_otp, 1)
    assert.equal(kpis.sla_breaches, 1)

    console.log('BondTransactionsPage tests passed')
  } finally {
    await server.close()
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
