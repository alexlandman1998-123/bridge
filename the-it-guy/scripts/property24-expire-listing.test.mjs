import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getProperty24ListingStatusOptions } from '../src/pages/settings/property24SettingsModel.js'

const [listingPage, api] = await Promise.all([
  readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../server/property24/api.js', import.meta.url), 'utf8'),
])
assert.ok(getProperty24ListingStatusOptions('sale').includes('Expired'))
assert.ok(getProperty24ListingStatusOptions('rental').includes('Expired'))
assert.match(listingPage, /async function expireProperty24Listing/)
assert.match(listingPage, /Expire listing/)
assert.match(listingPage, /status: 'Expired'/)
assert.match(listingPage, /Expire this listing on Property24\?/) 
assert.match(listingPage, /<details className="relative open:z-40">/)
assert.match(listingPage, /id="listing-distribution-channels" className="overflow-visible/)
assert.match(api, /expired: 'Expired'/)
console.log('Property24 expire listing action contract passed.')
