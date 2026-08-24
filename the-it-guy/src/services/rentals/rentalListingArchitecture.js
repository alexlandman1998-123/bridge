export const RENTAL_LISTING_ARCHITECTURE_VERSION = 'arch9_rental_listing_architecture_v1'

export const RENTAL_LISTING_STORAGE_DECISION = Object.freeze({
  currentSourceOfRecord: 'private_listings',
  currentRentalMarker: 'listing_category:rental',
  currentFactsLocation: 'seller_canonical_facts.rentalInfo',
  nextStructuredExtension: 'rental_listing_details',
  landlordRelationship: 'client_record_required_before_scale',
  accountingBoundary: 'excluded_until_rent_collection_phase',
})

export const SHARED_RESIDENTIAL_LISTING_SURFACES = Object.freeze([
  {
    key: 'index',
    salesSurface: '/listings',
    rentalSurface: '/agent/rentals/listings',
    intent: 'search_filter_status_create',
  },
  {
    key: 'create_flow',
    salesSurface: 'quick_add_listing',
    rentalSurface: 'create_rental_listing',
    intent: 'capture_minimum_viable_listing_draft',
  },
  {
    key: 'detail',
    salesSurface: '/agent/listings/:listingId',
    rentalSurface: '/agent/rentals/listings/:listingId',
    intent: 'single_listing_operating_surface',
  },
  {
    key: 'media',
    salesSurface: 'listing_media',
    rentalSurface: 'listing_media',
    intent: 'photos_floorplans_and_marketing_assets',
  },
  {
    key: 'mandate',
    salesSurface: 'sale_mandate',
    rentalSurface: 'rental_mandate',
    intent: 'authority_to_market_and_fee_terms',
  },
  {
    key: 'marketing',
    salesSurface: 'marketing_publication',
    rentalSurface: 'landlord_approved_marketing_publication',
    intent: 'description_features_approval_and_portals',
  },
  {
    key: 'syndication',
    salesSurface: 'property24_sale',
    rentalSurface: 'property24_rental',
    intent: 'readiness_preview_publish_status_sync',
  },
  {
    key: 'activity',
    salesSurface: 'listing_activity',
    rentalSurface: 'listing_activity',
    intent: 'notes_events_tasks_and_audit_trail',
  },
])

export const RENTAL_LISTING_ROUTES = Object.freeze({
  index: '/agent/rentals/listings',
  create: '/agent/rentals/listings?create=rental',
  detail: '/agent/rentals/listings/:listingId',
  property: '/agent/rentals/listings/:listingId/property',
  landlord: '/agent/rentals/listings/:listingId/landlord',
  terms: '/agent/rentals/listings/:listingId/terms',
  mandate: '/agent/rentals/listings/:listingId/mandate',
  inspection: '/agent/rentals/listings/:listingId/inspection',
  marketing: '/agent/rentals/listings/:listingId/marketing',
  syndication: '/agent/rentals/listings/:listingId/syndication',
  applications: '/agent/rentals/listings/:listingId/applications',
  activity: '/agent/rentals/listings/:listingId/activity',
})

export const RENTAL_LISTING_DETAIL_TABS = Object.freeze([
  {
    key: 'overview',
    label: 'Overview',
    routeKey: 'detail',
    salesParity: 'summary',
    intent: 'readiness_next_action_and_listing_identity',
  },
  {
    key: 'property',
    label: 'Property',
    routeKey: 'property',
    salesParity: 'property',
    intent: 'address_property_facts_features_and_description',
  },
  {
    key: 'landlord',
    label: 'Landlord',
    routeKey: 'landlord',
    salesParity: 'seller',
    intent: 'landlord_contact_ownership_and_preferences',
  },
  {
    key: 'terms',
    label: 'Rental Terms',
    routeKey: 'terms',
    salesParity: 'pricing',
    intent: 'rent_deposit_availability_and_lease_terms',
  },
  {
    key: 'mandate',
    label: 'Mandate',
    routeKey: 'mandate',
    salesParity: 'mandate',
    intent: 'rental_mandate_status_evidence_fee_terms_and_dates',
  },
  {
    key: 'inspection',
    label: 'Inspection',
    routeKey: 'inspection',
    salesParity: 'compliance',
    intent: 'condition_access_repairs_keys_and_checklist',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    routeKey: 'marketing',
    salesParity: 'marketing',
    intent: 'photos_copy_features_landlord_approval',
  },
  {
    key: 'syndication',
    label: 'Syndication',
    routeKey: 'syndication',
    salesParity: 'syndication',
    intent: 'property24_rental_preview_blockers_publish_and_sync',
  },
  {
    key: 'applications',
    label: 'Applications',
    routeKey: 'applications',
    salesParity: 'offers',
    intent: 'tenant_enquiries_applications_screening_and_landlord_approval',
  },
  {
    key: 'activity',
    label: 'Activity',
    routeKey: 'activity',
    salesParity: 'activity',
    intent: 'timeline_notes_tasks_and_audit',
  },
])

