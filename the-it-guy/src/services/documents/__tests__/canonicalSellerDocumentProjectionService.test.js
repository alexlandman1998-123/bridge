import assert from 'node:assert/strict'
import test from 'node:test'
import { projectCanonicalSellerDocumentRows } from '../canonicalSellerDocumentProjectionService.js'

test('canonical seller projection collapses aliases and keeps upload evidence', () => {
  const rows = projectCanonicalSellerDocumentRows([
    { key: 'levy_statement', category: 'property', status: 'required' },
    { key: 'sectional_levy_statement', category: 'legal', status: 'uploaded', file_url: 'https://files.example/levy.pdf' },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].key, 'levy_statement')
  assert.equal(rows[0].taxonomyCategory, 'property')
  assert.equal(rows[0].file_url, 'https://files.example/levy.pdf')
})

test('canonical seller projection omits structured facts and preserves party-specific requirements', () => {
  const rows = projectCanonicalSellerDocumentRows([
    { key: 'body_corporate_details' },
    { key: 'seller_id_document', party_id: 'seller-one' },
    { key: 'seller_id_document', party_id: 'seller-two' },
    { key: 'solar_compliance_documents', category: 'legal' },
  ])

  assert.equal(rows.some((row) => row.key === 'body_corporate_details'), false)
  assert.equal(rows.filter((row) => row.key === 'seller_id_document').length, 2)
  assert.equal(rows.find((row) => row.key === 'solar_compliance_documents').taxonomyCategory, 'property')
})
