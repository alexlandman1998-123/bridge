import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

assert.equal(
  packageJson.scripts['test:transaction-overview-conversation'],
  'node scripts/transaction-overview-conversation.test.mjs',
  'package script should expose the transaction overview conversation regression',
)

const overviewStart = source.indexOf("{workspaceRole !== 'bond_originator' && ['overview', 'transfer'].includes(activeWorkspaceMenu) ? (")
const overviewSidebarStart = source.indexOf('<OverviewSidePanel title="Quick Actions">', overviewStart)

assert.notEqual(overviewStart, -1, 'Transaction workspace overview block should render explicitly')
assert.notEqual(overviewSidebarStart, -1, 'Overview sidebar should follow the main overview content')

const overviewBlock = source.slice(overviewStart, overviewSidebarStart)
const conversationTitle = "{isAgentTransactionView ? 'Transaction Conversation' : 'Matter Conversation'}"
const conversationStart = overviewBlock.indexOf(conversationTitle)
const threadStart = overviewBlock.indexOf('overviewConversationEntries.slice().reverse().map', conversationStart)
const composerStart = overviewBlock.indexOf('<form onSubmit={handleAddDiscussion}', conversationStart)

assert.notEqual(conversationStart, -1, 'Overview should render the transaction conversation panel')
assert.notEqual(threadStart, -1, 'Overview conversation should render recent history as a chat thread')
assert.notEqual(composerStart, -1, 'Overview conversation should keep the manual update composer')
assert.ok(threadStart < composerStart, 'Conversation history should appear above the composer')

