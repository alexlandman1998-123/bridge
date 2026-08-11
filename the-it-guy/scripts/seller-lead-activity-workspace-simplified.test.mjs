import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const activitySource = await readFile(new URL('../src/components/lead-activity/LeadActivityWorkspace.jsx', import.meta.url), 'utf8')

const activityTabStart = pipelineSource.indexOf("leadWorkspaceTab === 'activity' ? (")
assert.notEqual(activityTabStart, -1, 'Lead Activity workspace block should exist.')

const legacyComposerStart = pipelineSource.indexOf('showLegacyActivityComposer', activityTabStart)
assert.notEqual(legacyComposerStart, -1, 'Activity workspace should be followed by the legacy composer marker.')

const activityWorkspaceBlock = pipelineSource.slice(activityTabStart, legacyComposerStart)

assert.ok(activityWorkspaceBlock.includes('<LeadActivityWorkspace'), 'Activity tab should render the shared activity workspace.')
assert.ok(activityWorkspaceBlock.includes('showHeader={false}'), 'Activity tab should remove the top Activity summary container.')
assert.ok(activityWorkspaceBlock.includes('showSidebar={false}'), 'Activity tab should use the full-width activity feed.')
assert.ok(!pipelineSource.includes("!selectedLeadIsSeller && leadWorkspaceTab === 'activity' ? 'xl:grid-cols-[minmax(0,1fr)_360px]"), 'Activity tab should not reserve an outer right-hand column.')

for (const removedPanel of [
  'Relationship Health',
  'Next Best Action',
  'Open Actions',
  'Quick Actions',
  'Communication Snapshot',
]) {
  assert.ok(!activityWorkspaceBlock.includes(removedPanel), `Activity workspace should not render the removed panel: ${removedPanel}.`)
}

assert.ok(activitySource.includes('showHeader = true'), 'Activity workspace should support toggling the header container.')
assert.ok(activitySource.includes('showSidebar = true'), 'Activity workspace should support toggling the sidebar.')
assert.ok(activitySource.includes('{showHeader ? ('), 'Activity header should be conditional.')
assert.ok(activitySource.includes('{showSidebar ? ('), 'Activity sidebar should be conditional.')
assert.ok(activitySource.includes("className={`grid min-h-0 ${showSidebar ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}"), 'Activity feed should stretch full width when the sidebar is hidden.')

console.log('Seller lead activity workspace simplified layout verified.')
