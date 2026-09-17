import { PROPERTY_DISCLOSURE_QUESTIONS, normalizePropertyDisclosure } from './propertyDisclosure.js'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const label = (value) => text(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
const row = (labelText, value) => text(value) ? { label: labelText, value: text(value) } : null

function sellerRows(pack = {}) {
  const seller = record(pack.seller)
  return [
    row('Seller / entity', seller.name), row('Legal type', label(seller.legalType)), row('ID / passport number', seller.idNumber),
    row('Marital status', label(seller.maritalStatus)), row('Email', seller.email), row('Mobile', seller.phone),
    row('Company', seller.companyName), row('Company registration number', seller.companyRegistrationNumber),
    row('Trust', seller.trustName), row('Trust registration number', seller.trustRegistrationNumber),
  ].filter(Boolean)
}

function mandateDocument(pack = {}) {
  const mandate = record(pack.mandate); const branding = record(mandate.branding); const seller = record(pack.seller)
  const agencyName = text(branding.organisationName) || 'the appointed estate agency'
  const property = text(mandate.propertyAddress) || text(record(pack.property).address) || 'the property described in this signing pack'
  return {
    key: 'mandate', title: 'Exclusive mandate',
    introduction: `I/We, ${text(seller.name) || 'the seller'}, authorise ${agencyName} to market and introduce purchasers for ${property}, subject to the mandate terms and commercial details below.`,
    sections: [{ title: 'Mandate details', rows: [row('Property', property), row('Mandate type', label(mandate.mandateType)), row('Asking price', mandate.askingPrice), row('Commission basis', label(mandate.commissionBasis)), row('Commission', mandate.commissionBasis === 'fixed' ? mandate.commissionAmount : mandate.commissionPercentage ? `${mandate.commissionPercentage}%` : ''), row('VAT treatment', mandate.vatHandling)].filter(Boolean) }],
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
    introduction: 'This declaration records the seller identity, entity and property context for FICA/KYC compliance. Supporting FICA documents remain separate requirements.',
    sections: [{ title: 'FICA details', rows: [...sellerRows(pack), row('Residential address', seller.residentialAddress || seller.address), row('Income tax number', seller.incomeTaxNumber || seller.taxNumber), row('Property', property.address), row('Title deed number', property.titleDeedNumber), row('Bond status', property.bondStatus), ...signers.map((signer, index) => row(`Authorised signer ${index + 1}`, [text(signer.name), text(signer.role), text(signer.email)].filter(Boolean).join(' · ')))].filter(Boolean) }],
    declaration: 'I/We declare that the information shown in this seller FICA declaration is true and complete to the best of my/our knowledge, and authorise its use for FICA/KYC compliance for this property transaction.',
  }
}

export function buildSellerSigningDocumentModel(signingPack = {}, documentKey = '') {
  const pack = record(signingPack)
  if (documentKey === 'disclosure') return disclosureDocument(pack)
  if (documentKey === 'fica') return ficaDocument(pack)
  return mandateDocument(pack)
}
