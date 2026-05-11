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
    key: 'seller_details',
    label: 'Seller Details',
    required: true,
    placeholders: [
      ['seller_full_name', 'Seller Full Name'],
      ['seller_id_number', 'Seller ID / Registration'],
      ['seller_email', 'Seller Email'],
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
        <dt>${placeholderLabel}</dt>
        <dd class="${missing ? 'packet-preview-missing' : ''}">${resolvedValue}</dd>
      </div>
    `
  })

  return `
    <section class="packet-preview-section" data-section-key="${section.key}">
      <h3>${section.label}</h3>
      <dl>${rows.join('\n')}</dl>
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
  const safeTitle = normalizeText(title) || `${toTitleCase(packetType)} Packet Preview`
  const orgName = normalizeText(branding?.organisationName || '') || 'Bridge Workspace'
  const organisationLogo = normalizeText(branding?.logoLightUrl || '') || ''
  const bridgeLogoLabel = normalizeText(branding?.bridgeLogoLabel || '') || 'Powered by Bridge 9'
  const bridgeLogoUrl = normalizeText(branding?.bridgeLogoLightUrl || '') || '/brand/bridge_9_white_background.png'

  const renderedSections = sectionManifest.map((section) => renderSectionHtml(section, placeholders, packetType)).join('\n')

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
            font-family: "Inter", "Segoe UI", sans-serif;
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
            flex-direction: column;
            align-items: flex-end;
            gap: 3px;
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
            letter-spacing: -0.02em;
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
            color: #b42318 !important;
            font-weight: 700 !important;
          }
          @media (max-width: 780px) {
            body {
              padding: 10px;
            }
            .packet-preview-row {
              grid-template-columns: 1fr;
              gap: 4px;
            }
          }
        </style>
      </head>
      <body>
        <div class="packet-preview-shell">
          <header class="packet-preview-header">
            <div class="packet-preview-brand-left">
              <span class="packet-preview-logo">
                ${organisationLogo ? `<img src="${organisationLogo}" alt="${orgName} logo" />` : `<strong>${orgName.slice(0, 2).toUpperCase()}</strong>`}
              </span>
              <div>
                <strong>${orgName}</strong>
                <div style="color:#66809a;font-size:0.78rem;">Structured transaction packet</div>
              </div>
            </div>
            <span class="packet-preview-bridge">
              <img src="${bridgeLogoUrl}" alt="Bridge 9" />
              <span>${bridgeLogoLabel}</span>
            </span>
          </header>
          <div class="packet-preview-title">
            <h1>${safeTitle}</h1>
            <p>Generated preview • Missing values are highlighted in red.</p>
          </div>
          <main class="packet-preview-content">
            ${renderedSections}
          </main>
        </div>
      </body>
    </html>
  `
}
