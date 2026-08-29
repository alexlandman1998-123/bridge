export const LEAD_WORKSPACE_REQUEST_FAMILIES = Object.freeze({
  routeWorkspace: 'route_workspace',
  journeyOverrides: 'journey_overrides',
  offers: 'offers',
  offerPortalSessions: 'offer_portal_sessions',
  lifecycleDiagnostic: 'lifecycle_diagnostic',
  buyerViewingPreferences: 'buyer_viewing_preferences',
  sellerViewingCoordination: 'seller_viewing_coordination',
  privateListingActivity: 'private_listing_activity',
})

const SHARED_REQUEST_FAMILIES = new Set([
  LEAD_WORKSPACE_REQUEST_FAMILIES.routeWorkspace,
  LEAD_WORKSPACE_REQUEST_FAMILIES.journeyOverrides,
])

const BUYER_REQUEST_FAMILIES = new Set([
  LEAD_WORKSPACE_REQUEST_FAMILIES.offers,
  LEAD_WORKSPACE_REQUEST_FAMILIES.offerPortalSessions,
  LEAD_WORKSPACE_REQUEST_FAMILIES.lifecycleDiagnostic,
  LEAD_WORKSPACE_REQUEST_FAMILIES.buyerViewingPreferences,
  LEAD_WORKSPACE_REQUEST_FAMILIES.sellerViewingCoordination,
])

const SELLER_REQUEST_FAMILIES = new Set([
  LEAD_WORKSPACE_REQUEST_FAMILIES.privateListingActivity,
])

export function shouldLoadLeadWorkspaceRequest({ leadCategory = '', requestFamily = '' } = {}) {
  const category = String(leadCategory || '').trim().toLowerCase()
  const family = String(requestFamily || '').trim().toLowerCase()

  if (SHARED_REQUEST_FAMILIES.has(family)) return category === 'buyer' || category === 'seller'
  if (BUYER_REQUEST_FAMILIES.has(family)) return category === 'buyer'
  if (SELLER_REQUEST_FAMILIES.has(family)) return category === 'seller'
  return false
}

