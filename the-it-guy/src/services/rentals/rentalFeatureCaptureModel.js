import { normalizeListingFeatureKey, resolveListingFeature } from '../listings/listingFeatureCatalog.js'
import { RENTAL_PORTAL_FIELDS, captureRentalPortalFacts, rentalFieldApplies } from './rentalPortalFieldContract.js'

const basicFields = new Set(['bedrooms', 'bathrooms', 'garages', 'parkingBays', 'unitNumber', 'complexName'])
const homeCounters = new Set(['kitchens', 'studies', 'staffRooms', 'carports', 'enSuiteBathrooms', 'lounges', 'diningRooms'])
const homeCategories = new Set(['residential', 'agricultural'])
const groups = {
  'Rooms and facilities': 'Rooms & living',
  'Parking details': 'Parking & buildings',
  'Water and energy': 'Energy & water',
  'Connectivity and transport': 'Connectivity & utilities',
  'Property details': 'Property & title details', 'Title details': 'Property & title details', 'Farm details': 'Property & title details', 'Farm dwelling': 'Property & title details',
}
export function rentalFeatureGroup(field) {
  if (field.key === 'feature.pet_friendly') return 'Pet friendly'
  if (/propertyFeatures\.(garden|pool|outsideArea)/.test(field.key)) return 'Outdoor & leisure'
  if (field.key === 'propertyFeatures.isWheelchairAccessible') return 'Accessibility & views'
  if (/commercialInfo\.(height|truck|dock|roller|yard|warehouse|officeToWarehouse)/.test(field.key)) return 'Warehouse & loading'
  if (/commercialInfo\.power/.test(field.key)) return 'Energy & water'
  return groups[field.group] || field.group
}
export function rentalFeatureCaptureFields(form) {
  const answers = captureRentalPortalFacts(form)
  return RENTAL_PORTAL_FIELDS.filter((field) => {
    if (!rentalFieldApplies(field, form.propertyCategory, answers)) return false
    if (field.key === 'propertyInfo.propertyDescription.propertyDescriptionType' || basicFields.has(field.formKey)) return false
    if (homeCategories.has(form.propertyCategory) && homeCounters.has(field.formKey)) return false
    if (field.derivedFrom && field.key !== 'feature.pet_friendly' && (field.derivedFrom === 'availableFrom' || homeCategories.has(form.propertyCategory))) return false
    return true
  })
}
export function rentalFeatureAnswerLabels(form) {
  const answers = captureRentalPortalFacts(form)
  return [...new Set(RENTAL_PORTAL_FIELDS.filter((field) => field.type === 'boolean' && rentalFieldApplies(field, form.propertyCategory, answers) && answers[field.key] === true).map((field) => field.label))]
}

// Hydrate old marketing choices once, preserving explicit No and cleared answers.
export function restoreRentalFeatureSelections(form) {
  const next = { ...form, rentalPortalFacts: { ...form.rentalPortalFacts } }
  const selected = new Set((form.selectedFeatures || []).map((value) => resolveListingFeature(value)?.key || normalizeListingFeatureKey(value)))
  for (const field of RENTAL_PORTAL_FIELDS) {
    if (field.formKey && !form[field.formKey] && Object.hasOwn(next.rentalPortalFacts, field.key) && typeof next.rentalPortalFacts[field.key] === 'boolean') next[field.formKey] = next.rentalPortalFacts[field.key] ? 'yes' : 'no'
    if (field.type !== 'boolean' || !field.featureKey || field.derivedFrom || !selected.has(field.featureKey) || Object.hasOwn(next.rentalPortalFacts, field.key)) continue
    next.rentalPortalFacts[field.key] = field.formKey && form[field.formKey] ? form[field.formKey] === 'yes' : true
    if (field.formKey && !form[field.formKey]) next[field.formKey] = 'yes'
  }
  return next
}
