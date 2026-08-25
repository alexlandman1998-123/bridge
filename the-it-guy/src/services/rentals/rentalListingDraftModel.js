export const RENTAL_LISTING_CAPTURE_VERSION = 'arch9_rental_listing_capture_v1'

export const RENTAL_LISTING_INITIAL_FORM = Object.freeze({
  title: '',
  landlordName: '',
  landlordEmail: '',
  landlordPhone: '',
  landlordType: 'individual',
  propertyAddress: '',
  suburb: '',
  city: '',
  province: '',
  propertyType: 'Apartment',
  bedrooms: '',
  bathrooms: '',
  parkingBays: '',
  floorSize: '',
  erfSize: '',
  monthlyRent: '',
  depositAmount: '',
  availableFrom: '',
  leasePeriodMonths: '12',
  furnishedStatus: 'unfurnished',
  petsPolicy: 'subject_to_approval',
  utilitiesPolicy: 'tenant_pays',
  inspectionStatus: 'not_started',
  inspectionNotes: '',
  mandateType: 'rental',
  mandateStatus: 'not_started',
  marketingApprovalStatus: 'draft',
  description: '',
  selectedFeatures: [],
  amenities: [],
  galleryImages: [],
  coverImageId: '',
  internalNotes: '',
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
    { value: 'company', label: 'Company landlord' },
    { value: 'trust', label: 'Trust landlord' },
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

function optionLabel(group, value) {
  const normalized = normalizeText(value)
  return RENTAL_SELECT_OPTIONS[group]?.find((item) => item.value === normalized)?.label || normalized
}

function normalizeTextArray(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeText).filter(Boolean))]
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
  if (!normalizeText(form.landlordName)) errors.push('Landlord name is required.')
  if (!normalizeText(form.landlordEmail) && !normalizeText(form.landlordPhone)) errors.push('Landlord email or phone is required.')
  if (!normalizeText(form.propertyAddress)) errors.push('Property address is required.')
  if (!normalizeNumber(form.monthlyRent)) errors.push('Monthly rent is required.')
  if (!normalizeText(form.availableFrom)) errors.push('Availability date is required.')
  return errors
}

