export const PRIVATE_PROPERTY_API_BASE_PATH = '/api/private-property'

export const PRIVATE_PROPERTY_API_ROUTES = {
  previewListing: `${PRIVATE_PROPERTY_API_BASE_PATH}/listings/:listingId/preview`,
  publishListing: `${PRIVATE_PROPERTY_API_BASE_PATH}/listings/:listingId/publish`,
  listingStatus: `${PRIVATE_PROPERTY_API_BASE_PATH}/listings/:listingId/status`,
  updateListingStatus: `${PRIVATE_PROPERTY_API_BASE_PATH}/listings/:listingId/status-update`,
  syndicationReview: `${PRIVATE_PROPERTY_API_BASE_PATH}/listings/:listingId/syndication-review`,
}

export const PRIVATE_PROPERTY_API_METHODS = {
  previewListing: 'POST',
  publishListing: 'POST',
  listingStatus: 'GET',
  updateListingStatus: 'POST',
  syndicationReview: 'GET',
}
