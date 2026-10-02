import { RENTAL_PORTAL_FIELDS } from './rentalPortalFieldCatalog.js'

export { RENTAL_PORTAL_FIELDS, RENTAL_PORTAL_FIELD_SOURCES } from './rentalPortalFieldCatalog.js'
const homes = ['Duplex', 'Apartment', 'House', 'Cluster', 'Simplex', 'Garden Cottage', 'Duet', 'Townhouse', 'Flat', 'Bachelor Apartment', 'Loft', 'Penthouse', 'Studio Apartment']
export const RENTAL_CATEGORY_TYPES = Object.freeze({
  residential: homes,
  commercial: ['Office', 'Commercial', 'Bed And Breakfast', 'Hotel'],
  industrial: ['Warehouse', 'Factory', 'Industrial'],
  retail: ['Retail', 'Shop', 'Showroom'],
  agricultural: ['Small Holding', 'Farm with house', 'Farm', 'Farm Land', 'Agricultural Holding', 'Commercial Farm', 'Game Farm'],
  vacant_land: ['Residential Land', 'Commercial Land'],
  mixed_use: ['Mixed-use', 'Commercial'],
})

export const RENTAL_PROPERTY_TYPE_MAPPING = Object.freeze(Object.entries(RENTAL_CATEGORY_TYPES).flatMap(([category, types]) => types.map((type) => ({
  category, type,
  property24TypeId: category === 'residential' ? ['Apartment', 'Flat', 'Bachelor Apartment', 'Loft', 'Penthouse', 'Studio Apartment'].includes(type) ? 5 : ['Townhouse', 'Duplex', 'Cluster', 'Simplex'].includes(type) ? 6 : 4 : ({ commercial: 11, retail: 11, mixed_use: 11, industrial: 12, agricultural: 10, vacant_land: 8 })[category],
  privatePropertyCategory: ({ residential: 'Residential', commercial: 'Commercial', retail: 'Commercial', mixed_use: 'Commercial', industrial: 'Commercial', agricultural: 'Farms', vacant_land: 'Land' })[category],
  privatePropertyTypeField: ({ residential: 'HomeType', commercial: 'BusinessType', retail: 'BusinessType', mixed_use: 'BusinessType', industrial: 'BusinessType', agricultural: 'FarmType', vacant_land: 'LandType' })[category],
  privatePropertyType: category === 'commercial' && type === 'Office' ? 'Offices' : category === 'industrial' ? 'Industrial' : category === 'retail' ? 'Retail' : category === 'mixed_use' ? 'Commercial' : type,
}))))
export function resolveRentalPortalType(category, type) {
  return RENTAL_PROPERTY_TYPE_MAPPING.find((mapping) => mapping.category === rentalCategory(category) && mapping.type === type)
}

