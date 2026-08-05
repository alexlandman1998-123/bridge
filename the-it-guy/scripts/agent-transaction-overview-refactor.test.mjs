import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

assert.equal(
  packageJson.scripts['test:agent-transaction-overview-refactor'],
  'node scripts/agent-transaction-overview-refactor.test.mjs',
  'package script should expose the agent transaction overview regression',
)

const componentStart = source.indexOf('function AgentTransactionOverview(')
const headerStart = source.indexOf('function MatterOverviewHeader(', componentStart)
assert.notEqual(componentStart, -1, 'Agent transaction overview component should exist')
assert.notEqual(headerStart, -1, 'Matter overview header should remain after the agent overview component')

const componentBlock = source.slice(componentStart, headerStart)
const overviewBranchStart = source.indexOf("workspaceRole !== 'attorney' && workspaceRole !== 'bond_originator' && ['overview', 'transfer'].includes(activeWorkspaceMenu)")
const transferBranchStart = source.indexOf("activeWorkspaceMenu !== 'overview' ? (", overviewBranchStart)
assert.notEqual(overviewBranchStart, -1, 'non-attorney transaction workspace overview branch should exist')
assert.notEqual(transferBranchStart, -1, 'transfer workspace branch should still follow overview handling')

const overviewBranch = source.slice(overviewBranchStart, transferBranchStart)

assert.match(componentBlock, /Transaction Journey/, 'agent overview should render a transaction journey hero')
assert.match(componentBlock, /Outstanding Items/, 'agent overview should render outstanding items')
assert.match(componentBlock, /Your Next Action/, 'agent overview should render a single next action card')
assert.match(componentBlock, /Documents Snapshot/, 'agent overview should render document snapshot')
assert.match(componentBlock, /Parties/, 'agent overview should render parties')
assert.match(componentBlock, /Financial Snapshot/, 'agent overview should render financial snapshot')
assert.match(componentBlock, /View Full Timeline/, 'journey should link to the full timeline')
assert.match(componentBlock, /View Documents/, 'documents snapshot should link to Documents')
assert.match(componentBlock, /View Finance/, 'financial snapshot should link to Finance')
assert.match(componentBlock, /WhatsApp/, 'next action and party actions should expose WhatsApp contact')
assert.match(componentBlock, /Everything looks good\. No outstanding actions\./, 'outstanding items should include the requested empty state')

assert.match(overviewBranch, /isAgentTransactionView \? \(\s*<AgentTransactionOverview/, 'agent overview branch should render the agent-specific overview')
assert.match(overviewBranch, /: \(\s*<AttorneyMatterCommandCenter/, 'non-agent non-attorney overview should keep the existing command center')
assert.doesNotMatch(overviewBranch, /isAgentTransactionView && isBondOrHybridFinance/, 'agent overview should not append the bond progress widget below the redesigned overview')

for (const retiredLabel of [
  'Matter Command Center',
  'Active Workflows',
  'Legal Lanes',
  'Coordination',
  'Status Brief',
  'Action Queue',
  'Open Legal Items',
]) {
  assert.doesNotMatch(componentBlock, new RegExp(retiredLabel), `agent overview should not render ${retiredLabel}`)
}

assert.match(source, /workspaceRole === 'attorney' && \['today', 'overview'\]\.includes\(activeWorkspaceMenu\)/, 'attorney overview should keep its own workspace route')
assert.match(source, /\(workspaceRole === 'attorney' \|\| isAgentTransactionView\) && activeWorkspaceMenu === 'documents'/, 'agent Documents tab should remain on the shared buyer and seller document workspace')

console.log('agent-transaction-overview-refactor tests passed')
