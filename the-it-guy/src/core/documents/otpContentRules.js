import {
  OTP_DOCUMENT_VARIANTS,
  normalizeOtpDocumentVariant,
} from './otpRouteUniverse.js'

export const OTP_CONTENT_RULE_VERSION = 'otp_content_rules_phase7_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function cloneArray(value = []) {
  return Array.isArray(value) ? [...value] : []
}

function cloneRule(rule = {}) {
  return {
    ...rule,
    requiredSignalGroups: cloneArray(rule.requiredSignalGroups),
    forbiddenUnconditionalSignalGroups: cloneArray(rule.forbiddenUnconditionalSignalGroups),
    recommendedSectionKeys: cloneArray(rule.recommendedSectionKeys),
    remediation: cloneArray(rule.remediation),
  }
}

export const OTP_CONTENT_SIGNAL_GROUPS = Object.freeze({
  shared_offer: Object.freeze({
    key: 'shared_offer',
    label: 'Shared offer wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'buyer_full_name',
      'purchase_price',
      'deposit_amount',
      'finance_type',
      'structured_suspensive_conditions',
      'irrevocable_offer_expiry',
    ]),
    phrases: Object.freeze([
      'offer to purchase',
      'purchase price',
      'deposit',
      'suspensive conditions',
      'irrevocable offer',
    ]),
    remediation: 'Keep the core offer, price, deposit and suspensive-condition wording in every OTP route.',
  }),
  parties: Object.freeze({
    key: 'parties',
    label: 'Parties wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'buyer_full_name',
      'buyer_id_number',
      'seller_full_name',
      'developer_name',
      'organisation_trading_name',
      'agent_full_name',
      'agent_ffc_number',
    ]),
    phrases: Object.freeze([
      'purchaser',
      'seller',
      'developer / seller',
      'agent ffc number',
    ]),
    remediation: 'Every OTP route must identify the purchaser, seller/developer and agency/agent party details.',
  }),
  finance_conditions: Object.freeze({
    key: 'finance_conditions',
    label: 'Finance and suspensive-condition wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'bond_amount',
      'bond_approval_deadline',
      'cash_amount',
      'cash_proof_deadline',
      'guarantee_delivery_deadline',
      'guarantee_delivery_period',
      'structured_suspensive_conditions',
    ]),
    phrases: Object.freeze([
      'bond approval',
      'cash proof',
      'guarantee delivery',
      'structured conditions',
      'fulfilment, waiver or lapse',
    ]),
    remediation: 'Render finance and suspensive conditions from structured OTP offer terms.',
  }),
  transfer_conveyancer: Object.freeze({
    key: 'transfer_conveyancer',
    label: 'Transfer and conveyancer wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'transfer_attorney_company_name',
      'trust_account_recipient',
      'guarantee_delivery_deadline',
    ]),
    phrases: Object.freeze([
      'transfer attorney',
      'conveyancer',
      'trust account recipient',
      'transfer administration',
    ]),
    remediation: 'Transfer, trust-account and guarantee handling must come from the appointed conveyancer/transfer assignment.',
  }),
  resale_property: Object.freeze({
    key: 'resale_property',
    label: 'Resale property wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'seller_full_name',
      'property_address',
      'property_title_type',
    ]),
    phrases: Object.freeze([
      'existing immovable property',
      'resale property',
      'title type',
      'fixtures and fittings expressly included',
    ]),
    remediation: 'Use resale property wording only in the resale/existing-property route.',
  }),
  resale_disclosure_fixtures: Object.freeze({
    key: 'resale_disclosure_fixtures',
    label: 'Resale disclosure, fixtures and defects wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'mandatory_disclosure_status',
      'mandatory_disclosure_annexure',
      'mandatory_disclosure_comments',
      'fixtures_included',
      'fixtures_excluded',
    ]),
    phrases: Object.freeze([
      'mandatory disclosure',
      'disclosure annexure',
      'fixtures included',
      'fixtures excluded',
      'seller disclosure',
      'defects',
    ]),
    remediation: 'Disclosure, fixtures and defect wording belongs to the resale route and seller/property source data.',
  }),
  occupation_rent: Object.freeze({
    key: 'occupation_rent',
    label: 'Occupation and occupational-rent wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'occupational_rent_payable',
      'occupational_rent_amount',
    ]),
    phrases: Object.freeze([
      'occupational rent',
      'occupational rental',
      'risk, utilities and occupational rent',
    ]),
    remediation: 'Resale occupation/rent wording must not leak into the new-development handover route.',
  }),
  subject_to_sale: Object.freeze({
    key: 'subject_to_sale',
    label: 'Subject-to-sale wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'subject_sale_property',
      'subject_sale_minimum_price',
      'subject_sale_fulfilment_date',
    ]),
    phrases: Object.freeze([
      'subject-to-sale',
      'purchaser property sale condition',
      'minimum sale price',
    ]),
    remediation: 'Subject-to-sale wording belongs to the resale route and must be conditionally controlled.',
  }),
  development_unit: Object.freeze({
    key: 'development_unit',
    label: 'New-development unit wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'developer_name',
      'development_name',
      'property_unit_number',
      'sectional_plan_status',
      'participation_quota',
      'parking_bay',
      'garage_allocation',
    ]),
    phrases: Object.freeze([
      'development unit',
      'section / unit number',
      'sectional plan',
      'participation quota',
      'exclusive-use',
      'new-development route',
    ]),
    remediation: 'Development unit wording belongs only to the new-development OTP route.',
  }),
  development_vat: Object.freeze({
    key: 'development_vat',
    label: 'New-development VAT wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'vat_inclusive_purchase_price',
    ]),
    phrases: Object.freeze([
      'vat-inclusive',
      'vat treatment',
      'new-development otp',
    ]),
    remediation: 'VAT treatment wording with development pricing belongs only to the new-development route.',
  }),
  development_handover: Object.freeze({
    key: 'development_handover',
    label: 'New-development handover and snagging wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'snagging_period_days',
      'contractor_company_name',
      'property_nhbrc_certificate_number',
    ]),
    phrases: Object.freeze([
      'handover and snagging',
      'snagging period',
      'nhbrc',
      'contractor',
      'development handover',
    ]),
    remediation: 'Handover, snagging, contractor and NHBRC wording belongs only to the new-development route.',
  }),
  development_body_corporate: Object.freeze({
    key: 'development_body_corporate',
    label: 'New-development body-corporate and levy wording',
    severity: 'blocking',
    fieldKeys: Object.freeze([
      'body_corporate_name',
      'body_corporate_rules_annexure',
      'development_levy_estimate',
      'development_rates_estimate',
      'utility_connection_charges',
    ]),
    phrases: Object.freeze([
      'body corporate',
      'rules annexure',
      'estimated levy',
      'utility connection charges',
      'development compliance',
    ]),
    remediation: 'Body-corporate, levy, rates and utility-charge wording belongs only to the new-development route.',
  }),
})

