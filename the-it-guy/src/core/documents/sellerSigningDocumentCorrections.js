import { normalizeSellerMandateCapture, readSellerMandateTerms, validateSellerMandateCapture, getSellerMandateTermsMissing } from '../../lib/sellerMandateCapture.js'
import { buildSellerMandateDocumentMarkup, requireSellerMandateWording } from './sellerMandateDocumentMarkup.js'
import { buildSellerFicaDueDiligenceMarkup } from './sellerFicaDueDiligenceMarkup.js'
import { buildFicaDeclarationDocumentModel } from './ficaDeclarationDocumentModel.js'
import { buildSellerComplianceDocumentModel } from './sellerComplianceDocumentModel.js'
import { buildPropertyDisclosureDocumentMarkup, normalizePropertyDisclosure, PROPERTY_DISCLOSURE_QUESTIONS } from '../../lib/propertyDisclosure.js'

const text = value => String(value ?? '').trim()
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const people = value => Array.isArray(value) ? value.map(record) : []
const first = (...values) => values.map(text).find(Boolean) || ''
const name = person => first(person.fullName, person.full_name, [person.firstName || person.first_name || person.name, person.surname || person.lastName || person.last_name].filter(Boolean).join(' '))
const identity = person => first(person.idNumber, person.id_number, person.passportNumber, person.passport_number)

const fields = {
  common: ['sellerName', 'idNumber', 'residentialAddress', 'email', 'phone', 'propertyAddress'],
  fica: ['idType', 'saResident', 'incomeTaxNumber', 'maritalStatus', 'employer', 'jobTitle', 'occupation', 'industryOfBusiness', 'countriesOfTrade', 'dualUseGoods', 'armsWeapons', 'actingOnBehalfOfAnother', 'heirInEstate', 'sourceOfWealth', 'sourceOfIncome', 'politicallyInfluentialPerson', 'bankName', 'accountName', 'accountNumber', 'accountType'],
  mandate: ['mandateDuration', 'mandateType', 'otherAgencyName', 'askingPrice', 'startDate', 'endDate', 'protectionPeriod', 'specialConditions', 'commissionBasis', 'commissionPercentage', 'commissionAmount', 'vatHandling'],
  disclosure: ['comments', 'remoteControlsQuantity'],
}
const ficaAliases = {
  incomeTaxNumber: ['sellerTaxNumber', 'incomeTaxNumber', 'income_tax_number', 'taxNumber', 'tax_number'],
  saResident: ['saResident', 'sa_resident', 'taxResident', 'tax_resident'],
  sourceOfIncome: ['sourceOfFunds', 'source_of_funds', 'sourceOfIncome'],
  politicallyInfluentialPerson: ['politicallyExposedPerson', 'politically_exposed_person', 'politicallyInfluentialPerson'],
}
const extraFicaLabels = {
  idType: 'ID type', employer: 'Employer', jobTitle: 'Job title', industryOfBusiness: 'Industry of business',
  countriesOfTrade: 'Countries of trade', dualUseGoods: 'Dual use goods', armsWeapons: 'Arms or weapons',
  actingOnBehalfOfAnother: 'Acting for another person', heirInEstate: 'Heir in an estate', sourceOfWealth: 'Source of wealth',
  bankName: 'Bank name', accountName: 'Account name', accountNumber: 'Account number', accountType: 'Account type',
}
const ficaLabels = { ...extraFicaLabels, incomeTaxNumber: 'Income tax number', saResident: 'SA resident / tax resident',
  maritalStatus: 'Marital status', occupation: 'Main occupation / business activity', sourceOfIncome: 'Source of funds / wealth', politicallyInfluentialPerson: 'Politically exposed person' }
const personCollections = ['multipleOwners', 'multiple_owners', 'owners', 'companyDirectors', 'company_directors', 'directors', 'companyBeneficialOwners', 'trustees', 'trustBeneficiaries', 'beneficiaries', 'executors', 'powerOfAttorneyRepresentatives']
const entityTypes = new Set(['company', 'close_corporation', 'foreign_company', 'trust', 'foreign_trust', 'deceased_estate', 'power_of_attorney', 'other'])

function frozenFicaModel(copy) {
  const drafts = record(copy.form?.sellerPostOnboardingDrafts || copy.form?.seller_post_onboarding_drafts)
  const draft = people(drafts.documents).find(row => text(row.targetRequirementKey || row.requirementKey || row.key) === 'signed_fica_declaration')
  return record(draft?.metadata?.ficaDeclarationModel)
}

