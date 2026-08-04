import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const transactionDetailSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const operationsServiceSource = readFileSync(new URL('../src/services/attorneyOperations.js', import.meta.url), 'utf8')
const dashboardServiceSource = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
const schedulingPageSource = readFileSync(new URL('../src/pages/AttorneySchedulingPage.jsx', import.meta.url), 'utf8')
const incomingQueueSource = readFileSync(new URL('../src/services/attorneyIncomingMatterQueue.js', import.meta.url), 'utf8')
const matterWorkspaceSource = readFileSync(new URL('../src/services/attorneyMatterWorkspace.js', import.meta.url), 'utf8')

assert.match(
  transactionDetailSource,
  /const canRenderNavigationPreview = Boolean\(navigationPreviewData && data\?\.__isNavigationPreview\)/,
  'Matter detail should allow the route-state preview shell to render before full hydration.',
)
assert.match(
  transactionDetailSource,
  /attorneyPermissionState\.loading && !canRenderNavigationPreview/,
  'Matter detail should not block preview rendering on attorney permission loading.',
)
assert.match(
  transactionDetailSource,
  /!matterAccessChecked && !canRenderNavigationPreview/,
  'Matter detail should not block preview rendering on matter access loading.',
)
assert.match(
  transactionDetailSource,
  /workflowOperationsTransactionId === transaction\.id/,
  'Matter detail should skip the duplicate workflow fetch when access check already loaded the same transaction operations.',
)

for (const expected of [
  'OPERATIONAL_WORKSPACE_CACHE_TTL_MS',
  'operationalWorkspaceCache',
  'operationalWorkspaceInflight',
  'clearAttorneyOperationalWorkspaceCache',
  'options?.force',
  'loadAttorneyOperationalWorkspaceData',
]) {
  assert.ok(operationsServiceSource.includes(expected), `Attorney operations service should include "${expected}".`)
}

for (const expected of [
  'DASHBOARD_CACHE_TTL_MS',
  'dashboardCache',
  'dashboardInflight',
  'clearAttorneyManagementDashboardCache',
  'force = false',
  'loadAttorneyManagementDashboardData',
]) {
  assert.ok(dashboardServiceSource.includes(expected), `Attorney dashboard service should include "${expected}".`)
}

assert.match(
  schedulingPageSource,
  /setData\(next\)[\s\S]*setLoading\(false\)[\s\S]*listAppointmentResourcesAsync/,
  'Scheduling should paint core workspace data before loading appointment resources.',
)
assert.match(
  schedulingPageSource,
  /onWorkspaceChanged=\{\(\) => loadWorkspace\(\{ force: true \}\)\}/,
  'Scheduling mutations should bypass the short-lived workspace cache.',
)
assert.match(
  matterWorkspaceSource,
  /usesIncomingQueue[\s\S]*getAttorneyIncomingMatterQueue/,
  'Incoming Matters should use its dedicated queue fast path instead of the full operational workspace loader.',
)
assert.match(
  incomingQueueSource,
  /Promise\.all\(\[[\s\S]*fetchPreInstructionAllocations[\s\S]*fetchAssignments/,
  'Incoming Matters should load allocation and assignment metadata in parallel.',
)

console.log('attorney module performance contract passed')
