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
  const hoaAlias = resolveCrossModuleDocumentReference('hoa_contact_details')

  assert.equal(levyAlias.canonicalDocumentKey, 'levy_statement')
  assert.equal(hoaAlias.canonicalDocumentKey, 'hoa_details')
  assert.equal(hoaAlias.documentRequirementKind, 'structured_fact')
})
