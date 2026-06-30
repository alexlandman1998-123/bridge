import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

assert.match(
  source,
  /const LISTING_FOLLOW_UP_FILTERS = \[/,
  'Phase 5 should define a canonical listing follow-up filter set.',
)

for (const label of [
  'Needs Follow-Up',
  'Active With Warning',
  'Mandate Uploads',
  'Seller FICA',
  'Photos',
  'Commission',
  'Onboarding',
]) {
  assert.match(source, new RegExp(label), `Missing oversight filter or metric: ${label}`)
}

assert.match(
  source,
  /function listingMatchesFollowUpFilter\(card = \{\}, filterKey = 'all'\)/,
  'Listing oversight should filter cards through a single matching helper.',
)

assert.match(
  source,
  /function buildListingFollowUpInsights\(cards = \[\]\)/,
  'Listing oversight should roll up counts from listing follow-up queues.',
)

assert.match(
  source,
  /Owner Hotspots/,
  'Phase 5 should show the agents carrying the most follow-up load.',
)

assert.match(
  source,
  /Follow-Up Oversight/,
  'Phase 5 should render a visible oversight strip on residential listings.',
)

assert.match(
  source,
  /setFilters\(\(previous\) => \(\{ \.\.\.previous, followUp: filter\.key \}\)\)/,
  'Oversight filters should update the listing follow-up filter state.',
)

assert.match(
  source,
  /listingMatchesFollowUpFilter\(card, followUpFilter\)/,
  'Residential listing cards should be filtered by the selected follow-up queue.',
)

assert.match(
  packageJson,
  /"test:manual-listing-oversight": "node scripts\/manual-listing-oversight\.test\.mjs"/,
  'package.json should expose the Phase 5 oversight test.',
)

console.log('manual-listing-oversight tests passed')
