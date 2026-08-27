export const PRIVATE_PROPERTY_API_BASE_PATH = '/api/private-property'

export const PRIVATE_PROPERTY_API_ROUTES = {
  previewListing: `${PRIVATE_PROPERTY_API_BASE_PATH}/listings/:listingId/preview`,
  publishListing: `${PRIVATE_PROPERTY_API_BASE_PATH}/listings/:listingId/publish`,
  listingStatus: `${PRIVATE_PROPERTY_API_BASE_PATH}/listings/:listingId/status`,
}

export const PRIVATE_PROPERTY_API_METHODS = {
  previewListing: 'POST',
  publishListing: 'POST',
  listingStatus: 'GET',
}
