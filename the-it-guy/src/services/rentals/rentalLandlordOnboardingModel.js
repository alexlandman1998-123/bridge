const text = (value) => String(value ?? '').trim()
export const LANDLORD_PROFILE_FIELDS = [
  'type',
  'name',
  'email',
  'phone',
  'residentialAddress',
  'idNumber',
  'nationality',
  'registrationNumber',
  'tradingName',
  'country',
  'authorisedSignatoryName',
  'authorisedSignatoryCapacity',
  'authorisedSignatoryIdNumber',
  'authorisedSignatoryNationality',
  'authorisedSignatoryEmail',
  'authorisedSignatoryPhone',
  'authorityBasis',
  'resolutionDate',
]
export const LANDLORD_PERSON_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'idNumber',
  'nationality',
  'residentialAddress',
  'ownershipShare',
  'capacity',
  'role',
]
export const LANDLORD_PROPERTY_FIELDS = [
  'id',
  'title',
  'address',
  'suburb',
  'city',
  'province',
  'postalCode',
  'category',
  'propertyType',
  'expectedMonthlyRent',
  'availableFrom',
  'bedrooms',
  'bathrooms',
  'parking',
  'floorSize',
  'erfSize',
  'furnished',
  'petsAllowed',
  'occupancyStatus',
  'currentRent',
  'ownershipType',
  'ownershipShare',
  'unitNumber',
  'complexName',
  'serviceType',
  'schemeType',
  'payoutBeneficiaryType',
  'payoutAccountHolder',
  'payoutAccountReference',
  'billingResponsibility',
  'leaseEndDate',
]
export const LANDLORD_CONDITIONAL_OPTIONS = {
  serviceType: [['letting_only', 'Letting only'], ['managed_rental', 'Managed rental']],
  schemeType: [['none', 'No scheme'], ['body_corporate', 'Body corporate'], ['hoa', 'Homeowners association']],
  payoutBeneficiaryType: [['landlord', 'Landlord’s account'], ['third_party', 'Third-party beneficiary']],
}
export function rentalLandlordPropertyFieldVisible(key, property = {}) {
  return !['payoutBeneficiaryType', 'payoutAccountHolder', 'payoutAccountReference', 'billingResponsibility'].includes(key) || property.serviceType === 'managed_rental'
}
const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const project = (value, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(value || {}, key))
      .map((key) => [key, value[key]]),
  )