export const OTP_CONTENT_ROUTE_RULES = Object.freeze({
  resale_existing_property: Object.freeze({
    key: 'resale_existing_property',
    label: 'Existing / resale property OTP',
    requiredSignalGroups: Object.freeze([
      'shared_offer',
      'parties',
      'finance_conditions',
      'transfer_conveyancer',
      'resale_property',
      'resale_disclosure_fixtures',
      'occupation_rent',
      'subject_to_sale',
    ]),
    forbiddenUnconditionalSignalGroups: Object.freeze([
      'development_unit',
      'development_vat',
      'development_handover',
      'development_body_corporate',
    ]),
    recommendedSectionKeys: Object.freeze([
      'definitions_shared',
      'resale_parties',
      'resale_property',
      'purchase_price',
      'finance_suspensive_conditions',
      'subject_to_sale',
      'resale_occupation_rent',
      'resale_disclosure_fixtures_compliance',
      'transfer_conveyancer',
      'special_conditions_annexures',
      'popia_fica',
    ]),
    remediation: Object.freeze([
      'Use the resale OTP route for an existing seller and existing title/property facts.',
      'Keep disclosure, fixtures, subject-to-sale and occupational-rent wording in resale only.',
      'Remove development, VAT-inclusive development pricing, NHBRC, body-corporate and snagging wording.',
    ]),
  }),
  new_development: Object.freeze({
    key: 'new_development',
    label: 'New development OTP',
    requiredSignalGroups: Object.freeze([
      'shared_offer',
      'parties',
      'finance_conditions',
      'transfer_conveyancer',
      'development_unit',
      'development_vat',
      'development_handover',
      'development_body_corporate',
    ]),
    forbiddenUnconditionalSignalGroups: Object.freeze([
      'resale_property',
      'resale_disclosure_fixtures',
      'occupation_rent',
      'subject_to_sale',
    ]),
    recommendedSectionKeys: Object.freeze([
      'definitions_shared',
      'development_parties',
      'development_unit',
      'purchase_price',
      'development_vat_purchase_price',
      'finance_suspensive_conditions',
      'development_handover',
      'development_compliance_body_corporate',
      'transfer_conveyancer',
      'special_conditions_annexures',
      'popia_fica',
    ]),
    remediation: Object.freeze([
      'Use the new-development OTP route for developer seller, development setup and unit setup facts.',
      'Keep developer, VAT, sectional-plan, NHBRC, snagging and body-corporate wording in new development only.',
      'Remove resale-only disclosure, fixtures, occupation/rent and subject-to-sale wording unless counsel creates a dedicated conditional route.',
    ]),
  }),
})

