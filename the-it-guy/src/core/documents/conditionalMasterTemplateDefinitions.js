import { buildVisibilityConditionJson } from './sectionVisibilityRules.js'

export const CONDITIONAL_MASTER_VERSION = 'conditional-master-v1'
export const CONDITIONAL_MASTER_RESOLVER_VERSION = 'canonical_legal_document_scenario_v1'

function condition(field, operator, value, label) {
  return buildVisibilityConditionJson({ enabled: true, field, operator, value, label })
}

function pack({ key, label, packetTypes, field, operator = 'equals', value, placeholders, legalText }) {
  return Object.freeze({
    key,
    sectionKey: key,
    label,
    sectionLabel: label,
    sectionType: 'legal_text',
    packetTypes: Object.freeze(packetTypes),
    conditionJson: condition(field, operator, value, `Core rule for ${label}`),
    placeholderKeys: Object.freeze(placeholders),
    legalText,
    isRequired: false,
    lockedCondition: true,
  })
}

export const CONDITIONAL_MASTER_PACKS = Object.freeze([
  pack({
    key: 'seller_individual_capacity_pack', label: 'Seller Individual Capacity Pack', packetTypes: ['mandate', 'otp'],
    field: 'seller_entity_type', value: 'individual',
    placeholders: ['seller_entity_type', 'seller_marital_status', 'seller_spouse_consent_required'],
    legalText: 'SELLER INDIVIDUAL CAPACITY\n\nThe Seller warrants that the recorded marital status is correct and that the Seller has full contractual capacity.\n\nSeller Marital Status\n{{seller_marital_status}}\n\nSpouse Consent Required\n{{seller_spouse_consent_required}}',
  }),
  pack({
    key: 'seller_company_authority_pack', label: 'Seller Company Authority Pack', packetTypes: ['mandate', 'otp'],
    field: 'seller_entity_type', operator: 'in', value: ['company', 'close_corporation'],
    placeholders: ['seller_entity_type', 'seller_company_registration_number', 'seller_representative_name', 'seller_representative_capacity', 'seller_resolution_date', 'seller_authority_basis'],
    legalText: 'SELLER COMPANY AUTHORITY\n\nWhere the Seller is a company or close corporation, the signatory warrants that they are duly authorised to bind the Seller.\n\nRegistration Number\n{{seller_company_registration_number}}\n\nRepresentative\n{{seller_representative_name}}\n\nCapacity\n{{seller_representative_capacity}}\n\nResolution Date\n{{seller_resolution_date}}\n\nAuthority Basis\n{{seller_authority_basis}}',
  }),
  pack({
    key: 'seller_trust_authority_pack', label: 'Seller Trust Authority Pack', packetTypes: ['mandate', 'otp'],
    field: 'seller_entity_type', value: 'trust',
    placeholders: ['seller_entity_type', 'seller_trust_registration_number', 'seller_trustee_names', 'seller_representative_name', 'seller_representative_capacity', 'seller_authority_basis'],
    legalText: 'SELLER TRUST AUTHORITY\n\nThe trustees or authorised representative warrant that the trust is duly authorised to enter into this document.\n\nTrust Registration Number\n{{seller_trust_registration_number}}\n\nTrustees\n{{seller_trustee_names}}\n\nRepresentative\n{{seller_representative_name}}\n\nCapacity\n{{seller_representative_capacity}}\n\nAuthority Basis\n{{seller_authority_basis}}',
  }),
  pack({
    key: 'seller_spouse_consent_pack', label: 'Seller Spouse Consent Pack', packetTypes: ['mandate', 'otp'],
    field: 'seller_spouse_consent_required', value: 'Yes',
    placeholders: ['seller_spouse_consent_required', 'seller_spouse_full_name', 'seller_spouse_id_number', 'seller_spouse_email'],
    legalText: 'SELLER SPOUSE CONSENT\n\nThe Seller spouse recorded below consents to this document and will sign where required.\n\nSpouse\n{{seller_spouse_full_name}}\n\nID Number\n{{seller_spouse_id_number}}\n\nEmail\n{{seller_spouse_email}}',
  }),
  pack({
    key: 'buyer_individual_capacity_pack', label: 'Buyer Individual Capacity Pack', packetTypes: ['otp'],
    field: 'buyer_entity_type', value: 'individual',
    placeholders: ['buyer_entity_type', 'buyer_marital_status', 'buyer_spouse_consent_required'],
    legalText: 'PURCHASER INDIVIDUAL CAPACITY\n\nThe Purchaser warrants that the recorded marital status is correct and that the Purchaser has full contractual capacity.\n\nPurchaser Marital Status\n{{buyer_marital_status}}\n\nSpouse Consent Required\n{{buyer_spouse_consent_required}}',
  }),
  pack({
    key: 'buyer_company_authority_pack', label: 'Buyer Company Authority Pack', packetTypes: ['otp'],
    field: 'buyer_entity_type', operator: 'in', value: ['company', 'close_corporation'],
    placeholders: ['buyer_entity_type', 'buyer_company_registration_number', 'buyer_representative_name', 'buyer_representative_capacity', 'buyer_resolution_date', 'buyer_authority_basis'],
    legalText: 'PURCHASER COMPANY AUTHORITY\n\nWhere the Purchaser is a company or close corporation, the signatory warrants that they are duly authorised to bind the Purchaser.\n\nRegistration Number\n{{buyer_company_registration_number}}\n\nRepresentative\n{{buyer_representative_name}}\n\nCapacity\n{{buyer_representative_capacity}}\n\nResolution Date\n{{buyer_resolution_date}}\n\nAuthority Basis\n{{buyer_authority_basis}}',
  }),
  pack({
    key: 'buyer_trust_authority_pack', label: 'Buyer Trust Authority Pack', packetTypes: ['otp'],
    field: 'buyer_entity_type', value: 'trust',
    placeholders: ['buyer_entity_type', 'buyer_trust_registration_number', 'buyer_trustee_names', 'buyer_representative_name', 'buyer_representative_capacity', 'buyer_authority_basis'],
    legalText: 'PURCHASER TRUST AUTHORITY\n\nThe trustees or authorised representative warrant that the trust is duly authorised to enter into this agreement.\n\nTrust Registration Number\n{{buyer_trust_registration_number}}\n\nTrustees\n{{buyer_trustee_names}}\n\nRepresentative\n{{buyer_representative_name}}\n\nCapacity\n{{buyer_representative_capacity}}\n\nAuthority Basis\n{{buyer_authority_basis}}',
  }),
  pack({
    key: 'buyer_spouse_consent_pack', label: 'Buyer Spouse Consent Pack', packetTypes: ['otp'],
    field: 'buyer_spouse_consent_required', value: 'Yes',
    placeholders: ['buyer_spouse_consent_required', 'buyer_spouse_full_name', 'buyer_spouse_id_number', 'buyer_spouse_email'],
    legalText: 'PURCHASER SPOUSE CONSENT\n\nThe Purchaser spouse recorded below consents to this agreement and will sign where required.\n\nSpouse\n{{buyer_spouse_full_name}}\n\nID Number\n{{buyer_spouse_id_number}}\n\nEmail\n{{buyer_spouse_email}}',
  }),
  pack({
    key: 'property_full_title_pack', label: 'Full Title Property Pack', packetTypes: ['mandate', 'otp'],
    field: 'property_title_type', value: 'full_title',
    placeholders: ['property_title_type', 'erf_number', 'erf_size', 'floor_size', 'property_estate_name'],
    legalText: 'FULL TITLE PROPERTY DETAILS\n\nErf Number\n{{erf_number}}\n\nErf Size\n{{erf_size}}\n\nFloor Size\n{{floor_size}}\n\nEstate / HOA\n{{property_estate_name}}',
  }),
  pack({
    key: 'property_sectional_title_pack', label: 'Sectional Title Property Pack', packetTypes: ['mandate', 'otp'],
    field: 'property_title_type', value: 'sectional_title',
    placeholders: ['property_title_type', 'property_unit_number', 'property_section_number', 'sectional_title_number', 'property_complex_name', 'property_estate_name'],
    legalText: 'SECTIONAL TITLE PROPERTY DETAILS\n\nUnit Number\n{{property_unit_number}}\n\nSection Number\n{{property_section_number}}\n\nSectional Title Number\n{{sectional_title_number}}\n\nScheme / Complex\n{{property_complex_name}}\n\nEstate\n{{property_estate_name}}',
  }),
  pack({
    key: 'bond_finance_pack', label: 'Bond Finance Pack', packetTypes: ['otp'],
    field: 'finance_type', operator: 'in', value: ['bond', 'combination'],
    placeholders: ['finance_type', 'bond_amount'],
    legalText: 'BOND FINANCE\n\nThis agreement is subject to the applicable bond terms and approval periods recorded in the transaction.\n\nFinance Type\n{{finance_type}}\n\nBond Amount\n{{bond_amount}}',
  }),
  pack({
    key: 'cash_sale_pack', label: 'Cash Sale Payment Pack', packetTypes: ['otp'],
    field: 'finance_type', value: 'cash',
    placeholders: ['finance_type', 'cash_amount'],
    legalText: 'CASH SALE PAYMENT REQUIREMENTS\n\nThe Purchaser must provide proof of funds or acceptable cash payment undertakings within the required period.\n\nCash Amount\n{{cash_amount}}',
  }),
  pack({
    key: 'cash_contribution_pack', label: 'Combination Finance Cash Contribution Pack', packetTypes: ['otp'],
    field: 'finance_type', value: 'combination',
    placeholders: ['finance_type', 'cash_amount', 'bond_amount'],
    legalText: 'CASH CONTRIBUTION\n\nIn addition to the bond finance, the Purchaser must provide proof of the cash contribution or an acceptable payment undertaking within the required period.\n\nCash Contribution\n{{cash_amount}}\n\nBond Amount\n{{bond_amount}}',
  }),
])

