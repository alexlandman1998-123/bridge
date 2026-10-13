import { buildSellerLeadListingPrefill, readSellerLeadListingCapture } from '../lib/sellerLeadListingPrefill.js'
import { isUnconvertedSellerLeadIntake } from '../lib/sellerLeadListingBoundary.js'
import { createPrivateListing, getPrivateListing, updatePrivateListing, persistSellerProfileOnboardingFormData, syncPrivateListingDistributionData } from './privateListingService'
import { updateAgencyCrmLeadRecord } from '../lib/agencyCrmRepository'

const text = value => String(value ?? '').trim()

export function hasSellerLeadDraftAddress({ lead = {}, listing = {} } = {}) {
  const source = listing?.sourceListing || listing || {}
  const capture = readSellerLeadListingCapture({ lead, listing: source })
  if (['propertyAddressLine1', 'propertyAddress', 'propertyAddressDetails'].some(key => Object.hasOwn(capture, key))) {
    return Boolean(text(capture.propertyAddressLine1) || text(capture.propertyAddress) || text(capture.propertyAddressDetails?.line1))
  }
  const keys = ['formattedAddress', 'streetAddress', 'addressLine1']
  if (keys.some(key => Object.hasOwn(capture, key)) || Object.hasOwn(capture, 'propertyAddressDetails')) {
    return keys.some(key => text(capture[key])) || Boolean(text(capture.propertyAddressDetails?.line1))
  }
  return Boolean(text(source.addressLine1 || source.formattedAddress || lead.sellerPropertyAddress || lead.streetAddress || lead.formattedAddress))
}

export async function createSellerLeadDraftListing({ organisationId, lead, contact = {}, listing = null, currentAgent = {} }, dependencies = {}) {
  const api = { createPrivateListing, getPrivateListing, updatePrivateListing, persistSellerProfileOnboardingFormData, syncPrivateListingDistributionData, updateAgencyCrmLeadRecord, ...dependencies }
  const leadId = text(lead.leadId || lead.id)
  const listingId = text(listing?.id || listing?.sourceListing?.id || lead.listingId || lead.listing_id)
  let current = listingId ? await api.getPrivateListing(listingId) : null
  const verifyLink = row => {
    if (!row || text(row.organisationId || row.organisation_id) !== text(organisationId) ||
      ![row.originatingCrmLeadId, row.originating_crm_lead_id, row.sellerLeadId, row.seller_lead_id].map(text).includes(leadId)) {
      throw new Error('This property record does not belong to this seller lead. Check the link before creating a draft.')
    }
  }
  if (current) {
    verifyLink(current)
    if (['archived', 'withdrawn'].includes(text(current.listingStatus || current.listing_status).toLowerCase()) ||
      text(current.listingVisibility || current.listing_visibility) === 'archived') throw new Error('This listing is archived or withdrawn. Review the existing listing before creating another draft.')
    // An operational listing already owns its marketing data. A repeated
    // create action must never replace it with older onboarding answers.
    if (!isUnconvertedSellerLeadIntake(current)) {
      await api.updateAgencyCrmLeadRecord(organisationId, leadId, { listingId: current.id })
      return { listing: current, existing: true }
    }
  }
  if (!hasSellerLeadDraftAddress({ lead, listing: current })) throw new Error('Add the property address before creating a draft listing.')
  let prefill = buildSellerLeadListingPrefill({ lead, contact, listing: current || {}, currentAgent })
  if (!current) {
    const result = await api.createPrivateListing({ ...prefill.listingPayload,
      organisationId, assignedAgentId: lead.assignedAgentId || currentAgent.id,
      sellerLeadId: leadId, originatingCrmLeadId: leadId, listingSource: 'seller_lead_intake',
      listingStatus: 'seller_lead', listingVisibility: 'internal', isActive: false,
      mandateStatus: 'not_started', sellerOnboardingStatus: 'not_started',
    }, { syncRequirements: false, includeRequirementsAndDocuments: false })
    current = result.listing
    verifyLink(current)
    if (result.existing && !isUnconvertedSellerLeadIntake(current)) {
      await api.updateAgencyCrmLeadRecord(organisationId, leadId, { listingId: current.id })
      return { listing: current, existing: true }
    }
    if (!current.sellerOnboarding?.token) {
      const onboarding = await api.persistSellerProfileOnboardingFormData({ listingId: current.id, listingSnapshot: current,
        token: lead.sellerOnboardingToken, formData: prefill.sellerOnboardingFormData, status: 'in_progress', allowProtectedSectionOverride: true })
      current = { ...current, sellerOnboarding: { ...onboarding, formData: onboarding.form_data || onboarding.formData } }
    }
    prefill = buildSellerLeadListingPrefill({ lead, contact, listing: current, currentAgent })
  }
  if (!hasSellerLeadDraftAddress({ lead, listing: current })) throw new Error('Add the property address before creating a draft listing.')
  const propertyPayload = { ...prefill.listingPayload }
  for (const key of ['sellerCanonicalFacts', 'sellerCanonicalFactReadiness', 'sellerCanonicalFactsUpdatedAt', 'sellerType']) delete propertyPayload[key]
  const distribution = await api.syncPrivateListingDistributionData(current.id, {
    publicationData: { ...(current.listingPublicationData || {}), ...prefill.publicationData, status: 'Draft' },
    media: prefill.media, externalLinks: current.externalLinks || current.listingExternalLinks || [],
    allowBlankFeatures: Object.hasOwn(prefill.sellerOnboardingFormData, 'features'),
    allowBlankAmenities: Object.hasOwn(prefill.sellerOnboardingFormData, 'amenities'),
  })
  if (!distribution || distribution.skipped) throw new Error('The draft exists, but its property details could not be saved. Try again to finish preparing it.')
  const latest = await api.getPrivateListing(current.id, { includeRequirementsAndDocuments: false })
  verifyLink(latest)
  if (!isUnconvertedSellerLeadIntake(latest)) throw new Error('This property has already moved into Listings. Reload it to open the existing listing.')
  const beforeRevision = current.sellerOnboarding?.updatedAt || current.sellerOnboarding?.updated_at
  const afterRevision = latest.sellerOnboarding?.updatedAt || latest.sellerOnboarding?.updated_at
  if (beforeRevision && Date.parse(beforeRevision) !== Date.parse(afterRevision)) {
    throw new Error('The seller details changed while the draft was being prepared. Your latest answers are safe. Try again to use the updated information.')
  }
  await api.updatePrivateListing(current.id, { ...propertyPayload, listingSource: 'private_listing', listingStatus: 'listing_review',
    listingVisibility: 'internal', isActive: false }, { syncRequirements: false, includeRequirementsAndDocuments: false,
    expectedUpdatedAt: latest.updatedAt || latest.updated_at, expectedListingSource: 'seller_lead_intake' })
  await api.updateAgencyCrmLeadRecord(organisationId, leadId, { listingId: current.id })
  const saved = await api.getPrivateListing(current.id)
  if (!saved || saved.id !== current.id) throw new Error('The draft could not be checked after saving. Reload the property before trying again.')
  return { listing: saved, existing: false }
}