export function listOtpContentSignalGroups() {
  return Object.values(OTP_CONTENT_SIGNAL_GROUPS).map((group) => ({
    ...group,
    fieldKeys: cloneArray(group.fieldKeys),
    phrases: cloneArray(group.phrases),
  }))
}

export function getOtpContentSignalGroup(groupKey = '') {
  const key = normalizeText(groupKey).toLowerCase().replace(/[\s./-]+/g, '_')
  const group = OTP_CONTENT_SIGNAL_GROUPS[key] || null
  if (!group) return null
  return {
    ...group,
    fieldKeys: cloneArray(group.fieldKeys),
    phrases: cloneArray(group.phrases),
  }
}

export function listOtpContentRules() {
  return Object.values(OTP_CONTENT_ROUTE_RULES).map(cloneRule)
}

export function getOtpContentRule(routeKey = 'resale_existing_property') {
  const key = normalizeOtpDocumentVariant(routeKey) || 'resale_existing_property'
  return cloneRule(OTP_CONTENT_ROUTE_RULES[key] || OTP_CONTENT_ROUTE_RULES.resale_existing_property)
}

export function resolveOtpContentRuleProfile(routeKey = 'resale_existing_property') {
  const rule = getOtpContentRule(routeKey)
  const requiredGroups = rule.requiredSignalGroups
    .map((groupKey) => getOtpContentSignalGroup(groupKey))
    .filter(Boolean)
  const forbiddenGroups = rule.forbiddenUnconditionalSignalGroups
    .map((groupKey) => getOtpContentSignalGroup(groupKey))
    .filter(Boolean)
  const knownRoutes = OTP_DOCUMENT_VARIANTS.map((variant) => variant.key)

  return {
    ruleVersion: OTP_CONTENT_RULE_VERSION,
    routeKey: rule.key,
    label: rule.label,
    knownRoutes,
    requiredSignalGroups: requiredGroups,
    forbiddenUnconditionalSignalGroups: forbiddenGroups,
    recommendedSectionKeys: cloneArray(rule.recommendedSectionKeys),
    remediation: cloneArray(rule.remediation),
  }
}
