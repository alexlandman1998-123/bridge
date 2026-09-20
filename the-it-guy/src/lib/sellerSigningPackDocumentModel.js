import { PROPERTY_DISCLOSURE_QUESTIONS, normalizePropertyDisclosure } from './propertyDisclosure.js'
import { SELLER_MANDATE_TERMS_DOCUMENT_KEY, buildSellerMandateTermsDocumentModel } from '../core/documents/sellerMandateTermsPolicy.js'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const label = (value) => text(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
const row = (labelText, value) => text(value) ? { label: labelText, value: text(value) } : null

function sellerRows(pack = {}) {
  const seller = record(pack.seller)
  return [
    row('Seller / entity', seller.name), row('First name', seller.firstName), row('Surname', seller.surname),
    row('Legal type', label(seller.legalType)), row('ID / passport number', seller.idNumber), row('Date of birth', seller.dateOfBirth),
    row('Nationality', seller.nationality), row('Country of residence', seller.countryOfResidence), row('Marital status', label(seller.maritalStatus)),
    row('Email', seller.email), row('Mobile', seller.phone),
    row('Company', seller.companyName), row('Company registration number', seller.companyRegistrationNumber),
    row('Company registered address', seller.companyRegisteredAddress),
    row('Trust', seller.trustName), row('Trust registration number', seller.trustRegistrationNumber), row('Trust registered address', seller.trustRegisteredAddress),
  ].filter(Boolean)
}

function partyRows(seller = {}) {
  const parties = Array.isArray(seller.parties) ? seller.parties : []
  const entity = ['company', 'close_corporation', 'foreign_company', 'trust', 'foreign_trust', 'deceased_estate'].includes(text(seller.legalType).toLowerCase())
  if (!parties.length || (parties.length === 1 && !entity)) return []
  return parties.flatMap((party, index) => {
    const person = record(party); const title = `${text(person.role) || 'Seller'} ${index + 1}`
    return [
      row(title, person.name), row(`${title} ID / passport number`, person.idNumber || person.passportNumber),
      row(`${title} income tax number`, person.incomeTaxNumber || person.taxNumber), row(`${title} email`, person.email),
      row(`${title} phone`, person.phone), row(`${title} residential address`, person.residentialAddress || person.address),
    ].filter(Boolean)
  })
}

function mandateParty(seller = {}, signers = []) {
  const company = text(seller.companyName)
  const companyNumber = text(seller.companyRegistrationNumber)
  const trust = text(seller.trustName)
  const trustNumber = text(seller.trustRegistrationNumber)
  if (company) return `${company}${companyNumber ? ` (registration number ${companyNumber})` : ''}`
  if (trust) return `${trust}${trustNumber ? ` (trust number ${trustNumber})` : ''}`
  const namedSigners = signers.map((signer) => text(record(signer).name)).filter(Boolean)
  const namedPeople = namedSigners.length > 1 ? namedSigners.join(' and ') : text(seller.name) || namedSigners[0] || 'the seller'
  return `${namedPeople}${text(seller.idNumber) ? `, ID/passport number ${text(seller.idNumber)}` : ''}`
}

function mandateDocument(pack = {}) {
  const mandate = record(pack.mandate); const packBranding = record(pack.branding); const branding = Object.keys(packBranding).length ? packBranding : record(mandate.branding); const seller = record(pack.seller); const signers = Array.isArray(pack.signers) ? pack.signers : []
  const agencyName = text(branding.organisationName) || 'the appointed estate agency'
  const property = text(mandate.propertyAddress) || text(record(pack.property).address) || 'the property described in this signing pack'
  const mandateType = text(mandate.mandateType).toLowerCase() || 'sole'
  const mandateTitle = mandateType === 'dual' ? 'Dual mandate' : mandateType === 'tri' ? 'Tri mandate' : mandateType === 'open' ? 'Open mandate' : 'Sole mandate'
  const attorney = record(pack.proposedTransferAttorney)
  const appointment = mandateType === 'open'
    ? `authorise ${agencyName} to market and introduce purchasers for ${property} on a non-exclusive basis`
    : mandateType === 'dual'
      ? `appoint ${agencyName} and authorise it to market and introduce purchasers for ${property} on a dual mandate`
      : mandateType === 'tri'
        ? `appoint ${agencyName} and authorise it to market and introduce purchasers for ${property} on a tri mandate`
        : `appoint ${agencyName} as the sole agency and authorise it to market and introduce purchasers for ${property}`
  return {
    key: 'mandate', title: mandateTitle,
    introduction: `I/We, ${mandateParty(seller, signers)}, ${appointment}, subject to the mandate terms and commercial details below.`,
    sections: [{ title: 'Mandate details', rows: [row('Appointing seller or entity', mandateParty(seller, signers)), row('Property', property), row('Mandate type', label(mandate.mandateType)), row('Asking price', mandate.askingPrice), row('Commission basis', label(mandate.commissionBasis)), row('Commission', mandate.commissionBasis === 'fixed' ? mandate.commissionAmount : mandate.commissionPercentage ? `${mandate.commissionPercentage}%` : ''), row('VAT treatment', mandate.vatHandling), row('Proposed conveyancing attorney', attorney.companyName), row('Attorney contact', [attorney.contactPerson, attorney.email, attorney.phone].filter(Boolean).join(' · '))].filter(Boolean) }],
    declaration: 'I/We confirm that the mandate information shown above is correct and that I/we have authority to appoint the agency for this property.',
  }
}

function disclosureDocument(pack = {}) {
  const disclosure = normalizePropertyDisclosure(record(pack.disclosure))
  return {
    key: 'disclosure', title: 'Property disclosure form',
    introduction: 'This is the frozen property-condition disclosure supplied for this listing. Please review every answer and any accompanying note.',
    questions: PROPERTY_DISCLOSURE_QUESTIONS.map((question) => {
      const response = record(disclosure.responses?.[question.key])
      return { question: `${question.number}. ${question.text}`, answer: text(response.answer) ? label(response.answer) : 'Not answered', note: text(response.note) }
    }),
    declaration: 'I/We confirm that this disclosure records the property information supplied to date, to the best of my/our knowledge.',
  }
}

function ficaDocument(pack = {}) {
  const seller = record(pack.seller); const property = record(pack.property); const signers = Array.isArray(pack.signers) ? pack.signers : []
  return {
    key: 'fica', title: 'Seller FICA declaration',
    introduction: 'Confirm the seller or entity details for FICA/KYC compliance.',
    sections: [{ title: 'FICA details', rows: [...sellerRows(pack), ...partyRows(seller), row('Residential address', seller.residentialAddress || seller.address), row('Income tax number', seller.incomeTaxNumber || seller.taxNumber), row('Property', property.address), row('Title deed number', property.titleDeedNumber), row('Bond status', property.bondStatus), ...signers.map((signer, index) => row(`Authorised signer ${index + 1}`, [text(signer.name), text(signer.role), text(signer.email)].filter(Boolean).join(' · ')))].filter(Boolean) }],
    declaration: 'I/We declare that the information shown in this seller FICA declaration is true and complete to the best of my/our knowledge, and authorise its use for FICA/KYC compliance for this property transaction.',
  }
}

export function buildSellerSigningDocumentModel(signingPack = {}, documentKey = '') {
  const pack = record(signingPack)
  if (documentKey === SELLER_MANDATE_TERMS_DOCUMENT_KEY) return buildSellerMandateTermsDocumentModel(pack.sellerMandateTerms)
  if (documentKey === 'disclosure') return disclosureDocument(pack)
  if (documentKey === 'fica') return ficaDocument(pack)
  return mandateDocument(pack)
}
