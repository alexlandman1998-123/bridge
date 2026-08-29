import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [pipeline, workspaceRoute] = await Promise.all([
  readFile('src/pages/agency/AgencyPipelinePage.jsx', 'utf8'),
  readFile('src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx', 'utf8'),
])

for (const label of ['Buyer Qualification', 'What’s next', 'Lead Assigned To', 'Property Enquiry', 'Activity Logger', 'Viewing Planner']) {
  assert.match(pipeline, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(pipeline, /xl:grid-cols-\[minmax\(0,0\.65fr\)_minmax\(320px,0\.35fr\)\]/)
assert.match(pipeline, /data-testid="buyer-property-enquiry"/)
assert.match(pipeline, /data-testid="buyer-activity-logger"/)
assert.match(pipeline, /data-testid="simplified-viewing-planner"/)
assert.match(pipeline, /filteredLeadAssignmentOptions\.length/)
assert.match(pipeline, /canAccessWorkspaceRecord\(\s*PERMISSIONS\.assignLeads/)
assert.match(pipeline, /await reassignLead\(/)
assert.match(pipeline, /activityType: 'Lead Reassigned'/)
assert.match(pipeline, /resolveListingImageUrl\(linkedListing\)/)
assert.match(pipeline, /min-w-\[430px\].*activityQuickTypes/s)

assert.doesNotMatch(workspaceRoute, /if \(activeTab === 'overview'\) return/)
assert.match(workspaceRoute, /Suspense fallback=\{<AgencyLeadWorkspaceShellPage/)

console.log('Buyer Overview layout refactor checks passed.')
