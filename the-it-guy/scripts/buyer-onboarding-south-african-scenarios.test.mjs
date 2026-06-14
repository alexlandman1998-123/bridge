import assert from 'node:assert/strict'

import { deriveOnboardingConfiguration, validateOnboardingSubmission } from '../src/lib/purchaserPersonas.js'
import { getBuyerRequirementProfile } from '../src/lib/buyerRequirementEngine.js'
import { getBuyerOnboardingVisibleFields, resolveBuyerOnboardingFlow } from '../src/lib/buyerOnboardingFlow.js'
import {
  resolveTransactionFacts,
} from '../src/services/attorneyWorkflow/transactionFactsResolver.js'
import {
  resolveLegalDocumentRequirements,
} from '../src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js'
import {
  resolveTransactionRoutingProfile,
} from '../src/services/transactionRoutingProfileService.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function keySet(items = []) {
  return new Set(
    items
      .map((item) => item?.key || item?.id || item?.document_definition_key || item?.generated?.document_definition_key)
      .filter(Boolean),
  )
}

function assertIncludes(actualSet, expectedValues, label) {
  for (const value of expectedValues) {
    assert.equal(actualSet.has(value), true, `${label}: expected ${value}`)
  }
}

function assertNoDuplicates(values = [], label) {
  const seen = new Set()
  for (const value of values) {
    assert.equal(seen.has(value), false, `${label}: duplicate ${value}`)
    seen.add(value)
  }
}

function naturalPersonBase(overrides = {}) {
  return {
    purchaser_type: 'individual',
    purchaser_entity_type: 'individual',
    first_name: 'Alex',
    last_name: 'Buyer',
    date_of_birth: '1990-01-01',
    identity_number: '9001015009083',
    passport_number: '',
    nationality: 'South African',
    residency_status: 'sa_citizen',
    tax_number: '9001015009',
    email: 'alex@example.com',
    phone: '0821234567',
    residential_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
    postal_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
    street_address: '54 Menlyn Avenue',
    suburb: 'Waterkloof Glen',
    city: 'Pretoria',
    postal_code: '0181',
    marital_status: 'single',
    marital_regime: 'not_applicable',
    number_of_dependants: '0',
    monthly_credit_commitments: '2500',
    first_time_buyer: 'yes',
    primary_residence: 'yes',
    investment_purchase: 'no',
    purchase_finance_type: 'cash',
    finance: {
      purchase_price: '2450000',
      cash_amount: '2450000',
      proof_of_funds_available: 'yes',
      source_of_funds: 'Savings',
      cash_funds_confirmed: 'yes',
    },
    ...overrides,
  }
}

function companyDirector(name, suffix, signingAuthority = false) {
  return {
    full_name: name,
    id_number: `90010150090${String(suffix).padStart(2, '0')}`,
    phone: `082123450${suffix}`,
    email: `${name.toLowerCase().replaceAll(' ', '.')}@example.com`,
    residential_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
    signing_authority: signingAuthority ? 'yes' : 'no',
  }
}

function trustTrustee(name, suffix, signingAuthority = false) {
  return {
    full_name: name,
    id_number: `90010150091${String(suffix).padStart(2, '0')}`,
    phone: `083123450${suffix}`,
    email: `${name.toLowerCase().replaceAll(' ', '.')}@example.com`,
    residential_address: '22 Main Road, Cape Town, Western Cape, 8001',
    signing_authority: signingAuthority ? 'yes' : 'no',
  }
}

