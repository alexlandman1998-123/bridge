import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const TRANSACTION_ID = '55555555-5555-4555-8555-555555555555'

function keys(items = []) {
  return new Set(items.map((item) => item.key || item.requirement_key || item.document_key).filter(Boolean))
}

function assertHas(actualKeys, key, message) {
  assert.equal(actualKeys.has(key), true, message || `expected ${key}`)
}

function countMatching(actualKeys, pattern) {
  return [...actualKeys].filter((key) => pattern.test(key)).length
}

function director(index) {
  return {
    full_name: `Director ${index}`,
    id_number: `9001015009${String(index).padStart(3, '0')}`,
    phone: `0821234${String(index).padStart(3, '0')}`,
    email: `director${index}@example.com`,
    residential_address: `${index} Director Road, Cape Town`,
    signing_authority: index === 1 ? 'yes' : 'no',
  }
}

function sellerDirector(index) {
  return {
    name: `Seller`,
    surname: `Director ${index}`,
    email: `seller.director${index}@example.com`,
    phone: `0831234${String(index).padStart(3, '0')}`,
    id_number: `9101015009${String(index).padStart(3, '0')}`,
    residential_address: `${index} Seller Director Road, Johannesburg`,
    signingAuthority: index === 1,
  }
}

function trustee(index) {
  return {
    full_name: `Trustee ${index}`,
    id_number: `9201015009${String(index).padStart(3, '0')}`,
    phone: `0841234${String(index).padStart(3, '0')}`,
    email: `trustee${index}@example.com`,
    residential_address: `${index} Trustee Lane, Durban`,
    signing_authority: index === 1 ? 'yes' : 'no',
  }
}

function sellerTrustee(index) {
  return {
    name: `Seller`,
    surname: `Trustee ${index}`,
    email: `seller.trustee${index}@example.com`,
    phone: `0851234${String(index).padStart(3, '0')}`,
    id_number: `9301015009${String(index).padStart(3, '0')}`,
    residential_address: `${index} Seller Trustee Lane, Pretoria`,
    signingAuthority: index === 1,
  }
}

class FakeQuery {
  constructor(table) {
    this.table = table
  }

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
  from(table) {
    return {
      select() {
        return new FakeQuery(table).select()
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
      company: {
        directors: Array.from({ length: 10 }, (_, index) => director(index + 1)),
      },
    })
    const documentKeys = keys(config.requiredDocuments)
    assertHas(documentKeys, 'director_id', 'aggregate director ID row stays for compatibility')
    assertHas(documentKeys, 'director_1_id_document')
    assertHas(documentKeys, 'director_10_id_document')
    assertHas(documentKeys, 'director_10_proof_of_address')
    assert.equal(countMatching(documentKeys, /^director_\d+_id_document$/), 10)
    assert.equal(countMatching(documentKeys, /^director_\d+_proof_of_address$/), 10)
  }

  {
    const config = deriveOnboardingConfiguration({
      purchaser_type: 'trust',
      purchase_finance_type: 'cash',
      trust: {
        trustees: Array.from({ length: 4 }, (_, index) => trustee(index + 1)),
      },
    })
    const documentKeys = keys(config.requiredDocuments)
    assertHas(documentKeys, 'trustee_id', 'aggregate trustee ID row stays for compatibility')
    assertHas(documentKeys, 'trustee_1_id_document')
    assertHas(documentKeys, 'trustee_4_id_document')
    assertHas(documentKeys, 'trustee_4_proof_of_address')
    assert.equal(countMatching(documentKeys, /^trustee_\d+_id_document$/), 4)
    assert.equal(countMatching(documentKeys, /^trustee_\d+_proof_of_address$/), 4)
  }

  {
    const profile = buildSellerRequirementProfile({
      status: 'onboarding_completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'company',
          companyDirectors: Array.from({ length: 3 }, (_, index) => sellerDirector(index + 1)),
        },
      },
    })
    const documentKeys = keys(getRequiredSellerDocuments(profile))
    assertHas(documentKeys, 'director_member_ids')
    assertHas(documentKeys, 'seller_director_1_id_document')
    assertHas(documentKeys, 'seller_director_3_proof_of_address')
    assert.equal(countMatching(documentKeys, /^seller_director_\d+_id_document$/), 3)
    assert.equal(countMatching(documentKeys, /^seller_director_\d+_proof_of_address$/), 3)
  }

  {
    const profile = buildSellerRequirementProfile({
      status: 'onboarding_completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'trust',
          trustees: Array.from({ length: 5 }, (_, index) => sellerTrustee(index + 1)),
        },
      },
    })
    const documentKeys = keys(getRequiredSellerDocuments(profile))
    assertHas(documentKeys, 'trustee_ids')
    assertHas(documentKeys, 'seller_trustee_1_id_document')
    assertHas(documentKeys, 'seller_trustee_5_proof_of_address')
    assert.equal(countMatching(documentKeys, /^seller_trustee_\d+_id_document$/), 5)
    assert.equal(countMatching(documentKeys, /^seller_trustee_\d+_proof_of_address$/), 5)
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
          directors: Array.from({ length: 6 }, (_, index) => director(index + 1)),
        },
      },
    }, { sync: false })
    const documentKeys = keys(rows)
    assertHas(documentKeys, 'director_6_id_document')
    assertHas(documentKeys, 'director_6_proof_of_address')
    assert.equal(countMatching(documentKeys, /^director_\d+_id_document$/), 6)
  }

  console.log('legal requirement cardinality Phase 2 tests passed')
} finally {
  await server.close()
}
