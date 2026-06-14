import assert from 'node:assert/strict'

import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
import { resolveTransactionFacts } from '../src/services/attorneyWorkflow/transactionFactsResolver.js'
import {
  resolveAttorneyLanes,
  resolveLegalRequirements,
} from '../src/services/attorneyWorkflow/attorneyWorkflowResolver.js'
import { resolveLegalDocumentRequirements } from '../src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js'
import { resolveWorkflowKeysForTransaction } from '../server/workflows/transactionWorkflowDefinitions.js'

function profileFor(transaction) {
  return resolveTransactionRoutingProfile({ transaction })
}

function transactionWithProfile(transaction) {
  return {
    ...transaction,
    routing_profile_json: profileFor(transaction),
  }
}

function ids(items = []) {
  return items.map((item) => item.id)
}

function assertIncludes(values, expected, message) {
  assert.equal(values.includes(expected), true, message)
}

{
  const transaction = transactionWithProfile({
    id: 'cash-freehold',
    finance_type: 'cash',
    transaction_type: 'resale',
    property_type: 'freehold house',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
  })
  const facts = resolveTransactionFacts(transaction)
  const lanes = resolveAttorneyLanes(facts)
  const workflowKeys = resolveWorkflowKeysForTransaction(transaction)

  assert.equal(facts.financeType, 'cash')
  assert.equal(facts.requiresBondAttorney, false)
  assert.equal(facts.requiresCancellationAttorney, false)
  assert.equal(lanes.bond.required, false)
  assert.deepEqual(workflowKeys, ['sales_otp', 'finance_cash', 'attorney_transfer', 'registration'])
}

{
  const transaction = transactionWithProfile({
    id: 'new-development-cash',
    finance_type: 'cash',
    transaction_type: 'development_sale',
    property_type: 'sectional title unit',
    buyer_entity_type: 'trust',
    seller_type: 'developer',
    development_id: 'dev-1',
    vat_treatment: 'vat',
  })
  const facts = resolveTransactionFacts(transaction)
  const requirements = resolveLegalDocumentRequirements(transaction)
  const requirementIds = ids(requirements.requirements)

  assert.equal(facts.transactionType, 'development_sale')
  assert.equal(facts.sellerEntityType, 'developer')
  assert.equal(facts.vatTreatment, 'vat')
  assert.equal(facts.requiresBondAttorney, false)
  assertIncludes(requirementIds, 'developer_sale_pack', 'Development sale should require developer pack documents.')
  assertIncludes(requirementIds, 'body_corporate_levy_clearance', 'Sectional development should require body corporate clearance.')
  assertIncludes(requirementIds, 'vat_status_confirmation', 'VAT-routed development should require VAT status confirmation.')
}

{
  const transaction = transactionWithProfile({
    id: 'bond-sectional-title',
    finance_type: 'bond',
    transaction_type: 'private_sale',
    property_type: 'sectional title apartment',
    buyer_entity_type: 'company',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
  })
  const facts = resolveTransactionFacts(transaction)
  const legalRequirements = resolveLegalRequirements(transaction)
  const documentRequirements = resolveLegalDocumentRequirements(transaction)
  const workflowKeys = resolveWorkflowKeysForTransaction(transaction)

  assert.equal(facts.financeType, 'bond')
  assert.equal(facts.propertyTenure, 'sectional_title')
  assert.equal(facts.requiresBondAttorney, true)
  assertIncludes(legalRequirements.requiredAttorneyRoles, 'bond_attorney', 'Bond sectional title should require bond attorney.')
  assertIncludes(ids(documentRequirements.requirements), 'body_corporate_levy_clearance', 'Sectional title should drive body corporate requirements.')
  assertIncludes(workflowKeys, 'finance_bond', 'Bond transaction should use the bond finance workflow.')
  assertIncludes(workflowKeys, 'attorney_bond', 'Bond transaction should initialize the attorney bond workflow.')
}

