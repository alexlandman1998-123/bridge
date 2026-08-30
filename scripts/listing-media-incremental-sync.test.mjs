import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  LISTING_IMAGE_MAX_BYTES,
  LISTING_IMAGE_MAX_PIXELS,
  validateListingImageFile,
} from '../the-it-guy/src/services/listings/listingMediaValidation.js'

assert.equal(LISTING_IMAGE_MAX_BYTES, 25 * 1024 * 1024)
assert.equal(LISTING_IMAGE_MAX_PIXELS, 50_000_000)
assert.equal(validateListingImageFile({ type: 'image/jpeg', size: 1024 }, { width: 1200, height: 800 }).valid, true)
assert.equal(validateListingImageFile({ type: 'application/pdf', size: 1024 }).valid, false)
assert.equal(validateListingImageFile({ type: 'image/png', size: LISTING_IMAGE_MAX_BYTES + 1 }).valid, false)
assert.equal(validateListingImageFile({ type: 'image/webp', size: 1024 }, { width: 10000, height: 6000 }).valid, false)

const migration = fs.readFileSync('supabase/migrations/20260830092948_listing_media_incremental_sync.sql', 'utf8')
assert.match(migration, /security invoker/i)
assert.match(migration, /storage_bucket = trim\(v_item ->> 'storage_bucket'\)/)
assert.match(migration, /not \(id = any\(v_retained_ids\)\)/)
assert.match(migration, /grant execute .* to authenticated/i)
assert.doesNotMatch(migration, /security definer/i)

const service = fs.readFileSync('the-it-guy/src/services/privateListingService.js', 'utf8')
assert.match(service, /bridge_sync_listing_media_v2/)
assert.match(service, /mode: 'incremental_atomic'/)
assert.match(service, /width: 640/)
assert.match(service, /quality: 75/)

console.log('listing media incremental sync tests passed')
