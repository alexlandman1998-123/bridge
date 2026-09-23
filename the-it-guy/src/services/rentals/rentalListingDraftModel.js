export const RENTAL_LISTING_CAPTURE_VERSION = 'arch9_rental_listing_capture_v1'

export const RENTAL_PRICE_FREQUENCIES = Object.freeze([
  'monthly',
  'weekly',
  'daily',
  'per_square_metre',
  'annual',
])

export const RENTAL_MANDATE_TYPES = Object.freeze([
  'standard_rental',
  'house_share',
])

export const RENTAL_DEPOSIT_POLICIES = Object.freeze([
  'not_captured',
  'deposit_required',
  'no_deposit',
])

export const RETIREMENT_ACCOMMODATION_OPTIONS = Object.freeze([
  'not_captured',
  'yes',
  'no',
])

export const RENTAL_DISTRIBUTION_CHANNELS = Object.freeze([
  { key: 'property24', label: 'Property24' },
  { key: 'private_property', label: 'Private Property' },
  { key: 'agency_website', label: 'Agency Website' },
])

export const RENTAL_LISTING_INITIAL_FORM = Object.freeze({
  title: '',
  landlordName: '',
  landlordEmail: '',
  landlordPhone: '',
  landlordType: 'individual',
  propertyAddress: '',
  unitNumber: '',
  complexName: '',
  streetNumber: '',
  streetName: '',
  suburb: '',
  city: '',
  province: '',
  postalCode: '',
  exactAddressVisibility: 'hide_street_number',
  propertyCategory: 'residential',
  propertyType: 'Apartment',
  bedrooms: '',
  bathrooms: '',
  enSuiteBathrooms: '',
  lounges: '',
  diningRooms: '',
  kitchens: '',
  studies: '',
  storerooms: '',
  staffRooms: '',
  parkingBays: '',
  garages: '',
  coveredParking: '',
  openParking: '',
  carports: '',
  floorSize: '',
  erfSize: '',
  monthlyRent: '',
  rentalPriceFrequency: 'monthly',
  depositAmount: '',
  depositPolicy: 'not_captured',
  depositRequirement: '',
  depositMultiplier: '1',
  availableFrom: '',
  occupationDate: '',
  leasePeriodMonths: '12',
  leasePeriodType: 'fixed_12_months',
  rentalMandateType: 'standard_rental',
  rentalIncludes: '',
  rentalExcludes: '',
  applicationFee: '',
  leaseAdminFee: '',
  creditCheckFee: '',
  keyDepositAmount: '',
  utilityDepositAmount: '',
  retirementAccommodation: 'not_captured',
  furnishedStatus: 'unfurnished',
  petsPolicy: 'subject_to_approval',
  utilitiesPolicy: 'tenant_pays',
  garden: '',
  pool: '',
  flatlet: '',
  accessGate: '',
  alarm: '',
  electricFencing: '',
  securityPost: '',
  builtInCupboards: '',
  fibreInternet: '',
  prepaidElectricity: '',
  prepaidWater: '',
  borehole: '',
  backupWater: '',
  solarBackup: '',
  balcony: '',
  patio: '',
  builtInBraai: '',
  clubhouse: '',
  gym: '',
  laundry: '',
  scenicView: '',
  satellite: '',
  inspectionStatus: 'not_started',
  inspectionNotes: '',
  mandateType: 'rental',
  mandateStatus: 'not_started',
  mandateStartDate: '',
  mandateEndDate: '',
  property24ExpiryDate: '',
  property24SuburbId: '',
  marketingApprovalStatus: 'draft',
  description: '',
  selectedFeatures: [],
  amenities: [],
  galleryImages: [],
  coverImageId: '',
  internalNotes: '',
  selectedSyndicationChannels: [],
})

export const RENTAL_FEATURE_OPTIONS = Object.freeze([
  'Solar',
  'Backup Water',
  'Pool',
  'Pet Friendly',
  'Security',
  'Garden',
  'Fibre',
  'Study',
  'Staff Quarters',
  'Entertainment Area',
])

