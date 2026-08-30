import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260830093001_listing_job_operations.sql', import.meta.url),
  'utf8',
)
const worker = await readFile(new URL('../supabase/functions/listing-job-runner/index.ts', import.meta.url), 'utf8')
const service = await readFile(
  new URL('../the-it-guy/src/services/listings/listingBackgroundJobs.js', import.meta.url),
  'utf8',
)

assert.match(migration, /create table if not exists public\.listing_background_job_events/)
assert.match(migration, /enable row level security/)
assert.match(migration, /listing_background_job_events_select_visible_listing/)
assert.match(migration, /security definer/)
assert.match(migration, /revoke all on function private\.record_listing_job_event_v1\(\) from public, anon, authenticated/)
assert.doesNotMatch(migration, /function public\.[^(]+\([^)]*\)[\s\S]{0,120}security definer/i)
assert.match(migration, /pg_advisory_xact_lock/)
assert.match(migration, />= 500/)
assert.match(migration, /errcode = '53300'/)
assert.match(migration, /bridge_listing_job_health_v1/)
assert.match(migration, /expiredLeases/)
assert.match(migration, /oldestReadyAgeSeconds/)
assert.match(worker, /durationMs/)
assert.match(worker, /manualReview/)
assert.match(service, /evaluateListingJobHealth/)
assert.match(service, /bridge_listing_job_health_v1/)
assert.match(service, /listing_background_job_events/)

console.log('listing job operations tests passed')
