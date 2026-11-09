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

export function shouldLoadLeadWorkspaceRequest({ leadCategory = '', requestFamily = '', workspaceTab = null } = {}) {
  const category = String(leadCategory || '').trim().toLowerCase()
  const family = String(requestFamily || '').trim().toLowerCase()
  if (workspaceTab !== null) {
    const tab = String(workspaceTab || 'overview').trim().toLowerCase()
    const tabs = {
      private_listing_activity: ['activity', 'property'],
      buyer_viewing_preferences: ['appointments', 'properties', 'buyer_profile'],
      seller_viewing_coordination: ['appointments'],
      offers: ['documents', 'buyer_profile', 'onboarding_otp'],
      offer_portal_sessions: ['documents', 'buyer_profile', 'onboarding_otp'],
      lifecycle_diagnostic: ['documents', 'buyer_profile', 'finance', 'transactions'],
    }[family]
    if (tabs && !tabs.includes(tab)) return false
  }

  if (SHARED_REQUEST_FAMILIES.has(family)) return category === 'buyer' || category === 'seller'
  if (BUYER_REQUEST_FAMILIES.has(family)) return category === 'buyer'
  if (SELLER_REQUEST_FAMILIES.has(family)) return category === 'seller'
  return false
}

