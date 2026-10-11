import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerLeadSigningPackTermsPatch } from '../src/lib/sellerLeadManualCaptureModel.js'
import { buildListingSellerCanonicalUpdate } from '../src/services/listings/listingSellerCanonicalUpdateModel.js'
import { createMandateTermsFixture } from './fixtures/seller-mandate-capture.mjs'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
assert.ok(source.includes('buildSellerLeadSigningPackTermsPatch(sellerSigningPackTerms)'), 'The current lead workspace must use the shared mandate patch builder.')
assert.ok(source.includes("source: 'seller_lead_signing_pack'"), 'Prepared terms must pass through the guarded canonical save.')
const original = {
  ownerStructureType: 'individual', sellerFirstName: 'Sam', sellerSurname: 'Seller', phone: 'captured-phone',
  propertyDisclosure: { responses: { electrical_faults: { answer: 'yes', note: 'Keep the captured defect.' } } },
  sellerReviewedDocumentVersions: { version: 1, documents: [{ id: 'accepted-copy', digest: 'historical-digest' }] },
  unrelatedCapturedFact: 'preserve',
}
for (const basis of ['percentage', 'fixed']) {
  const patch = buildSellerLeadSigningPackTermsPatch({ ...createMandateTermsFixture(), commissionBasis: basis, commissionAmount: '10000' })
  assert.equal(patch.commissionPercentage, basis === 'percentage' ? '5' : '')
  assert.equal(patch.commissionAmount, basis === 'fixed' ? '10000' : '')
  assert.equal(patch.commission_percent, patch.commissionPercentage, 'All commission aliases must agree with the selected basis.')
  assert.equal(patch.commission_amount, patch.commissionAmount)
  assert.equal(Object.hasOwn(patch, 'phone'), false, 'Terms must not resend seller contact fields.')
  assert.equal(Object.hasOwn(patch, 'propertyDisclosure'), false, 'Terms must not resend disclosure answers.')
  const update = buildListingSellerCanonicalUpdate({ listing: { id: 'local-listing', sellerOnboarding: { formData: original } }, formPatch: patch })
  for (const key of ['phone', 'propertyDisclosure', 'sellerReviewedDocumentVersions', 'unrelatedCapturedFact']) {
    assert.deepEqual(update.nextFormData[key], original[key], `Mandate terms must preserve ${key}.`)
  }
}
console.log('Current mandate save preserves seller data and accepted evidence tests passed.')
