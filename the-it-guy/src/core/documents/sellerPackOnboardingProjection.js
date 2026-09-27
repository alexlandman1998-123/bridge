import { transformSellerOnboardingToFacts } from '../../services/documents/sellerOnboardingFactTransformer.js'

const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const rows = (value) => Array.isArray(value) ? value : []
const text = (value) => String(value ?? '').trim()
const key = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const first = (...values) => values.map(text).find(Boolean) || ''
const filledRows = (saved, derived) => rows(saved).length ? rows(saved) : rows(derived)

function person(value = {}, index = 0, role = 'owner') {
  const source = record(value)
  const firstName = first(source.firstName, source.first_name, source.givenName, source.given_name)
  const surname = first(source.surname, source.lastName, source.last_name, source.familyName)
  const name = first(source.name, source.fullName, source.full_name, [firstName, surname].filter(Boolean).join(' '))
  if (!name && !first(source.email, source.idNumber, source.id_number)) return null
  return {
    ...source,
    id: first(source.id, source.key, `${role}-${index + 1}`),
    firstName,
    surname,
    name,
    email: first(source.email, source.emailAddress, source.email_address).toLowerCase(),
    idNumber: first(source.idNumber, source.id_number),
    phone: first(source.phone, source.mobile),
  }
}

function people(value, role) {
  return rows(value).map((item, index) => person(item, index, role)).filter(Boolean)
}

function naturalOwners(seller = {}) {
  const captured = people(seller.owners, 'owner')
  if (captured.length) return captured
  const primary = person({
    first_name: seller.first_name,
    surname: seller.surname,
    email: seller.email,
    id_number: seller.id_number,
    phone: seller.phone,
  }, 0, 'owner')
  return primary ? [primary] : []
}

function naturalSetup(seller = {}, form = {}) {
  const declarations = [form.maritalRegime, form.marriageRegime, form.maritalStatus, form.ownerStructureType, form.owner_structure_type, form.ownershipType].map(key)
  if (!first(form.maritalRegime, form.marriageRegime, form.maritalStatus) && !declarations.some((value) => ['married_cop', 'married_anc'].includes(value))) return 'unknown'
  for (const explicit of declarations) {
    if (['in_community', 'married_cop', 'cop', 'community_of_property'].includes(explicit)) return 'in_community'
    if (['anc', 'married_anc', 'out_of_community', 'out_of_community_without_accrual', 'out_of_community_with_accrual'].includes(explicit)) return 'anc'
    if (['single', 'unmarried', 'divorced', 'widowed', 'not_applicable'].includes(explicit)) return 'single'
  }
  const regime = key(seller.marital_regime)
  if (regime === 'in_community') return 'in_community'
  if (['anc', 'out_of_community'].includes(regime)) return 'anc'
  if (regime === 'not_applicable') return 'single'
  return 'unknown'
}

function sellerType(seller = {}) {
  const entity = key(seller.owner_entity_type)
  const legal = key(seller.legal_type)
  if (['deceased_estate', 'power_of_attorney', 'other'].includes(legal)) return ''
  if (['company', 'trust', 'close_corporation'].includes(entity) || ['company', 'trust', 'close_corporation'].includes(legal)) return 'juristic'
  if (['individual', 'multiple_owners', 'natural_person'].includes(legal) || entity === 'natural_person') return 'natural'
  return ''
}

function entityType(seller = {}) {
  const entity = key(seller.owner_entity_type)
  const legal = key(seller.legal_type)
  return ['company', 'trust', 'close_corporation'].includes(entity)
    ? entity
    : ['company', 'trust', 'close_corporation'].includes(legal) ? legal : ''
}

function isComplete(pack = {}) {
  if (pack.sellerType === 'natural') {
    const owners = rows(pack.owners)
    return ['single', 'anc', 'in_community'].includes(pack.maritalSetup) &&
      owners.length > 0 &&
      owners.every((owner) => first(owner.firstName, owner.first_name) && first(owner.surname, owner.lastName, owner.last_name) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(owner.email))) &&
      (pack.maritalSetup !== 'in_community' || (text(pack.spouseName) && text(pack.spouseIdNumber)))
  }
  if (pack.sellerType !== 'juristic') return false
  const named = (value) => rows(value).length > 0 && rows(value).every((entry) => text(entry.name || entry.fullName || entry.full_name || [entry.firstName, entry.surname].filter(Boolean).join(' ')))
  if (pack.juristicEntityType === 'company') return Boolean(text(pack.companyName) && named(pack.companyDirectors))
  if (pack.juristicEntityType === 'trust') return Boolean(text(pack.trustName) && named(pack.trustees))
  if (pack.juristicEntityType === 'close_corporation') return Boolean(text(pack.closeCorporationName) && named(pack.closeCorporationMembers))
  return false
}

function submittedAt(lead = {}, listing = {}, formData = {}) {
  return first(
    lead.sellerOnboardingSubmittedAt,
    lead.seller_onboarding_submitted_at,
    lead.sellerOnboardingCompletedAt,
    lead.seller_onboarding_completed_at,
    listing.sellerOnboardingSubmittedAt,
    listing.seller_onboarding_submitted_at,
    formData.sellerOnboardingCompletion?.completedAt,
    formData.sellerOnboardingCompletion?.completed_at,
    formData.seller_onboarding_completion?.completedAt,
    formData.submittedAt,
    formData.submitted_at,
    listing.sellerOnboarding?.submittedAt,
    listing.sellerOnboarding?.completedAt,
    lead.sellerOnboarding?.submittedAt,
    lead.sellerOnboarding?.completedAt,
  )
}

