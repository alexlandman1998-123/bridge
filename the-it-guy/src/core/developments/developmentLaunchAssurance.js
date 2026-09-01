import { buildCataloguePriceByUnitType } from './developmentProductCatalogueModel.js'

const text = (value) => String(value || '').trim()
const isSellable = (unit = {}) => !/sold|unreleased|not released/i.test(text(unit.status || unit.transactionStage))
const hasDirectPrice = (unit = {}) => [unit.currentPrice, unit.current_price, unit.salesPrice, unit.listPrice, unit.list_price, unit.price].some((value) => Number(value) > 0)

export function buildDevelopmentLaunchAssurance({ units = [], structureNodes = [], productCatalogue = null, listings = [], publicVisibility = false, now = new Date() } = {}) {
  const priceByType = buildCataloguePriceByUnitType(productCatalogue || {})
  const hasCatalogue = Boolean(productCatalogue?.unitTypes?.length)
  const hasStructure = structureNodes.length > 0
  const sellable = units.filter(isSellable)
  const issues = []
  const unpriced = sellable.filter((unit) => !hasDirectPrice(unit) && Number(priceByType.get(unit.unitTypeId || unit.unit_type_id)?.listPrice || 0) <= 0)
  if (unpriced.length) issues.push({ id: 'unpriced', label: 'Available units without a price', detail: `${unpriced.length} sellable unit${unpriced.length === 1 ? '' : 's'} will show “price on request”.`, severity: 'warning', tab: 'units' })
  const uncatalogued = hasCatalogue ? sellable.filter((unit) => !unit.unitTypeId && !unit.unit_type_id) : []
  if (uncatalogued.length) issues.push({ id: 'uncatalogued', label: 'Units not linked to a product', detail: `${uncatalogued.length} sellable unit${uncatalogued.length === 1 ? '' : 's'} cannot inherit catalogue pricing or floorplans.`, severity: 'warning', tab: 'units' })
  const unstructured = hasStructure ? units.filter((unit) => !unit.structureNodeId && !unit.structure_node_id) : []
  if (unstructured.length) issues.push({ id: 'unstructured', label: 'Units outside the hierarchy', detail: `${unstructured.length} unit${unstructured.length === 1 ? '' : 's'} will not appear in a structure-specific availability view.`, severity: 'warning', tab: 'units' })
  const staleCutoff = new Date(now).getTime() - 14 * 24 * 60 * 60 * 1000
  const stale = sellable.filter((unit) => unit.lastUpdated && new Date(unit.lastUpdated).getTime() < staleCutoff)
  if (stale.length) issues.push({ id: 'stale-stock', label: 'Stock needs a freshness review', detail: `${stale.length} sellable unit${stale.length === 1 ? '' : 's'} have not changed in over 14 days.`, severity: 'info', tab: 'availability' })
  const publicListings = listings.filter((listing) => /live|published|active|public|visible/i.test(`${listing.status || ''} ${listing.visibility || ''}`))
  if (publicVisibility && !publicListings.length) issues.push({ id: 'distribution', label: 'Public visibility has no live listing', detail: 'The public development is enabled, but no linked listing is live or public.', severity: 'critical', tab: 'listings' })
  return { issues, healthy: issues.length === 0, criticalCount: issues.filter((issue) => issue.severity === 'critical').length, reviewedAt: new Date(now).toISOString() }
}
