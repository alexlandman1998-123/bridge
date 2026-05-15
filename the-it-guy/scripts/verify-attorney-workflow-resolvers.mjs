import { resolveTransactionFacts } from '../src/services/attorneyWorkflow/transactionFactsResolver.js'
import {
  getAttorneyUpdateOptions,
  resolveAttorneyLanes,
  resolveLegalRequirements,
} from '../src/services/attorneyWorkflow/attorneyWorkflowResolver.js'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const fixtures = [
  {
    name: 'cash individual resale',
    transaction: {
      id: 'cash-individual',
      finance_type: 'cash',
      transaction_type: 'resale',
      buyer_entity_type: 'individual',
      seller_entity_type: 'individual',
      seller_has_existing_bond: false,
    },
    expectedRoles: ['transfer_attorney'],
  },
  {
    name: 'bond company buyer',
    transaction: {
      id: 'bond-company',
      finance_type: 'bond',
      transaction_type: 'private_sale',
      buyer_entity_type: 'company',
      seller_entity_type: 'individual',
    },
    expectedRoles: ['transfer_attorney', 'bond_attorney'],
    expectedDocuments: ['buyer_company_resolution'],
  },
  {
    name: 'hybrid trust seller cancellation',
    transaction: {
      id: 'hybrid-trust',
      funding_type: 'partial_bond',
      property_transaction_type: 'private_sale',
      buyer_entity_type: 'individual',
      seller_entity_type: 'trust',
      seller_has_existing_bond: true,
    },
    expectedRoles: ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'],
    expectedDocuments: ['seller_trust_deed', 'cancellation_figures'],
  },
  {
    name: 'development sale',
    transaction: {
      id: 'development',
      finance_type: 'cash',
      development_id: 'dev-1',
      buyer_type: 'trust',
      seller_type: 'company',
    },
    expectedRoles: ['transfer_attorney'],
    expectedDocuments: ['developer_documents', 'buyer_trust_deed', 'seller_company_resolution'],
  },
  {
    name: 'missing finance fallback',
    transaction: {
      id: 'missing-finance',
      transaction_type: 'commercial',
      property_type: 'commercial',
      buyer_entity_type: 'company',
      seller_entity_type: 'company',
    },
    expectedRoles: ['transfer_attorney'],
    expectedMissingFields: ['finance_type'],
  },
]

for (const fixture of fixtures) {
  const facts = resolveTransactionFacts(fixture.transaction)
  const lanes = resolveAttorneyLanes(facts)
  const requirements = resolveLegalRequirements(facts)

  for (const role of fixture.expectedRoles) {
    assert(requirements.requiredAttorneyRoles.includes(role), `${fixture.name}: expected required role ${role}`)
  }

  for (const role of requirements.requiredAttorneyRoles) {
    assert(fixture.expectedRoles.includes(role), `${fixture.name}: unexpected required role ${role}`)
  }

  for (const documentId of fixture.expectedDocuments || []) {
    assert(
      requirements.documentRequirements.some((requirement) => requirement.id === documentId),
      `${fixture.name}: expected document requirement ${documentId}`,
    )
  }

  for (const missingField of fixture.expectedMissingFields || []) {
    assert(facts.missingFields.includes(missingField), `${fixture.name}: expected missing field ${missingField}`)
  }

  assert(lanes.transfer.required, `${fixture.name}: transfer lane should always be required`)
}

assert(
  getAttorneyUpdateOptions({ finance_type: 'cash', buyer_entity_type: 'individual', seller_entity_type: 'individual' }, 'bond_attorney').length === 0,
  'cash deal should not expose bond update options',
)

assert(
  getAttorneyUpdateOptions({ finance_type: 'bond', buyer_entity_type: 'company', seller_entity_type: 'individual' }, 'bond_attorney').length > 0,
  'bond deal should expose bond update options',
)

console.log(`Attorney workflow resolver verification passed (${fixtures.length} fixtures).`)
