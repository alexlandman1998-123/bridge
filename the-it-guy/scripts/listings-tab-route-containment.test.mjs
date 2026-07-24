import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const listingsSource = await fs.readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.match(
  appSource,
  /path="\/listings\/:listingSection\?"/,
  'Listings tabs should share a single route so tab clicks do not remount the Listings page.',
)
assert.doesNotMatch(
  appSource,
  /path="\/listings\/developments"[\s\S]*?<AgentListings\s+initialTab="developments"/,
  'Developments must not be a separate AgentListings route because that reloads the full Listings screen on tab click.',
)
assert.match(
  listingsSource,
  /const nextTab = pathIsDevelopments \? 'developments' : 'residential'/,
  'AgentListings should sync both Listings tab states from the URL for direct links and browser navigation.',
)
assert.match(
  listingsSource,
  /navigate\('\/listings\/developments'\)/,
  'The Developments tab should keep the deep-link URL while staying within the shared route element.',
)

console.log('listings tab route containment tests passed')
