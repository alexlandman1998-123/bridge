import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBuyerDocumentPresentationModel,
  resolveBuyerDocumentCategory,
  resolveBuyerDocumentStatus,
} from '../buyerDocumentPresentationModel.js'

test('normalizes live and fixture statuses into the canonical buyer document vocabulary', () => {
  assert.equal(resolveBuyerDocumentStatus({ status: 'requested' }), 'action')
  assert.equal(resolveBuyerDocumentStatus({ status: 'under_review' }), 'review')
  assert.equal(resolveBuyerDocumentStatus({ status: 'signed' }), 'approved')
  assert.equal(resolveBuyerDocumentStatus({ status: 'not available yet' }), 'upcoming')
})
test('classifies document categories from explicit metadata and document meaning', () => {
  assert.equal(resolveBuyerDocumentCategory({ buyerCategoryKey: 'finance' }), 'finance')
  assert.equal(resolveBuyerDocumentCategory({ title: 'Latest payslip' }), 'finance')
  assert.equal(resolveBuyerDocumentCategory({ title: 'Signed Offer to Purchase' }), 'sales')
  assert.equal(resolveBuyerDocumentCategory({ title: 'Sectional title conduct rules' }), 'property')
  assert.equal(resolveBuyerDocumentCategory({ title: 'Identity document' }), 'fica')
})

test('builds one summary and category model for every buyer document surface', () => {
  const model = buildBuyerDocumentPresentationModel({
    source: 'production',
    items: [
      { id: 'payslip', title: 'Latest payslip', status: 'required', uploadSpec: { type: 'requirement' } },
      { id: 'otp', title: 'Signed OTP', status: 'approved' },
      { id: 'id', title: 'Identity document', status: 'uploaded' },
      { id: 'levy', title: 'Levy certificate', status: 'upcoming' },
    ],
  })

  assert.deepEqual(model.counts, { action: 1, review: 1, approved: 1, upcoming: 1, total: 4 })
  assert.equal(model.completionPercent, 25)
  assert.equal(model.collectionPercent, 50)
  assert.equal(model.firstActionItem.id, 'payslip')
  assert.equal(model.categories.find((category) => category.key === 'finance').items[0].id, 'payslip')
  assert.equal(model.source, 'production')
})

test('handles empty and malformed collections safely', () => {
  const model = buildBuyerDocumentPresentationModel({ items: null })
  assert.deepEqual(model.items, [])
  assert.equal(model.completionPercent, 100)
  assert.equal(model.isComplete, true)
})
