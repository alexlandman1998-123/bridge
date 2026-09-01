export function buildCataloguePriceByUnitType(catalogue = {}) {
  const defaultBookId = (catalogue.priceBooks || []).find((book) => book.isDefault)?.id
  const prices = (catalogue.prices || []).filter((price) => !defaultBookId || price.priceBookId === defaultBookId)
  return new Map(prices.filter((price) => price.unitTypeId).map((price) => [price.unitTypeId, price]))
}

export function validateDevelopmentProductCatalogue({ unitTypes = [], floorplans = [], prices = [] } = {}) {
  const errors = []
  const names = new Set()
  unitTypes.forEach((unitType, index) => {
    const name = String(unitType?.name || '').trim()
    if (!name) errors.push(`Unit type ${index + 1} needs a name.`)
    const key = name.toLowerCase()
    if (key && names.has(key)) errors.push(`Unit type ${name} is duplicated.`)
    names.add(key)
  })
  const typeIds = new Set(unitTypes.map((unitType) => unitType.id).filter(Boolean))
  floorplans.forEach((floorplan, index) => {
    if (!String(floorplan?.name || '').trim()) errors.push(`Floorplan ${index + 1} needs a name.`)
    if (floorplan?.unitTypeId && !typeIds.has(floorplan.unitTypeId)) errors.push(`Floorplan ${floorplan.name || index + 1} references an unknown unit type.`)
  })
  prices.forEach((price, index) => {
    const values = [price?.listPrice, price?.priceFrom, price?.priceTo].filter((value) => value !== '' && value !== null && value !== undefined)
    if (values.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) errors.push(`Price ${index + 1} must contain valid non-negative amounts.`)
    if (price?.priceFrom !== '' && price?.priceTo !== '' && Number(price.priceTo) < Number(price.priceFrom)) errors.push(`Price ${index + 1} has a maximum below its minimum.`)
  })
  return [...new Set(errors)]
}
