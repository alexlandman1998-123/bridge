export const SELLER_SUBJECT_MODEL_VERSION = 'seller_subject_phase1_v1'

const SUBJECT_KINDS = new Set([
  'individual',
  'married',
  'multiple_owners',
  'company',
  'trust',
  'deceased_estate',
  'power_of_attorney',
  'foreign_individual',
  'foreign_company',
  'foreign_trust',
  'other',
  'unknown',
])

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function isAffirmative(value) {
  return value === true || ['true', 'yes', '1'].includes(text(value).toLowerCase())
}

function fullName(source = {}) {
  const value = record(source)
  return firstText(
    value.fullName,
    value.full_name,
    value.contactName,
    value.contact_name,
    [value.sellerFirstName || value.firstName || value.first_name || value.name, value.sellerSurname || value.lastName || value.last_name || value.surname].filter(Boolean).join(' '),
    value.name,
  )
}

function person(source = {}, role = '') {
  const value = record(source)
  const name = fullName(value)
  if (!name && !text(value.email) && !text(value.phone) && !text(value.idNumber || value.id_number)) return null
  return {
    name,
    email: text(value.email).toLowerCase(),
    phone: firstText(value.phone, value.mobile, value.contactNumber, value.contact_number),
    idNumber: firstText(value.idNumber, value.id_number, value.identityNumber, value.identity_number, value.passportNumber, value.passport_number),
    role,
    authority: Boolean(value.signingAuthority ?? value.signing_authority),
  }
}

function people(values = [], role = '') {
  return (Array.isArray(values) ? values : []).map((value) => person(value, role)).filter(Boolean)
}

function subjectKind({ entityType = '', structureType = '', ownershipType = '' } = {}) {
  const entity = key(entityType)
  const structure = key(structureType)
  const ownership = key(ownershipType)
  const candidate = structure || ownership
  if (entity === 'foreign' && ['company', 'foreign_company'].includes(candidate)) return 'foreign_company'
  if (entity === 'foreign' && ['trust', 'foreign_trust'].includes(candidate)) return 'foreign_trust'
  if (entity === 'foreign' || candidate === 'foreign_individual') return 'foreign_individual'
  if (['company', 'close_corporation', 'cc'].includes(entity) || ['company', 'close_corporation', 'cc'].includes(candidate)) return 'company'
  if (entity === 'trust' || candidate === 'trust') return 'trust'
  if (candidate === 'multiple_owners') return 'multiple_owners'
  if (candidate === 'deceased_estate') return 'deceased_estate'
  if (candidate === 'power_of_attorney') return 'power_of_attorney'
  if (['married', 'married_cop', 'married_anc', 'married_in_community', 'married_out_of_community'].includes(candidate)) return 'married'
  if (entity === 'other' || candidate === 'other') return 'other'
  if (entity === 'natural_person' && candidate === 'individual') return 'individual'
  if (candidate === 'individual') return 'individual'
  return 'unknown'
}

function identityRequirement(kind) {
  if (['company', 'foreign_company'].includes(kind)) return { label: 'Company registration number', field: 'company_registration_number' }
  if (['trust', 'foreign_trust'].includes(kind)) return { label: 'Trust registration number', field: 'trust_registration_number' }
  if (kind === 'deceased_estate') return { label: 'Estate reference', field: 'estate_reference' }
  if (kind === 'power_of_attorney') return { label: 'Principal ID/passport number', field: 'principal_id_number' }
  if (kind === 'other') return { label: 'Entity registration or authority reference', field: 'authority_reference' }
  if (kind === 'unknown') return null
  return { label: kind === 'foreign_individual' ? 'Passport / foreign ID number' : 'ID number / passport', field: 'id_number' }
}

function authorityRequirement(kind) {
  if (['company', 'foreign_company'].includes(kind)) return 'Company resolution and authorised signatory'
  if (['trust', 'foreign_trust'].includes(kind)) return 'Trustee authority / resolution'
  if (kind === 'deceased_estate') return 'Executor authority'
  if (kind === 'power_of_attorney') return 'Power of attorney authority'
  if (kind === 'multiple_owners' || kind === 'married') return 'All required owners must sign'
  return ''
}

/**
 * Read-only Phase 1 projection. It intentionally returns `unknown` where the
 * legal ownership route is absent; callers must not treat unknown as an individual.
 */
