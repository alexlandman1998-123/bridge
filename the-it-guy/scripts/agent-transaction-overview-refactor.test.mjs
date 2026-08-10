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
const conveyancingWorkspaceStart = source.indexOf('function AgentConveyancingLaneCard(')
const legalActivityListStart = source.indexOf('function LegalActivityList(', conveyancingWorkspaceStart)
assert.notEqual(conveyancingWorkspaceStart, -1, 'agent conveyancing workspace component should exist')
assert.notEqual(legalActivityListStart, -1, 'legal activity list should remain after agent conveyancing workspace')
const conveyancingWorkspaceBlock = source.slice(conveyancingWorkspaceStart, legalActivityListStart)
const journeyStagesStart = source.indexOf('const AGENT_TRANSACTION_JOURNEY_STAGES = [')
const documentSnapshotStart = source.indexOf('const AGENT_DOCUMENT_SNAPSHOT_GROUPS = [', journeyStagesStart)
assert.notEqual(journeyStagesStart, -1, 'agent transaction journey stage config should exist')
assert.notEqual(documentSnapshotStart, -1, 'agent document snapshot config should follow journey stages')
const journeyStagesBlock = source.slice(journeyStagesStart, documentSnapshotStart)
const attorneyTabsStart = source.indexOf('const ATTORNEY_WORKSPACE_TABS = [')
const agentTabsStart = source.indexOf('const AGENT_WORKSPACE_TABS = [')
const bondOriginatorTabsStart = source.indexOf('const BOND_ORIGINATOR_WORKSPACE_TABS = [', agentTabsStart)
assert.notEqual(attorneyTabsStart, -1, 'attorney workspace tab config should exist')
assert.notEqual(agentTabsStart, -1, 'agent workspace tab config should exist')
assert.notEqual(bondOriginatorTabsStart, -1, 'bond originator workspace tab config should follow agent tabs')
const attorneyTabsBlock = source.slice(attorneyTabsStart, agentTabsStart)
const agentTabsBlock = source.slice(agentTabsStart, bondOriginatorTabsStart)
const overviewBranchStart = source.indexOf("workspaceRole !== 'attorney' && workspaceRole !== 'bond_originator' && ['overview', 'transfer'].includes(activeWorkspaceMenu)")
const transferBranchStart = source.indexOf("activeWorkspaceMenu !== 'overview' ? (", overviewBranchStart)
assert.notEqual(overviewBranchStart, -1, 'non-attorney transaction workspace overview branch should exist')
assert.notEqual(transferBranchStart, -1, 'transfer workspace branch should still follow overview handling')

const overviewBranch = source.slice(overviewBranchStart, transferBranchStart)

assert.match(componentBlock, /Transaction Journey/, 'agent overview should render a transaction journey hero')
assert.match(componentBlock, /gridTemplateColumns: `repeat\(\$\{Math\.max\(1, journeyStages\.length\)\}, minmax\(0, 1fr\)\)`/, 'transaction journey should stretch to the actual milestone count')
assert.doesNotMatch(componentBlock, /grid-cols-6/, 'transaction journey should not reserve an extra empty milestone column')
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
assert.match(journeyStagesBlock, /label: 'Confirmed'/, 'agent journey should use Confirmed as the accepted-offer milestone')
assert.match(journeyStagesBlock, /label: 'OTP'/, 'agent journey should use OTP as the upload milestone')
assert.match(journeyStagesBlock, /label: 'Finance'/, 'agent journey should keep Finance as the finance-evidence milestone')
assert.match(journeyStagesBlock, /label: 'Transfer'/, 'agent journey should keep Transfer after finance evidence')
assert.match(journeyStagesBlock, /label: 'Registration'/, 'agent journey should end on Registration')
assert.match(agentTabsBlock, /\{ id: 'transfer', label: 'Conveyancing' \}/, 'agent-facing transfer workspace tab should be labelled Conveyancing')
assert.doesNotMatch(agentTabsBlock, /\{ id: 'transfer', label: 'Transfer' \}/, 'agent-facing transfer workspace tab should not use the old Transfer label')
assert.match(attorneyTabsBlock, /\{ id: 'transfer', label: 'Transfer' \}/, 'attorney workspace tab should keep the legal Transfer label in phase 1')
assert.doesNotMatch(journeyStagesBlock, /Buyer Onboarding/, 'buyer onboarding should not be a transaction tracker milestone')
assert.doesNotMatch(journeyStagesBlock, /OTP Signed/, 'OTP milestone should be upload-based, not signed-label based')
assert.doesNotMatch(source, /<ProgressTimeline/, 'agent transaction workspace should not render the duplicate shared progress tracker')
assert.match(source, /const otpUploaded =[\s\S]*offer to purchase uploaded/, 'OTP progression should be upload based')
assert.match(source, /const bondGrantUploaded =[\s\S]*bond grant[\s\S]*proofOfFundsVerified[\s\S]*financeComplete/, 'finance should complete from bond grant or proof of funds evidence')

