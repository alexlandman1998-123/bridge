import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  buildListingMediaPersistence,
  getListingMediaObjectIdentity,
  LISTING_MEDIA_IDENTITY_VERSION,
  parseSupabaseStorageObjectUrl,
} from '../the-it-guy/src/services/listings/listingMediaIdentity.js'

assert.equal(LISTING_MEDIA_IDENTITY_VERSION, 'listing-media-object-identity-v1')
assert.deepEqual(
  parseSupabaseStorageObjectUrl('https://project.supabase.co/storage/v1/object/sign/documents/private-listings/a/gallery/photo.jpg?token=secret'),
  { bucket: 'documents', path: 'private-listings/a/gallery/photo.jpg' },
)
assert.deepEqual(
  parseSupabaseStorageObjectUrl('https://project.supabase.co/storage/v1/object/public/listing-media/folder/My%20Photo.jpg'),
  { bucket: 'listing-media', path: 'folder/My Photo.jpg' },
)
assert.deepEqual(getListingMediaObjectIdentity({ storageBucket: 'bucket', storagePath: 'path/image.jpg' }), {
  bucket: 'bucket',
  path: 'path/image.jpg',
})
assert.deepEqual(buildListingMediaPersistence({
  bucket: 'documents',
  path: 'private-listings/one/image.jpg',
  contentType: 'image/jpeg',
  size: 1024,
  width: 1200,
  height: 800,
}), {
  storage_bucket: 'documents',
  storage_path: 'private-listings/one/image.jpg',
  content_type: 'image/jpeg',
  byte_size: 1024,
  width: 1200,
  height: 800,
  checksum: null,
  processing_status: 'ready',
})

const migration = fs.readFileSync('supabase/migrations/20260830092946_listing_media_stable_object_identity.sql', 'utf8')
assert.match(migration, /add column if not exists storage_bucket text/)
assert.match(migration, /add column if not exists storage_path text/)
assert.match(migration, /listing_media_storage_object_idx/)
assert.doesNotMatch(migration, /(?:insert into|update|delete from)\s+storage\./i)

const service = fs.readFileSync('the-it-guy/src/services/privateListingService.js', 'utf8')
assert.match(service, /createSignedUrls/)
assert.match(service, /buildListingMediaPersistence/)
assert.match(service, /resolveListingMediaDeliveryUrls/)

console.log('listing media identity tests passed')
