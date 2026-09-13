import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260913073857_website_first_party_analytics_phase3.sql', import.meta.url), 'utf8')
const tracker = await readFile(new URL('../../apps/websites/components/site-analytics.tsx', import.meta.url), 'utf8')
const route = await readFile(new URL('../../apps/websites/app/api/analytics/route.ts', import.meta.url), 'utf8')
const property = await readFile(new URL('../../apps/websites/app/properties/[slug]/page.tsx', import.meta.url), 'utf8')

for (const marker of ['website_analytics_daily', "'site_visit', 'page_view', 'listing_view'", 'website_record_analytics_event', 'website_dashboard_analytics', 'bridge_has_organisation_membership', 'revoke all on table public.website_analytics_daily']) assert.ok(migration.includes(marker), `Phase 3 migration should include ${marker}.`)
for (const forbidden of ['request_fingerprint', 'user_agent']) assert.ok(!migration.includes(forbidden), `Aggregate analytics must not store ${forbidden}.`)
for (const marker of ['navigator.doNotTrack', "record('site_visit')", "record('page_view')", "record('listing_view'", "fetch('/api/analytics'"]) assert.ok(tracker.includes(marker), `Tracker should include ${marker}.`)
for (const marker of ['sameOrigin', 'website_record_analytics_event', 'status: 204']) assert.ok(route.includes(marker), `Analytics endpoint should include ${marker}.`)
assert.ok(property.includes('ListingAnalyticsTracker'), 'Property pages should record published listing views.')

console.log('website analytics phase 3 checks passed')
