import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DOCUMENT_REQUIREMENT_KINDS,
  getCrossModuleDocumentDefinition,
  getCrossModuleDocumentRequirementKind,
  listCrossModuleDocumentDefinitions,
  resolveCrossModuleDocumentReference,
} from '../crossModuleDocumentKeyMapService.js'

test('every canonical document definition declares an allowed taxonomy kind', () => {
  const definitions = listCrossModuleDocumentDefinitions()

  assert.ok(definitions.length > 0)
  assert.ok(definitions.every((definition) => DOCUMENT_REQUIREMENT_KINDS.includes(definition.kind)))
  assert.ok(definitions.every((definition) => definition.category && definition.ownerRole))
})

test('data-capture rows are structured facts while solar and signed mandate remain uploadable', () => {
  assert.equal(getCrossModuleDocumentRequirementKind('body_corporate_details'), 'structured_fact')
  assert.equal(getCrossModuleDocumentRequirementKind('hoa_contact_details'), 'structured_fact')
  assert.equal(getCrossModuleDocumentRequirementKind('bond_bank_details'), 'structured_fact')
  assert.equal(getCrossModuleDocumentRequirementKind('solar_compliance_documents'), 'upload_document')
  assert.equal(getCrossModuleDocumentRequirementKind('signed_mandate'), 'upload_document')
  assert.equal(getCrossModuleDocumentRequirementKind('generated_mandate'), 'generated_document')
  assert.equal(getCrossModuleDocumentDefinition('solar_compliance_documents').category, 'property_compliance')
})

test('cross-module references expose the taxonomy contract to consumers', () => {
  const reference = resolveCrossModuleDocumentReference('body_corporate_details')

  assert.equal(reference.documentRequirementKind, 'structured_fact')
  assert.equal(reference.documentCategory, 'sectional_title_body_corporate')
})

test('legacy seller producers resolve to the same canonical requirement key', () => {
  const levyAlias = resolveCrossModuleDocumentReference('sectional_levy_statement')
  const legacyLevyLabel = resolveCrossModuleDocumentReference('Latest Levy Statement')
  const demoLevyKey = resolveCrossModuleDocumentReference('sectional_title_levy_statement')
  const hoaAlias = resolveCrossModuleDocumentReference('hoa_contact_details')

  assert.equal(levyAlias.canonicalDocumentKey, 'levy_statement')
  assert.equal(legacyLevyLabel.canonicalDocumentKey, 'levy_statement')
  assert.equal(demoLevyKey.canonicalDocumentKey, 'levy_statement')
  assert.equal(hoaAlias.canonicalDocumentKey, 'hoa_details')
  assert.equal(hoaAlias.documentRequirementKind, 'structured_fact')
})

test('signed declarations keep their party and do not satisfy identity evidence', () => {
  const seller = resolveCrossModuleDocumentReference('seller_fica_declaration')
  const buyer = resolveCrossModuleDocumentReference('signed_buyer_fica_declaration')
  assert.equal(seller.canonicalDocumentKey, 'seller_fica_declaration')
  assert.equal(seller.documentOwnerRole, 'seller')
  assert.ok(seller.documentResponsibleRoles.includes('agent'))
  assert.equal(buyer.canonicalDocumentKey, 'buyer_fica_declaration')
  assert.equal(buyer.documentOwnerRole, 'buyer')
  assert.ok(buyer.documentResponsibleRoles.includes('agent'))
  assert.notEqual(seller.canonicalDocumentKey, resolveCrossModuleDocumentReference('seller_fica').canonicalDocumentKey)
  assert.notEqual(buyer.canonicalDocumentKey, resolveCrossModuleDocumentReference('buyer_fica').canonicalDocumentKey)
})

test('the signed disclosure key reaches the existing canonical disclosure requirement', () => {
  const reference = resolveCrossModuleDocumentReference('signed_disclosure_form')
  assert.equal(reference.canonicalDocumentKey, 'property_condition_disclosure')
  assert.equal(reference.documentOwnerRole, 'seller')
  assert.equal(reference.documentRequirementKind, 'upload_document')
})

test('beneficial ownership and CC resolutions retain their own evidence identities across handoff', () => {
  for (const party of ['buyer', 'seller']) {
    assert.notEqual(resolveCrossModuleDocumentReference(`${party}_beneficial_ownership`).canonicalDocumentKey, resolveCrossModuleDocumentReference(`${party}_company_registration`).canonicalDocumentKey)
    assert.notEqual(resolveCrossModuleDocumentReference(`${party}_trust_beneficial_ownership`).canonicalDocumentKey, resolveCrossModuleDocumentReference(`${party}_trust_deed`).canonicalDocumentKey)
    const resolution = resolveCrossModuleDocumentReference(`${party}_cc_member_resolution_signature`)
    assert.equal(resolution.canonicalDocumentKey, `${party}_cc_resolution`)
    assert.equal(resolution.documentOwnerRole, party)
  }
})

test('foreign capacity and tax entry remain internal attorney tasks', () => {
  for (const key of ['buyer_foreign_tax_entry', 'buyer_foreign_marital_capacity', 'seller_foreign_marital_capacity']) {
    const reference = resolveCrossModuleDocumentReference(key)
    assert.equal(reference.documentRequirementKind, 'internal_task')
    assert.equal(reference.documentOwnerRole, 'transfer_attorney')
  }
})
