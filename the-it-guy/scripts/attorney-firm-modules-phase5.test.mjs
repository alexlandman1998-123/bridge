import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    filterAttorneyRecordsByModules,
    getAttorneyRecordModuleKeys,
    recordMatchesAttorneyModuleScope,
    scopeAttorneyMatterRoleSummaries,
  } = await server.ssrLoadModule('/src/services/attorneyModuleDataScope.js')
  const { buildAttorneyMatterWorkspace } = await server.ssrLoadModule('/src/services/attorneyMatterWorkspace.js')
  const { getAttorneyIncomingMatterQueue } = await server.ssrLoadModule('/src/services/attorneyIncomingMatterQueue.js')

  assert.deepEqual(getAttorneyRecordModuleKeys({ assignmentType: 'transfer_and_bond' }), ['transfer', 'bond'])
  assert.deepEqual(getAttorneyRecordModuleKeys({ matterType: 'Bond Cancellation' }), ['cancellation'])
  assert.equal(recordMatchesAttorneyModuleScope({ matterType: 'Bond' }, ['transfer']), false)

  const scopedRows = filterAttorneyRecordsByModules([
    { id: 'transfer', matterType: 'Transfer' },
    { id: 'bond', matterType: 'Bond Registration' },
    { id: 'cancellation', matterType: 'Bond Cancellation' },
    { id: 'combined', assignmentType: 'transfer_and_bond' },
  ], ['transfer'])
  assert.deepEqual(scopedRows.map((row) => row.id), ['transfer', 'combined'])

  const scopedSummaries = scopeAttorneyMatterRoleSummaries([{
    transactionId: 'tx-1',
    roles: new Set(['transfer', 'bond', 'cancellation']),
    roleList: ['transfer', 'bond', 'cancellation'],
  }], ['transfer', 'bond'])
  assert.deepEqual(scopedSummaries[0].roleList, ['transfer', 'bond'])
  assert.equal(scopedSummaries[0].isFullService, false)

  const workspace = buildAttorneyMatterWorkspace({
    matterQueue: [
      { matterId: 'tx-transfer', matterType: 'Transfer', status: 'On Track' },
      { matterId: 'tx-bond', matterType: 'Bond', status: 'On Track' },
      { matterId: 'tx-cancellation', matterType: 'Bond Cancellation', status: 'On Track' },
    ],
  }, { moduleKeys: ['transfer'], pageSize: 20 })
  assert.deepEqual(workspace.allRows.map((row) => row.matterId), ['tx-transfer'])
  assert.equal(workspace.summary.totalMatters, 1)
  assert.equal(workspace.summary.bondCount, 0)
  assert.equal(workspace.summary.cancellationCount, 0)

  const incoming = await getAttorneyIncomingMatterQueue({
    client: {},
    authUser: { id: 'user-1', email: 'attorney@example.test', user_metadata: {} },
    firm: { id: 'firm-1', name: 'Transfer Firm' },
    membership: { role: 'firm_admin' },
    moduleKeys: ['bond'],
  })
  assert.deepEqual(incoming.allRows, [])
  assert.equal(incoming.summary.allTransferInstructions, 0)

  const dashboardSource = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
  const operationsSource = readFileSync(new URL('../src/services/attorneyOperations.js', import.meta.url), 'utf8')
  const mattersPageSource = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
  const dashboardPageSource = readFileSync(new URL('../src/pages/AttorneyDashboardPage.jsx', import.meta.url), 'utf8')
  const flagsSource = readFileSync(new URL('../src/lib/envValidation.js', import.meta.url), 'utf8')

  assert.match(dashboardSource, /filterAttorneyRecordsByModules\(matterUnits, moduleKeys\)/)
  assert.match(dashboardSource, /if \(assignmentType === 'cancellation'\) return 'cancellation'/)
  assert.match(dashboardSource, /scopeAttorneyMatterRoleSummaries\(unscopedMatterRoleSummaries, moduleKeys\)/)
  assert.match(operationsSource, /filterAttorneyRecordsByModules\(operationalAssignments, moduleKeys\)/)
  assert.match(operationsSource, /const transactionIds = \[\.\.\.new Set\(relevantAssignments/)
  assert.match(mattersPageSource, /getAttorneyMatterWorkspace\(\{ view: viewKey, moduleKeys \}\)/)
  assert.match(dashboardPageSource, /getAttorneyManagementDashboardData\(null, \{/)
  assert.match(dashboardPageSource, /ActiveMattersByType lanes=\{lanes\} moduleKeys=\{moduleKeys\}/)
  assert.match(flagsSource, /VITE_FEATURE_ATTORNEY_MODULE_DATA_SCOPE, false/)

  console.log('attorney firm modules Phase 5 data-scope tests passed')
} finally {
  await server.close()
}
