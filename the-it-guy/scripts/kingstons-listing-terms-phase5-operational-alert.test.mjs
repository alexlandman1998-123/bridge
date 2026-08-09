import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const agencyPipeline = read('src/pages/agency/AgencyPipelinePage.jsx')

assert.match(
  agencyPipeline,
  /kingstons-attorney-pipeline-alert/,
  'Phase 5 should render an operational alert when attorney pipeline verification needs attention.',
)
assert.match(
  agencyPipeline,
  /Attorney pipeline needs attention/,
  'The Listing Terms card should use clear agent-facing alert copy.',
)
assert.match(
  agencyPipeline,
  /Retry pipeline sync/,
  'Agents should be able to retry the existing attorney pipeline allocation flow from the alert.',
)
assert.match(
  agencyPipeline,
  /function handleRetryKingstonsAttorneyPipelineSync/,
  'Phase 5 should expose a scoped retry handler for Kingstons attorney pipeline repair.',
)
assert.match(
  agencyPipeline,
  /syncKingstonsTransferAttorneyPreInstruction\(\s*listingId,\s*selectedLead,\s*selectedKingstonsListingTerms/,
  'The retry handler should reuse the existing pre-instruction sync path.',
)
assert.match(
  agencyPipeline,
  /Transfer attorney pipeline sync repaired/,
  'Successful retry should confirm that the attorney is now awaiting buyer.',
)

const retryProps = agencyPipeline.match(/onRetryPipelineSync=\{handleRetryKingstonsAttorneyPipelineSync\}/g) || []
assert.ok(
  retryProps.length >= 2,
  'Both Overview and Documents Listing Terms summaries should expose the repair action.',
)

const syncingProps = agencyPipeline.match(/retryingPipelineSync=\{kingstonsAttorneyPipelineSyncing\}/g) || []
assert.ok(
  syncingProps.length >= 2,
  'Both Listing Terms summaries should display retry progress.',
)

console.log('Kingstons listing terms Phase 5 operational alert checks passed.')
