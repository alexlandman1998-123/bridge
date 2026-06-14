import assert from 'node:assert/strict'
import { deriveOnboardingConfiguration } from '../src/lib/purchaserPersonas.js'
import { getBuyerRequirementProfile } from '../src/lib/buyerRequirementEngine.js'
import {
  BUYER_ONBOARDING_FLOW_VERSION,
  resolveBuyerBranch,
  resolveBuyerFinanceBranch,
  resolveBuyerOnboardingFlowContract,
  resolveBuyerPurchaseMode,
} from '../src/lib/buyerOnboardingFlowContract.js'
import {
  getBuyerOnboardingBranchSummary,
  getBuyerOnboardingDocumentTriggers,
  getBuyerOnboardingRequiredFields,
  getBuyerOnboardingVisibleFields,
  resolveBuyerOnboardingFlow as resolveBuyerOnboardingFlowWrapper,
} from '../src/lib/buyerOnboardingFlow.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function asSet(values = []) {
  return new Set(values)
}

function assertIncludes(actual, expected, label) {
  for (const value of expected) {
    assert.equal(actual.has(value), true, `${label}: expected ${value}`)
  }
}

function assertNoDuplicates(values = [], label) {
  const seen = new Set()
  for (const value of values) {
    assert.equal(seen.has(value), false, `${label}: duplicate ${value}`)
    seen.add(value)
  }
}

test('resolves natural person purchase mode separately from legal branch', () => {
  const flow = resolveBuyerOnboardingFlowContract({
    purchaser_type: 'individual',
    purchaser_entity_type: 'individual',
    natural_person_purchase_mode: 'co_purchasing',
    purchasers: [
      { first_name: 'Alex', last_name: 'Buyer' },
      { first_name: 'Kim', last_name: 'Buyer' },
    ],
    purchase_finance_type: 'cash',
  })

  assert.equal(flow.version, BUYER_ONBOARDING_FLOW_VERSION)
  assert.equal(flow.purchaser_branch, 'individual')
  assert.equal(flow.purchase_mode, 'co_purchasing')
  assert.equal(flow.finance_branch, 'cash')
  assertIncludes(
    asSet(flow.required_fields),
    ['buyer.person.first_name', 'buyer.person.last_name', 'buyer.co_purchasers[].first_name', 'buyer.co_purchasers[].ownership_share', 'finance.cash_funds_confirmed'],
    'co-purchasing required fields',
  )
  assertIncludes(asSet(flow.document_triggers), ['co_purchaser_id_document', 'co_purchaser_proof_of_address', 'proof_of_funds'], 'co-purchasing document triggers')
  assertNoDuplicates(flow.visible_fields, 'co-purchasing visible fields')
  assert.equal(flow.branch_summary.purchase_mode.key, 'co_purchasing')
})

test('resolves married and foreign branches using legal signals', () => {
  assert.equal(resolveBuyerBranch({ purchaser_type: 'individual', marital_status: 'married', marital_regime: 'in_community' }), 'married_coc')
  assert.equal(resolveBuyerBranch({ purchaser_type: 'individual', marital_status: 'married', marital_regime: 'out_of_community' }), 'married_anc')
  assert.equal(resolveBuyerBranch({ purchaser_type: 'individual', marital_status: 'married', marital_regime: 'out_of_community_with_accrual' }), 'married_anc_accrual')
  assert.equal(
    resolveBuyerBranch({
      purchaser_type: 'individual',
      nationality: 'German',
      passport_number: 'C1234567',
      residency_status: 'foreign_national',
    }),
    'foreign_purchaser',
  )
  assert.equal(resolveBuyerPurchaseMode({ natural_person_purchase_mode: 'joint_buyer' }), 'co_purchasing')
  assert.equal(resolveBuyerFinanceBranch({ purchase_finance_type: 'cash + bond' }), 'hybrid')
})

