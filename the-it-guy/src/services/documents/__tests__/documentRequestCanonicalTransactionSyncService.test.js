import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCanonicalDocumentRequestScenarioFromTransactionContext,
  buildCanonicalRequiredDocumentRowsForTransactionContext,
  resolveCanonicalDocumentRequestSyncAudience,
  syncCanonicalRequiredDocumentsForTransactionContext,
} from '../documentRequestCanonicalTransactionSyncService.js'

function keySet(rows = []) {
  return new Set(rows.map((row) => row.document_key))
}

function createFakeClient(seedRows = []) {
  const state = {
    rows: [...seedRows],
    upsertedRows: [],
  }

  return {
    state,
    from(table) {
      assert.equal(table, 'transaction_required_documents')
      return {
        select() {
          return {
            eq(column, value) {
              assert.equal(column, 'transaction_id')
              return Promise.resolve({
                data: state.rows.filter((row) => row.transaction_id === value),
                error: null,
              })
            },
          }
        },
        upsert(rows) {
          state.upsertedRows = rows
          for (const row of rows) {
            const index = state.rows.findIndex(
              (existing) =>
                existing.transaction_id === row.transaction_id &&
                existing.document_key === row.document_key,
            )
            if (index >= 0) state.rows[index] = { ...state.rows[index], ...row }
            else state.rows.push({ id: `row-${state.rows.length + 1}`, ...row })
          }
          return {
            select() {
              return Promise.resolve({ data: state.upsertedRows, error: null })
            },
          }
        },
      }
    },
  }
}

test('derives canonical document request scenario from transaction context', () => {
  const derived = buildCanonicalDocumentRequestScenarioFromTransactionContext({
    transaction: {
      id: 'transaction-1',
      purchaser_type: 'trust',
      seller_type: 'company',
      finance_type: 'hybrid',
      seller_has_existing_bond: true,
      property_type: 'sectional_title',
    },
    sellerFormData: {
      gasInstallation: 'yes',
    },
  })

  assert.equal(derived.scenario.buyerEntityType, 'trust')
  assert.equal(derived.scenario.sellerEntityType, 'company')
  assert.equal(derived.scenario.financeType, 'hybrid')
  assert.equal(derived.scenario.sellerHasExistingBond, true)
  assert.equal(derived.scenario.gasInstallation, true)
  assert.equal(derived.coverage.buyerKnown, true)
  assert.equal(derived.coverage.sellerKnown, true)
})

test('auto audience selects client only when buyer and seller structure are known', () => {
  assert.equal(resolveCanonicalDocumentRequestSyncAudience({ audience: 'auto', buyerKnown: true, sellerKnown: true }), 'client')
  assert.equal(resolveCanonicalDocumentRequestSyncAudience({ audience: 'auto', buyerKnown: true, sellerKnown: false }), 'buyer')
  assert.equal(resolveCanonicalDocumentRequestSyncAudience({ audience: 'auto', buyerKnown: false, sellerKnown: true }), 'seller')
  assert.equal(resolveCanonicalDocumentRequestSyncAudience({ audience: 'auto', buyerKnown: false, sellerKnown: false }), 'none')
})

test('transaction context builds buyer and seller rows when both sides are known', () => {
  const result = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'transaction-1',
      purchaser_type: 'trust',
      seller_type: 'company',
      finance_type: 'hybrid',
      seller_has_existing_bond: true,
      property_type: 'sectional_title',
    },
    sellerFormData: {
      gasInstallation: true,
    },
  })
  const keys = keySet(result.rows)

  assert.equal(result.derivedAudience, 'client')
  assert.equal(keys.has('buyer_trust_deed'), true)
  assert.equal(keys.has('seller_company_registration'), true)
  assert.equal(keys.has('bond_statement'), true)
  assert.equal(keys.has('gas_compliance_certificate'), true)
})

test('buyer-only transaction does not persist default seller rows', () => {
  const result = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'transaction-1',
      purchaser_type: 'trust',
      finance_type: 'cash',
      seller_has_existing_bond: true,
    },
  })
  const keys = keySet(result.rows)

  assert.equal(result.derivedAudience, 'buyer')
  assert.equal(keys.has('buyer_trust_deed'), true)
  assert.equal(keys.has('proof_of_funds'), true)
  assert.equal(keys.has('seller_id_document'), false)
  assert.equal(keys.has('seller_fica_pack'), false)
  assert.equal(keys.has('bond_statement'), false)
})

