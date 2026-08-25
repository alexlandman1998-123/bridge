import {
  PROPERTY24_RENTAL_READINESS_FIELDS,
  RENTAL_LISTING_DEFERRED_CAPABILITIES,
  RENTAL_LISTING_DETAIL_TABS,
  RENTAL_LISTING_ROUTES,
  getRentalListingArchitecture,
  getRentalListingRouteMap,
} from './rentalListingArchitecture.js'
import {
  RENTAL_MODULES,
  resolveRentalModuleAvailability,
} from './rentalModuleAvailability.js'
import {
  buildRentalProperty24PublishRequest,
} from './rentalListingProperty24PublishModel.js'
import {
  buildRentalProperty24Readiness,
} from './rentalListingProperty24ReadinessModel.js'
import {
  buildRentalProperty24FieldComparison,
} from './rentalListingProperty24FieldComparisonModel.js'

export const RENTAL_LISTING_RELEASE_GATE_VERSION = 'arch9_rental_listing_release_gate_v1'

const REQUIRED_DETAIL_TABS = Object.freeze([
  'overview',
  'property',
  'landlord',
  'terms',
  'mandate',
  'inspection',
  'marketing',
  'syndication',
  'applications',
  'activity',
])

const REQUIRED_ROUTES = Object.freeze([
  'index',
  'create',
  'detail',
  'property',
  'landlord',
  'terms',
  'mandate',
  'inspection',
  'marketing',
  'syndication',
  'applications',
  'activity',
])

const REQUIRED_DEFERRED_CAPABILITIES = Object.freeze([
  'rent_collection',
  'arrears',
  'landlord_payouts',
  'full_rental_accounting',
])

export const RENTAL_LISTING_RELEASE_GATE_FIXTURE = Object.freeze({
  id: 'rental-release-gate-1',
  title: 'Release gate rental',
  formattedAddress: '12 Main Road',
  suburb: 'Green Point',
  city: 'Cape Town',
  province: 'Western Cape',
  propertyType: 'Apartment',
  property24AgencyId: '31382',
  property24ContactAgentIds: ['77959'],
  property24SuburbId: '12345',
  property24PropertyTypeId: '5',
  assignedAgentId: 'agent-1',
  bedrooms: 2,
  bathrooms: 2,
  parkingBays: 1,
  garages: 0,
  garden: false,
  pool: false,
  flatlet: false,
  mandateEndDate: '2026-12-31',
  description: 'A complete rental listing fixture for release-gate checks.',
  photos: ['https://example.test/release-gate-rental.jpg'],
  sellerCanonicalFacts: {
    landlordName: 'A Landlord',
    landlordEmail: 'landlord@example.com',
    rentalInfo: {
      monthlyRent: 22000,
      depositAmount: 44000,
      availableFrom: '2026-09-01',
      leasePeriodMonths: 12,
      furnishedStatus: 'unfurnished',
      petsPolicy: 'not_allowed',
      utilitiesPolicy: 'tenant_pays',
      mandateStatus: 'signed_uploaded',
      marketingApprovalStatus: 'approved',
    },
  },
})

function check(key, label, passed, detail = '') {
  return {
    key,
    label,
    passed: Boolean(passed),
    detail,
  }
}

function hasEvery(source = [], required = []) {
  return required.every((item) => source.includes(item))
}