export function buildSellerSubject({ formData = {}, listing = {}, lead = {}, canonicalFacts = {} } = {}) {
  const listingRecord = record(listing)
  const onboarding = record(listingRecord.sellerOnboarding || listingRecord.seller_onboarding)
  const listingFacts = record(listingRecord.sellerCanonicalFacts || listingRecord.seller_canonical_facts_json)
  const providedFacts = record(canonicalFacts)
  const canonical = Object.keys(providedFacts).length ? providedFacts : listingFacts
  const sellerFacts = record(canonical.seller)
  const form = {
    ...record(lead),
    ...record(onboarding.formData || onboarding.form_data),
    ...record(formData),
    ...sellerFacts,
  }
  const entityType = firstText(sellerFacts.owner_entity_type, sellerFacts.ownerEntityType, form.ownerEntityType, form.owner_entity_type)
  const structureType = firstText(sellerFacts.owner_structure_type, sellerFacts.ownerStructureType, form.ownerStructureType, form.owner_structure_type)
  const ownershipType = firstText(sellerFacts.ownership_type, sellerFacts.ownershipType, sellerFacts.legal_type, sellerFacts.seller_legal_type, form.ownershipType, form.ownership_type, form.sellerLegalType, form.seller_legal_type)
  const inferredKind = subjectKind({ entityType, structureType, ownershipType })
  const ownershipDeclarationPending = [
    sellerFacts.ownership_declaration_pending,
    sellerFacts.ownershipDeclarationPending,
    form.ownershipDeclarationPending,
    form.ownership_declaration_pending,
  ].some(isAffirmative)
  const ownershipRouteConfirmed = [
    sellerFacts.ownership_route_confirmed,
    sellerFacts.ownershipRouteConfirmed,
    form.ownershipRouteConfirmed,
    form.ownership_route_confirmed,
    form.ownershipRouteLocked,
    form.ownership_route_locked,
  ].some(isAffirmative)
  const onboardingStatus = firstText(onboarding.status, onboarding.onboardingStatus, form.onboardingStatus, form.onboarding_status).toLowerCase()
  const onboardingSubmitted = ['submitted', 'completed', 'signed'].includes(onboardingStatus)
  // Legacy lead records frequently contain `individual` as a UI default. It
  // is not a legal-ownership fact until an agent confirms it or onboarding
  // has captured and submitted it.
  const legacyIndividualAssumption = inferredKind === 'individual' && !ownershipRouteConfirmed && !onboardingSubmitted
  const kind = ownershipDeclarationPending || legacyIndividualAssumption ? 'unknown' : inferredKind
  const company = record(form.company)
  const trust = record(form.trust)
  const deceasedEstate = record(form.deceased_estate || form.deceasedEstate)
  const powerOfAttorney = record(form.power_of_attorney || form.powerOfAttorney)
  const leadContact = person(lead, 'Primary contact')
  const formContact = person(form, 'Primary contact')
  const primaryContact = formContact || leadContact
  const ownerPeople = people(form.multipleOwners || form.multiple_owners || sellerFacts.owners, 'Owner')
  const directors = people(form.companyDirectors || form.company_directors || form.directors || company.directors, 'Director')
  const trustees = people(form.trustees || form.trust_trustees || trust.trustees, 'Trustee')
  const signatory = person({
    name: firstText(form.authorisedSignatoryName, form.authorised_signatory_name, company.authorisedSignatoryName, company.authorised_signatory_name, company.authorisedSignatory?.name, company.authorised_signatory?.name, company.authorised_signatory?.full_name),
    email: firstText(form.authorisedSignatoryEmail, form.authorised_signatory_email, company.authorisedSignatory?.email, company.authorised_signatory?.email),
    phone: firstText(form.authorisedSignatoryPhone, form.authorised_signatory_phone, company.authorisedSignatory?.phone, company.authorised_signatory?.phone),
    idNumber: firstText(form.authorisedSignatoryIdNumber, form.authorised_signatory_id_number, company.authorisedSignatory?.idNumber, company.authorised_signatory?.id_number),
    signingAuthority: true,
  }, 'Authorised signatory')
  const trustee = person({
    name: firstText(form.authorisedTrusteeName, form.authorised_trustee_name, trust.authorisedTrusteeName, trust.authorised_trustee_name, trust.authorisedTrustee?.name, trust.authorised_trustee?.name, trust.authorised_trustee?.full_name),
    email: firstText(form.authorisedTrusteeEmail, form.authorised_trustee_email, trust.authorisedTrustee?.email, trust.authorised_trustee?.email),
    phone: firstText(form.authorisedTrusteePhone, form.authorised_trustee_phone, trust.authorisedTrustee?.phone, trust.authorised_trustee?.phone),
    idNumber: firstText(form.authorisedTrusteeIdNumber, form.authorised_trustee_id_number, trust.authorisedTrustee?.idNumber, trust.authorised_trustee?.id_number),
    signingAuthority: true,
  }, 'Authorised trustee')
  const executor = person({ name: firstText(form.executorName, form.executor_name, deceasedEstate.executor_name), email: firstText(form.executorEmail, form.executor_email, deceasedEstate.executor_email), phone: firstText(form.executorPhone, form.executor_phone, deceasedEstate.executor_phone), idNumber: firstText(form.executorIdNumber, form.executor_id_number), signingAuthority: true }, 'Executor')
  const representative = person({ name: firstText(form.powerOfAttorneyName, form.power_of_attorney_name, powerOfAttorney.representative_name), email: firstText(form.powerOfAttorneyEmail, form.power_of_attorney_email, powerOfAttorney.representative_email), phone: firstText(form.powerOfAttorneyPhone, form.power_of_attorney_phone, powerOfAttorney.representative_phone), idNumber: firstText(form.powerOfAttorneyIdNumber, form.power_of_attorney_id_number), signingAuthority: true }, 'Representative')
  const legalOwner = {
    name: kind === 'company' || kind === 'foreign_company'
      ? firstText(form.companyName, form.company_name, company.name, company.companyName)
      : kind === 'trust' || kind === 'foreign_trust'
        ? firstText(form.trustName, form.trust_name, trust.name, trust.trustName)
        : kind === 'deceased_estate'
          ? firstText(form.deceasedEstateName, form.estateName, form.estate_name, deceasedEstate.name)
          : kind === 'power_of_attorney'
            ? firstText(form.powerOfAttorneyPrincipalName, form.power_of_attorney_principal_name, powerOfAttorney.principal?.name)
            : kind === 'unknown'
              ? ''
              : fullName(form),
    registrationNumber: kind === 'company' || kind === 'foreign_company'
      ? firstText(form.companyRegistrationNumber, form.company_registration_number, company.registrationNumber, company.registration_number)
      : kind === 'trust' || kind === 'foreign_trust'
        ? firstText(form.trustRegistrationNumber, form.trust_registration_number, trust.registrationNumber, trust.registration_number)
        : kind === 'deceased_estate'
          ? firstText(form.estateReference, form.estate_reference, deceasedEstate.estate_reference)
          : kind === 'power_of_attorney'
            ? firstText(form.powerOfAttorneyPrincipalIdNumber, form.power_of_attorney_principal_id_number, powerOfAttorney.principal?.id_number)
          : firstText(form.idNumber, form.id_number, form.foreignPassportNumber, form.foreign_passport_number, form.passportNumber),
    address: kind === 'company' || kind === 'foreign_company'
      ? firstText(form.companyRegisteredAddress, form.company_registered_address, company.registeredAddress)
      : kind === 'trust' || kind === 'foreign_trust'
        ? firstText(form.trustRegisteredAddress, form.trust_registered_address, trust.registeredAddress)
        : firstText(form.residentialAddress, form.residential_address, form.address),
  }
  const signers = kind === 'company' || kind === 'foreign_company'
    ? [signatory].filter(Boolean)
    : kind === 'trust' || kind === 'foreign_trust'
      ? [trustee].filter(Boolean)
      : kind === 'deceased_estate'
        ? [executor].filter(Boolean)
        : kind === 'power_of_attorney'
          ? [representative].filter(Boolean)
          : ownerPeople.length
            ? ownerPeople
            : primaryContact ? [primaryContact] : []
  const requiredSetupFields = []
  if (kind === 'unknown') requiredSetupFields.push('Ownership route')
  if (!primaryContact?.name) requiredSetupFields.push('Primary contact name')
  if (!primaryContact?.email && !primaryContact?.phone) requiredSetupFields.push('Primary contact email or mobile')
  if (!legalOwner.name) requiredSetupFields.push(kind === 'unknown' ? 'Legal owner' : 'Legal owner name')
  if (['company', 'foreign_company'].includes(kind) && !legalOwner.registrationNumber) requiredSetupFields.push('Company registration number')
  if (['trust', 'foreign_trust'].includes(kind) && !legalOwner.registrationNumber) requiredSetupFields.push('Trust registration number')
  if (kind === 'deceased_estate' && !legalOwner.registrationNumber) requiredSetupFields.push('Estate reference')
  if (kind === 'power_of_attorney' && !legalOwner.registrationNumber) requiredSetupFields.push('Principal ID/passport number')
  if (kind === 'multiple_owners' && ownerPeople.length < 2) requiredSetupFields.push('At least two owners')
  if (['company', 'foreign_company', 'trust', 'foreign_trust', 'deceased_estate', 'power_of_attorney'].includes(kind) && !signers.length) {
    requiredSetupFields.push(kind === 'power_of_attorney' ? 'Authorised representative' : 'Authorised signer')
  }

  return {
    version: SELLER_SUBJECT_MODEL_VERSION,
    kind: SUBJECT_KINDS.has(kind) ? kind : 'unknown',
    ownership: { entityType, structureType, ownershipType },
    legalOwner,
    primaryContact,
    people: { owners: ownerPeople, directors, trustees },
    signers,
    identityRequirement: identityRequirement(kind),
    authorityRequirement: authorityRequirement(kind),
    status: requiredSetupFields.length ? 'ownership_setup_required' : 'ready_for_onboarding',
    requiredSetupFields,
    onboardingReady: requiredSetupFields.length === 0,
    source: canonical.seller ? 'canonical_seller_facts' : Object.keys(record(formData)).length ? 'form_data' : Object.keys(record(lead)).length ? 'lead' : 'unknown',
  }
}

export default { SELLER_SUBJECT_MODEL_VERSION, buildSellerSubject }
