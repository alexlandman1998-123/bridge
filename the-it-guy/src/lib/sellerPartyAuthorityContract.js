export const SELLER_PARTY_AUTHORITY_CONTRACT_VERSION = 'seller_party_authority_contract_v1'

export const SELLER_PARTY_ROLES = Object.freeze({
  legalOwner: 'legal_owner',
  primaryContact: 'primary_contact',
  authorisedRepresentative: 'authorised_representative',
  mandateSignatory: 'mandate_signatory',
  spouse: 'spouse',
  director: 'director',
  member: 'member',
  trustee: 'trustee',
  executor: 'executor',
  attorney: 'attorney',
  beneficialOwner: 'beneficial_owner',
})

export const SELLER_COMPLETION_DIMENSIONS = Object.freeze([
  Object.freeze({ key: 'profile', label: 'Seller profile', blockingFacts: Object.freeze(['seller.profile_type']) }),
  Object.freeze({ key: 'authority', label: 'Signing authority', blockingFacts: Object.freeze(['seller.signing_authority']) }),
  Object.freeze({ key: 'compliance', label: 'Documents and compliance', blockingFacts: Object.freeze([]) }),
  Object.freeze({ key: 'onboarding', label: 'Seller onboarding', blockingFacts: Object.freeze([]) }),
  Object.freeze({ key: 'mandate', label: 'Mandate', blockingFacts: Object.freeze([]) }),
])

const COMMON_FIELD_GROUPS = Object.freeze({
  primaryContact: Object.freeze([
    'seller.primary_contact.name',
    'seller.primary_contact.email',
    'seller.primary_contact.phone',
  ]),
  propertyOwnership: Object.freeze([
    'property.address',
    'property.ownership_basis',
    'property.title_deed_number',
    'property.bond_status',
  ]),
})

function contract({
  label,
  legalEntityType,
  ownershipStructure,
  partyRoles,
  signatoryPolicy,
  identityFields,
  authorityFields = [],
  optionalFields = [],
  conditionalFieldGroups = {},
  includeCommonFields = true,
}) {
  const requiredFields = [
    ...identityFields,
    ...(includeCommonFields ? COMMON_FIELD_GROUPS.primaryContact : []),
    ...(includeCommonFields ? ['property.address'] : []),
    ...authorityFields,
  ]
  return Object.freeze({
    label,
    legalEntityType,
    ownershipStructure,
    partyRoles: Object.freeze(partyRoles),
    signatoryPolicy: Object.freeze(signatoryPolicy),
    fieldGroups: Object.freeze({
      identity: Object.freeze(identityFields),
      primaryContact: COMMON_FIELD_GROUPS.primaryContact,
      authority: Object.freeze(authorityFields),
      propertyOwnership: COMMON_FIELD_GROUPS.propertyOwnership,
    }),
    fieldRules: Object.freeze({
      required: Object.freeze([...new Set(requiredFields)]),
      optional: Object.freeze([...new Set([
        ...(includeCommonFields ? ['property.ownership_basis', 'property.title_deed_number', 'property.bond_status'] : []),
        ...optionalFields,
      ])]),
      conditional: Object.freeze(Object.keys(conditionalFieldGroups)),
    }),
    conditionalFieldGroups: Object.freeze(
      Object.fromEntries(Object.entries(conditionalFieldGroups).map(([key, fields]) => [key, Object.freeze(fields)])),
    ),
  })
}

const REPRESENTATIVE_POLICY = Object.freeze({
  mode: 'confirmed_representative',
  requiresAuthorityEvidence: true,
  automaticSigners: false,
})

