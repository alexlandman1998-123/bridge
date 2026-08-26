import { transformSellerOnboardingToFacts } from '../../services/documents/sellerOnboardingFactTransformer.js'

export const SELLER_COMPLIANCE_DOCUMENT_MODEL_CONTRACT = 'arch9-seller-compliance-document-model-v1'

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function humanize(value = '') {
  const normalized = text(value)
  if (!normalized) return ''
  const label = normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
  return label
    .replace(/\bSa\b/g, 'SA')
    .replace(/\bFica\b/g, 'FICA')
    .replace(/\bPopi\b/g, 'POPI')
    .replace(/\bVat\b/g, 'VAT')
    .replace(/\bHoa\b/g, 'HOA')
    .replace(/\bId\b/g, 'ID')
}

function boolLabel(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return ''
}

function moneyLabel(value) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return text(value)
  return `R ${number.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function fullName(...values) {
  return values.map(text).filter(Boolean).join(' ')
}

function compactAddress(details = {}, fallback = '') {
  const parts = [
    details.line_1 || details.line1,
    details.line_2 || details.line2,
    details.suburb,
    details.city || details.town,
    details.province,
    details.postal_code || details.postalCode,
  ].map(text).filter(Boolean)
  return parts.join(', ') || text(fallback)
}

function addRow(rows, label, value, { format = null } = {}) {
  const normalized = format ? format(value) : text(value)
  if (!normalized) return
  rows.push({ label, value: normalized })
}

function addPeopleRows(rows, label, people = []) {
  if (!Array.isArray(people) || !people.length) return
  const normalizedPeople = people
    .map((person, index) => {
      const name = firstText(person?.full_name, person?.name, `Person ${index + 1}`)
      const idNumber = text(person?.id_number || person?.idNumber)
      const email = text(person?.email)
      const phone = text(person?.phone || person?.mobile)
      return {
        name,
        idNumber,
        email,
        phone,
        summary: [name, idNumber ? `ID ${idNumber}` : '', email, phone].map(text).filter(Boolean).join(' | '),
      }
    })
    .filter((person) => person.summary)
  if (!normalizedPeople.length) return
  rows.push({
    label,
    value: normalizedPeople.map((person) => person.summary).join('\n'),
    type: 'people',
    people: normalizedPeople,
  })
}

function buildSellerSection(facts = {}, formData = {}) {
  const seller = facts.seller || {}
  const rows = []
  const primarySellerKeys = new Set([
    key(firstText(fullName(seller.first_name, seller.surname), formData.sellerName)),
    key(seller.email),
    key(seller.phone),
    key(seller.id_number),
  ].filter(Boolean))
  const additionalOwners = Array.isArray(seller.owners)
    ? seller.owners.filter((owner) => {
      const ownerKeys = [
        key(firstText(owner?.full_name, owner?.name)),
        key(owner?.email),
        key(owner?.phone || owner?.mobile),
        key(owner?.id_number || owner?.idNumber),
      ].filter(Boolean)
      return !ownerKeys.some((ownerKey) => primarySellerKeys.has(ownerKey))
    })
    : []
  addRow(rows, 'Seller name', firstText(fullName(seller.first_name, seller.surname), formData.sellerName))
  addRow(rows, 'Owner type', firstText(seller.branch_label, humanize(seller.owner_structure_type), humanize(seller.legal_type)))
  addRow(rows, 'Owner entity', humanize(seller.owner_entity_type))
  addRow(rows, 'Mobile', seller.phone)
  addRow(rows, 'Email', seller.email)
  addRow(rows, 'ID / passport number', firstText(seller.id_number, seller.foreign?.passport_number))
  addRow(rows, 'Date of birth', seller.date_of_birth)
  addRow(rows, 'Nationality', seller.nationality)
  addRow(rows, 'Marital status', humanize(seller.marital_status))
  addRow(rows, 'Marital regime', humanize(seller.marital_regime))
  addRow(rows, 'Spouse name', seller.spouse?.name)
  addRow(rows, 'Spouse ID number', seller.spouse?.id_number)
  addRow(rows, 'Spouse email', seller.spouse?.email)
  addRow(rows, 'Residential address', seller.residential_address)
  addPeopleRows(rows, 'Additional owners', additionalOwners)
  return { title: 'Seller', rows }
}

function buildEntitySection(facts = {}) {
  const seller = facts.seller || {}
  const rows = []

  if (seller.legal_type === 'company' || seller.owner_entity_type === 'company') {
    addRow(rows, 'Company name', seller.company?.name)
    addRow(rows, 'Registration number', seller.company?.registration_number)
    addRow(rows, 'Authorised signatory', firstText(seller.company?.authorised_signatory?.name, seller.company?.director_name))
    addRow(rows, 'Authority basis', seller.company?.authority_basis)
    addPeopleRows(rows, 'Directors', seller.company?.directors)
  }

  if (seller.legal_type === 'trust' || seller.owner_entity_type === 'trust') {
    addRow(rows, 'Trust name', seller.trust?.name)
    addRow(rows, 'Registration number', seller.trust?.registration_number)
    addRow(rows, 'Authorised trustee', firstText(seller.trust?.authorised_trustee?.name, seller.trust?.trustee_name))
    addRow(rows, 'Authority basis', seller.trust?.authority_basis)
    addPeopleRows(rows, 'Trustees', seller.trust?.trustees)
  }

  if (seller.legal_type === 'deceased_estate') {
    addRow(rows, 'Executor', seller.deceased_estate?.executor_name)
    addRow(rows, 'Estate reference', seller.deceased_estate?.estate_reference)
    addRow(rows, 'Authority details', seller.deceased_estate?.authority_details)
  }

  if (seller.legal_type === 'power_of_attorney') {
    addRow(rows, 'Representative', seller.power_of_attorney?.representative_name)
    addRow(rows, 'Principal', seller.power_of_attorney?.principal?.name)
    addRow(rows, 'Authority reference', seller.power_of_attorney?.reference)
  }

  return rows.length ? { title: 'Entity / Authority', rows } : null
}

function buildPropertySection(facts = {}, listing = {}) {
  const property = facts.property || {}
  const transaction = facts.transaction || {}
  const rows = []
  addRow(rows, 'Property address', compactAddress(property.address_details, property.address || listing?.propertyAddress || listing?.address))
  addRow(rows, 'Property category', firstText(property.property_category_label, humanize(property.property_category)))
  addRow(rows, 'Property type', humanize(property.property_type))
  addRow(rows, 'Ownership scheme', humanize(property.property_structure_type || property.title_type))
  addRow(rows, 'Estate / HOA', property.estate_or_hoa, { format: boolLabel })
  addRow(rows, 'Estate / scheme name', firstText(property.estate?.name, property.scheme?.name))
  addRow(rows, 'Erf number', property.erf_number)
  addRow(rows, 'Unit number', property.unit_number)
  addRow(rows, 'Section number', property.section_number)
  addRow(rows, 'Expected price', firstText(moneyLabel(transaction.asking_price), moneyLabel(listing?.askingPrice || listing?.price)))
  return { title: 'Property', rows }
}

function buildTaxSection(facts = {}) {
  const seller = facts.seller || {}
  const rows = []
  addRow(rows, 'Income tax number', seller.tax_number)
  addRow(rows, 'SA resident / tax resident', humanize(firstText(seller.sa_resident, seller.tax_resident)))
  addRow(rows, 'Foreign owner', seller.foreign_owner, { format: boolLabel })
  addRow(rows, 'Foreign owner country', seller.foreign_owner_country || seller.foreign?.country)
  addRow(rows, 'VAT registered', seller.vat_registered, { format: boolLabel })
  addRow(rows, 'VAT number', seller.vat_number)
  addRow(rows, 'POPI consent', seller.popi_consent)
  addRow(rows, 'POPI accepted at', seller.popi_consent_accepted_at)
  return { title: 'FICA / Tax', rows }
}

function buildSigningSummary(signing = {}) {
  const signers = Array.isArray(signing?.signers) ? signing.signers : Array.isArray(signing?.signingState?.signers) ? signing.signingState.signers : []
  return {
    status: text(signing.status || signing.signingState?.status || 'pending'),
    statusLabel: text(signing.statusLabel || signing.signingState?.statusLabel || ''),
    progressLabel: text(signing.progressLabel || ''),
    complete: Boolean(signing.complete || signing.signingState?.complete),
    signers: signers.map((signer, index) => ({
      id: text(signer?.id || `signer-${index + 1}`),
      name: firstText(signer?.name, signer?.full_name, signer?.roleLabel, `Signer ${index + 1}`),
      roleLabel: firstText(signer?.roleLabel, humanize(signer?.role), 'Seller'),
      email: text(signer?.email),
      mobile: text(signer?.mobile || signer?.phone),
      status: text(signer?.status || 'pending'),
      statusLabel: firstText(signer?.statusLabel, humanize(signer?.status || 'pending')),
      signedAt: text(signer?.signedAt || signer?.signed_at),
      signature: text(
        isPlainObject(signer?.signature)
          ? signer.signature.value || signer.signature.dataUrl || signer.signature.data_url
          : signer?.signature || signer?.signatureValue || signer?.signature_value,
      ),
      signatureType: text(signer?.signature?.type || signer?.signatureType || signer?.signature_type),
      authorityRequired: Boolean(signer?.authorityRequired || signer?.authority_required),
      authorityLabel: text(signer?.authorityRequirement?.label || signer?.authority_label),
    })),
  }
}

export function buildSellerComplianceDocumentModel({
  formData = {},
  listing = {},
  signing = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const safeFormData = isPlainObject(formData) ? formData : {}
  const safeListing = isPlainObject(listing) ? listing : {}
  const facts = transformSellerOnboardingToFacts(safeFormData, safeListing, {
    source: 'seller_compliance_document',
  })
  const sections = [
    buildSellerSection(facts, safeFormData),
    buildEntitySection(facts),
    buildPropertySection(facts, safeListing),
    buildTaxSection(facts),
  ].filter((section) => section?.rows?.length)
  const signingSummary = buildSigningSummary(signing)

  return {
    contract: SELLER_COMPLIANCE_DOCUMENT_MODEL_CONTRACT,
    generatedAt,
    title: 'Seller Compliance Pack',
    subtitle: 'FICA summary, property disclosure and seller signatures',
    factsVersion: facts.context?.facts_version || '',
    sellerBranch: key(facts.seller?.branch || facts.seller_branch),
    propertyBranch: key(facts.property?.branch || facts.property_branch),
    ficaSections: sections,
    signingSummary,
    signers: signingSummary.signers,
    complete: signingSummary.complete,
  }
}
