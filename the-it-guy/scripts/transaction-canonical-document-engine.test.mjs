import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildProjectedTransactionRequirementCandidates,
    buildTransactionDocumentFacts,
    shouldDisplayRequirementAtStage,
  } = await server.ssrLoadModule('/src/services/documents/transactionCanonicalDocumentRequirementService.js')
  const { BUYER_ONBOARDING_FLOW_VERSION } = await server.ssrLoadModule('/src/lib/buyerOnboardingFlowContract.js')

  const definitions = [
    {
      key: 'proof_of_funds',
      display_label: 'Proof of Funds',
      category: 'buyer_finance',
      pack_key: 'buyer_finance',
      default_requirement_level: 'blocker',
      default_visibility: ['buyer', 'agent'],
      default_upload_roles: ['buyer'],
    },
    {
      key: 'bond_approval',
      display_label: 'Bond Approval',
      category: 'buyer_finance',
      pack_key: 'buyer_finance',
      default_requirement_level: 'blocker',
      default_visibility: ['buyer', 'agent', 'bond_originator'],
      default_upload_roles: ['bond_originator', 'buyer'],
    },
    {
      key: 'bond_statement',
      display_label: 'Bond Statement',
      category: 'property_finance_existing_bond',
      pack_key: 'property_finance_existing_bond',
      default_requirement_level: 'required',
      default_visibility: ['seller', 'agent'],
      default_upload_roles: ['seller'],
    },
    {
      key: 'buyer_id_document',
      display_label: 'Buyer ID Document',
      category: 'buyer_identity_fica',
      pack_key: 'buyer_identity_fica',
      default_requirement_level: 'required',
      default_visibility: ['buyer', 'agent'],
      default_upload_roles: ['buyer'],
    },
    {
      key: 'buyer_proof_of_address',
      display_label: 'Buyer Proof of Address',
      category: 'buyer_identity_fica',
      pack_key: 'buyer_identity_fica',
      default_requirement_level: 'required',
      default_visibility: ['buyer', 'agent'],
      default_upload_roles: ['buyer'],
    },
    {
      key: 'buyer_company_registration',
      display_label: 'Buyer Company Registration',
      category: 'buyer_identity_fica',
      pack_key: 'buyer_identity_fica',
      default_requirement_level: 'required',
      default_visibility: ['buyer', 'agent'],
      default_upload_roles: ['buyer'],
    },
    {
      key: 'buyer_trust_deed',
      display_label: 'Buyer Trust Deed',
      category: 'buyer_identity_fica',
      pack_key: 'buyer_identity_fica',
      default_requirement_level: 'required',
      default_visibility: ['buyer', 'agent'],
      default_upload_roles: ['buyer'],
    },
  ]

  const rules = [
    {
      id: 'rule-proof-of-funds',
      document_definition_key: 'proof_of_funds',
      pack_key: 'buyer_finance',
      context_type: 'transaction',
      condition_json: { fact: 'purchase.finance_type', operator: 'in', value: ['cash', 'hybrid'] },
      requirement_level: 'blocker',
      stage_gates: ['finance_ready'],
      requested_from_role: 'buyer',
      visible_to_roles: ['buyer', 'agent'],
      uploadable_by_roles: ['buyer'],
      reviewer_role: 'agent',
      priority: 10,
    },
    {
      id: 'rule-bond-approval',
      document_definition_key: 'bond_approval',
      pack_key: 'buyer_finance',
      context_type: 'transaction',
      condition_json: { fact: 'purchase.finance_type', operator: 'in', value: ['bond', 'hybrid'] },
      requirement_level: 'blocker',
      stage_gates: ['finance_ready'],
      requested_from_role: 'bond_originator',
      visible_to_roles: ['buyer', 'agent', 'bond_originator'],
      uploadable_by_roles: ['bond_originator', 'buyer'],
      reviewer_role: 'bond_originator',
      priority: 20,
    },
    {
      id: 'rule-bond-statement',
      document_definition_key: 'bond_statement',
      pack_key: 'property_finance_existing_bond',
      context_type: 'transaction',
      condition_json: { fact: 'seller.existing_bond', operator: 'eq', value: true },
      requirement_level: 'required',
      stage_gates: ['attorney_instruction_ready'],
      requested_from_role: 'seller',
      visible_to_roles: ['seller', 'agent'],
      uploadable_by_roles: ['seller'],
      reviewer_role: 'transferring_attorney',
      priority: 30,
    },
  ]

  const otpBondTransaction = {
    id: 'tx-bond-otp',
    finance_type: 'bond',
    purchaser_type: 'individual',
    seller_has_existing_bond: false,
    current_main_stage: 'OTP',
    stage: 'OTP Signed',
    onboarding_status: 'Submitted',
  }

  const otpFacts = buildTransactionDocumentFacts({
    transaction: otpBondTransaction,
    formData: { purchaser_type: 'individual', purchase_finance_type: 'bond' },
    documents: [],
    subprocesses: [],
  })

  assert.equal(otpFacts.purchase.finance_type, 'bond')
  assert.equal(otpFacts.workflow.current_main_stage, 'OTP')

  const buyerFlowSnapshot = {
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

  const snapshotFacts = buildTransactionDocumentFacts({
    transaction: {
      ...otpBondTransaction,
      buyer_entity_type: 'individual',
      buyer_onboarding_flow: buyerFlowSnapshot,
    },
    formData: {
      purchaser_type: 'individual',
      purchase_finance_type: 'cash',
      buyer_onboarding_flow: buyerFlowSnapshot,
    },
    documents: [],
    subprocesses: [],
  })

  assert.equal(snapshotFacts.buyer.branch, 'company')
  assert.equal(snapshotFacts.buyer.purchase_mode, 'individual')
  assert.equal(snapshotFacts.buyer.finance_support_mode, 'originator_led')
  assert.equal(snapshotFacts.buyer.onboarding_flow_version, BUYER_ONBOARDING_FLOW_VERSION)
  assert.equal(snapshotFacts.buyer.onboarding_flow?.source_version, 'buyer_onboarding_flow_v1')
  assert.equal(snapshotFacts.buyer.onboarding_flow?.buyer_branch, 'company')

  const preFinanceVisibility = shouldDisplayRequirementAtStage({
    stageGates: ['finance_ready'],
    preCollectionAllowed: false,
    facts: otpFacts,
  })
  assert.equal(preFinanceVisibility.visible, false)
  assert.equal(preFinanceVisibility.blocking, false)

  const preCollectionVisibility = shouldDisplayRequirementAtStage({
    stageGates: ['finance_ready'],
    preCollectionAllowed: true,
    facts: otpFacts,
  })
  assert.equal(preCollectionVisibility.visible, true)
  assert.equal(preCollectionVisibility.blocking, false)

  const financeFacts = buildTransactionDocumentFacts({
    transaction: {
      ...otpBondTransaction,
      current_main_stage: 'FIN',
      stage: 'Finance Pending',
    },
    formData: { purchaser_type: 'individual', purchase_finance_type: 'bond' },
    documents: [],
    subprocesses: [],
  })
  const financeVisibility = shouldDisplayRequirementAtStage({
    stageGates: ['finance_ready'],
    preCollectionAllowed: false,
    facts: financeFacts,
  })
  assert.equal(financeVisibility.visible, true)
  assert.equal(financeVisibility.blocking, true)

  const cashCandidates = buildProjectedTransactionRequirementCandidates({
    transaction: {
      id: 'tx-cash',
      finance_type: 'cash',
      purchaser_type: 'individual',
      seller_has_existing_bond: false,
      current_main_stage: 'OTP',
      stage: 'OTP Signed',
      onboarding_status: 'Submitted',
    },
    formData: { purchaser_type: 'individual', purchase_finance_type: 'cash' },
    documents: [],
    subprocesses: [],
    rules,
    definitions,
  })
  const cashKeys = cashCandidates.candidates.map((candidate) => candidate.generated.document_definition_key)
  assert.equal(cashKeys.includes('bond_approval'), false)
  assert.equal(cashKeys.includes('proof_of_funds'), true)

  const existingBondCandidates = buildProjectedTransactionRequirementCandidates({
    transaction: {
      id: 'tx-existing-bond',
      finance_type: 'bond',
      purchaser_type: 'individual',
      seller_has_existing_bond: true,
      current_main_stage: 'ATTY',
      stage: 'Proceed to Attorneys',
      onboarding_status: 'Submitted',
    },
    formData: { purchaser_type: 'individual', purchase_finance_type: 'bond' },
    documents: [],
    subprocesses: [],
    rules,
    definitions,
  })
  const existingBondKeys = existingBondCandidates.candidates.map((candidate) => candidate.generated.document_definition_key)
  assert.equal(existingBondKeys.includes('bond_statement'), true)
  assert.equal(existingBondKeys.includes('bond_approval'), true)

  const companyBuyerCandidates = buildProjectedTransactionRequirementCandidates({
    transaction: {
      id: 'tx-company-buyer',
      finance_type: 'cash',
      purchaser_type: 'company',
      seller_has_existing_bond: false,
      current_main_stage: 'OTP',
      stage: 'OTP Signed',
      onboarding_status: 'Submitted',
    },
    formData: { purchaser_type: 'company', purchase_finance_type: 'cash' },
    documents: [],
    subprocesses: [],
    rules,
    definitions,
  })
  const companyBuyerKeys = companyBuyerCandidates.candidates.map((candidate) => candidate.generated.document_definition_key)
  assert.equal(companyBuyerKeys.includes('buyer_company_registration'), true)
  assert.equal(companyBuyerKeys.includes('buyer_company_resolution'), false)
  assert.equal(companyBuyerKeys.includes('buyer_company_registration_documents'), false)

  const trustBuyerCandidates = buildProjectedTransactionRequirementCandidates({
    transaction: {
      id: 'tx-trust-buyer',
      finance_type: 'cash',
      purchaser_type: 'trust',
      seller_has_existing_bond: false,
      current_main_stage: 'OTP',
      stage: 'OTP Signed',
      onboarding_status: 'Submitted',
    },
    formData: { purchaser_type: 'trust', purchase_finance_type: 'cash' },
    documents: [],
    subprocesses: [],
    rules,
    definitions,
  })
  const trustBuyerKeys = trustBuyerCandidates.candidates.map((candidate) => candidate.generated.document_definition_key)
  assert.equal(trustBuyerKeys.includes('buyer_trust_deed'), true)
  assert.equal(trustBuyerKeys.includes('buyer_letters_of_authority'), false)
  assert.equal(trustBuyerKeys.includes('buyer_trustee_resolution'), false)

  console.log('transaction canonical document engine tests passed')
} finally {
  await server.close()
}
