import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
const [service, marketing, listing] = await Promise.all([
  readFile(new URL('../src/services/marketingOverviewService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/marketing/MarketingDashboard.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
])
assert.doesNotMatch(service, /getProperty24ListingPerformance|normalizeProperty24ListingPerformance|property24_listing_performance/)
assert.doesNotMatch(marketing, /Property24ListingPerformance/)
assert.equal(existsSync(new URL('../src/components/marketing/Property24ListingPerformance.jsx', import.meta.url)), false)
assert.match(listing, /<ListingChannelStatistics\s+organisationId=\{listingOrganisationId\}\s+listingId=\{listingId\}/)
console.log('Legacy Property24 listing rankings are retired; listing cards use the scoped channel reader.')
