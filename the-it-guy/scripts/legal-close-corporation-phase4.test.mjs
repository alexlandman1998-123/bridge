import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const TRANSACTION_ID = '77777777-7777-4777-8777-777777777777'

function keys(items = []) {
  return new Set(
    items
      .map((item) => item.key || item.requirement_key || item.document_key || item.document_definition_key || item.generated?.document_definition_key)
      .filter(Boolean),
  )
}

function assertHas(actualKeys, key, message) {
  assert.equal(actualKeys.has(key), true, message || `expected ${key}`)
}

function assertMissing(actualKeys, key, message) {
  assert.equal(actualKeys.has(key), false, message || `did not expect ${key}`)
}

function member(index) {
  return {
    full_name: `Member ${index}`,
    id_number: `9201015009${String(index).padStart(3, '0')}`,
    phone: `0831234${String(index).padStart(3, '0')}`,
    email: `member${index}@example.com`,
    residential_address: `${index} Member Street, Cape Town`,
    role_title: 'Member',
    signing_authority: index === 1 ? 'yes' : 'no',
  }
}

function beneficialOwner(index) {
  return {
    full_name: `Beneficial Owner ${index}`,
    id_number: `9301015009${String(index).padStart(3, '0')}`,
    phone: `0841234${String(index).padStart(3, '0')}`,
    email: `beneficial.owner${index}@example.com`,
    residential_address: `${index} Beneficial Owner Street, Cape Town`,
    ownership_percentage: index === 1 ? '70' : '30',
  }
}

class FakeQuery {
  select() {
    return this
  }

  eq() {
    return this
  }

  maybeSingle() {
    return Promise.resolve({ data: null, error: null })
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
    buildSellerRequirementProfile,
    getRequiredSellerDocuments,
  } = await server.ssrLoadModule('/src/lib/sellerDocumentRequirementEngine.js')
  const {
    ensureTransactionRequiredDocuments,
  } = await server.ssrLoadModule('/src/lib/api.js')

  {
    assert.equal(resolveBuyerBranch({ purchaser_type: 'cc' }), 'close_corporation')
    assert.equal(getPurchaserEntityType('cc'), 'close_corporation')
  }

  {
    const config = deriveOnboardingConfiguration({
      purchaser_type: 'cc',
      purchase_finance_type: 'cash',
      cc_name: 'Example Trading CC',
      members: [member(1), member(2)],
      beneficial_owners: [beneficialOwner(1)],
    })
    const documentKeys = keys(config.requiredDocuments)
    assert.equal(config.purchaserType, 'close_corporation')
    assertHas(documentKeys, 'ck_documents')
    assertHas(documentKeys, 'member_resolution')
    assertHas(documentKeys, 'member_id')
    assertHas(documentKeys, 'member_proof_of_address')
    assertHas(documentKeys, 'authorised_member_id')
    assertHas(documentKeys, 'beneficial_ownership_declaration')
    assertHas(documentKeys, 'member_1_id_document')
    assertHas(documentKeys, 'member_2_proof_of_address')
    assertHas(documentKeys, 'beneficial_owner_1_id_document')
    assertMissing(documentKeys, 'company_resolution')
    assertMissing(documentKeys, 'director_id')
    assertMissing(documentKeys, 'id_document')
  }

  {
    const profile = resolveDocumentRequestProfile({
      id: 'tx-cc-cash',
      purchaser_type: 'cc',
      finance_type: 'cash',
    }, {
      formData: {
        purchaser_type: 'cc',
        members: [member(1)],
      },
    })
    const documentKeys = keys(profile.requiredDocuments)
    assert.equal(profile.supportBoundaryStatus, 'manual_review')
    assert.equal(profile.manualReviewRequired, true)
    assert.equal(profile.automationAllowed, false)
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'ck_documents')
    assertHas(documentKeys, 'member_resolution')
    assertHas(documentKeys, 'member_1_id_document')
    assertMissing(documentKeys, 'company_resolution')
    assertMissing(documentKeys, 'id_document')
  }

  {
    const buyerProfile = getBuyerRequirementProfile({
      transaction: {
        id: 'tx-buyer-profile-cc',
        purchaser_type: 'cc',
        finance_type: 'cash',
      },
      formData: {
        purchaser_type: 'cc',
        members: [member(1)],
      },
    })
    const documentKeys = keys(buyerProfile.requiredDocuments)
    const actionKeys = new Set(getRequiredTransactionActions(buyerProfile).map((action) => action.key))
    assert.equal(buyerProfile.buyerType, 'close_corporation')
    assert.equal(buyerProfile.buyerEntityType, 'close_corporation')
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'ck_documents')
    assertHas(actionKeys, 'legal_manual_review_required')
    assertHas(actionKeys, 'complete_close_corporation_documents')
  }

  {
    const rows = await ensureTransactionRequiredDocuments(fakeClient, {
      transactionId: TRANSACTION_ID,
      purchaserType: 'cc',
      financeType: 'cash',
      stage: 'OTP In Progress',
      currentMainStage: 'OTP',
      formData: {
        purchaser_type: 'cc',
        purchase_finance_type: 'cash',
        members: [member(1), member(2)],
        beneficial_owners: [beneficialOwner(1)],
      },
    }, { sync: false })
    const documentKeys = keys(rows)
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'ck_documents')
    assertHas(documentKeys, 'member_resolution')
    assertHas(documentKeys, 'member_1_id_document')
    assertHas(documentKeys, 'member_2_proof_of_address')
    assertHas(documentKeys, 'beneficial_owner_1_id_document')
    assertMissing(documentKeys, 'company_resolution')
    assertMissing(documentKeys, 'id_document')
  }

  {
    const profile = buildSellerRequirementProfile({
      status: 'onboarding_completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'cc',
          closeCorporationName: 'Seller Trading CC',
          authorisedMemberName: 'Member 1',
          closeCorporationMembers: [member(1), member(2)],
          closeCorporationBeneficialOwners: [beneficialOwner(1)],
        },
      },
    })
    const docs = getRequiredSellerDocuments(profile)
    const documentKeys = keys(docs)
    assert.equal(profile.sellerBranch, 'close_corporation')
    assert.equal(profile.supportBoundaryStatus, 'manual_review')
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'cc_registration_documents')
    assertHas(documentKeys, 'member_resolution_to_sell')
    assertHas(documentKeys, 'member_ids')
    assertHas(documentKeys, 'authorised_member_id')
    assertHas(documentKeys, 'cc_beneficial_ownership_fica')
    assertHas(documentKeys, 'seller_member_1_id_document')
    assertHas(documentKeys, 'seller_member_2_proof_of_address')
    assertHas(documentKeys, 'seller_beneficial_owner_1_id_document')
    assertMissing(documentKeys, 'company_registration')
    assertMissing(documentKeys, 'director_member_ids')
  }

  console.log('legal close corporation Phase 4 tests passed')
} finally {
  await server.close()
}
