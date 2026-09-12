import assert from 'node:assert/strict'
import {
  assertMarketingEventPublicationReadiness,
  getMarketingEventReadiness,
  isPublicMarketingEventStatus,
} from '../src/services/marketingEventReadinessService.js'

const draftShowDay = { title: 'Open home', status: 'Draft' }
assert.equal(getMarketingEventReadiness(draftShowDay, 'showDays').ready, false)
assert.doesNotThrow(() => assertMarketingEventPublicationReadiness(draftShowDay, 'showDays'))

const publishableShowDay = {
  title: 'Open home', status: 'Upcoming', listingId: 'listing-1', address: '20 Example Street', startDate: '2026-10-01', startTime: '10:00',
}
assert.equal(getMarketingEventReadiness(publishableShowDay, 'showDays').ready, true)
assert.doesNotThrow(() => assertMarketingEventPublicationReadiness(publishableShowDay, 'showDays'))

assert.throws(() => assertMarketingEventPublicationReadiness({ ...publishableShowDay, listingId: '' }, 'showDays'), /linked listing/i)
assert.throws(() => assertMarketingEventPublicationReadiness({ title: 'Preview', status: 'Planning', development: '', location: 'Sandton', startDate: '2026-10-01', startTime: '18:00' }, 'launches'), /linked development/i)
assert.equal(isPublicMarketingEventStatus('Planning'), true)
assert.equal(isPublicMarketingEventStatus('Draft'), false)

console.log('marketing event readiness phase 5 checks passed')
