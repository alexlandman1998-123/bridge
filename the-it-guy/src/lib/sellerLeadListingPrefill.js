import { buildDirectListingIntakePayload } from './directListingIntakeModel.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => compactObject(item))
      .filter((item) => item !== undefined && item !== '')
  }
  if (!isPlainObject(value)) return value

  return Object.entries(value).reduce((acc, [key, item]) => {
    const next = compactObject(item)
    if (next === undefined || next === '') return acc
    if (Array.isArray(next) && !next.length) return acc
    if (isPlainObject(next) && !Object.keys(next).length) return acc
    acc[key] = next
    return acc
  }, {})
}

function firstValue(...values) {
  for (const value of values) {
    if (value === 0 || value === false || value === true) return value
    if (Array.isArray(value) && value.length) return value
    if (isPlainObject(value) && Object.keys(value).length) return value
    const text = normalizeText(value)
    if (text) return value
  }
  return ''
}

function firstText(...values) {
  return normalizeText(firstValue(...values))
}

function parseMaybeJson(value) {
  if (isPlainObject(value)) return value
  if (!normalizeText(value)) return {}
  try {
    const parsed = JSON.parse(value)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function numberValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const parsed = Number(String(value).replace(/[^0-9.,-]/g, '').replace(/,/g, ''))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (normalizeText(value)) {
    return normalizeText(value)
      .split(/\r?\n|,/)
      .map((item) => normalizeText(item))
      .filter(Boolean)
  }
  return []
}

function booleanValue(...values) {
  for (const value of values) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const key = normalizeKey(value)
    if (!key) continue
    if (['yes', 'y', 'true', '1', 'on', 'enabled', 'signed', 'held', 'available'].includes(key)) return true
    if (['no', 'n', 'false', '0', 'off', 'disabled', 'not_held', 'not_available', 'missing'].includes(key)) return false
  }
  return null
}

function getSellerOnboardingFormData(source = {}) {
  if (!isPlainObject(source)) return {}
  const onboarding = isPlainObject(source.sellerOnboarding)
    ? source.sellerOnboarding
    : isPlainObject(source.seller_onboarding)
      ? source.seller_onboarding
      : {}
  const candidates = [
    source.sellerOnboardingFormData,
    source.seller_onboarding_form_data,
    source.onboardingFormData?.formData,
    source.onboardingFormData?.form_data,
    source.onboardingFormData,
    onboarding.formData,
    onboarding.form_data,
  ]
  return candidates.find(isPlainObject) || {}
}

function getNestedObject(...values) {
  return values.find(isPlainObject) || {}
}

function mergeRelevantOnboardingFormData({ lead = {}, listing = {} } = {}) {
  const rawPayload = parseMaybeJson(lead.rawEnquiryPayload || lead.raw_enquiry_payload)
  const rawOnboarding = getNestedObject(
    rawPayload.sellerOnboarding?.formData,
    rawPayload.sellerOnboarding?.form_data,
    rawPayload.sellerOnboarding,
    rawPayload.seller_onboarding?.formData,
    rawPayload.seller_onboarding?.form_data,
    rawPayload.seller_onboarding,
  )

  return compactObject({
    ...getSellerOnboardingFormData(listing),
    ...rawOnboarding,
    ...getSellerOnboardingFormData(lead),
  })
}

function addressFromParts(line1 = '', suburb = '', city = '', province = '', postalCode = '') {
  const parts = [line1, suburb, city, province, postalCode].map(normalizeText).filter(Boolean)
  return Array.from(new Set(parts)).join(', ')
}