function companyForm({ purchaseFinanceType = 'bond', bondHelpRequested = 'no' } = {}) {
  const finance =
    purchaseFinanceType === 'hybrid'
      ? {
          purchase_price: '2450000',
          cash_amount: '450000',
          bond_amount: '2000000',
          proof_of_funds_available: 'yes',
          source_of_funds: 'Retained earnings',
          cash_funds_confirmed: 'yes',
          bond_process_started: 'yes',
          bond_current_status: 'application_in_progress',
          bond_bank_name: 'Standard Bank',
          bond_help_requested: bondHelpRequested,
          bond_originator_name: bondHelpRequested === 'yes' ? 'OOBA Finance' : '',
          bond_originator_contact: bondHelpRequested === 'yes' ? 'help@ooba.co.za' : '',
          bank_statements_available: 'yes',
          bond_readiness_consent: 'yes',
          affordability_confirmed: 'yes',
        }
      : {
          purchase_price: '2450000',
          bond_amount: '2450000',
          bond_process_started: 'yes',
          bond_current_status: 'application_in_progress',
          bond_bank_name: 'Standard Bank',
          bond_help_requested: bondHelpRequested,
          bond_originator_name: bondHelpRequested === 'yes' ? 'OOBA Finance' : '',
          bond_originator_contact: bondHelpRequested === 'yes' ? 'help@ooba.co.za' : '',
          bank_statements_available: 'yes',
          bond_readiness_consent: 'yes',
          affordability_confirmed: 'yes',
        }

  return {
    purchaser_type: 'company',
    purchaser_entity_type: 'company',
    company: {
      company_name: 'Bridge Nine Properties (Pty) Ltd',
      company_registration_number: '2024/123456/07',
      registered_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
      business_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
      tax_number: '9001015009',
      vat_number: '4123456789',
      nature_of_business: 'Property investment',
      authorised_signatory_name: 'Alex Principal',
      authorised_signatory_identity_number: '9001015009083',
      authorised_signatory_email: 'alex@example.com',
      authorised_signatory_phone: '0821234567',
      authorised_signatory_capacity: 'Director',
      directors: [
        companyDirector('Alex Principal', '1', true),
        companyDirector('Sam Director', '2', false),
      ],
      board_resolution_available: 'yes',
    },
    company_name: 'Bridge Nine Properties (Pty) Ltd',
    company_registration_number: '2024/123456/07',
    authorised_signatory_name: 'Alex Principal',
    authorised_signatory_identity_number: '9001015009083',
    authorised_signatory_email: 'alex@example.com',
    authorised_signatory_phone: '0821234567',
    purchase_finance_type: purchaseFinanceType,
    finance,
  }
}

function trustForm({ purchaseFinanceType = 'bond', bondHelpRequested = 'no' } = {}) {
  const finance =
    purchaseFinanceType === 'hybrid'
      ? {
          purchase_price: '2450000',
          cash_amount: '450000',
          bond_amount: '2000000',
          proof_of_funds_available: 'yes',
          source_of_funds: 'Trust funds and retained earnings',
          cash_funds_confirmed: 'yes',
          bond_process_started: 'yes',
          bond_current_status: 'application_in_progress',
          bond_bank_name: 'Nedbank',
          bond_help_requested: bondHelpRequested,
          bond_originator_name: bondHelpRequested === 'yes' ? 'OOBA Finance' : '',
          bond_originator_contact: bondHelpRequested === 'yes' ? 'help@ooba.co.za' : '',
          bank_statements_available: 'yes',
          bond_readiness_consent: 'yes',
          affordability_confirmed: 'yes',
        }
      : {
          purchase_price: '2450000',
          bond_amount: '2450000',
          bond_process_started: 'yes',
          bond_current_status: 'application_in_progress',
          bond_bank_name: 'Nedbank',
          bond_help_requested: bondHelpRequested,
          bond_originator_name: bondHelpRequested === 'yes' ? 'OOBA Finance' : '',
          bond_originator_contact: bondHelpRequested === 'yes' ? 'help@ooba.co.za' : '',
          bank_statements_available: 'yes',
          bond_readiness_consent: 'yes',
          affordability_confirmed: 'yes',
        }

  return {
    purchaser_type: 'trust',
    purchaser_entity_type: 'trust',
    trust: {
      trust_name: 'Taylor Family Trust',
      trust_registration_number: 'IT1234/2024',
      trust_type: 'family_trust',
      masters_office_reference: 'MO/2024/1234',
      registered_address: '22 Main Road, Cape Town, Western Cape, 8001',
      tax_number: '9001015009',
      contact_name: 'Taylor Trust Office',
      contact_email: 'trust@example.com',
      contact_phone: '0841234567',
      authorised_trustee_name: 'Taylor Trustee',
      authorised_trustee_identity_number: '9001015009183',
      authorised_trustee_email: 'trust@example.com',
      authorised_trustee_phone: '0841234567',
      resolution_available: 'yes',
      all_trustees_signing: 'no',
      trustees: [
        trustTrustee('Taylor Trustee', '1', true),
        trustTrustee('Nadia Trustee', '2', false),
      ],
    },
    trust_name: 'Taylor Family Trust',
    trust_registration_number: 'IT1234/2024',
    authorised_trustee_name: 'Taylor Trustee',
    authorised_trustee_identity_number: '9001015009183',
    authorised_trustee_email: 'trust@example.com',
    authorised_trustee_phone: '0841234567',
    trust_resolution_available: 'yes',
    purchase_finance_type: purchaseFinanceType,
    finance,
  }
}

