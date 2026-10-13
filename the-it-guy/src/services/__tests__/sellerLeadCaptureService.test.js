import { describe, expect, test, vi } from 'vitest'
import { persistSellerLeadCapture, recordSellerCaptureProgress } from '../sellerLeadCaptureService'
import { __privateListingServiceTestUtils } from '../privateListingService'
import { hasSignedMandateEvidence } from '../../core/clientAccess/clientAccessPolicy'

function fixture() {
  const receipt = { leadId: 'lead-1', contactId: 'contact-1', token: 'token-1', lead: null, listing: null }
  let stored = null
  const api = {
    createAgencyCrmLeadRecord: vi.fn(async payloadOrg => ({ leadId: receipt.leadId, organisationId: payloadOrg, contactId: receipt.contactId })),
    updateAgencyCrmLeadRecord: vi.fn(async () => ({})),
    updateAgencyCrmContactRecord: vi.fn(async () => ({})),
    createPrivateListing: vi.fn(async () => ({ listing: { id: 'listing-1', updatedAt: 'revision-0', listingStatus: 'seller_lead' } })),
    persistSellerProfileOnboardingFormData: vi.fn(async payload => {
      stored = structuredClone(payload.formData)
      return { id: 'onboarding-1', token: receipt.token, status: payload.status, form_data: stored, updated_at: 'revision-1', listing_updated_at: 'revision-1' }
    }),
    updateSellerOnboardingProgress: vi.fn(async (token, payload) => {
      stored = structuredClone(payload.formData)
      return { listing: { id: 'listing-1', updatedAt: 'revision-2', sellerOnboarding: { id: 'onboarding-1', token, status: payload.status, formData: stored } } }
    }),
  }
  const save = formData => persistSellerLeadCapture({ organisationId: 'org-1', actor: { id: 'agent-1' }, assignedAgent: { id: 'agent-1' }, source: 'Referral', candidate: { ...(receipt.listing || {}), sellerOnboarding: { formData } }, receipt }, api)
  return { receipt, api, save, read: () => stored }
}

