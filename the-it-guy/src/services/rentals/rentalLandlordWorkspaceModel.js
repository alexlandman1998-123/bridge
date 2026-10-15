import { getRentalLeadMetadata } from './rentalLeadClassificationModel'
import { LANDLORD_CONDITIONAL_OPTIONS } from './rentalLandlordOnboardingModel.js'
export const LANDLORD_TABS = [
  'Overview',
  'Landlord profile',
  'Portfolio',
  'Appointments',
  'Documents',
  'Activity',
]
export { LANDLORD_TYPES, PROFILE_FIELDS, PERSON_FIELDS } from './rentalLandlordProfileRules.js'
import { PROFILE_FIELDS, PERSON_FIELDS, landlordProfileErrors } from './rentalLandlordProfileRules.js'
export const PROPERTY_GROUPS = [
  [
    'Rental management & evidence',
    [
      ['serviceType', 'Rental service', 'serviceType'],
      ['schemeType', 'Property scheme', 'schemeType'],
      ['payoutBeneficiaryType', 'Rental proceeds beneficiary', 'payoutBeneficiaryType'],
      ['payoutAccountHolder', 'Proceeds account holder'],
      ['payoutAccountReference', 'Proceeds account reference'],
      ['billingResponsibility', 'Billing and meter responsibility'],
    ],
  ],
  [
    'Property profile',
    [
      ['title', 'Property name'],
      ['address', 'Property address'],
      ['suburb', 'Suburb'],
      ['city', 'City'],
      ['province', 'Province'],
      ['postalCode', 'Postal code'],
      ['category', 'Property category', 'category'],
      ['propertyType', 'Property type'],
      ['canonicalPropertyId', 'Managed property ID'],
      ['canonicalUnitId', 'Managed unit ID'],
    ],
  ],
  [
    'Listing & readiness',
    [
      ['expectedMonthlyRent', 'Expected monthly rent', 'number'],
      ['availableFrom', 'Available from', 'date'],
      ['mandateReference', 'Mandate document reference'],
      ['mandateSignedAt', 'Mandate signed date', 'date'],
      ['mandateStartDate', 'Mandate start date', 'date'],
      ['mandateEndDate', 'Mandate end date', 'date'],
      ['marketingApproved', 'Marketing approved', 'boolean'],
    ],
  ],
  [
    'Property characteristics',
    [
      ['bedrooms', 'Bedrooms', 'number'],
      ['bathrooms', 'Bathrooms', 'number'],
      ['parking', 'Parking spaces', 'number'],
      ['floorSize', 'Floor size (m²)', 'number'],
      ['erfSize', 'Erf size (m²)', 'number'],
      ['furnished', 'Furnished', 'boolean'],
      ['petsAllowed', 'Pets allowed', 'boolean'],
      ['features', 'Features / facilities', 'textarea'],
    ],
  ],
  [
    'Occupancy & ownership',
    [
      ['occupancyStatus', 'Occupancy status', 'occupancy'],
      ['currentTenant', 'Current tenant'],
      ['leaseEndDate', 'Current lease end date', 'date'],
      ['currentRent', 'Current monthly rent', 'number'],
      ['ownershipType', 'Ownership / title type', 'ownership'],
      ['ownershipShare', 'Landlord ownership share (%)', 'number'],
      ['unitNumber', 'Unit number'],
      ['complexName', 'Complex / scheme name'],
      ['accessNotes', 'Access / viewing instructions', 'textarea'],
    ],
  ],
]
const text = (value) => String(value ?? '').trim()
export function landlordWorkspace(lead = {}) {
  const metadata = getRentalLeadMetadata(lead.raw || {})
  const profile = {
    type: 'individual',
    name: lead.name || '',
    email: lead.email || '',
    phone: lead.phone || '',
    people: [],
    ...metadata.landlordProfile,
  }
  const stored = Array.isArray(metadata.landlordPortfolio)
    ? metadata.landlordPortfolio
    : []
  const signedEvidence = [...(metadata.workflow?.events || [])]
    .reverse()
    .find((event) => event.mandateReference && event.signedAt)
  const portfolio = stored.length
    ? stored
    : lead.propertyAddress || lead.relationships?.listingId
      ? [
          {
            id: 'primary-property',
            address: lead.propertyAddress || '',
            title: lead.propertyAddress || 'Linked rental property',
            propertyType: lead.propertyType || '',
            expectedMonthlyRent: lead.expectedMonthlyRent ?? '',
            listingId: lead.relationships?.listingId || '',
            canonicalPropertyId: lead.relationships?.propertyId || '',
            mandateId: lead.relationships?.mandateId || '',
            mandateReference: signedEvidence?.mandateReference || '',
            mandateSignedAt: signedEvidence?.signedAt || '',
          },
        ]
      : []
  return {
    profile,
    portfolio,
    documents: Array.isArray(metadata.landlordDocuments)
      ? metadata.landlordDocuments
      : [],
  }
}
export function normalizeLandlordProfile(values = {}) {
  const errors = landlordProfileErrors(values)
  if (errors.length) throw new Error(errors[0])
  const result = Object.fromEntries(PROFILE_FIELDS.map(([key]) => [key, text(values[key])]))
  return {
    ...result,
    primarySignatoryId: text(values.primarySignatoryId),
    type: values.type,
    people: (values.people || [])
      .map((person) => ({
        id: text(person.id),
        role: text(person.role),
        ...Object.fromEntries(
          PERSON_FIELDS.map(([key]) => [key, text(person[key])]),
        ),
        signingAuthority: person.signingAuthority === true,
      })),
  }
}
export function normalizeLandlordProperty(values = {}) {
  const result = { id: text(values.id), listingId: text(values.listingId) }
  for (const [key, options] of Object.entries(LANDLORD_CONDITIONAL_OPTIONS)) {
    if (text(values[key]) && !options.some(([value]) => value === values[key])) throw new Error('Choose a valid rental service, scheme and proceeds beneficiary.')
  }
  for (const [, fields] of PROPERTY_GROUPS)
    for (const [key, , type] of fields) {
      const value = values[key]
      if (type === 'number' && text(value)) {
        const number = Number(value)
        if (!Number.isFinite(number) || number < 0)
          throw new Error(
            'Property amounts and measurements must be zero or more.',
          )
        if (['bedrooms', 'parking'].includes(key) && !Number.isInteger(number))
          throw new Error('Bedrooms and parking must be whole numbers.')
        if (key === 'ownershipShare' && number > 100)
          throw new Error('Ownership share cannot exceed 100%.')
        result[key] = number
      } else
        result[key] =
          type === 'boolean'
            ? value === 'Yes' || value === 'No'
              ? value
              : ''
            : text(value)
    }
  for (const [, fields] of PROPERTY_GROUPS)
    for (const [key, , type] of fields)
      if (
        type === 'date' &&
        result[key] &&
        Number.isNaN(new Date(result[key]).getTime())
      )
        throw new Error('Enter valid property and mandate dates.')
  if (!result.id || !result.address)
    throw new Error('A property address is required.')
  if (
    result.mandateEndDate &&
    result.mandateStartDate &&
    result.mandateEndDate < result.mandateStartDate
  )
    throw new Error('Mandate expiry cannot be before its start date.')
  return result
}
export function landlordMandateReadiness(profile, portfolio) {
  const checks = [
    [
      'Landlord details',
      Boolean(profile.name && (profile.email || profile.phone)),
    ],
    ['Portfolio captured', portfolio.some((p) => p.address)],
    [
      'Signing authority',
      Boolean(
        profile.authorityBasis ||
        profile.people?.some((p) => p.signingAuthority),
      ),
    ],
    [
      'Mandate evidence',
      portfolio.length > 0 &&
        portfolio.every((p) => p.mandateReference && p.mandateSignedAt),
    ],
  ]
  return {
    checks,
    percent: Math.round(
      (checks.filter(([, done]) => done).length / checks.length) * 100,
    ),
  }
}
export function landlordListingPrefill(lead, propertyId) {
  const { profile, portfolio } = landlordWorkspace(lead)
  const property = portfolio.find((item) => item.id === propertyId)
  if (!property) throw new Error('This portfolio property is not available.')
  return {
    landlordName: profile.name,
    landlordEmail: profile.email,
    landlordPhone: profile.phone,
    landlordType: profile.type,
    listingTitle: property.title || property.address,
    propertyAddress: property.address,
    suburb: property.suburb,
    city: property.city,
    province: property.province,
    postalCode: property.postalCode,
    propertyCategory: property.category || 'residential',
    propertyType: property.propertyType,
    monthlyRent: property.expectedMonthlyRent,
    availableFrom: property.availableFrom,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    parkingBays: property.parking,
    furnishedStatus: property.furnished === 'Yes' ? 'furnished' : 'unfurnished',
    petsPolicy:
      property.petsAllowed === 'Yes'
        ? 'allowed'
        : property.petsAllowed === 'No'
          ? 'not_allowed'
          : 'subject_to_approval',
    unitNumber: property.unitNumber,
    complexName: property.complexName,
    mandateStatus: property.mandateId ? 'signed' : 'not_started',
    marketingApprovalStatus:
      property.marketingApproved === 'Yes' ? 'approved' : 'draft',
    floorSize: property.floorSize,
    erfSize: property.erfSize,
    mandateStartDate: property.mandateStartDate,
    mandateEndDate: property.mandateEndDate,
  }
}
