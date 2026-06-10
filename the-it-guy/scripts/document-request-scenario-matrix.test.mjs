import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function keys(items = []) {
  return new Set(items.map((item) => item.key || item.id || item.generated?.document_definition_key).filter(Boolean))
}

function assertIncludes(actualKeys, expectedKeys, scenarioName) {
  for (const key of expectedKeys) {
    assert.equal(actualKeys.has(key), true, `${scenarioName}: expected ${key}`)
  }
}

function assertExcludes(actualKeys, excludedKeys, scenarioName) {
  for (const key of excludedKeys) {
    assert.equal(actualKeys.has(key), false, `${scenarioName}: did not expect ${key}`)
  }
}

function assertNoDuplicateKeys(items = [], scenarioName) {
  const seen = new Set()
  for (const item of items) {
    const key = item.key || item.id || item.generated?.document_definition_key
    assert.equal(seen.has(key), false, `${scenarioName}: duplicate document key ${key}`)
    seen.add(key)
  }
}

function buyerDefinition(key, pack = 'buyer_identity_fica') {
  return {
    key,
    display_label: key,
    category: pack,
    pack_key: pack,
    default_requirement_level: 'required',
    default_visibility: ['buyer', 'agent'],
    default_upload_roles: ['buyer'],
  }
}

