import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
import { buildMvpTransactionParticipantBootstrap } from '../src/core/transactions/mvpTransactionParticipantBootstrap.js'
import { buildMvpTransactionDocumentBootstrap } from '../src/core/transactions/mvpTransactionDocumentBootstrap.js'
import { buildMvpDocumentRoster } from '../src/core/transactions/mvpDocumentRoster.js'

const profile = resolveTransactionRoutingProfile({
  financeType: 'hybrid',
  transactionType: 'private_sale',
  propertyTenure: 'sectional_title',
  buyerEntityType: 'company',
  sellerEntityType: 'trust',
  buyerCount: 2,
  buyerSpouseConsentRequired: true,
  foreignBuyer: true,
  sellerSpouseConsentRequired: true,
  sellerHasExistingBond: true,
})

assert.equal(profile.hasAdditionalBuyer, true)
assert.equal(profile.buyerSpouseConsentRequired, true)
assert.equal(profile.sellerSpouseConsentRequired, true)
assert.equal(profile.foreignBuyer, true)

const participants = buildMvpTransactionParticipantBootstrap({
  routingProfile: profile,
  buyer: { name: 'Primary Buyer', email: 'buyer@example.test' },
  seller: { name: 'Seller Trust', email: 'seller@example.test' },
  agent: { id: 'agent-1', email: 'agent@example.test' },
})
const roleKeys = participants.requirements.map((role) => role.roleKey)
for (const expectedRole of [
  'additional_buyer',
  'buyer_spouse',
  'foreign_buyer_signatory',
  'buyer_company_director',
  'buyer_company_signatory',
  'seller_spouse',
  'seller_trustee',
]) {
  assert.ok(roleKeys.includes(expectedRole), `missing role requirement ${expectedRole}`)
}
assert.ok(
  participants.requirements
    .filter((role) => role.roleType === 'client' && role.transactionRole === 'buyer')
    .every((role) => role.participantCaptureMode === 'participant_requirement'),
  'special buyer parties must stay distinct requirements instead of collapsing into the buyer participant row',
)

const documents = buildMvpTransactionDocumentBootstrap(profile)
const documentKeys = documents.requirements.map((document) => document.key)
for (const expectedDocument of [
  'additional_buyer_fica',
  'buyer_spouse_consent',
  'foreign_buyer_fica',
  'buyer_director_fica',
  'buyer_company_authority',
  'seller_spouse_consent',
  'seller_trust_authority',
  'proof_of_funds',
  'bond_preapproval',
  'bond_cancellation_figures',
]) {
  assert.ok(documentKeys.includes(expectedDocument), `missing document requirement ${expectedDocument}`)
}
assert.ok(documents.requirements.every((document) => document.satisfactionMode === 'verified_upload'))

const statusOnlyRoster = buildMvpDocumentRoster({
  requiredDocuments: [
    { document_key: 'buyer_identity', document_label: 'Buyer identity document', status: 'verified', is_required: true, enabled: true },
    { document_key: 'proof_of_funds', document_label: 'Proof of funds', status: 'verified', is_required: true, enabled: true },
  ],
})
assert.equal(statusOnlyRoster.summary.complete, 0)
assert.equal(statusOnlyRoster.summary.outstanding, 2)
assert.ok(statusOnlyRoster.blockers.every((blocker) => /uploaded file/i.test(blocker.reason)))

const uploadedRoster = buildMvpDocumentRoster({
  requiredDocuments: [
    { document_key: 'buyer_identity', document_label: 'Buyer identity document', status: 'verified', is_required: true, enabled: true, document_id: 'doc-1' },
    { document_key: 'proof_of_funds', document_label: 'Proof of funds', status: 'verified', is_required: true, enabled: true, uploaded_at: '2026-08-15T10:00:00.000Z' },
  ],
})
assert.equal(uploadedRoster.summary.complete, 2)
assert.equal(uploadedRoster.summary.outstanding, 0)

const contract = readFileSync(new URL('../docs/lead-listing-transaction-workflow-contract-phase0.md', import.meta.url), 'utf8')
assert.match(contract, /Party Document Readiness - Phase 4/)

console.log('Party and document readiness Phase 4 checks passed.')
