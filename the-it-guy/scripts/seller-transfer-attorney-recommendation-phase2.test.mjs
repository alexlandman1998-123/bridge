import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const [modalSource, leadsSource, listingSource, contractSource] = await Promise.all([
  readFile(resolve(root, 'src/components/seller/SellerAttorneyRecommendationModal.jsx'), 'utf8'),
  readFile(resolve(root, 'src/pages/AgentLeadsPage.jsx'), 'utf8'),
  readFile(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8'),
  readFile(resolve(root, 'src/lib/sellerTransferAttorneyDecision.js'), 'utf8'),
])

assert.match(modalSource, /Recommend a transferring attorney/)
assert.match(modalSource, /This is a recommendation, not an appointment/)
assert.match(modalSource, /Recommend a preferred firm/)
assert.match(modalSource, /Send without a recommendation/)
assert.match(modalSource, /listOrganisationPreferredPartners/)
assert.match(modalSource, /partnerType === 'transfer_attorney'/)
assert.match(modalSource, /isPreferredDefault/)

for (const source of [leadsSource, listingSource]) {
  assert.match(source, /SellerAttorneyRecommendationModal/)
  assert.match(source, /buildSellerTransferAttorneyOnboardingPatch/)
  assert.match(source, /updatePrivateListingOnboardingFormData/)
  assert.match(source, /transferAttorneyDecision/)
}

assert.match(contractSource, /recommendationStatus/)
assert.match(contractSource, /recommendedBy/)
assert.match(contractSource, /recommendedAt/)
assert.match(contractSource, /recommended: 'recommended'/)
assert.match(contractSource, /none: 'none'/)

console.log('Seller transfer attorney recommendation Phase 2 checks passed.')
