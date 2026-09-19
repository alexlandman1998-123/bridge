import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerDocumentTaxonomyAudit, SELLER_STRUCTURED_FACT_KEYS } from '../sellerDocumentTaxonomyAudit.js'

test('phase 0 audit exposes duplicate levy projections and fact rows disguised as documents', () => {
  const audit = buildSellerDocumentTaxonomyAudit([
    { key: 'levy_statement', category: 'property' },
    { key: 'sectional_levy_statement', category: 'legal' },
    { key: 'body_corporate_details', category: 'property' },
    { key: 'solar_compliance_documents', category: 'legal' },
  ])
  assert.equal(audit.summary.structuredFactCount, 1)
  assert.equal(audit.summary.legacyAliasGapCount, 1)
  assert.equal(audit.summary.duplicateProjectionCount, 1)
  assert.equal(audit.findings.find((finding) => finding.suppliedKey === 'sectional_levy_statement').canonicalKey, 'levy_statement')
  assert.equal(audit.findings.find((finding) => finding.canonicalKey === 'body_corporate_details').kind, 'structured_fact')
  const solar = audit.findings.find((finding) => finding.canonicalKey === 'solar_compliance_documents')
  assert.equal(solar.suppliedCategory, 'legal')
  assert.equal(solar.category, 'property_compliance')
  assert.equal(solar.categoryMismatch, true)
})

test('phase 0 audit keeps every known data-capture requirement out of the upload-document class', () => {
  const audit = buildSellerDocumentTaxonomyAudit(SELLER_STRUCTURED_FACT_KEYS.map((key) => ({ key })))

  assert.equal(audit.summary.structuredFactCount, SELLER_STRUCTURED_FACT_KEYS.length)
  assert.ok(audit.findings.every((finding) => finding.kind === 'structured_fact'))
})
