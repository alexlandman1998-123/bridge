import assert from 'node:assert/strict'

import {
  getSellerBasePackAliases,
  normalizeSellerBasePackKey,
  sellerBasePackKeysOverlap,
  SELLER_BASE_PACK_KEYS,
  SELLER_BASE_PACK_REQUIRED_KEYS,
} from '../src/lib/sellerBasePackContract.js'
import {
  documentMatchesSellerRequirement,
  mergeSellerRequiredDocuments,
} from '../src/services/sellerDocumentRequirementsService.js'

assert.deepEqual(SELLER_BASE_PACK_REQUIRED_KEYS, [
  'signed_mandate',
  'signed_disclosure_form',
  'signed_fica_declaration',
])

assert.equal(normalizeSellerBasePackKey('signed_mandate'), SELLER_BASE_PACK_KEYS.SIGNED_MANDATE)
assert.equal(normalizeSellerBasePackKey('property_condition_disclosure'), SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM)
assert.equal(normalizeSellerBasePackKey('signed_defect_form'), SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM)
assert.equal(normalizeSellerBasePackKey('signed_fica_form'), SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION)
assert.equal(normalizeSellerBasePackKey('seller_fica_pack'), SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION)

assert.ok(getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM).includes('property_condition_disclosure'))
assert.ok(getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION).includes('signed_fica_form'))
assert.ok(sellerBasePackKeysOverlap('signed_defect_form', 'signed_disclosure_form'))
assert.ok(sellerBasePackKeysOverlap('property_condition_disclosure', 'signed_disclosure_form'))
assert.ok(sellerBasePackKeysOverlap('signed_fica_form', 'signed_fica_declaration'))
assert.equal(sellerBasePackKeysOverlap('id_document', 'signed_fica_declaration'), false)
assert.equal(sellerBasePackKeysOverlap('gas_compliance_certificate', 'signed_fica_declaration'), false)

assert.equal(
  documentMatchesSellerRequirement(
    { document_type: 'property_condition_disclosure', status: 'uploaded' },
    { requirement_key: 'signed_disclosure_form' },
  ),
  true,
)
assert.equal(
  documentMatchesSellerRequirement(
    { document_type: 'signed_defect_form', status: 'uploaded' },
    { requirement_key: 'signed_disclosure_form' },
  ),
  true,
)
assert.equal(
  documentMatchesSellerRequirement(
    { document_type: 'signed_fica_form', status: 'uploaded' },
    { requirement_key: 'signed_fica_declaration' },
  ),
  true,
)
assert.equal(
  documentMatchesSellerRequirement(
    { document_type: 'id_document', status: 'uploaded' },
    { requirement_key: 'signed_fica_declaration' },
  ),
  false,
)
assert.equal(
  documentMatchesSellerRequirement(
    { document_type: 'signed_fica_declaration', status: 'uploaded' },
    { requirement_key: 'gas_compliance_certificate' },
  ),
  false,
)

const mergedBasePackRequirements = mergeSellerRequiredDocuments(
  { requirement_key: 'signed_disclosure_form', status: 'required', is_required: true },
  { requirement_key: 'signed_defect_form', status: 'required', is_required: true },
  { requirement_key: 'property_condition_disclosure', status: 'required', is_required: true },
  { requirement_key: 'signed_fica_declaration', status: 'required', is_required: true },
  { requirement_key: 'signed_fica_form', status: 'required', is_required: true },
)

assert.deepEqual(
  mergedBasePackRequirements.map((requirement) => normalizeSellerBasePackKey(requirement.requirement_key || requirement.key)),
  [SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM, SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION],
)

console.log('Seller base pack Phase 1 contract checks passed.')