test('captures company and trust authority data in the contract', () => {
  const companyFlow = resolveBuyerOnboardingFlowContract({
    purchaser_type: 'company',
    purchaser_entity_type: 'company',
    company_name: 'Bridge Nine Properties (Pty) Ltd',
    company_registration_number: '2024/123456/07',
    authorised_signatory_name: 'Alex Principal',
    authorised_signatory_identity_number: '9001015009083',
    authorised_signatory_email: 'alex@example.com',
    authorised_signatory_phone: '0820000000',
    purchase_finance_type: 'bond',
  })

  assert.equal(companyFlow.purchaser_branch, 'company')
  assert.equal(companyFlow.purchase_mode, 'individual')
  assertIncludes(
    asSet(companyFlow.required_fields),
    [
      'buyer.company.name',
      'buyer.company.registration_number',
      'buyer.company.authorised_signatory.name',
      'buyer.company.authorised_signatory.identity_number_or_passport_number',
      'buyer.company.authorised_signatory.email',
      'buyer.company.authorised_signatory.phone',
      'finance.bond_process_started',
      'finance.bond_help_requested',
      'finance.affordability_confirmed',
    ],
    'company required fields',
  )
  assertIncludes(
    asSet(companyFlow.optional_fields),
    ['buyer.company.directors', 'buyer.company.board_resolution_available', 'buyer.company.registered_address'],
    'company optional fields',
  )
  assertIncludes(asSet(companyFlow.document_triggers), ['cipc_registration', 'company_resolution', 'director_id'], 'company document triggers')

  const trustFlow = resolveBuyerOnboardingFlowContract({
    purchaser_type: 'trust',
    purchaser_entity_type: 'trust',
    trust_name: 'Taylor Family Trust',
    trust_registration_number: 'IT1234/2024',
    authorised_trustee_name: 'Taylor Trustee',
    authorised_trustee_identity_number: '9001015009084',
    authorised_trustee_email: 'trust@example.com',
    authorised_trustee_phone: '0840000000',
    trust_resolution_available: 'yes',
    purchase_finance_type: 'bond',
  })

  assert.equal(trustFlow.purchaser_branch, 'trust')
  assertIncludes(
    asSet(trustFlow.required_fields),
    [
      'buyer.trust.name',
      'buyer.trust.registration_number',
      'buyer.trust.authorised_trustee.name',
      'buyer.trust.authorised_trustee.identity_number_or_passport_number',
      'buyer.trust.authorised_trustee.email',
      'buyer.trust.authorised_trustee.phone',
      'buyer.trust.resolution_available',
      'finance.bond_process_started',
      'finance.bond_help_requested',
      'finance.affordability_confirmed',
    ],
    'trust required fields',
  )
  assertIncludes(
    asSet(trustFlow.optional_fields),
    ['buyer.trust.trustees', 'buyer.trust.all_trustees_signing', 'buyer.trust.masters_office_reference'],
    'trust optional fields',
  )
  assertIncludes(asSet(trustFlow.document_triggers), ['trust_deed', 'letters_of_authority', 'trust_resolution'], 'trust document triggers')
})

test('normalizes the shared buyer flow wrapper', () => {
  const flow = resolveBuyerOnboardingFlowWrapper({
    purchaser_type: 'company',
    purchaser_entity_type: 'company',
    company_name: 'Bridge Nine Properties (Pty) Ltd',
    company_registration_number: '2024/123456/07',
    authorised_signatory_name: 'Alex Principal',
    authorised_signatory_identity_number: '9001015009083',
    authorised_signatory_email: 'alex@example.com',
    authorised_signatory_phone: '0820000000',
    purchase_finance_type: 'hybrid',
    purchase_price: 2450000,
    cash_amount: 450000,
    bond_amount: 2000000,
    cash_contribution_available: 450000,
    cash_contribution_source: 'Savings',
    bank_statements_available: 'yes',
    bond_readiness_consent: 'yes',
  })

  assert.equal(flow.buyer_branch, 'company')
  assert.equal(flow.purchase_mode, 'individual')
  assert.equal(flow.finance_branch, 'hybrid')
  assert.equal(flow.finance_support_mode, 'self_managed')
  assertIncludes(
    asSet(getBuyerOnboardingRequiredFields(flow)),
    ['buyer.company.name', 'finance.purchase_price', 'finance.cash_funds_confirmed', 'finance.bond_process_started'],
    'shared required fields',
  )
  assertIncludes(
    asSet(getBuyerOnboardingVisibleFields(flow)),
    ['buyer.company.directors', 'finance.cash_amount', 'finance.bond_amount', 'finance.proof_of_funds_available', 'finance.bond_process_started', 'finance.bond_bank_name'],
    'shared visible fields',
  )
  assertIncludes(asSet(getBuyerOnboardingDocumentTriggers(flow)), ['cipc_registration', 'company_resolution', 'bond_approval'], 'shared document triggers')
  assert.equal(getBuyerOnboardingBranchSummary(flow).purchaser.key, 'company')
  assert.equal(getBuyerOnboardingBranchSummary(flow).finance.support_mode.key, 'self_managed')
})