export const RENTAL_AMENITY_OPTIONS = Object.freeze([
  'Security Estate',
  'Clubhouse',
  'Kids Play Area',
  'Walking Trails',
  'Built-in Braai',
  'Solar System',
  'Staff Accommodation',
  'Open Plan Living',
])

export const RENTAL_SELECT_OPTIONS = Object.freeze({
  landlordType: [
    { value: 'individual', label: 'Individual landlord' },
    { value: 'multiple_owners', label: 'Multiple landlords' },
    { value: 'company', label: 'Company landlord' },
    { value: 'trust', label: 'Trust landlord' },
    { value: 'close_corporation', label: 'Close corporation landlord' },
    { value: 'other_entity', label: 'Other entity' },
    { value: 'foreign_owner', label: 'Foreign landlord' },
  ],
  furnishedStatus: [
    { value: 'unfurnished', label: 'Unfurnished' },
    { value: 'semi_furnished', label: 'Semi-furnished' },
    { value: 'furnished', label: 'Furnished' },
  ],
  petsPolicy: [
    { value: 'subject_to_approval', label: 'Subject to approval' },
    { value: 'allowed', label: 'Allowed' },
    { value: 'not_allowed', label: 'Not allowed' },
  ],
  utilitiesPolicy: [
    { value: 'tenant_pays', label: 'Tenant pays utilities' },
    { value: 'included', label: 'Utilities included' },
    { value: 'water_included', label: 'Water included' },
    { value: 'prepaid_electricity', label: 'Prepaid electricity' },
  ],
  exactAddressVisibility: [
    { value: 'hide_street_number', label: 'Contact agent for street address' },
    { value: 'show_exact_address', label: 'Show exact address on portals' },
    { value: 'complex_only', label: 'Show complex/building only' },
  ],
  leasePeriodType: [
    { value: 'fixed_6_months', label: '6 months' },
    { value: 'fixed_12_months', label: '12 months' },
    { value: 'fixed_24_months', label: '24 months' },
    { value: 'month_to_month', label: 'Month to month' },
    { value: 'negotiable', label: 'Negotiable' },
  ],
  rentalPriceFrequency: [
    { value: 'monthly', label: 'Per month' },
    { value: 'weekly', label: 'Per week' },
    { value: 'daily', label: 'Per day' },
    { value: 'per_square_metre', label: 'Per square metre' },
    { value: 'annual', label: 'Per year' },
  ],
  rentalMandateType: [
    { value: 'standard_rental', label: 'Standard rental' },
    { value: 'house_share', label: 'House share' },
  ],
  depositPolicy: [
    { value: 'not_captured', label: 'Not captured yet' },
    { value: 'deposit_required', label: 'Deposit required' },
    { value: 'no_deposit', label: 'No deposit required' },
  ],
  retirementAccommodation: [
    { value: 'not_captured', label: 'Not captured' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ],
  yesNoUnknown: [
    { value: '', label: 'Not captured' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ],
  inspectionStatus: [
    { value: 'not_started', label: 'Not started' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'completed', label: 'Completed' },
    { value: 'issues_found', label: 'Issues found' },
  ],
  mandateStatus: [
    { value: 'not_started', label: 'Not started' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'sent', label: 'Sent' },
    { value: 'signed', label: 'Signed' },
    { value: 'signed_uploaded', label: 'Signed uploaded' },
  ],
  marketingApprovalStatus: [
    { value: 'draft', label: 'Draft' },
    { value: 'landlord_review', label: 'Landlord review' },
    { value: 'approved', label: 'Approved' },
  ],
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeBooleanChoice(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['yes', 'true', 'included', 'available', 'has', '1'].includes(normalized)) return true
  if (['no', 'false', 'not_included', 'none', '0'].includes(normalized)) return false
  return null
}

function optionLabel(group, value) {
  const normalized = normalizeText(value)
  return RENTAL_SELECT_OPTIONS[group]?.find((item) => item.value === normalized)?.label || normalized
}

function normalizeTextArray(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeText).filter(Boolean))]
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  return allowedValues.includes(normalized) ? normalized : fallback
}

