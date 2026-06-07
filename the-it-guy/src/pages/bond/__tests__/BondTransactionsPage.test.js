/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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
      HqApplicationsTable,
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
        bondAmount: 2400000,
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
        bondAmount: 1850000,
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
        bondAmount: 1500000,
      },
      {
        key: 'tx-instruction',
        transactionId: 'tx-instruction',
        transactionReference: 'APP-004',
        client: 'Instruction Buyer',
        property: '4 Attorney Avenue',
        createdAt: '2026-05-02T08:00:00.000Z',
        regionName: 'Gauteng',
        branchName: 'Sandton',
        consultantName: 'Tumi Consultant',
        assignedUserEmail: 'tumi@example.test',
        financeStageKey: 'bond_instruction_sent',
        riskLevel: 'low',
        bondAmount: 900000,
      },
    ], NOW)

    assert.equal(rows.find((row) => row.key === 'tx-unassigned').branchDisplay, 'Unassigned branch')
    assert.equal(rows.find((row) => row.key === 'tx-unassigned').consultantDisplay, 'Unassigned consultant')
    assert.equal(rows.find((row) => row.key === 'tx-unassigned').regionDisplay, 'No region')
    assert.equal(rows.find((row) => row.key === 'tx-unassigned').nextActionLabel, 'Assign branch')

    assert.deepEqual(filterHqApplicationRegisterRows(rows).map((row) => row.key), ['tx-ready', 'tx-feedback', 'tx-instruction', 'tx-unassigned'])
    assert.deepEqual(filterHqApplicationRegisterRows(rows, { tab: 'unassigned' }).map((row) => row.key), ['tx-unassigned'])
    assert.deepEqual(filterHqApplicationRegisterRows(rows, { branch: 'Sandton' }).map((row) => row.key), ['tx-feedback', 'tx-instruction'])
    assert.deepEqual(filterHqApplicationRegisterRows(rows, { risk: 'high' }).map((row) => row.key), ['tx-unassigned'])
    assert.deepEqual(filterHqApplicationRegisterRows(rows, { dateRange: '7d' }, NOW).map((row) => row.key), ['tx-ready', 'tx-feedback'])

    const options = getHqApplicationFilterOptions(rows)
    assert.equal(options.regions.some((option) => option.label === 'Western Cape'), true)
    assert.equal(options.branches.some((option) => option.label === 'Unassigned branch'), true)
    assert.equal(options.consultants.some((option) => option.label === 'Tumi Consultant'), true)

    const kpis = Object.fromEntries(getHqApplicationKpis(rows, NOW).map((item) => [item.key, item.value]))
    assert.equal(kpis.total, 4)
    assert.equal(kpis.pipeline_value, undefined)
    assert.equal(kpis.awaiting_feedback, 1)
    assert.equal(kpis.instructions_issued, 1)
    assert.equal(Object.keys(kpis).length, 5)

    const rowMarkup = renderToStaticMarkup(
      React.createElement(HqApplicationsTable, {
        rows,
        onOpen: () => {},
      }),
    )
    assert.match(rowMarkup, /Stage &amp; Progress/)
    assert.match(rowMarkup, /Open Application/)
    assert.match(rowMarkup, /R 2 400 000/)
    assert.match(rowMarkup, /West|National Road|Pending Street|Lender Lane|Attorney Avenue/)
    assert.doesNotMatch(rowMarkup, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)

    console.log('BondTransactionsPage tests passed')
  } finally {
    await server.close()
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
