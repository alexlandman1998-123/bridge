import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const baseline = JSON.parse(read('../config/seller-onboarding-signing-phase0-baseline.json'))
const onboarding = read('../src/pages/SellerOnboarding.jsx')
const service = read('../src/services/privateListingService.js')
const documents = read('../src/core/documents/sellerOnboardingGeneratedDocuments.js')

assert.equal(baseline.runtimeChanges, false)
assert.equal(baseline.sourceOfTruth, 'private_listing_seller_onboarding.form_data')
assert.match(onboarding, /updateSellerOnboardingProgress/)
assert.match(onboarding, /submitSellerOnboarding\(token/)
assert.match(onboarding, /PropertyDisclosureSection/)
assert.match(service, /bridge_complete_private_listing_seller_onboarding/)
assert.match(service, /bridge_update_private_listing_seller_onboarding_progress/)
assert.match(documents, /ready_for_signature/)
assert.match(documents, /separate_signed_upload/)

console.log('seller onboarding signing Phase 0 baseline checks passed')
