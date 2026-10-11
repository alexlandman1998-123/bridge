// A data contract, not an authorisation check. Server membership, field scope,
// review and revision checks must still run on every write.
export const SELLER_DATA_OWNERSHIP_VERSION = 'seller_data_ownership_v1'

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

export const SELLER_RECORD_OWNERSHIP = freeze({
  contacts: { role: 'crm_identity', identity: 'contact_id', scope: 'organisation_id' },
  leads: { role: 'acquisition', identity: 'lead_id', scope: 'organisation_id' },
  agency_client_profiles: { role: 'identity_index', identity: 'id', scope: 'organisation_id' },
  agency_client_identifiers: { role: 'identity_alias', identity: 'id', scope: 'organisation_id' },
  agency_client_links: { role: 'source_link', identity: 'id', scope: 'organisation_id' },
  private_listing_seller_onboarding: { role: 'current_seller_facts', identity: 'id', parent: 'private_listing_id', capture: 'form_data', derivedFacts: 'canonical_facts_json' },
  private_listings: { role: 'property_operations', identity: 'id', scope: 'organisation_id' },
  transactions: { role: 'deal_decisions', identity: 'id', parent: 'listing_id', scope: 'organisation_id' },
  onboarding_form_data: { role: 'transaction_capture_and_projection', parent: 'transaction_id' },
  transaction_participants: { role: 'person_role_and_access', identity: 'id', parent: 'transaction_id' },
  client_portal_contexts: { role: 'access_context', identity: 'id', parent: 'transaction_id' },
  private_listing_documents: { role: 'document_evidence', identity: 'id', parent: 'private_listing_id' },
  document_packets: { role: 'document_evidence', identity: 'id' },
  document_packet_versions: { role: 'versioned_evidence', identity: 'id' },
  documents: { role: 'transaction_document_evidence', identity: 'id', parent: 'transaction_id' },
})

export const SELLER_PERSON_COLLECTIONS = freeze([
  { form: 'multipleOwners', aliases: ['owners'], canonical: 'seller.owners', role: 'legal_owner' },
  { form: 'companyDirectors', aliases: ['directors'], canonical: 'seller.company.directors', role: 'director', rolesByProfile: { close_corporation: 'member' } },
  { form: 'companyBeneficialOwners', aliases: [], canonical: 'seller.company.beneficial_owners', role: 'beneficial_owner' },
  { form: 'trustees', aliases: ['trustTrustees'], canonical: 'seller.trust.trustees', role: 'trustee' },
  { form: 'trustFounders', aliases: [], canonical: 'seller.trust.founders', role: 'founder' },
  { form: 'trustBeneficiaries', aliases: ['beneficiaries'], canonical: 'seller.trust.beneficiaries', role: 'beneficiary' },
  { form: 'executors', aliases: [], canonical: 'seller.deceased_estate.executors', role: 'executor' },
  { form: 'powerOfAttorneyRepresentatives', aliases: [], canonical: 'seller.power_of_attorney.representatives', role: 'authorised_representative' },
])

const projections = ['private_listings.seller_canonical_facts_json', 'linked_lead_profile', 'linked_transaction_current_seller', 'authorised_seller_portal']
const rows = []
function field(key, canonicalPaths, formFields, sensitivity = 'legal_identity', scope = 'listing_seller', authority = 'private_listing_seller_onboarding') {
  const identityReference = scope === 'listing_person' && canonicalPaths.some(path => path.endsWith('[].id'))
  rows.push({
    key, canonicalPaths, formFields, sensitivity, scope, authority,
    revision: authority === 'private_listing_seller_onboarding' ? 'displayed_onboarding_id_and_updated_at' : 'displayed_record_revision',
    editors: identityReference ? ['system_or_reviewed_identity_link_assignment'] : authority === 'private_listing_seller_onboarding'
      ? ['scoped_staff', 'authorised_seller_draft_capture_or_change_request'] : ['scoped_staff'],
    review: identityReference ? 'explicit_identity_link_review' : sensitivity === 'general' ? 'version_checked_contact_change_or_existing_change_request_review'
      : ['financial', 'compliance'].includes(sensitivity) ? 'scoped_financial_or_compliance_review' : 'scoped_identity_or_authority_review',
    empty: { omitted: 'unchanged', explicit: identityReference ? 'reject_identity_removal' : 'clear_current_value_subject_to_validation_and_review', false: 'value' },
    projections: authority === 'private_listing_seller_onboarding' ? projections : [],
    history: 'preserve_signed_evidence_and_deal_decisions',
    crmSync: 'only_with_an_explicit_same_person_or_entity_link',
    ...(authority === 'private_listings' ? {
      authorityBoundary: 'operational_listing_after_mandate_signed',
      beforeConversion: 'seller_capture_can_prefill_missing_listing_fields_only',
    } : {}),
  })
}

