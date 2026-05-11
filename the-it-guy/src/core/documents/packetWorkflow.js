import {
  getCanonicalMergeFieldDefinition,
  normalizeMergeFieldPayload,
  resolveCanonicalMergeFieldKey,
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry'

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

const DEFAULT_MANDATE_INTRODUCTION_PURPOSE =
  'This Mandate Agreement records the appointment of the Agent by the Seller to market the property described in this agreement and to perform the related services set out herein. The purpose of this document is to confirm the parties, the property, the mandate terms, commission arrangements, and any special conditions applicable to the marketing and sale of the property.'

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
    condition: ({ placeholders }) => ['bond', 'combination', 'hybrid'].includes(String(placeholders.finance_type || placeholders['transaction.finance_type_raw'] || '').toLowerCase()),
    placeholders: [
      ['bond_amount', 'Bond Amount'],
      ['finance_type', 'Finance Type'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_company',
    label: 'Company Authority Clause',
    required: false,
    condition: ({ placeholders }) => String(placeholders.buyer_entity_type || placeholders['buyer.entity_type_raw'] || '').toLowerCase() === 'company',
    placeholders: [
      ['buyer_representative_name', 'Authorised Representative'],
      ['buyer_representative_capacity', 'Representative Capacity'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_trust',
    label: 'Trust Authority Clause',
    required: false,
    condition: ({ placeholders }) => String(placeholders.buyer_entity_type || placeholders['buyer.entity_type_raw'] || '').toLowerCase() === 'trust',
    placeholders: [
      ['buyer_trust_registration_number', 'Trust Registration Number'],
      ['buyer_representative_name', 'Trustee Representative'],
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
      ['seller_id_number', 'Seller ID / Registration'],
      ['seller_email', 'Seller Email'],
      ['agent_full_name', 'Agent / Agency Representative'],
      ['agency_name', 'Agency'],
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
    key: 'entity_clause_company',
    label: 'Company Authority Clause',
    required: false,
    condition: ({ placeholders }) => String(placeholders.seller_entity_type || placeholders['seller.entity_type_raw'] || '').toLowerCase() === 'company',
    placeholders: [
      ['seller_representative_name', 'Authorised Representative'],
      ['seller_representative_capacity', 'Representative Capacity'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_trust',
    label: 'Trust Authority Clause',
    required: false,
    condition: ({ placeholders }) => String(placeholders.seller_entity_type || placeholders['seller.entity_type_raw'] || '').toLowerCase() === 'trust',
    placeholders: [
      ['seller_trust_registration_number', 'Trust Registration Number'],
      ['seller_representative_name', 'Trustee Representative'],
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

export function resolveOtpPacketPlaceholders({
  transaction = null,
  unit = null,
  buyer = null,
  onboardingFormData = null,
  specialConditions = '',
} = {}) {
  const buyerEntityTypeRaw = normalizeText(transaction?.purchaser_type || onboardingFormData?.purchaserType || 'individual').toLowerCase()
  const sellerName = normalizeText(unit?.development?.developer_company || unit?.development?.name || transaction?.matter_owner || 'Seller')
  const purchasePrice = normalizeOptionalNumber(transaction?.purchase_price) ?? normalizeOptionalNumber(transaction?.sales_price)
  const grossCommissionPercentage = normalizeOptionalNumber(transaction?.gross_commission_percentage)
  const grossCommissionAmount =
    normalizeOptionalNumber(transaction?.gross_commission_amount) ??
    (Number.isFinite(purchasePrice) && Number.isFinite(grossCommissionPercentage)
      ? Number(((purchasePrice * grossCommissionPercentage) / 100).toFixed(2))
      : null)

  return {
    buyer_full_name: normalizeNullableText(buyer?.name) || normalizeNullableText(onboardingFormData?.firstName) || null,
    buyer_id_number:
      normalizeNullableText(onboardingFormData?.idNumber) ||
      normalizeNullableText(onboardingFormData?.companyRegistrationNumber) ||
      normalizeNullableText(onboardingFormData?.trustRegistrationNumber) ||
      null,
    buyer_email: normalizeNullableText(buyer?.email) || null,
    buyer_phone: normalizeNullableText(buyer?.phone) || null,
    buyer_entity_type: toTitleCase(buyerEntityTypeRaw || 'individual'),
    'buyer.entity_type_raw': buyerEntityTypeRaw || 'individual',
    buyer_representative_name: normalizeNullableText(onboardingFormData?.authorizedRepresentativeName),
    buyer_representative_capacity: normalizeNullableText(onboardingFormData?.authorizedRepresentativeCapacity),
    buyer_trust_registration_number: normalizeNullableText(onboardingFormData?.trustRegistrationNumber),
    buyer_marketing_opt_in: normalizeNullableText(onboardingFormData?.marketingConsent),
    buyer_domicilium_address:
      normalizeNullableText(onboardingFormData?.residentialAddress) ||
      normalizeNullableText(onboardingFormData?.physicalAddress) ||
      null,

    seller_full_name: sellerName || null,
    seller_id_number: normalizeNullableText(transaction?.seller_registration_number) || null,
    seller_domicilium_address:
      normalizeNullableText(transaction?.property_address_line_1) ||
      normalizeNullableText(unit?.development?.address) ||
      null,

    unit_number: normalizeNullableText(unit?.unit_number ? `Unit ${unit.unit_number}` : null),
    property_address:
      normalizeNullableText(transaction?.property_address_line_1) ||
      normalizeNullableText(onboardingFormData?.propertyAddress) ||
      normalizeNullableText(unit?.development?.address) ||
      null,
    property_suburb: normalizeNullableText(transaction?.suburb) || normalizeNullableText(unit?.development?.suburb),
    property_type: normalizeNullableText(transaction?.property_type) || normalizeNullableText(unit?.property_type),
    property_nhbrc_certificate_number: normalizeNullableText(onboardingFormData?.nhbrcCertificateNumber),

    purchase_price: formatCurrency(purchasePrice),
    deposit_amount: formatCurrency(transaction?.deposit_amount),
    finance_type: toTitleCase(String(transaction?.finance_type || 'cash').replace('combination', 'hybrid')),
    'transaction.finance_type_raw': normalizeText(transaction?.finance_type || 'cash').toLowerCase(),
    bond_amount: formatCurrency(transaction?.bond_amount),
    additional_costs_note: normalizeNullableText(onboardingFormData?.additionalCostsNote),

    gross_commission_percentage:
      Number.isFinite(grossCommissionPercentage) ? `${Number(grossCommissionPercentage).toFixed(2)}%` : null,
    gross_commission_amount: formatCurrency(grossCommissionAmount),
    agent_commission_amount: formatCurrency(transaction?.agent_commission_amount),
    agency_commission_amount: formatCurrency(transaction?.agency_commission_amount),

    agent_full_name: normalizeNullableText(transaction?.assigned_agent),
    agent_email: normalizeNullableText(transaction?.assigned_agent_email),
    attorney_firm_name: normalizeNullableText(transaction?.attorney),
    conveyancer_email: normalizeNullableText(transaction?.assigned_attorney_email),
    developer_name: normalizeNullableText(unit?.development?.developer_company) || normalizeNullableText(unit?.development?.name),
    developer_contact_email: normalizeNullableText(onboardingFormData?.developerEmail),
    contractor_company_name: normalizeNullableText(onboardingFormData?.buildingContractorName),
    contractor_registration_number: normalizeNullableText(onboardingFormData?.buildingContractorRegistrationNumber),
    annexures_list: normalizeNullableText(onboardingFormData?.annexuresList),

    special_conditions: normalizeNullableText(specialConditions) || null,
  }
}

export function resolveMandatePacketPlaceholders({
  lead = null,
  mandateDraft = null,
} = {}) {
  const onboarding = lead?.sellerOnboarding?.formData || {}
  const ownershipType = normalizeText(onboarding?.ownershipType || 'individual').toLowerCase()
  const sellerDisplayName =
    normalizeNullableText([lead?.sellerName, lead?.sellerSurname].filter(Boolean).join(' ')) ||
    normalizeNullableText(lead?.name) ||
    'Seller'

  return {
    mandate_introduction_purpose:
      normalizeNullableText(mandateDraft?.introductionPurpose) ||
      normalizeNullableText(mandateDraft?.introduction) ||
      normalizeNullableText(mandateDraft?.purposeText) ||
      DEFAULT_MANDATE_INTRODUCTION_PURPOSE,
    seller_full_name: sellerDisplayName,
    seller_id_number:
      normalizeNullableText(onboarding?.idNumber) ||
      normalizeNullableText(onboarding?.companyRegistrationNumber) ||
      normalizeNullableText(onboarding?.trustRegistrationNumber) ||
      null,
    seller_email: normalizeNullableText(lead?.sellerEmail),
    seller_phone: normalizeNullableText(lead?.sellerPhone),
    seller_entity_type: toTitleCase(ownershipType || 'individual'),
    'seller.entity_type_raw': ownershipType || 'individual',
    seller_representative_name: normalizeNullableText(onboarding?.authorizedRepresentativeName),
    seller_representative_capacity: normalizeNullableText(onboarding?.authorizedRepresentativeCapacity),
    seller_trust_registration_number: normalizeNullableText(onboarding?.trustRegistrationNumber),

    property_address:
      normalizeNullableText(onboarding?.propertyAddress) ||
      normalizeNullableText(lead?.propertyAddress) ||
      normalizeNullableText(lead?.listingTitle),
    property_type: normalizeNullableText(onboarding?.propertyType) || normalizeNullableText(lead?.propertyType),

    mandate_type: toTitleCase(mandateDraft?.mandateType || 'sole'),
    mandate_start_date: normalizeNullableText(mandateDraft?.mandateStartDate),
    mandate_end_date: normalizeNullableText(mandateDraft?.mandateEndDate),
    mandate_authority_granted:
      normalizeNullableText(mandateDraft?.authorityGranted) ||
      'The Seller authorises the Agent to market the property and perform the services reasonably required to introduce prospective purchasers and progress a sale on the terms recorded in this agreement.',
    commission_structure: toTitleCase(mandateDraft?.commissionStructure || 'percentage'),
    mandate_commission_percent:
      mandateDraft?.commissionStructure === 'percentage' && normalizeNullableText(mandateDraft?.commissionPercent)
        ? `${Number(mandateDraft.commissionPercent).toFixed(2)}%`
        : null,
    mandate_commission_amount:
      mandateDraft?.commissionStructure === 'fixed' ? formatCurrency(mandateDraft?.commissionAmount) : null,
    vat_handling: toTitleCase(mandateDraft?.vatHandling || 'exclusive'),
    asking_price: formatCurrency(mandateDraft?.askingPrice),
    mandate_marketing_permissions: normalizeNullableText(mandateDraft?.marketingPermissions || onboarding?.marketingPermissions),
    mandate_access_instructions: normalizeNullableText(mandateDraft?.accessInstructions || onboarding?.accessInstructions),
    agent_full_name: normalizeNullableText(lead?.assignedAgentName),
    agent_email: normalizeNullableText(lead?.assignedAgentEmail),
    annexures_list: normalizeNullableText(mandateDraft?.annexuresList),

    special_conditions: normalizeNullableText(mandateDraft?.specialConditions),
  }
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
      const value = resolvePlaceholderValue(normalizedPayload.payload, placeholderKey, normalizedPacketType)
      const missing = value === null || value === undefined || value === ''
      if (!missing) continue

      const missingRecord = {
        sectionKey: section.key,
        sectionLabel: section.label,
        placeholderKey,
        placeholderLabel: fieldLabel,
      }
      missingPlaceholders.push(missingRecord)
      if (section.required) {
        critical.push({
          ...missingRecord,
          message: `Missing ${fieldLabel}.`,
        })
      } else {
        warnings.push({
          ...missingRecord,
          message: `Optional ${fieldLabel} is missing.`,
        })
      }
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

function renderSectionHtml(section, placeholders, packetType = 'otp') {
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
  if (section.key === 'introduction_purpose') {
    const intro = getPreviewField(placeholders, 'mandate_introduction_purpose', 'Introduction and Purpose', packetType)
    return `<p class="legal-preview-paragraph ${intro.missing ? 'packet-preview-missing-block' : ''}">${intro.html}</p>`
  }

  if (section.key === 'signature_pages') {
    const seller = getPreviewField(placeholders, 'seller_full_name', 'Seller Full Name', packetType)
    const agent = getPreviewField(placeholders, 'agent_full_name', 'Agent / Agency Representative', packetType)
    return `
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
        <div class="legal-signature-block">
          <span class="legal-signature-line"></span>
          <strong>Witness</strong>
          <p>Full name: ____________________</p>
          <small>Date: ____________________</small>
        </div>
      </div>
    `
  }

  return `
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
  `
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
  const orgName = normalizeText(branding?.organisationName || '') || 'Bridge Workspace'
  const organisationLogo = normalizeText(branding?.logoLightUrl || '') || ''
  const bridgeLogoLabel = normalizeText(branding?.bridgeLogoLabel || '') || 'Bridge 9'
  const bridgeLogoUrl = normalizeText(branding?.bridgeLogoLightUrl || '') || '/brand/bridge_9_white_background.png'
  const isMandatePreview = normalizedPacketType === 'mandate'
  const documentReference =
    normalizeText(placeholders.document_reference || placeholders.transaction_reference || placeholders.packet_reference) ||
    normalizeText(title) ||
    'Preview reference pending'

  const renderedSections = isMandatePreview
    ? sectionManifest.map((section, index) => renderMandateSectionHtml(section, placeholders, packetType, index)).join('\n')
    : sectionManifest.map((section) => renderSectionHtml(section, placeholders, packetType)).join('\n')

  const legalPreviewClass = isMandatePreview ? 'packet-preview-shell legal-document-preview-shell' : 'packet-preview-shell'
  const legalBodyClass = isMandatePreview ? 'legal-document-preview-body' : ''

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
          .packet-preview-bridge {
            display: inline-flex;
            flex-direction: row;
            align-items: flex-end;
            gap: 0;
            font-size: 0.68rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #607991;
          }
          .packet-preview-bridge img {
            max-width: 128px;
            max-height: 28px;
            object-fit: contain;
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
          }
          .legal-document-preview-shell .packet-preview-logo {
            width: 34mm;
            height: 13mm;
            border: 0;
            border-radius: 0;
          }
          .legal-document-preview-shell .packet-preview-logo img {
            max-width: 34mm;
            max-height: 13mm;
          }
          .legal-document-preview-shell .packet-preview-bridge {
            color: #555;
            letter-spacing: 0.06em;
          }
          .legal-document-preview-shell .packet-preview-bridge img {
            max-width: 36mm;
            max-height: 12mm;
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
          .legal-preview-footer-bridge {
            display: inline-flex;
            align-items: center;
            min-width: 34mm;
            max-width: 44mm;
          }
          .legal-preview-footer-bridge {
            justify-content: flex-end;
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
              <div>
                <strong>${escapeHtml(orgName)}</strong>
                <div style="color:#66809a;font-size:0.78rem;">${isMandatePreview ? 'Mandate document preview' : 'Structured transaction packet'}</div>
              </div>
            </div>
            <span class="packet-preview-bridge">
              ${bridgeLogoUrl ? `<img src="${escapeHtml(bridgeLogoUrl)}" alt="Bridge 9" />` : escapeHtml(bridgeLogoLabel)}
            </span>
          </header>
          <div class="packet-preview-title">
            <h1>${escapeHtml(isMandatePreview ? 'Mandate Agreement' : safeTitle)}</h1>
            <p>
              ${isMandatePreview ? `Document reference: ${escapeHtml(documentReference)}` : 'Generated preview'}
              ${isMandatePreview ? '<br />Preview pagination is illustrative; final PDF pagination is calculated during document export.' : ' • Missing values are highlighted in red.'}
            </p>
          </div>
          <main class="packet-preview-content ${legalBodyClass}">
            ${renderedSections}
          </main>
          ${isMandatePreview ? `
            <footer class="legal-preview-footer">
              <span class="legal-preview-footer-brand">
                ${organisationLogo ? `<img src="${escapeHtml(organisationLogo)}" alt="${escapeHtml(orgName)} logo" />` : escapeHtml(orgName)}
              </span>
              <span class="legal-preview-page-number">Page 1 of 1 (preview)</span>
              <span class="legal-preview-footer-bridge">
                ${bridgeLogoUrl ? `<img src="${escapeHtml(bridgeLogoUrl)}" alt="Bridge 9" />` : escapeHtml(bridgeLogoLabel)}
              </span>
            </footer>
          ` : ''}
        </div>
      </body>
    </html>
  `
}