export function rentalLandlordDiscovery(payload = {}) {
  const m = payload.rentalCrm || payload.rental_crm || payload
  return {
    profile: object(m.landlordProfile),
    portfolio: Array.isArray(m.landlordPortfolio) ? m.landlordPortfolio : [],
  }
}
export function publicRentalLandlordDiscovery(data = {}) {
  return {
    profile: {
      ...project(data.profile, LANDLORD_PROFILE_FIELDS),
      people: (data.profile?.people || []).map((person) =>
        project(person, LANDLORD_PERSON_FIELDS),
      ),
    },
    portfolio: (data.portfolio || []).map((property) =>
      project(property, LANDLORD_PROPERTY_FIELDS),
    ),
  }
}
export function mergeRentalLandlordDiscovery(
  current,
  patch,
  { publicSource = false } = {},
) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new Error('Landlord discovery must be an object.')
  const valid = (row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw new Error('Discovery entries must be objects.')
    for (const [key, value] of Object.entries(row))
      if (key !== 'people' && value !== null && typeof value === 'object')
        throw new Error('Discovery fields must be single values.')
    for (const [key, options] of Object.entries(LANDLORD_CONDITIONAL_OPTIONS)) {
      if (row[key] != null && row[key] !== '' && !options.some(([value]) => value === row[key])) throw new Error(`Choose a valid ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}.`)
    }
    return row
  }
  const next = {
    profile: { ...current.profile },
    portfolio: [...current.portfolio],
  }
  if (patch.profile !== undefined) {
    const profile = valid(patch.profile)
    next.profile = {
      ...next.profile,
      ...(publicSource ? project(profile, LANDLORD_PROFILE_FIELDS) : profile),
    }
    if (profile.people !== undefined) {
      if (!Array.isArray(profile.people) || profile.people.length > 50)
        throw new Error('Choose a valid list of relevant people.')
      next.profile.people = profile.people.map((person) => ({
        ...(current.profile?.people || []).find((old) => old.id === person.id),
        ...(publicSource
          ? project(valid(person), LANDLORD_PERSON_FIELDS)
          : valid(person)),
      }))
      const ids = next.profile.people.map((person) => text(person.id))
      if (
        ids.some(
          (id) =>
            !id || ['primary', 'entity', 'signatory', 'property'].includes(id),
        ) ||
        new Set(ids).size !== ids.length
      )
        throw new Error('Each relevant person needs a unique reference.')
    }
  }
  if (patch.portfolio !== undefined) {
    if (!Array.isArray(patch.portfolio) || patch.portfolio.length > 50)
      throw new Error('Choose a valid property portfolio.')
    const ids = patch.portfolio.map((row) => text(row.id))
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
      throw new Error('Each property needs a unique reference.')
    if (
      publicSource &&
      (ids.length !== current.portfolio.length ||
        ids.some((id) => !current.portfolio.some((row) => row.id === id)))
    )
      throw new Error('Ask your agent to add or remove a property.')
    next.portfolio = patch.portfolio.map((row) => ({
      ...current.portfolio.find((old) => old.id === row.id),
      ...(publicSource
        ? project(valid(row), LANDLORD_PROPERTY_FIELDS)
        : valid(row)),
    }))
  }
  return next
}
export function rentalLandlordSubmissionErrors(data) {
  const errors = []
  if (
    ![
      'individual',
      'multiple_owners',
      'company',
      'close_corporation',
      'trust',
    ].includes(data.profile?.type)
  )
    errors.push('Resolve the landlord type with your agent.')
  if (
    !text(data.profile?.name) ||
    (!text(data.profile?.email) && !text(data.profile?.phone))
  )
    errors.push('Complete the landlord name and contact details.')
  if (
    !data.portfolio?.length ||
    data.portfolio.some((row) => !text(row.address))
  )
    errors.push('Confirm the address of each property.')
  return errors
}
export function rentalLandlordRequirementTitle(row, data) {
  const purpose =
    {
      identity: 'Identity evidence',
      address: 'Address evidence',
      property_disclosure: 'Completed and signed prescribed disclosure',
      right_to_let: 'Ownership or right to let',
      signed_mandate: 'Signed rental mandate',
      trust_founding: 'Trust deed / founding evidence',
      trust_authority: 'Current Letters of Authority',
      signing_authority: 'Signing authority',
      co_owner_authority: 'Co-owner authority',
      beneficial_ownership: 'Beneficial ownership evidence',
      entity_registration: 'Entity registration',
      payout_account: 'Rental proceeds account confirmation',
      third_party_payee_authority: 'Third-party payout authority',
      management_information: 'Management billing and meter information',
      scheme_rules: 'Scheme rules and letting permissions',
      existing_tenancy_pack: 'Existing lease, deposit and inspection records',
    }[row.purpose] || row.purpose.replaceAll('_', ' ')
  const subject = row.scopeKey.startsWith('property:')
    ? data.portfolio?.find((item) => `property:${item.id}` === row.scopeKey)
        ?.title ||
      data.portfolio?.find((item) => `property:${item.id}` === row.scopeKey)
        ?.address ||
      'Property'
    : row.subjectId === 'primary' || row.subjectId === 'entity'
      ? data.profile?.name || 'Landlord'
      : row.subjectId === 'signatory'
        ? data.profile?.authorisedSignatoryName || 'Authorised signatory'
        : data.profile?.people?.find((person) => person.id === row.subjectId)
            ?.name || 'Relevant person'
  return `${subject}: ${purpose}`
}

export function rentalLandlordRequirementReason(row) {
  return {
    identity: 'Identity evidence for this landlord or relevant person.',
    address: 'Address evidence for this landlord or relevant person; acceptable alternatives need agency confirmation.',
    entity_registration: 'The landlord is a company or close corporation.',
    trust_founding: 'The landlord is a trust; provide the deed and relevant amendments.',
    trust_authority: 'The landlord is a trust; establish the current trustees’ authority.',
    beneficial_ownership: 'The landlord is an entity or trust; establish its ownership and control.',
    signing_authority: 'A signatory acts for the entity or trust on this property.',
    co_owner_authority: 'Multiple owners must establish authority for this letting arrangement.',
    property_disclosure: 'This property needs its own completed and signed prescribed disclosure.',
    right_to_let: 'Establish the landlord’s ownership or other right to let this property.',
    signed_mandate: 'Provide the signed letting or management mandate for this property.',
    payout_account: 'Rental management includes paying proceeds to the nominated beneficiary.',
    third_party_payee_authority: 'Rental proceeds will be paid to someone other than the landlord; establish that person’s authority.',
    management_information: 'Rental management needs billing responsibility, service and meter information.',
    scheme_rules: 'This property is in a sectional-title, body corporate or homeowners association scheme.',
    existing_tenancy_pack: 'Taking over management of a tenanted property needs its current lease, deposit ledger, payment history and inspection records.',
  }[row.purpose] || ''
}