export const SELLER_PROFILE_AUTHORITY_MATRIX = Object.freeze({
  unknown: contract({
    label: 'Not identified yet',
    legalEntityType: 'unknown',
    ownershipStructure: 'unknown',
    partyRoles: [],
    signatoryPolicy: { mode: 'blocked', requiresAuthorityEvidence: true, automaticSigners: false },
    identityFields: ['seller.profile_type'],
    includeCommonFields: false,
  }),
  individual: contract({
    label: 'Individual',
    legalEntityType: 'individual',
    ownershipStructure: 'individual',
    partyRoles: [SELLER_PARTY_ROLES.legalOwner, SELLER_PARTY_ROLES.primaryContact, SELLER_PARTY_ROLES.mandateSignatory],
    signatoryPolicy: { mode: 'all_legal_owners', requiresAuthorityEvidence: false, automaticSigners: true },
    identityFields: ['seller.first_name', 'seller.surname', 'seller.id_number', 'seller.marital_status'],
    conditionalFieldGroups: {
      married: ['seller.marital_regime', 'seller.spouse'],
      bonded: ['property.bond_holder', 'property.outstanding_bond'],
    },
  }),
  married: contract({
    label: 'Married individual',
    legalEntityType: 'individual',
    ownershipStructure: 'married',
    partyRoles: [SELLER_PARTY_ROLES.legalOwner, SELLER_PARTY_ROLES.primaryContact, SELLER_PARTY_ROLES.spouse, SELLER_PARTY_ROLES.mandateSignatory],
    signatoryPolicy: { mode: 'owner_plus_conditional_spouse', requiresAuthorityEvidence: false, automaticSigners: false },
    identityFields: ['seller.first_name', 'seller.surname', 'seller.id_number', 'seller.marital_status', 'seller.marital_regime'],
    authorityFields: ['seller.spouse.consent_required'],
    conditionalFieldGroups: { spouse: ['seller.spouse.name', 'seller.spouse.id_number', 'seller.spouse.email', 'seller.spouse.phone'] },
  }),
  multiple_owners: contract({
    label: 'Multiple owners',
    legalEntityType: 'individual',
    ownershipStructure: 'multiple_owners',
    partyRoles: [SELLER_PARTY_ROLES.legalOwner, SELLER_PARTY_ROLES.primaryContact, SELLER_PARTY_ROLES.mandateSignatory],
    signatoryPolicy: { mode: 'all_owners_unless_delegated', requiresAuthorityEvidence: true, automaticSigners: false },
    identityFields: ['seller.owners[]'],
    authorityFields: ['seller.owners[].consent_to_sell'],
    optionalFields: ['seller.owners[].phone', 'seller.owners[].ownership_share', 'seller.owners[].signing_authority'],
  }),
  company: contract({
    label: 'Company',
    legalEntityType: 'company',
    ownershipStructure: 'company',
    partyRoles: [SELLER_PARTY_ROLES.primaryContact, SELLER_PARTY_ROLES.director, SELLER_PARTY_ROLES.authorisedRepresentative, SELLER_PARTY_ROLES.mandateSignatory, SELLER_PARTY_ROLES.beneficialOwner],
    signatoryPolicy: REPRESENTATIVE_POLICY,
    identityFields: ['seller.company.name', 'seller.company.registration_number', 'seller.company.registered_address'],
    authorityFields: ['seller.company.authorised_signatory', 'seller.company.authority_basis', 'seller.company.resolution_date'],
    optionalFields: ['seller.company.directors', 'seller.company.beneficial_owners'],
  }),
  close_corporation: contract({
    label: 'Close corporation',
    legalEntityType: 'close_corporation',
    ownershipStructure: 'close_corporation',
    partyRoles: [SELLER_PARTY_ROLES.primaryContact, SELLER_PARTY_ROLES.member, SELLER_PARTY_ROLES.authorisedRepresentative, SELLER_PARTY_ROLES.mandateSignatory, SELLER_PARTY_ROLES.beneficialOwner],
    signatoryPolicy: REPRESENTATIVE_POLICY,
    identityFields: ['seller.company.name', 'seller.company.registration_number', 'seller.company.registered_address'],
    authorityFields: ['seller.company.authorised_signatory', 'seller.company.authority_basis', 'seller.company.resolution_date'],
    optionalFields: ['seller.company.members', 'seller.company.beneficial_owners'],
  }),
  trust: contract({
    label: 'Trust',
    legalEntityType: 'trust',
    ownershipStructure: 'trust',
    partyRoles: [SELLER_PARTY_ROLES.primaryContact, SELLER_PARTY_ROLES.trustee, SELLER_PARTY_ROLES.authorisedRepresentative, SELLER_PARTY_ROLES.mandateSignatory, SELLER_PARTY_ROLES.beneficialOwner],
    signatoryPolicy: { mode: 'confirmed_trustees', requiresAuthorityEvidence: true, automaticSigners: false },
    identityFields: ['seller.trust.name', 'seller.trust.registration_number', 'seller.trust.registered_address'],
    authorityFields: ['seller.trust.authorised_trustee', 'seller.trust.authority_basis'],
    optionalFields: ['seller.trust.trustees', 'seller.trust.beneficiaries'],
  }),
  deceased_estate: contract({
    label: 'Deceased estate',
    legalEntityType: 'deceased_estate',
    ownershipStructure: 'deceased_estate',
    partyRoles: [SELLER_PARTY_ROLES.primaryContact, SELLER_PARTY_ROLES.executor, SELLER_PARTY_ROLES.authorisedRepresentative, SELLER_PARTY_ROLES.mandateSignatory],
    signatoryPolicy: { mode: 'confirmed_executor', requiresAuthorityEvidence: true, automaticSigners: false },
    identityFields: ['seller.deceased_estate.name', 'seller.deceased_estate.estate_reference'],
    authorityFields: ['seller.deceased_estate.executor', 'seller.deceased_estate.authority_details'],
  }),
  power_of_attorney: contract({
    label: 'Power of attorney',
    legalEntityType: 'individual',
    ownershipStructure: 'power_of_attorney',
    partyRoles: [SELLER_PARTY_ROLES.legalOwner, SELLER_PARTY_ROLES.primaryContact, SELLER_PARTY_ROLES.attorney, SELLER_PARTY_ROLES.authorisedRepresentative, SELLER_PARTY_ROLES.mandateSignatory],
    signatoryPolicy: { mode: 'confirmed_attorney', requiresAuthorityEvidence: true, automaticSigners: false },
    identityFields: ['seller.power_of_attorney.principal'],
    authorityFields: ['seller.power_of_attorney.representative', 'seller.power_of_attorney.authority_details'],
  }),
  other: contract({
    label: 'Other legal entity',
    legalEntityType: 'other',
    ownershipStructure: 'other',
    partyRoles: [SELLER_PARTY_ROLES.primaryContact, SELLER_PARTY_ROLES.authorisedRepresentative, SELLER_PARTY_ROLES.mandateSignatory],
    signatoryPolicy: { mode: 'manual_authority_review', requiresAuthorityEvidence: true, automaticSigners: false },
    identityFields: ['seller.other_entity.name', 'seller.other_entity.registration_number', 'seller.ownership_description'],
    authorityFields: ['seller.authority_basis', 'seller.authorised_representative'],
  }),
})

