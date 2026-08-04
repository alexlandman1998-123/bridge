import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pagePath = path.join(projectRoot, 'src/pages/AttorneyMattersPage.jsx')
const workspacePath = path.join(projectRoot, 'src/services/attorneyMatterWorkspace.js')
const source = fs.readFileSync(pagePath, 'utf8')
const workspaceSource = fs.readFileSync(workspacePath, 'utf8')
const incomingActionsSource = source.slice(
  source.indexOf('function IncomingRowActions'),
  source.indexOf('function WaitingOnChips'),
)
const incomingTableSource = source.slice(
  source.indexOf('function IncomingMattersTable'),
  source.indexOf('function BulkActionBar'),
)

assert.match(source, /function IncomingMattersTable/, 'Incoming Matters needs its own intake table component')
assert.match(source, /workspace\?\.view\?\.usesIncomingQueue/, 'Incoming route should be keyed from the workspace contract')
assert.match(workspaceSource, /if \(viewConfig\.usesIncomingQueue\)[\s\S]*getAttorneyIncomingMatterQueue/, 'Incoming route should use the dedicated queue fast path')
assert.doesNotMatch(
  workspaceSource.slice(
    workspaceSource.indexOf('if (viewConfig.usesIncomingQueue)'),
    workspaceSource.indexOf('const operational = await getAttorneyOperationalWorkspaceData'),
  ),
  /getAttorneyOperationalWorkspaceData/,
  'Incoming route must not load the heavy operational workspace before rendering',
)
assert.match(source, /<IncomingMattersTable/, 'Incoming rows should render through the intake table')
assert.match(source, /<MattersTable/, 'Existing matter views should keep the generic matters table')
assert.match(source, /Property \/ Matter/, 'Incoming table should lead with property and matter context')
assert.match(source, /Current Stage/, 'Incoming table should expose the current intake stage')
assert.match(source, /Assigned On/, 'Incoming table should expose queue age')
assert.match(source, /WaitingOnChips/, 'Incoming table should keep waiting-on blockers visible in the stage column')
assert.match(source, /function IncomingMatterDrawer/, 'Incoming row clicks should open a lightweight intake drawer')
assert.match(source, /Open Full Matter/, 'The full legal workspace should only be opened from the drawer')
assert.match(source, /Download Mandate/, 'The drawer should expose mandate download')
assert.match(source, /Open Signed Mandate/, 'Pre-instruction rows should open the signed mandate')
assert.match(source, /row\.isPreInstruction/, 'Pre-instruction rows should be explicitly gated from formal instruction actions')
assert.match(source, /Formal instruction actions unlock after an accepted OTP/, 'Pre-instruction rows should explain why matter actions are locked')
assert.doesNotMatch(incomingActionsSource, /Follow Up OTP|Request Documents|Assign Attorney|Email Client/, 'Incoming row actions should not expose commands without handlers')
assert.match(source, /acceptAttorneyIncomingMatterInstruction/, 'Incoming ready rows should call the acceptance command')
assert.match(source, /Accept \$\{matterLabel\}/, 'Incoming ready rows should expose matter-type acceptance')
assert.match(source, /statusKey === 'ready_for_acceptance'/, 'Accept action should be gated to ready incoming rows')
assert.doesNotMatch(source, /navigate\(result\.actionHref/, 'Accepting an incoming matter should not automatically open the full workspace')
assert.match(source, /declineAttorneyIncomingMatterInstruction/, 'Incoming rows should call the decline command')
assert.match(source, /function IncomingDeclineDialog/, 'Declining an incoming matter should collect a reason')
assert.match(source, /Decline Transfer/, 'Incoming row actions should expose transfer decline')
assert.match(source, /getAttorneyMatterWorkspace\(\{ view: viewKey \}\)/, 'Accepting an incoming matter should refresh the queue')
assert.doesNotMatch(source, /incoming=\{usesIncomingQueue\}/, 'Bulk selection should not expose an unimplemented incoming action mode')
assert.match(source, /Bulk actions are unavailable until a supported operation is selected/, 'Bulk selection should explain why unsupported operations are unavailable')
assert.doesNotMatch(incomingActionsSource, /Archive/, 'Incoming action menu should not inherit archive-first register actions')
assert.doesNotMatch(incomingTableSource, /StageProgress/, 'Incoming table should not render the generic matter progress column')

console.log('attorney incoming matter UI test passed')