for (const [key, canonical, aliases, sensitivity] of [
  ['legal_type', 'seller.legal_type', ['sellerLegalType', 'seller_legal_type', 'legalType', 'sellerType'], 'ownership'],
  ['owner_entity_type', 'seller.owner_entity_type', ['ownerEntityType', 'owner_entity_type'], 'ownership'],
  ['owner_structure_type', 'seller.owner_structure_type', ['ownerStructureType', 'owner_structure_type', 'ownershipType', 'ownership_type', 'branch'], 'ownership'],
  ['legal_name', 'seller.name', ['fullName', 'sellerName']],
  ['first_name', 'seller.first_name', ['sellerFirstName', 'firstName']],
  ['surname', 'seller.surname', ['sellerSurname', 'lastName']],
  ['contact_name', 'seller.contact.name', ['primaryContactName', 'contactName']],
  ['contact_email', 'seller.contact.email', ['email', 'sellerEmail'], 'general'],
  ['contact_phone', 'seller.contact.phone', ['phone', 'sellerPhone', 'mobile'], 'general'],
  ['alternative_number', 'seller.alternative_number', ['alternativeNumber', 'alternative_number', 'alternatePhone', 'alternate_phone'], 'general'],
  ['alternative_contact', 'seller.alternative_contact', ['alternativeContact'], 'general'],
  ['preferred_contact', 'seller.preferred_contact_method', ['preferredContactMethod'], 'general'],
  ['id_number', 'seller.id_number', ['idNumber', 'id_number', 'sellerIdNumber']],
  ['date_of_birth', 'seller.date_of_birth', ['dateOfBirth', 'date_of_birth', 'birthDate']],
  ['nationality', 'seller.nationality', ['nationality']],
  ['residential_address', 'seller.residential_address', ['residentialAddress', 'residential_address', 'residentialStreet', 'sellerResidentialAddress', 'physicalAddress', 'domiciliumAddress', 'domicilium_address']],
  ['tax_number', 'seller.tax_number', ['sellerTaxNumber', 'incomeTaxNumber', 'income_tax_number', 'taxNumber', 'tax_number'], 'financial'],
  ['tax_resident', 'seller.tax_resident', ['taxResident', 'tax_resident'], 'financial'],
  ['sa_resident', 'seller.sa_resident', ['saResident', 'sa_resident']],
  ['vat_registered', 'seller.vat_registered', ['vatRegistered'], 'financial'],
  ['vat_number', 'seller.vat_number', ['vatNumber'], 'financial'],
  ['occupation', 'seller.occupation', ['occupation'], 'compliance'],
  ['source_of_funds', 'seller.source_of_funds', ['sourceOfFunds', 'source_of_funds'], 'compliance'],
  ['pep', 'seller.politically_exposed_person', ['politicallyExposedPerson', 'politically_exposed_person'], 'compliance'],
  ['pep_details', 'seller.politically_exposed_details', ['politicallyExposedDetails', 'politically_exposed_details'], 'compliance'],
  ['marital_status', 'seller.marital_status', ['maritalStatus'], 'ownership'],
  ['marital_regime', 'seller.marital_regime', ['maritalRegime'], 'ownership'],
  ['spouse_involved', 'seller.spouse_involved', ['spouseConsentRequired', 'spouseInvolved'], 'authority'],
  ['ownership_confirmed', 'seller.ownership_confirmed', ['sellerOwnershipConfirmed', 'seller_ownership_confirmed'], 'ownership'],
  ['foreign_country', 'seller.foreign.country', ['foreignOwnerCountry', 'foreign_owner_country']],
  ['foreign_passport', 'seller.foreign.passport_number', ['foreignPassportNumber', 'passportNumber']],
  ['foreign_registration', 'seller.foreign.registration_number', ['foreignRegistrationNumber', 'foreign_registration_number']],
  ['foreign_residency', 'seller.foreign.residency_status', ['foreignResidencyStatus', 'foreign_residency_status', 'residencyStatus']],
  ['popi_consent', 'seller.popi_consent_accepted', ['popiConsent', 'popiConsentAccepted'], 'compliance'],
  ['popi_consent_time', 'seller.popi_consent_accepted_at', ['popiConsentAcceptedAt'], 'compliance'],
]) field(key, [canonical], aliases, sensitivity)