function normalizeDisclosure(form) {
  const raw = record(form.propertyDisclosure || form.property_disclosure)
  return normalizePropertyDisclosure(raw, { kind: raw.kind || 'residential' })
}

function samePerson(person, target) {
  const email = text(person.email).toLowerCase(), targetEmail = text(target.email).toLowerCase()
  if (email && targetEmail) return email === targetEmail
  const id = identity(person), targetId = identity(target)
  if (id && targetId) return id === targetId
  return Boolean(name(person) && name(person) === name(target))
}

function primaryPerson(copy) {
  const pack = record(copy.pack?.signingPackSnapshot), seller = record(pack.seller)
  const signer = people(copy.document?.requiredSigners)[0] || people(copy.signers)[0] || people(pack.signers)[0] || seller
  const parties = people(seller.parties)
  const emailMatches = parties.filter(person => text(person.email) && text(person.email).toLowerCase() === text(signer.email).toLowerCase())
  const nameMatches = parties.filter(person => name(person) === name(signer))
  return emailMatches.length === 1 ? emailMatches[0] : nameMatches.length === 1 ? nameMatches[0] : { ...seller, fullName: name(signer) || name(seller) }
}

/** Values shown in the editor use the same captured facts that regeneration reads. */
export function buildSellerSigningCorrectionEditData(copy, key, saved = {}) {
  const pack = record(copy.pack?.signingPackSnapshot), seller = record(pack.seller), person = primaryPerson(copy)
  const form = record(copy.form), fica = record(form.fica || form.ficaDetails || form.fica_details)
  const frozenRows = people(frozenFicaModel(copy).sections).flatMap(section => people(section.rows))
  const common = {
    sellerName: name(person), idNumber: identity(person), residentialAddress: first(person.residentialAddress, person.residential_address, seller.residentialAddress),
    email: text(person.email ?? seller.email), phone: text(person.phone ?? person.mobile ?? seller.phone), propertyAddress: text(pack.property?.address),
  }
  const ficaValues = {}
  const booleanFields = new Set(['saResident', 'dualUseGoods', 'armsWeapons', 'actingOnBehalfOfAnother', 'heirInEstate', 'politicallyInfluentialPerson'])
  for (const field of fields.fica) {
    const aliases = ficaAliases[field] || [field]
    const captured = aliases.map(alias => form[alias]).find(value => value !== undefined && value !== null)
    const value = text(captured ?? fica[field] ?? seller[field] ?? frozenRows.find(row => row.label === ficaLabels[field])?.value ?? '')
    ficaValues[field] = booleanFields.has(field)
      ? (['true', 'yes', '1', ...(field === 'saResident' ? ['sa_resident'] : [])].includes(value.toLowerCase()) ? 'yes' : ['false', 'no', '0', ...(field === 'saResident' ? ['non_resident'] : [])].includes(value.toLowerCase()) ? 'no' : value)
      : value
  }
  const mandate = record(pack.mandate), commission = record(copy.approval?.commission)
  const mandateValues = Object.fromEntries(fields.mandate.map(field => [field, text(mandate[field] ?? {
    protectionPeriod: mandate.protectionPeriodDays, otherAgencyName: mandate.coAgencyName || mandate.co_agency_name,
    commissionBasis: commission.basis, commissionPercentage: commission.percentage, commissionAmount: commission.amount, vatHandling: commission.vatHandling,
  }[field])]))
  const mergedMandate = { ...readSellerMandateTerms(mandate), ...mandateValues, ...record(saved.mandate) }
  mergedMandate.mandateDuration ||= readSellerMandateTerms(mandate).mandateDuration
  if (mergedMandate.mandateType === 'open' && mergedMandate.mandateDuration === 'until_cancelled') mergedMandate.endDate = ''
  if (key === 'signed_mandate') {
    const variant = requireSellerMandateWording(mergedMandate.mandateType)
    mergedMandate.mandateType = variant === 'exclusive' ? 'sole' : variant
  }
  const disclosure = normalizeDisclosure(form)
  return {
    common: { ...common, ...record(saved.common) },
    ...(key === 'signed_fica_declaration' ? { fica: { ...ficaValues, ...record(saved.fica) } } : {}),
    ...(key === 'signed_mandate' ? { mandate: mergedMandate } : {}),
    ...(key === 'signed_disclosure_form' ? { disclosure: { comments: disclosure.comments, remoteControlsQuantity: disclosure.remoteControlsQuantity, responses: disclosure.responses, ...record(saved.disclosure) }, questions: PROPERTY_DISCLOSURE_QUESTIONS.map(({ key: questionKey, text: label, number }) => ({ key: questionKey, label, number })) } : {}),
  }
}

