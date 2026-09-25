function normalizeText(value) {
  return String(value ?? '').trim()
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null
}

function canonicalProperty(listing = {}) {
  const facts = listing?.sellerCanonicalFacts && typeof listing.sellerCanonicalFacts === 'object'
    ? listing.sellerCanonicalFacts
    : listing?.seller_canonical_facts && typeof listing.seller_canonical_facts === 'object'
      ? listing.seller_canonical_facts
      : {}
  return facts.property && typeof facts.property === 'object' ? facts.property : {}
}

function textCheck(field, label, expected, actual) {
  const normalizedExpected = normalizeText(expected)
  if (!normalizedExpected) return null
  const normalizedActual = normalizeText(actual)
  return normalizedActual.toLowerCase() === normalizedExpected.toLowerCase()
    ? null
    : { field, label, expected: normalizedExpected, actual: normalizedActual }
}

function numberCheck(field, label, expected, actual) {
  if (normalizeText(expected) === '') return null
  const expectedNumber = Number(expected)
  const actualNumber = Number(actual)
  if (Number.isFinite(expectedNumber) && Number.isFinite(actualNumber) && Math.abs(expectedNumber - actualNumber) < 0.001) return null
  return { field, label, expected: expectedNumber, actual: Number.isFinite(actualNumber) ? actualNumber : null }
}

export function verifyListingPropertySave(form = {}, listing = {}) {
  const details = listing?.propertyDetails && typeof listing.propertyDetails === 'object' ? listing.propertyDetails : {}
  const canonical = canonicalProperty(listing)
  const checks = [
    textCheck('propertyAddress', 'property address', form.propertyAddress, firstDefined(listing.addressLine1, details.addressLine1)),
    textCheck('streetNumber', 'street number', form.streetNumber, firstDefined(listing.streetNumber, details.streetNumber)),
    textCheck('streetName', 'street name', form.streetName || form.route, firstDefined(listing.streetName, details.streetName)),
    textCheck('suburb', 'suburb', form.suburb, firstDefined(listing.suburb, details.suburb)),
    textCheck('city', 'city / town', form.city, firstDefined(listing.city, details.city)),
    textCheck('province', 'province', form.province, firstDefined(listing.province, details.province)),
    textCheck('postalCode', 'postal code', form.postalCode, firstDefined(listing.postalCode, details.postalCode)),
    textCheck('propertyType', 'property type', form.propertyType, firstDefined(listing.propertyType, details.propertyType)),
    textCheck('propertyStructureType', 'ownership scheme', form.propertyStructureType, listing.propertyStructureType),
    textCheck('estateName', 'estate / HOA name', form.estateName, firstDefined(listing.estateName, canonical.estateName, canonical.estate_name)),
    textCheck('unitNumber', 'unit number', form.unitNumber, firstDefined(listing.unitNumber, canonical.unitNumber, canonical.unit_number)),
    textCheck('complexName', 'complex / scheme', form.complexName, firstDefined(listing.complexName, canonical.complexName, canonical.complex_name, canonical.schemeName, canonical.scheme_name)),
    textCheck('sectionNumber', 'unit / section number', form.sectionNumber, firstDefined(listing.sectionNumber, canonical.sectionNumber, canonical.section_number, canonical.unitNumber, canonical.unit_number)),
    textCheck('sectionalTitleNumber', 'sectional title number', form.sectionalTitleNumber, firstDefined(listing.sectionalTitleNumber, canonical.sectionalTitleNumber, canonical.sectional_title_number)),
    numberCheck('listingPrice', 'listing price', form.listingPrice, firstDefined(listing.askingPrice, details.price)),
    numberCheck('bedrooms', 'bedrooms', form.bedrooms, firstDefined(listing.bedrooms, details.bedrooms)),
    numberCheck('bathrooms', 'bathrooms', form.bathrooms, firstDefined(listing.bathrooms, details.bathrooms)),
    numberCheck('garages', 'garages', form.garages, firstDefined(listing.garages, details.garages)),
    numberCheck('parkingCount', 'parking', form.parkingCount, firstDefined(listing.parkingBays, details.parkingBays, listing.coveredParking)),
    numberCheck('floorSize', 'floor size', form.floorSize, firstDefined(listing.floorSize, details.floorSize)),
    numberCheck('erfSize', 'erf size', form.erfSize, firstDefined(listing.erfSize, details.erfSize)),
  ]
  const mismatches = checks.filter(Boolean)
  return { ready: mismatches.length === 0, mismatches }
}