for (const [entity, prefix] of [['company', 'company'], ['trust', 'trust'], ['other_entity', 'otherEntity']]) {
  field(`${entity}_name`, [`seller.${entity}.name`], [`${prefix}Name`])
  field(`${entity}_registration`, [`seller.${entity}.registration_number`], [`${prefix}RegistrationNumber`])
  if (entity !== 'other_entity') field(`${entity}_address`, [`seller.${entity}.registered_address`], [`${prefix}RegisteredAddress`])
}
for (const [key, canonical, aliases, sensitivity] of [
  ['company_authority', 'seller.company.authority_basis', ['companyAuthorityBasis', 'company_authority_basis'], 'authority'],
  ['company_resolution', 'seller.company.resolution_date', ['companyResolutionDate', 'company_resolution_date'], 'authority'],
  ['trust_authority', 'seller.trust.authority_basis', ['trustAuthorityBasis', 'trust_authority_basis'], 'authority'],
  ['beneficiary_class', 'seller.trust.beneficiary_class', ['trustBeneficiaryClass'], 'ownership'],
  ['estate_name', 'seller.deceased_estate.name', ['deceasedEstateName']],
  ['estate_reference', 'seller.deceased_estate.estate_reference', ['estateReferenceNumber', 'estateReference']],
  ['estate_authority', 'seller.deceased_estate.authority_details', ['executorAuthorityDetails'], 'authority'],
  ['poa_authority', 'seller.power_of_attorney.authority_details', ['powerOfAttorneyAuthorityDetails', 'powerOfAttorneyReference'], 'authority'],
  ['poa_principal_name', 'seller.power_of_attorney.principal.name', ['powerOfAttorneyPrincipalName', 'principalName']],
  ['poa_principal_identity', 'seller.power_of_attorney.principal.id_number', ['powerOfAttorneyPrincipalIdNumber', 'principalIdNumber']],
  ['other_authority', 'seller.other_entity.authority_details', ['otherAuthorityDetails'], 'authority'],
]) field(key, [canonical], aliases, sensitivity)