function assertBuyerScenario({
  name,
  formData,
  expectedBranch,
  expectedPurchaseMode,
  expectedFinanceBranch,
  expectedDocumentKeys = [],
  expectedVisibleFields = [],
  profileChecks = [],
}) {
  test(name, () => {
    const config = deriveOnboardingConfiguration(formData, {
      purchaserType: formData.purchaser_type,
      financeType: formData.purchase_finance_type,
    })
    const flow = resolveBuyerOnboardingFlow(formData, {}, {
      purchaserType: formData.purchaser_type,
      financeType: formData.purchase_finance_type,
    })
    const profile = getBuyerRequirementProfile({
      formData,
      purchaserType: formData.purchaser_type,
      financeType: formData.purchase_finance_type,
    })

    validateOnboardingSubmission(formData, {
      purchaserType: formData.purchaser_type,
      financeType: formData.purchase_finance_type,
    })

    assert.equal(flow.buyer_branch, expectedBranch)
    assert.equal(flow.purchase_mode, expectedPurchaseMode)
    assert.equal(flow.finance_branch, expectedFinanceBranch)
    assert.equal(profile.buyerBranch, expectedBranch)
    assert.equal(profile.purchaseMode, expectedPurchaseMode)
    assert.equal(profile.financeBranch, expectedFinanceBranch)
    assertNoDuplicates(config.requiredDocuments, `${name} document definitions`)
    assertIncludes(keySet(config.requiredDocuments), expectedDocumentKeys, `${name} required documents`)
    if (expectedVisibleFields.length) {
      assertIncludes(new Set(getBuyerOnboardingVisibleFields(flow)), expectedVisibleFields, `${name} visible fields`)
    }

    for (const check of profileChecks) {
      check({ config, flow, profile })
    }
  })
}

function assertTransactionScenario({
  name,
  transaction,
  expectedPropertyTenure,
  expectedWorkflowTemplateKey,
  requiredWorkflowKeys = [],
  requiredDocumentGroups = [],
  requiredDocumentKeys = [],
  absentDocumentKeys = [],
  factChecks = [],
}) {
  test(name, () => {
    const routingProfile = resolveTransactionRoutingProfile({ transaction })
    const facts = resolveTransactionFacts(transaction)
    const legalRequirements = resolveLegalDocumentRequirements(transaction)

    assert.equal(routingProfile.propertyTenure, expectedPropertyTenure)
    assert.equal(routingProfile.workflowTemplateKey, expectedWorkflowTemplateKey)
    assertNoDuplicates(legalRequirements.requirements, `${name} legal requirements`)
    if (requiredWorkflowKeys.length) {
      assertIncludes(new Set(routingProfile.requiredWorkflowKeys), requiredWorkflowKeys, `${name} workflow keys`)
    }
    if (requiredDocumentGroups.length) {
      assertIncludes(new Set(routingProfile.requiredDocumentGroups), requiredDocumentGroups, `${name} document groups`)
    }
    if (requiredDocumentKeys.length) {
      assertIncludes(keySet(legalRequirements.requirements), requiredDocumentKeys, `${name} required document keys`)
    }
    for (const key of absentDocumentKeys) {
      assert.equal(keySet(legalRequirements.requirements).has(key), false, `${name}: did not expect ${key}`)
    }
    for (const check of factChecks) {
      check({ routingProfile, facts, legalRequirements })
    }
  })
}