export function validateSellerSigningDocumentCorrections(value, key) {
  if (!['signed_fica_declaration', 'signed_mandate', 'signed_disclosure_form'].includes(key)) throw new Error('This document cannot be corrected.')
  /** @type {Record<string, Record<string, unknown>>} */
  const result = {}
  for (const section of ['common', key === 'signed_fica_declaration' ? 'fica' : key === 'signed_mandate' ? 'mandate' : 'disclosure']) {
    const input = record(value[section]), clean = {}
    for (const field of fields[section]) {
      const entry = text(input[field])
      if (entry.length > (field === 'comments' || field === 'specialConditions' ? 4000 : 500)) throw new Error('A corrected field is too long.')
      clean[field] = entry
    }
    if (section === 'disclosure') {
      const answers = record(input.responses), responses = {}
      for (const question of PROPERTY_DISCLOSURE_QUESTIONS) {
        const response = record(answers[question.key]), answer = text(response.answer).toLowerCase(), note = text(response.note)
        if (!['', 'yes', 'no', 'unsure'].includes(answer) || note.length > 2000) throw new Error('A disclosure answer is invalid.')
        responses[question.key] = { answer, note }
      }
      clean.responses = responses
    }
    if (section === 'common' && (text(clean.sellerName).length < 2 || text(clean.propertyAddress).length < 5)) throw new Error('Enter the seller name and property address before saving.')
    if (section === 'mandate') {
      requireSellerMandateWording(clean.mandateType)
      const capture = validateSellerMandateCapture(input.mandateCapture)
      if (capture) clean.mandateCapture = capture
      clean.mandateType = readSellerMandateTerms(clean).mandateType
      clean.mandateDuration = readSellerMandateTerms(clean).mandateDuration
      // Existing records without schedules keep their legacy shape. Incomplete schedules may be saved,
      // but preparation applies the full requirements separately.
      const missing = getSellerMandateTermsMissing(clean, { requireCapture: false })
      if (missing.length) throw new Error(`Complete valid mandate terms: ${missing.join('; ')}.`)
      if (clean.mandateType === 'open' && clean.mandateDuration === 'until_cancelled') clean.endDate = ''
    }
    result[section] = clean
  }
  return result
}

function correctedPerson(person, common) {
  const parts = text(common.sellerName).split(/\s+/), firstName = parts.slice(0, -1).join(' ') || parts[0], surname = parts.length > 1 ? parts.at(-1) : ''
  return { ...person, name: common.sellerName, fullName: common.sellerName, full_name: common.sellerName,
    firstName, first_name: firstName, surname, lastName: surname, last_name: surname,
    idNumber: common.idNumber, id_number: common.idNumber,
    ...(person.passportNumber !== undefined ? { passportNumber: common.idNumber } : {}),
    ...(person.passport_number !== undefined ? { passport_number: common.idNumber } : {}),
    residentialAddress: common.residentialAddress, residential_address: common.residentialAddress,
    email: common.email, phone: common.phone, mobile: common.phone,
  }
}

