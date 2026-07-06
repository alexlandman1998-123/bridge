import {
  getCanonicalMergeFieldDefinition,
  normalizeMergeFieldPayload,
  resolveCanonicalMergeFieldKey,
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry'
import { mapSellerOnboardingToMandateData } from './mandateDataMapper'
import {
  classifySellerParty,
  isBondSale,
  isCashSale,
  isIndividualBuyer,
  isIndividualSeller,
  isCompanyBuyer,
  isCompanySeller,
  isMarriedInCommunityBuyer,
  isMarriedInCommunitySeller,
  isTrustBuyer,
  isTrustSeller,
} from './documentPartyClassification'

const ZAR_CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function compactJoin(values = [], separator = ', ') {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(separator)
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function firstPresent(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    return value
  }
  return null
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function appendAnnexureLabel(current = '', label = '') {
  const nextLabel = normalizeText(label)
  if (!nextLabel) return normalizeText(current)
  const existing = normalizeText(current)
  if (!existing) return nextLabel
  if (existing.toLowerCase().includes(nextLabel.toLowerCase())) return existing
  return `${existing}; ${nextLabel}`
}

function firstRecordText(records = [], keys = []) {
  const rows = Array.isArray(records) ? records : [records]
  for (const row of rows) {
    const record = asRecord(row)
    if (!Object.keys(record).length) continue
    for (const key of keys) {
      const text = normalizeText(record?.[key])
      if (text) return text
    }
  }
  return ''
}

function compactUniqueJoin(values = [], separator = ', ') {
  const seen = new Set()
  const parts = []
  for (const value of values) {
    const text = normalizeText(value)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(text)
  }
  return parts.join(separator)
}

function normalizeClauseText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join('\n')
  }
  if (value && typeof value === 'object') {
    return Object.values(value).map((item) => normalizeText(item)).filter(Boolean).join('\n')
  }
  return normalizeText(value)
}

function normalizeNameList(value) {
  if (Array.isArray(value)) {
    return compactUniqueJoin(value.map((item) => {
      if (!item || typeof item !== 'object') return item
      return firstText(
        item.fullName,
        item.full_name,
        item.displayName,
        item.display_name,
        item.name,
        combineName(item.firstName, item.lastName),
        combineName(item.first_name, item.last_name),
      )
    }), '; ')
  }
  return normalizeText(value)
}

function normalizeYesNoFlag(value, fallback = false) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const text = normalizeText(value)
  if (!text) return fallback ? 'Yes' : 'No'
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (['yes', 'y', 'true', 'required', 'requires_consent', 'consent_required', '1'].includes(normalized)) return 'Yes'
  if (['no', 'n', 'false', 'not_required', 'none', '0'].includes(normalized)) return 'No'
  return fallback ? 'Yes' : 'No'
}

function resolvePropertyDisclosureAnnexureFromSource(source = {}) {
  const payload = asRecord(source)
  const sourceContext = asRecord(payload.sourceContext || payload.source_context)
  const disclosure = asRecord(payload.propertyDisclosure || payload.property_disclosure)
  const lockedSnapshot = asRecord(disclosure.lockedSnapshot || disclosure.locked_snapshot)
  const candidates = [
    payload.propertyDisclosureAnnexure,
    payload.property_disclosure_annexure,
    payload.lockedPropertyDisclosureAnnexure,
    payload.locked_property_disclosure_annexure,
    sourceContext.propertyDisclosureAnnexure,
    sourceContext.property_disclosure_annexure,
    lockedSnapshot,
  ]

  return candidates.find((candidate) => Object.keys(asRecord(candidate)).length) || null
}

function normalizePropertyDisclosureAnnexureForOtp(source = {}) {
  const snapshot = asRecord(source)
  if (!Object.keys(snapshot).length) return null
  const title = normalizeText(snapshot.title || snapshot.annexureTitle || snapshot.annexure_title) || 'Declaration by Seller - Annexure A'
  return {
    ...snapshot,
    type: normalizeText(snapshot.type) || 'property_disclosure_annexure_a',
    title,
    annexureLabel: normalizeText(snapshot.annexureLabel || snapshot.annexure_label) || 'Annexure A',
    status: normalizeText(snapshot.status) || 'complete',
    readOnly: true,
    reuseTarget: 'otp_annexure',
  }
}

function resolvePublicAssetUrl(value = '') {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw
  const path = raw.startsWith('/') ? raw : `/${raw}`
  const configuredBase =
    normalizeText(import.meta.env?.VITE_PUBLIC_APP_URL) ||
    normalizeText(import.meta.env?.VITE_APP_URL) ||
    normalizeText(import.meta.env?.VITE_SITE_URL)
  const browserBase = typeof window !== 'undefined' ? normalizeText(window.location?.origin) : ''
  const base = (configuredBase || browserBase).replace(/\/+$/, '')
  return base ? `${base}${path}` : path
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderInlineText(value) {
  return escapeHtml(value).replace(/\n/g, '<br />')
}

function renderLegalTextWithPlaceholders(value = '', placeholders = {}, packetType = 'otp') {
  return escapeHtml(value)
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => {
      const placeholderKey = normalizeText(token)
      if (!placeholderKey) return ''
      const resolvedValue = safeValueOrMissing(placeholders, placeholderKey, placeholderKey, packetType)
      const missing = resolvedValue.startsWith('[MISSING:')
      return `<span class="${missing ? 'packet-preview-missing' : ''}">${escapeHtml(resolvedValue)}</span>`
    })
    .replace(/\n/g, '<br />')
}

function isMarkdownTableLine(line = '') {
  return /^\s*\|.*\|\s*$/.test(String(line || ''))
}

function getMarkdownTableCells(line = '') {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isMarkdownTableSeparator(line = '') {
  const cells = getMarkdownTableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderMarkdownTable(rows = [], placeholders = {}, packetType = 'otp') {
  if (!rows.length) return ''
  const [header = [], ...bodyRows] = rows
  return `
    <table class="legal-preview-table">
      <thead>
        <tr>${header.map((cell) => `<th>${renderLegalTextWithPlaceholders(cell, placeholders, packetType)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${renderLegalTextWithPlaceholders(cell, placeholders, packetType)}</td>`).join('')}</tr>`).join('\n')}
      </tbody>
    </table>
  `
}

function renderLegalTextBlocks(value = '', placeholders = {}, packetType = 'otp') {
  const lines = String(value || '').split(/\r?\n/)
  const blocks = []
  let paragraphLines = []
  const flushParagraph = () => {
    if (!paragraphLines.length) return
    const paragraphText = paragraphLines.join('\n').trim()
    if (paragraphText) {
      blocks.push(`<p class="legal-preview-paragraph">${renderLegalTextWithPlaceholders(paragraphText, placeholders, packetType)}</p>`)
    }
    paragraphLines = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const nextLine = lines[index + 1]
    if (isMarkdownTableLine(line) && isMarkdownTableSeparator(nextLine)) {
      flushParagraph()
      const tableRows = [getMarkdownTableCells(line)]
      index += 2
      while (index < lines.length && isMarkdownTableLine(lines[index])) {
        tableRows.push(getMarkdownTableCells(lines[index]))
        index += 1
      }
      index -= 1
      blocks.push(renderMarkdownTable(tableRows, placeholders, packetType))
      continue
    }
    paragraphLines.push(line)
  }

  flushParagraph()
  return blocks.join('\n')
}

function getSectionSigningMetadata(section = {}) {
  const metadata = section?.metadata && typeof section.metadata === 'object' ? section.metadata : {}
  return metadata.signing && typeof metadata.signing === 'object' ? metadata.signing : metadata
}

function getSectionSigningRequirement(section = {}) {
  const signing = getSectionSigningMetadata(section)
  const requirement = normalizeText(signing.signing_requirement || signing.signingRequirement).toLowerCase()
  if (requirement === 'client_signature') return 'client_signature'
  if (requirement === 'client_initial') return 'client_initial'
  if (signing.requires_signature || signing.requiresSignature) return 'client_signature'
  if (signing.requires_initial || signing.requiresInitial) return 'client_initial'
  return 'none'
}

function getDefaultClientSigningPlaceholderKey(packetType = 'otp', requirement = 'client_initial') {
  const partyPrefix = normalizeText(packetType).toLowerCase() === 'mandate' ? 'seller' : 'buyer'
  return requirement === 'client_signature' ? `${partyPrefix}_signature` : `${partyPrefix}_initials`
}

function renderSectionSigningRequirement(section = {}, placeholders = {}, packetType = 'otp') {
  const requirement = getSectionSigningRequirement(section)
  if (requirement === 'none') return ''
  const signing = getSectionSigningMetadata(section)
  const placeholderKey = normalizeText(
    requirement === 'client_signature'
      ? signing.signature_placeholder_key || signing.signaturePlaceholderKey
      : signing.initial_placeholder_key || signing.initialPlaceholderKey,
  ) || getDefaultClientSigningPlaceholderKey(packetType, requirement)
  const label = requirement === 'client_signature' ? 'Client signature' : 'Client initials'
  return `
    <div class="legal-section-signing-requirement">
      <span class="legal-section-signing-label">${escapeHtml(label)}</span>
      <span class="legal-section-signing-line">${renderLegalTextWithPlaceholders(`{{${placeholderKey}}}`, placeholders, packetType)}</span>
    </div>
  `
}

function appendSectionSigningRequirement(content = '', section = {}, placeholders = {}, packetType = 'otp') {
  return [
    content,
    renderSectionSigningRequirement(section, placeholders, packetType),
  ].filter(Boolean).join('\n')
}

function renderContactIcon(type = '') {
  const common = 'aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
  if (type === 'website') {
    return `<svg ${common}><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c2.2 2.4 3.4 5.4 3.4 9s-1.2 6.6-3.4 9"></path><path d="M12 3c-2.2 2.4-3.4 5.4-3.4 9s1.2 6.6 3.4 9"></path></svg>`
  }
  if (type === 'email') {
    return `<svg ${common}><rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>`
  }
  if (type === 'address') {
    return `<svg ${common}><path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11z"></path><circle cx="12" cy="10" r="2.4"></circle></svg>`
  }
  return `<svg ${common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6.4 6.4l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"></path></svg>`
}

function resolveDocumentContactItems(branding = {}, placeholders = {}) {
  const address = firstText(
    branding.physicalAddress,
    branding.physical_address,
    branding.organisationPhysicalAddress,
    branding.organisation_physical_address,
    branding.address,
    compactJoin([branding.addressLine1, branding.addressLine2, branding.city, branding.province, branding.postalCode]),
    placeholders.organisation_physical_address,
    placeholders['organisation.physical_address'],
    placeholders.agency_address,
  )
  const items = [
    ['website', firstText(branding.website, branding.organisationWebsite, branding.organisation_website, branding.companyWebsite, placeholders.organisation_website, placeholders['organisation.website'], placeholders.agency_website)],
    ['email', firstText(branding.email, branding.organisationEmail, branding.organisation_email, branding.contactEmail, branding.companyEmail, placeholders.organisation_email, placeholders['organisation.email'], placeholders.agency_email)],
    ['address', address],
    ['phone', firstText(branding.telephone, branding.phoneNumber, branding.phone_number, branding.phone, branding.telephoneNumber, branding.contactPhone, branding.organisationPhone, branding.organisation_phone, placeholders.organisation_phone, placeholders.organisation_telephone, placeholders['organisation.phone'], placeholders.agency_phone)],
  ]
  return items
    .map(([type, value]) => ({ type, value: normalizeText(value) }))
    .filter((item) => item.value)
}

