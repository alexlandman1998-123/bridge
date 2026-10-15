import { describe, expect, test, vi } from 'vitest'
import { persistSellerLeadCapture, recordSellerCaptureProgress } from '../sellerLeadCaptureService'
import { __privateListingServiceTestUtils } from '../privateListingService'
import { hasSignedMandateEvidence } from '../../core/clientAccess/clientAccessPolicy'
import { buildSellerProfileCanonicalPayload } from '../../lib/sellerProfileCaptureModel.js'
import { buildListingSellerInformationModel } from '../listings/listingSellerInformationModel.js'

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
    addLeadCollaborator: vi.fn(async payload => payload),
    removeLeadCollaborator: vi.fn(async () => true),
  }
  const save = (formData, additionalAgents = [], metadata = {}) => persistSellerLeadCapture({ organisationId: 'org-1', actor: { id: 'agent-1' }, assignedAgent: { id: 'agent-1' }, additionalAgents, source: 'Referral', ...metadata, candidate: { ...(receipt.listing || {}), sellerOnboarding: { formData } }, receipt }, api)
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
    expect(api.persistSellerProfileOnboardingFormData.mock.calls[0][0]).toMatchObject({ listingId: 'listing-1', token: 'token-1', status: 'in_progress', newOnboarding: true })
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

  test('capture saves one profile used by lead, listing, seller onboarding and portal presentation', async () => {
    const { save, receipt, read } = fixture()
    const form = {
      sellerFirstName: 'Sam', sellerSurname: 'Ngwenya', email: 'sam@example.test', phone: '+27820000000',
      ownershipType: 'individual', ownerEntityType: 'natural_person', ownerStructureType: 'single_owner', ownershipRouteConfirmed: true,
      idNumber: '8001015009087', sellerTaxNumber: '1234567890', nationality: 'South African',
      propertyAddress: '1 Example Road, Cape Town', propertyAddressLine1: '1 Example Road', city: 'Cape Town',
      propertyCategory: 'residential', propertyType: 'house', propertyStructureType: 'full_title', bedrooms: '3', bathrooms: '2', askingPrice: '2500000',
    }
    const canonical = buildSellerProfileCanonicalPayload(form, { id: 'listing-1' }, { draft: true, env: { VITE_CANONICAL_SELLER_FACTS_ENABLED: 'true' } })
    await save({ ...form, canonicalSellerFacts: canonical.canonicalSellerFacts })
    const stored = read()
    expect(receipt.lead.sellerOnboarding.formData).toEqual(stored)
    expect(receipt.lead.sellerPropertyAddress).toBe(form.propertyAddress)
    const reopened = __privateListingServiceTestUtils.mapPrivateListingRow(
      { id: 'listing-1', listing_status: 'seller_lead', bedrooms: 99 },
      new Map([['listing-1', { id: 'onboarding-1', status: 'in_progress', token: 'token-1', form_data: stored }]]),
    )
    expect(reopened.sellerOnboarding.formData).toEqual(stored)
    expect(reopened.sellerCanonicalFacts).toEqual(canonical.canonicalSellerFacts)
    expect(reopened.bedrooms).toBe(3)
    expect(reopened.bathrooms).toBe(2)
    const profile = buildListingSellerInformationModel(reopened)
    expect(profile.draft).toMatchObject({ sellerFirstName: 'Sam', sellerSurname: 'Ngwenya', email: 'sam@example.test', phone: '+27820000000', incomeTaxNumber: '1234567890', propertyAddress: form.propertyAddress })
    expect(profile.groups.find(group => group.key === 'tax').rows).toContainEqual(expect.objectContaining({ key: 'incomeTaxNumber', value: '1234567890' }))
    // Seller lead and seller portal both use this same profile model.
    const portalProfile = buildListingSellerInformationModel({ propertyAddress: form.propertyAddress, sellerCanonicalFacts: stored.canonicalSellerFacts, sellerOnboarding: { formData: stored } })
    expect(portalProfile.draft).toMatchObject({ sellerFirstName: profile.draft.sellerFirstName, sellerSurname: profile.draft.sellerSurname, email: profile.draft.email, phone: profile.draft.phone, incomeTaxNumber: profile.draft.incomeTaxNumber, propertyAddress: profile.draft.propertyAddress })
    expect(receipt.listing.sellerOnboarding.status).toBe('in_progress')
  })

  test('a slow contact update does not delay starting the confirmed lead summary or additional agent writes', async () => {
    const { api, save, receipt } = fixture()
    await save({ sellerFirstName: 'Sam', propertyAddress: '1 Example Road' })
    let completeContact
    api.updateAgencyCrmContactRecord.mockImplementationOnce(() => new Promise(resolve => { completeContact = resolve }))
    const saving = save({ sellerFirstName: 'Sam', email: 'new@example.test', propertyAddress: '2 Example Road' }, [{ userId: 'user-2' }])
    await vi.waitFor(() => expect(api.updateAgencyCrmLeadRecord).toHaveBeenCalledTimes(2))
    expect(api.addLeadCollaborator).toHaveBeenCalledTimes(1)
    expect(receipt.listing.sellerOnboarding.formData.email).toBe('new@example.test')
    completeContact({})
    await saving
    expect(receipt.collaboratorAgentIds).toEqual(['user-2'])
  })

  test('owner-only edits keep the shared save but do not resave the unchanged CRM summary', async () => {
    const { api, save } = fixture()
    await save({ sellerFirstName: 'Sam', propertyAddress: '1 Example Road' })
    await save({ sellerFirstName: 'Sam', propertyAddress: '1 Example Road', sellerTaxNumber: '1234567890' })
    expect(api.updateSellerOnboardingProgress).toHaveBeenCalledTimes(1)
    expect(api.updateAgencyCrmLeadRecord).toHaveBeenCalledTimes(1)
    expect(api.updateAgencyCrmContactRecord).not.toHaveBeenCalled()
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

  test('later source and priority changes update the existing lead summary', async () => {
    const { api, save, receipt } = fixture()
    await save({ sellerFirstName: 'Sam' }, [], { priority: 'Medium' })
    await save({ sellerFirstName: 'Sam' }, [], { source: 'Website', priority: 'High' })
    expect(api.updateAgencyCrmLeadRecord).toHaveBeenLastCalledWith('org-1', 'lead-1', expect.objectContaining({ leadSource: 'Website', priority: 'High' }))
    expect(receipt.lead).toMatchObject({ leadSource: 'Website', priority: 'High' })
    expect(api.createAgencyCrmLeadRecord).toHaveBeenCalledTimes(1)
  })

  test('deselecting an autosaved additional agent removes its assignment and retries a failed removal', async () => {
    const { api, save, receipt } = fixture()
    await save({ sellerFirstName: 'Sam' }, [{ userId: 'user-2' }, { userId: 'user-3' }])
    api.removeLeadCollaborator.mockRejectedValueOnce(new Error('Connection failed'))
    await expect(save({ sellerFirstName: 'Sam' }, [{ userId: 'user-3' }])).rejects.toMatchObject({ code: 'SELLER_CAPTURE_TEAM_FAILED', committed: true })
    expect(receipt.collaboratorAgentIds).toEqual(['user-2', 'user-3'])
    await save({ sellerFirstName: 'Sam' }, [{ userId: 'user-3' }])
    expect(api.removeLeadCollaborator).toHaveBeenLastCalledWith({ organisationId: 'org-1', leadId: 'lead-1', userId: 'user-2' })
    expect(receipt.lead.collaboratorAgentIds).toEqual(['user-3'])
    expect(api.addLeadCollaborator).toHaveBeenCalledTimes(2)
  })

  test('multiple-agent capture excludes the primary agent, deduplicates supporters and preserves successful assignments on retry', async () => {
    const { api, save, receipt } = fixture()
    const agents = [{ id: 'agent-1' }, { id: 'agent-2', userId: 'user-2' }, { id: 'other-id', userId: 'user-2' }, { id: 'agent-3', userId: 'user-3' }]
    api.addLeadCollaborator.mockImplementationOnce(async payload => payload).mockRejectedValueOnce(new Error('team save unavailable'))
    await expect(save({ sellerFirstName: 'Sam' }, agents)).rejects.toMatchObject({ code: 'SELLER_CAPTURE_TEAM_FAILED', committed: true })
    expect(receipt.collaboratorAgentIds).toEqual(['user-2'])
    await save({ sellerFirstName: 'Sam' }, agents)
    expect(api.addLeadCollaborator.mock.calls.map(([payload]) => payload.userId)).toEqual(['user-2', 'user-3', 'user-3'])
    expect(receipt.lead.collaboratorAgentIds).toEqual(['user-2', 'user-3'])
    expect(api.createAgencyCrmLeadRecord).toHaveBeenCalledTimes(1)
    expect(api.createPrivateListing).toHaveBeenCalledTimes(1)
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
