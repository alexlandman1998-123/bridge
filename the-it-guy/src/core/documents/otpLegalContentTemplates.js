import {
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry.js'
import {
  getOtpClauseDefinitionRequirement,
  getOtpFieldDefinition,
  listOtpFieldRegistry,
} from './otpFieldRegistry.js'
import {
  OTP_DOCUMENT_VARIANTS,
  normalizeOtpDocumentVariant,
} from './otpRouteUniverse.js'
import {
  OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
  buildOtpBrandedShellAudit,
} from './otpTemplateBrandedShell.js'

export const OTP_LEGAL_CONTENT_TEMPLATE_VERSION = 'otp_legal_content_templates_phase6_v1'
export const OTP_LEGAL_CONTENT_LAYOUT_CONTRACT = 'otp_legal_content_section_phase6_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function cloneJson(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value))
    : {}
}

function cloneArray(value = []) {
  return [...(Array.isArray(value) ? value : [])]
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function visibilityCondition(field, operator = 'exists', value = '', label = '') {
  return {
    enabled: true,
    rule: {
      field,
      operator,
      ...(operator === 'exists' || operator === 'missing' ? {} : { value }),
    },
    ...(label ? { label } : {}),
  }
}

function visibilityAny(conditions = [], label = '') {
  return {
    enabled: true,
    any: conditions,
    ...(label ? { label } : {}),
  }
}

function metadata(extra = {}) {
  const nativePdfLayout = cloneJson(extra.native_pdf_layout || extra.nativePdfLayout)
  const metadataExtra = { ...extra }
  delete metadataExtra.native_pdf_layout
  delete metadataExtra.nativePdfLayout
  return {
    editable: true,
    legal_review_required: true,
    wording_version: OTP_LEGAL_CONTENT_TEMPLATE_VERSION,
    shell_layout_contract: OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
    blank_safe_rows: true,
    native_pdf_layout: {
      contract: OTP_LEGAL_CONTENT_LAYOUT_CONTRACT,
      keep_heading_with_body: true,
      avoid_orphan_heading: true,
      hide_empty_rows: true,
      ...nativePdfLayout,
    },
    ...metadataExtra,
  }
}

function resolveSourceOwners(placeholderKeys = []) {
  return unique(placeholderKeys.map((key) => getOtpFieldDefinition(key)?.owner).filter(Boolean))
}

function definitionTermsForClauseFamily(clauseFamily = '', variants = []) {
  const terms = new Set()
  for (const variant of variants) {
    const requirement = getOtpClauseDefinitionRequirement(clauseFamily, variant)
    for (const term of requirement?.requiredDefinitionTerms || []) terms.add(term)
  }
  return Array.from(terms)
}

function section({
  sectionKey,
  sectionLabel,
  sectionType = 'legal_text',
  sortOrder,
  variants = ['resale_existing_property', 'new_development'],
  clauseFamily,
  isRequired = true,
  conditionJson = {},
  placeholderKeys = [],
  definitionTerms = [],
  legalText = '',
  metadataJson = {},
}) {
  const normalizedVariants = variants.map((variant) => normalizeOtpDocumentVariant(variant)).filter(Boolean)
  const requiredTerms = definitionTermsForClauseFamily(clauseFamily, normalizedVariants)
  const placeholders = unique(placeholderKeys.map(normalizeKey))
  const sourceOwners = resolveSourceOwners(placeholders)

  return Object.freeze({
    section_key: sectionKey,
    section_label: sectionLabel,
    section_type: sectionType,
    sort_order: sortOrder,
    variants: Object.freeze(normalizedVariants),
    clause_family: normalizeKey(clauseFamily),
    is_required: Boolean(isRequired),
    is_repeatable: false,
    condition_json: Object.freeze(cloneJson(conditionJson)),
    placeholder_keys: Object.freeze(placeholders),
    definition_terms: Object.freeze(unique([...requiredTerms, ...definitionTerms.map(normalizeKey)])),
    source_owners: Object.freeze(sourceOwners),
    legal_text: normalizeText(legalText),
    metadata_json: Object.freeze(metadata({
      clause_family: normalizeKey(clauseFamily),
      definition_terms: unique([...requiredTerms, ...definitionTerms.map(normalizeKey)]),
      source_owners: sourceOwners,
      variants: normalizedVariants,
      ...metadataJson,
    })),
  })
}

export const OTP_LEGAL_CONTENT_TEMPLATE_SECTIONS = Object.freeze([
  section({
    sectionKey: 'definitions_shared',
    sectionLabel: 'Definitions',
    sortOrder: 0,
    clauseFamily: 'definitions',
    placeholderKeys: [],
    definitionTerms: ['agreement', 'agent', 'conveyancer', 'deposit', 'guarantees', 'occupation_date', 'purchase_price', 'property', 'purchaser', 'seller', 'suspensive_conditions', 'vat', 'compliance_certificates'],
    legalText: `DEFINITIONS

In this Offer to Purchase, the defined terms include Agreement, Agent, Conveyancer, Deposit, Guarantees, Occupation Date, Purchase Price, Property, Purchaser, Seller, Suspensive Conditions, VAT and Compliance Certificates. Route-specific definitions are included only in the applicable resale or new-development section.`,
  }),
  section({
    sectionKey: 'resale_parties',
    sectionLabel: 'Parties',
    sectionType: 'dynamic_fields',
    sortOrder: 10,
    variants: ['resale_existing_property'],
    clauseFamily: 'parties',
    placeholderKeys: [
      'buyer_full_name',
      'buyer_id_number',
      'buyer_email',
      'buyer_phone',
      'seller_full_name',
      'seller_id_number',
      'seller_email',
      'seller_phone',
      'agent_full_name',
      'agent_ffc_number',
      'organisation_trading_name',
    ],
    legalText: `PARTIES

Purchaser: {{buyer_full_name}}
Purchaser ID / Registration: {{buyer_id_number}}
Purchaser Email: {{buyer_email}}
Purchaser Telephone: {{buyer_phone}}

Seller: {{seller_full_name}}
Seller ID / Registration: {{seller_id_number}}
Seller Email: {{seller_email}}
Seller Telephone: {{seller_phone}}

Agency: {{organisation_trading_name}}
Agent: {{agent_full_name}}
Agent FFC Number: {{agent_ffc_number}}`,
  }),
  section({
    sectionKey: 'development_parties',
    sectionLabel: 'Parties',
    sectionType: 'dynamic_fields',
    sortOrder: 10,
    variants: ['new_development'],
    clauseFamily: 'parties',
    placeholderKeys: [
      'buyer_full_name',
      'buyer_id_number',
      'buyer_email',
      'buyer_phone',
      'developer_name',
      'developer_company_registration',
      'agent_full_name',
      'agent_ffc_number',
      'organisation_trading_name',
    ],
    legalText: `PARTIES

Purchaser: {{buyer_full_name}}
Purchaser ID / Registration: {{buyer_id_number}}
Purchaser Email: {{buyer_email}}
Purchaser Telephone: {{buyer_phone}}

Developer / Seller: {{developer_name}}
Developer Registration Number: {{developer_company_registration}}

Agency: {{organisation_trading_name}}
Agent: {{agent_full_name}}
Agent FFC Number: {{agent_ffc_number}}`,
  }),
  section({
    sectionKey: 'resale_property',
    sectionLabel: 'Property',
    sectionType: 'dynamic_fields',
    sortOrder: 20,
    variants: ['resale_existing_property'],
    clauseFamily: 'property',
    placeholderKeys: ['property_address', 'property_title_type'],
    definitionTerms: ['property'],
    legalText: `PROPERTY

Property Address: {{property_address}}
Title Type: {{property_title_type}}

The Property described above is the existing immovable property forming the subject of this offer, together with those fixtures and fittings expressly included in this Agreement.`,
  }),
  section({
    sectionKey: 'development_unit',
    sectionLabel: 'Development Unit',
    sectionType: 'dynamic_fields',
    sortOrder: 20,
    variants: ['new_development'],
    clauseFamily: 'development_unit',
    placeholderKeys: [
      'development_name',
      'property_unit_number',
      'sectional_plan_status',
      'participation_quota',
      'parking_bay',
      'garage_allocation',
    ],
    legalText: `DEVELOPMENT UNIT

Development: {{development_name}}
Section / Unit Number: {{property_unit_number}}
Sectional Plan Status: {{sectional_plan_status}}
Participation Quota: {{participation_quota}}
Parking Bay: {{parking_bay}}
Garage Allocation: {{garage_allocation}}

The unit, exclusive-use areas and appurtenant rights are recorded subject to the development, sectional-plan and body-corporate documents applicable to the new-development route.`,
  }),
  section({
    sectionKey: 'purchase_price',
    sectionLabel: 'Purchase Price and Deposit',
    sectionType: 'dynamic_fields',
    sortOrder: 30,
    clauseFamily: 'purchase_price',
    placeholderKeys: [
      'purchase_price',
      'purchase_price_words',
      'deposit_amount',
      'deposit_due_date',
      'trust_account_recipient',
    ],
    legalText: `PURCHASE PRICE AND DEPOSIT

Purchase Price: {{purchase_price}}
Purchase Price in Words: {{purchase_price_words}}
Deposit: {{deposit_amount}}
Deposit Due Date: {{deposit_due_date}}
Trust Account Recipient: {{trust_account_recipient}}

The purchase price and deposit are those recorded above. Any deposit must be paid only to the approved trust account recipient recorded for this transaction.`,
  }),
  section({
    sectionKey: 'development_vat_purchase_price',
    sectionLabel: 'VAT Treatment',
    sectionType: 'dynamic_fields',
    sortOrder: 31,
    variants: ['new_development'],
    clauseFamily: 'purchase_price',
    placeholderKeys: ['vat_inclusive_purchase_price'],
    legalText: `VAT TREATMENT

VAT-Inclusive Purchase Price: {{vat_inclusive_purchase_price}}

The VAT treatment for a new-development OTP must be rendered from the approved development setup and transaction offer terms.`,
  }),
  section({
    sectionKey: 'finance_suspensive_conditions',
    sectionLabel: 'Finance and Suspensive Conditions',
    sectionType: 'dynamic_fields',
    sortOrder: 40,
    clauseFamily: 'suspensive_conditions',
    placeholderKeys: [
      'finance_type',
      'bond_amount',
      'bond_approval_deadline',
      'cash_amount',
      'cash_proof_deadline',
      'guarantee_delivery_deadline',
      'guarantee_delivery_period',
      'irrevocable_offer_expiry',
      'structured_suspensive_conditions',
    ],
    legalText: `FINANCE AND SUSPENSIVE CONDITIONS

Finance Type: {{finance_type}}
Bond Amount: {{bond_amount}}
Bond Approval Deadline: {{bond_approval_deadline}}
Cash Contribution: {{cash_amount}}
Cash Proof Deadline: {{cash_proof_deadline}}
Guarantee Delivery Deadline: {{guarantee_delivery_deadline}}
Guarantee Delivery Period: {{guarantee_delivery_period}}
Irrevocable Offer Expiry: {{irrevocable_offer_expiry}}
Structured Conditions: {{structured_suspensive_conditions}}

The finance route and suspensive conditions recorded above govern whether the offer remains subject to fulfilment, waiver or lapse. Structured conditions must be rendered from the approved condition records, not from free-text buyer onboarding notes.`,
  }),
  section({
    sectionKey: 'subject_to_sale',
    sectionLabel: 'Subject-to-Sale Condition',
    sectionType: 'dynamic_fields',
    sortOrder: 45,
    variants: ['resale_existing_property'],
    clauseFamily: 'suspensive_conditions',
    isRequired: false,
    conditionJson: visibilityAny([
      visibilityCondition('subject_sale_property', 'exists'),
      visibilityCondition('subject_sale_minimum_price', 'exists'),
      visibilityCondition('subject_sale_fulfilment_date', 'exists'),
    ], 'Only include when the offer is subject to sale of the purchaser property'),
    placeholderKeys: [
      'subject_sale_property',
      'subject_sale_minimum_price',
      'subject_sale_fulfilment_date',
    ],
    metadataJson: {
      conditional_pack: true,
      condition_rule_locked: true,
      hide_when_empty: true,
    },
    legalText: `SUBJECT-TO-SALE CONDITION

Purchaser Property: {{subject_sale_property}}
Minimum Sale Price: {{subject_sale_minimum_price}}
Fulfilment Date: {{subject_sale_fulfilment_date}}

This condition applies only where the purchaser property sale condition is captured and approved for this resale OTP route.`,
  }),
  section({
    sectionKey: 'resale_occupation_rent',
    sectionLabel: 'Occupation and Occupational Rent',
    sectionType: 'dynamic_fields',
    sortOrder: 50,
    variants: ['resale_existing_property'],
    clauseFamily: 'occupation_rent',
    placeholderKeys: [
      'occupation_date',
      'occupational_rent_payable',
      'occupational_rent_amount',
    ],
    legalText: `OCCUPATION AND OCCUPATIONAL RENT

Occupation Date: {{occupation_date}}
Occupational Rent Payable: {{occupational_rent_payable}}
Occupational Rent Amount: {{occupational_rent_amount}}

Occupation, risk, utilities and occupational rent must follow the route captured for the resale transaction and any special conditions approved for the offer.`,
  }),
  section({
    sectionKey: 'development_handover',
    sectionLabel: 'Handover and Snagging',
    sectionType: 'dynamic_fields',
    sortOrder: 50,
    variants: ['new_development'],
    clauseFamily: 'development_defects',
    placeholderKeys: [
      'occupation_date',
      'snagging_period_days',
      'contractor_company_name',
      'property_nhbrc_certificate_number',
    ],
    legalText: `HANDOVER AND SNAGGING

Anticipated Occupation / Handover Date: {{occupation_date}}
Snagging Period: {{snagging_period_days}}
Contractor: {{contractor_company_name}}
NHBRC Certificate Number: {{property_nhbrc_certificate_number}}

Development handover, inspection, snagging and defect processes are dealt with under the new-development route and must align with the approved development documents.`,
  }),
  section({
    sectionKey: 'resale_disclosure_fixtures_compliance',
    sectionLabel: 'Disclosure, Fixtures and Compliance',
    sectionType: 'dynamic_fields',
    sortOrder: 60,
    variants: ['resale_existing_property'],
    clauseFamily: 'fixtures_defects_disclosure',
    placeholderKeys: [
      'mandatory_disclosure_status',
      'mandatory_disclosure_annexure',
      'mandatory_disclosure_comments',
      'fixtures_included',
      'fixtures_excluded',
      'compliance_certificate_schedule',
    ],
    legalText: `DISCLOSURE, FIXTURES AND COMPLIANCE

Mandatory Disclosure Status: {{mandatory_disclosure_status}}
Disclosure Annexure: {{mandatory_disclosure_annexure}}
Disclosure Comments: {{mandatory_disclosure_comments}}
Fixtures Included: {{fixtures_included}}
Fixtures Excluded: {{fixtures_excluded}}
Compliance Certificate Schedule: {{compliance_certificate_schedule}}

The seller disclosure, defects, fixtures, fittings and compliance certificate schedule must be sourced from seller/property records and attached annexures, not from buyer onboarding.`,
  }),
  section({
    sectionKey: 'development_compliance_body_corporate',
    sectionLabel: 'Development Compliance and Body Corporate',
    sectionType: 'dynamic_fields',
    sortOrder: 60,
    variants: ['new_development'],
    clauseFamily: 'body_corporate',
    placeholderKeys: [
      'body_corporate_name',
      'body_corporate_rules_annexure',
      'development_levy_estimate',
      'development_rates_estimate',
      'utility_connection_charges',
      'development_compliance_certificate_schedule',
    ],
    legalText: `DEVELOPMENT COMPLIANCE AND BODY CORPORATE

Body Corporate: {{body_corporate_name}}
Rules Annexure: {{body_corporate_rules_annexure}}
Estimated Levy: {{development_levy_estimate}}
Estimated Rates: {{development_rates_estimate}}
Utility Connection Charges: {{utility_connection_charges}}
Compliance Certificate Schedule: {{development_compliance_certificate_schedule}}

Body-corporate rules, levies, rates, utility charges and development compliance documents must be rendered from development setup and unit records.`,
  }),
  section({
    sectionKey: 'transfer_conveyancer',
    sectionLabel: 'Transfer and Conveyancer',
    sectionType: 'dynamic_fields',
    sortOrder: 70,
    clauseFamily: 'transfer_conveyancer',
    placeholderKeys: [
      'transfer_attorney_company_name',
      'transfer_attorney_contact_person',
      'transfer_attorney_email',
      'transfer_attorney_phone',
      'trust_account_recipient',
      'guarantee_delivery_deadline',
      'guarantee_delivery_period',
    ],
    legalText: `TRANSFER AND CONVEYANCER

Transfer Attorney / Conveyancer: {{transfer_attorney_company_name}}
Transfer Contact Person: {{transfer_attorney_contact_person}}
Transfer Contact Email: {{transfer_attorney_email}}
Transfer Contact Telephone: {{transfer_attorney_phone}}
Trust Account Recipient: {{trust_account_recipient}}
Guarantee Delivery Deadline: {{guarantee_delivery_deadline}}
Guarantee Delivery Period: {{guarantee_delivery_period}}

Transfer administration, guarantee delivery and deposit/trust-account handling must follow the appointed transfer attorney or conveyancer assignment.`,
  }),
  section({
    sectionKey: 'special_conditions_annexures',
    sectionLabel: 'Special Conditions and Annexures',
    sectionType: 'dynamic_fields',
    sortOrder: 80,
    clauseFamily: 'special_conditions',
    isRequired: false,
    conditionJson: visibilityAny([
      visibilityCondition('special_conditions', 'exists'),
      visibilityCondition('annexures_list', 'exists'),
    ], 'Only include when special conditions or annexures are captured'),
    placeholderKeys: ['special_conditions', 'annexures_list'],
    definitionTerms: ['agreement'],
    metadataJson: {
      hide_when_empty: true,
      native_pdf_layout: {
        avoid_page_break_inside: true,
      },
    },
    legalText: `SPECIAL CONDITIONS AND ANNEXURES

Special Conditions: {{special_conditions}}
Annexures: {{annexures_list}}`,
  }),
  section({
    sectionKey: 'popia_fica',
    sectionLabel: 'POPIA and FICA',
    sortOrder: 90,
    clauseFamily: 'offer_acceptance',
    placeholderKeys: ['buyer_full_name'],
    legalText: `POPIA AND FICA

The Purchaser consents to the lawful processing and sharing of personal information reasonably required for offer administration, FICA, transfer, finance, compliance, signing and transaction records.

Purchaser: {{buyer_full_name}}`,
  }),
])

export function listOtpLegalContentTemplateSections({ variant = '' } = {}) {
  const normalizedVariant = normalizeOtpDocumentVariant(variant)
  return OTP_LEGAL_CONTENT_TEMPLATE_SECTIONS
    .filter((item) => !normalizedVariant || item.variants.includes(normalizedVariant))
    .sort((a, b) => a.sort_order - b.sort_order || a.section_key.localeCompare(b.section_key))
    .map((item) => ({
      ...item,
      variants: cloneArray(item.variants),
      condition_json: cloneJson(item.condition_json),
      placeholder_keys: cloneArray(item.placeholder_keys),
      definition_terms: cloneArray(item.definition_terms),
      source_owners: cloneArray(item.source_owners),
      metadata_json: cloneJson(item.metadata_json),
    }))
}

function extractTemplateTokens(sections = []) {
  const tokens = new Set()
  for (const sectionRow of sections) {
    for (const token of sectionRow.placeholder_keys || []) {
      const normalized = normalizeKey(token)
      if (normalized) tokens.add(normalized)
    }
    for (const match of String(sectionRow.legal_text || '').matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
      const normalized = normalizeKey(match[1])
      if (normalized) tokens.add(normalized)
    }
  }
  return Array.from(tokens).sort()
}

function hasCondition(sectionRow = {}) {
  const condition = sectionRow.condition_json || sectionRow.conditionJson || {}
  return Object.keys(condition).length > 0
}

function isBlankSafe(sectionRow = {}) {
  if (sectionRow.is_required === true || sectionRow.required === true) return true
  const metadataJson = sectionRow.metadata_json || sectionRow.metadataJson || {}
  return Boolean(
    hasCondition(sectionRow) ||
      metadataJson.hide_when_empty ||
      metadataJson.hideWhenEmpty ||
      metadataJson.blank_safe ||
      metadataJson.blankSafe,
  )
}

function renderedHeading(sectionRow = {}) {
  return normalizeText(String(sectionRow.legal_text || '').split(/\r?\n/).find((line) => normalizeText(line)) || '')
}

function auditSections({ variant = '', sections = [] } = {}) {
  const normalizedVariant = normalizeOtpDocumentVariant(variant)
  const tokens = extractTemplateTokens(sections)
  const registryValidation = validateTemplateTokensAgainstRegistry({ tokens, packetType: 'otp' })
  const fieldRegistryGaps = tokens.filter((token) => !getOtpFieldDefinition(token))
  const routeFieldGaps = []
  for (const token of tokens) {
    const definition = getOtpFieldDefinition(token)
    if (!definition || !normalizedVariant) continue
    if (!definition.variants.includes(normalizedVariant)) {
      routeFieldGaps.push({ token, variant: normalizedVariant, allowedVariants: definition.variants })
    }
  }

  const definitionGaps = []
  const sourceOwnerGaps = []
  const layoutContractGaps = []
  const blankRenderRisks = []
  const headingIssues = []
  const placeholderOnlyLines = []
  const clauseFamilies = new Set()

  for (const sectionRow of sections) {
    const sectionKey = normalizeKey(sectionRow.section_key)
    const clauseFamily = normalizeKey(sectionRow.clause_family)
    if (clauseFamily) clauseFamilies.add(clauseFamily)
    const metadataJson = sectionRow.metadata_json || {}
    const sectionTerms = new Set(sectionRow.definition_terms || [])
    const owners = new Set(sectionRow.source_owners || [])

    if (metadataJson.native_pdf_layout?.contract !== OTP_LEGAL_CONTENT_LAYOUT_CONTRACT) layoutContractGaps.push(sectionKey)
    if (!isBlankSafe(sectionRow)) blankRenderRisks.push(sectionKey)
    if (/\b(pack|packet)\b/i.test(`${sectionRow.section_label} ${renderedHeading(sectionRow)}`)) headingIssues.push(sectionKey)
    if (/^\s*{{[^{}]+}}\s*$/m.test(sectionRow.legal_text || '')) placeholderOnlyLines.push(sectionKey)

    const requiredDefinitionTerms = getOtpClauseDefinitionRequirement(clauseFamily, normalizedVariant)?.requiredDefinitionTerms || []
    for (const term of requiredDefinitionTerms) {
      if (!sectionTerms.has(term)) definitionGaps.push({ sectionKey, clauseFamily, term })
    }

    for (const token of sectionRow.placeholder_keys || []) {
      const definition = getOtpFieldDefinition(token)
      if (definition?.owner && !owners.has(definition.owner)) {
        sourceOwnerGaps.push({ sectionKey, token, expectedOwner: definition.owner })
      }
    }
  }

  return {
    variant: normalizedVariant,
    sectionCount: sections.length,
    tokens,
    registryValidation,
    fieldRegistryGaps: unique(fieldRegistryGaps),
    routeFieldGaps,
    definitionGaps,
    sourceOwnerGaps,
    layoutContractGaps: unique(layoutContractGaps),
    blankRenderRisks: unique(blankRenderRisks),
    headingIssues: unique(headingIssues),
    placeholderOnlyLines: unique(placeholderOnlyLines),
    clauseFamilies: Array.from(clauseFamilies).sort(),
  }
}

function buildChecks({ routeAudits = [], shellAudit = {} } = {}) {
  const checks = []
  const push = (pass, code, detail, severity = 'blocking') => checks.push({ code, pass: Boolean(pass), detail, severity })
  const allSections = routeAudits.flatMap((audit) => listOtpLegalContentTemplateSections({ variant: audit.variant }))
  const sectionKeysByVariant = new Map(routeAudits.map((audit) => [audit.variant, new Set(listOtpLegalContentTemplateSections({ variant: audit.variant }).map((sectionRow) => sectionRow.section_key))]))
  const resaleKeys = sectionKeysByVariant.get('resale_existing_property') || new Set()
  const developmentKeys = sectionKeysByVariant.get('new_development') || new Set()

  push(shellAudit.status === 'OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES', 'PHASE6_BRANDED_SHELL_READY', 'Legal content templates depend on the Phase 6 branded PDF shell being ready.')
  push(routeAudits.length === 2, 'PHASE6_BOTH_PRIMARY_ROUTES_PRESENT', 'Legal content templates render both resale and new-development route sets.')
  push(resaleKeys.has('resale_disclosure_fixtures_compliance') && resaleKeys.has('subject_to_sale') && resaleKeys.has('resale_occupation_rent'), 'PHASE6_RESALE_REQUIRED_CLAUSES_PRESENT', 'Resale OTP includes disclosure, fixtures, subject-to-sale and occupation/rent clauses.')
  push(developmentKeys.has('development_unit') && developmentKeys.has('development_handover') && developmentKeys.has('development_compliance_body_corporate'), 'PHASE6_DEVELOPMENT_REQUIRED_CLAUSES_PRESENT', 'New-development OTP includes development unit, handover/snagging and body-corporate compliance clauses.')
  push(!developmentKeys.has('resale_disclosure_fixtures_compliance') && !developmentKeys.has('subject_to_sale'), 'PHASE6_DEVELOPMENT_NOT_RESALE_WORDING', 'New-development route excludes resale-only disclosure and subject-to-sale clauses.')
  push(!resaleKeys.has('development_unit') && !resaleKeys.has('development_handover'), 'PHASE6_RESALE_NOT_DEVELOPMENT_WORDING', 'Resale route excludes development-only unit and handover clauses.')
  push(routeAudits.every((audit) => audit.registryValidation.unknown.length === 0 && audit.registryValidation.deprecated.length === 0), 'PHASE6_TOKENS_CANONICAL', 'Every content token is canonical for OTP.')
  push(routeAudits.every((audit) => audit.fieldRegistryGaps.length === 0 && audit.routeFieldGaps.length === 0), 'PHASE6_TOKENS_IN_FIELD_REGISTRY_AND_ROUTE', 'Every content token exists in the OTP field registry for its route.')
  push(routeAudits.every((audit) => audit.definitionGaps.length === 0), 'PHASE6_DEFINITIONS_COVER_CLAUSES', 'Every clause family has the required route-aware definition terms.')
  push(routeAudits.every((audit) => audit.sourceOwnerGaps.length === 0), 'PHASE6_SOURCE_OWNERS_MATCH_FIELDS', 'Every content placeholder is backed by its declared source owner.')
  push(routeAudits.every((audit) => audit.layoutContractGaps.length === 0), 'PHASE6_LAYOUT_CONTRACT_ON_EVERY_SECTION', 'Every content section carries the Phase 6 legal-content layout contract.')
  push(routeAudits.every((audit) => audit.blankRenderRisks.length === 0 && audit.placeholderOnlyLines.length === 0), 'PHASE6_BLANK_RENDER_RISK_CONTROLLED', 'Optional legal-content sections have conditions and no placeholder-only lines.')
  push(routeAudits.every((audit) => audit.headingIssues.length === 0), 'PHASE6_CLIENT_HEADINGS_CLEAN', 'Client-facing section labels and headings avoid internal pack/packet wording.')
  push(allSections.every((sectionRow) => sectionRow.metadata_json?.legal_review_required === true), 'PHASE6_COUNSEL_REVIEW_BOUNDARY_MARKED', 'Every content section remains marked for legal review before publication.', 'warning')

  return checks
}

export function buildOtpLegalContentTemplateReport({ generatedAt = new Date().toISOString() } = {}) {
  const shellAudit = buildOtpBrandedShellAudit({ checkedAt: generatedAt })
  const routeAudits = OTP_DOCUMENT_VARIANTS.map((variant) => {
    const sections = listOtpLegalContentTemplateSections({ variant: variant.key })
    return auditSections({ variant: variant.key, sections })
  })
  const checks = buildChecks({ routeAudits, shellAudit })
  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const warnings = checks.filter((check) => !check.pass && check.severity !== 'blocking')
  const allTokens = unique(routeAudits.flatMap((audit) => audit.tokens)).sort()

  return {
    version: OTP_LEGAL_CONTENT_TEMPLATE_VERSION,
    generatedAt,
    mutatedData: false,
    layoutContract: OTP_LEGAL_CONTENT_LAYOUT_CONTRACT,
    shellLayoutContract: OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
    status: blockers.length ? 'OTP_LEGAL_CONTENT_REMEDIATION_REQUIRED' : 'OTP_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW',
    summary: {
      routeCount: routeAudits.length,
      sectionCount: OTP_LEGAL_CONTENT_TEMPLATE_SECTIONS.length,
      resaleSectionCount: routeAudits.find((audit) => audit.variant === 'resale_existing_property')?.sectionCount || 0,
      developmentSectionCount: routeAudits.find((audit) => audit.variant === 'new_development')?.sectionCount || 0,
      tokenCount: allTokens.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    checks,
    blockers,
    warnings,
    routeAudits,
    shellAudit: {
      status: shellAudit.status,
      summary: shellAudit.summary,
    },
    tokens: allTokens,
    sections: listOtpLegalContentTemplateSections(),
    fieldRegistryCoverage: {
      contentTokenCount: allTokens.length,
      registryFieldCount: listOtpFieldRegistry().length,
    },
  }
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatOtpLegalContentTemplateMarkdown(report = buildOtpLegalContentTemplateReport()) {
  return [
    '# OTP Template vNext Phase 6 Legal Content Templates',
    '',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Template sections', report.summary.sectionCount],
        ['Resale sections', report.summary.resaleSectionCount],
        ['New-development sections', report.summary.developmentSectionCount],
        ['Content tokens', report.summary.tokenCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Route Audits',
    '',
    table(
      ['Route', 'Sections', 'Clause Families', 'Unknown Tokens', 'Route Field Gaps'],
      report.routeAudits.map((audit) => [
        audit.variant,
        audit.sectionCount,
        audit.clauseFamilies.join(', '),
        audit.registryValidation.unknown.length,
        audit.routeFieldGaps.length,
      ]),
    ),
    '',
    '## Sections',
    '',
    table(
      ['Order', 'Section', 'Variants', 'Clause Family', 'Required', 'Placeholders'],
      report.sections.map((sectionRow) => [
        sectionRow.sort_order,
        sectionRow.section_key,
        sectionRow.variants.join(', '),
        sectionRow.clause_family,
        sectionRow.is_required ? 'yes' : 'no',
        sectionRow.placeholder_keys.join(', '),
      ]),
    ),
    '',
    '## Counsel Review Boundary',
    '',
    'Phase 6 provides deterministic legal-content templates for engineering, routing and counsel review. These sections are not a live legal approval, do not publish a template, and must pass the later content scanner, launch-readiness gate and runtime lock before production use.',
    '',
  ].join('\n')
}
