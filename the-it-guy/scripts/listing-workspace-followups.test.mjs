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
  /function FollowUpActionCard\(\{ action, loading = false, onAction, onUpload \}\)/,
  'Listing workspace should expose a reusable follow-up action card.',
)

assert.match(
  listingsSource,
  /function buildListingFollowUpQueue\(card = \{\}\)/,
  'Listing grid should keep deriving follow-up data for handoff/search logic.',
)

assert.doesNotMatch(
  listingsSource,
  /Listing follow-ups/,
  'Listing grid cards should no longer render the follow-up preview block.',
)

assert.match(
  source,
  /priorityLabel/,
  'Listing workspace follow-ups should carry priority metadata.',
)

assert.match(
  source,
  /followUpActionId/,
  'Listing workspace should track long-running follow-up/action state.',
)

assert.match(
  source,
  /uploadPrivateListingDocument/,
  'Signed mandate uploads should flow through the listing document upload service.',
)

assert.match(
  source,
  /'signed_uploaded'/,
  'Signed mandate states should be recognized when computing listing mandate readiness.',
)

assert.match(
  packageJson,
  /"test:listing-workspace-followups": "node scripts\/listing-workspace-followups\.test\.mjs"/,
  'package.json should expose the listing workspace follow-up test.',
)

console.log('listing-workspace-followups tests passed')