test('prefers persisted buyer flow snapshots when hydrating the wrapper', () => {
  const persistedFlow = {
    version: BUYER_ONBOARDING_FLOW_VERSION,
    buyer_branch: 'company',
    buyer_branch_label: 'Company',
    buyer_purchase_mode: 'individual',
    buyer_purchase_mode_label: 'Individual',
    buyer_finance_branch: 'bond',
    buyer_finance_branch_label: 'Bond',
    buyer_finance_support_mode: 'self_managed',
    buyer_finance_support_mode_label: 'Self Managed',
    visible_fields: ['buyer.company.name', 'buyer.company.registration_number'],
    required_fields: ['buyer.company.name'],
    optional_fields: ['buyer.company.directors'],
    document_triggers: ['cipc_registration'],
    branch_summary: {
      purchaser: { key: 'company', label: 'Company', legal_type: 'company' },
      purchase_mode: { key: 'individual', label: 'Individual' },
      finance: {
        key: 'bond',
        label: 'Bond',
        support_mode: { key: 'self_managed', label: 'Self Managed' },
      },
    },
  }

  const flow = resolveBuyerOnboardingFlowWrapper({
    purchaser_type: 'individual',
    purchase_finance_type: 'cash',
    buyer_onboarding_flow: persistedFlow,
    company_name: 'Conflicting Values Pty Ltd',
  })

  assert.equal(flow.buyer_branch, 'company')
  assert.equal(flow.buyer_purchase_mode, 'individual')
  assert.equal(flow.buyer_finance_branch, 'bond')
  assertIncludes(asSet(flow.required_fields), ['buyer.company.name'], 'persisted flow required fields')
  assert.equal(getBuyerOnboardingBranchSummary(flow).purchaser.key, 'company')
})

test('hydrates the same flow contract through derived buyer profiles', () => {
  const formData = {
    purchaser_type: 'company',
    purchaser_entity_type: 'company',
    company_name: 'Bridge Nine Properties (Pty) Ltd',
    company_registration_number: '2024/123456/07',
    authorised_signatory_name: 'Alex Principal',
    authorised_signatory_identity_number: '9001015009083',
    authorised_signatory_email: 'alex@example.com',
    authorised_signatory_phone: '0820000000',
    purchase_finance_type: 'hybrid',
    purchase_price: 2450000,
    cash_amount: 450000,
    bond_amount: 2000000,
    cash_contribution_available: 450000,
    cash_contribution_source: 'Savings',
    bank_statements_available: 'yes',
    bond_readiness_consent: 'yes',
    employment_type: 'company director',
  }

  const derived = deriveOnboardingConfiguration(formData, { purchaserType: 'company', financeType: 'hybrid' })
  const profile = getBuyerRequirementProfile({ formData, financeType: 'hybrid', purchaserType: 'company' })

  assert.equal(derived.flow.version, BUYER_ONBOARDING_FLOW_VERSION)
  assert.equal(derived.flow.purchaser_branch, 'company')
  assert.equal(derived.flow.purchase_mode, 'individual')
  assert.equal(derived.flow.finance_branch, 'hybrid')
  assert.equal(derived.flow.branch_summary.purchaser.legal_type, 'company')
  assert.equal(derived.flow.finance_support_mode, 'self_managed')

  assert.equal(profile.flow.version, BUYER_ONBOARDING_FLOW_VERSION)
  assert.equal(profile.buyerOnboardingFlowVersion, BUYER_ONBOARDING_FLOW_VERSION)
  assert.equal(profile.buyerOnboardingFlow?.version, BUYER_ONBOARDING_FLOW_VERSION)
  assert.equal(profile.purchaseMode, 'individual')
  assert.equal(profile.buyerBranch, 'company')
  assert.equal(profile.financeBranch, 'hybrid')
  assert.equal(profile.financeSupportMode, 'self_managed')
  assert.equal(profile.branchSummary.purchaser.key, 'company')
})

test('tracks originator-assisted bond support mode separately from bond progress', () => {
  const flow = resolveBuyerOnboardingFlowContract({
    purchaser_type: 'individual',
    purchaser_entity_type: 'individual',
    natural_person_purchase_mode: 'individual',
    purchase_finance_type: 'bond',
    bond_process_started: 'yes',
    bond_current_status: 'application_in_progress',
    bond_bank_name: 'Standard Bank',
    bond_help_requested: 'yes',
    bond_originator_name: 'OOBA Finance',
    bond_originator_contact: 'help@ooba.co.za',
    bank_statements_available: 'yes',
    bond_readiness_consent: 'yes',
    affordability_confirmed: 'yes',
  })

  assert.equal(flow.finance_branch, 'bond')
  assert.equal(flow.finance_support_mode, 'originator_led')
  assert.equal(flow.branch_summary.finance.support_mode.key, 'originator_led')
  assertIncludes(
    asSet(flow.required_fields),
    ['finance.bond_originator_name', 'finance.bond_help_requested'],
    'originator-assisted required fields',
  )
  assertIncludes(
    asSet(flow.visible_fields),
    ['finance.bond_bank_name', 'finance.bond_originator_name', 'finance.bond_help_requested'],
    'originator-assisted visible fields',
  )
})

console.log('buyer onboarding flow contract tests passed')
