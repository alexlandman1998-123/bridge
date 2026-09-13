import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildProperty24ListingStatisticsSnapshot,
  normalizeProperty24ListingStatistics,
} from '../server/property24/index.js'

const statistic = normalizeProperty24ListingStatistics({
  listingNumber: 12345678,
  agencyId: 123,
  date: '2026-09-13',
  viewCount: 80,
  alertCount: 5,
  telLeads: 4,
  smsLeads: 1,
  requestDetailsLeads: 12,
  whatsAppLeads: 7,
  totalLeads: 24,
  totalContactLeads: 24,
  price: 18500,
})

const snapshot = buildProperty24ListingStatisticsSnapshot({
  organisationId: '22222222-2222-4222-8222-222222222222',
  privateListingId: '11111111-1111-4111-8111-111111111111',
  statistic,
  syncedAt: '2026-09-13T06:15:00.000Z',
})

assert.equal(snapshot.listing_contact_form_leads, 12)
assert.equal(snapshot.whatsapp_contact_form_leads, 7)
assert.equal(snapshot.total_contact_leads, 24)
assert.equal(snapshot.source_api_version, 'v55')
assert.equal(snapshot.synced_at, '2026-09-13T06:15:00.000Z')
assert.equal(Object.hasOwn(snapshot, 'raw'), false)
assert.throws(() => buildProperty24ListingStatisticsSnapshot({ organisationId: snapshot.organisation_id, statistic: { ...statistic, listingNumber: null } }), /listingNumber/)

const migrations = fs.readdirSync(new URL('../../supabase/migrations', import.meta.url), 'utf8')
const migrationName = migrations.find((name) => name.endsWith('_property24_statistics_analytics_foundation.sql'))
assert.ok(migrationName, 'Property24 statistics foundation migration should exist')
const migration = fs.readFileSync(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), 'utf8')
assert.match(migration, /create table public\.property24_listing_statistics_daily/)
assert.match(migration, /create table public\.property24_statistics_sync_runs/)
assert.match(migration, /unique \(organisation_id, environment, agency_id, listing_number, statistic_date\)/)
assert.match(migration, /enable row level security/)
assert.match(migration, /bridge_is_active_member\(organisation_id\)/)
assert.match(migration, /grant select on public\.property24_listing_statistics_daily to authenticated/)
assert.doesNotMatch(migration, /raw_payload/)

console.log('Property24 statistics storage foundation passed')
