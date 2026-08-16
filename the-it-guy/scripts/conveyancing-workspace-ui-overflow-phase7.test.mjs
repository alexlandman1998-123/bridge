import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const attorneyDetailSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

function componentSource(functionName, nextFunctionName) {
  const start = attorneyDetailSource.indexOf(`function ${functionName}`)
  const end = attorneyDetailSource.indexOf(`function ${nextFunctionName}`, start + 1)
  assert.ok(start > -1 && end > start, `${functionName} source block should be found`)
  return attorneyDetailSource.slice(start, end)
}

const commandCenterSource = componentSource('AttorneyMatterCommandCenter', 'AttorneyStatusBriefPanel')
const rolePanelSource = componentSource('AttorneyRoleWorkspacePanel', 'AttorneyCoordinationBoard')
const workflowDrawerSource = componentSource('WorkflowDetailsDrawer', 'AttorneyTransactionDetail')

assert.match(commandCenterSource, /archline-matter-command-center/)
assert.match(commandCenterSource, /mt-3 grid gap-2 sm:grid-cols-2/)
assert.match(commandCenterSource, /flex flex-wrap items-start justify-between gap-3/)
assert.doesNotMatch(commandCenterSource, /grid grid-cols-2/)
assert.doesNotMatch(commandCenterSource, /flex items-start justify-between/)
assert.doesNotMatch(commandCenterSource, /flex items-center justify-between/)

assert.match(rolePanelSource, /attorney-role-workspace-panel/)
assert.match(rolePanelSource, /mt-4 grid gap-2 sm:grid-cols-2/)
assert.match(rolePanelSource, /flex flex-wrap items-start justify-between gap-3/)
assert.doesNotMatch(rolePanelSource, /grid grid-cols-2/)
assert.doesNotMatch(rolePanelSource, /flex items-start justify-between/)
assert.doesNotMatch(rolePanelSource, /block truncate text-\[0\.64rem\]/)
assert.doesNotMatch(rolePanelSource, /block truncate text-xs text-textStrong/)

assert.match(workflowDrawerSource, /archline-workflow-details-drawer/)
assert.match(workflowDrawerSource, /ui-icon-button size-10 shrink-0/)
assert.match(workflowDrawerSource, /flex flex-wrap items-start justify-between gap-4/)
assert.match(workflowDrawerSource, /flex flex-col gap-3 rounded-\[10px\] border border-borderSoft bg-surfaceAlt px-3 py-2 sm:flex-row sm:items-start sm:justify-between/)
assert.match(workflowDrawerSource, /flex flex-col gap-3 rounded-\[12px\] border border-borderSoft bg-surfaceAlt px-3 py-2 sm:flex-row sm:items-start sm:justify-between/)
assert.doesNotMatch(workflowDrawerSource, /ui-icon-button h-10 w-10/)
assert.doesNotMatch(workflowDrawerSource, /flex items-start justify-between/)
assert.doesNotMatch(workflowDrawerSource, /block truncate text-sm text-textStrong/)

assert.match(appCss, /\.archline-matter-command-center/)
assert.match(appCss, /\.attorney-role-workspace-panel/)
assert.match(appCss, /\.archline-workflow-details-drawer/)
assert.match(packageSource, /test:conveyancing-workspace-overflow-phase7/)

console.log('conveyancing workspace UI overflow phase 7 contract passed')