test('transaction context preserves buyer marital regime after entity normalization', () => {
  const unmarriedResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'transaction-unmarried',
      purchaser_type: 'individual',
      finance_type: 'cash',
    },
  })
  const unmarriedKeys = keySet(unmarriedResult.rows)

  assert.equal(unmarriedKeys.has('buyer_marital_status_details'), false)
  assert.equal(unmarriedKeys.has('buyer_marriage_certificate'), false)
  assert.equal(unmarriedKeys.has('buyer_fica_pack'), false)

  const ancResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'transaction-anc',
      purchaser_type: 'married_anc',
      finance_type: 'cash',
    },
  })
  const ancKeys = keySet(ancResult.rows)

  assert.equal(ancResult.derivedScenario.buyerEntityType, 'individual')
  assert.equal(ancResult.derivedScenario.buyerMaritalRegime, 'married_anc')
  assert.equal(ancKeys.has('buyer_marriage_certificate'), true)
  assert.equal(ancKeys.has('buyer_anc_document'), false)
  assert.equal(ancResult.skippedPendingPolicyKeys.includes('buyer_anc_document'), true)

  const copResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'transaction-cop',
      purchaser_type: 'individual',
      buyer_marital_regime: 'married_cop',
      finance_type: 'cash',
    },
  })
  const copKeys = keySet(copResult.rows)

  assert.equal(copResult.derivedScenario.buyerMaritalRegime, 'married_cop')
  assert.equal(copKeys.has('buyer_marriage_certificate'), true)
  assert.equal(copKeys.has('buyer_spouse_id_document'), true)
  assert.equal(copKeys.has('buyer_spouse_proof_of_address'), true)

  const onboardingAncResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'transaction-onboarding-anc',
      purchaser_type: 'individual',
      finance_type: 'bond',
    },
    onboardingFormData: {
      purchaser_type: 'individual',
      marital_status: 'married',
      marital_regime: 'out_of_community',
    },
  })
  const onboardingAncKeys = keySet(onboardingAncResult.rows)

  assert.equal(onboardingAncResult.derivedScenario.buyerEntityType, 'individual')
  assert.equal(onboardingAncResult.derivedScenario.buyerMaritalRegime, 'married_anc')
  assert.equal(onboardingAncKeys.has('buyer_marriage_certificate'), true)
  assert.equal(onboardingAncResult.skippedPendingPolicyKeys.includes('buyer_anc_document'), true)
})

test('canonical matrix has one concrete request set for every buyer and seller structure', () => {
  const buyerStructures = ['individual', 'married_coc', 'married_anc', 'company', 'trust', 'foreign_purchaser']
  for (const purchaserType of buyerStructures) {
    const result = buildCanonicalRequiredDocumentRowsForTransactionContext({
      transaction: { id: `buyer-${purchaserType}`, purchaser_type: purchaserType, finance_type: 'cash' },
    })
    const keys = keySet(result.rows)
    assert.equal(keys.has('buyer_fica_pack'), false, `${purchaserType} must not receive a generic buyer FICA pack`)
    assert.equal(keys.has('seller_fica_pack'), false, `${purchaserType} must not receive a generic seller FICA pack`)
  }

  const sellerStructures = ['individual', 'married_cop', 'married_anc', 'company', 'trust', 'deceased_estate', 'power_of_attorney']
  for (const sellerType of sellerStructures) {
    const result = buildCanonicalRequiredDocumentRowsForTransactionContext({
      transaction: { id: `seller-${sellerType}`, purchaser_type: 'individual', seller_type: sellerType, finance_type: 'cash' },
    })
    const keys = keySet(result.rows)
    assert.equal(keys.has('buyer_fica_pack'), false, `${sellerType} must not receive a generic buyer FICA pack`)
    assert.equal(keys.has('seller_fica_pack'), false, `${sellerType} must not receive a generic seller FICA pack`)
  }
})

