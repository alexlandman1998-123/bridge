import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260830094457_listing_media_materialized_variants.sql', 'utf8')
const worker = fs.readFileSync('supabase/functions/listing-job-runner/index.ts', 'utf8')
const service = fs.readFileSync('the-it-guy/src/services/listings/listingBackgroundJobs.js', 'utf8')
const listingService = fs.readFileSync('the-it-guy/src/services/privateListingService.js', 'utf8')
const rentalService = fs.readFileSync('the-it-guy/src/services/rentals/rentalListingDraftService.js', 'utf8')

assert.match(migration, /create table if not exists public\.listing_media_variants/)
assert.match(migration, /unique \(listing_media_id, variant_key\)/)
assert.match(migration, /enable row level security/)
assert.match(migration, /listing_media_variants_select_visible_listing/)
assert.match(migration, /'media_variant_refresh'/)
assert.match(migration, /security invoker/i)
assert.doesNotMatch(migration, /security definer/i)

assert.match(worker, /MEDIA_VARIANTS/)
assert.match(worker, /thumbnail.*320.*240/s)
assert.match(worker, /card.*640.*480/s)
assert.match(worker, /detail.*1600.*1200/s)
assert.match(worker, /cacheControl: "31536000"/)
assert.match(worker, /__variants\/\$\{job\.listing_id\}/)
assert.match(worker, /sourceRevisionStrategy/)
assert.match(worker, /job\.job_type === "media_variant_refresh"/)
assert.doesNotMatch(worker, /remove\(\[media\.storage_path\]\)/)

assert.match(service, /MEDIA_VARIANT_REFRESH: 'media_variant_refresh'/)
assert.match(service, /enqueueListingMediaProcessing/)
assert.match(rentalService, /enqueueListingMediaProcessing/)
assert.match(listingService, /preferMaterializedMediaVariant/)
assert.match(listingService, /materialized_variant/)
assert.match(listingService, /listing_media_variants\(variant_key/)

console.log('listing media variants tests passed')