function buildSellerNameParts(contact = {}, lead = {}, formData = {}) {
  const fullName = firstText(
    formData.sellerDisplayName,
    formData.fullName,
    formData.full_name,
    lead.sellerDisplayName,
    lead.sellerName && lead.sellerSurname ? `${lead.sellerName} ${lead.sellerSurname}` : '',
    contact.fullName,
    contact.displayName,
    contact.firstName && contact.lastName ? `${contact.firstName} ${contact.lastName}` : '',
  )
  const parts = fullName.split(/\s+/).filter(Boolean)
  const sellerName = firstText(formData.sellerName, formData.firstName, formData.first_name, lead.sellerName, contact.firstName, parts.slice(0, -1).join(' '), parts[0])
  const sellerSurname = firstText(formData.sellerSurname, formData.surname, formData.lastName, formData.last_name, lead.sellerSurname, contact.lastName, parts.at(-1))
  return { fullName, sellerName, sellerSurname }
}

function addFeature(features, key, enabled) {
  if (enabled === true) features.add(key)
}

function buildPublicationFeatures(form = {}) {
  const features = new Set(asArray(firstValue(form.features, form.propertyFeatures, form.property_features)))
  addFeature(features, 'estate_or_hoa', booleanValue(form.estateOrHoa, form.estate_or_hoa) === true)
  addFeature(features, 'sectional_title', normalizeKey(form.propertyStructureType) === 'sectional_title')
  addFeature(features, 'on_auction', booleanValue(form.onAuction, form.on_auction) === true)
  addFeature(features, 'price_on_application', booleanValue(form.priceOnApplication, form.price_on_application, form.isPOA, form.is_poa) === true)
  addFeature(features, 'reduced_banner', booleanValue(form.showReducedBanner, form.show_reduced_banner) === true)
  addFeature(features, 'no_transfer_duty', booleanValue(form.noTransferDuty, form.no_transfer_duty) === true)
  return Array.from(features).map(normalizeKey).filter(Boolean)
}

function normalizeMediaItems(...values) {
  return values.flatMap(asArray).map((item, index) => {
    if (isPlainObject(item)) {
      return compactObject({
        id: normalizeText(item.id || item.path || item.url || `seller-lead-image-${index + 1}`),
        name: normalizeText(item.name || item.fileName || item.caption || `Image ${index + 1}`),
        url: normalizeText(item.url || item.signedUrl || item.publicUrl || item.file_url),
        signedUrl: normalizeText(item.signedUrl),
        publicUrl: normalizeText(item.publicUrl),
        path: normalizeText(item.path),
        contentType: normalizeText(item.contentType || item.content_type),
      })
    }
    return {
      id: `seller-lead-image-${index + 1}`,
      name: `Image ${index + 1}`,
      url: normalizeText(item),
    }
  }).filter((item) => item.url)
}

