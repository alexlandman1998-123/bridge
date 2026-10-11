import { getPropertyTypeOptionsByCategory, getPropertyCategoryLabel } from '../../lib/propertyTaxonomy.js'

const key = value => String(value ?? '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
const aliases = { flat: 'apartment', sectional_title: 'apartment', freehold: 'house', office: 'office_building', shop: 'retail_store', small_holding: 'smallholding', land: 'vacant_land' }

export function salesPropertyTypeOptions(category, current = '') {
  const options = getPropertyTypeOptionsByCategory(category).filter(option => category !== 'residential' || option.value !== 'vacant_stand')
  const currentKey = aliases[key(current)] || key(current)
  return options.map(option => option.value === currentKey ? { ...option, value: current } : option)
}

export function salesPropertyTypeMatches(category, value) {
  return Boolean(value) && salesPropertyTypeOptions(category, value).some(option => option.value === value)
}

export function salesCategoryChange(form, category) {
  return { ...form, propertyCategory: category, propertyType: salesPropertyTypeMatches(category, form.propertyType) ? form.propertyType : salesPropertyTypeOptions(category)[0]?.value || '' }
}

export function salesPropertyTypeIssue(form) {
  if (!form.propertyCategory || !form.propertyType || salesPropertyTypeMatches(form.propertyCategory, form.propertyType)) return null
  return { field: 'propertyType', step: 'property', channels: [], message: `Choose a property type for ${getPropertyCategoryLabel(form.propertyCategory).toLowerCase()}.` }
}

export const LISTING_CAPTURE_FIELD_LABELS = {
  listingPrice: 'price', monthlyRent: 'rent', propertyAddress: 'property address', propertyType: 'property type',
  listingTitle: 'listing title', title: 'listing title', listingDescription: 'description', description: 'description',
  listingImages: 'photos', galleryImages: 'photos', streetNumber: 'street number', streetName: 'street name',
  suburb: 'suburb', city: 'city', province: 'province', bedrooms: 'bedrooms', bathrooms: 'bathrooms',
  erfSize: 'land size', floorSize: 'floor size', complexName: 'complex name', unitNumber: 'unit number',
  propertyStructureType: 'ownership type', landlordEmail: 'landlord email', landlordType: 'landlord type',
  mandateStatus: 'rental mandate', marketingApprovalStatus: 'marketing approval', mandateStartDate: 'mandate start date', mandateEndDate: 'mandate end date',
  videoLink: 'video link', virtualTourLink: 'virtual tour link', rentalPriceFrequency: 'how rent is charged', rentalMandateType: 'rental type', depositAmount: 'deposit',
}

export const RENTAL_SAVED_NOT_SENT_MESSAGE = 'Changes saved. This save did not update your public adverts. Use the advertising controls below to send updates when you are ready.'
