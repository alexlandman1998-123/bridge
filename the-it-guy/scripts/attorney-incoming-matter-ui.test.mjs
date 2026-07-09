import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pagePath = path.join(projectRoot, 'src/pages/AttorneyMattersPage.jsx')
const source = fs.readFileSync(pagePath, 'utf8')
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
assert.match(source, /<IncomingMattersTable/, 'Incoming rows should render through the intake table')
assert.match(source, /<MattersTable/, 'Existing matter views should keep the generic matters table')
assert.match(source, /Waiting On/, 'Incoming table should expose waiting-on blockers')
assert.match(source, /Incoming Since/, 'Incoming table should expose queue age')
assert.match(source, /Documents/, 'Incoming table should expose document blockers')
assert.match(source, /Open Transfer/, 'Incoming row action should open the transfer instruction')
assert.match(source, /Follow Up OTP/, 'Incoming row actions should include OTP follow-up')
assert.match(source, /acceptAttorneyIncomingMatterInstruction/, 'Incoming ready rows should call the acceptance command')
assert.match(source, /Accept Transfer/, 'Incoming ready rows should expose transfer acceptance')
assert.match(source, /statusKey === 'ready_for_acceptance'/, 'Accept action should be gated to ready incoming rows')
assert.match(source, /declineAttorneyIncomingMatterInstruction/, 'Incoming rows should call the decline command')
assert.match(source, /function IncomingDeclineDialog/, 'Declining an incoming matter should collect a reason')
assert.match(source, /Decline Transfer/, 'Incoming row actions should expose transfer decline')
assert.match(source, /getAttorneyMatterWorkspace\(\{ view: viewKey \}\)/, 'Accepting an incoming matter should refresh the queue')
assert.match(source, /incoming=\{usesIncomingQueue\}/, 'Bulk actions should switch for the incoming route')
assert.doesNotMatch(incomingActionsSource, /Archive/, 'Incoming action menu should not inherit archive-first register actions')
assert.doesNotMatch(incomingTableSource, /StageProgress/, 'Incoming table should not render the generic matter progress column')

console.log('attorney incoming matter UI test passed')
