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

assert.doesNotMatch(overviewBlock, /overviewPrimaryNextAction\.title/, 'Overview should not render the old Next Action card')
assert.match(overviewBlock, /const isSystemEntry = entry\.kind === 'system'/, 'System-generated updates should stay visually identified')
assert.match(overviewBlock, /const isManualEntry = entry\.kind === 'comment'/, 'Manual discussion updates should stay visually identified')
assert.match(overviewBlock, /<div key=\{entry\.id\} className="flex w-full">/, 'Conversation rows should use the full thread width')
assert.doesNotMatch(overviewBlock, /max-w-\[min\(100%,46rem\)\]/, 'Conversation cards should not be capped narrower than the thread container')
assert.match(overviewBlock, /Update Type[\s\S]{0,300}<Field as="select" value=\{discussionType\}/, 'Manual composer should keep update type selection')
assert.match(overviewBlock, /Visibility[\s\S]{0,300}<Field as="select" value=\{discussionVisibility\}/, 'Manual composer should keep visibility selection')

assert.match(source, /kind: category === 'system' \? 'system' : 'event'/, 'Automated system notifications should still normalize into the conversation feed')
assert.match(source, /kind: 'comment'/, 'Manual discussion comments should still normalize into the conversation feed')
assert.match(source, /const prefixedDiscussion = `\[\$\{discussionType\}\] \[\$\{discussionVisibility\}\]/, 'Manual comments should still persist update type and visibility metadata')

console.log('transaction-overview-conversation tests passed')
