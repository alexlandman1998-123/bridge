import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const agent = read('../src/pages/AgentListingDetail.jsx')
const signer = read('../src/pages/ListingMandateSigning.jsx')
const snapshot = read('../src/core/documents/sellerOnboardingSigningPackSnapshot.js')

assert.match(agent, /buildSellerOnboardingSigningPackSnapshot/)
assert.match(snapshot, /kind: 'seller_onboarding_submission'/)
assert.match(snapshot, /Seller facts were captured in onboarding and frozen into this signing pack/)
assert.match(snapshot, /propertyDisclosure \|\| form\.property_disclosure/)
assert.match(signer, /onboardingSource = signingPack\?\.onboardingSource/)
assert.match(signer, /Your onboarding information is ready for confirmation/)
assert.match(signer, /frozen into this pack/)

console.log('seller onboarding signing Phase 3 checks passed')
