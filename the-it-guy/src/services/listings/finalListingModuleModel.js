export const FINAL_LISTING_MODULE_VERSION = 'arch9_final_listing_module_v1'

export const FINAL_LISTING_MODULE_ROUTES = Object.freeze({
  sales: Object.freeze({
    indexPath: '/listings',
    createPath: '/listings/new',
  }),
  rentals: Object.freeze({
    indexPath: '/agent/rentals/listings',
    createPath: '/agent/rentals/listings/new',
  }),
  portals: Object.freeze({
    property24SettingsPath: '/settings/syndication/property24',
    privatePropertySettingsPath: '/settings/syndication/private-property',
  }),
})

const MODULE_TYPES = Object.freeze({
  sales: Object.freeze({
    key: 'sales',
    label: 'Sales',
    ownerLabel: 'Seller',
    listingLabel: 'Sale listings',
    createLabel: 'New sale listing',
  }),
  rentals: Object.freeze({
    key: 'rentals',
    label: 'Rentals',
    ownerLabel: 'Landlord',
    listingLabel: 'Rental listings',
    createLabel: 'New rental listing',
  }),
})

function toCountMeta(value) {
  if (value === null || value === undefined || value === '') {
    return {
      count: 0,
      known: false,
    }
  }

  const count = Number(value || 0)
  return {
    count: Number.isFinite(count) && count > 0 ? Math.round(count) : 0,
    known: true,
  }
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function resolveFinalListingModuleType(value = 'sales') {
  const key = normalizeKey(value)
  return key === 'rentals' || key === 'rental' ? 'rentals' : 'sales'
}

export function buildFinalListingModuleOverview({
  activeType = 'sales',
  salesCount = null,
  rentalCount = null,
  developmentCount = null,
  property24Enabled = false,
  privatePropertyEnabled = false,
} = {}) {
  const resolvedActiveType = resolveFinalListingModuleType(activeType)
  const countMeta = {
    sales: toCountMeta(salesCount),
    rentals: toCountMeta(rentalCount),
    developments: toCountMeta(developmentCount),
  }
  const counts = {
    sales: countMeta.sales.count,
    rentals: countMeta.rentals.count,
    developments: countMeta.developments.count,
  }
  const portalCount = [property24Enabled, privatePropertyEnabled].filter(Boolean).length

  const lanes = Object.values(MODULE_TYPES).map((lane) => ({
    ...lane,
    ...FINAL_LISTING_MODULE_ROUTES[lane.key],
    active: lane.key === resolvedActiveType,
    count: countMeta[lane.key].count,
    countKnown: countMeta[lane.key].known,
  }))

  return {
    version: FINAL_LISTING_MODULE_VERSION,
    activeType: resolvedActiveType,
    counts,
    countMeta,
    lanes,
    actions: {
      createSale: FINAL_LISTING_MODULE_ROUTES.sales.createPath,
      createRental: FINAL_LISTING_MODULE_ROUTES.rentals.createPath,
      property24Settings: FINAL_LISTING_MODULE_ROUTES.portals.property24SettingsPath,
      privatePropertySettings: FINAL_LISTING_MODULE_ROUTES.portals.privatePropertySettingsPath,
    },
    portalSummary: {
      connectedCount: portalCount,
      label: portalCount ? `${portalCount} portal${portalCount === 1 ? '' : 's'} connected` : 'Portal readiness',
      tone: portalCount ? 'success' : 'neutral',
    },
  }
}