try {
  const {
    deriveOnboardingConfiguration,
    getEmploymentTypeLabel,
  } = await server.ssrLoadModule('/src/lib/purchaserPersonas.js')
  const {
    resolveDocumentRequestProfile,
  } = await server.ssrLoadModule('/server/services/documentRequestResolver.js')
  const {
    resolveLegalDocumentRequirements,
  } = await server.ssrLoadModule('/src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js')
  const {
    buildProjectedTransactionRequirementCandidates,
  } = await server.ssrLoadModule('/src/services/documents/transactionCanonicalDocumentRequirementService.js')

  const scenarios = [
    {
      name: 'Individual + unmarried + employed + bond',
      formData: {
        purchaser_type: 'individual',
        purchaser_entity_type: 'individual',
        marital_status: 'single',
        marital_regime: 'not_applicable',
        employment_type: 'employed',
        purchase_finance_type: 'bond',
      },
      expected: [
        'information_sheet',
        'otp',
        'transfer_documents',
        'id_document',
        'proof_of_address',
        'payslips_3_months',
        'bank_statements_3_months',
        'bond_approval',
        'grant_signed',
      ],
      excluded: ['spouse_id_optional', 'anc_document_optional', 'proof_of_funds'],
      derived: { purchaserType: 'individual', employmentType: 'full_time', financeType: 'bond' },
    },
    {
      name: 'Company + bond',
      formData: {
        purchaser_type: 'company',
        purchaser_entity_type: 'company',
        purchase_finance_type: 'bond',
      },
      expected: [
        'information_sheet',
        'otp',
        'transfer_documents',
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
      excluded: ['id_document', 'proof_of_address', 'payslips_3_months'],
      derived: { purchaserType: 'company', employmentType: null, financeType: 'bond' },
    },
    {
      name: 'Individual + married ANC + self-employed + bond',
      formData: {
        purchaser_type: 'married_anc',
        purchaser_entity_type: 'individual',
        marital_status: 'married',
        marital_regime: 'out_of_community',
        spouse_full_name: 'Spouse Example',
        spouse_is_co_purchaser: 'no',
        employment_type: 'self-employed',
        purchase_finance_type: 'bond',
      },
      expected: [
        'information_sheet',
        'otp',
        'transfer_documents',
        'purchaser_id',
        'purchaser_proof_of_address',
        'spouse_id_optional',
        'spouse_proof_of_address_optional',
        'anc_document_optional',
        'bank_statements_12_months',
        'financial_statements',
        'tax_returns_latest',
        'accountant_letter',
        'bond_approval',
        'grant_signed',
      ],
      excluded: ['payslips_3_months', 'proof_of_funds'],
      derived: { purchaserType: 'married_anc', employmentType: 'self_employed', financeType: 'bond' },
    },
    {
      name: 'Individual + married COP + employed + bond',
      formData: {
        purchaser_type: 'married_coc',
        purchaser_entity_type: 'individual',
        marital_status: 'married',
        marital_regime: 'in_community',
        spouse_full_name: 'Spouse Example',
        employment_type: 'employed',
        purchase_finance_type: 'bond',
      },
      expected: [
        'purchaser_1_id',
        'purchaser_1_proof_of_address',
        'spouse_id',
        'spouse_proof_of_address',
        'marriage_certificate',
        'payslips_3_months',
        'bank_statements_3_months',
        'spouse_income_support',
        'spouse_bank_statements',
        'bond_approval',
        'grant_signed',
      ],
      excluded: ['anc_document_optional', 'proof_of_funds'],
      derived: { purchaserType: 'married_coc', employmentType: 'full_time', financeType: 'bond' },
    },
    {
      name: 'Individual + married ANC + employed + cash',
      formData: {
        purchaser_type: 'married_anc',
        purchaser_entity_type: 'individual',
        marital_status: 'married',
        marital_regime: 'out_of_community',
        spouse_full_name: 'Spouse Example',
        spouse_is_co_purchaser: 'no',
        employment_type: 'employed',
        purchase_finance_type: 'cash',
      },
      expected: [
        'purchaser_id',
        'purchaser_proof_of_address',
        'spouse_id_optional',
        'spouse_proof_of_address_optional',
        'anc_document_optional',
        'proof_of_funds',
      ],
      excluded: ['payslips_3_months', 'bank_statements_3_months', 'bond_approval', 'grant_signed'],
      derived: { purchaserType: 'married_anc', employmentType: 'full_time', financeType: 'cash' },
    },
    {
      name: 'Trust + bond',
      formData: {
        purchaser_type: 'trust',
        purchaser_entity_type: 'trust',
        purchase_finance_type: 'bond',
        trustees: [{ full_name: 'Trustee Example', signing_authority: true }],
      },
      expected: [
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
      ],
      excluded: ['id_document', 'payslips_3_months', 'anc_document_optional'],
      derived: { purchaserType: 'trust', employmentType: null, financeType: 'bond' },
    },
    {
      name: 'Foreign purchaser + cash',
      formData: {
        purchaser_type: 'foreign_purchaser',
        purchaser_entity_type: 'foreign_purchaser',
        nationality: 'German',
        passport_number: 'C1234567',
        purchase_finance_type: 'cash',
      },
      expected: [
        'passport_copy',
        'proof_of_address',
        'source_of_funds',
        'proof_of_funds',
      ],
      excluded: ['id_document', 'bond_approval', 'grant_signed'],
      derived: { purchaserType: 'foreign_purchaser', employmentType: null, financeType: 'cash' },
    },
    {
      name: 'Individual + self-employed + hybrid',
      formData: {
        purchaser_type: 'individual',
        purchaser_entity_type: 'individual',
        marital_status: 'single',
        marital_regime: 'not_applicable',
        employment_type: 'self_employed',
        purchase_finance_type: 'hybrid',
      },
      expected: [
        'id_document',
        'proof_of_address',
        'bank_statements_12_months',
        'financial_statements',
        'tax_returns_latest',
        'accountant_letter',
        'bond_approval',
        'grant_signed',
        'proof_of_funds_cash_component',
      ],
      excluded: ['payslips_3_months', 'spouse_id_optional'],
      derived: { purchaserType: 'individual', employmentType: 'self_employed', financeType: 'combination' },
    },
  ]

  for (const scenario of scenarios) {
    const config = deriveOnboardingConfiguration(scenario.formData, {
      purchaserType: scenario.formData.purchaser_type,
      financeType: scenario.formData.purchase_finance_type,
    })
    const documentKeys = keys(config.requiredDocuments)
    assertIncludes(documentKeys, scenario.expected, scenario.name)
    assertExcludes(documentKeys, scenario.excluded, scenario.name)
    assertNoDuplicateKeys(config.requiredDocuments, scenario.name)
    assert.equal(config.purchaserType, scenario.derived.purchaserType, `${scenario.name}: purchaser type`)
    assert.equal(config.financeType, scenario.derived.financeType, `${scenario.name}: finance type`)
    assert.equal(config.derivedFields.employment_type, scenario.derived.employmentType, `${scenario.name}: employment type`)

    const profile = resolveDocumentRequestProfile(
      {
        id: `tx-${scenario.name}`,
        purchaser_type: scenario.formData.purchaser_type,
        finance_type: scenario.formData.purchase_finance_type,
      },
      { formData: scenario.formData },
    )
    assertIncludes(keys(profile.requiredDocuments), scenario.expected, `${scenario.name} resolver wrapper`)
  }

  assert.equal(getEmploymentTypeLabel('pensioner'), 'Retired / Pension income')
  assert.equal(getEmploymentTypeLabel('company director'), 'Company director')
  assert.equal(getEmploymentTypeLabel('unemployed'), 'Unemployed / No regular income')

  const companyDirector = deriveOnboardingConfiguration({
    purchaser_type: 'individual',
    purchaser_entity_type: 'individual',
    purchase_finance_type: 'bond',
    employment_type: 'company director',
  })
  assertIncludes(keys(companyDirector.requiredDocuments), ['bank_statements_12_months', 'financial_statements', 'tax_returns_latest'], 'Company director alias')
  assert.equal(companyDirector.derivedFields.employment_type, 'company_director')

  const pensioner = deriveOnboardingConfiguration({
    purchaser_type: 'individual',
    purchaser_entity_type: 'individual',
    purchase_finance_type: 'bond',
    employment_type: 'pensioner',
  })
  assertIncludes(keys(pensioner.requiredDocuments), ['pension_proof', 'bank_statements_3_months'], 'Pensioner alias')
  assert.equal(pensioner.derivedFields.employment_type, 'retired')

  const unemployed = deriveOnboardingConfiguration({
    purchaser_type: 'individual',
    purchaser_entity_type: 'individual',
    purchase_finance_type: 'bond',
    employment_type: 'unemployed',
  })
  assertIncludes(keys(unemployed.requiredDocuments), ['bank_statements_6_months', 'income_explanation'], 'Unemployed documents')
  assert.equal(unemployed.derivedFields.employment_type, 'unemployed')

  const marriedAncAttorneyFallback = resolveLegalDocumentRequirements({
    id: 'attorney-married-anc',
    finance_type: 'bond',
    transaction_type: 'private_sale',
    purchaser_type: 'married_anc',
    seller_entity_type: 'individual',
  })
  assertIncludes(keys(marriedAncAttorneyFallback.requirements), ['buyer_id_document', 'buyer_proof_of_address', 'buyer_marital_status_details'], 'Attorney fallback married ANC')

  const foreignAttorneyFallback = resolveLegalDocumentRequirements({
    id: 'attorney-foreign',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    purchaser_type: 'foreign_purchaser',
    seller_entity_type: 'individual',
  })
  assertIncludes(keys(foreignAttorneyFallback.requirements), ['buyer_id_document', 'buyer_proof_of_address', 'buyer_marital_status_details'], 'Attorney fallback foreign purchaser')

  const cancellationFallback = resolveLegalDocumentRequirements({
    id: 'attorney-cancellation',
    finance_type: 'bond',
    transaction_type: 'private_sale',
    purchaser_type: 'individual',
    seller_entity_type: 'individual',
    cancellation_required: true,
  })
  assertIncludes(keys(cancellationFallback.requirements), ['cancellation_instruction', 'existing_bond_account_details', 'cancellation_figures', 'bank_cancellation_documents'], 'Attorney fallback cancellation')

  const canonicalDefinitions = [
    buyerDefinition('buyer_id_document'),
    buyerDefinition('buyer_proof_of_address'),
    buyerDefinition('seller_id_document', 'seller_identity_fica'),
    buyerDefinition('seller_proof_of_address', 'seller_identity_fica'),
    buyerDefinition('buyer_trust_deed'),
    buyerDefinition('seller_trust_deed', 'seller_identity_fica'),
    buyerDefinition('buyer_company_resolution'),
    buyerDefinition('company_resolution_to_sell', 'seller_authority'),
  ]

  const projectedIndividual = buildProjectedTransactionRequirementCandidates({
    transaction: {
      id: 'canonical-buyer-individual',
      finance_type: 'cash',
      purchaser_type: 'individual',
      buyer_entity_type: 'individual',
      seller_entity_type: 'company',
      current_main_stage: 'OTP',
      stage: 'OTP Signed',
    },
    formData: { purchaser_type: 'individual', purchase_finance_type: 'cash' },
    definitions: canonicalDefinitions,
  })
  const projectedIndividualKeys = keys(projectedIndividual.candidates.filter((candidate) => candidate.source === 'buyer_requirement_engine_adapter'))
  assertIncludes(projectedIndividualKeys, ['buyer_id_document', 'buyer_proof_of_address'], 'Canonical buyer adapter individual mapping')
  assertExcludes(projectedIndividualKeys, ['seller_id_document', 'seller_proof_of_address'], 'Canonical buyer adapter individual mapping')

  const projectedTrust = buildProjectedTransactionRequirementCandidates({
    transaction: {
      id: 'canonical-buyer-trust',
      finance_type: 'bond',
      purchaser_type: 'trust',
      buyer_entity_type: 'trust',
      seller_entity_type: 'company',
      current_main_stage: 'OTP',
      stage: 'OTP Signed',
    },
    formData: { purchaser_type: 'trust', purchaser_entity_type: 'trust', purchase_finance_type: 'bond' },
    definitions: canonicalDefinitions,
  })
  const projectedTrustKeys = keys(projectedTrust.candidates.filter((candidate) => candidate.source === 'buyer_requirement_engine_adapter'))
  assertIncludes(projectedTrustKeys, ['buyer_trust_deed'], 'Canonical buyer adapter trust mapping')
  assertExcludes(projectedTrustKeys, ['seller_trust_deed'], 'Canonical buyer adapter trust mapping')

  console.log('document request scenario matrix tests passed')
} finally {
  await server.close()
}