const PROFILE_ALIASES = Object.freeze({
  '': 'unknown', unknown: 'unknown', not_identified: 'unknown', not_captured: 'unknown',
  natural_person: 'individual', single: 'individual', sole_owner: 'individual', individual: 'individual',
  married: 'married', married_cop: 'married', married_anc: 'married', married_in_community: 'married', married_out_of_community: 'married',
  multiple: 'multiple_owners', multiple_individuals: 'multiple_owners', joint: 'multiple_owners', co_owners: 'multiple_owners', multiple_owners: 'multiple_owners',
  company: 'company', pty: 'company', pty_ltd: 'company', corporate: 'company',
  close_corporation: 'close_corporation', cc: 'close_corporation',
  trust: 'trust', family_trust: 'trust',
  deceased: 'deceased_estate', estate: 'deceased_estate', deceased_estate: 'deceased_estate',
  poa: 'power_of_attorney', attorney: 'power_of_attorney', power_of_attorney: 'power_of_attorney',
  other: 'other', developer: 'other', other_entity: 'other', other_legal_entity: 'other',
  foreign: 'foreign_individual', foreign_owner: 'foreign_individual', non_resident: 'foreign_individual', foreign_individual: 'foreign_individual',
  foreign_company: 'foreign_company', foreign_trust: 'foreign_trust',
})

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

export function normalizeSellerProfileType(value, fallback = 'unknown') {
  return PROFILE_ALIASES[normalizeKey(value)] || fallback
}

export function getSellerProfileAuthorityContract(value) {
  const profileType = normalizeSellerProfileType(value)
  const foreign = profileType.startsWith('foreign_')
  const baseType = profileType === 'foreign_company'
    ? 'company'
    : profileType === 'foreign_trust'
      ? 'trust'
      : profileType === 'foreign_individual'
        ? 'individual'
        : profileType
  const base = SELLER_PROFILE_AUTHORITY_MATRIX[baseType] || SELLER_PROFILE_AUTHORITY_MATRIX.unknown
  return Object.freeze({
    ...base,
    profileType,
    legalEntityType: profileType === 'foreign_company'
      ? 'company'
      : profileType === 'foreign_trust'
        ? 'trust'
        : base.legalEntityType,
    ownershipStructure: profileType,
    foreign,
    fieldRules: Object.freeze({
      ...base.fieldRules,
      conditional: Object.freeze([...new Set([
        ...base.fieldRules.conditional,
        ...(foreign ? ['foreign'] : []),
      ])]),
    }),
    conditionalFieldGroups: Object.freeze({
      ...base.conditionalFieldGroups,
      ...(foreign ? { foreign: Object.freeze(['seller.foreign.country', 'seller.foreign.registration_number', 'seller.foreign.passport_number', 'seller.foreign.residency_status']) } : {}),
    }),
  })
}

