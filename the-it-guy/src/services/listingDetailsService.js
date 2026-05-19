import { buildPortalListingPayload, mapSellerOnboardingToListingDetails } from '../lib/listingDataMapper'
import {
  getPrivateListing,
  updatePrivateListing,
  updatePrivateListingOnboardingFormData,
} from './privateListingService'

export async function getListingPropertyDetails(listingId) {
  const listing = await getPrivateListing(listingId)
  if (!listing?.id) return null

  return {
    listing,
    sellerOnboardingSource: listing.sellerOnboarding?.formData || {},
    mappedDetails: mapSellerOnboardingToListingDetails(listing),
    portalListings: buildPortalListingPayload({
      property24ListingUrl: listing.property24ListingUrl,
      property24Reference: listing.property24Reference,
      property24Status: listing.property24Status,
      privatePropertyListingUrl: listing.privatePropertyListingUrl,
      privatePropertyReference: listing.privatePropertyReference,
      privatePropertyStatus: listing.privatePropertyStatus,
      bridgeListingStatus: listing.bridgeListingStatus,
      bridgeListingPublicUrl: listing.bridgeListingPublicUrl,
    }),
    images: listing.marketing?.imageGallery || [],
    agent: {
      id: listing.assignedAgentId || '',
      name: listing.assignedAgentName || listing.assignedAgent || '',
    },
    dates: {
      createdAt: listing.createdAt || null,
      updatedAt: listing.updatedAt || null,
      mandateSignedDate: listing.propertyDetails?.mandateSignedDate || '',
      listingDate: listing.propertyDetails?.listingDate || '',
      expiryDate: listing.propertyDetails?.expiryDate || '',
    },
  }
}

export async function updateListingPropertyDetails(listingId, payload = {}) {
  return updatePrivateListing(listingId, payload)
}

export async function syncListingFromSellerOnboarding(listingId, formData = {}) {
  return updatePrivateListingOnboardingFormData(listingId, formData)
}
