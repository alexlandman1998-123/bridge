import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const transactionDetailSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const attorneyPermissionsSource = readFileSync(new URL('../src/lib/attorneyPermissions.js', import.meta.url), 'utf8')
const operationsServiceSource = readFileSync(new URL('../src/services/attorneyOperations.js', import.meta.url), 'utf8')
const dashboardServiceSource = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
const schedulingPageSource = readFileSync(new URL('../src/pages/AttorneySchedulingPage.jsx', import.meta.url), 'utf8')
const incomingQueueSource = readFileSync(new URL('../src/services/attorneyIncomingMatterQueue.js', import.meta.url), 'utf8')
const matterWorkspaceSource = readFileSync(new URL('../src/services/attorneyMatterWorkspace.js', import.meta.url), 'utf8')

const accessPreviewStart = transactionDetailSource.indexOf('function AttorneyMatterAccessPreview()')
const accessPreviewEnd = transactionDetailSource.indexOf('function AttorneyTransactionDetail()', accessPreviewStart)
const accessPreviewSource = transactionDetailSource.slice(accessPreviewStart, accessPreviewEnd)

assert.ok(accessPreviewStart >= 0 && accessPreviewEnd > accessPreviewStart, 'Matter detail should provide a dedicated access-check preview shell.')
assert.match(accessPreviewSource, /Checking your firm membership and matter access/)
assert.match(accessPreviewSource, /aria-busy="true"/)
for (const forbiddenPreviewInput of ['matterPreview', 'navigationPreviewData', 'transactionId', 'buyerName', 'sellerName', 'propertyAddress']) {
  assert.ok(
    !accessPreviewSource.includes(forbiddenPreviewInput),
    `Access-check preview must not render ${forbiddenPreviewInput} before authorization.`,
  )
}
assert.match(
  transactionDetailSource,
  /const shouldRenderAttorneyAccessPreview = workspaceRole === 'attorney' && \([\s\S]{0,120}attorneyPermissionState\.loading \|\| !matterAccessChecked/,
  'Matter detail should show the permission-safe shell while attorney access is unresolved.',
)
assert.match(
  transactionDetailSource,
  /if \(shouldRenderAttorneyAccessPreview\) \{[\s\S]{0,100}return <AttorneyMatterAccessPreview \/>/,
  'Matter detail should render the permission-safe shell instead of a blank loading panel.',
)
assert.match(
  transactionDetailSource,
  /import \{ canAccessAttorneyMatter \} from '..\/lib\/attorneyPermissions'/,
  'Matter detail should use matter access permissions for the page-level attorney gate.',
)
const accessCheckStart = transactionDetailSource.indexOf('async function checkMatterAccess()')
const accessCheckEnd = transactionDetailSource.indexOf('\n  }, [', accessCheckStart)
const accessCheckSource = transactionDetailSource.slice(accessCheckStart, accessCheckEnd)
for (const expectedAccessControl of [
  'const hasMatterAccess = await canAccessAttorneyMatter(',
  '{ membership: attorneyPermissionState.membership }',
  'if (!hasMatterAccess)',
  'setMatterAccessAllowed(true)',
]) {
  assert.ok(
    accessCheckSource.includes(expectedAccessControl),
    `Matter access check should include: ${expectedAccessControl}`,
  )
}
assert.match(
  accessCheckSource,
  /canAccessAttorneyMatter\(\s*transactionId,\s*attorneyPermissionState\.firmId,\s*\/\/[\s\S]*?\snull,\s*\{ membership:/,
  'Matter access must resolve the actor from the authenticated session instead of potentially stale workspace profile state.',
)
assert.match(
  attorneyPermissionsSource,
  /async function resolveAuthenticatedUserId\([\s\S]*?await getAuthenticatedUser\(client\)[\s\S]*?authenticatedUserId[\s\S]*?return authenticatedUserId/,
  'Attorney permission checks must prefer the authenticated Supabase user over caller-supplied profile state.',
)
assert.ok(
  transactionDetailSource.indexOf('if (shouldRenderAttorneyAccessPreview)')
    < transactionDetailSource.indexOf("if (workspaceRole === 'attorney' && !matterAccessAllowed)"),
  'Matter detail should keep unresolved access in the safe preview and deny rejected access before rendering matter data.',
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