{
  const transaction = transactionWithProfile({
    id: 'hybrid-cancellation',
    funding_type: 'partial_bond',
    transaction_type: 'private_sale',
    property_type: 'estate hoa',
    buyer_entity_type: 'individual',
    seller_entity_type: 'trust',
    seller_has_existing_bond: true,
  })
  const facts = resolveTransactionFacts(transaction)
  const legalRequirements = resolveLegalRequirements(transaction)
  const documentRequirements = resolveLegalDocumentRequirements(transaction)
  const workflowKeys = resolveWorkflowKeysForTransaction(transaction)

  assert.equal(facts.financeType, 'hybrid')
  assert.equal(facts.propertyTenure, 'estate_hoa')
  assert.equal(facts.requiresBondAttorney, true)
  assert.equal(facts.requiresCancellationAttorney, true)
  assertIncludes(legalRequirements.requiredAttorneyRoles, 'cancellation_attorney', 'Existing seller bond should require cancellation attorney.')
  assertIncludes(ids(documentRequirements.requirements), 'hoa_levy_clearance', 'HOA/estate route should require HOA clearance.')
  assertIncludes(ids(documentRequirements.requirements), 'cancellation_figures', 'Cancellation route should require cancellation figures.')
  assertIncludes(workflowKeys, 'finance_hybrid', 'Hybrid transaction should use hybrid finance workflow.')
  assertIncludes(workflowKeys, 'seller_bond_cancellation', 'Existing seller bond should initialize cancellation workflow.')
}

{
  const staleTransaction = {
    id: 'profile-overrides-stale-columns',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    property_type: 'freehold house',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    routing_profile_json: {
      financeType: 'bond',
      transactionType: 'private_sale',
      propertyTenure: 'sectional_title',
      buyerEntityType: 'company',
      sellerEntityType: 'individual',
      sellerHasExistingBond: true,
      cancellationRequired: true,
      requiresBondAttorney: true,
      requiresCancellationAttorney: true,
      requiredWorkflowKeys: ['sales_otp', 'finance_bond', 'attorney_transfer', 'attorney_bond', 'seller_bond_cancellation', 'registration'],
    },
  }
  const facts = resolveTransactionFacts(staleTransaction)
  assert.equal(facts.financeType, 'bond')
  assert.equal(facts.propertyTenure, 'sectional_title')
  assert.equal(facts.rawFieldsUsed.financeType, 'routing_profile_json.financeType')
  assert.deepEqual(resolveWorkflowKeysForTransaction(staleTransaction), staleTransaction.routing_profile_json.requiredWorkflowKeys)
}

{
  const buyerOnboardingFlow = {
    version: 'buyer_onboarding_flow_v1',
    buyer_branch: 'company',
    buyer_branch_label: 'Company',
    buyer_purchase_mode: 'individual',
    buyer_purchase_mode_label: 'Individual',
    buyer_finance_branch: 'hybrid',
    buyer_finance_branch_label: 'Hybrid',
    buyer_finance_support_mode: 'originator_led',
    buyer_finance_support_mode_label: 'Originator Assisted',
    visible_fields: ['buyer.company.name'],
    required_fields: ['buyer.company.name'],
    optional_fields: ['buyer.company.directors'],
    document_triggers: ['cipc_registration'],
    branch_summary: {
      purchaser: { key: 'company', label: 'Company', legal_type: 'company' },
      purchase_mode: { key: 'individual', label: 'Individual' },
      finance: {
        key: 'hybrid',
        label: 'Hybrid',
        support_mode: { key: 'originator_led', label: 'Originator Assisted' },
      },
    },
  }
  const transaction = transactionWithProfile({
    id: 'buyer-flow-snapshot-overrides',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    property_type: 'freehold house',
    buyer_entity_type: 'individual',
    onboardingFormData: {
      purchaser_type: 'individual',
      purchase_finance_type: 'cash',
      buyer_onboarding_flow: buyerOnboardingFlow,
    },
  })
  const facts = resolveTransactionFacts(transaction)

  assert.equal(facts.buyerBranch, 'company')
  assert.equal(facts.buyerPurchaseMode, 'individual')
  assert.equal(facts.buyerFinanceSupportMode, 'originator_led')
  assert.equal(facts.buyerOnboardingFlowVersion, 'buyer_onboarding_flow_v1')
  assert.equal(facts.buyerOnboardingFlow?.buyer_branch, 'company')
}

console.log('transaction-routing-workflow-adaptation tests passed')