export const RENTAL_LISTING_INDEX_COLUMNS = Object.freeze([
  'image',
  'title',
  'address',
  'monthlyRent',
  'availableFrom',
  'landlord',
  'assignedAgent',
  'mandateStatus',
  'marketingApprovalStatus',
  'property24Status',
  'applicationCount',
  'nextAction',
])

export const RENTAL_LISTING_FIELD_GROUPS = Object.freeze([
  {
    key: 'identity',
    label: 'Listing Identity',
    storage: 'private_listings',
    fields: ['title', 'listingCategory', 'listingType', 'listingStatus', 'listingVisibility', 'assignedAgentId', 'branchId'],
  },
  {
    key: 'property',
    label: 'Property',
    storage: 'private_listings',
    fields: ['propertyAddress', 'suburb', 'city', 'province', 'propertyType', 'bedrooms', 'bathrooms', 'parkingBays', 'description'],
  },
  {
    key: 'landlord',
    label: 'Landlord',
    storage: 'private_listings_then_clients',
    fields: ['landlordName', 'landlordEmail', 'landlordPhone', 'landlordType', 'landlordClientId'],
  },
  {
    key: 'terms',
    label: 'Rental Terms',
    storage: 'seller_canonical_facts.rentalInfo_then_rental_listing_details',
    fields: ['monthlyRent', 'depositAmount', 'availableFrom', 'leasePeriodMonths', 'furnishedStatus', 'petsPolicy', 'utilitiesPolicy'],
  },
  {
    key: 'mandate',
    label: 'Rental Mandate',
    storage: 'private_listings_then_rental_listing_details',
    fields: ['mandateType', 'mandateStatus', 'mandateStartDate', 'mandateEndDate', 'managementFeeType', 'managementFeeValue'],
  },
  {
    key: 'inspection',
    label: 'Inspection',
    storage: 'seller_canonical_facts.rentalInfo_then_rental_listing_details',
    fields: ['inspectionStatus', 'inspectionNotes', 'accessNotes', 'repairNotes', 'keysStatus'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    storage: 'listing_distribution_data',
    fields: ['marketingApprovalStatus', 'publicationTitle', 'publicationDescription', 'media', 'features', 'externalLinks'],
  },
  {
    key: 'syndication',
    label: 'Syndication',
    storage: 'property24_listing_syncs',
    fields: ['property24Status', 'property24Reference', 'property24ListingUrl', 'property24PayloadPreview', 'property24Blockers'],
  },
  {
    key: 'applications',
    label: 'Applications',
    storage: 'private_listing_activities_then_rental_applications',
    fields: ['applicationCount', 'latestApplicationStatus', 'latestCreditCheckStatus', 'latestLandlordApprovalStatus'],
  },
  {
    key: 'activity',
    label: 'Activity',
    storage: 'private_listing_activities',
    fields: ['internalNotes', 'activityTimeline', 'followUpTasks'],
  },
])

export const PROPERTY24_RENTAL_READINESS_FIELDS = Object.freeze([
  'listingType',
  'rentalInfo',
  'agencyId',
  'contactAgentIds',
  'agentSourceReference',
  'suburbId',
  'propertyTypeId',
  'monthlyRent',
  'availableFrom',
  'description',
  'photos',
  'petsAllowed',
  'furnishedStatus',
  'garages',
  'garden',
  'pool',
  'flatlet',
  'marketingApprovalStatus',
  'mandateStatus',
])

export const RENTAL_LISTING_DEFERRED_CAPABILITIES = Object.freeze([
  'rent_collection',
  'arrears',
  'landlord_payouts',
  'full_rental_accounting',
  'maintenance_billing',
])

export function getRentalListingFieldNames() {
  return Array.from(new Set(RENTAL_LISTING_FIELD_GROUPS.flatMap((group) => group.fields)))
}

export function getRentalListingRouteMap() {
  return RENTAL_LISTING_DETAIL_TABS.reduce((routes, tab) => ({
    ...routes,
    [tab.key]: RENTAL_LISTING_ROUTES[tab.routeKey],
  }), {
    index: RENTAL_LISTING_ROUTES.index,
    create: RENTAL_LISTING_ROUTES.create,
  })
}

export function getRentalListingArchitecture() {
  return {
    version: RENTAL_LISTING_ARCHITECTURE_VERSION,
    storageDecision: RENTAL_LISTING_STORAGE_DECISION,
    sharedSurfaces: SHARED_RESIDENTIAL_LISTING_SURFACES,
    routes: RENTAL_LISTING_ROUTES,
    routeMap: getRentalListingRouteMap(),
    detailTabs: RENTAL_LISTING_DETAIL_TABS,
    indexColumns: RENTAL_LISTING_INDEX_COLUMNS,
    fieldGroups: RENTAL_LISTING_FIELD_GROUPS,
    fieldNames: getRentalListingFieldNames(),
    property24ReadinessFields: PROPERTY24_RENTAL_READINESS_FIELDS,
    deferredCapabilities: RENTAL_LISTING_DEFERRED_CAPABILITIES,
  }
}
