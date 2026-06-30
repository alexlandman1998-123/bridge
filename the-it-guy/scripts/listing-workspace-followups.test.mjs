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
  /const followUpActions = useMemo/,
  'Listing workspace should expose a canonical follow-up action model.',
)

for (const label of [
  'Send seller onboarding',
  'Generate mandate',
  'Upload signed mandate',
  'Add seller contact',
  'Add seller ID / registration number',
  'Add seller FICA',
  'Complete seller facts',
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
  /Complete a Quick Add listing here without restarting seller onboarding\./,
  'Follow-up panel should explain the Quick Add bypass recovery path.',
)

assert.match(
  source,
  /const listingFollowUpsComplete = !followUpActions\.length \|\| followUpActions\.every\(\(action\) => action\.complete\)/,
  'Follow-up panel should disappear once every action is complete.',
)

assert.match(
  source,
  /const shouldShowListingFollowUps = sellerWorkspaceTab === 'overview' && !listingFollowUpsComplete/,
  'Follow-up panel should only appear on the seller overview tab while incomplete.',
)

assert.match(
  source,
  /\{shouldShowListingFollowUps \? \([\s\S]*Listing Follow-Ups/,
  'Follow-up panel render should be guarded by the overview/incomplete condition.',
)

assert.match(
  source,
  /handleSignedMandateUpload/,
  'Signed mandate upload should have a dedicated handler.',
)

assert.match(
  source,
  /mandateStatus: 'signed_uploaded'/,
  'Signed mandate uploads should mark the listing mandate as signed and uploaded.',
)

assert.match(
  packageJson,
  /"test:listing-workspace-followups": "node scripts\/listing-workspace-followups\.test\.mjs"/,
  'package.json should expose the listing workspace follow-up test.',
)

console.log('listing-workspace-followups tests passed')