export function buildSellerLeadListingPrefill({
  lead = {},
  contact = {},
  listing = {},
  currentAgent = {},
  propertyArea = '',
  propertyType = '',
  valuationAddress = '',
  capturedAt = '',
} = {}) {
  const formData = mergeRelevantOnboardingFormData({ lead, listing })
  const property = getNestedObject(formData.property, formData.propertyFacts, formData.property_facts)
  const addressDetails = getNestedObject(
    formData.propertyAddressDetails,
    formData.property_address_details,
    formData.addressDetails,
    formData.address_details,
    property.addressDetails,
    property.address_details,
  )
  const { fullName, sellerName, sellerSurname } = buildSellerNameParts(contact, lead, formData)
  const streetAddress = firstText(
    formData.streetAddress,
    formData.street_address,
    formData.addressLine1,
    formData.address_line_1,
    formData.propertyAddressLine1,
    formData.property_address_line_1,
    addressDetails.line1,
    addressDetails.streetAddress,
    lead.streetAddress,
    lead.street_address,
    lead.sellerPropertyAddress,
    lead.seller_property_address,
    listing.streetAddress,
    listing.street_address,
    listing.addressLine1,
    listing.address_line_1,
  )
  const suburb = firstText(formData.suburb, formData.property_suburb, property.suburb, addressDetails.suburb, lead.suburb, lead.areaInterest, listing.suburb)
  const city = firstText(formData.city, formData.property_city, property.city, addressDetails.city, lead.city, listing.city)
  const province = firstText(formData.province, formData.property_province, property.province, addressDetails.province, lead.province, listing.province)
  const postalCode = firstText(formData.postalCode, formData.postal_code, property.postalCode, property.postal_code, addressDetails.postalCode, addressDetails.postal_code, lead.postalCode, lead.postal_code, listing.postalCode, listing.postal_code)
  const formattedAddress = firstText(
    formData.formattedAddress,
    formData.formatted_address,
    formData.propertyAddress,
    formData.property_address,
    property.formattedAddress,
    property.formatted_address,
    property.address,
    lead.formattedAddress,
    lead.formatted_address,
    lead.sellerPropertyAddress,
    lead.seller_property_address,
    valuationAddress,
    propertyArea,
    listing.formattedAddress,
    listing.formatted_address,
    addressFromParts(streetAddress, suburb, city, province, postalCode),
  )
  const askingPrice = numberValue(
    formData.askingPrice,
    formData.asking_price,
    formData.listingPrice,
    formData.listing_price,
    formData.estimatedAskingPrice,
    formData.estimated_asking_price,
    lead.estimatedValue,
    lead.estimated_value,
    lead.budget,
    listing.askingPrice,
    listing.asking_price,
    listing.estimatedValue,
    listing.estimated_value,
  )
  const selectedPropertyType = firstText(formData.propertyType, formData.property_type, property.propertyType, property.property_type, propertyType, lead.propertyType, lead.propertyInterest, listing.propertyType, 'House')
  const propertyStructureType = firstText(
    formData.propertyStructureType,
    formData.property_structure_type,
    formData.propertyTitleType,
    formData.property_title_type,
    formData.titleType,
    formData.title_type,
    formData.ownershipScheme,
    formData.ownership_scheme,
    property.propertyStructureType,
    property.property_structure_type,
    listing.propertyStructureType,
    listing.property_structure_type,
  ) || 'full_title'
  const description = firstText(
    formData.propertyDescription,
    formData.property_description,
    formData.listingDescription,
    formData.listing_description,
    formData.description,
    formData.propertyNotes,
    formData.property_notes,
    listing.description,
    lead.description,
    lead.notes,
  )

  const form = compactObject({
    ...formData,
    sellerType: firstText(formData.sellerType, formData.sellerLegalType, formData.ownershipType, lead.sellerType, listing.sellerType, 'individual'),
    sellerLegalType: firstText(formData.sellerLegalType, formData.seller_type, formData.ownershipType, formData.ownerStructureType, lead.sellerType, listing.sellerType, 'individual'),
    sellerName,
    sellerSurname,
    sellerDisplayName: fullName,
    fullName,
    sellerEmail: firstText(formData.sellerEmail, formData.email, lead.sellerEmail, contact.email),
    sellerPhone: firstText(formData.sellerPhone, formData.phone, formData.mobile, lead.sellerPhone, contact.phone, contact.mobile),
    idNumber: firstText(formData.idNumber, formData.id_number, lead.idNumber, lead.id_number, contact.idNumber, contact.id_number),
    propertyAddress: formattedAddress,
    formattedAddress,
    streetAddress,
    addressLine1: streetAddress,
    addressLine2: firstText(formData.addressLine2, formData.address_line_2, formData.propertyAddressLine2, addressDetails.line2, listing.addressLine2, listing.address_line_2),
    streetNumber: firstText(formData.streetNumber, formData.street_number, addressDetails.streetNumber, addressDetails.street_number, lead.streetNumber, lead.street_number),
    streetName: firstText(formData.streetName, formData.street_name, formData.route, addressDetails.streetName, addressDetails.street_name, lead.streetName, lead.street_name),
    suburb,
    city,
    province,
    country: firstText(formData.country, formData.property_country, property.country, addressDetails.country, lead.country, listing.country, 'South Africa'),
    postalCode,
    latitude: firstValue(formData.latitude, property.latitude, addressDetails.latitude, lead.latitude, listing.latitude),
    longitude: firstValue(formData.longitude, property.longitude, addressDetails.longitude, lead.longitude, listing.longitude),
    googlePlaceId: firstText(formData.googlePlaceId, formData.google_place_id, addressDetails.googlePlaceId, addressDetails.google_place_id, lead.googlePlaceId, lead.google_place_id, listing.googlePlaceId, listing.google_place_id),
    propertyType: selectedPropertyType,
    descriptivePropertyType: firstText(formData.descriptivePropertyType, formData.descriptive_property_type, formData.propertySubtype, formData.property_subtype),
    propertyCategory: firstText(formData.propertyCategory, formData.property_category, property.propertyCategory, property.property_category, listing.propertyCategory, 'residential'),
    propertyStructureType,
    propertyTitleType: propertyStructureType,
    estateOrHoa: booleanValue(formData.estateOrHoa, formData.estate_or_hoa, formData.inEstate, formData.in_estate, property.estateOrHoa, property.estate_or_hoa),
    estateName: firstText(formData.estateName, formData.estate_name, formData.estateComplexName, formData.estate_complex_name, property.estateName, property.estate_name),
    unitNumber: firstText(formData.unitNumber, formData.unit_number, property.unitNumber, property.unit_number),
    sectionNumber: firstText(formData.sectionNumber, formData.section_number, property.sectionNumber, property.section_number),
    complexName: firstText(formData.complexName, formData.complex_name, property.complexName, property.complex_name),
    sectionalTitleNumber: firstText(formData.sectionalTitleNumber, formData.sectional_title_number, property.sectionalTitleNumber, property.sectional_title_number),
    onAuction: booleanValue(formData.onAuction, formData.on_auction, property.onAuction, property.on_auction),
    priceOnApplication: booleanValue(formData.priceOnApplication, formData.price_on_application, formData.isPOA, formData.is_poa, property.priceOnApplication, property.price_on_application),
    showReducedBanner: booleanValue(formData.showReducedBanner, formData.show_reduced_banner, property.showReducedBanner, property.show_reduced_banner),
    noTransferDuty: booleanValue(formData.noTransferDuty, formData.no_transfer_duty, property.noTransferDuty, property.no_transfer_duty),
    bedrooms: numberValue(formData.bedrooms, property.bedrooms, lead.bedrooms, listing.bedrooms),
    bathrooms: numberValue(formData.bathrooms, property.bathrooms, lead.bathrooms, listing.bathrooms),
    garages: numberValue(formData.garages, property.garages, lead.garages, listing.garages),
    parkingCount: numberValue(formData.parkingCount, formData.parking_count, formData.parkingBays, formData.parking_bays, property.parkingCount, property.parking_count, lead.parkingCount, listing.parkingBays),
    floorSize: numberValue(formData.floorSize, formData.floor_size, property.floorSize, property.floor_size, lead.floorSize, listing.floorSize),
    erfSize: numberValue(formData.erfSize, formData.erf_size, property.erfSize, property.erf_size, lead.erfSize, listing.erfSize),
    ratesTaxes: numberValue(formData.ratesTaxes, formData.rates_taxes, property.ratesTaxes, property.rates_taxes),
    levies: numberValue(formData.levies, property.levies),
    askingPrice,
    listingPrice: askingPrice,
    estimatedAskingPrice: askingPrice,
    listingTitle: firstText(formData.listingTitle, formData.listing_title, lead.propertyInterest, listing.title, selectedPropertyType && suburb ? `${selectedPropertyType} in ${suburb}` : formattedAddress),
    listingDescription: description,
    description,
    propertyDescription: description,
    features: asArray(firstValue(formData.features, formData.propertyFeatures, formData.property_features, property.features)),
    amenities: asArray(firstValue(formData.amenities, formData.propertyAmenities, formData.property_amenities, property.amenities)),
    listingImages: normalizeMediaItems(formData.listingImages, formData.imageGallery, formData.galleryImages, formData.images, listing.marketing?.imageGallery),
    hasSignedMandate: booleanValue(formData.hasSignedMandate, formData.signedMandate, formData.mandateSigned, lead.mandateStatus),
    hasSignedPropertyConditionDisclosure: booleanValue(formData.hasSignedPropertyConditionDisclosure, formData.propertyConditionDisclosureSigned, formData.disclosureSigned),
    hasSignedFicaForm: booleanValue(formData.hasSignedFicaForm, formData.ficaFormSigned, formData.ficaSigned),
    sellerPortalInviteRequested: booleanValue(formData.sellerPortalInviteRequested, formData.seller_portal_invite_requested, lead.sellerPortalInviteRequested),
  })

  const directListingIntake = buildDirectListingIntakePayload(form, {
    capturedBy: firstText(currentAgent.id, currentAgent.email),
    capturedAt: capturedAt || new Date().toISOString(),
  })
  const sellerOnboardingFormData = compactObject({
    ...formData,
    ...directListingIntake.sellerOnboardingFormData,
    sellerLeadListingPrefill: {
      source: 'seller_lead_listing_prefill',
      leadId: firstText(lead.leadId, lead.id),
      listingId: firstText(listing.id),
      capturedAt: capturedAt || new Date().toISOString(),
      sellerOnboardingFieldCount: Object.keys(formData).length,
    },
  })
  const features = buildPublicationFeatures(form)
  const publicationData = compactObject({
    title: form.listingTitle || form.formattedAddress || 'Listing draft',
    address: form.formattedAddress || form.propertyAddress,
    suburb: form.suburb,
    province: form.province,
    propertyType: form.propertyType,
    listingType: 'Sale',
    askingPrice,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    garages: form.garages,
    parkingBays: form.parkingCount,
    floorSize: form.floorSize,
    erfSize: form.erfSize,
    ratesTaxes: form.ratesTaxes,
    levies: form.levies,
    description,
    features,
    amenities: form.amenities,
    status: 'Draft',
  })
  const listingPayload = compactObject({
    listingVisibility: 'internal',
    listingSource: 'private_listing',
    listingCategory: 'private_sale',
    title: publicationData.title,
    description,
    listingPreviewDescription: description,
    internalListingNotes: firstText(formData.internalNotes, formData.internal_notes, lead.notes),
    propertyCategory: form.propertyCategory,
    propertyStructureType: form.propertyStructureType,
    propertyType: form.propertyType,
    askingPrice,
    estimatedValue: askingPrice,
    addressLine1: form.addressLine1 || form.streetAddress,
    addressLine2: form.addressLine2,
    formattedAddress: form.formattedAddress,
    streetAddress: form.streetAddress || form.addressLine1,
    suburb: form.suburb,
    city: form.city,
    province: form.province,
    country: form.country || 'South Africa',
    postalCode: form.postalCode,
    latitude: form.latitude,
    longitude: form.longitude,
    googlePlaceId: form.googlePlaceId,
    sellerType: directListingIntake.seller?.sellerLegalType || form.sellerLegalType,
    property24Status: 'not_published',
    privatePropertyStatus: 'not_published',
    bridgeListingStatus: 'not_published',
    sellerCanonicalFacts: directListingIntake.sellerCanonicalFacts,
    sellerCanonicalFactReadiness: {
      source: 'seller_lead_listing_prefill',
      generatedAt: capturedAt || new Date().toISOString(),
      factsVersion: directListingIntake.sellerCanonicalFacts?.version,
      readyForDraftListing: true,
    },
    sellerCanonicalFactsUpdatedAt: capturedAt || new Date().toISOString(),
  })

  return {
    form,
    directListingIntake,
    sellerOnboardingFormData,
    publicationData,
    media: {
      galleryImages: form.listingImages,
      coverImageId: firstText(form.coverImageId, form.listingImages?.[0]?.id),
    },
    listingPayload,
  }
}

export default buildSellerLeadListingPrefill