/** A local projection only: source onboarding, reviewed versions and evidence are never mutated. */
export function projectSellerSigningDocumentCorrections(copy, corrections) {
  const pack = structuredClone(record(copy.pack?.signingPackSnapshot)), form = structuredClone(record(copy.form))
  const seller = record(pack.seller), target = primaryPerson(copy), common = record(corrections.common)
  const branch = text(seller.ownershipType || seller.legalType).toLowerCase()
  const ownsPrimary = !entityTypes.has(branch) && (identity(target) && identity(target) === text(seller.legalOwnerIdentity) || name(target) && name(target) === text(seller.legalOwnerName) || !text(seller.legalOwnerName))
  pack.seller = { ...correctedPerson(seller, common),
    ...(ownsPrimary ? { legalOwnerName: common.sellerName, legalOwnerIdentity: common.idNumber } : {}),
    parties: people(seller.parties).map(person => samePerson(person, target) ? correctedPerson(person, common) : person),
  }
  // Recipient routing and authority remain frozen; only the reviewed name changes.
  const required = people(copy.document?.requiredSigners)
  pack.signers = (required.length ? required : people(pack.signers)).map((signer, index) => index === 0 ? { ...signer, name: common.sellerName } : signer)
  pack.property = { ...record(pack.property), address: common.propertyAddress }
  pack.mandate = { ...record(pack.mandate), propertyAddress: common.propertyAddress }
  for (const collection of personCollections) {
    if (Array.isArray(form[collection])) form[collection] = form[collection].map(person => samePerson(record(person), target) ? correctedPerson(person, common) : person)
  }
  const updated = correctedPerson(target, common)
  Object.assign(form, { sellerFirstName: updated.firstName, sellerSurname: updated.surname, sellerName: common.sellerName,
    primaryContactName: common.sellerName, contactName: common.sellerName, idNumber: common.idNumber,
    residentialAddress: common.residentialAddress, residential_address: common.residentialAddress,
    sellerResidentialAddress: common.residentialAddress, physicalAddress: common.residentialAddress,
    domiciliumAddress: common.residentialAddress, domicilium_address: common.residentialAddress, address: common.residentialAddress,
    email: common.email, sellerEmail: common.email, phone: common.phone, sellerPhone: common.phone, mobile: common.phone,
    propertyAddress: common.propertyAddress,
  })
  if (branch === 'foreign_individual' || form.foreignPassportNumber !== undefined || form.passportNumber !== undefined) {
    form.foreignPassportNumber = common.idNumber; form.passportNumber = common.idNumber
  }
  for (const prefix of ['companyDirector', 'authorisedSignatory', 'trustee', 'authorisedTrustee', 'executor', 'powerOfAttorney']) {
    if (samePerson({ name: form[`${prefix}Name`], idNumber: form[`${prefix}IdNumber`], email: form[`${prefix}Email`] }, target)) {
      Object.assign(form, { [`${prefix}Name`]: common.sellerName, [`${prefix}IdNumber`]: common.idNumber,
        [`${prefix}Email`]: common.email, [`${prefix}Phone`]: common.phone, [`${prefix}Address`]: common.residentialAddress })
    }
  }
  // Older forms can keep these rosters only in their frozen signing snapshot.
  const rosters = branch === 'multiple_owners' ? [['multipleOwners', ['seller', 'owner'], ['multiple_owners', 'owners']]]
    : ['company', 'close_corporation', 'foreign_company'].includes(branch) ? [['companyDirectors', ['director'], ['company_directors', 'directors']], ['companyBeneficialOwners', ['beneficial owner'], []]]
      : ['trust', 'foreign_trust'].includes(branch) ? [['trustees', ['trustee'], []], ['trustBeneficiaries', ['beneficiary'], ['beneficiaries']]]
        : branch === 'deceased_estate' ? [['executors', ['executor'], []]]
          : branch === 'power_of_attorney' ? [['powerOfAttorneyRepresentatives', ['representative'], []]] : []
  for (const [collection, roles, aliases] of rosters) {
    if (!people(form[collection]).length) {
      form[collection] = aliases.map(alias => people(form[alias])).find(rows => rows.length)
        || people(pack.seller.parties).filter(person => roles.includes(text(person.role).toLowerCase()))
    }
  }
  const fica = record(corrections.fica)
  for (const [field, value] of Object.entries(fica)) {
    for (const alias of ficaAliases[field] || [field]) form[alias] = value
  }
  form.fica = { ...record(form.fica || form.ficaDetails || form.fica_details), ...fica }
  return { pack, form }
}

export function assertSellerMandateCorrectionSchedules(copy, key, corrections) {
  if (copy.document?.mandateContract) throw new Error('The full mandate inputs are frozen. Prepare a replacement copy with fresh approvals before changing any details.')
  if (key !== 'signed_mandate') return
  const captured = normalizeSellerMandateCapture(copy.pack?.signingPackSnapshot?.mandate?.mandateCapture)
  if (JSON.stringify(normalizeSellerMandateCapture(corrections.mandate?.mandateCapture)) !== JSON.stringify(captured)) {
    throw new Error('Revised mandate schedules must be saved in Seller information for review. Their contract requires the revised layout and approved signing template.')
  }
}