assertBuyerScenario({
  name: 'Married COP cash buyer keeps spouse and marriage details visible',
  formData: naturalPersonBase({
    purchaser_type: 'married_coc',
    marital_status: 'married',
    marital_regime: 'in_community',
    spouse_full_name: 'Maya Buyer',
    spouse_identity_number: '9001015009082',
    spouse_email: 'maya@example.com',
    spouse_phone: '0821234568',
    spouse_is_co_purchaser: 'yes',
    finance: {
      purchase_price: '2450000',
      cash_amount: '2450000',
      proof_of_funds_available: 'yes',
      source_of_funds: 'Savings',
      cash_funds_confirmed: 'yes',
    },
  }),
  expectedBranch: 'married_coc',
  expectedPurchaseMode: 'individual',
  expectedFinanceBranch: 'cash',
  expectedDocumentKeys: [
    'purchaser_1_id',
    'purchaser_1_proof_of_address',
    'spouse_id',
    'spouse_proof_of_address',
    'marriage_certificate',
    'proof_of_funds',
  ],
  expectedVisibleFields: ['buyer.person.spouse_full_name', 'buyer.person.marital_regime'],
  profileChecks: [
    ({ profile }) => {
      assert.equal(profile.isMarriedBuyer, true)
      assert.equal(profile.requiresProofOfFunds, true)
    },
  ],
})

assertBuyerScenario({
  name: 'Married ANC cash buyer keeps ANC document and proof-of-funds prompts',
  formData: naturalPersonBase({
    purchaser_type: 'married_anc',
    marital_status: 'married',
    marital_regime: 'out_of_community',
    spouse_full_name: 'Maya Buyer',
    spouse_identity_number: '9001015009082',
    spouse_email: 'maya@example.com',
    spouse_phone: '0821234568',
    spouse_is_co_purchaser: 'no',
    finance: {
      purchase_price: '2450000',
      cash_amount: '2450000',
      proof_of_funds_available: 'yes',
      source_of_funds: 'Savings',
      cash_funds_confirmed: 'yes',
    },
  }),
  expectedBranch: 'married_anc',
  expectedPurchaseMode: 'individual',
  expectedFinanceBranch: 'cash',
  expectedDocumentKeys: [
    'purchaser_id',
    'purchaser_proof_of_address',
    'anc_document_optional',
    'proof_of_funds',
  ],
  expectedVisibleFields: ['buyer.person.spouse_full_name', 'buyer.person.marital_regime'],
  profileChecks: [
    ({ profile }) => {
      assert.equal(profile.isMarriedBuyer, true)
      assert.equal(profile.requiresProofOfFunds, true)
    },
  ],
})

assertBuyerScenario({
  name: 'Company buyer with multiple directors keeps company authority visible',
  formData: companyForm({ purchaseFinanceType: 'bond' }),
  expectedBranch: 'company',
  expectedPurchaseMode: 'individual',
  expectedFinanceBranch: 'bond',
  expectedDocumentKeys: [
    'cipc_registration',
    'company_resolution',
    'director_id',
    'director_proof_of_address',
    'entity_bank_statements',
    'entity_financials',
    'entity_income_support',
    'entity_tax_clearance_optional',
    'bond_approval',
    'grant_signed',
  ],
  expectedVisibleFields: ['buyer.company.directors', 'buyer.company.authorised_signatory.name'],
  profileChecks: [
    ({ profile }) => {
      assert.equal(profile.requiresEntityDocuments, true)
      assert.equal(profile.requiresBondDocuments, true)
      assert.equal(profile.requiresProofOfFunds, false)
    },
  ],
})