assert.match(source, /const ATTORNEY_ROLE_WORKSPACE_CONTENT = \{[\s\S]*Transfer Attorney[\s\S]*Bond Attorney[\s\S]*Cancellation Attorney/, 'Role workspace copy should cover all three attorney perspectives')
assert.match(source, /function AttorneyRoleWorkspacePanel\(\{[\s\S]*onRequestDocuments/, 'Attorney role workspace panel should expose document request actions')
assert.match(overviewBlock, /<AttorneyRoleWorkspacePanel[\s\S]{0,700}workflows=\{legalWorkflowModels\}/, 'Overview should render the attorney role workspace from legal workflow models')
assert.match(overviewBlock, /onOpenWorkflow=\{\(workflow\) => openLegalWorkflowDetail\(workflow\.detailKey\)\}/, 'Role workspace should open the matching lane detail')
assert.match(overviewBlock, /onRequestDocuments=\{\(workflow, action\) => handleWorkflowActionCommand\(workflow\?\.lane, action\)\}/, 'Role workspace missing-document actions should use the workflow command flow')
assert.match(source, /function AttorneyCoordinationBoard\(\{[\s\S]*onExecuteCoordination[\s\S]*onExecuteFollowUp/, 'Attorney coordination board should expose handoff and follow-up actions')
assert.match(source, /getAttorneyCoordinationOverview\(workflows\)/, 'Attorney coordination board should summarize cross-lane readiness')
assert.match(overviewBlock, /<AttorneyCoordinationBoard[\s\S]{0,700}workflows=\{legalWorkflowModels\}/, 'Overview should render the attorney coordination board from legal workflow models')
assert.match(overviewBlock, /onExecuteCoordination=\{handleWorkflowCoordinationCommand\}/, 'Coordination board should use workflow coordination commands')
assert.match(overviewBlock, /onExecuteFollowUp=\{handleWorkflowFollowUpCommand\}/, 'Coordination board should use workflow follow-up commands')
assert.match(source, /function AttorneyDailyActionQueue\(\{[\s\S]*onRequestDocuments[\s\S]*onExecuteCoordination[\s\S]*onExecuteFollowUp/, 'Attorney daily action queue should expose all workflow command handlers')
assert.match(source, /function buildAttorneyDailyActionQueueItems\(workflows = \[\]\)/, 'Attorney daily action queue should be built from workflow lane data')
assert.match(overviewBlock, /<AttorneyDailyActionQueue[\s\S]{0,900}workflows=\{legalWorkflowModels\}/, 'Overview should render the daily attorney action queue from legal workflow models')
assert.match(overviewBlock, /<AttorneyDailyActionQueue[\s\S]{0,900}onExecuteAction=\{handleWorkflowActionCommand\}/, 'Daily action queue should execute lane workflow actions')
assert.match(overviewBlock, /<AttorneyDailyActionQueue[\s\S]{0,900}onExecuteCoordination=\{handleWorkflowCoordinationCommand\}/, 'Daily action queue should execute coordination actions')
assert.match(overviewBlock, /<AttorneyDailyActionQueue[\s\S]{0,900}onExecuteFollowUp=\{handleWorkflowFollowUpCommand\}/, 'Daily action queue should execute follow-up actions')
assert.match(source, /function AttorneyStatusBriefPanel\(\{[\s\S]*onDraftBrief/, 'Attorney status brief panel should draft updates into the composer')
assert.match(source, /function buildAttorneyStatusBrief\(workflows = \[\], audience = 'professional'\)/, 'Attorney status briefs should be generated from workflow state')
assert.match(source, /const handleDraftAttorneyStatusBrief = useCallback\(\(\{[\s\S]*setDiscussionLaneKey[\s\S]*setDiscussionActionKey[\s\S]*setDiscussionVisibility[\s\S]*setDiscussionBody/, 'Attorney status brief drafts should populate the structured composer')
assert.match(overviewBlock, /<AttorneyStatusBriefPanel[\s\S]{0,500}workflows=\{legalWorkflowModels\}/, 'Overview should render attorney status briefs from legal workflow models')
assert.match(overviewBlock, /onDraftBrief=\{handleDraftAttorneyStatusBrief\}/, 'Status brief panel should use the composer draft handler')
assert.match(source, /function getWorkflowRequirementPreview\(workflow = \{\}\)/, 'Attorney unblocker board should derive requirement previews from workflow lane data')
assert.match(source, /function AttorneyRequirementsBoard\(\{[\s\S]*onRequestDocuments/, 'Attorney unblocker board should expose document request actions')
assert.match(overviewBlock, /<AttorneyRequirementsBoard[\s\S]{0,700}workflows=\{legalWorkflowModels\}/, 'Overview should render the attorney unblocker board from legal workflow models')
assert.match(overviewBlock, /<AttorneyRequirementsBoard[\s\S]{0,700}onOpenWorkflow=\{\(workflow\) => openLegalWorkflowDetail\(workflow\.detailKey\)\}/, 'Attorney unblocker board should open the matching lane detail')
assert.match(overviewBlock, /<AttorneyRequirementsBoard[\s\S]{0,700}onRequestDocuments=\{\(workflow, action\) => handleWorkflowActionCommand\(workflow\?\.lane, action\)\}/, 'Attorney unblocker board missing-document actions should use the workflow command flow')

assert.doesNotMatch(overviewBlock, /overviewPrimaryNextAction\.title/, 'Overview should not render the old Next Action card')
assert.match(overviewBlock, /const isSystemEntry = entry\.kind === 'system'/, 'System-generated updates should stay visually identified')
assert.match(overviewBlock, /const isManualEntry = entry\.kind === 'comment'/, 'Manual discussion updates should stay visually identified')
assert.match(overviewBlock, /<div key=\{entry\.id\} className="flex w-full">/, 'Conversation rows should use the full thread width')
assert.doesNotMatch(overviewBlock, /max-w-\[min\(100%,46rem\)\]/, 'Conversation cards should not be capped narrower than the thread container')
assert.match(overviewBlock, /<DiscussionComposerControls[\s\S]{0,800}structured=\{structuredDiscussionComposer\}/, 'Manual composer should use the shared action controls')
assert.match(overviewBlock, /visibilityOptions=\{effectiveDiscussionVisibilityOptions\}/, 'Manual composer should use resolved audience options')

assert.match(source, /kind: category === 'system' \? 'system' : 'event'/, 'Automated system notifications should still normalize into the conversation feed')
assert.match(source, /kind: 'comment'/, 'Manual discussion comments should still normalize into the conversation feed')
assert.doesNotMatch(source, /const prefixedDiscussion = /, 'Manual comments should no longer store update metadata as text prefixes')
assert.match(source, /if \(structuredDiscussionComposer\)[\s\S]{0,1200}addAttorneyTransactionUpdate/, 'Attorney manual updates should route through structured lane updates')
assert.match(source, /laneKey: activeDiscussionLane\.laneKey/, 'Attorney manual updates should persist against the selected lane')
assert.match(source, /updateType: discussionType/, 'Manual comments should persist update type as structured metadata')
assert.match(source, /visibilityScope: getDiscussionVisibilityScope\(discussionVisibility\)/, 'Manual comments should persist visibility as structured metadata')

console.log('transaction-overview-conversation tests passed')
