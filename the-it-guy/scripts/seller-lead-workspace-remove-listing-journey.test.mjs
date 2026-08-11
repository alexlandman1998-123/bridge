import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const sellerTabSetMatch = source.match(/const SELLER_LEAD_WORKSPACE_TAB_KEYS = new Set\(\[([^\]]+)\]\)/)
assert.ok(sellerTabSetMatch, 'Seller lead workspace tab key set should be defined.')
assert.ok(!sellerTabSetMatch[1].includes('listing_journey'), 'Seller lead workspace should not register listing_journey as a tab.')

assert.ok(source.includes("if (normalized === 'listing_journey') return 'overview'"), 'Legacy listing_journey route requests should resolve back to overview.')

for (const removedMarker of [
  "leadWorkspaceTab === 'listing_journey'",
  'Listing Journey',
  'listing-journey-card',
  'Seller Flow',
]) {
  assert.ok(!source.includes(removedMarker), `Seller lead workspace should not render ${removedMarker}.`)
}

console.log('Seller lead workspace listing journey removal verified.')