assertBuyerScenario({
  name: 'Trust buyer with multiple trustees keeps trustee authority visible',
  formData: trustForm({ purchaseFinanceType: 'hybrid', bondHelpRequested: 'yes' }),
  expectedBranch: 'trust',
  expectedPurchaseMode: 'individual',
  expectedFinanceBranch: 'hybrid',
  expectedDocumentKeys: [
    'trust_deed',
    'letters_of_authority',
    'trust_resolution',
    'trustee_id',
    'trustee_proof_of_address',
    'entity_bank_statements',
    'entity_financials',
    'entity_income_support',
    'entity_tax_clearance_optional',
    'bond_approval',
    'grant_signed',
    'proof_of_funds_cash_component',
  ],
  expectedVisibleFields: ['buyer.trust.trustees', 'buyer.trust.authorised_trustee.name', 'finance.bond_originator_name'],
  profileChecks: [
    ({ profile }) => {
      assert.equal(profile.requiresEntityDocuments, true)
      assert.equal(profile.requiresBondDocuments, true)
      assert.equal(profile.requiresProofOfFunds, true)
      assert.equal(profile.financeSupportMode, 'originator_led')
      assert.equal(profile.needsBondOriginator, true)
    },
  ],
})

assertBuyerScenario({
  name: 'Co-purchasing cash buyer keeps split shares and consent visible',
  formData: {
    ...naturalPersonBase({
      purchase_finance_type: 'cash',
      finance: {
        purchase_price: '2450000',
        cash_amount: '2450000',
        proof_of_funds_available: 'yes',
        source_of_funds: 'Savings',
        cash_funds_confirmed: 'yes',
      },
    }),
    co_first_name: 'Kim',
    co_last_name: 'Buyer',
    co_identity_number: '9001015009084',
    co_email: 'kim@example.com',
    co_phone: '0821234568',
    co_residential_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
    co_nationality: 'South African',
    co_residency_status: 'sa_citizen',
    natural_person_purchase_mode: 'co_purchasing',
    purchasers: [
      {
        first_name: 'Alex',
        last_name: 'Buyer',
        date_of_birth: '1990-01-01',
        identity_number: '9001015009083',
        nationality: 'South African',
        residency_status: 'sa_citizen',
        tax_number: '9001015009',
        email: 'alex@example.com',
        phone: '0821234567',
        residential_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
        postal_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
        street_address: '54 Menlyn Avenue',
        suburb: 'Waterkloof Glen',
        city: 'Pretoria',
        postal_code: '0181',
        marital_status: 'single',
        marital_regime: 'not_applicable',
        number_of_dependants: '0',
        monthly_credit_commitments: '2500',
        first_time_buyer: 'yes',
        primary_residence: 'yes',
        investment_purchase: 'no',
        ownership_share: '60',
        consent_to_purchase: 'yes',
      },
      {
        first_name: 'Kim',
        last_name: 'Buyer',
        date_of_birth: '1991-02-02',
        identity_number: '9001015009084',
        nationality: 'South African',
        residency_status: 'sa_citizen',
        tax_number: '9001015009',
        email: 'kim@example.com',
        phone: '0821234568',
        residential_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
        postal_address: '54 Menlyn Avenue, Waterkloof Glen, Pretoria, 0181',
        street_address: '54 Menlyn Avenue',
        suburb: 'Waterkloof Glen',
        city: 'Pretoria',
        postal_code: '0181',
        marital_status: 'single',
        marital_regime: 'not_applicable',
        number_of_dependants: '0',
        monthly_credit_commitments: '1200',
        first_time_buyer: 'no',
        primary_residence: 'yes',
        investment_purchase: 'yes',
        ownership_share: '40',
        consent_to_purchase: 'yes',
      },
    ],
  },
  expectedBranch: 'individual',
  expectedPurchaseMode: 'co_purchasing',
  expectedFinanceBranch: 'cash',
  expectedDocumentKeys: [
    'id_document',
    'proof_of_address',
    'co_purchaser_id_document',
    'co_purchaser_proof_of_address',
    'proof_of_funds',
  ],
  expectedVisibleFields: ['buyer.co_purchasers[].ownership_share', 'buyer.co_purchasers[].consent_to_purchase'],
  profileChecks: [
    ({ profile }) => {
      assert.equal(profile.isMultipleBuyers, true)
      assert.equal(profile.buyerCount, 2)
      assert.equal(profile.requiresProofOfFunds, true)
    },
  ],
})