export function verifyListingPropertyPersistenceCopies({ form = {}, listing = {}, onboarding = {}, publication = {} } = {}) {
  const onboardingForm = onboarding?.form_data && typeof onboarding.form_data === 'object'
    ? onboarding.form_data
    : onboarding?.formData && typeof onboarding.formData === 'object'
      ? onboarding.formData
      : {}
  // private_listings stores the street-level address and has no parking
  // column in every deployed schema. The full address and parking authority
  // live in onboarding/publication, while ownership is authoritative in
  // onboarding. Verify each value against the record that can actually own it.
  const listingVerificationForm = {
    ...form,
    propertyAddress: firstDefined(form.streetAddress, form.propertyAddress),
    propertyStructureType: '',
    parkingCount: '',
  }
  const checks = [
    ...verifyListingPropertySave(listingVerificationForm, listing).mismatches,
    textCheck('propertyAddress', 'property address (onboarding)', form.propertyAddress, firstDefined(onboardingForm.propertyAddress, onboardingForm.streetAddress, onboardingForm.formattedAddress)),
    textCheck('propertyType', 'property type (onboarding)', form.propertyType, onboardingForm.propertyType),
    textCheck('propertyStructureType', 'ownership scheme (onboarding)', form.propertyStructureType, firstDefined(onboardingForm.propertyStructureType, onboardingForm.ownershipStructure)),
    numberCheck('listingPrice', 'listing price (onboarding)', form.listingPrice, onboardingForm.askingPrice),
    numberCheck('parkingCount', 'parking (onboarding)', form.parkingCount, firstDefined(onboardingForm.parkingCount, onboardingForm.parkingCovered, onboardingForm.parkingBays)),
    numberCheck('ratesTaxes', 'rates and taxes (onboarding)', form.ratesTaxes, onboardingForm.ratesTaxes),
    numberCheck('levies', 'levies (onboarding)', form.levies, onboardingForm.levies),
    textCheck('propertyAddress', 'property address (publication)', firstDefined(form.formattedAddress, form.propertyAddress), publication.address),
    textCheck('propertyType', 'property type (publication)', form.propertyType, firstDefined(publication.property_type, publication.propertyType)),
    numberCheck('listingPrice', 'listing price (publication)', form.listingPrice, firstDefined(publication.asking_price, publication.askingPrice)),
    numberCheck('parkingCount', 'parking (publication)', form.parkingCount, firstDefined(publication.parking_bays, publication.parkingBays)),
    numberCheck('ratesTaxes', 'rates and taxes (publication)', form.ratesTaxes, firstDefined(publication.rates_taxes, publication.ratesTaxes)),
    numberCheck('levies', 'levies (publication)', form.levies, publication.levies),
  ]
  const mismatches = checks.filter(Boolean)
  return { ready: mismatches.length === 0, mismatches }
}

export function listingPropertySaveErrorMessage(verification = {}) {
  const labels = (Array.isArray(verification.mismatches) ? verification.mismatches : [])
    .map((item) => normalizeText(item?.label))
    .filter(Boolean)
  const detail = labels.length ? ` These fields could not be verified: ${labels.join(', ')}.` : ''
  return `Your property details were not fully saved, so Arch9 kept you on this page.${detail} Your entries are still available here; please try again.`
}
