import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateDevelopmentListingPerformance } from '../developmentListingPerformance.js'

const now = new Date('2026-10-09T12:00:00Z')
const listings = [
  { id: 'a', organisationId: 'agency-a', marketStartDate: '2026-10-01T12:00:00Z' },
  { id: 'b', organisationId: 'agency-a', marketStartDate: '2026-10-05T12:00:00Z' },
  { id: 'c', organisationId: 'agency-b' },
]
const metric = (value, complete = true) => ({ value, available: true, complete, coveredDays: complete ? 30 : 7 })

test('combines channel counts across listings and keeps incomplete coverage partial', () => {
  const result = aggregateDevelopmentListingPerformance({ listings, now, snapshots: [
    { data: { property24: { published: true, metrics: { views: metric(100), alerts: metric(20) } } } },
    { data: { property24: { published: true, metrics: { views: metric(18, false), alerts: metric(4, false) } } } },
    { data: null },
  ] })
  assert.equal(result.property24.metrics.views.value, 118)
  assert.equal(result.property24.metrics.alerts.value, 24)
  assert.equal(result.property24.metrics.views.complete, false)
  assert.equal(result.property24.metrics.views.coveredDays, 37)
  assert.equal(result.property24.metrics.views.expectedDays, 90)
  assert.equal(result.privateProperty.metrics.views.available, false)
  assert.equal(result.privateProperty.metrics.views.value, null)
  assert.equal(result.averageDaysOnMarket, 6)
  assert.equal(result.datedListingCount, 2)
  assert.equal(result.unavailableListingCount, 1)
})

test('counts a lead once across units, keeps organisations separate and excludes cancelled or archived viewings', () => {
  const result = aggregateDevelopmentListingPerformance({ listings, now, leadBatches: [
    { organisationId: 'agency-a', rows: [
      { lead_id: 'buyer', contact_id: 'contact', created_at: '2026-10-05' },
      { lead_id: 'buyer', created_at: '2026-10-07' },
      { contact_id: 'contact', created_at: '2026-10-06' },
    ] },
    { organisationId: 'agency-b', rows: [{ lead_id: 'buyer', created_at: '2026-09-01' }] },
  ], viewingBatches: [
    { organisationId: 'agency-a', rows: [
      { appointment_id: 'one', appointment_type: 'Viewing', status: 'confirmed', date_time: '2026-10-10T12:00:00Z' },
      { appointment_id: 'one', appointment_type: 'Viewing', status: 'confirmed', date_time: '2026-10-10T12:00:00Z' },
      { appointment_id: 'two', appointment_type: 'Viewing', status: 'completed' },
      { appointment_id: 'three', appointment_type: 'Viewing', status: 'Cancelled' },
      { appointment_id: 'four', appointment_type: 'Viewing', status: 'confirmed', archived_at: '2026-10-08' },
      { appointment_id: 'five', appointment_type: 'Meeting', status: 'confirmed' },
    ] }, { organisationId: 'agency-b', rows: [] },
  ] })
  assert.equal(result.leadCount, 2)
  assert.equal(result.newThisWeek, 1)
  assert.equal(result.leadsComplete, true)
  assert.equal(result.viewingCount, 2)
  assert.equal(result.upcomingViewings, 1)
})

test('distinguishes inaccessible counts from a verified zero and excludes duplicate listing references', () => {
  const result = aggregateDevelopmentListingPerformance({ listings: [listings[0], listings[0]], now, leadBatches: [{ organisationId: 'agency-a', rows: [], error: true }], viewingBatches: [{ organisationId: 'agency-a', rows: [] }] })
  assert.equal(result.listingCount, 1)
  assert.equal(result.leadsAvailable, false)
  assert.equal(result.leadsComplete, false)
  assert.equal(result.viewingsAvailable, true)
  assert.equal(result.viewingCount, 0)
  const empty = aggregateDevelopmentListingPerformance({ now })
  assert.equal(empty.leadsAvailable, true)
  assert.equal(empty.averageDaysOnMarket, null)
})
