export {
  RENTAL_DOMAIN_CONTRACT_VERSION,
  RENTAL_DOMAIN_ENTITIES,
  RENTAL_SHARED_INFRASTRUCTURE,
  RENTAL_BOUNDARY_RULES,
  RENTAL_STATUS,
  RENTAL_COMMAND_CATALOG,
  canTransitionRentalStatus,
  assertRentalStatusTransition,
  getRentalCommandContract,
} from '../../services/rentals/rentalDomainContract.js'

export {
  RENTAL_MODULE_BOUNDARY_VERSION,
  RENTAL_MODULE_PUBLIC_SURFACES,
  RENTAL_MODULE_ROUTE_IDS,
  getRentalModuleRoute,
} from './shell/rentalModuleRegistry.js'

export { RentalModuleBoundary } from './shell/RentalModuleBoundary.jsx'
export { RENTAL_MODULE_API_VERSION, createRentalModuleApi } from './shared/api/rentalModuleApi.js'

export {
  RENTAL_CAPABILITY_CONTRACT_VERSION,
  RENTAL_CAPABILITIES,
  RENTAL_RLS_ENTITY_CONTRACTS,
  buildRentalCapabilityQueryScope,
  buildRentalRlsContract,
  canUseRentalCapability,
  getRentalCapabilityDefinition,
  getRentalCapabilityScope,
} from './shared/permissions/rentalCapabilities.js'

export {
  RENTAL_EVENT_OUTBOX_CONTRACT_VERSION,
  RENTAL_OUTBOX_STATUS,
  claimRentalOutboxEvent,
  commitRentalCommandWithOutbox,
  completeRentalOutboxEvent,
  createRentalOutboxEvent,
  processRentalOutboxEvent,
  retryRentalOutboxEvent,
} from './shared/events/rentalEventOutbox.js'

export {
  RENTAL_PERFORMANCE_CONTRACT_VERSION,
  RENTAL_PERFORMANCE_BUDGETS,
  RENTAL_PERFORMANCE_METRICS,
  buildRentalPerformanceReport,
  createRentalPerformanceTrace,
  evaluateRentalPerformanceSample,
  persistRentalPerformanceSample,
  summarizeRentalResources,
} from './shared/observability/rentalPerformanceTelemetry.js'

export {
  RentalApplicationsPage,
  RentalListingCreatePage,
  RentalListingDetailPage,
  RentalListingsPage,
  RentalTenanciesPage,
} from './shell/rentalRouteLoaders.js'

export { RENTAL_MODULES, resolveRentalModuleAvailability } from '../../services/rentals/rentalModuleAvailability.js'
