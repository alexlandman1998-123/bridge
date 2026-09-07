import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDealSetupDocumentRequirements } from '../dealSetupDocumentRequirements.js'

test('requirements are generated per buyer and honour reusable FICA documents', () => {
  const result = buildDealSetupDocumentRequirements({ setup: { terms: { purchaserType: 'trust' }, finance: { type: 'bond' }, buyers: [{ buyer_party_id: 'a', participant_name: 'A', signing_required: true }, { buyer_party_id: 'b', participant_name: 'B', signing_required: false }] }, profileDocumentsByBuyer: { a: [{ document_key: 'identity_document' }, { document_key: 'proof_of_address' }] } })
  assert.equal(result.requirements.filter((item) => item.partyId === 'a').every((item) => item.key === 'signed_otp' || item.satisfiedByProfile), true)
  assert.ok(result.requirements.some((item) => item.key === 'trust_authority'))
  assert.ok(result.requirements.some((item) => item.key === 'bond_application'))
})
