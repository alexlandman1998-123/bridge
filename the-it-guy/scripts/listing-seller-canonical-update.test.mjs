import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  applyListingSellerCanonicalUpdateSnapshot,
  buildListingSellerCanonicalUpdate,
  LISTING_SELLER_CANONICAL_UPDATE_VERSION,
} from '../src/services/listings/listingSellerCanonicalUpdateModel.js'
import { saveListingSellerCanonicalUpdate } from '../src/services/listings/listingSellerCanonicalUpdateService.js'

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`)
      throw error
    })
}

const listing = {
  id: '11111111-1111-4111-8111-111111111111',
  organisationId: '22222222-2222-4222-8222-222222222222',
  updatedAt: '2026-09-24T12:00:00.000Z',
  sellerType: 'individual',
  sellerOnboardingStatus: 'in_progress',
  sellerOnboarding: {
    status: 'in_progress',
    formData: {
      sellerProfileCaptureSource: 'listing_seller_profile_capture',
      ownerEntityType: 'natural_person',
      ownerStructureType: 'individual',
      sellerFirstName: 'Old',
      sellerSurname: 'Owner',
      email: 'old@example.com',
      propertyAddress: '10 Example Road',
    },
  },
}

await test('builds one canonical seller mutation with provenance and optimistic concurrency', () => {
  const update = buildListingSellerCanonicalUpdate({
    listing,
    formPatch: { sellerFirstName: 'New', firstName: 'New' },
    mutationId: '33333333-3333-4333-8333-333333333333',
    mutationType: 'seller_contact_edit',
    now: '2026-09-24T13:00:00.000Z',
  })

  assert.equal(update.version, LISTING_SELLER_CANONICAL_UPDATE_VERSION)
  assert.equal(update.expectedUpdatedAt, listing.updatedAt)
  assert.equal(update.nextFormData.sellerSurname, 'Owner')
  assert.equal(update.authority.profileType, 'individual')
  assert.equal(update.requirementsAffected, false)
  assert.deepEqual(update.changedFields, ['firstName', 'sellerFirstName'])
  assert.equal(update.canonicalFacts.context.canonical_update.mutation_id, update.mutationId)
})

await test('marks authority and ownership changes for document requirement resync', () => {
  const update = buildListingSellerCanonicalUpdate({
    listing,
    formPatch: {
      ownerEntityType: 'company',
      ownerStructureType: 'company',
      sellerType: 'company',
      companyName: 'Example Holdings',
      authorisedSignatoryName: 'Alex Director',
    },
    mutationId: '44444444-4444-4444-8444-444444444444',
  })

  assert.equal(update.authority.profileType, 'company')
  assert.equal(update.sellerType, 'company')
  assert.equal(update.requirementsAffected, true)
  assert.equal(update.listingPatch.requirementsAffected, true)
})

await test('does not turn a contact-only edit into an individual ownership confirmation', () => {
  const unknownListing = {
    id: listing.id,
    sellerType: 'individual',
    sellerOnboarding: { status: 'not_started', formData: {} },
  }
  const update = buildListingSellerCanonicalUpdate({
    listing: unknownListing,
    formPatch: { fullName: 'Contact Only', email: 'contact@example.com' },
    mutationId: '77777777-7777-4777-8777-777777777777',
  })

  assert.equal(update.authority.identified, false)
  assert.equal(update.readiness.ownerStructureType, false)
  assert.equal(update.canonicalFacts.seller.full_name, 'Contact Only')
  assert.equal(update.canonicalFacts.seller.owner_structure_type, undefined)
})

await test('applies the same committed snapshot to the local listing projection', () => {
  const update = buildListingSellerCanonicalUpdate({
    listing,
    formPatch: { notes: 'Access by appointment only.' },
    mutationId: '55555555-5555-4555-8555-555555555555',
    now: '2026-09-24T14:00:00.000Z',
  })
  const snapshot = applyListingSellerCanonicalUpdateSnapshot(listing, update)

  assert.equal(snapshot.sellerOnboarding.formData.notes, 'Access by appointment only.')
  assert.equal(snapshot.sellerCanonicalFacts.context.canonical_update.mutation_id, update.mutationId)
  assert.equal(update.requirementsAffected, false)
})

await test('uses one canonical persistence call and treats CRM as a warning-only projection', async () => {
  let persistenceCalls = 0
  const result = await saveListingSellerCanonicalUpdate({
    listing: { ...listing, sellerLeadId: 'lead-1' },
    formPatch: { email: 'new@example.com', sellerEmail: 'new@example.com' },
    mutationId: '66666666-6666-4666-8666-666666666666',
    organisationId: listing.organisationId,
  }, {
    savePrivateListingSellerCanonicalUpdate: async (update) => {
      persistenceCalls += 1
      return { listing: applyListingSellerCanonicalUpdateSnapshot(listing, update), receipt: { mutationId: update.mutationId }, syncedRequirements: [] }
    },
    fetchAgencyCrmLeadWorkspace: async () => ({ contacts: [{ contactId: 'contact-1' }] }),
    updateAgencyCrmContactRecord: async () => { throw new Error('CRM offline') },
  })

  assert.equal(persistenceCalls, 1)
  assert.equal(result.listing.seller.email, 'new@example.com')
  assert.equal(result.warnings[0].code, 'CRM_CONTACT_SYNC_FAILED')
})

await test('returns the committed seller snapshot when requirement projection needs retry', async () => {
  const committedListing = { ...listing, updatedAt: '2026-09-24T15:00:00.000Z' }
  const result = await saveListingSellerCanonicalUpdate({
    listing,
    formPatch: { ownerStructureType: 'company', sellerType: 'company' },
    mutationId: '88888888-8888-4888-8888-888888888888',
    syncLinkedCrmContact: false,
  }, {
    savePrivateListingSellerCanonicalUpdate: async () => {
      const error = new Error('Seller details were saved, but document requirements need a retry.')
      error.code = 'SELLER_REQUIREMENT_SYNC_FAILED'
      error.committed = true
      error.listing = committedListing
      throw error
    },
  })

  assert.equal(result.receipt.committed, true)
  assert.equal(result.listing.updatedAt, committedListing.updatedAt)
  assert.equal(result.warnings[0].code, 'SELLER_REQUIREMENT_SYNC_FAILED')
})

await test('wires listing seller editors to the canonical service and an atomic RLS RPC', async () => {
  const [page, privateListingService, migration] = await Promise.all([
    readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/migrations/20260924151653_listing_seller_canonical_update_phase2.sql', import.meta.url), 'utf8'),
  ])

  assert.ok(page.match(/saveListingSellerCanonicalUpdate\(/g)?.length >= 3)
  assert.ok(privateListingService.includes("client.rpc('save_private_listing_seller_canonical_update'"))
  assert.ok(migration.includes('security invoker'))
  assert.ok(migration.includes('for update'))
  assert.ok(migration.includes("activity_type = 'seller_canonical_update'"))
  assert.ok(migration.includes('p_expected_updated_at'))
  assert.ok(migration.includes('revoke all on function public.save_private_listing_seller_canonical_update'))
})

console.log('listing seller canonical update checks passed.')
