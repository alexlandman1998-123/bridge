import assert from 'node:assert/strict'

import {
  buildKingstonsSellerDocumentRequirementPack,
  buildSellerDocumentSourceOfTruth,
  getExpectedSellerDocumentRequirements,
  getSellerRequiredDocuments,
} from '../src/services/sellerDocumentRequirementsService.js'

const kingstonsSellerLeadListing = {
  id: 'listing-kingstons-doc-baseline',
  organisationId: 'kingstons',
  sellerProcessProfile: 'kingstons_residential',
  lifecycleStatus: 'seller_lead',
  documentRequirements: [
    {
      key: 'seller_contact_confirmation',
      requirement_key: 'seller_contact_confirmation',
      name: 'Seller Contact Confirmation',
      status: 'required',
      is_required: true,
    },
  ],
}

const expectedBaselineKeys = [
  'valuation_document',
  'signed_mandate',
  'signed_disclosure_form',
  'signed_fica_declaration',
]

function keysFor(rows = []) {
  return rows.map((row) => row.key || row.requirement_key).sort()
}

const required = getSellerRequiredDocuments(kingstonsSellerLeadListing)
assert.deepEqual(keysFor(required), [...expectedBaselineKeys].sort())
assert.equal(
  required.some((row) => (row.key || row.requirement_key) === 'seller_contact_confirmation'),
  false,
  'Kingstons must not show Seller Contact Confirmation as a document requirement.',
)

const expected = getExpectedSellerDocumentRequirements(kingstonsSellerLeadListing)
assert.deepEqual(keysFor(expected), [...expectedBaselineKeys].sort())

const sourceOfTruth = buildSellerDocumentSourceOfTruth({
  listing: kingstonsSellerLeadListing,
})
assert.deepEqual(keysFor(sourceOfTruth.rows), [...expectedBaselineKeys].sort())
assert.equal(sourceOfTruth.summary.totalRequired, 4)
assert.equal(sourceOfTruth.summary.blocking, 4)
assert.equal(sourceOfTruth.requirementPack.baselineDocuments.length, 4)
assert.equal(sourceOfTruth.requirementPack.ownershipDrivenDocuments.length, 0)
assert.equal(sourceOfTruth.requirementPack.ownershipDrivenState, 'pending_capture')

const requirementPack = buildKingstonsSellerDocumentRequirementPack(kingstonsSellerLeadListing)
assert.deepEqual(keysFor(requirementPack.baselineDocuments), [...expectedBaselineKeys].sort())
assert.deepEqual(keysFor(requirementPack.ownershipDrivenDocuments), [])

const byKey = new Map(sourceOfTruth.rows.map((row) => [row.key, row]))
assert.equal(byKey.get('valuation_document')?.label, 'Formal Valuation Document')
assert.equal(byKey.get('signed_mandate')?.label, 'Signed Mandate')
assert.equal(byKey.get('signed_disclosure_form')?.label, 'Signed Mandatory Disclosure / Defects Form')
assert.equal(byKey.get('signed_fica_declaration')?.label, 'Signed FICA Declaration')

console.log('Kingstons seller documents Phase 1 baseline checks passed.')
