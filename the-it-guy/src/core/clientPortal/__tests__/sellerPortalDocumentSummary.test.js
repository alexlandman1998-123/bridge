import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerPortalDocumentSummary } from '../sellerPortalDocumentSummary.js'

test('uses the document-centre totals for every seller-facing document count', () => {
  const summary = buildSellerPortalDocumentSummary({
    summary: { total: 12, outstanding: 11, uploaded: 1, underReview: 0, approved: 0, rejected: 0, blocking: 11 },
    items: [
      { id: 'id', title: 'Identity document', status: 'required' },
      { id: 'rates', title: 'Rates account', status: 'uploaded' },
    ],
  })

  assert.equal(summary.total, 12)
  assert.equal(summary.actionRequired, 11)
  assert.equal(summary.reviewRequired, 1)
  assert.equal(summary.collectionPercent, 8)
  assert.deepEqual(summary.actionItems.map((item) => item.id), ['id'])
})

test('only marks the document work ready after actions and reviews are clear', () => {
  const summary = buildSellerPortalDocumentSummary({
    summary: { total: 2, outstanding: 0, uploaded: 0, underReview: 0, approved: 2, rejected: 0, blocking: 0 },
    items: [{ id: 'mandate', status: 'approved' }, { id: 'disclosure', status: 'completed' }],
  })

  assert.equal(summary.ready, true)
  assert.equal(summary.actionRequired, 0)
  assert.equal(summary.reviewRequired, 0)
})

test('keeps agent-managed seller-pack documents out of the seller action count', () => {
  const summary = buildSellerPortalDocumentSummary({
    summary: { total: 15, outstanding: 14, uploaded: 1, underReview: 0, approved: 0, rejected: 0, blocking: 14 },
    items: [
      ...Array.from({ length: 11 }, (_, index) => ({ id: `required-${index}`, status: 'required' })),
      { id: 'rates', status: 'uploaded' },
      { id: 'mandate', key: 'signed_mandate', status: 'required' },
      { id: 'disclosure', key: 'signed_disclosure_form', status: 'required' },
      { id: 'fica', key: 'signed_fica_declaration', status: 'required' },
    ],
  })

  assert.equal(summary.total, 12)
  assert.equal(summary.actionRequired, 11)
  assert.equal(summary.reviewRequired, 1)
})