test('transaction context preserves seller marital regime requirements', () => {
  const copResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'seller-cop',
      seller_type: 'individual',
      seller_marital_regime: 'married_cop',
      finance_type: 'cash',
      property_type: 'freehold',
    },
  })
  const copKeys = keySet(copResult.rows)

  assert.equal(copResult.derivedAudience, 'seller')
  assert.equal(copResult.derivedScenario.sellerMaritalRegime, 'married_cop')
  assert.equal(copKeys.has('seller_marriage_certificate'), true)
  assert.equal(copKeys.has('seller_spouse_id_document'), true)
  assert.equal(copKeys.has('seller_spouse_consent'), true)

  const ancResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'seller-anc',
      seller_type: 'individual',
      seller_marital_regime: 'married_anc',
      finance_type: 'cash',
      property_type: 'freehold',
    },
  })
  const ancKeys = keySet(ancResult.rows)

  assert.equal(ancResult.derivedScenario.sellerMaritalRegime, 'married_anc')
  assert.equal(ancKeys.has('seller_marriage_certificate'), true)
  assert.equal(ancKeys.has('seller_spouse_id_document'), true)
  assert.equal(ancKeys.has('seller_anc_document'), true)
})

test('transaction context covers seller entity structures absent from live phase 10 sample', () => {
  const companyResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'seller-company',
      seller_type: 'company',
      finance_type: 'cash',
      property_type: 'estate_hoa',
      seller_has_existing_bond: true,
    },
  })
  const companyKeys = keySet(companyResult.rows)
  assert.equal(companyResult.derivedAudience, 'seller')
  assert.equal(companyKeys.has('seller_company_registration'), true)
  assert.equal(companyKeys.has('seller_company_resolution'), true)
  assert.equal(companyKeys.has('seller_director_fica'), true)
  assert.equal(companyKeys.has('seller_tax_number'), true)
  assert.equal(companyKeys.has('seller_bank_account_confirmation'), true)
  assert.equal(companyKeys.has('hoa_levy_statement'), true)
  assert.equal(companyKeys.has('bond_statement'), true)

  const trustResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'seller-trust',
      seller_type: 'trust',
      finance_type: 'cash',
      property_type: 'freehold',
    },
  })
  const trustKeys = keySet(trustResult.rows)
  assert.equal(trustKeys.has('seller_trust_deed'), true)
  assert.equal(trustKeys.has('seller_letters_of_authority'), true)
  assert.equal(trustKeys.has('seller_trustee_resolution'), true)
  assert.equal(trustKeys.has('seller_trustee_fica'), true)

  const estateResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'seller-estate',
      seller_type: 'deceased_estate',
      finance_type: 'cash',
      property_type: 'freehold',
    },
  })
  assert.equal(keySet(estateResult.rows).has('seller_executor_authority'), true)

  const poaResult = buildCanonicalRequiredDocumentRowsForTransactionContext({
    transaction: {
      id: 'seller-poa',
      seller_type: 'power_of_attorney',
      finance_type: 'cash',
      property_type: 'freehold',
    },
  })
  assert.equal(keySet(poaResult.rows).has('seller_power_of_attorney'), true)
})

test('transaction sync skips when neither buyer nor seller structure is known', async () => {
  const client = createFakeClient([])
  const result = await syncCanonicalRequiredDocumentsForTransactionContext({
    client,
    transactionId: 'transaction-1',
    transaction: {
      id: 'transaction-1',
    },
  })

  assert.equal(result.skipped, true)
  assert.equal(result.reason, 'insufficient_transaction_facts')
  assert.equal(result.synced, 0)
  assert.equal(client.state.upsertedRows.length, 0)
})

test('transaction sync persists derived canonical required documents', async () => {
  const client = createFakeClient([])
  const result = await syncCanonicalRequiredDocumentsForTransactionContext({
    client,
    transaction: {
      id: 'transaction-1',
      purchaser_type: 'company',
      seller_type: 'trust',
      finance_type: 'bond',
      property_type: 'estate_hoa',
    },
  })
  const keys = keySet(client.state.upsertedRows)

  assert.equal(result.derivedAudience, 'client')
  assert.equal(result.synced, result.rows.length)
  assert.equal(keys.has('buyer_company_registration'), true)
  assert.equal(keys.has('seller_trust_deed'), true)
  assert.equal(keys.has('hoa_levy_statement'), true)
  assert.equal(keys.has('bond_approval'), true)
})