export function renderSellerSigningDocumentCorrections(copy, key, corrections, listingId) {
  assertSellerMandateCorrectionSchedules(copy, key, corrections)
  const { pack, form } = projectSellerSigningDocumentCorrections(copy, corrections)
  const seller = record(pack.seller), branding = record(pack.branding), generatedAt = text(pack.frozenAt)
  if (key === 'signed_mandate') {
    const terms = record(corrections.mandate)
    pack.mandate = { ...pack.mandate, ...terms, protectionPeriodDays: terms.protectionPeriod, mandateTerms: terms.specialConditions }
    const approval = { ...copy.approval, commission: { ...record(copy.approval?.commission), basis: terms.commissionBasis,
      percentage: terms.commissionPercentage, amount: terms.commissionAmount, vatHandling: terms.vatHandling } }
    return buildSellerMandateDocumentMarkup({ signingPack: pack, approval, generatedAt })
  }
  const signing = { signers: people(pack.signers).map(signer => ({ ...signer, status: 'Pending', signedAt: '', signature: '' })), complete: false }
  const compliance = buildSellerComplianceDocumentModel({ formData: form, signing, generatedAt })
  if (key === 'signed_fica_declaration') {
    const frozen = frozenFicaModel(copy)
    // The editor accepts a complete address, not structured address components.
    // Use it verbatim instead of recombining stale suburb/city aliases.
    const sections = compliance.ficaSections.map(section => ({ ...section,
      rows: section.rows.map(row => row.label === 'Property address' ? { ...row, value: pack.property.address } : row),
    }))
    const extraRows = Object.entries(extraFicaLabels).flatMap(([field, label]) => text(corrections.fica?.[field]) ? [{ label, value: text(corrections.fica[field]) }] : [])
    if (text(corrections.fica?.maritalStatus) && !sections.some(section => section.rows.some(row => row.label === 'Marital status'))) {
      extraRows.push({ label: 'Primary signer marital status', value: text(corrections.fica.maritalStatus) })
    }
    if (extraRows.length) sections.push({ title: 'Additional FICA details', rows: extraRows })
    // Keep captured facts that older forms stored only in their reviewed model.
    // Changed/cleared rows are replaced, never resurrected from that model.
    const replacedLabels = new Set(['Seller name', 'Primary contact', 'ID / passport number', 'Signatory ID / passport', 'Trustee ID / passport', 'Residential address', 'Email', 'Mobile', 'Owners', 'Directors', 'Trustees', 'Beneficial owners / controllers', 'Beneficiaries', 'Property address', ...Object.values(ficaLabels)])
    for (const section of people(frozen.sections)) {
      let current = sections.find(value => value.title === section.title)
      const retained = people(section.rows).filter(row => !replacedLabels.has(row.label) && !current?.rows.some(value => value.label === row.label))
      if (retained.length) {
        if (!current) { current = { title: section.title, rows: [] }; sections.push(current) }
        current.rows.push(...retained)
      }
    }
    const model = buildFicaDeclarationDocumentModel({ partyType: 'seller', party: seller, property: pack.property,
      transaction: { reference: frozen.documentReference || pack.documentReference }, sections, signing, branding, generatedAt,
      declaration: record(frozen.declaration),
    })
    return buildSellerFicaDueDiligenceMarkup({ model, signingPack: pack, branding, generatedAt })
  }
  const original = normalizeDisclosure(form)
  const disclosure = { ...original, ...record(corrections.disclosure), otherDisclosure: text(corrections.disclosure?.comments),
    signature: '', signedAt: '', signedPlace: '', declarationAccepted: false,
    sellerWitness1: '', sellerWitness2: '', purchaserSignature1: '', purchaserSignature2: '',
    purchaserSignedAt: '', purchaserSignedPlace: '', purchaserWitness1: '', purchaserWitness2: '',
  }
  disclosure.decision = PROPERTY_DISCLOSURE_QUESTIONS.some(question => ['yes', 'unsure'].includes(text(record(disclosure.responses?.[question.key]).answer))) ? 'disclose' : 'none'
  const ownerParties = people(seller.parties).filter(person => ['seller', 'owner'].includes(text(person.role).toLowerCase()))
  return buildPropertyDisclosureDocumentMarkup(disclosure, {
    sellerName: ownerParties.length ? ownerParties.map(name).join(', ') : text(seller.legalOwnerName ?? seller.name),
    sellerIdNumber: ownerParties.length ? ownerParties.map(identity).filter(Boolean).join(', ') : text(seller.legalOwnerIdentity ?? seller.idNumber),
    propertyAddress: pack.property.address, listingId, documentReference: pack.documentReference, branding,
    sellerCompliancePack: { ...compliance, ficaSections: [] },
  })
}
