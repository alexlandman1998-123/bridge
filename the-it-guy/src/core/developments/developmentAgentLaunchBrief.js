import { buildCataloguePriceByUnitType } from './developmentProductCatalogueModel.js'

const text = (value) => String(value || '').trim()
const isAvailable = (unit = {}) => !/sold|reserved|hold|unreleased|not released/i.test(text(unit.status || unit.transactionStage))
const unitPrice = (unit, priceByType) => [unit.currentPrice, unit.current_price, unit.salesPrice, unit.listPrice, unit.list_price, unit.price].map(Number).find((value) => Number.isFinite(value) && value > 0) || Number(priceByType.get(unit.unitTypeId || unit.unit_type_id)?.listPrice || 0)

export function buildDevelopmentAgentLaunchBrief({ development = {}, units = [], productCatalogue = null, marketing = {}, readiness = {} } = {}) {
  const priceByType = buildCataloguePriceByUnitType(productCatalogue || {})
  const available = units.filter(isAvailable)
  const prices = available.map((unit) => unitPrice(unit, priceByType)).filter((price) => price > 0)
  const unitTypes = [...new Set(available.map((unit) => text(unit.unitType || unit.unit_type) || productCatalogue?.unitTypes?.find((item) => item.id === (unit.unitTypeId || unit.unit_type_id))?.name).filter(Boolean))]
  const noTransferDuty = (productCatalogue?.unitTypes || []).some((item) => item.noTransferDuty)
  return {
    developmentName: development.name || 'Development',
    location: development.location || development.city || '',
    availableCount: available.length,
    unitTypes,
    priceFrom: prices.length ? Math.min(...prices) : null,
    priceTo: prices.length ? Math.max(...prices) : null,
    noTransferDuty,
    heroReady: Boolean(marketing?.mediaLibrary?.heroImageUrl || marketing?.mediaLibrary?.sitePlanUrl || marketing?.mediaLibrary?.masterplanUrl),
    launchReady: Boolean(readiness.launchReady),
  }
}

export function formatDevelopmentAgentLaunchBrief(brief = {}) {
  const price = brief.priceFrom ? `From R${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(brief.priceFrom)}${brief.priceTo && brief.priceTo !== brief.priceFrom ? ` to R${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(brief.priceTo)}` : ''}` : 'Pricing on request'
  return [
    `${brief.developmentName}${brief.location ? ` · ${brief.location}` : ''}`,
    `${brief.availableCount} homes currently available${brief.unitTypes?.length ? ` · ${brief.unitTypes.join(', ')}` : ''}`,
    price,
    brief.noTransferDuty ? 'No transfer duty options available.' : '',
    'Ask me for the current availability map, floorplans and sales pack.',
  ].filter(Boolean).join('\n')
}
