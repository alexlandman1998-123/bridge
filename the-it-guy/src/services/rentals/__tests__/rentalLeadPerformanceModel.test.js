import assert from 'node:assert/strict'
import { buildRentalLeadPerformanceAnalytics } from '../rentalLeadPerformanceModel.js'

const analytics = buildRentalLeadPerformanceAnalytics([
  { role: 'landlord', stage: 'listing_ready', source: 'Website' },
  { role: 'landlord', stage: 'new', source: 'website' },
  { role: 'tenant', stage: 'placement_ready', source: 'Referral' },
  { role: 'tenant', stage: 'qualified', source: '' },
])
assert.equal(analytics.total, 4)
assert.equal(analytics.outcomes.listingReady, 1)
assert.equal(analytics.outcomes.placementReady, 1)
assert.equal(analytics.outcomes.rate, 50)
assert.equal(analytics.sources[0].key, 'website')
assert.equal(analytics.sources[0].total, 2)
assert.equal(analytics.sources.find((source) => source.key === 'referral').outcomeRate, 100)
assert.equal(analytics.sources.find((source) => source.key === 'manual').total, 1)
console.log('rentalLeadPerformanceModel.test.js passed')
