export const PROPERTY24_API_BASE_PATH = '/api/property24'

export const PROPERTY24_API_ROUTES = {
  previewListing: `${PROPERTY24_API_BASE_PATH}/listings/:listingId/preview`,
  previewRentalListing: `${PROPERTY24_API_BASE_PATH}/rentals/:listingId/preview`,
  publishListing: `${PROPERTY24_API_BASE_PATH}/listings/:listingId/publish`,
  listingStatus: `${PROPERTY24_API_BASE_PATH}/listings/:listingId/status`,
  updateListingStatus: `${PROPERTY24_API_BASE_PATH}/listings/:listingId/status-update`,
  listingLeads: `${PROPERTY24_API_BASE_PATH}/listings/:listingId/leads`,
  pullLeads: `${PROPERTY24_API_BASE_PATH}/leads/pull`,
  runReconciliation: `${PROPERTY24_API_BASE_PATH}/reconciliation/run`,
}

export const PROPERTY24_API_METHODS = {
  previewListing: 'POST',
  previewRentalListing: 'POST',
  publishListing: 'POST',
  listingStatus: 'GET',
  updateListingStatus: 'POST',
  listingLeads: 'GET',
  pullLeads: 'POST',
  runReconciliation: 'POST',
}
