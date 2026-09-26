import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUYER_LEAD_DOCUMENT_TYPES,
  resolveBuyerLeadDocumentTarget,
} from '../buyerLeadDocumentContract.js'

test('every current agent upload choice has a deliberate document mapping', () => {
  assert.deepEqual(BUYER_LEAD_DOCUMENT_TYPES.map((item) => item.key), [
    'buyer_id_document',
    'buyer_proof_of_address',
    'proof_of_funds',
    'bank_statements',
    'bond_pre_approval',
    'buyer_fica_declaration',
  ])
  for (const { key } of BUYER_LEAD_DOCUMENT_TYPES) {
    const target = resolveBuyerLeadDocumentTarget(key)
    assert.ok(target.documentDefinitionKey, `${key} needs a document definition`)
    assert.equal(target.canAutoLink, false)
  }
})

test('person-specific FICA cannot satisfy another purchaser without an exact party', () => {
  const unresolved = resolveBuyerLeadDocumentTarget('buyer_id_document')
  assert.equal(unresolved.canonicalRequestKey, 'buyer_id_document')
  assert.equal(unresolved.mappingStatus, 'party_unresolved')
  assert.equal(unresolved.requiresExactRequirementInstance, true)

  const first = resolveBuyerLeadDocumentTarget('buyer_id_document', { partyId: 'purchaser-1', partyRole: 'co_purchaser' })
  const second = resolveBuyerLeadDocumentTarget('buyer_id_document', { partyId: 'purchaser-2', partyRole: 'co_purchaser' })
  assert.equal(first.mappingStatus, 'mapped')
  assert.notEqual(first.partyId, second.partyId)
  assert.equal(first.canonicalRequestVisibility, 'client_visible')
})

test('finance keys preserve transaction context and do not invent a bond pre-approval requirement', () => {
  assert.equal(resolveBuyerLeadDocumentTarget('proof_of_funds', { financeType: 'cash' }).canonicalRequestKey, 'proof_of_funds')
  assert.equal(resolveBuyerLeadDocumentTarget('proof_of_funds', { financeType: 'hybrid' }).canonicalRequestKey, 'proof_of_funds_cash_component')
  assert.equal(resolveBuyerLeadDocumentTarget('proof_of_funds').mappingStatus, 'review_required')
  assert.equal(resolveBuyerLeadDocumentTarget('bank_statements', { financeType: 'bond', partyId: 'entity-1' }).canonicalRequestKey, 'income_affordability_documents')
  assert.equal(resolveBuyerLeadDocumentTarget('bank_statements', { partyId: 'entity-1' }).mappingStatus, 'review_required')
  const preapproval = resolveBuyerLeadDocumentTarget('bond_pre_approval')
  assert.equal(preapproval.documentDefinitionKey, 'bond_preapproval')
  assert.equal(preapproval.canonicalRequestKey, '')
  assert.equal(preapproval.mappingStatus, 'review_required')
})

test('entity identity never satisfies an individual purchaser requirement by accident', () => {
  assert.equal(resolveBuyerLeadDocumentTarget('buyer_id_document', {
    purchaserType: 'company', partyId: 'company-1',
  }).mappingStatus, 'review_required')
  assert.equal(resolveBuyerLeadDocumentTarget('buyer_id_document', {
    purchaserType: 'company', partyId: 'director-1', partyRole: 'director',
  }).canonicalRequestKey, 'buyer_director_fica')
  assert.equal(resolveBuyerLeadDocumentTarget('buyer_id_document', {
    purchaserType: 'trust', partyId: 'trustee-1', partyRole: 'trustee',
  }).canonicalRequestKey, 'buyer_trustee_fica')
  assert.equal(resolveBuyerLeadDocumentTarget('buyer_proof_of_address', {
    purchaserType: 'trust', partyId: 'trustee-1', partyRole: 'trustee',
  }).mappingStatus, 'review_required')
})

test('dynamic roleplayer and legal documents remain exact-party or exact-transaction scoped', () => {
  const roleplayer = resolveBuyerLeadDocumentTarget('buyer_fica_person_1_id_or_passport', {
    ficaDocumentKind: 'id_or_passport',
    partyId: 'person-1',
  })
  assert.equal(roleplayer.canonicalRequestKey, 'buyer_id_document')
  assert.equal(roleplayer.partyId, 'person-1')
  assert.equal(roleplayer.mappingStatus, 'mapped')
  assert.equal(resolveBuyerLeadDocumentTarget('buyer_fica_person_1_tax_number_confirmation', {
    ficaDocumentKind: 'tax_number_confirmation',
    partyId: 'person-1',
  }).mappingStatus, 'review_required')
  const otp = resolveBuyerLeadDocumentTarget('uploaded_otp')
  assert.equal(otp.canonicalRequestKey, 'signed_otp')
  assert.equal(otp.subjectScope, 'transaction')
  assert.equal(otp.mappingStatus, 'mapped')
  assert.equal(resolveBuyerLeadDocumentTarget('unknown_document').mappingStatus, 'review_required')
})