function renderDocumentContactRow(items = []) {
  if (!items.length) return ''
  return `
    <div class="document-contact-row">
      ${items.map((item) => `
        <span class="document-contact-item">
          <span class="document-contact-icon">${renderContactIcon(item.type)}</span>
          <span class="document-contact-value">${renderInlineText(item.value)}</span>
        </span>
      `).join('\n')}
    </div>
  `
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toTitleCase(value) {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatCurrency(value) {
  const amount = normalizeOptionalNumber(value)
  if (!Number.isFinite(amount)) return null
  return ZAR_CURRENCY.format(amount)
}

function combineName(...values) {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(' ')
}

function formatOwnershipShare(value) {
  const text = normalizeText(value)
  if (!text) return ''
  return text.includes('%') ? text : `${text}%`
}

function normalizePartyRecord(source = {}, { role = 'Party', title = '', fallback = {} } = {}) {
  const payload = asRecord(source)
  const fallbackRecord = asRecord(fallback)
  const name = firstText(
    payload.fullName,
    payload.full_name,
    payload.displayName,
    payload.display_name,
    payload.name,
    payload.legalName,
    payload.legal_name,
    combineName(payload.firstName, payload.lastName),
    combineName(payload.first_name, payload.last_name),
    combineName(payload.name, payload.surname),
    fallbackRecord.name,
  )
  const idNumber = firstText(
    payload.idNumber,
    payload.id_number,
    payload.identityNumber,
    payload.identity_number,
    payload.registrationNumber,
    payload.registration_number,
    payload.companyRegistrationNumber,
    payload.company_registration_number,
    payload.trustRegistrationNumber,
    payload.trust_registration_number,
    payload.passportNumber,
    payload.passport_number,
    fallbackRecord.idNumber,
  )
  const email = firstText(payload.email, payload.emailAddress, payload.email_address, fallbackRecord.email)
  const phone = firstText(payload.phone, payload.mobile, payload.mobileNumber, payload.mobile_number, fallbackRecord.phone)
  const capacity = firstText(payload.capacity, payload.signingCapacity, payload.signing_capacity, payload.roleTitle, payload.role_title, fallbackRecord.capacity)
  const ownershipShare = firstText(payload.ownershipShare, payload.ownership_share, payload.share, fallbackRecord.ownershipShare)
  const organisationName = firstText(payload.organisationName, payload.organisation_name, payload.organizationName, payload.agencyName, fallbackRecord.organisationName)
  const ffcNumber = firstText(payload.ffcNumber, payload.ffc_number, payload.fidelityFundCertificateNumber, fallbackRecord.ffcNumber)
  const normalized = {
    role,
    title: normalizeText(title) || firstText(payload.title, payload.label, role),
    name,
    idNumber,
    email,
    phone,
    capacity,
    ownershipShare: formatOwnershipShare(ownershipShare),
    organisationName,
    ffcNumber,
  }
  return [name, idNumber, email, phone, capacity, ownershipShare, organisationName, ffcNumber].some((value) => normalizeText(value)) ? normalized : null
}

function dedupePartyRecords(parties = []) {
  const seen = new Set()
  return parties.filter((party) => {
    if (!party) return false
    const key = [party.name, party.idNumber, party.email].map((value) => normalizeText(value).toLowerCase()).filter(Boolean).join('|')
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildBuyerParties({ buyer = null, onboardingFormData = null } = {}) {
  const buyerRecord = asRecord(buyer)
  const onboarding = asRecord(onboardingFormData)
  const purchasers = Array.isArray(onboarding.purchasers) ? onboarding.purchasers : []
  const purchaserParties = purchasers.map((purchaser, index) => normalizePartyRecord(purchaser, {
    role: 'Buyer',
    title: `Buyer ${index + 1}`,
  }))
  const fallbackBuyer = normalizePartyRecord({
    ...onboarding,
    name: firstText(buyerRecord.name, onboarding.fullName, onboarding.full_name, combineName(onboarding.firstName, onboarding.lastName), onboarding.firstName),
    idNumber: firstText(onboarding.idNumber, onboarding.identityNumber, onboarding.companyRegistrationNumber, onboarding.trustRegistrationNumber),
    email: firstText(buyerRecord.email, onboarding.email),
    phone: firstText(buyerRecord.phone, onboarding.phone),
  }, {
    role: 'Buyer',
    title: 'Buyer 1',
  })
  const coBuyer = normalizePartyRecord({
    name: firstText(onboarding.co_buyer_name, onboarding.coBuyerName, onboarding.co_buyer_full_name, onboarding.coBuyerFullName),
    idNumber: firstText(onboarding.co_buyer_id_number, onboarding.coBuyerIdNumber, onboarding.co_buyer_identity_number, onboarding.coBuyerIdentityNumber),
    email: firstText(onboarding.co_buyer_email, onboarding.coBuyerEmail),
    phone: firstText(onboarding.co_buyer_phone, onboarding.coBuyerPhone),
  }, {
    role: 'Buyer',
    title: 'Buyer 2',
  })
  const parties = purchaserParties.length ? purchaserParties : [fallbackBuyer, coBuyer]
  return dedupePartyRecords(parties)
}

function buildOtpSellerParties({
  sellerName = '',
  sellerRegistrationNumber = '',
  developmentSeller = {},
  sellerSignatory = {},
} = {}) {
  const sellerParty = normalizePartyRecord({
    name: sellerName,
    registrationNumber: sellerRegistrationNumber,
    email: developmentSeller.email,
    phone: developmentSeller.phone,
  }, {
    role: 'Seller',
    title: 'Seller',
  })
  const signatoryParty = normalizePartyRecord({
    name: sellerSignatory.fullName,
    idNumber: sellerSignatory.idNumber,
    email: sellerSignatory.email,
    phone: sellerSignatory.phone,
    capacity: sellerSignatory.signingCapacity || sellerSignatory.role,
  }, {
    role: 'Seller Representative',
    title: 'Authorised representative',
  })
  return dedupePartyRecords([sellerParty, signatoryParty])
}

function buildMissingToken(label) {
  return `[MISSING: ${label}]`
}

function createPacketSection({ key, label, required = true, condition = null, placeholders = [] } = {}) {
  return {
    key,
    label,
    required: Boolean(required),
    condition,
    placeholders,
  }
}

const OTP_SECTION_DEFINITIONS = [
  createPacketSection({
    key: 'buyer_details',
    label: 'Buyer Details',
    required: true,
    placeholders: [
      ['buyer_full_name', 'Buyer Full Name'],
      ['buyer_id_number', 'Buyer ID / Registration'],
      ['buyer_email', 'Buyer Email'],
    ],
  }),
  createPacketSection({
    key: 'seller_details',
    label: 'Seller Details',
    required: true,
    placeholders: [
      ['seller_full_name', 'Seller Name'],
      ['seller_id_number', 'Seller ID / Registration'],
    ],
  }),
  createPacketSection({
    key: 'property_details',
    label: 'Property',
    required: true,
    placeholders: [
      ['unit_number', 'Property Unit'],
      ['property_address', 'Property Address'],
      ['property_suburb', 'Property Suburb'],
    ],
  }),
  createPacketSection({
    key: 'purchase_terms',
    label: 'Purchase Terms',
    required: true,
    placeholders: [
      ['purchase_price', 'Purchase Price'],
      ['deposit_amount', 'Deposit Amount'],
      ['finance_type', 'Finance Type'],
    ],
  }),
  createPacketSection({
    key: 'finance_clause_bond',
    label: 'Finance Clause (Bond)',
    required: false,
    condition: ({ placeholders }) => isBondSale(placeholders),
    placeholders: [
      ['bond_amount', 'Bond Amount'],
      ['finance_type', 'Finance Type'],
    ],
  }),
  createPacketSection({
    key: 'finance_clause_cash',
    label: 'Cash Sale Payment Clause',
    required: false,
    condition: ({ placeholders }) => isCashSale(placeholders),
    placeholders: [
      ['cash_amount', 'Cash Amount'],
      ['finance_type', 'Finance Type'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_individual',
    label: 'Individual Buyer Capacity Clause',
    required: false,
    condition: ({ placeholders }) => isIndividualBuyer(placeholders),
    placeholders: [
      ['buyer_marital_status', 'Buyer Marital Status'],
      ['buyer_spouse_consent_required', 'Spouse Consent Required'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_company',
    label: 'Company Authority Clause',
    required: false,
    condition: ({ placeholders }) => isCompanyBuyer(placeholders),
    placeholders: [
      ['buyer_company_registration_number', 'Buyer Registration Number'],
      ['buyer_representative_name', 'Authorised Representative'],
      ['buyer_representative_capacity', 'Representative Capacity'],
      ['buyer_resolution_date', 'Resolution Date'],
      ['buyer_authority_basis', 'Authority Basis'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_trust',
    label: 'Trust Authority Clause',
    required: false,
    condition: ({ placeholders }) => isTrustBuyer(placeholders),
    placeholders: [
      ['buyer_trust_registration_number', 'Trust Registration Number'],
      ['buyer_trustee_names', 'Trustee Names'],
      ['buyer_representative_name', 'Trustee Representative'],
      ['buyer_representative_capacity', 'Trustee Capacity'],
    ],
  }),
  createPacketSection({
    key: 'buyer_spouse_consent',
    label: 'Buyer Spouse Consent Clause',
    required: false,
    condition: ({ placeholders }) => isMarriedInCommunityBuyer(placeholders),
    placeholders: [
      ['buyer_spouse_full_name', 'Buyer Spouse Full Name'],
      ['buyer_spouse_id_number', 'Buyer Spouse ID Number'],
      ['buyer_spouse_email', 'Buyer Spouse Email'],
      ['buyer_spouse_consent_required', 'Buyer Spouse Consent Required'],
    ],
  }),
  createPacketSection({
    key: 'seller_entity_clause_individual',
    label: 'Seller Individual Capacity Clause',
    required: false,
    condition: ({ placeholders }) => isIndividualSeller(placeholders),
    placeholders: [
      ['seller_marital_status', 'Seller Marital Status'],
      ['seller_spouse_consent_required', 'Spouse Consent Required'],
    ],
  }),
  createPacketSection({
    key: 'seller_entity_clause_company',
    label: 'Seller Company Authority Clause',
    required: false,
    condition: ({ placeholders }) => isCompanySeller(placeholders),
    placeholders: [
      ['seller_company_registration_number', 'Seller Registration Number'],
      ['seller_representative_name', 'Authorised Seller Representative'],
      ['seller_representative_capacity', 'Seller Representative Capacity'],
      ['seller_resolution_date', 'Resolution Date'],
      ['seller_authority_basis', 'Authority Basis'],
    ],
  }),
  createPacketSection({
    key: 'seller_entity_clause_trust',
    label: 'Seller Trust Authority Clause',
    required: false,
    condition: ({ placeholders }) => isTrustSeller(placeholders),
    placeholders: [
      ['seller_trust_registration_number', 'Trust Registration Number'],
      ['seller_trustee_names', 'Trustee Names'],
      ['seller_representative_name', 'Trustee Representative'],
      ['seller_representative_capacity', 'Trustee Capacity'],
    ],
  }),
  createPacketSection({
    key: 'seller_spouse_consent',
    label: 'Seller Spouse Consent Clause',
    required: false,
    condition: ({ placeholders }) => isMarriedInCommunitySeller(placeholders),
    placeholders: [
      ['seller_spouse_full_name', 'Seller Spouse Full Name'],
      ['seller_spouse_id_number', 'Seller Spouse ID Number'],
      ['seller_spouse_email', 'Seller Spouse Email'],
      ['seller_spouse_consent_required', 'Seller Spouse Consent Required'],
    ],
  }),
  createPacketSection({
    key: 'commission_terms',
    label: 'Commission Terms',
    required: true,
    placeholders: [
      ['gross_commission_percentage', 'Gross Commission %'],
      ['gross_commission_amount', 'Gross Commission Amount'],
      ['agent_commission_amount', 'Agent Commission Amount'],
      ['agency_commission_amount', 'Agency Commission Amount'],
    ],
  }),
  createPacketSection({
    key: 'special_conditions',
    label: 'Special Conditions',
    required: false,
    placeholders: [['special_conditions', 'Special Conditions']],
  }),
  createPacketSection({
    key: 'signature_pages',
    label: 'Signature Pages',
    required: true,
    placeholders: [
      ['buyer_full_name', 'Buyer Full Name'],
      ['seller_full_name', 'Seller Full Name'],
    ],
  }),
]

const MANDATE_SECTION_DEFINITIONS = [
  createPacketSection({
    key: 'introduction_purpose',
    label: 'Introduction and Purpose',
    required: true,
    placeholders: [['mandate_introduction_purpose', 'Introduction and Purpose']],
  }),
  createPacketSection({
    key: 'parties',
    label: 'Parties',
    required: true,
    placeholders: [
      ['seller_full_name', 'Seller Full Name'],
      ['seller_email', 'Seller Email'],
      ['agent_full_name', 'Agent / Agency Representative'],
      ['organisation_name', 'Organisation'],
    ],
  }),
  createPacketSection({
    key: 'property_details',
    label: 'Property Details',
    required: true,
    placeholders: [
      ['property_address', 'Property Address'],
      ['property_type', 'Property Type'],
    ],
  }),
  createPacketSection({
    key: 'mandate_terms',
    label: 'Mandate Terms',
    required: true,
    placeholders: [
      ['mandate_type', 'Mandate Type'],
      ['mandate_start_date', 'Mandate Start Date'],
      ['mandate_end_date', 'Mandate End Date'],
      ['mandate_authority_granted', 'Authority Granted'],
    ],
  }),
  createPacketSection({
    key: 'commission_terms',
    label: 'Commission Terms',
    required: true,
    placeholders: [
      ['commission_structure', 'Commission Structure'],
      ['mandate_commission_percent', 'Commission %'],
      ['mandate_commission_amount', 'Commission Amount'],
      ['vat_handling', 'VAT Handling'],
      ['asking_price', 'Asking Price'],
    ],
  }),
  createPacketSection({
    key: 'marketing_listing_terms',
    label: 'Marketing / Listing Terms',
    required: false,
    placeholders: [
      ['asking_price', 'Listing Price'],
      ['mandate_marketing_permissions', 'Marketing Permissions'],
      ['mandate_access_instructions', 'Viewing / Access Arrangements'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_individual',
    label: 'Individual Seller Capacity Clause',
    required: false,
    condition: ({ placeholders }) => isIndividualSeller(placeholders),
    placeholders: [
      ['seller_marital_status', 'Seller Marital Status'],
      ['seller_spouse_consent_required', 'Spouse Consent Required'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_company',
    label: 'Company Authority Clause',
    required: false,
    condition: ({ placeholders }) => isCompanySeller(placeholders),
    placeholders: [
      ['seller_company_registration_number', 'Seller Registration Number'],
      ['seller_representative_name', 'Authorised Representative'],
      ['seller_representative_capacity', 'Representative Capacity'],
      ['seller_resolution_date', 'Resolution Date'],
      ['seller_authority_basis', 'Authority Basis'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_trust',
    label: 'Trust Authority Clause',
    required: false,
    condition: ({ placeholders }) => isTrustSeller(placeholders),
    placeholders: [
      ['seller_trust_registration_number', 'Trust Registration Number'],
      ['seller_trustee_names', 'Trustee Names'],
      ['seller_representative_name', 'Trustee Representative'],
      ['seller_representative_capacity', 'Trustee Capacity'],
    ],
  }),
  createPacketSection({
    key: 'seller_spouse_consent',
    label: 'Seller Spouse Consent Clause',
    required: false,
    condition: ({ placeholders }) => isMarriedInCommunitySeller(placeholders),
    placeholders: [
      ['seller_spouse_full_name', 'Seller Spouse Full Name'],
      ['seller_spouse_id_number', 'Seller Spouse ID Number'],
      ['seller_spouse_email', 'Seller Spouse Email'],
      ['seller_spouse_consent_required', 'Seller Spouse Consent Required'],
    ],
  }),
  createPacketSection({
    key: 'special_conditions',
    label: 'Special Conditions',
    required: false,
    placeholders: [['special_conditions', 'Special Conditions']],
  }),
  createPacketSection({
    key: 'signature_pages',
    label: 'Signature Pages',
    required: true,
    placeholders: [['seller_full_name', 'Seller Full Name']],
  }),
]

function resolvePlaceholderValue(placeholders = {}, key = '', packetType = 'otp') {
  const payload = placeholders && typeof placeholders === 'object' ? placeholders : {}
  const direct = payload?.[key]
  if (direct !== undefined && direct !== null && direct !== '') return direct
  const canonical = resolveCanonicalMergeFieldKey(key, { packetType })
  if (!canonical) return direct
  return payload?.[canonical]
}

function safeValueOrMissing(placeholders, key, label, packetType = 'otp') {
  const value = resolvePlaceholderValue(placeholders, key, packetType)
  if (value === null || value === undefined || value === '') {
    return buildMissingToken(label)
  }
  return String(value)
}

function getSectionDefinitions(packetType) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  return normalizedPacketType === 'mandate' ? MANDATE_SECTION_DEFINITIONS : OTP_SECTION_DEFINITIONS
}

function normalizeDevelopmentSellerDetails(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const signatorySource =
    (Array.isArray(source.signatories) ? source.signatories[0] : null) ||
    source.defaultSignatory ||
    source.default_signatory ||
    {}

  return {
    mode: source.mode || '',
    entityType: source.entityType || source.entity_type || '',
    legalName: source.legalName || source.legal_name || source.fullName || source.full_name || source.name || '',
    tradingName: source.tradingName || source.trading_name || '',
    registrationNumber: source.registrationNumber || source.registration_number || source.companyRegistrationNumber || source.company_registration_number || source.trustRegistrationNumber || source.trust_registration_number || '',
    vatNumber: source.vatNumber || source.vat_number || '',
    registeredAddress: source.registeredAddress || source.registered_address || source.address || '',
    postalAddress: source.postalAddress || source.postal_address || '',
    email: source.email || '',
    phone: source.phone || source.mobile || '',
    maritalStatus: source.maritalStatus || source.marital_status || '',
    maritalRegime: source.maritalRegime || source.marital_regime || source.marriageType || source.marriage_type || '',
    spouseFullName: source.spouseFullName || source.spouse_full_name || source.spouseName || source.spouse_name || '',
    spouseIdNumber: source.spouseIdNumber || source.spouse_id_number || '',
    spouseEmail: source.spouseEmail || source.spouse_email || '',
    spouseConsentRequired: firstPresent(source.spouseConsentRequired, source.spouse_consent_required, ''),
    trusteeNames: normalizeNameList(source.trusteeNames || source.trustee_names || source.trustees),
    resolutionDate: source.resolutionDate || source.resolution_date || source.companyResolutionDate || source.company_resolution_date || '',
    authorityBasis: source.authorityBasis || source.authority_basis || source.authorityGranted || source.authority_granted || '',
    vatTreatment: source.vatTreatment || source.vat_treatment || '',
    notes: source.notes || '',
    signatory: {
      fullName: signatorySource?.fullName || signatorySource?.full_name || signatorySource?.name || '',
      role: signatorySource?.role || signatorySource?.title || '',
      idNumber: signatorySource?.idNumber || signatorySource?.id_number || signatorySource?.identityNumber || '',
      email: signatorySource?.email || '',
      phone: signatorySource?.phone || signatorySource?.mobile || '',
      signingCapacity: signatorySource?.signingCapacity || signatorySource?.signing_capacity || signatorySource?.capacity || '',
    },
  }
}

function resolveDevelopmentSellerDetails({ unit = null, transaction = null, contextSellerDetails = null } = {}) {
  return normalizeDevelopmentSellerDetails(
    contextSellerDetails ||
      unit?.development?.sellerDetails ||
      unit?.development?.seller_details ||
      unit?.development?.profile?.sellerDetails ||
      unit?.development?.profile?.seller_details ||
      transaction?.developmentSellerDetails ||
      transaction?.development_seller_details ||
      transaction?.sellerDetails ||
      transaction?.seller_details ||
      {},
  )
}

function createSellerReadinessIssue({ sectionKey = 'seller_details', sectionLabel = 'Seller Details', placeholderKey = '', placeholderLabel = '', message = '', severity = 'critical' } = {}) {
  return {
    sectionKey,
    sectionLabel,
    placeholderKey,
    placeholderLabel,
    message,
    severity,
  }
}

export function validateSellerPartyReadiness({ packetType = 'otp', placeholders = {} } = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'otp'
  if (!['otp', 'mandate'].includes(normalizedPacketType)) {
    return { critical: [], warnings: [], canProceed: true }
  }

  const normalizedPayload = normalizeMergeFieldPayload(placeholders, {
    packetType: normalizedPacketType,
    includeAliasKeys: true,
  }).payload
  const valueFor = (key) => normalizeText(resolvePlaceholderValue(normalizedPayload, key, normalizedPacketType))
  const sellerName = valueFor('seller_full_name')
  const sellerEmail = valueFor('seller_email')
  const sellerIdNumber = valueFor('seller_id_number')
  const sellerClassification = classifySellerParty(normalizedPayload)
  const sellerIsTrust = sellerClassification.isTrust
  const sellerIsLegalEntity = sellerClassification.isLegalEntity
  const representativeName = valueFor('seller_representative_name') || valueFor('representative_name')
  const representativeCapacity = valueFor('seller_representative_capacity') || valueFor('representative_capacity')
  const representativeEmail = valueFor('seller_representative_email') || valueFor('representative_email')
  const registrationNumber =
    (sellerIsTrust ? valueFor('seller_trust_registration_number') : valueFor('seller_company_registration_number')) ||
    sellerIdNumber
  const critical = []
  const warnings = []

  if (!sellerName) {
    critical.push(createSellerReadinessIssue({
      placeholderKey: 'seller_full_name',
      placeholderLabel: 'Seller Legal Name',
      message: 'Seller legal name is required before generating seller-side documents.',
    }))
  }

  if (!registrationNumber) {
    critical.push(createSellerReadinessIssue({
      placeholderKey: sellerIsTrust ? 'seller_trust_registration_number' : 'seller_company_registration_number',
      placeholderLabel: sellerIsTrust ? 'Trust Registration Number' : 'Seller Registration Number',
      message: sellerIsTrust
        ? 'Seller trust registration number is required before generating seller-side documents.'
        : 'Seller registration number is required before generating seller-side documents.',
    }))
  }

  if (sellerIsLegalEntity && !representativeName) {
    critical.push(createSellerReadinessIssue({
      sectionKey: sellerIsTrust ? 'seller_entity_clause_trust' : 'seller_entity_clause_company',
      sectionLabel: sellerIsTrust ? 'Seller Trust Authority Clause' : 'Seller Company Authority Clause',
      placeholderKey: 'seller_representative_name',
      placeholderLabel: sellerIsTrust ? 'Trustee Representative' : 'Authorised Seller Representative',
      message: 'Authorised seller representative is required for company, close corporation, and trust sellers.',
    }))
  }

  if (sellerIsLegalEntity && !representativeCapacity) {
    critical.push(createSellerReadinessIssue({
      sectionKey: sellerIsTrust ? 'seller_entity_clause_trust' : 'seller_entity_clause_company',
      sectionLabel: sellerIsTrust ? 'Seller Trust Authority Clause' : 'Seller Company Authority Clause',
      placeholderKey: 'seller_representative_capacity',
      placeholderLabel: sellerIsTrust ? 'Trustee Capacity' : 'Seller Representative Capacity',
      message: 'Seller representative signing capacity is required before generating seller-side documents.',
    }))
  }

  if (!sellerEmail && !representativeEmail) {
    warnings.push(createSellerReadinessIssue({
      placeholderKey: sellerIsLegalEntity ? 'seller_representative_email' : 'seller_email',
      placeholderLabel: sellerIsLegalEntity ? 'Seller Representative Email' : 'Seller Email',
      message: 'Seller signing email is not captured. Signing links may need to be completed manually.',
      severity: 'warning',
    }))
  }

  return {
    critical,
    warnings,
    canProceed: critical.length === 0,
  }
}

export function resolveOtpPacketPlaceholders({
  transaction = null,
  unit = null,
  buyer = null,
  onboardingFormData = null,
  sellerDetails = null,
  agency = null,
  organisation = null,
  agent = null,
  listing = null,
  privateListing = null,
  propertyDisclosureAnnexure = null,
  sourceContext = null,
  specialConditions = '',
} = {}) {
  const onboarding = asRecord(onboardingFormData)
  const source = asRecord(sourceContext)
  const sourceProperty = asRecord(
    source.property ||
      source.propertyFacts ||
      source.property_facts ||
      source.canonicalPropertyFacts ||
      source.canonical_property_facts,
  )
  const sourceSeller = asRecord(source.seller || source.sellerFacts || source.seller_facts || source.canonicalSellerFacts || source.canonical_seller_facts)
  const sourceListing = asRecord(listing || privateListing || source.listing || source.privateListing || source.private_listing || source.canonicalListing || source.canonical_listing)
  const transactionMetadata = asRecord(transaction?.metadata_json || transaction?.metadata)
  const unitMetadata = asRecord(unit?.metadata_json || unit?.metadata || unit?.property || unit?.property_facts)
  const addressDetails = asRecord(
    onboarding.addressDetails ||
      onboarding.address_details ||
      onboarding.propertyAddressDetails ||
      onboarding.property_address_details ||
      onboarding.property ||
      onboarding.propertyFacts ||
      onboarding.property_facts,
  )
  const offer = asRecord(source.offer || source.canonicalOffer || source.canonical_offer || source.acceptedOffer || source.accepted_offer || transaction?.offer)
  const offerConditions = asRecord(
    offer.conditions ||
      offer.condition_json ||
      offer.conditions_json ||
      source.conditions ||
      source.offerConditions ||
      source.offer_conditions ||
      onboarding.conditions ||
      onboarding.offerConditions,
  )
  const propertyRecords = [
    onboarding,
    addressDetails,
    sourceProperty,
    sourceSeller,
    sourceListing,
    unitMetadata,
    unit,
    transaction,
    transactionMetadata,
    source,
  ]
  const buyerEntityTypeRaw = normalizeText(transaction?.purchaser_type || onboarding.purchaserType || onboarding.purchaser_type || 'individual').toLowerCase()
  const developmentSeller = resolveDevelopmentSellerDetails({ unit, transaction, contextSellerDetails: sellerDetails })
  const sellerSignatory = developmentSeller.signatory || {}
  const sellerEntityTypeRaw = normalizeText(developmentSeller.entityType || transaction?.seller_type || 'company').toLowerCase()
  const sellerRegistrationNumber =
    normalizeNullableText(developmentSeller.registrationNumber) ||
    normalizeNullableText(transaction?.seller_registration_number) ||
    null
  const sellerName = normalizeText(
    developmentSeller.legalName ||
      unit?.development?.developer_company ||
      unit?.development?.name ||
      transaction?.matter_owner ||
      'Seller',
  )
  const purchasePrice = normalizeOptionalNumber(transaction?.purchase_price) ?? normalizeOptionalNumber(transaction?.sales_price)
  const grossCommissionPercentage = normalizeOptionalNumber(transaction?.gross_commission_percentage)
  const grossCommissionAmount =
    normalizeOptionalNumber(transaction?.gross_commission_amount) ??
    (Number.isFinite(purchasePrice) && Number.isFinite(grossCommissionPercentage)
      ? Number(((purchasePrice * grossCommissionPercentage) / 100).toFixed(2))
      : null)
  const disclosureAnnexure = normalizePropertyDisclosureAnnexureForOtp(
    propertyDisclosureAnnexure ||
      resolvePropertyDisclosureAnnexureFromSource(onboarding) ||
      resolvePropertyDisclosureAnnexureFromSource(sourceContext),
  )
  const annexuresList = appendAnnexureLabel(onboarding.annexuresList || onboarding.annexures_list, disclosureAnnexure?.title)
  const buyerParties = buildBuyerParties({ buyer, onboardingFormData: onboarding })
  const sellerParties = buildOtpSellerParties({
    sellerName,
    sellerRegistrationNumber,
    developmentSeller,
    sellerSignatory,
  })
  const primaryBuyer = buyerParties[0] || {}
  const primarySeller = sellerParties[0] || {}
  const propertyUnitNumber = firstText(
    firstRecordText(propertyRecords, ['property_unit_number', 'unitNumber', 'unit_number', 'unit', 'unitLabel', 'unit_label']),
    unit?.unit_number ? `Unit ${unit.unit_number}` : '',
  )
  const propertySectionNumber = firstRecordText(propertyRecords, ['property_section_number', 'sectionNumber', 'section_number'])
  const propertyComplexName = firstRecordText(propertyRecords, ['property_complex_name', 'complexName', 'complex_name', 'schemeName', 'scheme_name', 'estateComplexName', 'estate_complex_name'])
  const propertyEstateName = firstRecordText(propertyRecords, ['property_estate_name', 'estateName', 'estate_name', 'estateComplexName', 'estate_complex_name'])
  const sectionalTitleNumber = firstRecordText(propertyRecords, ['sectional_title_number', 'sectionalTitleNumber', 'sectionalTitleScheme', 'property_sectional_title_scheme', 'schemeNumber', 'scheme_number'])
  const propertyAddress = firstText(
    transaction?.property_address_line_1,
    transaction?.property_address,
    onboarding.propertyAddress,
    onboarding.property_address,
    sourceListing.address,
    sourceListing.property_address,
    sourceProperty.address,
    sourceProperty.property_address,
    unit?.development?.address,
  )
  const propertyCity = firstText(
    transaction?.city,
    onboarding.city,
    onboarding.propertyCity,
    onboarding.property_city,
    addressDetails.city,
    sourceListing.city,
    sourceProperty.city,
    unit?.development?.city,
  )
  const cashAmount =
    normalizeOptionalNumber(transaction?.cash_amount) ??
    normalizeOptionalNumber(onboarding.cash_amount) ??
    normalizeOptionalNumber(onboarding.cashAmount) ??
    normalizeOptionalNumber(onboarding?.finance?.cash_amount) ??
    normalizeOptionalNumber(onboarding?.finance?.cashAmount) ??
    normalizeOptionalNumber(offer.cash_amount) ??
    normalizeOptionalNumber(offer.cashAmount) ??
    normalizeOptionalNumber(offer.cashComponent)
  const agencyProfile = asRecord(agency)
  const organisationProfile = asRecord(organisation)
  const agentProfile = asRecord(agent)
  const agencyMetadata = asRecord(agencyProfile.metadata_json || agencyProfile.metadata || organisationProfile.metadata_json || organisationProfile.metadata)
  const buyerCompanyRegistrationNumber = normalizeNullableText(firstText(
    onboarding.companyRegistrationNumber,
    onboarding.company_registration_number,
    onboarding.entityRegistrationNumber,
    onboarding.entity_registration_number,
  ))
  const buyerTrustRegistrationNumber = normalizeNullableText(firstText(
    onboarding.trustRegistrationNumber,
    onboarding.trust_registration_number,
    buyerEntityTypeRaw === 'trust' ? onboarding.entityRegistrationNumber || onboarding.entity_registration_number : '',
  ))
  const buyerRepresentativeName = normalizeNullableText(firstText(
    onboarding.authorizedRepresentativeName,
    onboarding.authorisedRepresentativeName,
    onboarding.representativeName,
    onboarding.representative_name,
    onboarding.companyRepresentativeName,
    onboarding.company_representative_name,
    onboarding.trustRepresentativeName,
    onboarding.trust_representative_name,
    onboarding.trusteeName,
    onboarding.trustee_name,
  ))
  const buyerRepresentativeCapacity = normalizeNullableText(firstText(
    onboarding.authorizedRepresentativeCapacity,
    onboarding.authorisedRepresentativeCapacity,
    onboarding.representativeCapacity,
    onboarding.representative_capacity,
    onboarding.companyRepresentativeCapacity,
    onboarding.company_representative_capacity,
    onboarding.trustRepresentativeCapacity,
    onboarding.trust_representative_capacity,
    onboarding.trusteeCapacity,
    onboarding.trustee_capacity,
  ))
  const buyerMaritalStatus = normalizeNullableText(firstText(onboarding.maritalStatus, onboarding.marital_status))
  const buyerSpouseFullName = normalizeNullableText(firstText(
    onboarding.spouseFullName,
    onboarding.spouse_full_name,
    onboarding.spouseName,
    onboarding.spouse_name,
  ))
  const buyerSpouseConsentRequired = normalizeYesNoFlag(
    firstPresent(onboarding.spouseConsentRequired, onboarding.spouse_consent_required),
    isMarriedInCommunityBuyer({
      buyer_marital_status: buyerMaritalStatus,
      buyer_spouse_consent_required: firstPresent(onboarding.spouseConsentRequired, onboarding.spouse_consent_required),
    }),
  )
  const sellerMaritalStatus = normalizeNullableText(firstText(
    sourceSeller.maritalStatus,
    sourceSeller.marital_status,
    developmentSeller.maritalStatus,
    transaction?.seller_marital_status,
  ))
  const sellerMaritalRegime = normalizeNullableText(firstText(
    sourceSeller.maritalRegime,
    sourceSeller.marital_regime,
    sourceSeller.marriageType,
    sourceSeller.marriage_type,
    developmentSeller.maritalRegime,
    transaction?.seller_marital_regime,
  ))
  const sellerSpouseFullName = normalizeNullableText(firstText(
    sourceSeller.spouseFullName,
    sourceSeller.spouse_full_name,
    sourceSeller.spouseName,
    sourceSeller.spouse_name,
    developmentSeller.spouseFullName,
  ))
  const sellerSpouseConsentRequired = normalizeYesNoFlag(
    firstPresent(sourceSeller.spouseConsentRequired, sourceSeller.spouse_consent_required, developmentSeller.spouseConsentRequired),
    isMarriedInCommunitySeller({
      seller_marital_status: sellerMaritalStatus,
      seller_marital_regime: sellerMaritalRegime,
      seller_spouse_consent_required: firstPresent(sourceSeller.spouseConsentRequired, sourceSeller.spouse_consent_required, developmentSeller.spouseConsentRequired),
    }),
  )
  const sellerTrusteeNames = normalizeNullableText(firstText(
    normalizeNameList(firstPresent(sourceSeller.trusteeNames, sourceSeller.trustee_names, sourceSeller.trustees)),
    developmentSeller.trusteeNames,
  ))

  return {
    buyer_parties: buyerParties,
    buyer_full_name: normalizeNullableText(primaryBuyer.name) || normalizeNullableText(buyer?.name) || normalizeNullableText(onboarding.firstName) || null,
    buyer_id_number:
      normalizeNullableText(primaryBuyer.idNumber) ||
      normalizeNullableText(onboarding.idNumber) ||
      (buyerEntityTypeRaw === 'trust' ? buyerTrustRegistrationNumber : buyerCompanyRegistrationNumber) ||
      null,
    buyer_email: normalizeNullableText(primaryBuyer.email) || normalizeNullableText(buyer?.email) || null,
    buyer_phone: normalizeNullableText(primaryBuyer.phone) || normalizeNullableText(buyer?.phone) || null,
    buyer_marital_status: buyerMaritalStatus,
    buyer_spouse_full_name: buyerSpouseFullName,
    buyer_spouse_name: buyerSpouseFullName,
    buyer_spouse_id_number: normalizeNullableText(firstText(onboarding.spouseIdNumber, onboarding.spouse_id_number)),
    buyer_spouse_email: normalizeNullableText(firstText(onboarding.spouseEmail, onboarding.spouse_email)),
    buyer_spouse_consent_required: buyerSpouseConsentRequired,
    buyer_entity_type: toTitleCase(buyerEntityTypeRaw || 'individual'),
    'buyer.entity_type_raw': buyerEntityTypeRaw || 'individual',
    buyer_company_registration_number: buyerEntityTypeRaw === 'trust' ? null : buyerCompanyRegistrationNumber,
    buyer_representative_name: buyerRepresentativeName,
    buyer_representative_capacity: buyerRepresentativeCapacity,
    buyer_resolution_date: normalizeNullableText(firstText(onboarding.resolutionDate, onboarding.resolution_date, onboarding.companyResolutionDate, onboarding.company_resolution_date)),
    buyer_authority_basis: normalizeNullableText(firstText(onboarding.authorityBasis, onboarding.authority_basis, onboarding.authorityGranted, onboarding.authority_granted)),
    buyer_trust_registration_number: buyerTrustRegistrationNumber,
    buyer_trustee_names: normalizeNullableText(normalizeNameList(firstPresent(onboarding.trusteeNames, onboarding.trustee_names, onboarding.trustees))),
    buyer_marketing_opt_in: normalizeNullableText(onboarding.marketingConsent),
    buyer_domicilium_address:
      normalizeNullableText(onboarding.residentialAddress) ||
      normalizeNullableText(onboarding.physicalAddress) ||
      null,

    seller_parties: sellerParties,
    seller_full_name: normalizeNullableText(primarySeller.name) || sellerName || null,
    seller_id_number: normalizeNullableText(primarySeller.idNumber) || sellerRegistrationNumber,
    seller_email: normalizeNullableText(primarySeller.email) || normalizeNullableText(developmentSeller.email) || null,
    seller_phone: normalizeNullableText(primarySeller.phone) || normalizeNullableText(developmentSeller.phone) || null,
    seller_entity_type: toTitleCase(sellerEntityTypeRaw || 'company'),
    'seller.entity_type_raw': sellerEntityTypeRaw || 'company',
    seller_marital_status: sellerMaritalStatus,
    seller_marital_regime: sellerMaritalRegime,
    seller_spouse_full_name: sellerSpouseFullName,
    seller_spouse_name: sellerSpouseFullName,
    seller_spouse_id_number: normalizeNullableText(firstText(sourceSeller.spouseIdNumber, sourceSeller.spouse_id_number, developmentSeller.spouseIdNumber)),
    seller_spouse_email: normalizeNullableText(firstText(sourceSeller.spouseEmail, sourceSeller.spouse_email, developmentSeller.spouseEmail)),
    seller_spouse_consent_required: sellerSpouseConsentRequired,
    seller_representative_name: normalizeNullableText(sellerSignatory.fullName),
    representative_name: normalizeNullableText(sellerSignatory.fullName),
    seller_representative_email: normalizeNullableText(sellerSignatory.email),
    representative_email: normalizeNullableText(sellerSignatory.email),
    seller_representative_phone: normalizeNullableText(sellerSignatory.phone),
    representative_phone: normalizeNullableText(sellerSignatory.phone),
    seller_representative_capacity: normalizeNullableText(sellerSignatory.signingCapacity || sellerSignatory.role),
    representative_capacity: normalizeNullableText(sellerSignatory.signingCapacity || sellerSignatory.role),
    representative_id_number: normalizeNullableText(sellerSignatory.idNumber),
    seller_company_registration_number: sellerEntityTypeRaw === 'trust' ? null : sellerRegistrationNumber,
    seller_trust_registration_number: sellerEntityTypeRaw === 'trust' ? sellerRegistrationNumber : null,
    seller_trustee_names: sellerTrusteeNames,
    seller_resolution_date: normalizeNullableText(firstText(sourceSeller.resolutionDate, sourceSeller.resolution_date, sourceSeller.companyResolutionDate, sourceSeller.company_resolution_date, developmentSeller.resolutionDate)),
    seller_authority_basis: normalizeNullableText(firstText(sourceSeller.authorityBasis, sourceSeller.authority_basis, sourceSeller.authorityGranted, sourceSeller.authority_granted, developmentSeller.authorityBasis)),
    seller_vat_number: normalizeNullableText(developmentSeller.vatNumber),
    seller_registered_address: normalizeNullableText(developmentSeller.registeredAddress),
    seller_postal_address: normalizeNullableText(developmentSeller.postalAddress),
    seller_domicilium_address:
      normalizeNullableText(developmentSeller.registeredAddress) ||
      normalizeNullableText(developmentSeller.postalAddress) ||
      normalizeNullableText(transaction?.property_address_line_1) ||
      normalizeNullableText(unit?.development?.address) ||
      null,

    unit_number: normalizeNullableText(propertyUnitNumber),
    erf_number: normalizeNullableText(firstRecordText(propertyRecords, ['erf_number', 'erfNumber', 'erf', 'lot_number', 'lotNumber'])),
    property_address: normalizeNullableText(propertyAddress),
    property_display_address:
      normalizeNullableText(firstRecordText(propertyRecords, ['property_display_address', 'displayAddress', 'display_address', 'fullDisplayAddress', 'full_display_address'])) ||
      normalizeNullableText(compactUniqueJoin([propertyUnitNumber, propertyComplexName, propertyEstateName, propertyAddress])),
    property_suburb: normalizeNullableText(transaction?.suburb) || normalizeNullableText(onboarding.suburb || onboarding.propertySuburb || onboarding.property_suburb) || normalizeNullableText(unit?.development?.suburb),
    property_city: normalizeNullableText(propertyCity),
    property_type: normalizeNullableText(transaction?.property_type) || normalizeNullableText(unit?.property_type),
    property_unit_number: normalizeNullableText(propertyUnitNumber),
    property_section_number: normalizeNullableText(propertySectionNumber),
    property_complex_name: normalizeNullableText(propertyComplexName),
    property_estate_name: normalizeNullableText(propertyEstateName),
    sectional_title_number: normalizeNullableText(sectionalTitleNumber),
    property_nhbrc_certificate_number: normalizeNullableText(onboarding.nhbrcCertificateNumber),
    parking_bay: normalizeNullableText(firstRecordText(propertyRecords, ['parking_bay', 'parkingBay', 'parking', 'parking_bays', 'parkingBays'])),
    storeroom: normalizeNullableText(firstRecordText(propertyRecords, ['storeroom', 'storeRoom', 'store_room', 'storageRoom', 'storage_room'])),

    purchase_price: formatCurrency(purchasePrice),
    deposit_amount: formatCurrency(transaction?.deposit_amount),
    finance_type: toTitleCase(String(transaction?.finance_type || 'cash').replace('combination', 'hybrid')),
    'transaction.finance_type_raw': normalizeText(transaction?.finance_type || 'cash').toLowerCase(),
    bond_amount: formatCurrency(transaction?.bond_amount),
    cash_amount: formatCurrency(cashAmount),
    occupation_date: normalizeNullableText(firstText(offerConditions.occupationDate, offerConditions.occupation_date, offer.occupationDate, offer.occupation_date, onboarding.occupationDate, onboarding.occupation_date)),
    transfer_date: normalizeNullableText(firstText(transaction?.expected_transfer_date, transaction?.target_registration_date, onboarding.transferDate, onboarding.transfer_date, offer.transferDate, offer.transfer_date)),
    suspensive_conditions: normalizeNullableText(firstText(
      normalizeClauseText(offerConditions.suspensiveConditions),
      normalizeClauseText(offerConditions.suspensive_conditions),
      normalizeClauseText(offer.suspensiveConditions),
      normalizeClauseText(offer.suspensive_conditions),
      normalizeClauseText(onboarding.suspensiveConditions),
      normalizeClauseText(onboarding.suspensive_conditions),
    )),
    additional_costs_note: normalizeNullableText(onboarding.additionalCostsNote),

    gross_commission_percentage:
      Number.isFinite(grossCommissionPercentage) ? `${Number(grossCommissionPercentage).toFixed(2)}%` : null,
    gross_commission_amount: formatCurrency(grossCommissionAmount),
    agent_commission_amount: formatCurrency(transaction?.agent_commission_amount),
    agency_commission_amount: formatCurrency(transaction?.agency_commission_amount),

    agent_full_name: normalizeNullableText(transaction?.assigned_agent) || normalizeNullableText(agentProfile.fullName || agentProfile.full_name || agentProfile.name),
    agent_email: normalizeNullableText(transaction?.assigned_agent_email) || normalizeNullableText(agentProfile.email),
    agent_phone: normalizeNullableText(agentProfile.phone || agentProfile.mobile || source.agentPhone || source.agent_phone),
    agent_ffc_number: normalizeNullableText(agentProfile.ffcNumber || agentProfile.ffc_number || agentProfile.fidelityFundCertificateNumber || source.agentFfcNumber || source.agent_ffc_number),
    organisation_name: normalizeNullableText(organisationProfile.displayName || organisationProfile.display_name || organisationProfile.name || agencyProfile.name),
    agency_legal_name: normalizeNullableText(agencyProfile.legalName || agencyProfile.legal_name || organisationProfile.legalName || organisationProfile.legal_name),
    agency_registration_number: normalizeNullableText(agencyProfile.registrationNumber || agencyProfile.registration_number || agencyProfile.companyRegistrationNumber || organisationProfile.registrationNumber || organisationProfile.registration_number || organisationProfile.companyRegistrationNumber),
    agency_vat_number: normalizeNullableText(agencyProfile.vatNumber || agencyProfile.vat_number || organisationProfile.vatNumber || organisationProfile.vat_number),
    agency_address: normalizeNullableText(agencyProfile.address || agencyProfile.physicalAddress || agencyProfile.physical_address || organisationProfile.address || organisationProfile.physicalAddress || organisationProfile.physical_address),
    branch_name: normalizeNullableText(agencyProfile.branchName || agencyProfile.branch_name || organisationProfile.branchName || organisationProfile.branch_name),
    agency_fsp_number: normalizeNullableText(agencyProfile.fspNumber || agencyProfile.fsp_number || organisationProfile.fspNumber || organisationProfile.fsp_number || agencyMetadata.fspNumber || agencyMetadata.fsp_number),
    attorney_firm_name: normalizeNullableText(transaction?.attorney),
    conveyancer_name: normalizeNullableText(transaction?.conveyancer_name || transaction?.assigned_attorney_name || transaction?.attorney_contact_name || source.conveyancerName || source.conveyancer_name),
    conveyancer_email: normalizeNullableText(transaction?.assigned_attorney_email),
    conveyancer_reference: normalizeNullableText(transaction?.conveyancer_reference || transaction?.attorney_reference || transaction?.matter_number || source.conveyancerReference || source.conveyancer_reference),
    developer_name: normalizeNullableText(unit?.development?.developer_company) || normalizeNullableText(unit?.development?.name),
    developer_company_registration: sellerRegistrationNumber,
    developer_representative: normalizeNullableText(sellerSignatory.fullName),
    developer_contact_email: normalizeNullableText(onboarding.developerEmail),
    contractor_company_name: normalizeNullableText(onboarding.buildingContractorName),
    contractor_registration_number: normalizeNullableText(onboarding.buildingContractorRegistrationNumber),
    annexures_list: normalizeNullableText(annexuresList),
    property_disclosure_annexure: normalizeNullableText(disclosureAnnexure?.title),
    property_disclosure_status: normalizeNullableText(disclosureAnnexure?.status),
    property_disclosure_comments: normalizeNullableText(disclosureAnnexure?.comments),
    property_disclosure_locked_at: normalizeNullableText(disclosureAnnexure?.lockedAt || disclosureAnnexure?.locked_at),
    property_disclosure_source_packet_id: normalizeNullableText(disclosureAnnexure?.lockedByPacketId || disclosureAnnexure?.locked_by_packet_id),
    property_disclosure_final_signed_file_path: normalizeNullableText(disclosureAnnexure?.finalSignedFilePath || disclosureAnnexure?.final_signed_file_path),

    special_conditions: normalizeNullableText(specialConditions) || null,
  }
}

export function resolveMandatePacketPlaceholders({
  lead = null,
  mandateDraft = null,
  mandateData = null,
  privateListing = null,
  organisation = null,
  agency = null,
  agent = null,
  contact = null,
  transaction = null,
} = {}) {
  if (mandateData?.placeholders && typeof mandateData.placeholders === 'object') {
    return mandateData.placeholders
  }
  const onboarding = {
    ...(lead?.sellerOnboarding?.formData && typeof lead.sellerOnboarding.formData === 'object'
      ? lead.sellerOnboarding.formData
      : {}),
    ...(mandateDraft && typeof mandateDraft === 'object' ? mandateDraft : {}),
    status: lead?.sellerOnboarding?.status || lead?.sellerOnboardingStatus || mandateDraft?.sellerOnboardingStatus,
  }
  return mapSellerOnboardingToMandateData({
    onboardingSubmission: onboarding,
    lead: lead || {},
    privateListing: privateListing || {},
    agency: agency || {},
    organisation: organisation || {},
    agent: agent || {},
    contact: contact || {},
    transaction: transaction || {},
    mandateDraft: mandateDraft || {},
  }).placeholders
}

export function buildPacketSectionManifest({
  packetType,
  placeholders = {},
} = {}) {
  const definitions = getSectionDefinitions(packetType)
  return definitions
    .filter((definition) => {
      if (typeof definition.condition !== 'function') return true
      return Boolean(definition.condition({ placeholders }))
    })
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      required: definition.required,
      placeholders: definition.placeholders,
    }))
}

export function validatePacketPlaceholders({
  packetType,
  placeholders = {},
  sectionManifest: sectionManifestInput = null,
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'otp'
  const sectionManifest = Array.isArray(sectionManifestInput) && sectionManifestInput.length
    ? sectionManifestInput
    : buildPacketSectionManifest({ packetType: normalizedPacketType, placeholders })
  const normalizedPayload = normalizeMergeFieldPayload(placeholders, {
    packetType: normalizedPacketType,
    includeAliasKeys: true,
  })
  const critical = []
  const warnings = []
  const missingPlaceholders = []
  const unknownTokens = []
  const deprecatedTokens = []

  for (const section of sectionManifest) {
    const sectionTokens = (section.placeholders || []).map(([placeholderKey]) => normalizeText(placeholderKey)).filter(Boolean)
    const tokenValidation = validateTemplateTokensAgainstRegistry({
      tokens: sectionTokens,
      packetType: normalizedPacketType,
    })
    if (tokenValidation.unknown.length) {
      unknownTokens.push(...tokenValidation.unknown.map((row) => ({ ...row, sectionKey: section.key, sectionLabel: section.label })))
    }
    if (tokenValidation.deprecated.length) {
      deprecatedTokens.push(...tokenValidation.deprecated.map((row) => ({ ...row, sectionKey: section.key, sectionLabel: section.label })))
    }
    for (const [placeholderKey, placeholderLabel] of section.placeholders || []) {
      const definition = getCanonicalMergeFieldDefinition(placeholderKey, {
        packetType: normalizedPacketType,
      })
      const fieldLabel = normalizeText(definition?.label || placeholderLabel || placeholderKey)
      const isRequiredPlaceholder = Boolean(section.required && (definition?.required ?? true))
      const value = resolvePlaceholderValue(normalizedPayload.payload, placeholderKey, normalizedPacketType)
      const missing = value === null || value === undefined || value === ''
      if (!missing) continue

      const missingRecord = {
        sectionKey: section.key,
        sectionLabel: section.label,
        placeholderKey,
        placeholderLabel: fieldLabel,
        required: isRequiredPlaceholder,
      }
      missingPlaceholders.push(missingRecord)
      warnings.push({
        ...missingRecord,
        message: `${isRequiredPlaceholder ? 'Missing' : 'Optional'} ${fieldLabel}.`,
      })
    }
  }

  for (const row of unknownTokens) {
    const suggestion = row.suggested ? ` Use {{${row.suggested}}}.` : ''
    critical.push({
      sectionKey: row.sectionKey,
      sectionLabel: row.sectionLabel,
      placeholderKey: row.token,
      placeholderLabel: row.token,
      message: `Unknown merge field {{${row.token}}}.${suggestion}`,
    })
  }

  for (const row of deprecatedTokens) {
    if (!row.canonicalKey || row.canonicalKey === row.token) continue
    warnings.push({
      sectionKey: row.sectionKey,
      sectionLabel: row.sectionLabel,
      placeholderKey: row.token,
      placeholderLabel: row.token,
      message: `Field {{${row.token}}} is legacy. Prefer {{${row.canonicalKey}}}.`,
    })
  }

  const manifestTokens = sectionManifest
    .flatMap((section) => (section.placeholders || []).map(([placeholderKey]) => normalizeText(placeholderKey)).filter(Boolean))
  const manifestValidation = validateTemplateTokensAgainstRegistry({
    tokens: manifestTokens,
    packetType: normalizedPacketType,
  })
  for (const missingField of manifestValidation.missingRequired || []) {
    warnings.push({
      sectionKey: 'registry',
      sectionLabel: 'Canonical Registry',
      placeholderKey: missingField.key,
      placeholderLabel: missingField.label,
      message: `Required canonical field {{${missingField.key}}} (${missingField.label}) is not referenced in template sections.`,
    })
  }

  return {
    sectionManifest,
    critical,
    warnings,
    missingPlaceholders,
    aliasHits: normalizedPayload.aliasHits || [],
    unknownFields: normalizedPayload.unknownKeys || [],
    isValidForGeneration: critical.length === 0,
  }
}

function normalizePlaceholderParties(value = []) {
  return Array.isArray(value)
    ? dedupePartyRecords(value.map((party, index) => normalizePartyRecord(party, {
        role: party?.role || 'Party',
        title: party?.title || party?.label || `Party ${index + 1}`,
      })))
    : []
}

function buildPartyField(label, value, { required = false } = {}) {
  const resolved = normalizeText(value)
  const missing = required && !resolved
  if (!resolved && !required) return null
  return {
    label,
    value: missing ? buildMissingToken(label) : resolved,
    missing,
  }
}

function renderPartyCardGrid(groups = [], { compact = false } = {}) {
  const normalizedGroups = groups
    .map((group) => ({
      label: normalizeText(group.label),
      parties: Array.isArray(group.parties) ? group.parties.filter(Boolean) : [],
    }))
    .filter((group) => group.parties.length)
  if (!normalizedGroups.length) return ''

  return normalizedGroups.map((group) => `
    <div class="party-card-group">
      ${group.label ? `<h4>${escapeHtml(group.label)}</h4>` : ''}
      <div class="party-card-grid ${compact ? 'party-card-grid-compact' : ''}">
        ${group.parties.map((party, index) => {
          const fields = [
            buildPartyField('Name', party.name, { required: true }),
            buildPartyField('ID / Registration', party.idNumber, { required: party.role !== 'Agent' }),
            buildPartyField('Email', party.email, { required: party.role !== 'Agent' }),
            buildPartyField('Phone', party.phone),
            buildPartyField('Capacity', party.capacity),
            buildPartyField('Ownership', party.ownershipShare),
            buildPartyField('Organisation', party.organisationName),
            buildPartyField('FFC number', party.ffcNumber),
          ].filter(Boolean)
          return `
            <article class="party-card">
              <h5>${escapeHtml(party.title || party.role || `Party ${index + 1}`)}</h5>
              <dl>
                ${fields.map((field) => `
                  <div class="party-card-row">
                    <dt>${escapeHtml(field.label)}</dt>
                    <dd class="${field.missing ? 'packet-preview-missing' : ''}">${renderInlineText(field.value)}</dd>
                  </div>
                `).join('\n')}
              </dl>
            </article>
          `
        }).join('\n')}
      </div>
    </div>
  `).join('\n')
}

function getPartyGroupsForSection(section, placeholders = {}, packetType = 'otp') {
  const sectionKey = normalizeText(section?.key)
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'otp'
  if (normalizedPacketType !== 'mandate' && sectionKey === 'buyer_details') {
    const buyerParties = normalizePlaceholderParties(placeholders.buyer_parties)
    const fallbackBuyer = normalizePartyRecord({
      title: 'Buyer',
      name: placeholders.buyer_full_name,
      idNumber: placeholders.buyer_id_number,
      email: placeholders.buyer_email,
      phone: placeholders.buyer_phone,
    }, { role: 'Buyer', title: 'Buyer' })
    const parties = buyerParties.length ? buyerParties : [fallbackBuyer].filter(Boolean)
    return parties.length ? [{ label: '', parties }] : []
  }
  if (normalizedPacketType !== 'mandate' && sectionKey === 'seller_details') {
    const sellerParties = normalizePlaceholderParties(placeholders.seller_parties)
    const fallbackSeller = normalizePartyRecord({
      title: 'Seller',
      name: placeholders.seller_full_name,
      idNumber: placeholders.seller_id_number,
      email: placeholders.seller_email,
      phone: placeholders.seller_phone,
    }, { role: 'Seller', title: 'Seller' })
    const parties = sellerParties.length ? sellerParties : [fallbackSeller].filter(Boolean)
    return parties.length ? [{ label: '', parties }] : []
  }
  if (normalizedPacketType === 'mandate' && sectionKey === 'parties') {
    const sellerParties = normalizePlaceholderParties(placeholders.seller_parties)
    const fallbackSeller = normalizePartyRecord({
      title: 'Seller',
      name: placeholders.seller_full_name,
      idNumber: placeholders.seller_id_number,
      email: placeholders.seller_email,
      phone: placeholders.seller_phone,
    }, { role: 'Seller', title: 'Seller' })
    const sellers = sellerParties.length ? sellerParties : [fallbackSeller].filter(Boolean)
    const agentParty = normalizePartyRecord({
      role: 'Agent',
      title: 'Agent / Agency',
      name: placeholders.agent_full_name,
      email: placeholders.agent_email,
      phone: placeholders.agent_phone,
      organisationName: placeholders.organisation_name || placeholders.organisation_display_name || placeholders.agency_display_name,
      ffcNumber: placeholders.agent_ffc_number,
    }, {
      role: 'Agent',
      title: 'Agent / Agency',
    })
    return [
      sellers.length ? { label: 'Sellers', parties: sellers } : null,
      agentParty ? { label: 'Agency', parties: [agentParty] } : null,
    ].filter(Boolean)
  }
  return []
}

function renderSectionHtml(section, placeholders, packetType = 'otp') {
  const partyGroups = getPartyGroupsForSection(section, placeholders, packetType)
  const partyContent = renderPartyCardGrid(partyGroups)
  if (partyContent) {
    return `
      <section class="packet-preview-section" data-section-key="${escapeHtml(section.key)}">
        <h3>${escapeHtml(section.label)}</h3>
        ${partyContent}
      </section>
    `
  }

  const rows = (section.placeholders || []).map(([placeholderKey, placeholderLabel]) => {
    const resolvedValue = safeValueOrMissing(placeholders, placeholderKey, placeholderLabel, packetType)
    const missing = resolvedValue.startsWith('[MISSING:')
    return `
      <div class="packet-preview-row">
        <dt>${escapeHtml(placeholderLabel)}</dt>
        <dd class="${missing ? 'packet-preview-missing' : ''}">${renderInlineText(resolvedValue)}</dd>
      </div>
    `
  })

  return `
    <section class="packet-preview-section" data-section-key="${escapeHtml(section.key)}">
      <h3>${escapeHtml(section.label)}</h3>
      <dl>${rows.join('\n')}</dl>
    </section>
  `
}

function getPreviewField(placeholders, key, label, packetType = 'mandate') {
  const value = safeValueOrMissing(placeholders, key, label, packetType)
  const missing = value.startsWith('[MISSING:')
  return {
    value,
    html: `<span class="${missing ? 'packet-preview-missing' : ''}">${renderInlineText(value)}</span>`,
    missing,
  }
}

function renderLegalClauseRows(section, placeholders, packetType, sectionIndex) {
  if (normalizeText(section.legalText)) {
    return appendSectionSigningRequirement(renderLegalTextBlocks(section.legalText, placeholders, packetType), section, placeholders, packetType)
  }

  if (section.key === 'introduction_purpose') {
    const intro = getPreviewField(placeholders, 'mandate_introduction_purpose', 'Introduction and Purpose', packetType)
    return appendSectionSigningRequirement(
      `<p class="legal-preview-paragraph ${intro.missing ? 'packet-preview-missing-block' : ''}">${intro.html}</p>`,
      section,
      placeholders,
      packetType,
    )
  }

  if (section.key === 'parties') {
    const partyContent = renderPartyCardGrid(getPartyGroupsForSection(section, placeholders, packetType), { compact: true })
    if (partyContent) return appendSectionSigningRequirement(partyContent, section, placeholders, packetType)
  }

  if (section.key === 'signature_pages') {
    const seller = getPreviewField(placeholders, 'seller_full_name', 'Seller Full Name', packetType)
    const agent = getPreviewField(placeholders, 'agent_full_name', 'Agent / Agency Representative', packetType)
    return appendSectionSigningRequirement(`
      <div class="legal-signature-grid">
        <div class="legal-signature-block">
          <span class="legal-signature-line"></span>
          <strong>Seller</strong>
          <p>${seller.html}</p>
          <small>Date: ____________________</small>
        </div>
        <div class="legal-signature-block">
          <span class="legal-signature-line"></span>
          <strong>Agent / Agency Representative</strong>
          <p>${agent.html}</p>
          <small>Date: ____________________</small>
        </div>
      </div>
    `, section, placeholders, packetType)
  }

  return appendSectionSigningRequirement(`
    <ol class="legal-clause-list">
      ${(section.placeholders || [])
        .map(([placeholderKey, placeholderLabel], rowIndex) => {
          const field = getPreviewField(placeholders, placeholderKey, placeholderLabel, packetType)
          return `
            <li>
              <span class="legal-clause-number">${sectionIndex}.${rowIndex + 1}</span>
              <span class="legal-clause-label">${escapeHtml(placeholderLabel)}</span>
              <span class="legal-clause-value ${field.missing ? 'packet-preview-missing-inline' : ''}">${field.html}</span>
            </li>
          `
        })
        .join('\n')}
    </ol>
  `, section, placeholders, packetType)
}

function renderMandateSectionHtml(section, placeholders, packetType, index) {
  const sectionIndex = index + 1
  return `
    <section class="legal-preview-section" data-section-key="${escapeHtml(section.key)}">
      <h2><span>${sectionIndex}.</span> ${escapeHtml(section.label)}</h2>
      ${renderLegalClauseRows(section, placeholders, packetType, sectionIndex)}
    </section>
  `
}

export function renderPacketPreviewHtml({
  packetType,
  title = '',
  placeholders = {},
  sectionManifest = [],
  branding = {},
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  const safeTitle = normalizeText(title) || `${toTitleCase(packetType)} Packet Preview`
  const orgName = normalizeText(branding?.organisationName || '') || 'Organisation'
  const organisationLogo = resolvePublicAssetUrl(
    normalizeText(branding?.logoLightUrl || '') ||
    normalizeText(branding?.organisationLogoUrl || '') ||
    normalizeText(branding?.logoDarkUrl || '') ||
    normalizeText(branding?.logoHighContrastUrl || '') ||
    normalizeText(branding?.organisationLogoDarkUrl || '') ||
    normalizeText(branding?.organisationLogoHighContrastUrl || '') ||
    normalizeText(branding?.organisation_high_contrast_logo_url || '') ||
    '',
  )
  const contactItems = resolveDocumentContactItems(branding, placeholders)
  const isLegalDocumentPreview = ['mandate', 'otp'].includes(normalizedPacketType)
  const legalDocumentTitle = normalizedPacketType === 'mandate'
    ? 'Mandate Agreement'
    : normalizedPacketType === 'otp'
      ? 'Offer to Purchase'
      : safeTitle
  const documentReference =
    normalizeText(placeholders.document_reference || placeholders.transaction_reference || placeholders.packet_reference) ||
    normalizeText(title) ||
    'Preview reference pending'

  const renderedSections = isLegalDocumentPreview
    ? sectionManifest.map((section, index) => renderMandateSectionHtml(section, placeholders, packetType, index)).join('\n')
    : sectionManifest.map((section) => renderSectionHtml(section, placeholders, packetType)).join('\n')

  const legalPreviewClass = isLegalDocumentPreview ? 'packet-preview-shell legal-document-preview-shell' : 'packet-preview-shell'
  const legalBodyClass = isLegalDocumentPreview ? 'legal-document-preview-body' : ''

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${safeTitle}</title>
        <style>
          :root {
            color-scheme: light;
            font-family: Helvetica, Arial, sans-serif;
          }
          body {
            margin: 0;
            padding: 24px;
            background: #f4f7fb;
            color: #13263a;
          }
          .packet-preview-shell {
            margin: 0 auto;
            max-width: 980px;
            border: 1px solid #d7e4f2;
            border-radius: 18px;
            overflow: hidden;
            background: #ffffff;
            box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
            font-family: Helvetica, Arial, sans-serif;
          }
          .packet-preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 20px;
            padding: 18px 20px;
            border-bottom: 1px solid #dfe9f4;
            background: linear-gradient(180deg, #ffffff 0%, #f9fbfe 100%);
          }
          .packet-preview-brand-left {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .packet-preview-logo {
            width: 44px;
            height: 44px;
            border: 1px solid #d7e4f2;
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #fff;
            overflow: hidden;
          }
          .packet-preview-logo img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          .document-contact-row {
            display: grid;
            align-items: start;
            justify-content: end;
            gap: 6px;
            min-width: 0;
            color: #13263a;
            font-size: 0.76rem;
            line-height: 1.35;
          }
          .document-contact-item {
            display: grid;
            grid-template-columns: 15px minmax(0, 1fr);
            align-items: start;
            gap: 6px;
            min-width: 0;
            max-width: 260px;
          }
          .document-contact-icon {
            display: inline-flex;
            width: 15px;
            height: 15px;
            flex: 0 0 15px;
            color: #111827;
          }
          .document-contact-icon svg {
            width: 15px;
            height: 15px;
          }
          .document-contact-value {
            min-width: 0;
            overflow-wrap: break-word;
            word-break: normal;
          }
          .packet-preview-title {
            padding: 18px 20px 4px;
          }
          .packet-preview-title h1 {
            margin: 0;
            font-size: 1.35rem;
            letter-spacing: 0;
          }
          .packet-preview-title p {
            margin: 6px 0 0;
            color: #58708a;
            font-size: 0.92rem;
          }
          .packet-preview-content {
            padding: 18px 20px 22px;
            display: grid;
            gap: 14px;
          }
          .packet-preview-section {
            border: 1px solid #dfebf6;
            border-radius: 14px;
            background: #fcfdff;
            padding: 12px 14px;
          }
          .packet-preview-section h3 {
            margin: 0 0 8px;
            font-size: 0.9rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: #607991;
          }
          .packet-preview-section dl {
            margin: 0;
            display: grid;
            gap: 8px;
          }
          .packet-preview-row {
            display: grid;
            grid-template-columns: minmax(140px, 220px) 1fr;
            gap: 12px;
          }
          .packet-preview-row dt {
            font-size: 0.82rem;
            color: #6b8198;
          }
          .packet-preview-row dd {
            margin: 0;
            font-size: 0.9rem;
            color: #13263a;
            font-weight: 550;
          }
          .party-card-group {
            display: grid;
            gap: 8px;
          }
          .party-card-group + .party-card-group {
            margin-top: 12px;
          }
          .party-card-group h4 {
            margin: 0;
            color: #3f4a56;
            font-size: 0.82rem;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          .party-card-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }
          .party-card {
            border: 1px solid #d9e5f1;
            border-radius: 10px;
            background: #ffffff;
            padding: 10px 12px;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .party-card h5 {
            margin: 0 0 8px;
            color: #13263a;
            font-size: 0.9rem;
            font-weight: 750;
          }
          .party-card dl {
            display: grid;
            gap: 5px;
            margin: 0;
          }
          .party-card-row {
            display: grid;
            grid-template-columns: minmax(92px, 0.42fr) minmax(0, 1fr);
            gap: 8px;
            align-items: start;
          }
          .party-card-row dt {
            color: #6b8198;
            font-size: 0.78rem;
          }
          .party-card-row dd {
            margin: 0;
            color: #13263a;
            font-size: 0.84rem;
            font-weight: 650;
            overflow-wrap: anywhere;
          }
          .packet-preview-missing {
            color: #8a3b15 !important;
            background: #fff6df;
            box-shadow: inset 0 -0.45em 0 rgba(255, 214, 120, 0.32);
            font-weight: 700 !important;
          }
          .legal-document-preview-shell {
            max-width: 210mm;
            min-height: 286mm;
            border-radius: 4px;
            border-color: #d7d7d7;
            box-shadow: 0 22px 60px rgba(15, 23, 42, 0.12);
          }
          .legal-document-preview-shell .packet-preview-header {
            padding: 18mm 18mm 8mm;
            border-bottom: 1px solid #d8d8d8;
            background: #ffffff;
          }
          .legal-document-preview-shell .packet-preview-brand-left {
            min-width: 0;
            flex: 0 0 auto;
          }
          .legal-document-preview-shell .packet-preview-logo {
            width: auto;
            min-width: 34mm;
            max-width: 48mm;
            height: 15mm;
            border: 0;
            border-radius: 0;
          }
          .legal-document-preview-shell .packet-preview-logo img {
            max-width: 48mm;
            max-height: 15mm;
          }
          .legal-document-preview-shell .packet-preview-logo strong {
            color: #111827;
            font-size: 15px;
            line-height: 1.15;
          }
          .legal-document-preview-shell .document-contact-row {
            flex: 0 1 78mm;
            gap: 2mm;
            font-size: 10.5px;
          }
          .legal-document-preview-shell .document-contact-item {
            grid-template-columns: 4mm minmax(0, 1fr);
            max-width: 78mm;
            gap: 2mm;
          }
          .legal-document-preview-shell .document-contact-icon,
          .legal-document-preview-shell .document-contact-icon svg {
            width: 4mm;
            height: 4mm;
          }
          .legal-document-preview-shell .packet-preview-title {
            padding: 9mm 18mm 6mm;
            text-align: center;
            border-bottom: 1px solid #e4e4e4;
          }
          .legal-document-preview-shell .packet-preview-title h1 {
            color: #111827;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 0;
            text-transform: uppercase;
          }
          .legal-document-preview-shell .packet-preview-title p {
            margin-top: 7px;
            color: #5c6670;
            font-size: 12px;
            line-height: 1.45;
          }
          .legal-document-preview-body {
            display: block;
            padding: 9mm 18mm 16mm;
          }
          .legal-preview-section {
            margin: 0 0 9mm;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .legal-preview-section h2 {
            margin: 0 0 4mm;
            padding: 0 0 2mm;
            border-bottom: 1px solid #d7d7d7;
            color: #111827;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.04em;
            line-height: 1.35;
            text-transform: uppercase;
          }
          .legal-preview-section h2 span {
            display: inline-block;
            min-width: 22px;
          }
          .legal-preview-paragraph {
            margin: 0;
            color: #1f2937;
            font-size: 13px;
            line-height: 1.72;
          }
          .legal-preview-paragraph + .legal-preview-table,
          .legal-preview-table + .legal-preview-paragraph {
            margin-top: 4mm;
          }
          .legal-preview-table {
            width: 100%;
            border-collapse: collapse;
            color: #1f2937;
            font-size: 12px;
            line-height: 1.45;
          }
          .legal-preview-table th,
          .legal-preview-table td {
            border: 1px solid #d7d7d7;
            padding: 2.5mm 3mm;
            text-align: left;
            vertical-align: top;
          }
          .legal-preview-table th {
            background: #f6f7f8;
            color: #111827;
            font-weight: 700;
          }
          .legal-section-signing-requirement {
            display: grid;
            grid-template-columns: minmax(34mm, 0.3fr) minmax(0, 1fr);
            gap: 4mm;
            align-items: end;
            margin-top: 5mm;
            color: #1f2937;
            font-size: 12px;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .legal-section-signing-label {
            color: #3f4a56;
            font-weight: 700;
          }
          .legal-section-signing-line {
            min-height: 8mm;
            border-bottom: 1px solid #111827;
            padding-bottom: 1.5mm;
          }
          .legal-clause-list {
            display: grid;
            gap: 3mm;
            margin: 0;
            padding: 0;
            list-style: none;
          }
          .legal-clause-list li {
            display: grid;
            grid-template-columns: 30px minmax(130px, 0.38fr) minmax(0, 1fr);
            gap: 8px;
            color: #1f2937;
            font-size: 12.5px;
            line-height: 1.55;
          }
          .legal-clause-number,
          .legal-clause-label {
            color: #3f4a56;
            font-weight: 700;
          }
          .legal-clause-value {
            color: #111827;
          }
          .legal-document-preview-shell .party-card-group {
            gap: 3mm;
          }
          .legal-document-preview-shell .party-card-group + .party-card-group {
            margin-top: 5mm;
          }
          .legal-document-preview-shell .party-card-group h4 {
            color: #3f4a56;
            font-size: 11px;
          }
          .legal-document-preview-shell .party-card-grid {
            gap: 3mm;
          }
          .legal-document-preview-shell .party-card {
            border-color: #d7d7d7;
            border-radius: 2mm;
            padding: 3mm;
          }
          .legal-document-preview-shell .party-card h5 {
            font-size: 12px;
            margin-bottom: 2mm;
          }
          .legal-document-preview-shell .party-card dl {
            gap: 1.5mm;
          }
          .legal-document-preview-shell .party-card-row {
            grid-template-columns: minmax(28mm, 0.42fr) minmax(0, 1fr);
            gap: 2mm;
          }
          .legal-document-preview-shell .party-card-row dt,
          .legal-document-preview-shell .party-card-row dd {
            font-size: 11px;
            line-height: 1.4;
          }
          .legal-signature-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12mm 10mm;
            margin-top: 13mm;
          }
          .legal-signature-block {
            min-height: 34mm;
            color: #1f2937;
            font-size: 12px;
          }
          .legal-signature-line {
            display: block;
            border-top: 1px solid #111827;
            margin-bottom: 3mm;
          }
          .legal-signature-block strong,
          .legal-signature-block p,
          .legal-signature-block small {
            display: block;
            margin: 0 0 2mm;
          }
          .legal-preview-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8mm;
            padding: 5mm 18mm 7mm;
            border-top: 1px solid #d8d8d8;
            color: #606a75;
            font-size: 10.5px;
          }
          .legal-preview-footer-brand,
          .legal-preview-footer-spacer {
            display: inline-flex;
            align-items: center;
            min-width: 34mm;
            max-width: 44mm;
          }
          .legal-preview-footer img {
            max-width: 34mm;
            max-height: 9mm;
            object-fit: contain;
          }
          .legal-preview-page-number {
            flex: 1;
            text-align: center;
            font-weight: 700;
          }
          @media print {
            body {
              padding: 0;
              background: #ffffff;
            }
            .legal-document-preview-shell {
              width: 210mm;
              min-height: 297mm;
              border: 0;
              box-shadow: none;
            }
          }
          @media (max-width: 780px) {
            body {
              padding: 10px;
            }
            .legal-document-preview-shell {
              min-height: 0;
            }
            .legal-document-preview-shell .packet-preview-header,
            .legal-preview-footer {
              padding-left: 14px;
              padding-right: 14px;
              flex-wrap: wrap;
            }
            .legal-document-preview-shell .packet-preview-title,
            .legal-document-preview-body {
              padding-left: 14px;
              padding-right: 14px;
            }
            .packet-preview-row {
              grid-template-columns: 1fr;
              gap: 4px;
            }
            .document-contact-row {
              justify-content: flex-start;
              width: 100%;
            }
            .document-contact-item {
              max-width: 100%;
            }
            .party-card-grid {
              grid-template-columns: 1fr;
            }
            .party-card-row {
              grid-template-columns: 1fr;
              gap: 3px;
            }
            .legal-clause-list li {
              grid-template-columns: 1fr;
              gap: 3px;
            }
            .legal-signature-grid {
              grid-template-columns: 1fr;
            }
            .legal-preview-footer {
              flex-wrap: wrap;
              justify-content: center;
              text-align: center;
            }
          }
        </style>
      </head>
      <body>
        <div class="${legalPreviewClass}">
          <header class="packet-preview-header">
            <div class="packet-preview-brand-left">
              <span class="packet-preview-logo">
                ${organisationLogo ? `<img src="${escapeHtml(organisationLogo)}" alt="${escapeHtml(orgName)} logo" />` : `<strong>${escapeHtml(orgName)}</strong>`}
              </span>
            </div>
            ${renderDocumentContactRow(contactItems)}
          </header>
          <div class="packet-preview-title">
            <h1>${escapeHtml(legalDocumentTitle)}</h1>
            <p>
              ${isLegalDocumentPreview ? `Document reference: ${escapeHtml(documentReference)}` : 'Generated preview'}
              ${isLegalDocumentPreview ? '<br />Preview pagination is illustrative; final PDF pagination is calculated during document export.' : ' • Missing values are highlighted in red.'}
            </p>
          </div>
          <main class="packet-preview-content ${legalBodyClass}">
            ${renderedSections}
          </main>
          ${isLegalDocumentPreview ? `
            <footer class="legal-preview-footer">
              <span class="legal-preview-footer-brand">
                ${organisationLogo ? `<img src="${escapeHtml(organisationLogo)}" alt="${escapeHtml(orgName)} logo" />` : escapeHtml(orgName)}
              </span>
              <span class="legal-preview-page-number">Page 1 of 1 (preview)</span>
              <span class="legal-preview-footer-spacer"></span>
            </footer>
          ` : ''}
        </div>
      </body>
    </html>
  `
}
