import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'pages', 'UnitDetail.jsx'), 'utf8')

const transferTabStart = source.indexOf("activeWorkspaceMenu === 'transfer' ? (")
const transferTabEnd = source.indexOf("activeWorkspaceMenu === 'cancellation' ? (", transferTabStart)

assert.notEqual(transferTabStart, -1, 'UnitDetail transfer/conveyancing tab should exist')
assert.notEqual(transferTabEnd, -1, 'UnitDetail transfer/conveyancing tab should be extractable')

const transferTabBlock = source.slice(transferTabStart, transferTabEnd)

assert.match(source, /function ConveyancingWorkflowOverview\(\{ lanes = \[\], onOpenActivity \}\)/, 'UnitDetail should render a simplified conveyancing overview component')
assert.match(source, /function buildConveyancingWorkflowLaneModels\(/, 'UnitDetail should build conveyancing lane models from workflow snapshots')
assert.match(source, /const CONVEYANCING_WORKFLOW_LANES = \[[\s\S]*Transfer Attorney[\s\S]*Bond Attorney[\s\S]*Cancellation Attorney/, 'Conveyancing tab should cover all three attorney workflows')
assert.match(source, /function getLatestConveyancingComment\(comments = \[\], lane = \{\}, context = \{\}\)/, 'Conveyancing lanes should derive their latest shared comments')
assert.match(transferTabBlock, /<ConveyancingWorkflowOverview[\s\S]*lanes=\{conveyancingWorkflowLanes\}/, 'Transfer tab should render only the simplified conveyancing overview')
assert.doesNotMatch(transferTabBlock, /<WorkspacePanel[\s\S]*title="Transfer"/, 'Transfer tab should not render the old top transfer container')
assert.doesNotMatch(transferTabBlock, /Transfer Summary/, 'Transfer tab should not render the old summary container')
assert.doesNotMatch(transferTabBlock, /No cancellation workflow is active for this transaction\./, 'Transfer tab should not render the old cancellation placeholder')

console.log('unit detail conveyancing tab simplification checks passed')
