import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildListingOverviewPerformance,
  normalizeListingOverviewAnalytics,
} from '../src/services/listings/listingOverviewPerformanceService.js'

const analytics = normalizeListingOverviewAnalytics({
  windowDays: 30,
  property24: { connected: true, available: true, views: 120, previousViews: 100, portalContacts: 9 },
  privateProperty: { connected: true, available: false, reason: 'No supported statistics feed.' },
  website: { connected: true, available: true, views: 30, previousViews: 20 },
})

const performance = buildListingOverviewPerformance({
  analytics,
  now: new Date('2026-09-24T12:00:00.000Z'),
  leads: [
    { id: 'lead-1', createdAt: '2026-09-23T10:00:00.000Z' },
    { id: 'lead-1', createdAt: '2026-09-23T10:00:00.000Z', updatedAt: '2026-09-24T09:00:00.000Z' },
    { id: 'lead-2', createdAt: '2026-09-01T10:00:00.000Z' },
  ],
  viewings: [
    { id: 'viewing-1', status: 'confirmed', buyerLeadId: 'lead-1' },
    { id: 'viewing-2', status: 'completed', buyerLeadId: 'lead-2' },
    { id: 'viewing-3', status: 'cancelled', buyerLeadId: 'lead-2' },
  ],
  daysOnMarket: 14,
  marketStartDate: '2026-09-10',
})

assert.equal(performance.totalViews, 150)
assert.equal(performance.priorViews, 120)
assert.equal(performance.viewChangePercent, 25)
assert.equal(performance.partialViews, true)
assert.equal(performance.leadCount, 2, 'duplicate representations of one canonical lead must count once')
assert.equal(performance.newThisWeek, 1)
assert.equal(performance.scheduledViewings, 2)
assert.equal(performance.completedViewings, 1)
assert.equal(performance.upcomingViewings, 1)
assert.equal(performance.viewingConversionRate, 100)
assert.equal(performance.daysOnMarket, 14)

const unavailable = buildListingOverviewPerformance({
  analytics: {},
  leads: [],
  viewings: [],
})
assert.equal(unavailable.totalViews, null, 'missing analytics must not be presented as zero views')
assert.equal(unavailable.viewsAvailable, false)

const migration = await readFile(new URL('../../supabase/migrations/20260924134207_listing_overview_performance.sql', import.meta.url), 'utf8')
assert.match(migration, /bridge_is_active_member\(p_organisation_id\)/)
assert.match(migration, /listing\.organisation_id = p_organisation_id/)
assert.match(migration, /analytics\.listing_id = p_listing_id/)
assert.match(migration, /'privateProperty'.*?'available', false/s)
assert.match(migration, /revoke all on function public\.listing_overview_performance.*from anon/i)
assert.match(migration, /grant execute on function public\.listing_overview_performance.*to authenticated/i)

console.log('Listing overview Phase 1 contract passed')