export function resolveListingSellerAuthorityContract(listing = {}, formData = null) {
  const facts = listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {}
  const sellerFacts = facts?.seller && typeof facts.seller === 'object' ? facts.seller : {}
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  const form = formData || onboarding?.formData || onboarding?.form_data || listing?.sellerOnboardingFormData || listing?.seller_onboarding_form_data || {}
  const captureSource = normalizeKey(firstValue(form.sellerProfileCaptureSource, form.seller_profile_capture_source, sellerFacts.seller_profile_capture_source))
  const ownershipConfirmed = Boolean(
    form.sellerOwnershipConfirmed ||
    form.seller_ownership_confirmed ||
    sellerFacts.ownership_confirmed ||
    sellerFacts.profile_confirmed_at,
  )
  const canonicalModel = firstValue(
    sellerFacts.owner_structure_type,
    sellerFacts.ownerStructureType,
    sellerFacts.owner_entity_type,
    sellerFacts.ownerEntityType,
    sellerFacts.legal_type,
    sellerFacts.branch,
  )
  const formModel = firstValue(
    form.ownerStructureType,
    form.owner_structure_type,
    form.sellerLegalType,
    form.seller_legal_type,
    form.ownershipType,
    form.ownership_type,
    form.sellerType,
  )
  const listingModel = firstValue(listing?.sellerType, listing?.seller_type, listing?.ownershipType, listing?.ownership_structure)
  const rawModel = firstValue(canonicalModel, formModel, listingModel)
  let profileType = normalizeSellerProfileType(rawModel)

  const ownerEntityType = normalizeKey(firstValue(form.ownerEntityType, form.owner_entity_type, sellerFacts.owner_entity_type, sellerFacts.ownerEntityType))
  const ownerStructureType = normalizeKey(firstValue(form.ownerStructureType, form.owner_structure_type, sellerFacts.owner_structure_type, sellerFacts.ownerStructureType, rawModel))
  if (ownerEntityType === 'foreign') {
    profileType = ownerStructureType.includes('company')
      ? 'foreign_company'
      : ownerStructureType.includes('trust')
        ? 'foreign_trust'
        : 'foreign_individual'
  }

  const isLegacyIndividualDefault = profileType === 'individual' && !canonicalModel && !formModel && !ownershipConfirmed && captureSource !== 'listing_seller_profile_capture'
  const identified = profileType !== 'unknown' && !isLegacyIndividualDefault
  const resolvedProfileType = identified ? profileType : 'unknown'
  const definition = getSellerProfileAuthorityContract(resolvedProfileType)

  return Object.freeze({
    version: SELLER_PARTY_AUTHORITY_CONTRACT_VERSION,
    identified,
    profileType: resolvedProfileType,
    legalEntityType: definition.legalEntityType,
    ownershipStructure: definition.ownershipStructure,
    partyRoles: definition.partyRoles,
    signatoryPolicy: definition.signatoryPolicy,
    fieldGroups: definition.fieldGroups,
    fieldRules: definition.fieldRules,
    conditionalFieldGroups: definition.conditionalFieldGroups,
    completionDimensions: SELLER_COMPLETION_DIMENSIONS,
    source: canonicalModel ? 'canonical_facts' : formModel ? 'onboarding_form' : ownershipConfirmed ? 'confirmed_listing' : identified ? 'listing' : 'unidentified',
    reason: identified ? '' : isLegacyIndividualDefault ? 'legacy_individual_default_is_not_confirmation' : 'seller_ownership_not_identified',
  })
}

export function isSellerAuthorityContractIdentified(value) {
  if (value && typeof value === 'object' && 'identified' in value) return Boolean(value.identified)
  return getSellerProfileAuthorityContract(value).profileType !== 'unknown'
}

export default {
  SELLER_COMPLETION_DIMENSIONS,
  SELLER_PARTY_AUTHORITY_CONTRACT_VERSION,
  SELLER_PARTY_ROLES,
  SELLER_PROFILE_AUTHORITY_MATRIX,
  getSellerProfileAuthorityContract,
  isSellerAuthorityContractIdentified,
  normalizeSellerProfileType,
  resolveListingSellerAuthorityContract,
}
