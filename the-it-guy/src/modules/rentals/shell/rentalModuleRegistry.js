export const RENTAL_MODULE_BOUNDARY_VERSION = 'arch9_rentals_module_boundary_v1'

export const RENTAL_MODULE_PUBLIC_SURFACES = Object.freeze([
  'shell', 'dashboard', 'portfolio', 'vacancies', 'applications', 'tenancies',
  'collections', 'maintenance', 'inspections', 'renewals', 'portals', 'shared',
])

export const RENTAL_MODULE_ROUTE_IDS = Object.freeze({
  dashboard: 'dashboard', tenancies: 'tenancies', leads: 'leads', applications: 'applications',
  calendar: 'calendar', listingCreate: 'listing_create', listingDetail: 'listing_detail', listings: 'listings',
})

const routes = Object.freeze({
  [RENTAL_MODULE_ROUTE_IDS.dashboard]: '/agent/rentals/dashboard',
  [RENTAL_MODULE_ROUTE_IDS.tenancies]: '/agent/rentals/tenancies',
  [RENTAL_MODULE_ROUTE_IDS.leads]: '/agent/rentals/pipeline/leads',
  [RENTAL_MODULE_ROUTE_IDS.applications]: '/agent/rentals/pipeline/applications',
  [RENTAL_MODULE_ROUTE_IDS.calendar]: '/agent/rentals/pipeline/calendar',
  [RENTAL_MODULE_ROUTE_IDS.listingCreate]: '/agent/rentals/listings/new',
  [RENTAL_MODULE_ROUTE_IDS.listingDetail]: '/agent/rentals/listings/:listingId/:detailTab?',
  [RENTAL_MODULE_ROUTE_IDS.listings]: '/agent/rentals/listings',
})

export function getRentalModuleRoute(routeId) {
  return routes[routeId] || ''
}
