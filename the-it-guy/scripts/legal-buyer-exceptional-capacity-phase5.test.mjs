import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const TRANSACTION_ID = '88888888-8888-4888-8888-888888888888'

function keys(items = []) {
  return new Set(
    items
      .map((item) => item.key || item.requirement_key || item.id || item.document_key || item.document_definition_key || item.generated?.document_definition_key)
      .filter(Boolean),
  )
}

function assertHas(actualKeys, key, message) {
  assert.equal(actualKeys.has(key), true, message || `expected ${key}`)
}

function assertMissing(actualKeys, key, message) {
  assert.equal(actualKeys.has(key), false, message || `did not expect ${key}`)
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

class FakeQuery {
  select() {
    return this
  }

  eq() {
    return this
  }

  then(resolve, reject) {
    return Promise.resolve({ data: [], error: null }).then(resolve, reject)
  }
}

const fakeClient = {
  from() {
    return new FakeQuery()
  },
}

try {
  const {
    deriveOnboardingConfiguration,
    getPurchaserEntityType,
  } = await server.ssrLoadModule('/src/lib/purchaserPersonas.js')
  const {
    resolveBuyerBranch,
  } = await server.ssrLoadModule('/src/lib/buyerOnboardingFlowContract.js')
  const {
    resolveDocumentRequestProfile,
  } = await server.ssrLoadModule('/server/services/documentRequestResolver.js')
  const {
    getBuyerRequirementProfile,
    getRequiredTransactionActions,
  } = await server.ssrLoadModule('/src/lib/buyerRequirementEngine.js')
  const {
    buildProjectedTransactionRequirementCandidates,
  } = await server.ssrLoadModule('/src/services/documents/transactionCanonicalDocumentRequirementService.js')
  const {
    ensureTransactionRequiredDocuments,
  } = await server.ssrLoadModule('/src/lib/api.js')

  {
    assert.equal(resolveBuyerBranch({ purchaser_type: 'poa' }), 'power_of_attorney')
    assert.equal(resolveBuyerBranch({ purchaser_type: 'estate_late' }), 'deceased_estate')
    assert.equal(resolveBuyerBranch({ purchaser_type: 'under_18' }), 'minor')
    assert.equal(resolveBuyerBranch({ purchaser_type: 'sequestrated' }), 'insolvent')
    assert.equal(resolveBuyerBranch({ purchaser_type: 'administration' }), 'curatorship')
    assert.equal(resolveBuyerBranch({ purchaser_type: 'business_rescue' }), 'business_rescue')
    assert.equal(resolveBuyerBranch({ purchaser_type: 'liquidated_company' }), 'liquidation')
    assert.equal(getPurchaserEntityType('buyer_poa'), 'power_of_attorney')
  }

  {
    const config = deriveOnboardingConfiguration({
      purchaser_type: 'poa',
      purchase_finance_type: 'cash',
    })
    const documentKeys = keys(config.requiredDocuments)
    assert.equal(config.purchaserType, 'power_of_attorney')
    assertHas(documentKeys, 'buyer_power_of_attorney')
    assertHas(documentKeys, 'buyer_principal_id')
    assertHas(documentKeys, 'buyer_representative_id')
    assertHas(documentKeys, 'buyer_authority_proof')
    assertMissing(documentKeys, 'id_document')
  }

  {
    const profile = resolveDocumentRequestProfile({
      id: 'tx-buyer-poa',
      purchaser_type: 'buyer_poa',
      finance_type: 'cash',
    })
    const documentKeys = keys(profile.requiredDocuments)
    assert.equal(profile.supportBoundaryStatus, 'manual_review')
    assert.equal(profile.manualReviewRequired, true)
    assert.equal(profile.automationAllowed, false)
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'buyer_power_of_attorney')
    assertHas(documentKeys, 'buyer_principal_id')
    assertMissing(documentKeys, 'id_document')
  }

  {
    const buyerProfile = getBuyerRequirementProfile({
      transaction: {
        id: 'tx-minor',
        purchaser_type: 'minor',
        finance_type: 'cash',
      },
    })
    const documentKeys = keys(buyerProfile.requiredDocuments)
    const actionKeys = new Set(getRequiredTransactionActions(buyerProfile).map((action) => action.key))
    assert.equal(buyerProfile.buyerType, 'minor')
    assert.equal(buyerProfile.buyerEntityType, 'minor')
    assert.equal(buyerProfile.supportBoundaryStatus, 'manual_review')
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'minor_birth_certificate_or_id')
    assertHas(documentKeys, 'guardian_id')
    assertHas(documentKeys, 'guardian_authority_or_court_order')
    assertHas(actionKeys, 'legal_manual_review_required')
    assertHas(actionKeys, 'complete_minor_buyer_pack')
  }

  {
    const rows = await ensureTransactionRequiredDocuments(fakeClient, {
      transactionId: TRANSACTION_ID,
      purchaserType: 'curatorship',
      financeType: 'cash',
      stage: 'OTP In Progress',
      currentMainStage: 'OTP',
      formData: {
        purchaser_type: 'curatorship',
        purchase_finance_type: 'cash',
      },
    }, { sync: false })
    const documentKeys = keys(rows)
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'curatorship_court_order')
    assertHas(documentKeys, 'curator_id')
    assertHas(documentKeys, 'curator_authority_docs')
    assertMissing(documentKeys, 'id_document')
  }

  {
    const profile = resolveDocumentRequestProfile({
      id: 'tx-buyer-business-rescue',
      purchaser_type: 'business_rescue',
      finance_type: 'cash',
    })
    const documentKeys = keys(profile.requiredDocuments)
    assert.equal(profile.supportBoundaryStatus, 'unsupported')
    assert.equal(profile.unsupported, true)
    assertHas(documentKeys, 'legal_support_boundary_stop')
    assertMissing(documentKeys, 'buyer_power_of_attorney')
    assertMissing(documentKeys, 'id_document')
    assertMissing(documentKeys, 'proof_of_funds')
  }

  {
    const profile = resolveDocumentRequestProfile({
      id: 'tx-buyer-liquidation',
      purchaser_type: 'liquidation',
      finance_type: 'cash',
    })
    const documentKeys = keys(profile.requiredDocuments)
    assert.equal(profile.supportBoundaryStatus, 'unsupported')
    assert.equal(profile.unsupported, true)
    assertHas(documentKeys, 'legal_support_boundary_stop')
    assertMissing(documentKeys, 'id_document')
    assertMissing(documentKeys, 'proof_of_funds')
  }

  {
    const projection = buildProjectedTransactionRequirementCandidates({
      transaction: {
        id: 'tx-canonical-poa',
        purchaser_type: 'poa',
        finance_type: 'cash',
      },
      definitions: [
        buyerDefinition('buyer_id_document'),
        buyerDefinition('buyer_power_of_attorney'),
        buyerDefinition('buyer_principal_id'),
        buyerDefinition('proof_of_funds', 'finance'),
      ],
    })
    const projectedKeys = keys(projection.candidates)
    assert.equal(projection.supportBoundary.status, 'manual_review')
    assertHas(projectedKeys, 'buyer_power_of_attorney')
    assertHas(projectedKeys, 'buyer_principal_id')
    assertMissing(projectedKeys, 'buyer_id_document', 'POA buyer must not receive ordinary buyer ID fallback candidates')
  }

  {
    const estateConfig = deriveOnboardingConfiguration({ purchaser_type: 'deceased_estate', purchase_finance_type: 'cash' })
    const insolventConfig = deriveOnboardingConfiguration({ purchaser_type: 'insolvent', purchase_finance_type: 'cash' })
    const estateKeys = keys(estateConfig.requiredDocuments)
    const insolventKeys = keys(insolventConfig.requiredDocuments)
    assertHas(estateKeys, 'buyer_estate_authority')
    assertHas(estateKeys, 'buyer_executor_id')
    assertHas(estateKeys, 'buyer_estate_source_of_funds')
    assertHas(insolventKeys, 'trustee_or_curator_appointment')
    assertHas(insolventKeys, 'insolvency_authority_docs')
    assertHas(insolventKeys, 'insolvency_finance_or_source_docs')
  }

  console.log('legal buyer exceptional capacity Phase 5 tests passed')
} finally {
  await server.close()
}
