export const ATTORNEY_RELEASE_PHASE0_VERSION = 'attorney-release-readiness-phase0-v1'

export const ATTORNEY_RELEASE_ROLES = Object.freeze([
  Object.freeze({ key: 'transfer', transactionRole: 'transfer_attorney', label: 'Transfer Attorney', envPrefix: 'ATTORNEY_TRANSFER_UAT' }),
  Object.freeze({ key: 'bond', transactionRole: 'bond_attorney', label: 'Bond Attorney', envPrefix: 'ATTORNEY_BOND_UAT' }),
  Object.freeze({ key: 'cancellation', transactionRole: 'cancellation_attorney', label: 'Cancellation Attorney', envPrefix: 'ATTORNEY_CANCELLATION_UAT' }),
])

export const ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS = Object.freeze([
  'attorney_matter_workspace', 'transaction_workspace', 'attorney_operations',
  'agent_transaction_view', 'buyer_portal', 'seller_portal',
])

export const ATTORNEY_RELEASE_SCENARIOS = Object.freeze([
  Object.freeze({ key: 'cash_individual_no_cancellation', financeType: 'cash', buyerType: 'individual', sellerType: 'individual', sellerHasExistingBond: false, lanes: ['transfer'] }),
  Object.freeze({ key: 'bond_married_existing_bond', financeType: 'bond', buyerType: 'married_individual', sellerType: 'individual', sellerHasExistingBond: true, lanes: ['transfer', 'bond', 'cancellation'] }),
  Object.freeze({ key: 'hybrid_multiple_buyers', financeType: 'hybrid', buyerType: 'multiple_individuals', sellerType: 'individual', sellerHasExistingBond: false, lanes: ['transfer', 'bond'] }),
  Object.freeze({ key: 'company_buyer', financeType: 'bond', buyerType: 'company', sellerType: 'individual', sellerHasExistingBond: false, lanes: ['transfer', 'bond'] }),
  Object.freeze({ key: 'trust_seller_cancellation', financeType: 'cash', buyerType: 'individual', sellerType: 'trust', sellerHasExistingBond: true, lanes: ['transfer', 'cancellation'] }),
  Object.freeze({ key: 'unknown_facts_review', financeType: 'unknown', buyerType: 'individual', sellerType: 'individual', sellerHasExistingBond: null, lanes: ['transfer'], expectedDecision: 'review' }),
])

export const ATTORNEY_RELEASE_UPDATE_VISIBILITY = Object.freeze({
  internal: Object.freeze(['attorney_matter_workspace', 'attorney_operations']),
  professional_shared: Object.freeze(['attorney_matter_workspace', 'transaction_workspace', 'attorney_operations', 'agent_transaction_view']),
  client_visible: Object.freeze(['attorney_matter_workspace', 'transaction_workspace', 'attorney_operations', 'agent_transaction_view', 'buyer_portal', 'seller_portal']),
})
