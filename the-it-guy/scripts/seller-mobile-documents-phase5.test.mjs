import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildSellerMobileDocumentFilters,
  formatSellerMobileUploadSize,
  getSellerMobileDocumentBucket,
  normalizeSellerMobileDocumentKey,
  resolveSellerMobileDocumentUploadTarget,
} from '../src/lib/sellerMobileDocumentModel.js'

const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

assert.equal(normalizeSellerMobileDocumentKey(' Proof of Address '), 'proof_of_address')
assert.equal(normalizeSellerMobileDocumentKey('Mandate / FICA Docs'), 'mandate_fica_docs')

assert.equal(getSellerMobileDocumentBucket({ actionRequired: true, status: 'received' }), 'action')
assert.equal(getSellerMobileDocumentBucket({ statusBucket: 'outstanding' }), 'action')
assert.equal(getSellerMobileDocumentBucket({ status: 'Rejected' }), 'action')
assert.equal(getSellerMobileDocumentBucket({ reviewRequired: true }), 'review')
assert.equal(getSellerMobileDocumentBucket({ statusBucket: 'received' }), 'review')
assert.equal(getSellerMobileDocumentBucket({ requiredDocumentStatus: 'Under Review' }), 'review')
assert.equal(getSellerMobileDocumentBucket({ satisfied: true }), 'approved')
assert.equal(getSellerMobileDocumentBucket({ statusBucket: 'approved' }), 'approved')
assert.equal(getSellerMobileDocumentBucket({ required_document_status: 'signed' }), 'approved')
assert.equal(getSellerMobileDocumentBucket({ linkedDocument: { id: 'doc-1' } }), 'review')
assert.equal(getSellerMobileDocumentBucket({ hasUploadedDocument: true }), 'review')
assert.equal(getSellerMobileDocumentBucket({}), 'action')

assert.deepEqual(
  resolveSellerMobileDocumentUploadTarget({
    uploadSpec: {
      requirementKey: 'FICA Document',
      requirementInstanceId: 'req-instance-1',
      category: 'Seller compliance',
      documentType: 'Identity photo',
    },
  }),
  {
    requirementKey: 'fica_document',
    requirementInstanceId: 'req-instance-1',
    uploadingKey: 'req-instance-1',
    category: 'Seller compliance',
    documentType: 'Identity photo',
  },
)

assert.deepEqual(
  resolveSellerMobileDocumentUploadTarget({
    title: 'Proof of address',
    requirement_key: 'Proof of Address',
    stageLabel: 'FICA',
  }),
  {
    requirementKey: 'proof_of_address',
    requirementInstanceId: '',
    uploadingKey: 'proof_of_address',
    category: 'FICA',
    documentType: 'proof_of_address',
  },
)

assert.equal(formatSellerMobileUploadSize(0), '')
assert.equal(formatSellerMobileUploadSize(1024), '1 KB')
assert.equal(formatSellerMobileUploadSize(5 * 1024 * 1024), '5.0 MB')
assert.equal(formatSellerMobileUploadSize(26 * 1024 * 1024), '26 MB')

const documentModel = buildSellerMobileDocumentFilters([
  { id: 'pending-1', actionRequired: true },
  { id: 'pending-2', statusBucket: 'outstanding' },
  { id: 'review-1', linkedDocument: { id: 'doc-2' } },
  { id: 'approved-1', satisfied: true },
  { id: 'ignored', applicable: false, actionRequired: true },
], 'action')

assert.deepEqual(documentModel.counts, { action: 2, review: 1, approved: 1, all: 4 })
assert.equal(documentModel.activeKey, 'action')
assert.deepEqual(documentModel.visibleItems.map((item) => item.id), ['pending-1', 'pending-2'])
assert.deepEqual(documentModel.filters.map((filter) => filter.label), ['Pending', 'Review', 'Approved', 'All'])

const allModel = buildSellerMobileDocumentFilters(documentModel.items, 'all')
assert.equal(allModel.activeKey, 'all')
assert.deepEqual(allModel.visibleItems.map((item) => item.id), ['pending-1', 'pending-2', 'review-1', 'approved-1'])

const fallbackModel = buildSellerMobileDocumentFilters([
  { id: 'review-only', linkedDocument: { id: 'doc-3' } },
  { id: 'approved-only', satisfied: true },
], 'action')
assert.equal(fallbackModel.activeKey, 'review')
assert.deepEqual(fallbackModel.visibleItems.map((item) => item.id), ['review-only'])

assert.match(
  packageSource,
  /"test:seller-mobile-documents-phase5": "node scripts\/seller-mobile-documents-phase5\.test\.mjs"/,
)

console.log('seller mobile documents phase 5 tests passed')
