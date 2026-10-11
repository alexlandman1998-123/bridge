import { getPropertyCategoryLabel, getPropertyTypeLabel } from '../../lib/propertyTaxonomy.js'

const text = value => String(value ?? '').trim()
const present = value => value !== '' && value !== null && value !== undefined
export const RENT_PREVIEW_UNITS = Object.freeze({ monthly: 'per month', weekly: 'per week', daily: 'per day', annual: 'per year', per_square_metre: 'per m²' })
export const listingTitleExample = category => ({ residential: 'e.g. Bright home near schools', commercial: 'e.g. Offices with secure parking', industrial: 'e.g. Warehouse with truck access', retail: 'e.g. Shop on a busy main road', agricultural: 'e.g. Farm with reliable water supply', mixed_use: 'e.g. Combined home and business space', vacant_land: 'e.g. Stand with development potential' })[category] || 'Add a short property headline'
export const plainPropertyFieldLabel = field => ({ grossLettableArea: 'Rentable floor area', farmSize: 'Farm size', listingTerms: 'Sale or lease terms' })[field.key] || field.label

function money(value, missing) {
  return present(value) && Number.isFinite(Number(value)) && Number(value) >= 0
    ? `R ${Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}` : missing
}

// Show only the permitted public location. A free-typed search address is not a
// safe fallback when the agent has chosen to hide the street or unit number.
function publicLocation(form) {
  const area = [form.suburb, form.city].map(text).filter(Boolean)
  const visibility = form.exactAddressVisibility
  if (['show_exact_address', 'show_exact', 'show_full_address'].includes(visibility)) {
    return text(form.propertyAddress) || [form.streetNumber, form.streetName, ...area].map(text).filter(Boolean).join(', ') || 'Add an address'
  }
  if (visibility === 'complex_only') return [form.complexName, ...area].map(text).filter(Boolean).join(', ') || 'Add a complex or area'
  if (visibility === 'hide_street_number') return [form.streetName, ...area].map(text).filter(Boolean).join(', ') || 'Add a suburb or city'
  return area.join(', ') || 'Add a suburb or city'
}

export function buildListingAdvertPreview(form = {}, rental = false) {
  const category = form.propertyCategory || 'residential'
  const land = ['land', 'vacant_land'].includes(category)
  const home = ['residential', 'mixed_use', 'agricultural'].includes(category)
  const images = (rental ? form.galleryImages ?? form.listingImages : form.listingImages) || []
  const cover = images.find(image => image.id === form.coverImageId) || images[0]
  const type = text(form.propertyType) ? getPropertyTypeLabel(form.propertyType) : 'Property'
  const title = text(rental ? form.title ?? form.listingTitle : form.listingTitle) || `${type} ${rental ? 'to rent' : 'for sale'}`
  const amount = money(rental ? form.monthlyRent ?? form.listingPrice : form.listingPrice ?? form.estimatedAskingPrice, rental ? 'Add the rent' : 'Add the price')
  // Older rentals edited through the general listing form use the sale-shaped
  // field names and an explicitly monthly rent control.
  const frequency = form.rentalPriceFrequency ?? (form.listingType === 'rental' ? 'monthly' : '')
  const price = !rental && form.priceOnApplication ? 'Price on application' : rental && RENT_PREVIEW_UNITS[frequency] && amount !== 'Add the rent' ? `${amount} ${RENT_PREVIEW_UNITS[frequency]}` : amount
  const facts = []
  const add = (label, value, unit = '') => { if (present(value)) facts.push({ label, value: `${value}${unit ? ` ${unit}` : ''}` }) }
  if (home && !land) { add('Bedrooms', form.bedrooms); add('Bathrooms', form.bathrooms) }
  if (!land) add('Floor size', form.floorSize, 'm²')
  add('Land size', form.erfSize, 'm²')
  if (category === 'agricultural') add('Farm size', form.farmSize, 'hectares')
  if (['commercial', 'retail', 'mixed_use'].includes(category)) add('Rentable floor area', rental ? form.rentalPortalFacts?.['commercialInfo.grossLettableAreaSqm'] : form.grossLettableArea, 'm²')
  if (category === 'industrial') { add('Warehouse / factory area', rental ? form.rentalPortalFacts?.['commercialInfo.warehouseSpaceSqm'] : form.warehouseOrFactoryArea, 'm²'); add('Yard size', rental ? form.rentalPortalFacts?.['commercialInfo.yardSpaceSqm'] : form.yardSize, 'm²') }
  return {
    title, price, location: publicLocation(form), type, category: getPropertyCategoryLabel(category), facts,
    description: text(rental ? form.description ?? form.listingDescription : form.listingDescription),
    coverUrl: text(cover?.url || cover?.signedUrl || cover?.publicUrl), photoCount: images.length,
    deposit: rental ? form.depositPolicy === 'no_deposit' ? 'No deposit' : money(form.depositAmount, 'Deposit not added') : '',
    availableFrom: rental ? text(form.availableFrom) : '',
  }
}
