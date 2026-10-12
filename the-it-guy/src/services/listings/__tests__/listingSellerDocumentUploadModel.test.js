import { describe, expect, it } from 'vitest'
import { buildSellerDocumentUploadQueue, buildSellerDocumentUploadEvidenceSummary } from '../listingSellerDocumentUploadModel.js'

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

it('reports a saved mandate awaiting review independently of approval', () => {
  const file = {id:'00000000-0000-4000-8000-000000000001',storage_path:'listing/mandate.pdf',status:'under_review'}
  expect(buildSellerDocumentUploadEvidenceSummary([{status:'under_review',linkedDocument:file}])).toEqual({saved:1,approved:0,awaitingReview:1})
  expect(buildSellerDocumentUploadEvidenceSummary([{status:'approved',linkedDocument:{...file,status:'approved'}}])).toEqual({saved:1,approved:1,awaitingReview:0})
})
it('counts the same persisted file once across lead and listing projections', () => {
  const file = {id:'00000000-0000-4000-8000-000000000001',storage_path:'listing/mandate.pdf',status:'uploaded'}
  expect(buildSellerDocumentUploadEvidenceSummary([{originalDocument:file},{upload:{id:file.id,filePath:file.storage_path},status:'uploaded'}])).toEqual({saved:1,approved:0,awaitingReview:1})
})
it('does not count an unsigned generated draft or an empty requirement as a saved file', () => {
  expect(buildSellerDocumentUploadEvidenceSummary([{id:'00000000-0000-4000-8000-000000000002',status:'under_review'},{id:'required',status:'required'},{upload:{id:'00000000-0000-4000-8000-000000000001',isGeneratedDraft:true},status:'uploaded'}])).toEqual({saved:0,approved:0,awaitingReview:0})
})
