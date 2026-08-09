import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const agencyPipeline = read('src/pages/agency/AgencyPipelinePage.jsx')

assert.match(
  agencyPipeline,
  /KINGSTONS_LISTING_TERMS_EXCEPTION_THRESHOLDS/,
  'Phase 6 should define Kingstons-specific exception thresholds.',
)
assert.match(
  agencyPipeline,
  /function buildKingstonsListingTermsExceptionReport/,
  'Phase 6 should build a lightweight exception report model for Listing Terms and attorney pipeline states.',
)
assert.match(
  agencyPipeline,
  /kingstons-listing-terms-exception-report/,
  'Phase 6 should render a Kingstons-only exception report card in the seller workspace.',
)
assert.match(
  agencyPipeline,
  /Seller Pack to List Property watch/,
  'The exception report should explain the Seller Pack to List Property watch scope.',
)
assert.match(
  agencyPipeline,
  /listing_terms_stale/,
  'The report should flag seller leads waiting on Listing Terms after Seller Pack.',
)
assert.match(
  agencyPipeline,
  /list_property_stale/,
  'The report should flag seller leads where Listing Terms are complete but the listing is not created.',
)
assert.match(
  agencyPipeline,
  /attorney_pipeline_exception/,
  'The report should flag connected transfer attorneys that are not visible in the attorney pipeline.',
)
assert.match(
  agencyPipeline,
  /selectedKingstonsListingTermsExceptionReport/,
  'The selected Kingstons seller lead should compute an exception report from live workspace state.',
)
assert.match(
  agencyPipeline,
  /onCreateListing=\{\(\) => void handleCreateListingFromSellerLead\(\)\}/,
  'The report should reuse the existing listing creation handler instead of adding new architecture.',
)
assert.match(
  agencyPipeline,
  /onRetryPipelineSync=\{handleRetryKingstonsAttorneyPipelineSync\}/,
  'The report should reuse the existing Phase 5 attorney pipeline repair handler.',
)

console.log('Kingstons listing terms Phase 6 exception report checks passed.')
