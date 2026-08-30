import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260830093007_listing_job_operational_controls.sql', import.meta.url),
  'utf8',
)
const worker = await readFile(new URL('../supabase/functions/listing-job-runner/index.ts', import.meta.url), 'utf8')
const service = await readFile(
  new URL('../the-it-guy/src/services/listings/listingBackgroundJobs.js', import.meta.url),
  'utf8',
)
const activation = JSON.parse(await readFile(new URL('../config/listing-worker-activation.json', import.meta.url), 'utf8'))

assert.match(migration, /create table if not exists public\.listing_job_worker_runs/)
assert.match(migration, /enable row level security/)
assert.match(migration, /revoke all on table public\.listing_job_worker_runs from public, anon, authenticated/)
assert.match(migration, /listing_background_jobs_admin_update/)
assert.match(migration, /bridge_is_org_admin\(organisation_id\)/)
assert.match(migration, /bridge_retry_listing_job_v1/)
assert.match(migration, /status in \('failed', 'manual_review'\)/)
assert.match(migration, /bridge_cancel_listing_job_v1/)
assert.match(migration, /bridge_listing_worker_health_v1/)
assert.match(migration, /interval '5 minutes'/)
assert.match(migration, /'actorId', auth\.uid\(\)/)
assert.doesNotMatch(migration, /function public\.[^(]+\([^)]*\)[\s\S]{0,150}security definer/i)
assert.match(worker, /listing_job_worker_runs/)
assert.match(worker, /CLAIM_FAILED/)
assert.match(service, /retryListingBackgroundJob/)
assert.match(service, /cancelListingBackgroundJob/)
assert.equal(activation.status, 'INERT')
assert.equal(activation.schedule.enabled, false)
assert.equal(activation.handlers.media_reconcile, 'approved_for_controlled_activation')
assert.equal(activation.handlers.property24_publish, 'blocked')
assert.equal(activation.rollback.preserveQueuedJobs, true)

console.log('listing job operational controls tests passed')