const MASTER_SECTION_ORDER = Object.freeze({
  mandate: Object.freeze([
    'introduction_purpose', 'parties',
    'seller_individual_capacity_pack', 'seller_company_authority_pack', 'seller_trust_authority_pack', 'seller_spouse_consent_pack',
    'property_details', 'property_full_title_pack', 'property_sectional_title_pack',
    'mandate_terms', 'commission_terms', 'marketing_listing_terms', 'special_conditions', 'general_terms', 'popia_fica', 'signature_pages',
  ]),
  otp: Object.freeze([
    'cover_page', 'schedule_1', 'parties',
    'buyer_individual_capacity_pack', 'buyer_company_authority_pack', 'buyer_trust_authority_pack', 'buyer_spouse_consent_pack',
    'seller_individual_capacity_pack', 'seller_company_authority_pack', 'seller_trust_authority_pack', 'seller_spouse_consent_pack',
    'property_full_title_pack', 'property_sectional_title_pack',
    'bond_finance_pack', 'cash_sale_pack', 'cash_contribution_pack',
    'definitions', 'interpretation', 'sale_acceptance', 'purchase_price', 'property_risk_transfer', 'occupation', 'suspensive_conditions',
    'warranties_capacity', 'commission_certificates', 'rates_breach_cooling', 'notices_jurisdiction_marital', 'special_conditions', 'costs_general_terms', 'signature_pages',
  ]),
})

