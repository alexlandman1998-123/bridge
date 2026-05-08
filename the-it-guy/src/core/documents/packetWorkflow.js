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
      ['buyer.display_name', 'Buyer Full Name'],
      ['buyer.registration_or_id', 'Buyer ID / Registration'],
      ['buyer.email', 'Buyer Email'],
    ],
  }),
  createPacketSection({
    key: 'seller_details',
    label: 'Seller Details',
    required: true,
    placeholders: [
      ['seller.display_name', 'Seller Name'],
      ['seller.registration_or_id', 'Seller ID / Registration'],
    ],
  }),
  createPacketSection({
    key: 'property_details',
    label: 'Property',
    required: true,
    placeholders: [
      ['property.unit_label', 'Property Unit'],
      ['property.address', 'Property Address'],
      ['property.suburb', 'Property Suburb'],
    ],
  }),
  createPacketSection({
    key: 'purchase_terms',
    label: 'Purchase Terms',
    required: true,
    placeholders: [
      ['transaction.purchase_price', 'Purchase Price'],
      ['transaction.deposit_amount', 'Deposit Amount'],
      ['transaction.finance_type', 'Finance Type'],
    ],
  }),
  createPacketSection({
    key: 'finance_clause_bond',
    label: 'Finance Clause (Bond)',
    required: false,
    condition: ({ placeholders }) => ['bond', 'combination', 'hybrid'].includes(String(placeholders['transaction.finance_type_raw'] || '').toLowerCase()),
    placeholders: [
      ['transaction.bond_amount', 'Bond Amount'],
      ['transaction.finance_type', 'Finance Type'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_company',
    label: 'Company Authority Clause',
    required: false,
    condition: ({ placeholders }) => String(placeholders['buyer.entity_type_raw'] || '').toLowerCase() === 'company',
    placeholders: [
      ['buyer.representative_name', 'Authorised Representative'],
      ['buyer.representative_capacity', 'Representative Capacity'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_trust',
    label: 'Trust Authority Clause',
    required: false,
    condition: ({ placeholders }) => String(placeholders['buyer.entity_type_raw'] || '').toLowerCase() === 'trust',
    placeholders: [
      ['buyer.trust_registration_number', 'Trust Registration Number'],
      ['buyer.representative_name', 'Trustee Representative'],
    ],
  }),
  createPacketSection({
    key: 'commission_terms',
    label: 'Commission Terms',
    required: true,
    placeholders: [
      ['commission.gross_commission_percentage', 'Gross Commission %'],
      ['commission.gross_commission_amount', 'Gross Commission Amount'],
      ['commission.agent_commission_amount', 'Agent Commission Amount'],
      ['commission.agency_commission_amount', 'Agency Commission Amount'],
    ],
  }),
  createPacketSection({
    key: 'special_conditions',
    label: 'Special Conditions',
    required: false,
    placeholders: [['document.special_conditions', 'Special Conditions']],
  }),
  createPacketSection({
    key: 'signature_pages',
    label: 'Signature Pages',
    required: true,
    placeholders: [
      ['buyer.display_name', 'Buyer Full Name'],
      ['seller.display_name', 'Seller Full Name'],
    ],
  }),
]

const MANDATE_SECTION_DEFINITIONS = [
  createPacketSection({
    key: 'seller_details',
    label: 'Seller Details',
    required: true,
    placeholders: [
      ['seller.display_name', 'Seller Full Name'],
      ['seller.registration_or_id', 'Seller ID / Registration'],
      ['seller.email', 'Seller Email'],
    ],
  }),
  createPacketSection({
    key: 'property_details',
    label: 'Property Details',
    required: true,
    placeholders: [
      ['property.address', 'Property Address'],
      ['property.property_type', 'Property Type'],
    ],
  }),
  createPacketSection({
    key: 'mandate_terms',
    label: 'Mandate Terms',
    required: true,
    placeholders: [
      ['mandate.type', 'Mandate Type'],
      ['mandate.start_date', 'Mandate Start Date'],
      ['mandate.end_date', 'Mandate End Date'],
    ],
  }),
  createPacketSection({
    key: 'commission_terms',
    label: 'Commission Terms',
    required: true,
    placeholders: [
      ['mandate.commission_structure', 'Commission Structure'],
      ['mandate.commission_percent', 'Commission %'],
      ['mandate.commission_amount', 'Commission Amount'],
      ['mandate.vat_handling', 'VAT Handling'],
      ['mandate.asking_price', 'Asking Price'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_company',
    label: 'Company Authority Clause',
    required: false,
    condition: ({ placeholders }) => String(placeholders['seller.entity_type_raw'] || '').toLowerCase() === 'company',
    placeholders: [
      ['seller.representative_name', 'Authorised Representative'],
      ['seller.representative_capacity', 'Representative Capacity'],
    ],
  }),
  createPacketSection({
    key: 'entity_clause_trust',
    label: 'Trust Authority Clause',
    required: false,
    condition: ({ placeholders }) => String(placeholders['seller.entity_type_raw'] || '').toLowerCase() === 'trust',
    placeholders: [
      ['seller.trust_registration_number', 'Trust Registration Number'],
      ['seller.representative_name', 'Trustee Representative'],
    ],
  }),
  createPacketSection({
    key: 'special_conditions',
    label: 'Special Conditions',
    required: false,
    placeholders: [['document.special_conditions', 'Special Conditions']],
  }),
  createPacketSection({
    key: 'signature_pages',
    label: 'Signature Pages',
    required: true,
    placeholders: [['seller.display_name', 'Seller Full Name']],
  }),
]

function safeValueOrMissing(placeholders, key, label) {
  const value = placeholders[key]
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
    'buyer.display_name': normalizeNullableText(buyer?.name) || normalizeNullableText(onboardingFormData?.firstName) || null,
    'buyer.registration_or_id':
      normalizeNullableText(onboardingFormData?.idNumber) ||
      normalizeNullableText(onboardingFormData?.companyRegistrationNumber) ||
      normalizeNullableText(onboardingFormData?.trustRegistrationNumber) ||
      null,
    'buyer.email': normalizeNullableText(buyer?.email) || null,
    'buyer.phone': normalizeNullableText(buyer?.phone) || null,
    'buyer.entity_type': toTitleCase(buyerEntityTypeRaw || 'individual'),
    'buyer.entity_type_raw': buyerEntityTypeRaw || 'individual',
    'buyer.representative_name': normalizeNullableText(onboardingFormData?.authorizedRepresentativeName),
    'buyer.representative_capacity': normalizeNullableText(onboardingFormData?.authorizedRepresentativeCapacity),
    'buyer.trust_registration_number': normalizeNullableText(onboardingFormData?.trustRegistrationNumber),
    'buyer.marketing_opt_in': normalizeNullableText(onboardingFormData?.marketingConsent),
    'buyer.domicilium_address':
      normalizeNullableText(onboardingFormData?.residentialAddress) ||
      normalizeNullableText(onboardingFormData?.physicalAddress) ||
      null,

    'seller.display_name': sellerName || null,
    'seller.registration_or_id': normalizeNullableText(transaction?.seller_registration_number) || null,
    'seller.domicilium_address':
      normalizeNullableText(transaction?.property_address_line_1) ||
      normalizeNullableText(unit?.development?.address) ||
      null,

    'property.unit_label': normalizeNullableText(unit?.unit_number ? `Unit ${unit.unit_number}` : null),
    'property.address':
      normalizeNullableText(transaction?.property_address_line_1) ||
      normalizeNullableText(onboardingFormData?.propertyAddress) ||
      normalizeNullableText(unit?.development?.address) ||
      null,
    'property.suburb': normalizeNullableText(transaction?.suburb) || normalizeNullableText(unit?.development?.suburb),
    'property.property_type': normalizeNullableText(transaction?.property_type) || normalizeNullableText(unit?.property_type),
    'property.nhbrc_certificate_number': normalizeNullableText(onboardingFormData?.nhbrcCertificateNumber),

    'transaction.purchase_price': formatCurrency(purchasePrice),
    'transaction.deposit_amount': formatCurrency(transaction?.deposit_amount),
    'transaction.finance_type': toTitleCase(String(transaction?.finance_type || 'cash').replace('combination', 'hybrid')),
    'transaction.finance_type_raw': normalizeText(transaction?.finance_type || 'cash').toLowerCase(),
    'transaction.bond_amount': formatCurrency(transaction?.bond_amount),
    'transaction.additional_costs_note': normalizeNullableText(onboardingFormData?.additionalCostsNote),

    'commission.gross_commission_percentage':
      Number.isFinite(grossCommissionPercentage) ? `${Number(grossCommissionPercentage).toFixed(2)}%` : null,
    'commission.gross_commission_amount': formatCurrency(grossCommissionAmount),
    'commission.agent_commission_amount': formatCurrency(transaction?.agent_commission_amount),
    'commission.agency_commission_amount': formatCurrency(transaction?.agency_commission_amount),

    'agent.display_name': normalizeNullableText(transaction?.assigned_agent),
    'agent.email': normalizeNullableText(transaction?.assigned_agent_email),
    'conveyancer.display_name': normalizeNullableText(transaction?.attorney),
    'conveyancer.email': normalizeNullableText(transaction?.assigned_attorney_email),
    'developer.company_name': normalizeNullableText(unit?.development?.developer_company) || normalizeNullableText(unit?.development?.name),
    'developer.contact_email': normalizeNullableText(onboardingFormData?.developerEmail),
    'contractor.company_name': normalizeNullableText(onboardingFormData?.buildingContractorName),
    'contractor.registration_number': normalizeNullableText(onboardingFormData?.buildingContractorRegistrationNumber),
    'annexures.list': normalizeNullableText(onboardingFormData?.annexuresList),

    'document.special_conditions': normalizeNullableText(specialConditions) || null,
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
    'seller.display_name': sellerDisplayName,
    'seller.registration_or_id':
      normalizeNullableText(onboarding?.idNumber) ||
      normalizeNullableText(onboarding?.companyRegistrationNumber) ||
      normalizeNullableText(onboarding?.trustRegistrationNumber) ||
      null,
    'seller.email': normalizeNullableText(lead?.sellerEmail),
    'seller.phone': normalizeNullableText(lead?.sellerPhone),
    'seller.entity_type': toTitleCase(ownershipType || 'individual'),
    'seller.entity_type_raw': ownershipType || 'individual',
    'seller.representative_name': normalizeNullableText(onboarding?.authorizedRepresentativeName),
    'seller.representative_capacity': normalizeNullableText(onboarding?.authorizedRepresentativeCapacity),
    'seller.trust_registration_number': normalizeNullableText(onboarding?.trustRegistrationNumber),

    'property.address':
      normalizeNullableText(onboarding?.propertyAddress) ||
      normalizeNullableText(lead?.propertyAddress) ||
      normalizeNullableText(lead?.listingTitle),
    'property.property_type': normalizeNullableText(onboarding?.propertyType) || normalizeNullableText(lead?.propertyType),

    'mandate.type': toTitleCase(mandateDraft?.mandateType || 'sole'),
    'mandate.start_date': normalizeNullableText(mandateDraft?.mandateStartDate),
    'mandate.end_date': normalizeNullableText(mandateDraft?.mandateEndDate),
    'mandate.commission_structure': toTitleCase(mandateDraft?.commissionStructure || 'percentage'),
    'mandate.commission_percent':
      mandateDraft?.commissionStructure === 'percentage' && normalizeNullableText(mandateDraft?.commissionPercent)
        ? `${Number(mandateDraft.commissionPercent).toFixed(2)}%`
        : null,
    'mandate.commission_amount':
      mandateDraft?.commissionStructure === 'fixed' ? formatCurrency(mandateDraft?.commissionAmount) : null,
    'mandate.vat_handling': toTitleCase(mandateDraft?.vatHandling || 'exclusive'),
    'mandate.asking_price': formatCurrency(mandateDraft?.askingPrice),
    'mandate.marketing_permissions': normalizeNullableText(mandateDraft?.marketingPermissions || onboarding?.marketingPermissions),
    'mandate.access_instructions': normalizeNullableText(mandateDraft?.accessInstructions || onboarding?.accessInstructions),
    'agent.display_name': normalizeNullableText(lead?.assignedAgentName),
    'agent.email': normalizeNullableText(lead?.assignedAgentEmail),
    'annexures.list': normalizeNullableText(mandateDraft?.annexuresList),

    'document.special_conditions': normalizeNullableText(mandateDraft?.specialConditions),
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
  const sectionManifest = Array.isArray(sectionManifestInput) && sectionManifestInput.length
    ? sectionManifestInput
    : buildPacketSectionManifest({ packetType, placeholders })
  const critical = []
  const warnings = []
  const missingPlaceholders = []

  for (const section of sectionManifest) {
    for (const [placeholderKey, placeholderLabel] of section.placeholders || []) {
      const value = placeholders?.[placeholderKey]
      const missing = value === null || value === undefined || value === ''
      if (!missing) continue

      const missingRecord = {
        sectionKey: section.key,
        sectionLabel: section.label,
        placeholderKey,
        placeholderLabel,
      }
      missingPlaceholders.push(missingRecord)
      if (section.required) {
        critical.push({
          ...missingRecord,
          message: `Missing ${placeholderLabel}.`,
        })
      } else {
        warnings.push({
          ...missingRecord,
          message: `Optional ${placeholderLabel} is missing.`,
        })
      }
    }
  }

  return {
    sectionManifest,
    critical,
    warnings,
    missingPlaceholders,
    isValidForGeneration: critical.length === 0,
  }
}

function renderSectionHtml(section, placeholders) {
  const rows = (section.placeholders || []).map(([placeholderKey, placeholderLabel]) => {
    const resolvedValue = safeValueOrMissing(placeholders, placeholderKey, placeholderLabel)
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
  const bridgeLogo = normalizeText(branding?.bridgeLogoLabel || '') || 'bridge.'

  const renderedSections = sectionManifest.map((section) => renderSectionHtml(section, placeholders)).join('\n')

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
            font-weight: 800;
            letter-spacing: 0.03em;
            color: #20324a;
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
            <span class="packet-preview-bridge">${bridgeLogo}</span>
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
