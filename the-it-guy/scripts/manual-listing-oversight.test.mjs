import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

for (const removedPattern of [
  /const LISTING_FOLLOW_UP_FILTERS = \[/,
  /function listingMatchesFollowUpFilter\(card = \{\}, filterKey = 'all'\)/,
  /function buildListingFollowUpInsights\(cards = \[\]\)/,
  /Owner Hotspots/,
  /Follow-Up Oversight/,
  /Copy Chase List/,
  /followUp: 'all'/,
  /listingMatchesFollowUpFilter\(card, followUpFilter\)/,
]) {
  assert.doesNotMatch(source, removedPattern, `Listing page should no longer render or power the oversight panel: ${removedPattern}`)
}

assert.match(
  source,
  /residentialListingCards\.length/,
  'Residential listing cards should render directly without a follow-up oversight filter.',
)

assert.match(
  source,
  /residentialListingCards\.map\(\(card\) =>/,
  'Residential listing cards should map the unfiltered residential card list.',
)

assert.match(
  source,
  /Quick Add handoff/,
  'Listing cards should still show their focused Quick Add handoff hint.',
)

assert.match(
  packageJson,
  /"test:manual-listing-oversight": "node scripts\/manual-listing-oversight\.test\.mjs"/,
  'package.json should expose the Phase 5 oversight test.',
)

console.log('manual-listing-oversight removal tests passed')