assertBuyerScenario({
  name: 'Foreign purchaser cash buyer keeps passport and source-of-funds prompts visible',
  formData: naturalPersonBase({
    purchaser_type: 'foreign_purchaser',
    purchaser_entity_type: 'foreign_purchaser',
    identity_number: '',
    passport_number: 'C1234567',
    nationality: 'German',
    residency_status: 'foreign_national',
    tax_number: '9001015009',
    finance: {
      purchase_price: '2450000',
      cash_amount: '2450000',
      proof_of_funds_available: 'yes',
      source_of_funds: 'Offshore savings',
      cash_funds_confirmed: 'yes',
    },
  }),
  expectedBranch: 'foreign_purchaser',
  expectedPurchaseMode: 'individual',
  expectedFinanceBranch: 'cash',
  expectedDocumentKeys: [
    'passport_copy',
    'proof_of_address',
    'source_of_funds',
    'proof_of_funds',
  ],
  expectedVisibleFields: ['buyer.person.passport_number', 'buyer.person.source_of_funds'],
  profileChecks: [
    ({ profile }) => {
      assert.equal(profile.isForeignBuyer, true)
      assert.equal(profile.requiresProofOfFunds, true)
    },
  ],
})

assertTransactionScenario({
  name: 'Existing bond transaction keeps cancellation attorney and cancellation figures alive',
  transaction: {
    id: 'tx-existing-bond',
    finance_type: 'bond',
    transaction_type: 'private_sale',
    property_type: 'freehold house',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: true,
    cancellation_required: true,
  },
  expectedPropertyTenure: 'freehold',
  expectedWorkflowTemplateKey: 'bond_freehold_resale',
  requiredWorkflowKeys: ['seller_bond_cancellation', 'attorney_bond'],
  requiredDocumentGroups: ['property_finance_existing_bond'],
  requiredDocumentKeys: ['cancellation_instruction', 'cancellation_figures'],
  factChecks: [
    ({ facts, legalRequirements }) => {
      assert.equal(facts.requiresCancellationAttorney, true)
      assert.equal(facts.sellerHasExistingBond, true)
      assert.equal(keySet(legalRequirements.requirements).has('cancellation_instruction'), true)
    },
  ],
})

assertTransactionScenario({
  name: 'Sectional title transaction keeps body corporate requirements visible',
  transaction: {
    id: 'tx-sectional-title',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    property_type: 'sectional title apartment',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
  },
  expectedPropertyTenure: 'sectional_title',
  expectedWorkflowTemplateKey: 'cash_sectional_title',
  requiredWorkflowKeys: ['finance_cash'],
  requiredDocumentGroups: ['sectional_title_body_corporate'],
  requiredDocumentKeys: ['body_corporate_levy_clearance'],
  factChecks: [
    ({ facts }) => {
      assert.equal(facts.isSectionalTitle, true)
    },
  ],
})

assertTransactionScenario({
  name: 'Estate / HOA transaction keeps levy and consent documents visible',
  transaction: {
    id: 'tx-estate-hoa',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    property_type: 'freehold house',
    property_tenure: 'estate_hoa',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
  },
  expectedPropertyTenure: 'estate_hoa',
  expectedWorkflowTemplateKey: 'cash_estate_hoa',
  requiredWorkflowKeys: ['finance_cash'],
  requiredDocumentGroups: ['estate_hoa'],
  requiredDocumentKeys: ['hoa_levy_clearance'],
  factChecks: [
    ({ facts }) => {
      assert.equal(facts.isEstateHoa, true)
    },
  ],
})

