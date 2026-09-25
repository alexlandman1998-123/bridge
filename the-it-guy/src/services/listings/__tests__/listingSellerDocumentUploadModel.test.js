import { describe, expect, it } from 'vitest'
import { buildSellerDocumentUploadQueue } from '../listingSellerDocumentUploadModel.js'

describe('seller document upload queue', () => {
  it('shows incomplete required documents first and tracks completion', () => {
    const queue = buildSellerDocumentUploadQueue([
      { key: 'optional', label: 'Optional annexure', required: false, status: 'pending' },
      { key: 'identity', label: 'Identity document', required: true, status: 'pending' },
      { key: 'address', label: 'Proof of address', required: true, status: 'approved' },
    ])
    expect(queue.outstanding.map((row) => row.key)).toEqual(['identity', 'optional'])
    expect(queue.requiredComplete).toBe(1)
    expect(queue.percent).toBe(50)
  })

  it('shows in-flight uploads in the progress calculation and completed uploads once persisted', () => {
    const documents = [{ key: 'identity', required: true }, { key: 'address', required: true }]
    expect(buildSellerDocumentUploadQueue(documents, { identity: { status: 'uploading' } }).percent).toBe(25)
    const complete = buildSellerDocumentUploadQueue(documents, {
      identity: { status: 'complete' },
      address: { status: 'complete' },
    })
    expect(complete.complete).toBe(true)
    expect(complete.outstanding).toEqual([])
  })
})
