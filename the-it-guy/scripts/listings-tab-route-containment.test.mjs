import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const listingsSource = await fs.readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.match(
  appSource,
  /path="\/listings\/:listingSection\?"/,
  'Listings tabs should share a single route so tab clicks do not remount the Listings page.',
)
assert.match(
  appSource,
  /all\|residential\|commercial\|developments[\s\S]*?return 'listings-index'/,
  'Category URLs must share the app shell content key to preserve the mounted index and its data.',
)
assert.doesNotMatch(
  appSource,
  /path="\/listings\/developments"[\s\S]*?<AgentListings\s+initialTab="developments"/,
  'Developments must not be a separate AgentListings route because that reloads the full Listings screen on tab click.',
)
assert.match(
  listingsSource,
  /const nextTab = resolveListingIndexTab\(location\.pathname, location\.search\)/,
  'AgentListings should sync all category states from the URL for direct links and browser navigation.',
)
assert.match(
  listingsSource,
  /nextTab === 'all' \? '\/listings' : `\/listings\/\$\{nextTab\}`/,
  'The Developments tab should keep the deep-link URL while staying within the shared route element.',
)

console.log('listings tab route containment tests passed')
