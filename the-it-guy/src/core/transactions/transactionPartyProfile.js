import { createListingSellerProfileBuilderDraft } from '../../lib/listingSellerProfileBuilderModel.js'
import { getSellerFieldOwnership, sellerPersonSourceKey } from '../../lib/sellerDataOwnershipContract.js'

export const TRANSACTION_PARTY_PROFILE_VERSION = 'transaction_party_profile_v1'
export const PARTY_ENTITY_OPTIONS = Object.freeze([
  { value: 'unknown', label: 'Not confirmed yet' },
  { value: 'individual', label: 'Individual' },
  { value: 'multiple_owners', label: 'Multiple individuals' },
  { value: 'company', label: 'Company' },
  { value: 'close_corporation', label: 'Close corporation' },
  { value: 'trust', label: 'Trust' },
  { value: 'foreign_individual', label: 'Foreign individual' },
  { value: 'foreign_company', label: 'Foreign company' },
  { value: 'foreign_trust', label: 'Foreign trust' },
  { value: 'deceased_estate', label: 'Deceased estate' },
  { value: 'other', label: 'Other entity' },
])
export const PARTY_MARITAL_OPTIONS = Object.freeze([
  { value: 'unknown', label: 'Not confirmed yet' },
  { value: 'single', label: 'Single / never married' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
])
export const PARTY_MARRIAGE_REGIME_OPTIONS = Object.freeze([
  { value: 'unknown', label: 'Not confirmed yet' },
  { value: 'in_community', label: 'In community of property' },
  { value: 'out_of_community', label: 'Out of community — without accrual' },
  { value: 'out_of_community_with_accrual', label: 'Out of community — with accrual' },
  { value: 'foreign_marriage', label: 'Marriage governed by foreign law' },
])
export const PARTY_PERSON_ROLES = Object.freeze([
  { value: 'owner', label: 'Buyer / owner' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'authorised_representative', label: 'Authorised representative' },
  { value: 'director', label: 'Director' },
  { value: 'member', label: 'CC member' },
  { value: 'trustee', label: 'Trustee' },
  { value: 'executor', label: 'Executor' },
  { value: 'beneficial_owner', label: 'Beneficial owner' },
  { value: 'founder', label: 'Founder' },
  { value: 'beneficiary', label: 'Beneficiary' },
  { value: 'surety', label: 'Surety' },
  { value: 'other', label: 'Other participant' },
])
const text = (value) => String(value ?? '').trim()
const known = (value, options, fallback = 'unknown') => options.some((option) => option.value === value) ? value : fallback
export const isNaturalParty = (type) => ['individual', 'multiple_owners', 'foreign_individual'].includes(type)
export function createTransactionPartyPerson(role = 'owner') {
  return { id: crypto.randomUUID(), role, name: '', email: '', phone: '', identityNumber: '', maritalStatus: 'unknown', maritalRegime: 'unknown', spouseOfId: '', isOwner: role === 'owner', signatory: false, primaryContact: false }
}
export function normalizeTransactionPartyProfile(input = {}) {
  const entityType = known(input.entityType, PARTY_ENTITY_OPTIONS)
  return {
    entityType, name: text(input.name), registrationNumber: text(input.registrationNumber), countryOfRegistration: text(input.countryOfRegistration),
    ...(input.source?.onboardingId ? { source: { onboardingId: text(input.source.onboardingId), updatedAt: text(input.source.updatedAt) } } : {}),
    ...(input.profileFields ? { profileFields: sellerProfileFields(input.profileFields) } : {}),
    people: (Array.isArray(input.people) ? input.people : []).map((person) => ({
      id: text(person.id), role: known(person.role, PARTY_PERSON_ROLES, 'owner'), name: text(person.name),
      dateOfBirth: text(person.dateOfBirth), nationality: text(person.nationality), residentialAddress: text(person.residentialAddress),
      incomeTaxNumber: text(person.incomeTaxNumber), saResident: person.saResident ?? '', taxResident: person.taxResident ?? '',
      capacity: text(person.capacity), ownershipShare: text(person.ownershipShare), authorityDetails: text(person.authorityDetails),
      sourceOnboardingId: text(person.sourceOnboardingId), sourcePersonId: text(person.sourcePersonId), sourceSlot: text(person.sourceSlot),
      sourceLinkStatus: text(person.sourceLinkStatus), sourceKey: sellerPersonSourceKey(person.sourceOnboardingId, person.sourcePersonId),
      email: text(person.email).toLowerCase(), phone: text(person.phone), identityNumber: text(person.identityNumber),
      maritalStatus: known(person.maritalStatus, PARTY_MARITAL_OPTIONS),
      maritalRegime: person.maritalStatus === 'married' ? known(person.maritalRegime, PARTY_MARRIAGE_REGIME_OPTIONS) : 'unknown',
      spouseOfId: text(person.spouseOfId), isOwner: person.isOwner === true, signatory: person.signatory === true, primaryContact: person.primaryContact === true,
    })),
  }
}
export function buildTransactionPartiesSnapshot({ buyer = {}, seller = {} } = {}) {
  return { version: TRANSACTION_PARTY_PROFILE_VERSION, buyer: normalizeTransactionPartyProfile(buyer), seller: normalizeTransactionPartyProfile(seller) }
}
export function getTransactionParties(formData = {}, transaction = {}) {
  const snapshot = formData.__bridge_transaction_parties || transaction.transaction_parties || transaction.onboardingFormData?.__bridge_transaction_parties
  return snapshot?.version === TRANSACTION_PARTY_PROFILE_VERSION ? buildTransactionPartiesSnapshot(snapshot) : null
}
export function partyPurchaserType(profile = {}) {
  if (['company', 'close_corporation', 'foreign_company'].includes(profile.entityType)) return 'company'
  if (['trust', 'foreign_trust'].includes(profile.entityType)) return 'trust'
  if (profile.entityType === 'foreign_individual') return 'foreign_purchaser'
  const owner = profile.people?.find((person) => person.isOwner) || profile.people?.[0]
  if (owner?.maritalStatus === 'married') {
    if (owner.maritalRegime === 'in_community') return 'married_coc'
    if (owner.maritalRegime === 'out_of_community') return 'married_anc'
    if (owner.maritalRegime === 'out_of_community_with_accrual') return 'married_anc_accrual'
  }
  return 'individual'
}
export function partyDisplayName(profile = {}) {
  return isNaturalParty(profile.entityType) ? profile.people?.filter((person) => person.isOwner).map((person) => person.name).filter(Boolean).join(' / ') || '' : text(profile.name)
}
export function transactionPartyMissingDetails(profile = {}, side = 'Buyer') {
  const missing = []
  if (!profile.entityType || profile.entityType === 'unknown') missing.push(`${side}: entity type`)
  if (!isNaturalParty(profile.entityType) && profile.entityType !== 'unknown') {
    if (!text(profile.name)) missing.push(`${side}: entity name`)
    if (!text(profile.registrationNumber)) missing.push(`${side}: registration / estate reference`)
    if (['other', 'foreign_company', 'foreign_trust'].includes(profile.entityType)) missing.push(`${side}: confirm additional entity documents with attorney`)
  }
  if (profile.entityType === 'foreign_individual') missing.push(`${side}: confirm foreign identity and marriage documents with attorney`)
  if (!profile.people?.length) missing.push(`${side}: people`)
  if (profile.entityType?.startsWith('foreign_') && !text(profile.countryOfRegistration) && !isNaturalParty(profile.entityType)) missing.push(`${side}: country of registration`)
  if (['company', 'close_corporation', 'trust', 'foreign_company', 'foreign_trust', 'deceased_estate'].includes(profile.entityType) && !profile.people?.some((person) => ['director', 'member', 'trustee', 'executor', 'authorised_representative'].includes(person.role) && text(person.name))) missing.push(`${side}: entity representative`)

  if (profile.entityType === 'multiple_owners' && profile.people?.filter((person) => person.isOwner).length < 2) missing.push(`${side}: at least two owners`)
  if (!profile.people?.some((person) => person.primaryContact && text(person.name))) missing.push(`${side}: primary contact`)
  if (!profile.people?.some((person) => person.signatory && text(person.name))) missing.push(`${side}: signing authority`)
  for (const [index, person] of (profile.people || []).entries()) {
    const label = `${side}: ${person.name || `person ${index + 1}`}`
    if (!text(person.id) || person.sourceLinkStatus === 'review_required') missing.push(`${label} saved person link requires review`)
    if (!text(person.name)) missing.push(`${label} name`)
    if (!text(person.identityNumber)) missing.push(`${label} ID / passport`)
    if (isNaturalParty(profile.entityType) && person.isOwner && person.maritalStatus === 'unknown') missing.push(`${label} marital status`)
    if (isNaturalParty(profile.entityType) && person.isOwner && person.maritalStatus === 'married') {
      if (person.maritalRegime === 'unknown') missing.push(`${label} marriage regime`)
      if (person.maritalRegime === 'in_community' && !profile.people.some((spouse) => spouse.spouseOfId === person.id && text(spouse.name))) missing.push(`${label} spouse details`)
      if (person.maritalRegime === 'foreign_marriage') missing.push(`${label} foreign marriage document review`)
    }
  }
  return missing
}
// Seed the existing buyer onboarding fields without marking evidence or authority as verified.
export function transactionPartiesOnboardingSeed(snapshot) {
  if (!snapshot) return {}
  const parties = buildTransactionPartiesSnapshot(snapshot)
  const buyer = parties.buyer
  const owner = buyer.people.find((person) => person.isOwner) || buyer.people[0] || {}
  return {
    __bridge_transaction_parties: parties,
    buyer_entity_type: buyer.entityType, seller_entity_type: parties.seller.entityType,
    marital_status: owner.maritalStatus, marital_regime: owner.maritalRegime,
    company_name: ['company', 'close_corporation', 'foreign_company'].includes(buyer.entityType) ? buyer.name : '',
    company_registration_number: ['company', 'close_corporation', 'foreign_company'].includes(buyer.entityType) ? buyer.registrationNumber : '',
    trust_name: ['trust', 'foreign_trust'].includes(buyer.entityType) ? buyer.name : '',
    trust_registration_number: ['trust', 'foreign_trust'].includes(buyer.entityType) ? buyer.registrationNumber : '',
  }
}

// Requirement identity stays attached to a person, independently of their name or list order.
export function transactionPartyDocumentSubjects(documentKey, snapshot) {
  const side = documentKey.startsWith('buyer_') ? 'buyer' : documentKey.startsWith('seller_') ? 'seller' : null
  const profile = snapshot?.[side]
  if (!profile) return []
  const people = profile.people || []
  const owners = people.filter((person) => person.isOwner)
  if (documentKey.includes('spouse_')) return people.filter((person) => {
    const owner = owners.find((owner) => owner.id === person.spouseOfId)
    return person.role === 'spouse' && owner?.maritalStatus === 'married' && (side === 'buyer' || documentKey.includes('consent') ? owner.maritalRegime === 'in_community' : ['in_community', 'out_of_community', 'out_of_community_with_accrual'].includes(owner.maritalRegime))
  })
  if (documentKey.includes('marriage_certificate')) return owners.filter((person) => person.maritalStatus === 'married')
  if (documentKey.includes('anc_document')) return owners.filter((person) => person.maritalStatus === 'married' && ['out_of_community', 'out_of_community_with_accrual'].includes(person.maritalRegime))
  if (documentKey.endsWith('_fica_declaration')) return isNaturalParty(profile.entityType) ? owners : people.filter((person) => person.signatory)
  if (documentKey.includes('director_fica')) return people.filter((person) => ['director', 'member', 'authorised_representative'].includes(person.role))
  if (documentKey.includes('trustee_fica')) return people.filter((person) => ['trustee', 'authorised_representative'].includes(person.role))
  if (['id_document', 'proof_of_address', 'passport'].some((suffix) => documentKey === `${side}_${suffix}`)) return isNaturalParty(profile.entityType) ? owners : []
  return []
}

// Only owned seller facts cross the handoff. Access tokens, signatures, document
// evidence and commercial decisions are not part of the current party profile.
function sellerProfileFields(input) {
  return Object.fromEntries(Object.entries(input || {}).filter(([key]) =>
    getSellerFieldOwnership(key)?.canonicalPaths.some((path) => path.startsWith('seller.'))))
}

// Explicit adapter for existing transaction snapshots. The current people and
// contact slot take precedence over the original capture's display fields.
export function transactionSellerProfileFormData(input = {}) {
  const profile = normalizeTransactionPartyProfile(input)
  const fields = { ...profile.profileFields }
  const personFields = (person) => ({
    id: person.sourcePersonId || person.id, sourcePersonId: person.sourcePersonId || person.id,
    fullName: person.name, email: person.email, phone: person.phone, idNumber: person.identityNumber,
    dateOfBirth: person.dateOfBirth, nationality: person.nationality, residentialAddress: person.residentialAddress,
    incomeTaxNumber: person.incomeTaxNumber, saResident: person.saResident, taxResident: person.taxResident,
    maritalStatus: person.maritalStatus, maritalRegime: person.maritalRegime,
    ownershipShare: person.ownershipShare, controlBasis: person.authorityDetails,
    signingAuthority: person.signatory, primaryContact: person.primaryContact,
  })
  fields.ownerStructureType ||= profile.entityType
  const contacts = profile.people.filter((person) => person.primaryContact)
  if (contacts.length === 1) Object.assign(fields, { primaryContactName: contacts[0].name, email: contacts[0].email, phone: contacts[0].phone })
  const owners = profile.people.filter((person) => person.isOwner && person.role !== 'spouse')
  if (isNaturalParty(profile.entityType) && owners.length === 1 && profile.entityType !== 'multiple_owners') {
    const names = owners[0].name.split(/\s+/).filter(Boolean)
    Object.assign(fields, { sellerFirstName: names.slice(0, -1).join(' ') || names[0] || '', sellerSurname: names.length > 1 ? names.at(-1) : '', idNumber: owners[0].identityNumber })
    const spouse = profile.people.find((person) => person.spouseOfId === owners[0].id)
    if (spouse) Object.assign(fields, { spouseName: spouse.name, spouseIdNumber: spouse.identityNumber, spouseEmail: spouse.email, spousePhone: spouse.phone })
  }
  if (profile.entityType === 'multiple_owners') fields.multipleOwners = owners.map(personFields)
  if (['company', 'close_corporation', 'foreign_company'].includes(profile.entityType)) Object.assign(fields, {
    companyName: profile.name, companyRegistrationNumber: profile.registrationNumber,
    companyDirectors: profile.people.filter((person) => ['director', 'member'].includes(person.role)).map(personFields),
    companyBeneficialOwners: profile.people.filter((person) => person.role === 'beneficial_owner').map(personFields),
  })
  if (['trust', 'foreign_trust'].includes(profile.entityType)) Object.assign(fields, {
    trustName: profile.name, trustRegistrationNumber: profile.registrationNumber,
    trustees: profile.people.filter((person) => person.role === 'trustee').map(personFields),
    trustFounders: profile.people.filter((person) => person.role === 'founder').map(personFields),
    trustBeneficiaries: profile.people.filter((person) => person.role === 'beneficiary').map(personFields),
  })
  return fields
}

export function transactionSellerProfileFromSource({ facts = {}, formData, contact = {}, personId = '', onboardingId = '', updatedAt = '' } = {}) {
  const canonical = facts.seller ? facts : {}
  const raw = formData ?? (facts.seller ? {} : facts)
  const draft = createListingSellerProfileBuilderDraft({
    sellerCanonicalFacts: canonical, sellerOnboarding: { formData: raw },
    sellerName: contact.name, sellerEmail: contact.email, sellerPhone: contact.phone,
  })
  const sourceType = draft.branch || raw.sellerEntityType || raw.seller_entity_type || canonical.seller?.profile_type || 'unknown'
  const entityType = { married: 'individual', multiple_individuals: 'multiple_owners', married_cop: 'individual', married_anc: 'individual', cc: 'close_corporation', power_of_attorney: 'other' }[sourceType] || sourceType
  const marriage = (entry = {}) => {
    const status = entry.maritalStatus ?? entry.marital_status ?? 'unknown'
    const rawRegime = entry.maritalRegime ?? entry.marital_regime ?? ''
    const regime = { married_cop: 'in_community', married_coc: 'in_community', married_in_community: 'in_community', married_anc: 'out_of_community', anc: 'out_of_community', married_out_of_community: 'out_of_community', married_anc_accrual: 'out_of_community_with_accrual' }[rawRegime] || rawRegime || 'unknown'
    return { maritalStatus: ['in_community', 'out_of_community', 'out_of_community_with_accrual', 'foreign_marriage'].includes(regime) ? 'married' : { not_married: 'single', never_married: 'single' }[status] || status, maritalRegime: regime }
  }
  const person = (entry, role, { slot = '', id = '', primaryContact = false } = {}) => {
    const sourcePersonId = Object.hasOwn(entry, 'sourcePersonId') ? text(entry.sourcePersonId) : text(entry.id)
    return {
      id: sourcePersonId || id, role,
      name: entry.fullName ?? entry.full_name ?? [entry.name || entry.firstName || entry.first_name, entry.surname || entry.lastName || entry.last_name].filter(Boolean).join(' '),
      email: entry.email, phone: entry.phone, identityNumber: entry.idNumber ?? entry.id_number ?? entry.identityNumber,
      dateOfBirth: entry.dateOfBirth ?? entry.date_of_birth, nationality: entry.nationality,
      residentialAddress: entry.residentialAddress ?? entry.residential_address,
      incomeTaxNumber: entry.incomeTaxNumber ?? entry.tax_number, saResident: entry.saResident ?? entry.sa_resident, taxResident: entry.taxResident ?? entry.tax_resident,
      capacity: entry.capacity, ownershipShare: entry.ownershipShare ?? entry.ownership_share,
      authorityDetails: entry.controlBasis ?? entry.authority_details,
      isOwner: role === 'owner', signatory: entry.signingAuthority === true || entry.signing_authority === true,
      primaryContact: entry.primaryContact === true || primaryContact,
      sourceOnboardingId: onboardingId, sourcePersonId, sourceSlot: slot,
      sourceLinkStatus: sourcePersonId || id ? 'captured' : 'review_required', ...marriage(entry),
    }
  }
  const people = []
  const collections = sourceType === 'multiple_owners' ? [[draft.multipleOwners, 'owner']]
    : ['company', 'close_corporation', 'foreign_company'].includes(sourceType) ? [[draft.companyDirectors, sourceType === 'close_corporation' ? 'member' : 'director'], [draft.companyBeneficialOwners, 'beneficial_owner']]
      : ['trust', 'foreign_trust'].includes(sourceType) ? [[draft.trustees, 'trustee'], [draft.trustFounders, 'founder'], [draft.trustBeneficiaries, 'beneficiary']]
        : sourceType === 'deceased_estate' ? [[raw.executors ?? canonical.seller?.deceased_estate?.executors ?? [], 'executor']]
          : sourceType === 'power_of_attorney' ? [[raw.powerOfAttorneyRepresentatives ?? canonical.seller?.power_of_attorney?.representatives ?? [], 'authorised_representative']] : []
  for (const [entries, role] of collections) for (const entry of entries) {
    const owner = person(entry, role)
    people.push(owner)
    if (entry.spouse && Object.values(entry.spouse).some(Boolean)) people.push({ ...person(entry.spouse, 'spouse', { id: owner.id ? `${owner.id}:spouse` : '', slot: 'spouse' }), spouseOfId: owner.id })
  }
  const naturalSingleton = (isNaturalParty(entityType) || entityType === 'unknown') && sourceType !== 'multiple_owners'
  if (naturalSingleton || !people.some((entry) => entry.primaryContact)) {
    people.push(person({ ...draft, name: naturalSingleton ? [draft.sellerFirstName, draft.sellerSurname].filter(Boolean).join(' ') || draft.primaryContactName : draft.primaryContactName,
      idNumber: naturalSingleton ? draft.idNumber : '', signingAuthority: false }, naturalSingleton ? 'owner' : 'authorised_representative', { id: personId, slot: 'primary_contact', primaryContact: true }))
  }
  if (naturalSingleton && (draft.spouseName || draft.spouseIdNumber || draft.spouseEmail || draft.spousePhone)) {
    people.push({ ...person({ name: draft.spouseName, idNumber: draft.spouseIdNumber, email: draft.spouseEmail, phone: draft.spousePhone }, 'spouse', { id: personId ? `${personId}:spouse` : '', slot: 'spouse' }), spouseOfId: personId })
  }
  // A singleton authority slot is distinct from a roster person unless it has
  // an explicit saved source ID. Matching names or email is not an identity link.
  const authority = ['company', 'close_corporation', 'foreign_company'].includes(sourceType) ? ['authorisedSignatory', canonical.seller?.company?.authorised_signatory]
    : ['trust', 'foreign_trust'].includes(sourceType) ? ['authorisedTrustee', canonical.seller?.trust?.authorised_trustee] : null
  if (authority && draft[`${authority[0]}Name`]) {
    const [prefix, saved = {}] = authority
    people.push(person({ ...saved, name: draft[`${prefix}Name`], idNumber: draft[`${prefix}IdNumber`], email: draft[`${prefix}Email`], phone: draft[`${prefix}Phone`], residentialAddress: draft[`${prefix}Address`], nationality: draft[`${prefix}Nationality`], capacity: draft[`${prefix}Capacity`], signingAuthority: false }, 'authorised_representative', { id: personId ? `${personId}:${prefix}` : '', slot: prefix }))
  }
  const profileFields = sellerProfileFields({ ...draft, ownerStructureType: sourceType, sellerLegalType: sourceType })
  const name = ['company', 'close_corporation', 'foreign_company'].includes(sourceType) ? draft.companyName : ['trust', 'foreign_trust'].includes(sourceType) ? draft.trustName : sourceType === 'deceased_estate' ? draft.deceasedEstateName : sourceType === 'power_of_attorney' ? draft.powerOfAttorneyPrincipalName : sourceType === 'other' ? draft.otherEntityName : entityType === 'unknown' ? draft.primaryContactName : [draft.sellerFirstName, draft.sellerSurname].filter(Boolean).join(' ')
  return normalizeTransactionPartyProfile({ entityType, name, registrationNumber: draft.companyRegistrationNumber || draft.trustRegistrationNumber || draft.estateReferenceNumber || draft.otherEntityRegistrationNumber,
    countryOfRegistration: draft.foreignOwnerCountry, source: { onboardingId, updatedAt }, profileFields, people })
}


// The contact slot is transaction-local. A saved roster person's ID is never
// reused as the transaction_participants primary key across different deals.
export function transactionSellerContactSlotId(profile = {}) {
  const primary = (profile.people || []).filter((person) => person.primaryContact)
  const person = primary.length === 1 ? primary[0] : null
  return person?.sourceSlot === 'primary_contact' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(person.id || '') ? person.id : null
}
