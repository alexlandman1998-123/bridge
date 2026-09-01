import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCanonicalDocumentRequestAudiencePlan,
  buildCanonicalDocumentRequestPlan,
  filterCanonicalDocumentRequestsForAudience,
  isCanonicalDocumentRequestVisibleToAudience,
} from '../documentRequestCanonicalPlanner.js'

function keySet(items = []) {
  return new Set(items.map((item) => item.key))
}

function assertIncludes(actualKeys, expectedKeys, message) {
  for (const key of expectedKeys) {
    assert.equal(actualKeys.has(key), true, `${message}: expected ${key}`)
  }
}

function assertExcludes(actualKeys, excludedKeys, message) {
  for (const key of excludedKeys) {
    assert.equal(actualKeys.has(key), false, `${message}: did not expect ${key}`)
  }
}

const MIXED_SCENARIO = Object.freeze({
  buyerEntityType: 'trust',
  sellerEntityType: 'company',
  financeType: 'hybrid',
  sellerHasExistingBond: true,
  propertyType: 'sectional_title',
  gasInstallation: true,
})

test('planner resolves a canonical request plan for a mixed legal scenario', () => {
  const plan = buildCanonicalDocumentRequestPlan(MIXED_SCENARIO)
  const keys = keySet(plan.requests)

  assertIncludes(
    keys,
    [
      'buyer_trust_deed',
      'buyer_letters_of_authority',
      'buyer_trustee_resolution',
      'buyer_trustee_fica',
      'buyer_trust_beneficial_ownership',
      'proof_of_funds_cash_component',
      'bond_approval',
      'grant_signed',
      'seller_company_registration',
      'seller_company_resolution',
      'seller_director_fica',
      'seller_company_beneficial_ownership',
      'seller_bank_account_confirmation',
      'seller_tax_number',
      'bond_statement',
      'bond_cancellation_figures',
      'levy_statement',
      'body_corporate_details',
      'gas_compliance_certificate',
    ],
    'mixed plan',
  )

  assert.equal(plan.summary.total, plan.requests.length)
  assert.equal(plan.summary.byRequestedFrom.buyer > 0, true)
  assert.equal(plan.summary.byRequestedFrom.seller > 0, true)
  assert.equal(plan.summary.byRequestedFrom.cancellation_attorney, 1)
  assert.equal(plan.scenarioTokens.includes('buyer_trust'), true)
  assert.equal(plan.scenarioTokens.includes('seller_company'), true)
  assert.equal(plan.scenarioTokens.includes('hybrid'), true)
  assert.equal(plan.scenarioTokens.includes('seller_existing_bond'), true)
})

test('buyer audience only receives buyer client-visible requests', () => {
  const buyerPlan = buildCanonicalDocumentRequestAudiencePlan(MIXED_SCENARIO, 'buyer')
  const keys = keySet(buyerPlan.requests)

  assertIncludes(keys, ['signed_otp', 'buyer_trust_deed', 'buyer_trustee_resolution', 'bond_approval', 'grant_signed'], 'buyer plan')
  assertExcludes(
    keys,
    ['seller_company_registration', 'seller_company_resolution', 'bond_statement', 'bond_cancellation_figures'],
    'buyer plan',
  )
  assert.equal(buyerPlan.requests.every((request) => request.clientVisible && request.requestedFrom === 'buyer'), true)
})

test('seller audience only receives seller client-visible requests', () => {
  const sellerPlan = buildCanonicalDocumentRequestAudiencePlan(MIXED_SCENARIO, 'seller')
  const keys = keySet(sellerPlan.requests)

  assertIncludes(
    keys,
    [
      'seller_company_registration',
      'seller_company_resolution',
      'seller_bank_account_confirmation',
      'seller_tax_number',
      'bond_statement',
      'levy_statement',
      'gas_compliance_certificate',
    ],
    'seller plan',
  )
  assertExcludes(keys, ['buyer_trust_deed', 'bond_approval', 'bond_cancellation_figures'], 'seller plan')
  assert.equal(sellerPlan.requests.every((request) => request.clientVisible && request.requestedFrom === 'seller'), true)
})

test('attorney audience receives client and professional shared request rows', () => {
  const plan = buildCanonicalDocumentRequestPlan(MIXED_SCENARIO)
  const attorneyRequests = filterCanonicalDocumentRequestsForAudience(plan, 'attorney')
  const keys = keySet(attorneyRequests)

  assertIncludes(keys, ['signed_otp', 'transfer_duty_information', 'buyer_trust_deed', 'seller_company_resolution'], 'attorney plan')
  assert.equal(attorneyRequests.every((request) => request.attorneyVisible), true)
})

test('cancellation attorney audience receives cancellation and existing-bond rows only', () => {
  const plan = buildCanonicalDocumentRequestPlan(MIXED_SCENARIO)
  const cancellationRequests = filterCanonicalDocumentRequestsForAudience(plan, 'cancellation_attorney')
  const keys = keySet(cancellationRequests)

  assertIncludes(keys, ['bond_statement', 'bond_cancellation_figures'], 'cancellation attorney plan')
  assertExcludes(keys, ['buyer_trust_deed', 'seller_company_registration', 'rates_clearance'], 'cancellation attorney plan')
  assert.equal(isCanonicalDocumentRequestVisibleToAudience({ key: 'x', visibility: 'internal_only' }, 'cancellation_attorney'), false)
  assert.equal(isCanonicalDocumentRequestVisibleToAudience({ key: 'x', visibility: 'internal_only' }, 'internal'), true)
})

test('bond originator audience receives finance rows but not seller FICA or transfer rows', () => {
  const originatorPlan = buildCanonicalDocumentRequestAudiencePlan(MIXED_SCENARIO, 'bond_originator')
  const keys = keySet(originatorPlan.requests)

  assertIncludes(keys, ['bond_approval', 'grant_signed', 'income_affordability_documents'], 'bond originator plan')
  assertExcludes(
    keys,
    ['buyer_trust_deed', 'buyer_fica_pack', 'seller_fica_pack', 'seller_company_registration', 'transfer_documents'],
    'bond originator plan',
  )
  assert.equal(originatorPlan.requests.every((request) => request.portalAudience.includes('bond_originator')), true)
})

test('pending-policy rows are visible but not requestable unless explicitly enabled', () => {
  const plan = buildCanonicalDocumentRequestPlan(MIXED_SCENARIO)
  const buyerTrustBo = plan.requests.find((request) => request.key === 'buyer_trust_beneficial_ownership')
  const sellerCompanyBo = plan.requests.find((request) => request.key === 'seller_company_beneficial_ownership')

  assert.equal(buyerTrustBo?.pendingPolicy, true)
  assert.equal(buyerTrustBo?.requestable, false)
  assert.equal(buyerTrustBo?.blocksStage, null)
  assert.equal(sellerCompanyBo?.pendingPolicy, true)
  assert.equal(sellerCompanyBo?.requestable, false)

  const signoffPlan = buildCanonicalDocumentRequestPlan(MIXED_SCENARIO, { requestPendingPolicy: true })
  const signoffBuyerTrustBo = signoffPlan.requests.find((request) => request.key === 'buyer_trust_beneficial_ownership')
  assert.equal(signoffBuyerTrustBo?.requestable, true)
  assert.equal(signoffBuyerTrustBo?.blocksStage, 'attorney_instruction_ready')
})
