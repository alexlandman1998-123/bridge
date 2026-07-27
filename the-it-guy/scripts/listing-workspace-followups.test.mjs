import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const listingsSource = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

assert.match(
  source,
  /sendSellerOnboarding/,
  'Listing workspace follow-ups should create seller onboarding links from the detail page.',
)

assert.match(
  source,
  /uploadPrivateListingDocument/,
  'Listing workspace follow-ups should upload signed mandate documents through the listing document service.',
)

assert.match(
  source,
  /Manual intervention actions/,
  'Listing workspace should expose manual intervention actions for skipped Quick Add work.',
)

for (const label of [
  'Send Seller Onboarding',
  'Create Mandate',
  'Upload signed mandate',
  'Add seller contact',
  'Add seller ID / registration number',
  'Add seller FICA',
  'Confirm commission',
  'Add photos',
  'Add external listing link',
]) {
  assert.match(source, new RegExp(label), `Missing follow-up action: ${label}`)
}

for (const label of [
  'Send seller onboarding',
  'Upload signed mandate',
  'Add seller ID / registration number',
  'Add seller FICA',
  'Confirm commission',
  'Add photos',
  'Add external listing link',
]) {
  assert.match(listingsSource, new RegExp(label), `Missing listing-card follow-up preview: ${label}`)
}

assert.match(
  listingsSource,
  /function buildListingFollowUpQueue\(card = \{\}\)/,
  'Listing grid should derive a canonical follow-up preview for each card.',
)

assert.match(
  listingsSource,
  /card\.followUpQueue\.slice\(0, 3\)/,
  'Listing cards should show a compact queue preview instead of hiding all skipped work.',
)

assert.match(
  source,
  /priorityLabel/,
  'Listing workspace follow-ups should carry priority metadata.',
)

assert.match(
  source,
  /Complete skipped Quick Add fields without restarting seller onboarding\./,
  'Manual intervention panel should explain the Quick Add bypass recovery path.',
)

assert.match(
  source,
  /sellerProfile\.completionPercent >= 90/,
  'Manual intervention panel should show completion state from seller profile readiness.',
)

assert.match(
  source,
  /sellerWorkspaceTab === 'seller'/,
  'Manual intervention panel should live in the seller workspace tab.',
)

assert.match(
  source,
  /sellerProfile\.sections\.map/,
  'Seller profile sections should provide the editable detail follow-up surface.',
)

assert.match(
  source,
  /handleSellerDocumentUpload/,
  'Seller document uploads should use the shared seller document centre handler.',
)

assert.match(
  source,
  /uploadPrivateListingDocument\(listingRecord\.id, file/,
  'Seller document uploads should persist through the private listing document service.',
)

assert.match(
  packageJson,
  /"test:listing-workspace-followups": "node scripts\/listing-workspace-followups\.test\.mjs"/,
  'package.json should expose the listing workspace follow-up test.',
)

console.log('listing-workspace-followups tests passed')