export function normalizeRentalPriceFrequency(value) {
  return normalizeEnum(value, RENTAL_PRICE_FREQUENCIES, 'monthly')
}

export function normalizeRentalMandateType(value) {
  return normalizeEnum(value, RENTAL_MANDATE_TYPES, 'standard_rental')
}

export function normalizeRentalDepositPolicy(value) {
  return normalizeEnum(value, RENTAL_DEPOSIT_POLICIES, 'not_captured')
}

export function normalizeRetirementAccommodation(value) {
  return normalizeEnum(value, RETIREMENT_ACCOMMODATION_OPTIONS, 'not_captured')
}

export function normalizeRentalDistributionChannels(values = []) {
  const aliases = {
    privateproperty: 'private_property',
    private_property: 'private_property',
    property24: 'property24',
    agencywebsite: 'agency_website',
    agency_website: 'agency_website',
    website: 'agency_website',
  }
  const selected = Array.isArray(values) ? values : []
  const allowed = new Set(RENTAL_DISTRIBUTION_CHANNELS.map((channel) => channel.key))
  return [...new Set(selected
    .map((value) => normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_'))
    .map((value) => aliases[value] || value)
    .filter((value) => allowed.has(value)))]
}

function joinNonEmpty(parts, separator = ', ') {
  return parts.map(normalizeText).filter(Boolean).join(separator)
}

export function buildRentalListingTitle(form = {}) {
  return normalizeText(form.title) ||
    joinNonEmpty([form.propertyType, form.suburb || form.city], ' in ') ||
    'Rental listing draft'
}

export function validateRentalListingDraftForm(form = {}, context = {}) {
  const errors = []
  if (!normalizeText(context.organisationId)) errors.push('Organisation context is required.')
  if (!normalizeText(form.propertyAddress)) errors.push('Property address is required.')
  if (!normalizeNumber(form.monthlyRent)) errors.push('Rental amount is required.')
  if (!normalizeText(form.rentalPriceFrequency)) errors.push('Rental price frequency is required.')
  if (normalizeRentalDepositPolicy(form.depositPolicy) === 'not_captured') errors.push('Choose whether a deposit is required.')
  if (!normalizeText(form.availableFrom) && !normalizeText(form.occupationDate)) errors.push('Available from or occupation date is required.')
  if (!normalizeText(form.description)) errors.push('Public rental description is required.')
  return errors
}

export function buildRentalCanonicalFacts(form = {}) {
  const monthlyRent = normalizeNumber(form.monthlyRent)
  const depositAmount = normalizeNumber(form.depositAmount)
  const leasePeriodMonths = normalizeNumber(form.leasePeriodMonths)
  const portalFeatures = {
    garden: normalizeBooleanChoice(form.garden),
    pool: normalizeBooleanChoice(form.pool),
    flatlet: normalizeBooleanChoice(form.flatlet),
    accessGate: normalizeBooleanChoice(form.accessGate),
    alarm: normalizeBooleanChoice(form.alarm),
    electricFencing: normalizeBooleanChoice(form.electricFencing),
    securityPost: normalizeBooleanChoice(form.securityPost),
    builtInCupboards: normalizeBooleanChoice(form.builtInCupboards),
    fibreInternet: normalizeBooleanChoice(form.fibreInternet),
    prepaidElectricity: normalizeBooleanChoice(form.prepaidElectricity),
    prepaidWater: normalizeBooleanChoice(form.prepaidWater),
    borehole: normalizeBooleanChoice(form.borehole),
    backupWater: normalizeBooleanChoice(form.backupWater),
    solarBackup: normalizeBooleanChoice(form.solarBackup),
    balcony: normalizeBooleanChoice(form.balcony),
    patio: normalizeBooleanChoice(form.patio),
    builtInBraai: normalizeBooleanChoice(form.builtInBraai),
    clubhouse: normalizeBooleanChoice(form.clubhouse),
    gym: normalizeBooleanChoice(form.gym),
    laundry: normalizeBooleanChoice(form.laundry),
    scenicView: normalizeBooleanChoice(form.scenicView),
    satellite: normalizeBooleanChoice(form.satellite),
  }

  return {
    captureVersion: RENTAL_LISTING_CAPTURE_VERSION,
    listingType: 'Rental',
    landlordName: normalizeText(form.landlordName),
    landlordEmail: normalizeText(form.landlordEmail),
    landlordPhone: normalizeText(form.landlordPhone),
    landlordType: normalizeText(form.landlordType) || 'individual',
    propertyAddress: normalizeText(form.propertyAddress),
    addressProfile: {
      unitNumber: normalizeText(form.unitNumber),
      complexName: normalizeText(form.complexName),
      streetNumber: normalizeText(form.streetNumber),
      streetName: normalizeText(form.streetName),
      suburb: normalizeText(form.suburb),
      city: normalizeText(form.city),
      province: normalizeText(form.province),
      postalCode: normalizeText(form.postalCode),
      exactAddressVisibility: normalizeText(form.exactAddressVisibility) || 'hide_street_number',
    },
    suburb: normalizeText(form.suburb),
    property24SuburbId: normalizeText(form.property24SuburbId),
    city: normalizeText(form.city),
    province: normalizeText(form.province),
    propertyProfile: {
      propertyCategory: normalizeText(form.propertyCategory) || 'residential',
      propertyType: normalizeText(form.propertyType) || 'Apartment',
      bedrooms: normalizeNumber(form.bedrooms),
      bathrooms: normalizeNumber(form.bathrooms),
      enSuiteBathrooms: normalizeNumber(form.enSuiteBathrooms),
      lounges: normalizeNumber(form.lounges),
      diningRooms: normalizeNumber(form.diningRooms),
      kitchens: normalizeNumber(form.kitchens),
      studies: normalizeNumber(form.studies),
      storerooms: normalizeNumber(form.storerooms),
      staffRooms: normalizeNumber(form.staffRooms),
      parkingBays: normalizeNumber(form.parkingBays),
      garages: normalizeNumber(form.garages),
      coveredParking: normalizeNumber(form.coveredParking),
      openParking: normalizeNumber(form.openParking),
      carports: normalizeNumber(form.carports),
      floorSize: normalizeNumber(form.floorSize),
      erfSize: normalizeNumber(form.erfSize),
      selectedFeatures: normalizeTextArray(form.selectedFeatures),
      amenities: normalizeTextArray(form.amenities),
      retirementAccommodation: normalizeRetirementAccommodation(form.retirementAccommodation),
      portalFeatures,
    },
    rentalInfo: {
      monthlyRent,
      rentalPriceFrequency: normalizeRentalPriceFrequency(form.rentalPriceFrequency),
      depositAmount,
      depositPolicy: normalizeRentalDepositPolicy(form.depositPolicy),
      depositRequirement: normalizeText(form.depositRequirement),
      depositMultiplier: normalizeNumber(form.depositMultiplier),
      availableFrom: normalizeText(form.availableFrom),
      occupationDate: normalizeText(form.occupationDate),
      leasePeriodMonths,
      leasePeriodType: normalizeText(form.leasePeriodType) || 'fixed_12_months',
      rentalMandateType: normalizeRentalMandateType(form.rentalMandateType),
      rentalIncludes: normalizeText(form.rentalIncludes),
      rentalExcludes: normalizeText(form.rentalExcludes),
      applicationFee: normalizeNumber(form.applicationFee),
      leaseAdminFee: normalizeNumber(form.leaseAdminFee),
      creditCheckFee: normalizeNumber(form.creditCheckFee),
      keyDepositAmount: normalizeNumber(form.keyDepositAmount),
      utilityDepositAmount: normalizeNumber(form.utilityDepositAmount),
      furnishedStatus: normalizeText(form.furnishedStatus) || 'unfurnished',
      petsPolicy: normalizeText(form.petsPolicy) || 'subject_to_approval',
      utilitiesPolicy: normalizeText(form.utilitiesPolicy) || 'tenant_pays',
      inspectionStatus: normalizeText(form.inspectionStatus) || 'not_started',
      inspectionNotes: normalizeText(form.inspectionNotes),
      mandateType: normalizeText(form.mandateType) || 'rental',
      mandateStatus: normalizeText(form.mandateStatus) || 'not_started',
      mandateStartDate: normalizeText(form.mandateStartDate),
      mandateEndDate: normalizeText(form.mandateEndDate),
      marketingApprovalStatus: normalizeText(form.marketingApprovalStatus) || 'draft',
    },
    distribution: {
      selectedChannels: normalizeRentalDistributionChannels(form.selectedSyndicationChannels),
    },
  }
}

export function buildRentalCanonicalFactReadiness(form = {}) {
  return {
    captureVersion: true,
    listingType: true,
    landlordName: Boolean(normalizeText(form.landlordName)),
    landlordContact: Boolean(normalizeText(form.landlordEmail) || normalizeText(form.landlordPhone)),
    propertyAddress: Boolean(normalizeText(form.propertyAddress)),
    monthlyRent: Boolean(normalizeNumber(form.monthlyRent)),
    rentalPriceFrequency: Boolean(normalizeText(form.rentalPriceFrequency)),
    depositAmount: Boolean(normalizeNumber(form.depositAmount)),
    depositPolicy: normalizeRentalDepositPolicy(form.depositPolicy) !== 'not_captured',
    availableFrom: Boolean(normalizeText(form.availableFrom)),
    occupationDate: Boolean(normalizeText(form.occupationDate || form.availableFrom)),
    leasePeriodMonths: Boolean(normalizeNumber(form.leasePeriodMonths)),
    depositRequirement: Boolean(normalizeText(form.depositRequirement) || normalizeNumber(form.depositAmount)),
    rentalExcludes: Boolean(normalizeText(form.rentalExcludes) || normalizeText(form.utilitiesPolicy)),
    mandateStatus: Boolean(normalizeText(form.mandateStatus)),
    mandateEndDate: Boolean(normalizeText(form.mandateEndDate)),
    inspectionStatus: Boolean(normalizeText(form.inspectionStatus)),
    marketingApprovalStatus: Boolean(normalizeText(form.marketingApprovalStatus)),
    portalFeatureFlags: ['garden', 'pool', 'flatlet'].every((field) => normalizeBooleanChoice(form[field]) !== null),
  }
}

export function buildRentalListingNotes(form = {}) {
  const facts = buildRentalCanonicalFacts(form)
  const lines = [
    'ARCH9_RENTAL_CAPTURE_V1',
    `Landlord: ${facts.landlordName || 'Not captured'}`,
    `Landlord contact: ${joinNonEmpty([facts.landlordEmail, facts.landlordPhone], ' / ') || 'Not captured'}`,
    `Rental mandate: ${optionLabel('mandateStatus', facts.rentalInfo.mandateStatus) || 'Not started'}`,
    `Mandate start: ${facts.rentalInfo.mandateStartDate || 'Not captured'}`,
    `Mandate end: ${facts.rentalInfo.mandateEndDate || 'Not captured'}`,
    `Available from: ${facts.rentalInfo.availableFrom || 'Not captured'}`,
    `Occupation date: ${facts.rentalInfo.occupationDate || facts.rentalInfo.availableFrom || 'Not captured'}`,
    `Monthly rent: ${facts.rentalInfo.monthlyRent === null ? 'Not captured' : `R${facts.rentalInfo.monthlyRent}`}`,
    `Rental price frequency: ${optionLabel('rentalPriceFrequency', facts.rentalInfo.rentalPriceFrequency) || 'Not captured'}`,
    `Deposit: ${facts.rentalInfo.depositAmount === null ? 'Not captured' : `R${facts.rentalInfo.depositAmount}`}`,
    `Deposit policy: ${optionLabel('depositPolicy', facts.rentalInfo.depositPolicy) || 'Not captured'}`,
    `Deposit requirement: ${facts.rentalInfo.depositRequirement || 'Not captured'}`,
    `Lease period: ${facts.rentalInfo.leasePeriodMonths || 'Not captured'} months`,
    `Rental mandate type: ${optionLabel('rentalMandateType', facts.rentalInfo.rentalMandateType) || 'Not captured'}`,
    `Rental includes: ${facts.rentalInfo.rentalIncludes || 'Not captured'}`,
    `Rental excludes: ${facts.rentalInfo.rentalExcludes || 'Not captured'}`,
    `Furnished: ${optionLabel('furnishedStatus', facts.rentalInfo.furnishedStatus)}`,
    `Pets: ${optionLabel('petsPolicy', facts.rentalInfo.petsPolicy)}`,
    `Utilities: ${optionLabel('utilitiesPolicy', facts.rentalInfo.utilitiesPolicy)}`,
    `Inspection: ${optionLabel('inspectionStatus', facts.rentalInfo.inspectionStatus)}`,
    `Marketing approval: ${optionLabel('marketingApprovalStatus', facts.rentalInfo.marketingApprovalStatus)}`,
    `Distribution: ${facts.distribution?.selectedChannels?.map((key) => RENTAL_DISTRIBUTION_CHANNELS.find((channel) => channel.key === key)?.label || key).join(', ') || 'Not selected'}`,
  ]
  if (facts.propertyProfile?.floorSize !== null) lines.push(`Floor size: ${facts.propertyProfile.floorSize} m2`)
  if (facts.propertyProfile?.erfSize !== null) lines.push(`Erf size: ${facts.propertyProfile.erfSize} m2`)
  if (facts.propertyProfile?.garages !== null) lines.push(`Garages: ${facts.propertyProfile.garages}`)
  if (facts.propertyProfile?.coveredParking !== null) lines.push(`Covered parking: ${facts.propertyProfile.coveredParking}`)
  if (facts.propertyProfile?.openParking !== null) lines.push(`Open parking: ${facts.propertyProfile.openParking}`)
  if (facts.propertyProfile?.retirementAccommodation !== 'not_captured') {
    lines.push(`Retirement accommodation: ${optionLabel('retirementAccommodation', facts.propertyProfile.retirementAccommodation)}`)
  }
  if (facts.propertyProfile?.selectedFeatures?.length) lines.push(`Features: ${facts.propertyProfile.selectedFeatures.join(', ')}`)
  if (facts.propertyProfile?.amenities?.length) lines.push(`Amenities: ${facts.propertyProfile.amenities.join(', ')}`)
  const capturedPortalFeatures = Object.entries(facts.propertyProfile?.portalFeatures || {})
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}: ${value ? 'yes' : 'no'}`)
  if (capturedPortalFeatures.length) lines.push(`Portal feature flags: ${capturedPortalFeatures.join(', ')}`)
  if (Array.isArray(form.galleryImages) && form.galleryImages.length) lines.push(`Gallery images: ${form.galleryImages.length}`)
  if (normalizeText(form.inspectionNotes)) lines.push(`Inspection notes: ${normalizeText(form.inspectionNotes)}`)
  if (normalizeText(form.internalNotes)) lines.push(`Internal notes: ${normalizeText(form.internalNotes)}`)
  return lines.join('\n')
}

export function buildRentalPublicationDraft(form = {}) {
  const rentalFeatures = [
    optionLabel('furnishedStatus', form.furnishedStatus),
    optionLabel('petsPolicy', form.petsPolicy),
    optionLabel('utilitiesPolicy', form.utilitiesPolicy),
  ].filter(Boolean)

  return {
    title: buildRentalListingTitle(form),
    address: normalizeText(form.propertyAddress),
    suburb: normalizeText(form.suburb),
    city: normalizeText(form.city),
    province: normalizeText(form.province),
    propertyType: normalizeText(form.propertyType),
    propertyCategory: normalizeText(form.propertyCategory) || 'residential',
    listingType: 'Rental',
    askingPrice: normalizeNumber(form.monthlyRent),
    bedrooms: normalizeNumber(form.bedrooms),
    bathrooms: normalizeNumber(form.bathrooms),
    parkingBays: normalizeNumber(form.parkingBays),
    garages: normalizeNumber(form.garages),
    coveredParking: normalizeNumber(form.coveredParking),
    openParking: normalizeNumber(form.openParking),
    carports: normalizeNumber(form.carports),
    floorSize: normalizeNumber(form.floorSize),
    erfSize: normalizeNumber(form.erfSize),
    description: normalizeText(form.description),
    features: normalizeTextArray([...(Array.isArray(form.selectedFeatures) ? form.selectedFeatures : []), ...rentalFeatures]),
    amenities: normalizeTextArray(form.amenities),
    rentalTerms: {
      rentalPriceFrequency: normalizeRentalPriceFrequency(form.rentalPriceFrequency),
      availableFrom: normalizeText(form.availableFrom),
      occupationDate: normalizeText(form.occupationDate),
      leasePeriodMonths: normalizeNumber(form.leasePeriodMonths),
      leasePeriodType: normalizeText(form.leasePeriodType),
      depositRequirement: normalizeText(form.depositRequirement),
      depositPolicy: normalizeRentalDepositPolicy(form.depositPolicy),
      rentalMandateType: normalizeRentalMandateType(form.rentalMandateType),
      rentalIncludes: normalizeText(form.rentalIncludes),
      rentalExcludes: normalizeText(form.rentalExcludes),
    },
    retirementAccommodation: normalizeRetirementAccommodation(form.retirementAccommodation),
    property24ExpiryDate: normalizeText(form.property24ExpiryDate),
    property24SuburbId: normalizeText(form.property24SuburbId),
    portalFeatures: buildRentalCanonicalFacts(form).propertyProfile.portalFeatures,
    selectedSyndicationChannels: normalizeRentalDistributionChannels(form.selectedSyndicationChannels),
    exactAddressVisibility: normalizeText(form.exactAddressVisibility) || 'hide_street_address',
    status: normalizeText(form.marketingApprovalStatus) === 'approved' ? 'Ready' : 'Draft',
  }
}

export function buildRentalPrivateListingPayload(form = {}, context = {}) {
  const title = buildRentalListingTitle(form)
  const notes = buildRentalListingNotes(form)
  const canonicalFacts = buildRentalCanonicalFacts(form)
  return {
    organisationId: normalizeText(context.organisationId),
    branchId: normalizeText(context.branchId),
    assignedAgentId: normalizeText(context.assignedAgentId),
    listingStatus: 'seller_lead',
    sellerOnboardingStatus: 'not_started',
    listingVisibility: 'internal',
    title,
    propertyCategory: normalizeText(form.propertyCategory) || 'residential',
    listingSource: 'private_listing',
    propertyStructureType: 'other',
    propertyType: normalizeText(form.propertyType),
    listingCategory: 'rental',
    askingPrice: normalizeNumber(form.monthlyRent),
    estimatedValue: normalizeNumber(form.monthlyRent),
    addressLine1: normalizeText(form.propertyAddress),
    formattedAddress: normalizeText(form.propertyAddress),
    streetAddress: normalizeText(form.propertyAddress),
    streetNumber: normalizeText(form.streetNumber),
    streetName: normalizeText(form.streetName),
    unitNumber: normalizeText(form.unitNumber),
    complexName: normalizeText(form.complexName),
    suburb: normalizeText(form.suburb),
    city: normalizeText(form.city),
    province: normalizeText(form.province),
    postalCode: normalizeText(form.postalCode),
    country: 'South Africa',
    description: normalizeText(form.description),
    internalListingNotes: notes,
    listingPreviewDescription: normalizeText(form.description) || notes,
    sellerType: normalizeText(form.landlordType) || 'individual',
    mandateType: normalizeText(form.mandateType) || 'rental',
    mandateStatus: normalizeText(form.mandateStatus) || 'not_started',
    mandateStartDate: normalizeText(form.mandateStartDate),
    mandateEndDate: normalizeText(form.mandateEndDate),
    expiryDate: normalizeText(form.property24ExpiryDate) || normalizeText(form.mandateEndDate),
    property24Status: 'not_published',
    source: 'rentals_phase4_capture',
    origin: 'rentals_phase4_capture',
    captureMethod: 'rental_listing_capture',
    sellerCanonicalFacts: canonicalFacts,
    sellerCanonicalFactReadiness: buildRentalCanonicalFactReadiness(form),
    sellerCanonicalFactsUpdatedAt: new Date().toISOString(),
  }
}