assert.match(overviewBranch, /isAgentTransactionView \? \(\s*<AgentTransactionOverview/, 'agent overview branch should render the agent-specific overview')
assert.match(overviewBranch, /: \(\s*<AttorneyMatterCommandCenter/, 'non-agent non-attorney overview should keep the existing command center')
assert.doesNotMatch(overviewBranch, /isAgentTransactionView && isBondOrHybridFinance/, 'agent overview should not append the bond progress widget below the redesigned overview')
assert.match(source, /isAgentTransactionView \? \(\s*<AgentConveyancingWorkspace[\s\S]*model=\{conveyancingLaneModel\}[\s\S]*onOpenActivity=\{handleOpenAgentConveyancingActivity\}/, 'agent Conveyancing tab should render the dedicated conveyancing workspace with lane activity actions')
assert.match(source, /audience: isAgentTransactionView \? 'agent' : 'internal'/, 'agent Conveyancing lane model should request agent-safe activity')
assert.match(source, /const handleOpenAgentConveyancingActivity = useCallback/, 'agent Conveyancing should have a lane activity handler')
assert.match(source, /setActivityFilter\(filterKey\)[\s\S]*openWorkspaceMenu\('activity'\)/, 'agent Conveyancing lane activity handler should open the filtered Activity tab')
assert.match(conveyancingWorkspaceBlock, /Active Containers/, 'agent Conveyancing workspace should summarize active containers')
assert.match(conveyancingWorkspaceBlock, /Current Step/, 'agent Conveyancing lane cards should show current steps')
assert.match(conveyancingWorkspaceBlock, /Next Step/, 'agent Conveyancing lane cards should show next steps')
assert.match(conveyancingWorkspaceBlock, /Assigned/, 'agent Conveyancing lane cards should show the assigned attorney or firm')
assert.match(conveyancingWorkspaceBlock, /Latest update from \{lane\.roleLabel\}/, 'agent Conveyancing lane cards should show attorney-specific latest updates')
assert.match(conveyancingWorkspaceBlock, /freshnessLabel/, 'agent Conveyancing lane cards should show update freshness')
assert.match(conveyancingWorkspaceBlock, /View Updates/, 'agent Conveyancing lane cards should link to filtered updates')
assert.match(source, /Post Update/, 'attorney workflow drawer should expose a shared status update action')
assert.doesNotMatch(conveyancingWorkspaceBlock, /LegalWorkflowRoutingPanel/, 'agent Conveyancing workspace should not render routing diagnostics')
assert.doesNotMatch(conveyancingWorkspaceBlock, /Assigned Roleplayers/, 'agent Conveyancing workspace should not render the assigned roleplayers panel')
assert.doesNotMatch(conveyancingWorkspaceBlock, /Manage the legal workflows for this transaction/, 'agent Conveyancing workspace should not render the old Transfer intro copy')

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
