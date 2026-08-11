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
const journeyStagesStart = source.indexOf('const AGENT_TRANSACTION_JOURNEY_STAGES = [')
const documentSnapshotStart = source.indexOf('const AGENT_DOCUMENT_SNAPSHOT_GROUPS = [', journeyStagesStart)
assert.notEqual(journeyStagesStart, -1, 'agent transaction journey stage config should exist')
assert.notEqual(documentSnapshotStart, -1, 'agent document snapshot config should follow journey stages')
const journeyStagesBlock = source.slice(journeyStagesStart, documentSnapshotStart)
const overviewBranchStart = source.indexOf("workspaceRole !== 'attorney' && workspaceRole !== 'bond_originator' && (activeWorkspaceMenu === 'overview' || (!isAgentTransactionView && activeWorkspaceMenu === 'transfer'))")
const buyerBranchStart = source.indexOf("{activeWorkspaceMenu === 'buyer' ?", overviewBranchStart)
assert.notEqual(overviewBranchStart, -1, 'non-attorney transaction workspace overview branch should exist')
assert.notEqual(buyerBranchStart, -1, 'buyer workspace branch should follow the non-attorney overview handling')

const overviewBranch = source.slice(overviewBranchStart, buyerBranchStart)
const agentConveyancingStart = source.indexOf('function AgentConveyancingWorkspace(')
const agentConveyancingEnd = source.indexOf('function LegalWorkflowActionPanel', agentConveyancingStart)
assert.notEqual(agentConveyancingStart, -1, 'agent Conveyancing workspace component should exist')
assert.notEqual(agentConveyancingEnd, -1, 'agent Conveyancing workspace component should be extractable')
const agentConveyancingBlock = source.slice(agentConveyancingStart, agentConveyancingEnd)

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
assert.match(componentBlock, /w-full min-w-\[820px\]/, 'journey rail should fill the available card width before horizontal overflow')
assert.match(componentBlock, /gridTemplateColumns: `repeat\(\$\{journeyStages\.length\}, minmax\(0, 1fr\)\)`/, 'journey rail should derive columns from the milestone count')
assert.doesNotMatch(componentBlock, /grid-cols-6/, 'journey rail should not reserve an extra sixth column')
assert.match(journeyStagesBlock, /label: 'Confirmed'/, 'agent journey should use Confirmed as the accepted-offer milestone')
assert.match(journeyStagesBlock, /label: 'OTP'/, 'agent journey should use OTP as the upload milestone')
assert.match(journeyStagesBlock, /label: 'Finance'/, 'agent journey should keep Finance as the finance-evidence milestone')
assert.match(journeyStagesBlock, /label: 'Transfer'/, 'agent journey should keep Transfer after finance evidence')
assert.match(journeyStagesBlock, /label: 'Registration'/, 'agent journey should end on Registration')
assert.equal((journeyStagesBlock.match(/key: '/g) || []).length, 5, 'agent journey should remain the canonical five-stage flow')
assert.doesNotMatch(journeyStagesBlock, /Buyer Onboarding/, 'buyer onboarding should not be a transaction tracker milestone')
assert.doesNotMatch(journeyStagesBlock, /OTP Signed/, 'OTP milestone should be upload-based, not signed-label based')
assert.doesNotMatch(source, /<ProgressTimeline/, 'agent transaction workspace should not render the duplicate shared progress tracker')
assert.match(source, /const otpUploaded =[\s\S]*offer to purchase uploaded/, 'OTP progression should be upload based')
assert.match(source, /const bondGrantUploaded =[\s\S]*bond grant[\s\S]*proofOfFundsVerified[\s\S]*financeComplete/, 'finance should complete from bond grant or proof of funds evidence')

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
assert.match(source, /headline=\{workspaceRole === 'attorney' \|\| isAgentTransactionView \? \(/, 'agent transactions should use the restored Archline shell header')
assert.match(source, /tabs=\{isAgentTransactionView[\s\S]*workspaceMenuTabs\.map\(\(tab\) => \(\{ id: tab\.id, label: tab\.label, count: tab\.meta \}\)\)[\s\S]*: archlineWorkspaceTabs\}/, 'agent shell should reuse the live agent transaction tab list')
assert.match(source, /activeTab=\{isAgentTransactionView \? activeWorkspaceMenu : archlineActiveWorkspaceTab\}/, 'agent shell tabs should track the active agent workspace menu')
assert.match(source, /workspaceLabel=\{isAgentTransactionView \? 'Transaction Workspace' : 'Legal Matter Workspace'\}/, 'agent shell should label the workspace as a transaction workspace')
assert.match(source, /showWorkflowProgress=\{!isAgentTransactionView\}/, 'agent shell should not duplicate the restored transaction journey with a header workflow rail')
assert.match(source, /onTabChange=\{isAgentTransactionView \? openWorkspaceMenu : handleArchlineTabChange\}/, 'agent shell tabs should use the agent workspace menu handler')
assert.match(source, /stakeholders: UsersRound/, 'restored Archline tabs should have an icon for the agent Roleplayers tab')
assert.doesNotMatch(source, /isAgentView=\{isAgentTransactionView\}/, 'agent transactions should not fall back to the old MatterOverviewHeader shell')
assert.match(source, /isAgentView=\{false\}/, 'legacy fallback header should be explicitly non-agent')
assert.match(source, /\(workspaceRole === 'attorney' \|\| isAgentTransactionView\) && activeWorkspaceMenu === 'documents'/, 'agent Documents tab should remain on the shared buyer and seller document workspace')
assert.match(source, /\{ id: 'transfer', label: 'Conveyancing' \}/, 'agent-facing transfer route should be labelled Conveyancing')
assert.match(source, /function AgentConveyancingWorkspace\(/, 'agent Conveyancing workspace should provide the lane hub and detail surface')
assert.match(source, /isAgentTransactionView && activeWorkspaceMenu === 'transfer' \? \([\s\S]*<AgentConveyancingWorkspace/, 'agent Conveyancing tab should use the agent-safe lane workspace')
assert.match(source, /workflows=\{transferHubWorkflows\}/, 'agent Conveyancing lanes should come from the same attorney workflow models')
assert.match(agentConveyancingBlock, /<LegalWorkflowProgressBar[\s\S]*workflow=\{activeWorkflow\}[\s\S]*diagnostics=\{routingDiagnostics\}[\s\S]*saving=\{saving\}/, 'agent lane detail should reuse the shared attorney workflow progress bar')
assert.doesNotMatch(agentConveyancingBlock, /onQuickUpdateStep=/, 'agent lane progress detail should not expose quick workflow update controls')
assert.doesNotMatch(agentConveyancingBlock, /onStartInlineStepUpdate=/, 'agent lane progress detail should not expose inline workflow update controls')
assert.match(agentConveyancingBlock, /No shared attorney update has been posted for this lane yet\./, 'agent Conveyancing detail should show an agent-safe empty shared update state')
assert.match(source, /function isInternalActivityEntry\(entry = \{\}\)/, 'agent-facing activity should have an explicit internal-entry guard')
assert.match(source, /function isAgentSafeWorkflowUpdate\(entry = \{\}\)/, 'agent Conveyancing latest updates should have an agent-safe visibility guard')
assert.match(source, /\.\.\.\(Array\.isArray\(workflow\?\.timeline\) \? workflow\.timeline : \[\]\)/, 'agent Conveyancing should read lane timeline updates from the attorney workflow source')
assert.match(source, /\.\.\.\(Array\.isArray\(workflow\?\.updates\) \? workflow\.updates : \[\]\)/, 'agent Conveyancing should also read stored lane update rows')
assert.match(source, /const eventVisibility = String\(event\.visibility \|\| event\.visibility_scope \|\| eventData\.visibility \|\| eventData\.visibilityScope \|\| 'shared'\)/, 'activity mapper should preserve attorney update visibility from transaction events')
assert.match(source, /internal: category === 'internal' \|\| eventVisibility === 'internal'/, 'transaction event activity rows should mark internal attorney notes')
assert.match(source, /return isAgentTransactionView \? fullFeed\.filter\(\(entry\) => !isInternalActivityEntry\(entry\)\) : fullFeed/, 'agent activity feed should filter internal entries')
assert.match(source, /addAttorneyTransactionUpdate\(\{[\s\S]*laneKey: activeDiscussionLane\.laneKey[\s\S]*visibility: getAttorneyUpdateVisibility\(discussionVisibility\)[\s\S]*message: normalizedDiscussion/, 'attorney structured composer should post lane-specific shared updates')
assert.match(source, /workspaceRole === 'attorney' && activeWorkspaceMenu === 'transfer'/, 'attorney transfer tab should keep the editable Archline transfer workspace')
assert.match(source, /\(workspaceRole === 'attorney' \|\| isAgentTransactionView\) && activeWorkspaceMenu === 'activity'/, 'agent Activity tab should use the restored Archline activity workspace')
assert.match(source, /\(workspaceRole === 'attorney' \|\| isAgentTransactionView\) && activeWorkspaceMenu === 'stakeholders'/, 'agent Roleplayers tab should use the restored Archline roleplayers workspace')
assert.match(source, /activeWorkspaceMenu === 'activity' && workspaceRole !== 'attorney' && !isAgentTransactionView/, 'legacy non-attorney activity panel should not catch the agent transaction portal')
assert.match(source, /activeWorkspaceMenu === 'stakeholders' && workspaceRole !== 'attorney' && !isAgentTransactionView/, 'legacy non-attorney roleplayer panel should not catch the agent transaction portal')
assert.match(source, /activeWorkspaceMenu === 'overview' \|\| \(!isAgentTransactionView && activeWorkspaceMenu === 'transfer'\)/, 'legacy non-attorney transfer hub should be kept away from agent transfer')

console.log('agent-transaction-overview-refactor tests passed')