export function rentalCategory(value = 'residential') {
  const key = String(value).toLowerCase().replace(/[ -]+/g, '_')
  return ({ land: 'vacant_land', farm: 'agricultural', smallholding: 'agricultural' })[key] || key
}
export function rentalFieldValue(field, value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  if (field.type === 'boolean') {
    if (value === true || value === 'yes') return true
    if (value === false || value === 'no') return false
    return null
  }
  if (field.type === 'number' || field.type === 'integer') {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 && (field.type !== 'integer' || Number.isInteger(number)) && (field.max === undefined || number <= field.max) ? number : null
  }
  const text = String(value).trim()
  if (field.format === 'date-time') {
    const date = new Date(text)
    return Number.isFinite(date.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(text) && date.toISOString().slice(0, 10) === text.slice(0, 10) ? date.toISOString() : null
  }
  return field.options && !field.options.includes(text) ? null : text || null
}
export function captureRentalPortalFacts(form = {}) {
  const captured = { ...form.rentalPortalFacts }
  for (const field of RENTAL_PORTAL_FIELDS) {
    let value = field.formKey ? form[field.formKey] : captured[field.key]
    if (field.derivedFrom === 'petsPolicy') value = form.petsPolicy === 'allowed' ? true : form.petsPolicy === 'not_allowed' ? false : null
    else if (field.derivedFrom && (field.derivedFrom === 'availableFrom' || ['residential', 'agricultural'].includes(form.propertyCategory)) && form[field.derivedFrom] !== undefined) value = form[field.derivedFrom] === '' ? null : field.type === 'boolean' ? Number(form[field.derivedFrom]) > 0 : form[field.derivedFrom]
    if (value !== undefined) captured[field.key] = rentalFieldValue(field, value)
  }
  return captured
}
export function rentalFieldApplies(field, category, answers = {}) {
  return field.categories.includes(rentalCategory(category)) && (!field.titleTypes || field.titleTypes.includes(answers['propertyInfo.propertyDescription.propertyDescriptionType']))
}
export function validateRentalPortalFacts(form = {}) {
  const answers = captureRentalPortalFacts(form)
  return RENTAL_PORTAL_FIELDS.filter((field) => rentalFieldApplies(field, form.propertyCategory, answers)).flatMap((field) => {
    const derived = field.derivedFrom && (field.derivedFrom === 'availableFrom' || ['residential', 'agricultural'].includes(form.propertyCategory))
    if (derived && form[field.derivedFrom] !== undefined) return []
    const raw = field.formKey ? form[field.formKey] : form.rentalPortalFacts?.[field.key]
    return raw !== null && raw !== undefined && raw !== '' && rentalFieldValue(field, raw) === null ? [`Enter a valid ${field.label.toLowerCase()}.`] : []
  })
}
export function rentalListingPortalFacts(listing = {}) {
  let facts = listing.seller_canonical_facts_json || listing.sellerCanonicalFacts || {}
  if (typeof facts === 'string') { try { facts = JSON.parse(facts) } catch { facts = {} } }
  return { facts, answers: facts.rentalPortalFacts || {}, category: rentalCategory(listing.propertyCategory || listing.property_category || facts.propertyProfile?.propertyCategory || 'residential') }
}
function putPath(object, path, value) {
  const keys = path.split('.')
  let current = object
  for (const key of keys.slice(0, -1)) current = current[key] ||= {}
  current[keys.at(-1)] = value
}
// Preserve public answers without inventing unsupported supplier attributes.
export function rentalPortalLeasePeriod(info = {}) {
  if (info.leasePeriodType === 'month_to_month') return 'Month to month'
  if (info.leasePeriodType === 'negotiable') return 'Negotiable'
  const months = Number(info.leasePeriodMonths)
  return Number.isFinite(months) && months > 0 ? `${months} month${months === 1 ? '' : 's'}` : ''
}

function rentalPublicDescriptionFacts(facts, category, listing) {
  const property = { ...listing, ...facts.propertyProfile }
  const info = { ...listing, ...facts.rentalInfo }
  const entries = []
  const text = (label, value) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') entries.push(`${label}: ${String(value).trim()}`)
  }
  const money = (label, value) => {
    if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) text(label, `R${Number(value)}`)
  }
  if (['residential', 'agricultural'].includes(category)) {
    for (const [key, label] of [['storerooms', 'Storerooms'], ['coveredParking', 'Covered parking'], ['openParking', 'Open parking']]) text(label, property[key])
    if (['yes', 'no'].includes(property.retirementAccommodation)) text('Retirement accommodation', property.retirementAccommodation === 'yes' ? 'Yes' : 'No')
  }
  text('Available from', info.availableFrom)
  text('Occupation date', info.occupationDate)
  text('Lease period', rentalPortalLeasePeriod(info))
  if (info.depositPolicy !== 'no_deposit') text('Deposit requirements', info.depositRequirement)
  text('Rental includes', info.rentalIncludes)
  text('Rental excludes', info.rentalExcludes)
  for (const [key, label] of [['applicationFee', 'Application fee'], ['leaseAdminFee', 'Lease admin fee'], ['creditCheckFee', 'Credit check fee'], ['keyDepositAmount', 'Key deposit'], ['utilityDepositAmount', 'Utility deposit']]) money(label, info[key])
  if (info.petsPolicy === 'subject_to_approval') text('Pets', 'Subject to approval')
  const utilities = { tenant_pays: 'Tenant pays utilities', included: 'Utilities included', water_included: 'Water included', prepaid_electricity: 'Prepaid electricity' }
  if (utilities[info.utilitiesPolicy]) text('Utilities', utilities[info.utilitiesPolicy])
  return entries
}

