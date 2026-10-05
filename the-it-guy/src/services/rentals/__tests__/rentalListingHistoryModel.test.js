import { describe, it, expect } from 'vitest'
import { buildRentalHistoryChanges, buildRentalAuditMediaEvidence } from '../rentalListingHistoryModel'
const image = { id: 'photo', media_type: 'image', file_url: 'https://storage.test/expired', storage_bucket: 'documents', storage_path: 'private-listings/rental/photo', is_cover: true, sort_order: 0 }
const event = (before, after) => ({ schemaVersion: 1, source: 'rental_atomic_save', before, after })
describe('durable rental history', () => {
  it('reports before/after expiry, removed images and changed videos', () => {
    const changes = buildRentalHistoryChanges(event({ facts: { rentalInfo: { property24ExpiryDate: '2026-12-01' } }, media: [image, { id: 'video', media_type: 'video', file_url: 'https://test/old' }] }, { facts: { rentalInfo: { property24ExpiryDate: '2027-04-30' } }, media: [{ id: 'video', media_type: 'video', file_url: 'https://test/new' }] }))
    expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'Rental details / rentalInfo / property24ExpiryDate', before: '2026-12-01', after: '2027-04-30' }), expect.objectContaining({ field: 'image: removed', before: image.storage_path.replace(/^/, 'documents/') }), expect.objectContaining({ field: 'video: changed' })]))
  })
  it('ignores fresh signed tokens and retains evidence for removed objects', () => {
    const fresh = { ...image, file_url: 'https://storage.test/fresh' }
    expect(buildRentalHistoryChanges(event({ media: [image] }, { media: [fresh] }))).toEqual([])
    const audit = { id: 'audit', metadata: event({ media: [image] }, { media: [] }) }
    expect(buildRentalAuditMediaEvidence({ listingMedia: [fresh] }, audit)).toEqual([])
    expect(buildRentalAuditMediaEvidence({ listingMedia: [] }, audit)[0]).toMatchObject({ label: 'Photos', count: 1 })
  })
  it('does not invent before/after values for legacy events', () => {
    expect(buildRentalHistoryChanges({ snapshot: { gallery: ['https://test/old'] } })).toEqual([])
  })
})
