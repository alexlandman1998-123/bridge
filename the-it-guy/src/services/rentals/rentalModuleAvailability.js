export const RENTAL_MODULES = Object.freeze({
  dashboard: 'dashboard',
  leads: 'leads',
  calendar: 'calendar',
  listings: 'listings',
  properties: 'properties',
  applications: 'applications',
  tenancies: 'tenancies',
  management: 'management',
  property24: 'property24',
})

const MODULE_COPY = Object.freeze({
  rentals_disabled: {
    title: 'Rentals Workspace',
    description: 'Rental workflows are still gated for this environment.',
  },
  applications_disabled: {
    title: 'Rental Applications',
    description: 'Tenant application capture is being configured for this staging workspace.',
  },
  leases_disabled: {
    title: 'Leases & Handover',
    description: 'Lease and handover workflow capture is being configured for this staging workspace.',
  },
  management_disabled: {
    title: 'Rental Management',
    description: 'Rental management workflows are not enabled for this phase.',
  },
  property24_disabled: {
    title: 'Property24 Rentals',
    description: 'Property24 rental publishing is not enabled for this workspace yet.',
  },
})

function asBoolean(value) {
  return value === true || value === 'true' || value === '1'
}

export function resolveRentalModuleAvailability(featureFlags = {}, moduleId = RENTAL_MODULES.dashboard) {
  const rentalsEnabled = asBoolean(featureFlags.rentalsEnabled)
  if (!rentalsEnabled) {
    return {
      enabled: false,
      reason: 'rentals_disabled',
      ...MODULE_COPY.rentals_disabled,
    }
  }

  if (moduleId === RENTAL_MODULES.applications && !asBoolean(featureFlags.rentalApplicationsEnabled)) {
    return {
      enabled: false,
      reason: 'applications_disabled',
      ...MODULE_COPY.applications_disabled,
    }
  }

  if (moduleId === RENTAL_MODULES.tenancies && !asBoolean(featureFlags.rentalLeasesEnabled)) {
    return {
      enabled: false,
      reason: 'leases_disabled',
      ...MODULE_COPY.leases_disabled,
    }
  }

  if (moduleId === RENTAL_MODULES.management && !asBoolean(featureFlags.rentalManagementEnabled)) {
    return {
      enabled: false,
      reason: 'management_disabled',
      ...MODULE_COPY.management_disabled,
    }
  }

  if (moduleId === RENTAL_MODULES.property24 && !asBoolean(featureFlags.property24RentalsEnabled)) {
    return {
      enabled: false,
      reason: 'property24_disabled',
      ...MODULE_COPY.property24_disabled,
    }
  }

  return {
    enabled: true,
    reason: 'enabled',
    title: '',
    description: '',
  }
}
