export const FICA_DECLARATION_DOCUMENT_MODEL_CONTRACT = 'arch9-fica-declaration-document-model-v1'
export const FICA_DECLARATION_WORDING_VERSION = 'arch9_fica_declaration_v1'

export const DEFAULT_FICA_DECLARATION_WORDING =
  'I/We declare that the information supplied in this FICA declaration is true and complete to the best of my/our knowledge. I/We authorise Arch9 and the transaction team to use this information and the supporting documents for FICA/KYC compliance and for progressing this property transaction.'

function text(value) {
  return String(value ?? '').trim()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function rows(value) {
  return Array.isArray(value)
    ? value
        .map((item) => ({ label: text(item?.label), value: text(item?.value) }))
        .filter((item) => item.label && item.value)
    : []
}

function label(value) {
  return text(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function partyLabel(partyType) {
  return text(partyType).toLowerCase() === 'seller' ? 'Seller' : 'Buyer'
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function buildPartySection(party = {}, partyType = 'buyer') {
  const source = record(party)
  const result = []
  const partyName = firstText(source.name, source.fullName, source.full_name, [source.firstName, source.first_name, source.surname].filter(Boolean).join(' '))
  const entityType = firstText(source.entityType, source.entity_type, source.legalType, source.legal_type, source.type)

  if (partyName) result.push({ label: `${partyLabel(partyType)} name`, value: partyName })
  if (entityType) result.push({ label: 'Entity type', value: label(entityType) })
  if (source.idNumber || source.id_number || source.passportNumber || source.passport_number) {
    result.push({ label: 'ID / passport number', value: firstText(source.idNumber, source.id_number, source.passportNumber, source.passport_number) })
  }
  if (source.email) result.push({ label: 'Email', value: text(source.email) })
  if (source.mobile || source.phone) result.push({ label: 'Mobile', value: firstText(source.mobile, source.phone) })
  if (source.residentialAddress || source.residential_address || source.address) {
    result.push({ label: 'Residential address', value: firstText(source.residentialAddress, source.residential_address, source.address) })
  }
  return result.length ? { title: partyLabel(partyType), rows: result } : null
}

function buildEntitySection(party = {}) {
  const source = record(party)
  const entity = record(source.entity)
  const result = []
  const entityName = firstText(entity.name, source.entityName, source.entity_name, source.companyName, source.company_name, source.trustName, source.trust_name)
  const registrationNumber = firstText(entity.registrationNumber, entity.registration_number, source.registrationNumber, source.registration_number)
  const authority = firstText(entity.authorityBasis, entity.authority_basis, source.authorityBasis, source.authority_basis, source.capacity)

  if (entityName) result.push({ label: 'Entity name', value: entityName })
  if (registrationNumber) result.push({ label: 'Registration number', value: registrationNumber })
  if (authority) result.push({ label: 'Authority basis', value: authority })
  return result.length ? { title: 'Entity / Authority', rows: result } : null
}

function buildPropertySection(property = {}, transaction = {}) {
  const safeProperty = record(property)
  const safeTransaction = record(transaction)
  const result = []
  const address = firstText(safeProperty.address, safeProperty.propertyAddress, safeProperty.property_address, safeTransaction.propertyAddress, safeTransaction.property_address)
  const reference = firstText(safeTransaction.reference, safeTransaction.transactionReference, safeTransaction.transaction_reference, safeTransaction.id)

  if (address) result.push({ label: 'Property address', value: address })
  if (reference) result.push({ label: 'Transaction reference', value: reference })
  return result.length ? { title: 'Property / Transaction', rows: result } : null
}

function buildRequirementsSection(documentRequirements = []) {
  const values = Array.isArray(documentRequirements) ? documentRequirements : []
  const result = values
    .map((item) => {
      const requirement = record(item)
      const name = firstText(requirement.label, requirement.name, requirement.documentLabel, requirement.document_label, requirement.key)
      const status = firstText(requirement.status, requirement.requirementLevel, requirement.requirement_level)
      return name ? { label: name, value: status ? label(status) : 'Required' } : null
    })
    .filter(Boolean)
  return result.length ? { title: 'Supporting documents', rows: result } : null
}

function normalizeSigners(signing = {}, partyType = 'buyer') {
  const source = record(signing)
  const values = Array.isArray(source.signers) ? source.signers : Array.isArray(source.signingState?.signers) ? source.signingState.signers : []
  return values.map((signer, index) => {
    const item = record(signer)
    return {
      id: firstText(item.id, `signer-${index + 1}`),
      name: firstText(item.name, item.full_name, item.fullName, `${index === 0 ? 'Primary' : 'Additional'} signer`),
      roleLabel: firstText(item.roleLabel, item.role_label, label(item.role), partyLabel(partyType)),
      email: text(item.email),
      mobile: firstText(item.mobile, item.phone),
      status: firstText(item.statusLabel, item.status_label, label(item.status), 'Pending'),
      signedAt: firstText(item.signedAt, item.signed_at),
      signature: firstText(record(item.signature).value, record(item.signature).dataUrl, item.signature, item.signatureValue, item.signature_value),
      authorityRequired: Boolean(item.authorityRequired || item.authority_required),
      authorityLabel: firstText(item.authorityLabel, item.authority_label, record(item.authorityRequirement).label),
    }
  })
}

function normalizeSections(sections = [], fallbackSections = []) {
  const supplied = Array.isArray(sections) && sections.length ? sections : fallbackSections
  return supplied
    .map((section) => ({ title: text(section?.title), rows: rows(section?.rows) }))
    .filter((section) => section.title && section.rows.length)
}

export function buildFicaDeclarationDocumentModel({
  partyType = 'buyer',
  party = {},
  transaction = {},
  property = {},
  signing = {},
  documentRequirements = [],
  branding = {},
  declaration = {},
  sections = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const normalizedPartyType = text(partyType).toLowerCase() === 'seller' ? 'seller' : 'buyer'
  const safeDeclaration = record(declaration)
  const fallbackSections = [
    buildPartySection(party, normalizedPartyType),
    buildEntitySection(party),
    buildPropertySection(property, transaction),
    buildRequirementsSection(documentRequirements),
  ].filter(Boolean)
  const normalizedSections = normalizeSections(sections, fallbackSections)
  const partyName = firstText(record(party).name, record(party).fullName, record(party).full_name)
  const documentReference = firstText(
    safeDeclaration.documentReference,
    safeDeclaration.document_reference,
    record(transaction).reference,
    record(transaction).transactionReference,
    record(transaction).transaction_reference,
    record(transaction).id,
  )

  return {
    contract: FICA_DECLARATION_DOCUMENT_MODEL_CONTRACT,
    partyType: normalizedPartyType,
    partyLabel: partyLabel(normalizedPartyType),
    title: `${partyLabel(normalizedPartyType)} FICA Declaration`,
    generatedAt: text(generatedAt) || new Date().toISOString(),
    documentReference,
    partyName,
    sections: normalizedSections,
    signers: normalizeSigners(signing, normalizedPartyType),
    declaration: {
      wording: firstText(safeDeclaration.wording, safeDeclaration.wordingSnapshot, safeDeclaration.wording_snapshot, DEFAULT_FICA_DECLARATION_WORDING),
      wordingVersion: firstText(safeDeclaration.wordingVersion, safeDeclaration.wording_version, FICA_DECLARATION_WORDING_VERSION),
    },
    branding: record(branding),
  }
}

export function getBuyerFicaDeclarationRequirement() {
  return {
    key: 'buyer_fica_declaration',
    label: 'Buyer FICA Declaration',
    documentType: 'buyer_fica_declaration',
    category: 'fica_declaration',
    source: 'buyer_onboarding.fica_declaration',
    systemGenerated: true,
  }
}