const personFields = [
  ['id', ['id'], 'authority'], ['full_name', ['name', 'fullName', 'full_name'], 'legal_identity'],
  ['first_name', ['firstName', 'first_name'], 'legal_identity'], ['surname', ['surname', 'lastName', 'last_name'], 'legal_identity'],
  ['id_number', ['idNumber', 'id_number', 'identityNumber', 'passportNumber'], 'legal_identity'],
  ['email', ['email'], 'general'], ['phone', ['phone'], 'general'],
  ['nationality', ['nationality', 'citizenship'], 'legal_identity'],
  ['residential_address', ['residentialAddress', 'residential_address', 'address'], 'legal_identity'],
  ['date_of_birth', ['dateOfBirth', 'date_of_birth'], 'legal_identity'], ['tax_number', ['taxNumber', 'tax_number'], 'financial'],
  ['ownership_share', ['ownershipShare', 'ownership_share'], 'ownership'],
  ['consent_to_sell', ['consentToSell', 'consent_to_sell'], 'authority'],
  ['signing_authority', ['signingAuthority', 'signing_authority'], 'authority'],
  ['authority_details', ['authorityDetails', 'authority_details', 'controlBasis', 'control_basis'], 'authority'],
  ['capacity', ['capacity', 'roleCapacity'], 'authority'], ['role_title', ['roleTitle', 'role_title'], 'authority'],
]
for (const collection of SELLER_PERSON_COLLECTIONS) {
  const names = [collection.form, ...collection.aliases]
  field(`${collection.form}_roster`, [collection.canonical], names, 'ownership', 'listing_person_roster')
  for (const [canonical, aliases, sensitivity] of personFields) {
    const scalarAliases = canonical === 'id_number' ? {
      executors: ['executorIdNumber'], powerOfAttorneyRepresentatives: ['powerOfAttorneyIdNumber'],
    }[collection.form] || [] : []
    field(`${collection.form}_${canonical}`, [`${collection.canonical}[].${canonical}`, ...(canonical === 'full_name' ? [`${collection.canonical}[].name`] : [])], [...names.flatMap(name => aliases.map(alias => `${name}[].${alias}`)), ...scalarAliases], sensitivity, 'listing_person')
  }
}
for (const [prefix, canonical] of [
  ['spouse', 'seller.spouse'], ['authorisedSignatory', 'seller.company.authorised_signatory'],
  ['authorisedTrustee', 'seller.trust.authorised_trustee'],
]) {
  for (const [suffix, leaf, sensitivity] of [
    ['Name', 'name', 'legal_identity'], ['IdNumber', 'id_number', 'legal_identity'],
    ['Email', 'email', 'general'], ['Phone', 'phone', 'general'], ['Nationality', 'nationality', 'legal_identity'],
    ['Address', 'residential_address', 'legal_identity'], ['Capacity', 'capacity', 'authority'],
  ]) field(`${prefix}_${leaf}`, [`${canonical}.${leaf}`, ...(leaf === 'name' && prefix !== 'spouse' ? [`${canonical}.full_name`] : [])], [`${prefix}${suffix}`], sensitivity, 'listing_person')
}
for (const [prefix, canonical] of [
  ['companyDirector', 'seller.company.director'], ['trustee', 'seller.trust.trustee'],
  ['executor', 'seller.deceased_estate.executor'], ['powerOfAttorney', 'seller.power_of_attorney.representative'],
]) {
  for (const [suffix, leaf, sensitivity] of [['Name', 'name', 'legal_identity'], ['Email', 'email', 'general'], ['Phone', 'phone', 'general']]) {
    field(`${prefix}_${leaf}`, [`${canonical}_${leaf}`], [`${prefix}${suffix}`], sensitivity, 'listing_person')
  }
}
field('bond_declaration', ['finance.existing_bond', 'seller.existing_bond'], ['existingBond', 'hasExistingBond', 'bondStatus'], 'financial')
field('bond_bank', ['finance.bond_bank'], ['bondBank', 'currentBondBank', 'bondHolder'], 'financial')
field('bond_reference', ['finance.bond_account_reference'], ['bondAccountReference', 'currentBondAccountNumber'], 'financial')
for (const [key, canonical, aliases] of [
  ['bond_settlement', 'finance.estimated_settlement_amount', ['estimatedSettlementAmount', 'outstandingBond']],
  ['multiple_bonds', 'finance.multiple_bonds', ['multipleBonds']],
  ['access_bond', 'finance.access_bond', ['accessBond']],
  ['cancellation_declaration', 'finance.cancellation_required', ['cancellationRequired']],
]) field(key, [canonical], aliases, 'financial')
field('property_address', ['property.address'], ['propertyAddress', 'addressLine1'], 'ownership', 'property', 'private_listings')
field('property_type', ['property.property_type'], ['propertyType'], 'ownership', 'property', 'private_listings')
for (const [key, canonical, aliases, sensitivity] of [
  ['property_category', 'property.property_category', ['propertyCategory'], 'ownership'],
  ['property_title_type', 'property.property_structure_type', ['propertyStructureType', 'ownershipScheme', 'ownership_scheme'], 'ownership'],
  ['scheme_name', 'property.scheme.name', ['schemeName', 'estateComplexName'], 'ownership'],
  ['scheme_section', 'property.section_number', ['sectionNumber'], 'ownership'],
  ['scheme_unit', 'property.unit_number', ['unitNumber'], 'ownership'],
  ['scheme_agent_name', 'property.scheme.managing_agent.name', ['schemeManagingAgentName'], 'legal_identity'],
  ['scheme_agent_email', 'property.scheme.managing_agent.email', ['schemeManagingAgentEmail'], 'general'],
  ['scheme_agent_phone', 'property.scheme.managing_agent.phone', ['schemeManagingAgentPhone'], 'general'],
  ['scheme_levies', 'property.scheme.levies', ['schemeLevies'], 'financial'],
  ['scheme_rules', 'property.scheme.rules', ['schemeRulesAvailable'], 'ownership'],
]) field(key, [canonical], aliases, sensitivity, 'property_capture')
field('property_title', ['property.title_deed_number'], ['titleDeedNumber'], 'ownership')
field('property_ownership_basis', ['property.ownership_basis'], ['ownershipBasis'], 'ownership')
field('asking_price', ['transaction.asking_price'], ['askingPrice', 'price'], 'financial', 'property', 'private_listings')

export const SELLER_DATA_FIELDS = freeze(rows)
// Names here are canonical profile paths, not paths into every historical shape.
const pathAliases = freeze({
  'seller.primary_contact.name': 'seller.contact.name', 'seller.primary_contact.email': 'seller.contact.email',
  'seller.primary_contact.phone': 'seller.contact.phone', 'seller.email': 'seller.contact.email',
  'seller.phone': 'seller.contact.phone',
  'seller.profile_type': 'seller.owner_structure_type',
})
const normalisePath = value => String(value ?? '').trim().replace(/\[\d+\]/g, '[]').replace(/\.\d+(?=\.|$)/g, '[]')

export function getSellerFieldOwnership(path, { source = 'form' } = {}) {
  if (!['form', 'canonical'].includes(source)) throw new Error('Seller field source must be form or canonical.')
  const normalized = normalisePath(path)
  const selected = source === 'canonical' ? pathAliases[normalized] || normalized : normalized
  return SELLER_DATA_FIELDS.find(row => (source === 'canonical' ? row.canonicalPaths : row.formFields).includes(selected)) || null
}

export function sellerPersonSourceKey(onboardingId, personId) {
  const source = String(onboardingId ?? '').trim()
  const person = String(personId ?? '').trim()
  // JSON tuples avoid collisions when legacy source ids contain delimiters.
  return source && person ? JSON.stringify(['private_listing_seller_onboarding', source, person]) : ''
}
