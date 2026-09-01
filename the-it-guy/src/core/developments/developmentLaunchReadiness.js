import { buildCataloguePriceByUnitType } from './developmentProductCatalogueModel.js'

const text = (value) => String(value || '').trim()
const hasPrice = (unit = {}, priceByType = new Map()) => {
  const direct = [unit.currentPrice, unit.current_price, unit.salesPrice, unit.listPrice, unit.list_price, unit.price]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0)
  if (direct) return true
  return Number(priceByType.get(unit.unitTypeId || unit.unit_type_id)?.listPrice || 0) > 0
}

export function buildDevelopmentLaunchReadiness({
  units = [],
  structureNodes = [],
  productCatalogue = null,
  marketing = {},
  reservationDepositConfigured = true,
  linkedListings = [],
} = {}) {
  const priceByType = buildCataloguePriceByUnitType(productCatalogue || {})
  const availableUnits = units.filter((unit) => !/sold|unreleased|not released/i.test(text(unit.status || unit.transactionStage)))
  const pricedUnits = availableUnits.filter((unit) => hasPrice(unit, priceByType))
  const publicVisibility = Boolean(marketing?.listingConfiguration?.publicVisibility)
  const heroOrSitePlan = Boolean(marketing?.mediaLibrary?.heroImageUrl || marketing?.mediaLibrary?.sitePlanUrl || marketing?.mediaLibrary?.masterplanUrl)
  const catalogueReady = Boolean((productCatalogue?.unitTypes || []).length && (productCatalogue?.priceBooks || []).some((book) => book.isDefault))
  const linkedPublicListing = (linkedListings || []).some((listing) => /live|published|active/i.test(text(listing.status)) || /public|visible/i.test(text(listing.visibility)))
  const gates = [
    { id: 'stock', label: 'Sellable stock', ready: units.length > 0, detail: units.length ? `${units.length} units in the stock master.` : 'Add at least one unit before launch.', tab: 'units', required: true },
    { id: 'pricing', label: 'Pricing coverage', ready: availableUnits.length > 0 && pricedUnits.length === availableUnits.length, detail: availableUnits.length ? `${pricedUnits} of ${availableUnits.length} released units have a direct or catalogue price.` : 'Release stock and set pricing for launch.', tab: 'units', required: true },
    { id: 'reservation', label: 'Reservation policy', ready: reservationDepositConfigured, detail: reservationDepositConfigured ? 'Reservation defaults are configured.' : 'Complete reservation settings before accepting deposits.', tab: 'configuration', required: true },
    { id: 'media', label: 'Presentation asset', ready: heroOrSitePlan, detail: heroOrSitePlan ? 'Hero image or site plan is ready for presentation.' : 'Add a hero image or site plan for client presentation.', tab: 'marketing', required: true },
    { id: 'structure', label: 'Interactive structure', ready: structureNodes.length > 0 || units.length <= 1, detail: structureNodes.length ? `${structureNodes.length} hierarchy nodes power availability browsing.` : 'Optional for a single-unit development; add structure for multi-unit browsing.', tab: 'units', required: false },
    { id: 'catalogue', label: 'Product catalogue', ready: catalogueReady, detail: catalogueReady ? 'Canonical products and a current price book are active.' : 'Optional, but recommended for consistent type and price control.', tab: 'units', required: false },
    { id: 'listing', label: 'Distribution', ready: !publicVisibility || linkedPublicListing, detail: !publicVisibility ? 'Public visibility is not enabled.' : linkedPublicListing ? 'At least one linked listing is live or public.' : 'Create or link a public listing before publishing.', tab: 'listings', required: true },
  ]
  const required = gates.filter((gate) => gate.required)
  const readyRequired = required.filter((gate) => gate.ready).length
  return {
    gates,
    blockers: gates.filter((gate) => gate.required && !gate.ready),
    score: required.length ? Math.round((readyRequired / required.length) * 100) : 100,
    launchReady: required.every((gate) => gate.ready),
  }
}