export function getConditionalMasterPackDefinitions(packetType = '') {
  const normalized = String(packetType || '').trim().toLowerCase()
  return CONDITIONAL_MASTER_PACKS.filter((item) => item.packetTypes.includes(normalized))
}

export function getConditionalMasterTemplateDefinition(packetType = '') {
  const normalized = String(packetType || '').trim().toLowerCase()
  if (!['mandate', 'otp'].includes(normalized)) return null
  const packs = getConditionalMasterPackDefinitions(normalized)
  const defaultSignerRoles = normalized === 'mandate'
    ? [
        { role: 'seller', label: 'Seller', required: true, order: 0 },
        { role: 'agent', label: 'Estate Agent', required: true, order: 1 },
        { role: 'seller_spouse', label: 'Seller spouse / co-signer', required: false, order: 2, conditionJson: condition('seller_spouse_consent_required', 'equals', 'Yes', 'Only when seller spouse consent is required') },
        { role: 'witness', label: 'Witness', required: false, order: 3 },
      ]
    : [
        { role: 'purchaser_1', label: 'Purchaser', required: true, order: 0 },
        { role: 'seller', label: 'Seller', required: true, order: 1 },
        { role: 'agent', label: 'Estate Agent', required: false, order: 2 },
        { role: 'buyer_spouse', label: 'Purchaser spouse / co-signer', required: false, order: 3, conditionJson: condition('buyer_spouse_consent_required', 'equals', 'Yes', 'Only when buyer spouse consent is required') },
        { role: 'seller_spouse', label: 'Seller spouse / co-signer', required: false, order: 4, conditionJson: condition('seller_spouse_consent_required', 'equals', 'Yes', 'Only when seller spouse consent is required') },
        { role: 'witness', label: 'Witness', required: false, order: 5 },
      ]
  return {
    packetType: normalized,
    templateKey: `${normalized}_default_v1`,
    masterVersion: CONDITIONAL_MASTER_VERSION,
    resolverVersion: CONDITIONAL_MASTER_RESOLVER_VERSION,
    packKeys: packs.map((item) => item.key),
    sectionOrder: [...MASTER_SECTION_ORDER[normalized]],
    defaultSignerRoles,
    conditionRulesLocked: true,
  }
}

