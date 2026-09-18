import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildListingSellerDocumentReadiness } from '../src/lib/listingSellerProfileBuilderModel.js'
import { buildSellerSigningPlan } from '../src/lib/sellerSigningPlanModel.js'

const commission = { basis: 'percentage', percentage: '5', vatHandling: 'exclusive' }
const listing = (formData = {}) => ({ sellerCanonicalFacts: { source: 'direct_listing_intake' }, sellerOnboarding: { formData } })
const base = {
  sellerProfileCaptureSource: 'listing_seller_profile_capture', sellerType: 'individual', ownerStructureType: 'individual',
  sellerName: 'Ava Seller', email: 'ava@example.test', idNumber: '8001010000001', residentialAddress: '1 Main Road',
  propertyAddress: '10 Example Road', mandateType: 'sole', askingPrice: '2500000', mandateStartDate: '2026-09-18', expiryDate: '2026-12-18',
}

for (const selected of [['mandate'], ['fica'], ['mandate', 'fica'], ['mandate', 'disclosure', 'fica']]) {
  const form = { ...base }
  if (selected.includes('disclosure')) form.propertyDisclosure = { responses: {} }
  const readiness = buildListingSellerDocumentReadiness(listing(form), commission)
  assert.ok(selected.every((key) => readiness.byKey[key]), `selection ${selected.join(',')} must be recognised`)
  assert.equal(readiness.byKey.mandate.ready, true)
}

for (const [mandateType, expectedTitle] of [['sole', 'Sole mandate'], ['dual', 'Dual mandate'], ['tri', 'Tri mandate'], ['open', 'Open mandate']]) {
  const readiness = buildListingSellerDocumentReadiness(listing({ ...base, mandateType }), commission)
  assert.equal(readiness.byKey.mandate.title, expectedTitle, `${mandateType} must not be presented as an exclusive mandate`)
}

assert.equal(buildSellerSigningPlan({ sellerType: 'company', form: { authorisedSignatoryName: 'Casey Director', authorisedSignatoryEmail: 'casey@example.test' } }).ready, true)
assert.equal(buildSellerSigningPlan({ sellerType: 'trust', form: { authorisedTrusteeName: 'Taylor Trustee', authorisedTrusteeEmail: 'taylor@example.test' } }).ready, true)
assert.equal(buildSellerSigningPlan({ sellerType: 'deceased_estate', form: { executorName: 'Erin Executor', executorEmail: 'erin@example.test' } }).ready, true)

const [edge, migration, page] = await Promise.all([
  readFile(new URL('../../supabase/functions/listing-mandate-signing/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260918114553_listing_multi_signer_sessions_phase2.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/ListingMandateSigning.jsx', import.meta.url), 'utf8'),
])
assert.match(edge, /signingLinks: issued/)
assert.match(edge, /acceptedDocuments/)
assert.match(migration, /signing_group_id/)
assert.match(migration, /seller_visible/)
assert.match(page, /acceptedDocuments\[activeDocumentKey\]/)

console.log('listing direct documents phase 6 launch checks passed.')