// Payload overlays contain only active, documented and valid answers. Unknown is
// omitted; confirmed false and zero are preserved. Hidden answers stay in storage.
export function buildRentalPortalMapping(listing = {}) {
  const { facts, answers, category } = rentalListingPortalFacts(listing)
  const property24 = {}
  const attributes = []
  const property24Description = []
  const privatePropertyDescription = []
  const fields = []
  const invalidFields = []
  const clearedFields = []
  const privatePropertyBlockers = []
  for (const field of RENTAL_PORTAL_FIELDS) {
    if (!rentalFieldApplies(field, category, answers)) continue
    const value = rentalFieldValue(field, answers[field.key])
    if (value === null) {
      if (answers[field.key] !== undefined && answers[field.key] !== null && answers[field.key] !== '') invalidFields.push(field.key)
      else if (Object.hasOwn(answers, field.key)) clearedFields.push(field)
      continue
    }
    const ppNative = field.pp && (!field.ppCategories || field.ppCategories.includes(category))
    const p24Native = field.p24 && (!field.p24TitleTypes || field.p24TitleTypes.includes(answers['propertyInfo.propertyDescription.propertyDescriptionType']))
    if (p24Native) putPath(property24, field.p24, value)
    if (ppNative && ['Rates', 'Levies'].includes(field.pp) && !Number.isInteger(value)) privatePropertyBlockers.push(`private_property_${field.pp.toLowerCase()}_must_be_whole_amount`)
    if (ppNative && ['Rates', 'Levies'].includes(field.pp) && answers[field.key.replace(/amount$/, 'unit')] && answers[field.key.replace(/amount$/, 'unit')] !== 'TotalPrice') privatePropertyBlockers.push(`private_property_${field.pp.toLowerCase()}_requires_total_price`)
    if (ppNative) attributes.push({ attributeType: field.pp, value: typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value) })
    const display = `${field.label}: ${typeof value === 'boolean' ? value ? 'Yes' : 'No' : value}`
    // Legal/address metadata must never be exposed in a portal description.
    const mayDescribe = !field.key.startsWith('propertyInfo.propertyDescription.') && field.key !== 'propertyInfo.standNumber' && field.key !== 'commercialInfo.buildingName'
    if (!p24Native && mayDescribe) property24Description.push(display)
    if (!ppNative && mayDescribe) privatePropertyDescription.push(display)
    const p24Indirect = field.p24Indirect || (category === 'residential' ? value === true ? field.p24PositiveTag : field.p24ChoiceTags?.[value] : '')
    fields.push({ key: field.key, property24: p24Native ? field.p24 : p24Indirect || (mayDescribe ? 'description' : 'unsupported'), privateProperty: ppNative ? `attributes.${field.pp}` : mayDescribe ? 'description' : 'unsupported' })
  }
  // Fee units alone are not a valid Fee. Provide its documented default when an
  // amount is confirmed and omit an orphan unit when the amount is unknown.
  for (const path of [['propertyInfo', 'municipalRatesAndTaxes'], ['propertyInfo', 'monthlyLevy'], ['commercialInfo', 'yardPrice'], ['commercialInfo', 'warehousePrice']]) {
    const parent = property24[path[0]]
    const fee = parent?.[path[1]]
    if (fee && fee.amount === undefined) delete parent[path[1]]
    else if (fee) fee.unit ||= 'TotalPrice'
  }
  const isRental = String(facts.listingType || listing.listingType || listing.listing_type || '').toLowerCase() === 'rental' || Object.keys(facts.rentalInfo || {}).length > 0
  const publicDetails = isRental ? rentalPublicDescriptionFacts(facts, category, listing) : []
  property24Description.push(...publicDetails)
  privatePropertyDescription.push(...publicDetails)
  return { property24, privateProperty: { attributes }, property24Description, privatePropertyDescription, fields, invalidFields, privatePropertyBlockers, clearedFields }
}
export function appendRentalPortalDescription(description, entries = []) {
  const missing = entries.filter((entry) => !String(description).includes(entry))
  return missing.length ? `${description || ''}${description ? '\n\n' : ''}${missing.join('. ')}.` : description
}
export function mergeRentalPortalPayload(base = {}, overlay = {}) {
  const result = { ...base }
  for (const [key, value] of Object.entries(overlay)) result[key] = value && typeof value === 'object' && !Array.isArray(value) ? mergeRentalPortalPayload(base[key], value) : value
  return result
}

export function applyRentalProperty24Answers(base, mapping, root) {
  const payload = mergeRentalPortalPayload(base, mapping.property24[root])
  // Required P24 booleans/garage count retain the existing documented defaults.
  const required = new Set(['propertyFeatures.garages', 'propertyFeatures.garden', 'propertyFeatures.pool', 'propertyFeatures.flatlet'])
  for (const field of mapping.clearedFields) {
    if (!field.p24?.startsWith(`${root}.`) || required.has(field.p24)) continue
    const keys = field.p24.split('.').slice(1)
    let object = payload
    for (const key of keys.slice(0, -1)) object = object?.[key]
    if (object) delete object[keys.at(-1)]
  }
  const prune = (object) => {
    for (const [key, value] of Object.entries(object)) if (value && typeof value === 'object') {
      prune(value)
      if (!Object.keys(value).length) delete object[key]
    }
  }
  prune(payload)
  return payload
}
