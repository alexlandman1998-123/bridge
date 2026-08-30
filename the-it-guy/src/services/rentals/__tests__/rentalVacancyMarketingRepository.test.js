import assert from 'node:assert/strict'
import {
  inferRentalMediaType,
  RENTAL_MEDIA_UPLOAD_ACCEPT,
  RENTAL_MEDIA_UPLOAD_MAX_BYTES,
  validateRentalMediaUpload,
} from '../rentalVacancyMarketingRepository.js'

assert.equal(RENTAL_MEDIA_UPLOAD_MAX_BYTES, 20 * 1024 * 1024)
assert.match(RENTAL_MEDIA_UPLOAD_ACCEPT, /image\/webp/)
assert.equal(inferRentalMediaType({ type: 'video/mp4' }), 'video')
assert.equal(inferRentalMediaType({ type: 'image/png' }), 'image')
assert.equal(validateRentalMediaUpload({ name: 'unit.webp', type: 'image/webp', size: 1024 }).name, 'unit.webp')
assert.throws(() => validateRentalMediaUpload({ name: 'unit.svg', type: 'image/svg+xml', size: 1024 }), /JPEG, PNG, WebP, MP4, or MOV/)
assert.throws(() => validateRentalMediaUpload({ name: 'unit.jpg', type: 'image/jpeg', size: RENTAL_MEDIA_UPLOAD_MAX_BYTES + 1 }), /20 MB/)

console.log('Rental vacancy marketing repository upload policy tests passed.')