export function buildRentalListingReleaseGate(options = {}) {
  const architecture = getRentalListingArchitecture()
  const routeMap = getRentalListingRouteMap()
  const listing = options.listing || RENTAL_LISTING_RELEASE_GATE_FIXTURE
  const readiness = buildRentalProperty24Readiness(listing)
  const property24FieldComparison = buildRentalProperty24FieldComparison(listing)
  const publishRequest = buildRentalProperty24PublishRequest(listing, {
    requestedAt: options.requestedAt || '2026-08-24T12:00:00.000Z',
    requestedBy: options.requestedBy || 'release-gate',
  })
  const rentalsListingAvailability = resolveRentalModuleAvailability({
    rentalsEnabled: true,
  }, RENTAL_MODULES.listings)
  const property24DefaultAvailability = resolveRentalModuleAvailability({
    rentalsEnabled: true,
  }, RENTAL_MODULES.property24)
  const property24EnabledAvailability = resolveRentalModuleAvailability({
    rentalsEnabled: true,
    property24RentalsEnabled: true,
  }, RENTAL_MODULES.property24)
  const sourceGuards = options.sourceGuards || {}

  const tabKeys = RENTAL_LISTING_DETAIL_TABS.map((tab) => tab.key)
  const routeKeys = Object.keys(RENTAL_LISTING_ROUTES)
  const checks = [
    check('architecture_version', 'Architecture version', architecture.version === 'arch9_rental_listing_architecture_v1', architecture.version),
    check('route_contract', 'Route contract', hasEvery(routeKeys, REQUIRED_ROUTES), REQUIRED_ROUTES.join(', ')),
    check('tab_contract', 'Detail tab contract', hasEvery(tabKeys, REQUIRED_DETAIL_TABS), REQUIRED_DETAIL_TABS.join(', ')),
    check('tab_routes', 'Detail tabs have routes', RENTAL_LISTING_DETAIL_TABS.every((tab) => routeMap[tab.key]), 'Every tab resolves to a rental listing route'),
    check('property24_readiness_contract', 'Property24 readiness contract', hasEvery(readiness.items.map((item) => item.key), PROPERTY24_RENTAL_READINESS_FIELDS), `${readiness.items.length}/${PROPERTY24_RENTAL_READINESS_FIELDS.length} fields`),
    check('property24_field_comparison_contract', 'Property24 field comparison contract', property24FieldComparison.readyForBackendAdapter === true, `${property24FieldComparison.summary.blockers} blockers, ${property24FieldComparison.summary.warnings} warnings`),
    check('property24_ready_fixture', 'Property24 ready fixture', readiness.readyToPublish && readiness.readinessPercent === 100, `${readiness.readinessPercent}% ready`),
    check('publish_request_guarded', 'Publish request is guarded', publishRequest.canPrepare && publishRequest.status === 'ready_for_backend_publish', publishRequest.status),
    check('publish_live_write_disabled', 'Live portal write disabled', publishRequest.liveWriteEnabled === false && publishRequest.requiresBackendPublisher === true, 'Backend publisher still required'),
    check('listings_module_available', 'Listings module available when Rentals enabled', rentalsListingAvailability.enabled === true, rentalsListingAvailability.reason),
    check('property24_module_flagged', 'Property24 Rentals stays feature-flagged', property24DefaultAvailability.enabled === false && property24DefaultAvailability.reason === 'property24_disabled' && property24EnabledAvailability.enabled === true, property24DefaultAvailability.reason),
    check('deferred_accounting_boundary', 'Rental accounting remains deferred', hasEvery(RENTAL_LISTING_DEFERRED_CAPABILITIES, REQUIRED_DEFERRED_CAPABILITIES), REQUIRED_DEFERRED_CAPABILITIES.join(', ')),
    check('no_live_property24_source_path', 'No direct rental UI live Property24 write', sourceGuards.noLiveProperty24Write !== false, 'Rental UI prepares request only'),
    check('no_deferred_accounting_source_path', 'No deferred accounting source path', sourceGuards.noDeferredAccounting !== false, 'Accounting capabilities stay outside this release'),
  ]

  const failedChecks = checks.filter((item) => !item.passed)
  return {
    version: RENTAL_LISTING_RELEASE_GATE_VERSION,
    status: failedChecks.length ? 'blocked' : 'passed',
    passed: failedChecks.length === 0,
    checks,
    failedChecks,
    readiness,
    property24FieldComparison,
    publishRequest,
    architecture,
  }
}
