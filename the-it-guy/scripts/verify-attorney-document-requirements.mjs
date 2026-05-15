import {
  resolveAttorneySigningRequirements,
  resolveLegalDocumentRequirements,
} from '../src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function ids(output) {
  return new Set((output.requirements || []).map((item) => item.id))
}

function roleCount(output, attorneyRole) {
  return (output.requirements || []).filter((item) => item.attorneyRole === attorneyRole).length
}

const cashIndividual = resolveLegalDocumentRequirements({
  id: 'cash-individual',
  finance_type: 'cash',
  transaction_type: 'private_sale',
  buyer_entity_type: 'individual',
  seller_entity_type: 'individual',
})
assert(roleCount(cashIndividual, 'transfer_attorney') > 0, 'Cash deal should have transfer requirements.')
assert(roleCount(cashIndividual, 'bond_attorney') === 0, 'Cash deal must not have bond requirements.')
assert(roleCount(cashIndividual, 'cancellation_attorney') === 0, 'Cash deal without seller bond must not have cancellation requirements.')
assert(ids(cashIndividual).has('buyer_id_document'), 'Individual buyer ID requirement missing.')
assert(ids(cashIndividual).has('seller_id_document'), 'Individual seller ID requirement missing.')

const bondCompany = resolveLegalDocumentRequirements({
  id: 'bond-company',
  finance_type: 'bond',
  transaction_type: 'resale',
  buyer_entity_type: 'company',
  seller_entity_type: 'individual',
})
assert(roleCount(bondCompany, 'bond_attorney') > 0, 'Bond deal should have bond requirements.')
assert(ids(bondCompany).has('buyer_company_resolution'), 'Company buyer resolution requirement missing.')
assert(ids(bondCompany).has('bond_instruction'), 'Bond instruction requirement missing.')

const hybridTrustCancellation = resolveLegalDocumentRequirements({
  id: 'hybrid-trust-cancellation',
  finance_type: 'hybrid',
  transaction_type: 'commercial',
  buyer_entity_type: 'trust',
  seller_entity_type: 'company',
  seller_has_existing_bond: true,
  property_type: 'commercial',
})
assert(roleCount(hybridTrustCancellation, 'bond_attorney') > 0, 'Hybrid deal should have bond requirements.')
assert(roleCount(hybridTrustCancellation, 'cancellation_attorney') > 0, 'Seller existing bond should have cancellation requirements.')
assert(ids(hybridTrustCancellation).has('buyer_trust_deed'), 'Trust buyer deed requirement missing.')
assert(ids(hybridTrustCancellation).has('seller_company_resolution'), 'Company seller resolution requirement missing.')
assert(ids(hybridTrustCancellation).has('vat_status_confirmation'), 'Commercial VAT requirement missing.')
assert(ids(hybridTrustCancellation).has('cancellation_figures'), 'Cancellation figures requirement missing.')

const development = resolveLegalDocumentRequirements({
  id: 'development-sale',
  finance_type: 'cash',
  transaction_type: 'development_sale',
  buyer_entity_type: 'individual',
  seller_entity_type: 'company',
  development_id: 'dev-1',
})
assert(ids(development).has('developer_sale_pack'), 'Development sale pack requirement missing.')
assert(ids(development).has('unit_schedule'), 'Development unit schedule requirement missing.')

const signing = resolveAttorneySigningRequirements(hybridTrustCancellation.facts)
const signingIds = new Set(signing.signingRequirements.map((item) => item.id))
assert(signingIds.has('buyer_transfer_signature'), 'Buyer transfer signing requirement missing.')
assert(signingIds.has('buyer_bond_documents_signature'), 'Buyer bond signing requirement missing.')
assert(signingIds.has('seller_cancellation_documents_signature'), 'Seller cancellation signing requirement missing.')

console.log('Attorney document requirement verification passed.')
