import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'
import { buildListingMandateReplacementWorkflow, createListingMandateTermsRevision } from '../src/services/listings/listingMandateReplacementModel.js'
import { buildSellerDocumentUploadQueue } from '../src/services/listings/listingSellerDocumentUploadModel.js'
import { buildListingSellerInformationModel } from '../src/services/listings/listingSellerInformationModel.js'
import { buildListingSellerSetupState } from '../src/services/listings/listingSellerSetupState.js'

const pageSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

for (const marker of [
  'configured-seller-workspace-columns',
  'saveListingSellerCanonicalUpdate',
  'sellerDocumentUploadModalOpen',
  'Required-document progress',
  'mandateReplacementOpen',
  'Regenerate and send for signature',
  'Special conditions and saved seller notes are included',
]) {
  assert.ok(pageSource.includes(marker), `listing Seller workspace should retain ${marker}`)
}

const directListing = buildListingSellerSetupState({
  source: 'direct_listing_intake',
  sellerName: 'Known contact only',
})
assert.equal(directListing.requiresSetup, true)
assert.equal(directListing.actions.canPrepareMandate, false)

const configuredListing = {
  sellerOnboarding: {
    formData: {
      sellerType: 'company',
      sellerLegalType: 'company',
      ownerStructureType: 'company',
      companyName: 'Example Property Holdings',
      companyRegistrationNumber: '2026/123456/07',
      authorisedSignatoryName: 'Sam Signer',
      authorisedSignatoryCapacity: 'Director',
      authorisedSignatoryEmail: 'sam@example.com',
      email: 'sam@example.com',
      phone: '0820000000',
    },
  },
}
const configuredState = buildListingSellerSetupState(configuredListing)
assert.equal(configuredState.configured, true)
assert.equal(configuredState.actions.canGenerateComplianceRequirements, true)
assert.ok(buildListingSellerInformationModel(configuredListing).groups.some((group) => group.title === 'Company details'))

const revision = createListingMandateTermsRevision({
  previous: { specialConditions: 'Existing condition', sellerNotes: 'Existing note' },
  next: { specialConditions: 'Updated condition', sellerNotes: 'Existing note' },
  recordedAt: '2026-09-24T10:00:00.000Z',
})
const replacement = buildListingMandateReplacementWorkflow({
  sessions: [{ signing_group_id: 'signed-pack', status: 'signed', selected_documents: ['mandate'], signed_at: '2026-09-20T10:00:00.000Z' }],
  revisions: [revision],
  refreshRequired: true,
  amendmentRequired: true,
})
assert.equal(replacement.status, 'amendment_required')
assert.deepEqual(replacement.changedFieldLabels, ['Special conditions'])

const uploadQueue = buildSellerDocumentUploadQueue([
  { key: 'identity', label: 'Identity document', required: true, status: 'pending' },
  { key: 'address', label: 'Proof of address', required: true, status: 'approved' },
])
assert.equal(uploadQueue.outstandingRequired, 1)
assert.equal(uploadQueue.percent, 50)

const mandate = mapSellerOnboardingToMandateData({
  onboardingSubmission: {
    sellerFirstName: 'Sam',
    sellerSurname: 'Seller',
    email: 'sam@example.com',
    propertyAddress: '1 Test Street',
    mandateType: 'sole',
    askingPrice: 1000000,
    commissionPercentage: 5,
    vatHandling: 'inclusive',
    specialConditions: 'Solar battery excluded.',
    sellerNotes: 'Seller requires 24 hours notice.',
  },
})
assert.match(mandate.placeholders.special_conditions, /Solar battery excluded\./)
assert.match(mandate.placeholders.special_conditions, /Notes: Seller requires 24 hours notice\./)

console.log('listing seller workspace release checks passed')
