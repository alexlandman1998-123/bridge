import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const TRANSACTION_ID = '66666666-6666-4666-8666-666666666666'

function keys(items = []) {
  return new Set(items.map((item) => item.key || item.requirement_key || item.document_key).filter(Boolean))
}

function assertHas(actualKeys, key, message) {
  assert.equal(actualKeys.has(key), true, message || `expected ${key}`)
}

function beneficialOwner(index) {
  return {
    full_name: `Beneficial Owner ${index}`,
    id_number: `9401015009${String(index).padStart(3, '0')}`,
    phone: `0861234${String(index).padStart(3, '0')}`,
    email: `beneficial.owner${index}@example.com`,
    residential_address: `${index} Beneficial Owner Street, Cape Town`,
    ownership_percentage: index === 1 ? '60' : '40',
  }
}

function sellerBeneficialOwner(index) {
  return {
    name: 'Seller',
    surname: `Beneficial Owner ${index}`,
    id_number: `9501015009${String(index).padStart(3, '0')}`,
    phone: `0871234${String(index).padStart(3, '0')}`,
    email: `seller.beneficial.owner${index}@example.com`,
    residential_address: `${index} Seller Beneficial Owner Street, Johannesburg`,
    ownershipPercentage: index === 1 ? '75' : '25',
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
    return {
      select() {
        return new FakeQuery().select()
      },
    }
  },
}

try {
  const {
    deriveOnboardingConfiguration,
  } = await server.ssrLoadModule('/src/lib/purchaserPersonas.js')
  const {
    buildSellerRequirementProfile,
    getRequiredSellerDocuments,
  } = await server.ssrLoadModule('/src/lib/sellerDocumentRequirementEngine.js')
  const {
    ensureTransactionRequiredDocuments,
  } = await server.ssrLoadModule('/src/lib/api.js')

  {
    const config = deriveOnboardingConfiguration({
      purchaser_type: 'company',
      purchase_finance_type: 'cash',
      company: {},
    })
    const documentKeys = keys(config.requiredDocuments)
    assertHas(documentKeys, 'beneficial_ownership_declaration')
  }

  {
    const config = deriveOnboardingConfiguration({
      purchaser_type: 'company',
      purchase_finance_type: 'cash',
      company: {
        beneficial_owners: [beneficialOwner(1), beneficialOwner(2)],
      },
    })
    const documentKeys = keys(config.requiredDocuments)
    assertHas(documentKeys, 'beneficial_ownership_declaration')
    assertHas(documentKeys, 'beneficial_owner_1_id_document')
    assertHas(documentKeys, 'beneficial_owner_1_proof_of_address')
    assertHas(documentKeys, 'beneficial_owner_2_id_document')
    assertHas(documentKeys, 'beneficial_owner_2_proof_of_address')
  }

  {
    const config = deriveOnboardingConfiguration({
      purchaser_type: 'trust',
      purchase_finance_type: 'cash',
      trust: {
        beneficial_owners: [beneficialOwner(1)],
      },
    })
    const documentKeys = keys(config.requiredDocuments)
    assertHas(documentKeys, 'beneficial_ownership_declaration')
    assertHas(documentKeys, 'beneficial_owner_1_id_document')
    assertHas(documentKeys, 'beneficial_owner_1_proof_of_address')
  }

  {
    const profile = buildSellerRequirementProfile({
      status: 'onboarding_completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'company',
        },
      },
    })
    const docs = getRequiredSellerDocuments(profile)
    const beneficial = docs.find((doc) => doc.key === 'beneficial_ownership_fica')
    assert.equal(Boolean(beneficial), true)
    assert.equal(beneficial.is_required, true)
    assert.equal(beneficial.visibility, 'seller_visible')
  }

  {
    const profile = buildSellerRequirementProfile({
      status: 'onboarding_completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'company',
          companyBeneficialOwners: [sellerBeneficialOwner(1), sellerBeneficialOwner(2)],
        },
      },
    })
    const documentKeys = keys(getRequiredSellerDocuments(profile))
    assertHas(documentKeys, 'beneficial_ownership_fica')
    assertHas(documentKeys, 'seller_beneficial_owner_1_id_document')
    assertHas(documentKeys, 'seller_beneficial_owner_2_proof_of_address')
  }

  {
    const profile = buildSellerRequirementProfile({
      status: 'onboarding_completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'trust',
          trustBeneficialOwners: [sellerBeneficialOwner(1)],
        },
      },
    })
    const docs = getRequiredSellerDocuments(profile)
    const documentKeys = keys(docs)
    const beneficial = docs.find((doc) => doc.key === 'trust_beneficial_ownership_fica')
    assert.equal(Boolean(beneficial), true)
    assert.equal(beneficial.is_required, true)
    assert.equal(beneficial.visibility, 'seller_visible')
    assertHas(documentKeys, 'seller_beneficial_owner_1_id_document')
    assertHas(documentKeys, 'seller_beneficial_owner_1_proof_of_address')
  }

  {
    const rows = await ensureTransactionRequiredDocuments(fakeClient, {
      transactionId: TRANSACTION_ID,
      purchaserType: 'company',
      financeType: 'cash',
      stage: 'OTP In Progress',
      currentMainStage: 'OTP',
      formData: {
        purchaser_type: 'company',
        purchase_finance_type: 'cash',
        company: {
          beneficial_owners: [beneficialOwner(1)],
        },
      },
    }, { sync: false })
    const documentKeys = keys(rows)
    assertHas(documentKeys, 'beneficial_ownership_declaration')
    assertHas(documentKeys, 'beneficial_owner_1_id_document')
    assertHas(documentKeys, 'beneficial_owner_1_proof_of_address')
  }

  console.log('legal beneficial ownership Phase 3 tests passed')
} finally {
  await server.close()
}
