import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const agencyPipeline = read('src/pages/agency/AgencyPipelinePage.jsx')
const allocationService = read('src/services/privateListingAttorneyAllocationService.js')

assert.match(
  allocationService,
  /export async function getPrivateListingTransferAttorneyAllocation/,
  'Phase 4 should reuse the existing private listing transfer attorney allocation reader.',
)
assert.match(
  agencyPipeline,
  /getPrivateListingTransferAttorneyAllocation/,
  'Kingstons workspace should hydrate attorney pipeline verification from the allocation reader.',
)
assert.match(
  agencyPipeline,
  /kingstonsAttorneyPipelineAllocationState/,
  'Kingstons workspace should keep a scoped allocation verification state.',
)
assert.match(
  agencyPipeline,
  /function buildKingstonsAttorneyPipelineVerification/,
  'Phase 4 should map raw allocation rows into agent-facing verification states.',
)
assert.match(
  agencyPipeline,
  /Verified in attorney pipeline/,
  'Connected awaiting-buyer allocations should render as verified in the attorney pipeline.',
)
assert.match(
  agencyPipeline,
  /Not visible in pipeline/,
  'A nominated connected attorney without an allocation should surface as a verification warning.',
)
assert.match(
  agencyPipeline,
  /Create the listing to add a connected attorney to the pre-instruction pipeline/,
  'Before listing creation, the UI should explain why the attorney pipeline is not populated yet.',
)
assert.match(
  agencyPipeline,
  /Signed OTP still sends the formal instruction/,
  'Phase 4 must preserve the signed-OTP attorney instruction boundary in the verification copy.',
)

const summaryCardUsages = agencyPipeline.match(/pipelineVerification=\{selectedKingstonsAttorneyPipelineVerification\}/g) || []
assert.ok(
  summaryCardUsages.length >= 2,
  'Both Overview and Documents listing terms summaries should use the live pipeline verification model.',
)

console.log('Kingstons listing terms Phase 4 attorney pipeline verification checks passed.')
