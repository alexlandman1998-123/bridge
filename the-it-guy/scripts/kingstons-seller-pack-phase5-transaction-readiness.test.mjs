import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {
  KINGSTONS_SELLER_PACK_TRANSACTION_READINESS_VERSION,
  buildKingstonsSellerPackTransactionReadiness,
} from '../src/core/transactions/kingstonsSellerPackTransactionReadiness.js'

const repoRoot = process.cwd()
const unitDetailPath = path.join(repoRoot, 'src/pages/UnitDetail.jsx')
const unitDetail = fs.readFileSync(unitDetailPath, 'utf8')

function assertIncludes(source, snippet, message) {
  assert.ok(source.includes(snippet), message)
}

const healthy = buildKingstonsSellerPackTransactionReadiness({
  documents: [
    {
      id: 'doc-1',
      name: 'Signed mandate.pdf',
      document_type: 'signed_mandate',
      source: 'seller_portal',
      source_document_id: 'listing-doc-1',
      status: 'approved',
    },
    {
      id: 'doc-2',
      name: 'Defect disclosure.pdf',
      document_type: 'property_condition_disclosure',
      source: 'seller_portal',
      source_document_id: 'listing-doc-2',
      status: 'uploaded',
    },
    {
      id: 'doc-3',
      name: 'Signed FICA form.pdf',
      document_type: 'signed_fica_form',
      source: 'seller_portal',
      source_document_id: 'listing-doc-3',
      status: 'verified',
    },
  ],
})

assert.equal(healthy.version, KINGSTONS_SELLER_PACK_TRANSACTION_READINESS_VERSION)
assert.equal(healthy.gate.status, 'pass')
assert.equal(healthy.gate.attorneyHandoffReady, true)
assert.equal(healthy.summary.ready, 3)
assert.equal(healthy.rows.every((row) => row.sourceDocumentId), true)

const missing = buildKingstonsSellerPackTransactionReadiness({
  documents: healthy.rows.slice(0, 2).map((row) => row.document),
})
assert.equal(missing.gate.status, 'blocked')
assert.equal(missing.gate.attorneyHandoffReady, false)
assert.equal(missing.summary.missing, 1)
assert.equal(missing.blockers.some((blocker) => blocker.documentKey === 'signed_fica_form'), true)

const attention = buildKingstonsSellerPackTransactionReadiness({
  documents: [
    ...healthy.rows.slice(0, 2).map((row) => row.document),
    {
      id: 'doc-3',
      name: 'Signed FICA form.pdf',
      document_type: 'signed_fica_form',
      source: 'seller_portal',
      source_document_id: 'listing-doc-3',
      status: 'rejected',
    },
  ],
})
assert.equal(attention.gate.status, 'blocked')
assert.equal(attention.summary.attention, 1)
assert.equal(attention.rows.find((row) => row.key === 'signed_fica_form')?.state, 'attention')

assertIncludes(
  unitDetail,
  'buildKingstonsSellerPackTransactionReadiness',
  'Transaction workspace must build Seller Pack readiness from transaction documents.',
)
assertIncludes(
  unitDetail,
  'Signed Seller Pack',
  'Transaction Documents tab must render the Signed Seller Pack readiness panel.',
)
assertIncludes(
  unitDetail,
  'shouldShowSellerPackTransactionReadiness',
  'Seller Pack readiness panel must be scoped to listing-origin or Seller Pack transactions.',
)
assertIncludes(
  unitDetail,
  'sellerPackTransactionReadiness.gate.attorneyHandoffReady',
  'Phase 5 UI must expose the attorney handoff gate status.',
)

console.log('Kingstons seller pack phase 5 transaction readiness guard passed.')