export function buildConditionalMasterTemplateSections(packetType = '', standardSections = []) {
  const definition = getConditionalMasterTemplateDefinition(packetType)
  if (!definition) return Array.isArray(standardSections) ? [...standardSections] : []
  const existing = new Map((Array.isArray(standardSections) ? standardSections : []).map((section) => [section.sectionKey || section.section_key || section.key, section]))
  const packKeys = new Set(definition.packKeys)
  const normalSections = (Array.isArray(standardSections) ? standardSections : []).filter((section) => !packKeys.has(section.sectionKey || section.section_key || section.key))
  const packSections = getConditionalMasterPackDefinitions(definition.packetType).map((item) => {
    const current = existing.get(item.key) || {}
    return {
      ...current,
      sectionKey: item.key,
      sectionLabel: item.label,
      sectionType: current.sectionType || current.section_type || item.sectionType,
      legalText: current.legalText || current.legal_text || item.legalText,
      placeholderKeysText: item.placeholderKeys.join(', '),
      conditionJson: item.conditionJson,
      isRequired: false,
      metadataJson: {
        ...(current.metadataJson || current.metadata_json || {}),
        conditional_pack: true,
        condition_rule_locked: true,
        conditional_master_version: CONDITIONAL_MASTER_VERSION,
      },
    }
  })
  const order = new Map(definition.sectionOrder.map((key, index) => [key, index]))
  return [...normalSections, ...packSections]
    .sort((left, right) => {
      const leftKey = left.sectionKey || left.section_key || left.key
      const rightKey = right.sectionKey || right.section_key || right.key
      return (order.get(leftKey) ?? 1000 + Number(left.sortOrder || left.sort_order || 0)) -
        (order.get(rightKey) ?? 1000 + Number(right.sortOrder || right.sort_order || 0))
    })
    .map((section, index) => ({ ...section, sortOrder: index }))
}

export function assessConditionalMasterTemplate(packetType = '', sections = []) {
  const definition = getConditionalMasterTemplateDefinition(packetType)
  if (!definition) return { valid: false, missingPackKeys: [], duplicateSectionKeys: [], unlockedPackKeys: [] }
  const keys = (Array.isArray(sections) ? sections : []).map((section) => section.sectionKey || section.section_key || section.key).filter(Boolean)
  const counts = keys.reduce((map, key) => map.set(key, (map.get(key) || 0) + 1), new Map())
  const sectionByKey = new Map((Array.isArray(sections) ? sections : []).map((section) => [section.sectionKey || section.section_key || section.key, section]))
  const missingPackKeys = definition.packKeys.filter((key) => !sectionByKey.has(key))
  const duplicateSectionKeys = [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key)
  const unlockedPackKeys = definition.packKeys.filter((key) => {
    const section = sectionByKey.get(key) || {}
    const metadata = section.metadataJson || section.metadata_json || {}
    return metadata.condition_rule_locked !== true
  })
  const signatureCount = keys.filter((key) => key === 'signature_pages').length
  return {
    packetType: definition.packetType,
    masterVersion: definition.masterVersion,
    missingPackKeys,
    duplicateSectionKeys,
    unlockedPackKeys,
    signatureCount,
    valid: missingPackKeys.length === 0 && duplicateSectionKeys.length === 0 && unlockedPackKeys.length === 0 && signatureCount === 1,
  }
}
