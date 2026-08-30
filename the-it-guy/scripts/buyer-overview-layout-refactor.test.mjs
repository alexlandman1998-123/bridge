import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [pipeline, workspaceRoute] = await Promise.all([
  readFile('src/pages/agency/AgencyPipelinePage.jsx', 'utf8'),
  readFile('src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx', 'utf8'),
])

for (const label of ['Buyer Qualification', 'What’s next', 'Lead Assigned To', 'Property Enquiry', 'Activity Logger', 'Viewing Planner']) {
  assert.match(pipeline, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(pipeline, /xl:grid-cols-\[minmax\(0,2fr\)_minmax\(320px,1fr\)\]/)
assert.match(pipeline, /data-testid="buyer-qualification-summary-grid"/)
assert.match(pipeline, /data-testid="buyer-overview-right-column"/)
assert.match(pipeline, /xl:grid-rows-\[minmax\(0,1\.1fr\)_minmax\(0,0\.9fr\)\]/)
assert.match(pipeline, /<Lightbulb className="h-4 w-4"/)
assert.match(pipeline, /Next action tip/)
assert.match(pipeline, /A quick call now increases your chances of converting this lead\./)
assert.match(pipeline, /data-testid="buyer-property-enquiry"/)
assert.match(pipeline, /data-testid="buyer-activity-logger"/)
assert.match(pipeline, /data-testid="simplified-viewing-planner"/)
assert.match(pipeline, /filteredOptions\.length/)
assert.match(pipeline, /canAccessWorkspaceRecord\(\s*PERMISSIONS\.assignLeads/)
assert.match(pipeline, /await reassignLead\(/)
assert.match(pipeline, /activityType: 'Lead Reassigned'/)
assert.match(pipeline, /resolveListingImageUrl\(linkedListing\)/)
assert.match(pipeline, /min-w-\[430px\].*activityQuickTypes/s)

assert.doesNotMatch(workspaceRoute, /if \(activeTab === 'overview'\) return/)
assert.match(workspaceRoute, /Suspense[\s\S]*fallback=\{<LeadWorkspaceHydrationShell search=\{location\.search\} \/>\}/)

const qualificationRowsStart = pipeline.indexOf('function buildBuyerQualificationQuestionRows')
const qualificationRowsEnd = pipeline.indexOf('\nfunction buildLeadAddressValue', qualificationRowsStart)
const qualificationRows = pipeline.slice(qualificationRowsStart, qualificationRowsEnd)
let previousIndex = -1
for (const label of ['Budget', 'Preferred areas', 'Move timeframe', 'Cash or bond', 'Subject to finance', 'Deposit available', 'Pre-approval status', 'Property to sell first', 'Property need', 'Call notes']) {
  const nextIndex = qualificationRows.indexOf(`label: '${label}'`)
  assert.ok(nextIndex > previousIndex, `${label} must retain the requested two-column row order`)
  previousIndex = nextIndex
}

const assignmentStart = pipeline.indexOf('>Lead Assigned To</p>')
const assignmentEnd = pipeline.indexOf('</section>', assignmentStart)
const assignmentPanel = pipeline.slice(assignmentStart, assignmentEnd)
assert.doesNotMatch(assignmentPanel, /mailto:|tel:|MessageCircle/, 'ownership card must not contain communication actions')
assert.doesNotMatch(assignmentPanel, /Email not available/, 'ownership card must remain focused on owner and role')

console.log('Buyer Overview layout refactor checks passed.')
