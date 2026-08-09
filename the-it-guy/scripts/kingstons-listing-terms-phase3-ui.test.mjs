import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const agencyPipeline = read('src/pages/agency/AgencyPipelinePage.jsx')

assert.match(
  agencyPipeline,
  /function KingstonsListingTermsSummaryCard/,
  'Phase 3 should expose a reusable Kingstons listing terms summary card.',
)
assert.match(
  agencyPipeline,
  /data-testid=\{testId\}/,
  'Listing terms summary card should keep a stable test id contract.',
)
assert.match(
  agencyPipeline,
  /kingstons-listing-terms-summary/,
  'Overview should render the Kingstons listing terms summary card.',
)
assert.match(
  agencyPipeline,
  /kingstons-documents-listing-terms-summary/,
  'Documents should render the Kingstons listing terms summary card.',
)
assert.match(
  agencyPipeline,
  /Signed OTP sends the formal instruction to the attorney/,
  'The UI should clarify that attorney selection is pre-instruction until signed OTP.',
)
assert.match(
  agencyPipeline,
  /Attorney pipeline/,
  'The summary card should show attorney pipeline visibility.',
)
assert.match(
  agencyPipeline,
  /Pending connection/,
  'Unconnected attorney nominations should be visible as captured but not routed.',
)
assert.match(
  agencyPipeline,
  /onEdit=\{openKingstonsListingTermsModal\}/,
  'Both summary surfaces should open the existing listing terms modal rather than introducing a new flow.',
)

const overviewOccurrences = agencyPipeline.match(/<KingstonsListingTermsSummaryCard[\s\S]*?onEdit=\{openKingstonsListingTermsModal\}/g) || []
assert.ok(
  overviewOccurrences.length >= 2,
  'Listing terms summary should be available from both Overview and Documents.',
)

console.log('Kingstons listing terms Phase 3 UI checks passed.')