assertTransactionScenario({
  name: 'Commercial mixed-use transaction keeps VAT and due-diligence prompts visible',
  transaction: {
    id: 'tx-commercial-mixed-use',
    finance_type: 'cash',
    transaction_type: 'commercial',
    property_type: 'mixed_use_building',
    buyer_entity_type: 'company',
    seller_entity_type: 'company',
    vat_treatment: 'zero_rated_going_concern',
  },
  expectedPropertyTenure: 'freehold',
  expectedWorkflowTemplateKey: 'commercial_zero_rated_going_concern',
  requiredWorkflowKeys: ['sales_otp', 'finance_cash', 'attorney_transfer', 'registration'],
  requiredDocumentGroups: ['commercial_due_diligence', 'vat_transfer_treatment'],
  requiredDocumentKeys: ['buyer_beneficial_ownership', 'seller_beneficial_ownership', 'vat_status_confirmation', 'zero_rated_going_concern_confirmation'],
  factChecks: [
    ({ facts }) => {
      assert.equal(facts.isCommercialTransaction, true)
    },
  ],
})

assertTransactionScenario({
  name: 'Tenanted commercial property keeps lease information in the pack',
  transaction: {
    id: 'tx-commercial-tenanted',
    finance_type: 'cash',
    transaction_type: 'commercial',
    property_type: 'commercial building',
    buyer_entity_type: 'company',
    seller_entity_type: 'company',
    vat_treatment: 'vat',
  },
  expectedPropertyTenure: 'freehold',
  expectedWorkflowTemplateKey: 'commercial_vat',
  requiredWorkflowKeys: ['sales_otp', 'finance_cash', 'attorney_transfer', 'registration'],
  requiredDocumentGroups: ['commercial_due_diligence', 'vat_transfer_treatment'],
  requiredDocumentKeys: ['lease_agreements', 'buyer_beneficial_ownership', 'seller_beneficial_ownership', 'vat_status_confirmation'],
  factChecks: [
    ({ facts, legalRequirements }) => {
      assert.equal(facts.isCommercialTransaction, true)
      assert.equal(keySet(legalRequirements.requirements).has('lease_agreements'), true)
    },
  ],
})

assertTransactionScenario({
  name: 'Vacant land transaction keeps freehold fallback and no sectional or HOA noise',
  transaction: {
    id: 'tx-vacant-land',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    property_type: 'vacant land',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
  },
  expectedPropertyTenure: 'freehold',
  expectedWorkflowTemplateKey: 'cash_freehold_resale',
  requiredWorkflowKeys: ['sales_otp', 'finance_cash', 'attorney_transfer', 'registration'],
  absentDocumentKeys: ['body_corporate_levy_clearance', 'hoa_levy_clearance'],
  factChecks: [
    ({ facts }) => {
      assert.equal(facts.propertyTenure, 'freehold')
      assert.equal(facts.missingFields.includes('property_tenure'), false)
    },
  ],
})

assertTransactionScenario({
  name: 'Agricultural property keeps freehold fallback and no sectional or HOA noise',
  transaction: {
    id: 'tx-agricultural-land',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    property_type: 'farm',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
  },
  expectedPropertyTenure: 'freehold',
  expectedWorkflowTemplateKey: 'cash_freehold_resale',
  requiredWorkflowKeys: ['sales_otp', 'finance_cash', 'attorney_transfer', 'registration'],
  absentDocumentKeys: ['body_corporate_levy_clearance', 'hoa_levy_clearance'],
  factChecks: [
    ({ facts }) => {
      assert.equal(facts.propertyTenure, 'freehold')
      assert.equal(facts.missingFields.includes('property_tenure'), false)
    },
  ],
})

console.log('buyer onboarding South African scenario tests passed')