describe('shared seller lead capture persistence', () => {
  test('real document loading retains the review marker without inventing a mandate signing date', () => {
    const { normalizeDocumentRows, mapPrivateListingRow } = __privateListingServiceTestUtils
    const files = normalizeDocumentRows([{ id: 'file-1', private_listing_id: 'listing-1', document_type: 'signed_mandate', status: 'uploaded',
      storage_path: 'seller-mandates/existing.pdf', uploaded_at: '2026-10-13T10:00:00Z', seller_signing_evidence_source: 'existing_signed_upload' }])
    expect(files[0].seller_signing_evidence_source).toBe('existing_signed_upload')
    const listing = mapPrivateListingRow({ id: 'listing-1', listing_status: 'seller_lead', mandate_status: 'not_started' }, null, null, new Map([['listing-1', files]]))
    expect(listing.mandate.signedAt).toBeNull()
    expect(listing.mandateSignedDate).toBe('')
    expect(hasSignedMandateEvidence(listing)).toBe(false)
    const approved = mapPrivateListingRow({ id: 'listing-1', listing_status: 'seller_lead', mandate_status: 'not_started' }, null, null, new Map([['listing-1', [{ ...files[0], status: 'approved' }]]]))
    expect(approved.mandate.signedAt).toBe('2026-10-13T10:00:00Z')
  })
  test('an empty capture creates one existing intake and keeps the exact optional fields', async () => {
    const { api, save, receipt, read } = fixture()
    const form = { sellerFirstName: '', email: '', phone: '', ownershipType: '', propertyCategory: '', propertyType: '', propertyAddress: '', currentStep: 0 }
    await save(form)
    expect(read()).toEqual(form)
    expect(api.createAgencyCrmLeadRecord.mock.calls[0][1].contact.contactId).toBe('contact-1')
    expect(api.createAgencyCrmLeadRecord.mock.calls[0][2].notifyAgent).toBe(false)
    expect(api.createPrivateListing.mock.calls[0][0]).toMatchObject({ originatingCrmLeadId: 'lead-1', sellerLeadId: 'lead-1', listingStatus: 'seller_lead', listingVisibility: 'internal' })
    expect(api.persistSellerProfileOnboardingFormData.mock.calls[0][0]).toMatchObject({ listingId: 'listing-1', token: 'token-1', status: 'in_progress' })
    expect(receipt.lead.sellerOnboarding.formData).toEqual(form)
  })

  test('later agent edits and deliberate clears use the same record and displayed revision', async () => {
    const { api, save, receipt, read } = fixture()
    await save({ sellerFirstName: 'Sam', email: 'sam@example.test', propertyType: 'apartment', propertyAddress: '1 Example Road' })
    const old = receipt.listing
    const revised = { ...read(), email: '', ratesTaxes: '850', companyDirectors: [{ id: 'person-1', name: 'Sam' }], propertyDisclosure: { responses: { roof: { answer: 'unsure' } } } }
    await save(revised)
    expect(read()).toEqual(revised)
    expect(api.createAgencyCrmLeadRecord).toHaveBeenCalledTimes(1)
    expect(api.createPrivateListing).toHaveBeenCalledTimes(1)
    expect(api.persistSellerProfileOnboardingFormData).toHaveBeenCalledTimes(1)
    expect(api.updateSellerOnboardingProgress.mock.calls[0][0]).toBe('token-1')
    expect(api.updateSellerOnboardingProgress.mock.calls[0][1].listingSnapshot.updatedAt).toBe(old.updatedAt)
    expect(api.updateAgencyCrmContactRecord.mock.calls[0]).toEqual(['org-1', 'contact-1', { firstName: 'Sam', lastName: '', email: '', phone: '' }])
  })

  test('a failed intake save can retry without duplicating the lead or listing', async () => {
    const { api, save } = fixture()
    api.persistSellerProfileOnboardingFormData.mockRejectedValueOnce(new Error('network unavailable'))
    await expect(save({ sellerFirstName: 'Sam' })).rejects.toThrow('network unavailable')
    await save({ sellerFirstName: 'Sam' })
    expect(api.createAgencyCrmLeadRecord).toHaveBeenCalledTimes(1)
    expect(api.createPrivateListing).toHaveBeenCalledTimes(1)
    expect(api.persistSellerProfileOnboardingFormData).toHaveBeenCalledTimes(2)
  })

  test('a failed lead projection keeps the confirmed intake and can finish without another lead', async () => {
    const { api, save, receipt } = fixture()
    api.updateAgencyCrmLeadRecord.mockRejectedValueOnce(new Error('summary unavailable'))
    await expect(save({ sellerFirstName: 'Sam', propertyAddress: '1 Example Road' })).rejects.toMatchObject({ committed: true, code: 'SELLER_CAPTURE_PROJECTION_FAILED' })
    expect(receipt.listing.sellerOnboarding.formData.propertyAddress).toBe('1 Example Road')
    await save({ sellerFirstName: 'Sam', propertyAddress: '1 Example Road' })
    expect(api.createAgencyCrmLeadRecord).toHaveBeenCalledTimes(1)
    expect(api.createPrivateListing).toHaveBeenCalledTimes(1)
    expect(receipt.lead.sellerPropertyAddress).toBe('1 Example Road')
  })

  test('a concurrent edit conflict is surfaced, without a direct-write fallback', async () => {
    const { api, save, receipt } = fixture()
    await save({ sellerFirstName: 'Sam' })
    const previous = receipt.listing
    api.updateSellerOnboardingProgress.mockRejectedValueOnce(Object.assign(new Error('Changed by seller'), { code: 'SELLER_UPDATE_CONFLICT' }))
    await expect(save({ sellerFirstName: 'Changed' })).rejects.toMatchObject({ code: 'SELLER_UPDATE_CONFLICT' })
    expect(receipt.listing).toBe(previous)
    expect(api.persistSellerProfileOnboardingFormData).toHaveBeenCalledTimes(1)
  })

  test('reported signed mandate progress only records an existing activity', async () => {
    const createActivity = vi.fn()
    await recordSellerCaptureProgress({ organisationId: 'org-1', receipt: { leadId: 'lead-1' }, progress: 'We already have a signed mandate', actor: { id: 'agent-1' } }, createActivity)
    expect(createActivity.mock.calls[0][2]).toMatchObject({ activityType: 'Seller Progress Reported', outcome: 'We already have a signed mandate' })
    expect(createActivity.mock.calls[0][2]).not.toHaveProperty('stage')
    expect(createActivity.mock.calls[0][2]).not.toHaveProperty('mandateStatus')
  })
})
