import { normalizeSellerProfileType } from './sellerPartyAuthorityContract.js'

export const SELLER_FICA_SCOPE_VERSION = 'seller_fica_scope_v1'

const CHECKS = Object.freeze(['identity', 'address', 'sanctions', 'pep', 'risk'])

function text(value) { return String(value ?? '').trim() }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function first(...values) { return values.map(text).find(Boolean) || '' }
function entries(...values) { return values.find((value) => Array.isArray(value) && value.length) || [] }
function personName(value) {
  const person = object(value)
  return first(person.fullName, person.full_name, [person.firstName || person.first_name || person.name, person.surname || person.lastName || person.last_name].filter(Boolean).join(' '), person.name)
}
function personIdentity(value) {
  const person = object(value)
  return first(person.idNumber, person.id_number, person.identityNumber, person.identity_number, person.passportNumber, person.passport_number)
}
function personAddress(value) {
  const person = object(value)
  return first(person.residentialAddress, person.residential_address, person.address, person.residentialStreet, person.residential_street)
}

/** Collection scope only. This is not a provider request or a compliance decision. */
export function buildSellerFicaScope({ sellerSubject = {}, onboarding = {}, canonicalFacts = {} } = {}) {
  const subject = object(sellerSubject)
  const form = object(onboarding)
  const seller = object(object(canonicalFacts).seller)
  const company = object(form.company)
  const trust = object(form.trust)
  const canonicalCompany = object(seller.company)
  const canonicalTrust = object(seller.trust)
  const kind = normalizeSellerProfileType(subject.kind || form.ownerStructureType || form.owner_structure_type)
  const foreign = kind.startsWith('foreign_')
  const companyKind = ['company', 'close_corporation', 'foreign_company'].includes(kind)
  const trustKind = ['trust', 'foreign_trust'].includes(kind)
  const individualKind = ['individual', 'married', 'multiple_owners', 'foreign_individual'].includes(kind)
  const subjects = []
  const gaps = []
  const evidence = new Set()
  const review = new Set()
  const seen = new Map()

  function gap(label) { if (!gaps.includes(label)) gaps.push(label) }
  function addPerson(role, value, { requireAddress = true } = {}) {
    const entry = typeof value === 'string' ? { fullName: value } : object(value)
    const name = personName(entry)
    const identity = personIdentity(entry)
    const address = personAddress(entry)
    const nationality = first(entry.nationality, entry.country, entry.citizenship)
    const identityKey = identity ? `id:${identity.toLowerCase()}` : ''
    // A shared name is not evidence that two role-players are the same person.
    // Only a matching identity number may collapse roles for costing purposes.
    const existingIndex = identityKey && seen.has(identityKey) ? seen.get(identityKey) : null
    if (existingIndex !== null) {
      const existing = subjects[existingIndex]
      if (!existing.roles.includes(role)) existing.roles.push(role)
      return
    }
    const label = name || role
    const missing = []
    if (!name) missing.push('full legal name')
    if (!identity) missing.push('ID or passport number')
    if (requireAddress && !address) missing.push('residential address')
    if (!nationality) missing.push('nationality / jurisdiction')
    for (const field of missing) gap(`${label}: ${field}`)
    subjects.push({ type: 'person', label, roles: [role], complete: missing.length === 0, missing, checks: [...CHECKS] })
    if (identityKey) seen.set(identityKey, subjects.length - 1)
    evidence.add('Identity evidence for each in-scope natural person')
    evidence.add('Address evidence where required by the agency RMCP')
  }
  function addPeople(role, values) { for (const value of values) addPerson(role, value) }
  function addEntity(role, name, registration, address) {
    const missing = []
    if (!name) missing.push('legal name')
    if (!registration) missing.push('registration / reference number')
    if (!address) missing.push('registered address')
    for (const field of missing) gap(`${role}: ${field}`)
    subjects.push({ type: 'entity', label: name || role, roles: [role], complete: missing.length === 0, missing, checks: [...CHECKS] })
    evidence.add('Entity registration or founding documents')
  }

  if (kind === 'unknown') gap('Confirmed seller ownership route')
  if (individualKind) {
    const owners = entries(form.multipleOwners, form.multiple_owners, form.owners, seller.owners, subject.people?.owners)
    if (kind === 'multiple_owners') {
      if (owners.length < 2) gap('All legal co-owners (at least two)')
      addPeople('Legal owner', owners)
    } else {
      addPerson('Legal owner', {
        fullName: first(subject.legalOwner?.name, form.fullName, form.sellerFullName),
        idNumber: first(subject.legalOwner?.registrationNumber, form.idNumber, form.id_number, form.foreignPassportNumber),
        // Do not infer a person's residence from a sale-property/lead address.
        residentialAddress: first(form.residentialAddress, form.residentialStreet, form.residentialAddressDetails?.line1),
        nationality: first(form.nationality, form.foreignOwnerCountry),
      })
      addPeople('Additional legal owner', owners)
    }
    if (kind === 'married') review.add('Confirm marital regime and whether a spouse is a co-owner or must consent / sign.')
  } else if (companyKind) {
    addEntity('Company / close corporation', first(subject.legalOwner?.name, form.companyName, company.name), first(subject.legalOwner?.registrationNumber, form.companyRegistrationNumber, company.registrationNumber), first(subject.legalOwner?.address, form.companyRegisteredAddress, company.registeredAddress))
    const directors = entries(form.companyDirectors, form.company_directors, form.directors, company.directors, canonicalCompany.directors)
    const beneficialOwners = entries(form.companyBeneficialOwners, form.company_beneficial_owners, company.beneficialOwners, company.beneficial_owners, canonicalCompany.beneficial_owners)
    addPeople('Director / member', directors)
    addPeople('Beneficial owner / controller', beneficialOwners)
    if (!beneficialOwners.length) gap('Beneficial ownership / control declaration')
    addPerson('Authorised representative', {
      fullName: first(form.authorisedSignatoryName, company.authorisedSignatory?.name, subject.signers?.[0]?.name),
      idNumber: first(form.authorisedSignatoryIdNumber, company.authorisedSignatory?.idNumber, subject.signers?.[0]?.idNumber),
      residentialAddress: first(form.authorisedSignatoryAddress, company.authorisedSignatory?.residentialAddress),
      nationality: first(form.authorisedSignatoryNationality, company.authorisedSignatory?.nationality),
    })
    if (!first(form.companyAuthorityBasis, company.authorityBasis)) gap('Company representative authority basis')
    evidence.add('Beneficial ownership / control structure')
    evidence.add('Resolution or other representative authority evidence')
    review.add('Match any representative to a director / controller using identity evidence before deduplicating checks.')
    review.add('Confirm which directors / controllers require individual checks under the agency RMCP.')
  } else if (trustKind) {
    addEntity('Trust', first(subject.legalOwner?.name, form.trustName, trust.name), first(subject.legalOwner?.registrationNumber, form.trustRegistrationNumber, trust.registrationNumber), first(subject.legalOwner?.address, form.trustRegisteredAddress, trust.registeredAddress))
    const founders = entries(form.trustFounders, form.trust_founders, trust.founders, canonicalTrust.founders)
    const trustees = entries(form.trustees, form.trust_trustees, trust.trustees, canonicalTrust.trustees)
    const beneficiaries = entries(form.trustBeneficiaries, form.trust_beneficiaries, form.beneficiaries, trust.beneficiaries, canonicalTrust.beneficiaries)
    addPeople('Founder', founders)
    addPeople('Trustee', trustees)
    addPeople('Named beneficiary', beneficiaries)
    if (!founders.length) gap('Trust founder(s) / founder structure')
    if (!trustees.length) gap('All trustees')
    if (!beneficiaries.length && !first(form.trustBeneficiaryClass, form.trust_beneficiary_class, trust.beneficiaryClass)) gap('Named beneficiaries or beneficiary class declaration')
    addPerson('Authorised representative', {
      fullName: first(form.authorisedTrusteeName, trust.authorisedTrustee?.name, subject.signers?.[0]?.name),
      idNumber: first(form.authorisedTrusteeIdNumber, trust.authorisedTrustee?.idNumber, subject.signers?.[0]?.idNumber),
      residentialAddress: first(form.authorisedTrusteeAddress, trust.authorisedTrustee?.residentialAddress),
      nationality: first(form.authorisedTrusteeNationality, trust.authorisedTrustee?.nationality),
    })
    if (!first(form.trustAuthorityBasis, trust.authorityBasis)) gap('Trustee authority basis')
    evidence.add('Trust deed and Letters of Authority')
    evidence.add('Founder, trustee and beneficiary / beneficial-ownership structure')
    review.add('Match any authorised representative to a trustee using identity evidence before deduplicating checks.')
    review.add('Resolve any legal-person founder, trustee or beneficiary to the relevant natural persons.')
  } else if (kind === 'deceased_estate' || kind === 'power_of_attorney') {
    addEntity(kind === 'deceased_estate' ? 'Deceased estate' : 'Legal owner', subject.legalOwner?.name, subject.legalOwner?.registrationNumber, subject.legalOwner?.address)
    if (!subject.signers?.length) gap('Authorised executor / representative')
    addPeople('Authorised executor / representative', subject.signers || [])
    evidence.add(kind === 'deceased_estate' ? 'Executor appointment and estate documents' : 'Power of attorney and principal identity evidence')
    review.add('Confirm the underlying legal owner and authority before provider mapping.')
  } else if (kind === 'other') {
    gap('Manual legal-entity classification and compliance scope')
    review.add('Determine the legal-person and beneficial-ownership requirements manually.')
  }

  if (foreign) {
    if (!first(form.foreignOwnerCountry, form.foreign_owner_country)) gap('Foreign jurisdiction')
    review.add('Confirm foreign-document acceptability, translations and any enhanced-risk measures.')
  }
  if (subjects.length === 0) gap('At least one legal seller or in-scope person')
  review.add('Compliance officer to confirm final scope and risk-based evidence under the agency RMCP.')

  return {
    version: SELLER_FICA_SCOPE_VERSION,
    kind,
    subjects,
    missing: gaps,
    evidence: [...evidence],
    review: [...review],
    collectionComplete: gaps.length === 0,
    providerReady: false,
  }
}