export function projectSellerPackFromOnboarding({
  lead = {},
  listing = {},
  formData = {},
  existingPack = {},
  onboardingSubmitted = false,
} = {}) {
  const saved = record(existingPack)
  if (!onboardingSubmitted) return saved
  // A manually captured pack remains authoritative, including later corrections.
  if (saved.sellerPackDetailsCapturedAt || saved.seller_pack_details_captured_at || saved.sellerPackDetailsComplete === true) return saved

  const form = record(formData)
  const facts = record(form.canonicalSellerFacts).seller
    ? record(form.canonicalSellerFacts)
    : record(listing.sellerCanonicalFacts).seller
      ? record(listing.sellerCanonicalFacts)
      : transformSellerOnboardingToFacts(form, listing, { source: 'seller_pack_onboarding_projection' })
  const seller = record(facts.seller)
  const derivedType = sellerType(seller)
  const savedType = key(saved.sellerType || saved.seller_type || saved.ficaSellerType)
  if (!derivedType) return saved
  if (savedType && derivedType && savedType !== derivedType) return saved

  const savedPath = record(saved.legalPath || saved.legal_path || saved.sellerPackProfile || saved.seller_pack_profile)
  const savedNatural = record(savedPath.natural)
  const savedJuristic = record(savedPath.juristic)
  const company = record(seller.company)
  const trust = record(seller.trust)
  const closeCorporation = record(seller.close_corporation || seller.closeCorporation)
  const maritalSetup = first(saved.maritalSetup, saved.maritalRegime, savedPath.naturalSetup, savedNatural.maritalSetup, naturalSetup(seller, form))
  const owners = filledRows(saved.owners || savedPath.owners || savedNatural.owners, naturalOwners(seller))
  const spouse = record(seller.spouse)
  const juristicEntityType = first(saved.juristicEntityType, savedPath.juristicEntityType, savedJuristic.entityType, entityType(seller))
  const companyDirectors = filledRows(saved.companyDirectors || savedPath.company?.directors || savedJuristic.company?.directors, people(company.directors, 'director'))
  const trustees = filledRows(saved.trustees || savedPath.trust?.trustees || savedJuristic.trust?.trustees, people(trust.trustees, 'trustee'))
  const closeCorporationMembers = filledRows(saved.closeCorporationMembers || savedPath.closeCorporation?.members || savedJuristic.closeCorporation?.members, people(closeCorporation.members, 'member'))
  const pack = {
    ...saved,
    sellerType: savedType || derivedType,
    maritalSetup,
    maritalRegime: maritalSetup,
    owners,
    spouseName: first(saved.spouseName, savedPath.spouse?.name, spouse.name),
    spouseIdNumber: first(saved.spouseIdNumber, savedPath.spouse?.idNumber, savedPath.spouse?.id_number, spouse.id_number),
    spouseEmail: first(saved.spouseEmail, savedPath.spouse?.email, spouse.email),
    spousePhone: first(saved.spousePhone, savedPath.spouse?.phone, spouse.phone),
    juristicEntityType,
    companyName: first(saved.companyName, savedPath.company?.name, savedJuristic.company?.name, company.name),
    companyRegistrationNumber: first(saved.companyRegistrationNumber, savedPath.company?.registrationNumber, company.registration_number),
    companyDirectors,
    trustName: first(saved.trustName, savedPath.trust?.name, savedJuristic.trust?.name, trust.name),
    trustRegistrationNumber: first(saved.trustRegistrationNumber, savedPath.trust?.registrationNumber, trust.registration_number),
    trustees,
    closeCorporationName: first(saved.closeCorporationName, savedPath.closeCorporation?.name, savedJuristic.closeCorporation?.name, closeCorporation.name),
    closeCorporationRegistrationNumber: first(saved.closeCorporationRegistrationNumber, savedPath.closeCorporation?.registrationNumber, closeCorporation.registration_number),
    closeCorporationMembers,
    documents: record(saved.documents || saved.documentUploads || saved.uploads),
  }
  pack.legalPath = {
    ...savedPath,
    sellerType: pack.sellerType,
    legalPathType: pack.sellerType,
    naturalSetup: pack.maritalSetup,
    owners: pack.owners,
    spouse: { ...record(savedPath.spouse), name: pack.spouseName, idNumber: pack.spouseIdNumber, email: pack.spouseEmail, phone: pack.spousePhone },
    natural: { ...savedNatural, maritalSetup: pack.maritalSetup, maritalRegime: pack.maritalSetup, owners: pack.owners },
    juristicEntityType: pack.juristicEntityType,
    juristic: {
      ...savedJuristic,
      entityType: pack.juristicEntityType,
      company: { ...record(savedJuristic.company), name: pack.companyName, registrationNumber: pack.companyRegistrationNumber, directors: pack.companyDirectors },
      trust: { ...record(savedJuristic.trust), name: pack.trustName, registrationNumber: pack.trustRegistrationNumber, trustees: pack.trustees },
      closeCorporation: { ...record(savedJuristic.closeCorporation), name: pack.closeCorporationName, registrationNumber: pack.closeCorporationRegistrationNumber, members: pack.closeCorporationMembers },
    },
  }
  if (isComplete(pack)) {
    pack.sellerPackDetailsComplete = true
    pack.sellerPackDetailsSource = 'seller_onboarding'
    pack.sellerPackDetailsCapturedAt = submittedAt(lead, listing, form)
  }
  return pack
}
