import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const [rawMatrix, operatingContract, compliancePolicy] = await Promise.all([
  readFile(resolve(root, 'config/seller-mandate-terms-phase0-decision-matrix.json'), 'utf8'),
  readFile(resolve(root, 'docs/seller-mandate-terms-phase0-operating-contract.md'), 'utf8'),
  readFile(resolve(root, 'src/core/documents/sellerCompliancePolicy.js'), 'utf8'),
])
const matrix = JSON.parse(rawMatrix)

assert.equal(matrix.contract, 'arch9-seller-mandate-terms-phase0-v1')
assert.equal(matrix.status, 'pending_counsel_review')
assert.equal(matrix.runtimeChanges, false)
assert.equal(matrix.recommendedOperatingModel.preparationMode, 'hybrid_agent_prefill_primary_seller_confirmation')
assert.equal(matrix.recommendedOperatingModel.primaryDocumentContact.maySignForOtherParties, false)
assert.deepEqual(matrix.recommendedOperatingModel.primaryDocumentContact.secondarySignerActions, ['review_and_sign', 'flag_issue'])
assert.equal(matrix.recommendedOperatingModel.changeControl.sentPackIsImmutable, true)
assert.equal(matrix.recommendedOperatingModel.changeControl.materialChangeCreatesReplacementVersion, true)
assert(matrix.materialChanges.includes('proposed_transfer_attorney'))
assert(matrix.materialChanges.includes('approved_terms_or_notice_version'))

const byKey = Object.fromEntries(matrix.acknowledgements.map((item) => [item.key, item]))
assert.equal(byKey.terms_acceptance.required, true)
assert.equal(byKey.accuracy_and_authority.allRequiredSigners, true)
assert.equal(byKey.shared_information_review.requiredWhen, 'secondary_signer')
assert.equal(byKey.proposed_transfer_attorney.requiredWhen, 'transfer_attorney_selected')
assert.equal(byKey.marketing_preferences.required, false)
assert.equal(byKey.marketing_preferences.mustBeSeparateFromMandatoryTerms, true)
assert.equal(byKey.marketing_preferences.mustDefaultToUnticked, true)
assert(matrix.counselReviewGates.length >= 6)
assert(matrix.outOfScope.includes('Changing live mandate wording'))
assert.match(operatingContract, /No later phase may activate new seller terms or acknowledgements until counsel/)
assert.match(compliancePolicy, /SELLER_COMPLIANCE_POLICY_CONTRACT/)

console.log('Seller mandate terms Phase 0 checks passed.')
