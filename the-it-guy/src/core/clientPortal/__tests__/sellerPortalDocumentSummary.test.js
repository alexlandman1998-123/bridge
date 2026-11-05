import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerPortalDocumentSummary, isSellerTeamManagedDocument } from '../sellerPortalDocumentSummary.js'

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

test('identifies managed workflow actions without excluding normal seller uploads', () => {
  assert.equal(isSellerTeamManagedDocument({ title: 'Upload Signed Mandate' }), true)
  assert.equal(isSellerTeamManagedDocument({ title: 'Prepare file', metadata: { requirementKey: 'signed_disclosure_form' } }), true)
  assert.equal(isSellerTeamManagedDocument({ title: 'Upload identity document', metadata: { requirementKey: 'identity' } }), false)
})

test('FICA supporting evidence remains in the seller checklist alongside bank details', () => {
  const items = [
    { id: 'marriage', key: 'seller_marriage_certificate', group: 'seller_identity_fica', sourceType: 'required_document', status: 'required' },
    { id: 'address', key: 'seller_proof_of_address', group: 'seller_identity_fica', description: 'Supporting evidence for FICA verification.', sourceType: 'required_document', status: 'required' },
    { id: 'bank', key: 'bond_bank_details', group: 'property_finance_existing_bond', sourceType: 'required_document', status: 'required' },
    { id: 'pack', key: 'signed_fica_declaration', group: 'seller_identity_fica', sourceType: 'required_document', status: 'approved' },
  ]
  assert.equal(isSellerTeamManagedDocument(items[0]), false)
  assert.equal(isSellerTeamManagedDocument(items[1]), false)
  assert.equal(isSellerTeamManagedDocument(items[3]), true)
  const summary = buildSellerPortalDocumentSummary({ items, summary: { total: 4, approved: 1, blocking: 3 } })
  assert.equal(summary.actionRequired, 3)
  assert.equal(summary.total, 3)
  assert.deepEqual(summary.actionItems.map(item => item.id), ['marriage', 'address', 'bank'])
})

test('optional uploads do not become seller checklist actions or review blockers', () => {
  const summary = buildSellerPortalDocumentSummary({
    summary: { total: 4, outstanding: 2, underReview: 1, approved: 1, blocking: 2 },
    items: [
      { id: 'identity', sourceType: 'required_document', status: 'approved', required: true },
      { id: 'bank', sourceType: 'required_document', status: 'required', required: false },
      { id: 'title', sourceType: 'required_document', status: 'under_review', is_required: false },
      { id: 'plans', sourceType: 'required_document', status: 'required', isRequired: false },
    ],
  })
  assert.equal(summary.total, 1)
  assert.equal(summary.approved, 1)
  assert.equal(summary.actionRequired, 0)
  assert.equal(summary.reviewRequired, 0)
  assert.equal(summary.ready, true)
  assert.deepEqual(summary.actionItems, [])
})
