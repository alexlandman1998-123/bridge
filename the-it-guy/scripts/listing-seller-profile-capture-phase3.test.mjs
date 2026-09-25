import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  LISTING_SELLER_REQUIREMENT_PROJECTION_VERSION,
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

await test('AgentListingDetail surfaces seller document impact in the builder and Documents tab', async () => {
  const source = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
  const persistenceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')

  assert.ok(source.includes('sellerProfileRequirementPreview'), 'Builder modal should compute a live requirement preview.')
  assert.ok(source.includes('listing-seller-profile-requirement-preview'), 'Builder modal should render the document impact preview.')
  assert.ok(source.includes('sellerDocumentRequirementModel'), 'Documents tab should compute the saved seller requirement model.')
  assert.ok(source.includes('listing-seller-document-model-summary'), 'Documents tab should render seller model summary.')
  assert.ok(source.includes('const projectedDocumentRequirements = requirementProjection.allRequirementRows.map'), 'Local-only listings should retain their generated requirement rows.')
  assert.ok(source.includes("requirementSyncReason: 'listing_seller_profile_capture'"), 'Remote save should still trigger requirement sync.')
  assert.ok(persistenceSource.includes('SELLER_REQUIREMENT_SYNC_FAILED'), 'A saved seller profile must not silently continue with stale document requirements.')
  assert.ok(persistenceSource.includes('document requirements could not be refreshed'), 'The seller profile save should surface requirement-sync failures instead of showing a projected-only document list.')
  assert.ok(source.includes("{ title: 'Sales Documents', icon: HandCoins, rows: salesDocuments }"), 'The top-level Documents tab should include the Sales Documents group.')
  assert.ok(source.includes("{ title: 'FICA Documents', icon: ShieldCheck, rows: sellerDocuments }"), 'The top-level Documents tab should label seller compliance rows as FICA Documents.')
})

await test('projects company document requirements and preserves uploaded statuses', () => {
  const projection = buildListingSellerProfileRequirementProjection({
    branch: 'company',
    companyName: 'Acme Holdings',
    companyRegistrationNumber: '2020/123456/07',
    propertyAddress: '10 Example Road',
  }, {
    id: 'listing-company',
    documentRequirements: [
      {
        id: 'existing-signed-mandate',
        requirement_key: 'signed_mandate',
        requirement_name: 'Signed Mandate',
        status: 'uploaded',
      },
    ],
  })
  const keys = projection.upsertRows.map((row) => row.requirement_key)
  const signedMandate = projection.upsertRows.find((row) => row.requirement_key === 'signed_mandate')
  const titleDeed = projection.upsertRows.find((row) => row.requirement_key === 'title_deed_copy')

  assert.equal(projection.projectionVersion, LISTING_SELLER_REQUIREMENT_PROJECTION_VERSION)
  assert.equal(projection.summary.sellerBranch, 'company')
  assert.equal(signedMandate.status, 'uploaded')
  assert.equal(titleDeed?.is_required, false, 'Title deed copies should be optional when they are unavailable.')
  assert.ok(keys.includes('company_registration'))
  assert.ok(keys.includes('company_resolution_to_sell'))
  assert.ok(keys.includes('director_member_ids'))
  assert.ok(projection.groups.find((group) => group.key === 'fica').rows.length >= 4)
})

await test('projects trust document requirements with trustee and beneficial ownership rows', () => {
  const projection = buildListingSellerProfileRequirementProjection({
    branch: 'trust',
    trustName: 'Family Property Trust',
    trustees: [{ fullName: 'Taylor Trustee' }],
    trustBeneficiaries: [{ fullName: 'Bailey Beneficiary' }],
    propertyAddress: '20 Trust Avenue',
  }, { id: 'listing-trust' })
  const keys = projection.upsertRows.map((row) => row.requirement_key)

  assert.equal(projection.summary.sellerBranch, 'trust')
  assert.ok(keys.includes('seller_trust_deed'))
  assert.ok(keys.includes('seller_letters_of_authority'))
  assert.ok(keys.includes('trustee_ids'))
  assert.ok(keys.includes('trust_beneficial_ownership_fica'))
})

await test('retires stale requirements when the seller model changes branch', () => {
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
        status: 'required',
      },
      {
        id: 'director-ids',
        requirement_key: 'director_member_ids',
        requirement_name: 'Director / Member ID Documents',
        status: 'required',
      },
    ],
  })
  const retiredKeys = projection.markNotApplicableRows.map((row) => row.requirement_key)
  const activeKeys = projection.upsertRows.map((row) => row.requirement_key)

  assert.ok(retiredKeys.includes('company_registration'))
  assert.ok(retiredKeys.includes('director_member_ids'))
  assert.ok(activeKeys.includes('seller_trust_deed'))
  assert.ok(!activeKeys.includes('company_registration'))
})

await test('projects multiple-owner requirements per owner', () => {
  const projection = buildListingSellerProfileRequirementProjection({
    branch: 'multiple_owners',
    propertyAddress: '30 Joint Road',
    multipleOwners: [
      { name: 'First', surname: 'Owner' },
      { name: 'Second', surname: 'Owner' },
      { name: 'Third', surname: 'Owner' },
    ],
  }, { id: 'listing-multiple' })
  const keys = projection.upsertRows.map((row) => row.requirement_key)

  assert.equal(projection.summary.sellerBranch, 'multiple_owners')
  assert.equal(projection.summary.ownerCount, 3)
  assert.ok(keys.includes('owner_1_id_document'))
  assert.ok(keys.includes('owner_2_id_document'))
  assert.ok(keys.includes('owner_3_id_document'))
  assert.ok(keys.includes('all_owner_authority_consent'))
})

console.log('listing seller profile capture phase 3 checks passed.')
