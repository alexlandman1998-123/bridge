import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION,
  buildListingSellerProfileRequirementProjection,
} from '../src/lib/listingSellerProfileBuilderModel.js'

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('AgentListingDetail renders retired requirement lifecycle surfaces', async () => {
  const source = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

  assert.ok(source.includes('listing-seller-profile-retired-requirements-preview'), 'Builder preview should list requirements that will be retired.')
  assert.ok(source.includes('listing-seller-retired-requirements'), 'Documents tab should show retired requirements after save.')
  assert.ok(source.includes('sellerDocumentRequirementModel.retiredRows'), 'Documents model should expose retired requirement rows.')
  assert.ok(source.includes('documentRequirements: requirementProjection.allRequirementRows.map'), 'Local listing state should preserve active and retired requirement rows.')
})

await test('projection preserves stale company requirements as retired when switching to trust', () => {
  const projection = buildListingSellerProfileRequirementProjection({
    branch: 'trust',
    trustName: 'Family Property Trust',
    propertyAddress: '20 Trust Avenue',
  }, {
    id: 'listing-switch',
    documentRequirements: [
      {
        id: 'company-reg',
        requirement_key: 'company_registration',
        requirement_name: 'Company Registration Documents',
        requirement_group: 'company',
        status: 'required',
      },
      {
        id: 'director-ids',
        requirement_key: 'director_member_ids',
        requirement_name: 'Director / Member ID Documents',
        requirement_group: 'company',
        status: 'requested',
      },
    ],
  })
  const retiredKeys = projection.retiredRows.map((row) => row.requirement_key)
  const allKeys = projection.allRequirementRows.map((row) => row.requirement_key)
  const companyRegistration = projection.retiredRows.find((row) => row.requirement_key === 'company_registration')

  assert.equal(projection.summary.retired, 2)
  assert.ok(retiredKeys.includes('company_registration'))
  assert.ok(retiredKeys.includes('director_member_ids'))
  assert.ok(allKeys.includes('seller_trust_deed'))
  assert.ok(allKeys.includes('company_registration'))
  assert.equal(companyRegistration.status, 'not_applicable')
  assert.equal(companyRegistration.is_required, false)
  assert.equal(companyRegistration.required, false)
  assert.equal(companyRegistration.retiredBySellerProfileBuilder, true)
  assert.equal(companyRegistration.retirementVersion, LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION)
  assert.equal(companyRegistration.generated_from.archived, true)
  assert.equal(companyRegistration.generated_from.retirement_version, LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION)
})

await test('projection keeps matching uploaded requirements active', () => {
  const projection = buildListingSellerProfileRequirementProjection({
    branch: 'company',
    companyName: 'Acme Holdings',
    companyRegistrationNumber: '2020/123456/07',
    propertyAddress: '10 Example Road',
  }, {
    id: 'listing-company',
    documentRequirements: [
      {
        id: 'signed-mandate',
        requirement_key: 'signed_mandate',
        requirement_name: 'Signed Mandate',
        requirement_group: 'mandate',
        status: 'uploaded',
      },
    ],
  })
  const signedMandate = projection.allRequirementRows.find((row) => row.requirement_key === 'signed_mandate')

  assert.equal(projection.summary.retired, 0)
  assert.equal(projection.retiredRows.length, 0)
  assert.equal(signedMandate.status, 'uploaded')
  assert.equal(signedMandate.retiredBySellerProfileBuilder, undefined)
})

await test('projection does not retire requirements when the branch remains aligned', () => {
  const projection = buildListingSellerProfileRequirementProjection({
    branch: 'company',
    companyName: 'Acme Holdings',
    companyRegistrationNumber: '2020/123456/07',
    propertyAddress: '10 Example Road',
  }, {
    id: 'listing-company',
    documentRequirements: [
      {
        id: 'company-reg',
        requirement_key: 'company_registration',
        requirement_name: 'Company Registration Documents',
        requirement_group: 'company',
        status: 'requested',
      },
      {
        id: 'director-ids',
        requirement_key: 'director_member_ids',
        requirement_name: 'Director / Member ID Documents',
        requirement_group: 'company',
        status: 'required',
      },
    ],
  })

  assert.equal(projection.summary.retired, 0)
  assert.equal(projection.retiredRows.length, 0)
  assert.ok(projection.allRequirementRows.some((row) => row.requirement_key === 'company_registration' && row.status === 'requested'))
  assert.ok(projection.allRequirementRows.some((row) => row.requirement_key === 'director_member_ids' && row.status === 'required'))
})

console.log('listing seller profile capture phase 4 checks passed.')
