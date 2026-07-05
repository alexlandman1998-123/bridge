import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const listingSource = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const serviceSource = await fs.readFile(new URL('../src/services/showDayLeadCaptureService.js', import.meta.url), 'utf8')
const packageJson = await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')

assert.match(
  listingSource,
  /import Modal from '..\/components\/ui\/Modal'/,
  'Listing show-day capture should use the shared modal component.',
)

assert.match(
  listingSource,
  /captureShowDayLeadBatch/,
  'Listing show-day capture should import the batch show-day capture helper.',
)

assert.match(
  listingSource,
  /parseShowDayVisitorRows/,
  'Listing show-day capture should parse pasted show-day visitor rows before submitting.',
)

assert.match(
  listingSource,
  /DEFAULT_SHOW_DAY_NEXT_STEP/,
  'Listing show-day capture should call the canonical show-day capture service.',
)

for (const token of [
  'SHOW_DAY_OUTCOME_OPTIONS',
  'createShowDayCaptureForm',
  'ShowDayLeadCaptureModal',
  'showDayCaptureOpen',
  'showDayCaptureForm',
  'showDayCaptureSaving',
  'showDayCaptureFeedback',
  'openShowDayCaptureModal',
  'closeShowDayCaptureModal',
  'submitShowDayCapture',
  'Capture Show Day Lead',
  'Single Visitor',
  'Bulk Paste',
  'bulkVisitorText',
  'Visitor List',
  'Shared Outcome',
  'Buyer Feedback',
  'Follow-up Due',
  'Next Step',
]) {
  assert.match(listingSource, new RegExp(token), `Listing page should include ${token}.`)
}

for (const payloadKey of [
  'organisationId: listingOrganisationId',
  'listingId: listingRecord.id',
  'showDayDate: form.showDayDate',
  'showDayTime: form.showDayTime',
  'name: form.name',
  'phone: form.phone',
  'email: form.email',
  'outcome: form.outcome',
  'buyerFeedback: form.buyerFeedback',
  'followUpDueDate: form.followUpDueDate',
  'assignedAgent: listingActor',
  'visitors: bulkVisitors',
]) {
  assert.match(listingSource, new RegExp(payloadKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Capture payload should include ${payloadKey}.`)
}

assert.match(
  listingSource,
  /const isBulkCapture = form\.mode === 'bulk'/,
  'Show-day capture submit should branch on bulk mode.',
)

assert.match(
  listingSource,
  /captureShowDayLeadBatch\(\{\s*shared: sharedPayload,\s*visitors: bulkVisitors,/,
  'Bulk show-day capture should reuse the canonical batch service with shared listing context.',
)

assert.match(
  listingSource,
  /Number\(result\.processed \|\| 0\)/,
  'Bulk show-day capture should report processed row counts.',
)

assert.match(
  listingSource,
  /await Promise\.all\(\[\s*refreshInterestedLeads\(\),\s*refreshListingViewings\(\),\s*\]\)/,
  'Successful show-day capture should refresh linked leads and viewing evidence.',
)

assert.match(
  listingSource,
  /window\.dispatchEvent\(new Event\('itg:agency-crm-updated'\)\)/,
  'Successful show-day capture should notify the rest of the CRM workspace.',
)

assert.match(
  listingSource,
  /disabled=\{!listingOrganisationId \|\| !listingRecord\?\.id \|\| !isSupabaseConfigured\}/,
  'Show-day capture button should only be enabled for saved database-backed listings.',
)

assert.match(
  serviceSource,
  /export async function captureShowDayLead/,
  'Phase 3 UI should target the Phase 2 show-day capture service.',
)

assert.match(
  packageJson,
  /"test:listing-show-day-capture": "node scripts\/listing-show-day-capture\.test\.mjs"/,
  'package.json should expose the listing show-day capture test.',
)

console.log('listing show day capture tests passed')
