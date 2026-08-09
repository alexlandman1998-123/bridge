import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const agencyPipeline = read('src/pages/agency/AgencyPipelinePage.jsx')

assert.match(
  agencyPipeline,
  /function buildKingstonsPrincipalListingTermsExceptionReport/,
  'Phase 7 should aggregate Kingstons Listing Terms exceptions for principals.',
)
assert.match(
  agencyPipeline,
  /kingstons-principal-exception-report/,
  'Phase 7 should render a principal-level Kingstons exception report card.',
)
assert.match(
  agencyPipeline,
  /Principal exception report/,
  'The principal report should use clear reporting copy.',
)
assert.match(
  agencyPipeline,
  /Seller Pack, Listing Terms, List Property, and transfer-attorney visibility/,
  'The aggregate report should cover the Kingstons Seller Pack to attorney visibility workflow.',
)
assert.match(
  agencyPipeline,
  /kingstonsPrincipalExceptionReport/,
  'The page should compute a Kingstons principal exception report from loaded CRM state.',
)
assert.match(
  agencyPipeline,
  /function openKingstonsPrincipalExceptionLead/,
  'Principals should be able to open the affected seller lead from the exception report.',
)
assert.match(
  agencyPipeline,
  /onOpenLead=\{openKingstonsPrincipalExceptionLead\}/,
  'The principal exception card should wire rows to the existing lead workspace route.',
)
assert.match(
  agencyPipeline,
  /buildKingstonsListingTermsExceptionReport/,
  'The aggregate report should reuse the Phase 6 single-lead exception model.',
)
assert.match(
  agencyPipeline,
  /resolveLeadLinkedListing/,
  'The aggregate report should reuse existing linked listing resolution instead of creating new backend plumbing.',
)

console.log('Kingstons listing terms Phase 7 principal reporting checks passed.')
