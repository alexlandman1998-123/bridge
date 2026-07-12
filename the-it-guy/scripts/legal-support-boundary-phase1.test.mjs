import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function keys(items = []) {
  return new Set(items.map((item) => item.key || item.requirement_key || item.id || item.document_definition_key || item.generated?.document_definition_key).filter(Boolean))
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

try {
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
    buildProjectedTransactionRequirementCandidates,
  } = await server.ssrLoadModule('/src/services/documents/transactionCanonicalDocumentRequirementService.js')

  {
    const profile = resolveDocumentRequestProfile({
      id: 'tx-company-bond',
      purchaser_type: 'company',
      finance_type: 'bond',
    })
    const documentKeys = keys(profile.requiredDocuments)
    assert.equal(profile.supportBoundaryStatus, 'supported')
    assert.equal(profile.automationAllowed, true)
    assertMissing(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'cipc_registration')
    assertHas(documentKeys, 'company_resolution')
  }

  {
    const profile = resolveDocumentRequestProfile({
      id: 'tx-foreign-cash',
      purchaser_type: 'foreign_purchaser',
      finance_type: 'cash',
    })
    const documentKeys = keys(profile.requiredDocuments)
    assert.equal(profile.supportBoundaryStatus, 'manual_review')
    assert.equal(profile.manualReviewRequired, true)
    assert.equal(profile.automationAllowed, false)
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'passport_copy')
    assertHas(documentKeys, 'source_of_funds')
    assertHas(documentKeys, 'proof_of_funds')
  }

  {
    const profile = resolveDocumentRequestProfile({
      id: 'tx-cc-cash',
      purchaser_type: 'cc',
      finance_type: 'cash',
    })
    const documentKeys = keys(profile.requiredDocuments)
    assert.equal(profile.supportBoundaryStatus, 'manual_review')
    assert.equal(profile.manualReviewRequired, true)
    assert.equal(profile.automationAllowed, false)
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'ck_documents')
    assertHas(documentKeys, 'member_resolution')
    assertHas(documentKeys, 'beneficial_ownership_declaration')
    assertMissing(documentKeys, 'id_document', 'CC buyer must not fall back to individual ID docs')
    assertMissing(documentKeys, 'company_resolution', 'CC buyer must not fall back to company resolution docs')
  }

  {
    const profile = resolveDocumentRequestProfile({
      id: 'tx-unsupported-buyer',
      purchaser_type: 'alien_structure',
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
    const buyerProfile = getBuyerRequirementProfile({
      transaction: {
        id: 'tx-buyer-profile-cc',
        purchaser_type: 'cc',
        finance_type: 'cash',
      },
    })
    const documentKeys = keys(buyerProfile.requiredDocuments)
    const actionKeys = new Set(getRequiredTransactionActions(buyerProfile).map((action) => action.key))
    assert.equal(buyerProfile.supportBoundaryStatus, 'manual_review')
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'ck_documents')
    assertHas(documentKeys, 'member_resolution')
    assertMissing(documentKeys, 'id_document')
    assertHas(actionKeys, 'legal_manual_review_required')
    assertHas(actionKeys, 'complete_close_corporation_documents')
  }

  {
    const profile = buildSellerRequirementProfile({
      status: 'onboarding_completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'business_rescue',
        },
      },
    })
    const documentKeys = keys(getRequiredSellerDocuments(profile))
    assert.equal(profile.supportBoundaryStatus, 'unsupported')
    assert.equal(profile.unsupported, true)
    assertHas(documentKeys, 'legal_support_boundary_stop')
    assertMissing(documentKeys, 'id_document', 'Business rescue seller must not fall back to personal seller docs')
    assertMissing(documentKeys, 'signed_mandate', 'Business rescue seller must stop before normal mandate docs')
  }

  {
    const profile = buildSellerRequirementProfile({
      status: 'onboarding_completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'poa',
          powerOfAttorneyRepresentatives: [{ name: 'Representative One' }],
        },
      },
    })
    const documentKeys = keys(getRequiredSellerDocuments(profile))
    assert.equal(profile.supportBoundaryStatus, 'manual_review')
    assertHas(documentKeys, 'legal_support_boundary_review')
    assertHas(documentKeys, 'power_of_attorney_document')
    assertHas(documentKeys, 'principal_identity')
  }

  {
    const projection = buildProjectedTransactionRequirementCandidates({
      transaction: {
        id: 'tx-canonical-cc',
        purchaser_type: 'cc',
        finance_type: 'cash',
      },
      definitions: [
        buyerDefinition('buyer_id_document'),
        buyerDefinition('ck_documents'),
        buyerDefinition('proof_of_funds', 'finance'),
      ],
    })
    const projectedKeys = keys(projection.candidates.map((candidate) => candidate.generated || candidate))
    assert.equal(projection.supportBoundary.status, 'manual_review')
    assertMissing(projectedKeys, 'buyer_id_document', 'Canonical projection must not emit individual fallback buyer candidates for CC')
    assertHas(projectedKeys, 'ck_documents')
  }

  console.log('legal support boundary Phase 1 tests passed')
} finally {
  await server.close()
}
