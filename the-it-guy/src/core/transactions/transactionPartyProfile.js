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
    people: (Array.isArray(input.people) ? input.people : []).map((person) => ({
      id: text(person.id), role: known(person.role, PARTY_PERSON_ROLES, 'owner'), name: text(person.name),
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

export function transactionSellerProfileFromSource({ facts = {}, contact = {}, personId }) {
  const seller = facts.seller || {}
  const rawType = facts.sellerEntityType || facts.seller_entity_type || seller.profile_type || facts.ownershipType || facts.ownershipStructure || seller.entity_type || 'unknown'
  const entityType = { multiple_individuals: 'multiple_owners', married_cop: 'individual', married_anc: 'individual', cc: 'close_corporation' }[rawType] || rawType
  const marital = (person = {}) => {
    const status = person.maritalStatus || person.marital_status || 'unknown'
    const raw = person.maritalRegime || person.marital_regime || (['married_cop', 'married_anc'].includes(rawType) ? rawType : '')
    const regime = { married_cop: 'in_community', married_in_community: 'in_community', married_anc: 'out_of_community', anc: 'out_of_community', married_out_of_community: 'out_of_community' }[raw] || raw || 'unknown'
    return { maritalStatus: status === 'married' || ['in_community', 'out_of_community', 'out_of_community_with_accrual', 'foreign_marriage'].includes(regime) ? 'married' : status, maritalRegime: regime }
  }
  const sourcePeople = facts.multipleOwners || facts.owners || seller.owners || []
  const people = Array.isArray(sourcePeople) && sourcePeople.length ? sourcePeople.map((person, index) => ({
    ...person, id: /^[0-9a-f-]{36}$/i.test(person.id || '') ? person.id : `${personId.slice(0, -6)}${(index + 1).toString(16).padStart(6, '0')}`,
    role: person.role || 'owner', name: person.fullName || [person.name || person.firstName, person.surname || person.lastName].filter(Boolean).join(' '),
    identityNumber: person.identityNumber || person.idNumber || person.id_number, isOwner: true, primaryContact: index === 0, ...marital(person),
  })) : [{ id: personId, role: isNaturalParty(entityType) || entityType === 'unknown' ? 'owner' : entityType.includes('trust') ? 'trustee' : entityType === 'deceased_estate' ? 'executor' : 'authorised_representative', name: seller.primary_contact?.name || facts.primaryContactName || contact.name || '', email: seller.primary_contact?.email || contact.email || '', phone: seller.primary_contact?.phone || contact.phone || '', identityNumber: facts.idNumber || facts.sellerIdNumber || seller.id_number, isOwner: isNaturalParty(entityType) || entityType === 'unknown', primaryContact: true, signatory: false, ...marital({ ...seller, ...facts }) }]
  return normalizeTransactionPartyProfile({ entityType, name: facts.companyName || facts.trustName || facts.entityName || seller.entity_name || contact.name, registrationNumber: facts.companyRegistrationNumber || facts.trustRegistrationNumber || facts.registrationNumber || seller.registration_number, people })
}