export function buildRentalCanonicalFacts(form = {}) {
  const monthlyRent = normalizeNumber(form.monthlyRent)
  const depositAmount = normalizeNumber(form.depositAmount)
  const leasePeriodMonths = normalizeNumber(form.leasePeriodMonths)

  return {
    captureVersion: RENTAL_LISTING_CAPTURE_VERSION,
    listingType: 'Rental',
    landlordName: normalizeText(form.landlordName),
    landlordEmail: normalizeText(form.landlordEmail),
    landlordPhone: normalizeText(form.landlordPhone),
    landlordType: normalizeText(form.landlordType) || 'individual',
    propertyAddress: normalizeText(form.propertyAddress),
    suburb: normalizeText(form.suburb),
    city: normalizeText(form.city),
    province: normalizeText(form.province),
    propertyProfile: {
      propertyType: normalizeText(form.propertyType) || 'Apartment',
      bedrooms: normalizeNumber(form.bedrooms),
      bathrooms: normalizeNumber(form.bathrooms),
      parkingBays: normalizeNumber(form.parkingBays),
      floorSize: normalizeNumber(form.floorSize),
      erfSize: normalizeNumber(form.erfSize),
      selectedFeatures: normalizeTextArray(form.selectedFeatures),
      amenities: normalizeTextArray(form.amenities),
    },
    rentalInfo: {
      monthlyRent,
      depositAmount,
      availableFrom: normalizeText(form.availableFrom),
      leasePeriodMonths,
      furnishedStatus: normalizeText(form.furnishedStatus) || 'unfurnished',
      petsPolicy: normalizeText(form.petsPolicy) || 'subject_to_approval',
      utilitiesPolicy: normalizeText(form.utilitiesPolicy) || 'tenant_pays',
      inspectionStatus: normalizeText(form.inspectionStatus) || 'not_started',
      inspectionNotes: normalizeText(form.inspectionNotes),
      mandateType: normalizeText(form.mandateType) || 'rental',
      mandateStatus: normalizeText(form.mandateStatus) || 'not_started',
      marketingApprovalStatus: normalizeText(form.marketingApprovalStatus) || 'draft',
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
    depositAmount: Boolean(normalizeNumber(form.depositAmount)),
    availableFrom: Boolean(normalizeText(form.availableFrom)),
    leasePeriodMonths: Boolean(normalizeNumber(form.leasePeriodMonths)),
    mandateStatus: Boolean(normalizeText(form.mandateStatus)),
    inspectionStatus: Boolean(normalizeText(form.inspectionStatus)),
    marketingApprovalStatus: Boolean(normalizeText(form.marketingApprovalStatus)),
  }
}

export function buildRentalListingNotes(form = {}) {
  const facts = buildRentalCanonicalFacts(form)
  const lines = [
    'ARCH9_RENTAL_CAPTURE_V1',
    `Landlord: ${facts.landlordName || 'Not captured'}`,
    `Landlord contact: ${joinNonEmpty([facts.landlordEmail, facts.landlordPhone], ' / ') || 'Not captured'}`,
    `Rental mandate: ${optionLabel('mandateStatus', facts.rentalInfo.mandateStatus) || 'Not started'}`,
    `Available from: ${facts.rentalInfo.availableFrom || 'Not captured'}`,
    `Monthly rent: ${facts.rentalInfo.monthlyRent === null ? 'Not captured' : `R${facts.rentalInfo.monthlyRent}`}`,
    `Deposit: ${facts.rentalInfo.depositAmount === null ? 'Not captured' : `R${facts.rentalInfo.depositAmount}`}`,
    `Lease period: ${facts.rentalInfo.leasePeriodMonths || 'Not captured'} months`,
    `Furnished: ${optionLabel('furnishedStatus', facts.rentalInfo.furnishedStatus)}`,
    `Pets: ${optionLabel('petsPolicy', facts.rentalInfo.petsPolicy)}`,
    `Utilities: ${optionLabel('utilitiesPolicy', facts.rentalInfo.utilitiesPolicy)}`,
    `Inspection: ${optionLabel('inspectionStatus', facts.rentalInfo.inspectionStatus)}`,
    `Marketing approval: ${optionLabel('marketingApprovalStatus', facts.rentalInfo.marketingApprovalStatus)}`,
  ]
  if (facts.propertyProfile?.floorSize !== null) lines.push(`Floor size: ${facts.propertyProfile.floorSize} m2`)
  if (facts.propertyProfile?.erfSize !== null) lines.push(`Erf size: ${facts.propertyProfile.erfSize} m2`)
  if (facts.propertyProfile?.selectedFeatures?.length) lines.push(`Features: ${facts.propertyProfile.selectedFeatures.join(', ')}`)
  if (facts.propertyProfile?.amenities?.length) lines.push(`Amenities: ${facts.propertyProfile.amenities.join(', ')}`)
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
    province: normalizeText(form.province),
    propertyType: normalizeText(form.propertyType),
    listingType: 'Rental',
    askingPrice: normalizeNumber(form.monthlyRent),
    bedrooms: normalizeNumber(form.bedrooms),
    bathrooms: normalizeNumber(form.bathrooms),
    parkingBays: normalizeNumber(form.parkingBays),
    floorSize: normalizeNumber(form.floorSize),
    erfSize: normalizeNumber(form.erfSize),
    description: normalizeText(form.description),
    features: normalizeTextArray([...(Array.isArray(form.selectedFeatures) ? form.selectedFeatures : []), ...rentalFeatures]),
    amenities: normalizeTextArray(form.amenities),
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
    propertyCategory: 'residential',
    listingSource: 'private_listing',
    propertyStructureType: 'other',
    propertyType: normalizeText(form.propertyType),
    listingCategory: 'rental',
    askingPrice: normalizeNumber(form.monthlyRent),
    estimatedValue: normalizeNumber(form.monthlyRent),
    addressLine1: normalizeText(form.propertyAddress),
    formattedAddress: normalizeText(form.propertyAddress),
    streetAddress: normalizeText(form.propertyAddress),
    suburb: normalizeText(form.suburb),
    city: normalizeText(form.city),
    province: normalizeText(form.province),
    country: 'South Africa',
    description: normalizeText(form.description),
    internalListingNotes: notes,
    listingPreviewDescription: normalizeText(form.description) || notes,
    sellerType: normalizeText(form.landlordType) || 'individual',
    mandateType: normalizeText(form.mandateType) || 'rental',
    mandateStatus: normalizeText(form.mandateStatus) || 'not_started',
    property24Status: 'not_published',
    source: 'rentals_phase4_capture',
    origin: 'rentals_phase4_capture',
    captureMethod: 'rental_listing_capture',
    sellerCanonicalFacts: canonicalFacts,
    sellerCanonicalFactReadiness: buildRentalCanonicalFactReadiness(form),
    sellerCanonicalFactsUpdatedAt: new Date().toISOString(),
  }
}
