import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260830092956_listing_background_jobs.sql', import.meta.url),
  'utf8',
)
const worker = await readFile(new URL('../supabase/functions/listing-job-runner/index.ts', import.meta.url), 'utf8')
const service = await readFile(
  new URL('../the-it-guy/src/services/listings/listingBackgroundJobs.js', import.meta.url),
  'utf8',
)
const rentalService = await readFile(
  new URL('../the-it-guy/src/services/rentals/rentalListingDraftService.js', import.meta.url),
  'utf8',
)
const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')

assert.match(migration, /unique index[\s\S]+idempotency/i)
assert.match(migration, /for update skip locked/i)
assert.match(migration, /lease_expires_at/)
assert.match(migration, /power\(2,[\s\S]+attempt_count/i)
assert.match(migration, /else 'manual_review'/)
assert.match(migration, /security invoker/gi)
assert.doesNotMatch(migration, /security definer/i)
assert.match(migration, /revoke all on function public\.bridge_claim_listing_jobs_v1[\s\S]+authenticated/i)
assert.match(worker, /LISTING_JOB_RUNNER_SECRET/)
assert.match(worker, /HANDLER_NOT_ACTIVATED/)
assert.match(worker, /bridge_claim_listing_jobs_v1/)
assert.match(worker, /bridge_complete_listing_job_v1/)
assert.match(worker, /bridge_fail_listing_job_v1/)
assert.match(service, /bridge_enqueue_listing_job_v1/)
assert.match(rentalService, /await uploadRentalGalleryImages\(form\.galleryImages, listingId\)/)
assert.match(rentalService, /enqueueListingMediaProcessing/)
assert.doesNotMatch(rentalService, /void finalizeRentalListingGalleryUploads/)
assert.match(config, /\[functions\.listing-job-runner\][\s\S]*enabled = false/)

console.log('listing background jobs tests passed')
