import {
  normalizeMandateTemplateVariant,
} from './mandateTemplateRouting.js'

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
    allowedConditionalPackKeys: cloneArray(rule.allowedConditionalPackKeys),
    recommendedPackKeys: cloneArray(rule.recommendedPackKeys),
    remediation: cloneArray(rule.remediation),
  }
}

export const MANDATE_TEMPLATE_CONTENT_RULE_VERSION = 'mandate_template_content_rules_v1'

export const MANDATE_TEMPLATE_CONTENT_PACK_KEYS = {
  sellerIndividualCapacity: 'seller_individual_capacity_pack',
  sellerCompanyAuthority: 'seller_company_authority_pack',
  sellerTrustAuthority: 'seller_trust_authority_pack',
  sellerSpouseConsent: 'seller_spouse_consent_pack',
  propertyFullTitle: 'property_full_title_pack',
  propertySectionalTitle: 'property_sectional_title_pack',
}

export const MANDATE_TEMPLATE_CONTENT_SIGNAL_GROUPS = {
  universal_mandate: {
    key: 'universal_mandate',
    label: 'Universal mandate wording',
    severity: 'blocking',
    fieldKeys: [
      'seller_full_name',
      'property_address',
      'mandate_type',
      'mandate_start_date',
      'mandate_end_date',
      'commission_structure',
      'asking_price',
      'agent_full_name',
      'organisation_name',
    ],
    phrases: [
      'appoints the Agency',
      'estate agency mandate',
      'marketing of the Property',
      'commission',
    ],
    remediation: 'Keep these universal mandate details in every mandate route.',
  },
  full_title: {
    key: 'full_title',
    label: 'Full title property wording',
    severity: 'blocking',
    packKey: MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertyFullTitle,
    fieldKeys: [
      'erf_number',
      'erf_size',
      'floor_size',
      'title_deed_number',
      'rates_account_number',
      'municipal_account_number',
      'servitude_details',
      'property_zoning',
    ],
    phrases: [
      'full title',
      'freehold',
      'erf number',
      'title deed',
      'municipal rates',
      'rates account',
      'servitude details',
      'land extent',
    ],
    remediation: 'Use this wording only in a full-title route or the Full Title Property Pack.',
  },
  sectional_title: {
    key: 'sectional_title',
    label: 'Sectional title property wording',
    severity: 'blocking',
    packKey: MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
    fieldKeys: [
      'property_unit_number',
      'property_section_number',
      'sectional_title_number',
      'property_complex_name',
      'body_corporate_name',
      'body_corporate_details',
      'levy_amount',
      'levy_statement',
      'managing_agent_name',
      'participation_quota',
      'exclusive_use_area',
      'parking_bay',
      'storeroom',
      'conduct_rules',
    ],
    phrases: [
      'sectional title',
      'body corporate',
      'participation quota',
      'levy',
      'managing agent',
      'scheme rules',
      'conduct rules',
      'exclusive use',
      'section number',
      'unit number',
      'sectional plan',
      'share block',
      'complex / scheme',
    ],
    remediation: 'Move sectional wording into the Sectional Title Property Pack or a sectional-title mandate route.',
  },
  individual_capacity: {
    key: 'individual_capacity',
    label: 'Individual seller capacity wording',
    severity: 'warning',
    packKey: MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerIndividualCapacity,
    fieldKeys: [
      'seller_marital_status',
    ],
    phrases: [
      'individual seller',
      'contractual capacity',
      'marital status',
    ],
    remediation: 'Use individual-capacity wording only for individual seller routes or the Individual Seller Capacity Pack.',
  },
  company_authority: {
    key: 'company_authority',
    label: 'Company / close corporation authority wording',
    severity: 'blocking',
    packKey: MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerCompanyAuthority,
    fieldKeys: [
      'seller_company_registration_number',
      'seller_resolution_date',
    ],
    phrases: [
      'company or close corporation',
      'company registration',
      'close corporation',
      'directors resolution',
      'members resolution',
    ],
    remediation: 'Company routes must include representative authority wording; non-company routes must not contain it unconditionally.',
  },
  trust_authority: {
    key: 'trust_authority',
    label: 'Trust authority wording',
    severity: 'blocking',
    packKey: MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerTrustAuthority,
    fieldKeys: [
      'seller_trust_registration_number',
      'seller_trustee_names',
    ],
    phrases: [
      'trust registration',
      'trustees',
      'trustee resolution',
      'letters of authority',
      'master of the high court',
      'trust deed',
      'authorised trustee',
    ],
    remediation: 'Trust routes must include trustee authority wording; non-trust routes must not contain it unconditionally.',
  },
  spouse_consent: {
    key: 'spouse_consent',
    label: 'Seller spouse consent wording',
    severity: 'blocking',
    packKey: MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerSpouseConsent,
    fieldKeys: [
      'seller_spouse_full_name',
      'seller_spouse_id_number',
      'seller_spouse_email',
    ],
    phrases: [
      'married in community of property',
      'spouse recorded below',
      'spouse will sign',
      'co-signer',
    ],
    remediation: 'Spouse-consent wording belongs only in spouse-consent routes or the Seller Spouse Consent Pack.',
  },
}

const ALL_ROUTE_SPECIFIC_SIGNAL_GROUPS = [
  'full_title',
  'sectional_title',
  'individual_capacity',
  'company_authority',
  'trust_authority',
  'spouse_consent',
]

const ALL_CONDITIONAL_PACK_KEYS = Object.values(MANDATE_TEMPLATE_CONTENT_PACK_KEYS)

function buildRouteRule({
  key,
  label,
  sellerProfile = 'any',
  propertyProfile = 'any',
  requiredSignalGroups = [],
  forbiddenUnconditionalSignalGroups = [],
  allowedConditionalPackKeys = [],
  recommendedPackKeys = [],
  remediation = [],
} = {}) {
  return {
    key,
    label,
    sellerProfile,
    propertyProfile,
    requiredSignalGroups: ['universal_mandate', ...requiredSignalGroups],
    forbiddenUnconditionalSignalGroups,
    allowedConditionalPackKeys,
    recommendedPackKeys,
    remediation,
  }
}

export const MANDATE_TEMPLATE_CONTENT_ROUTE_RULES = {
  default: buildRouteRule({
    key: 'default',
    label: 'All mandate situations',
    forbiddenUnconditionalSignalGroups: ALL_ROUTE_SPECIFIC_SIGNAL_GROUPS,
    allowedConditionalPackKeys: ALL_CONDITIONAL_PACK_KEYS,
    recommendedPackKeys: ALL_CONDITIONAL_PACK_KEYS,
    remediation: [
      'Keep the default mandate universal.',
      'Move full-title wording into the Full Title Property Pack.',
      'Move sectional-title wording into the Sectional Title Property Pack.',
      'Move company, trust, and spouse consent wording into their matching seller packs.',
    ],
  }),
  company_full_title: buildRouteRule({
    key: 'company_full_title',
    label: 'Company + Full Title',
    sellerProfile: 'company',
    propertyProfile: 'full_title',
    requiredSignalGroups: ['company_authority', 'full_title'],
    forbiddenUnconditionalSignalGroups: ['sectional_title', 'trust_authority', 'individual_capacity', 'spouse_consent'],
    allowedConditionalPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerCompanyAuthority,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertyFullTitle,
    ],
    recommendedPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerCompanyAuthority,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertyFullTitle,
    ],
    remediation: [
      'Include company representative authority wording.',
      'Include full-title land particulars.',
      'Remove sectional-title, trust, individual, and spouse-consent wording.',
    ],
  }),
  company_sectional_title: buildRouteRule({
    key: 'company_sectional_title',
    label: 'Company + Sectional Title',
    sellerProfile: 'company',
    propertyProfile: 'sectional_title',
    requiredSignalGroups: ['company_authority', 'sectional_title'],
    forbiddenUnconditionalSignalGroups: ['full_title', 'trust_authority', 'individual_capacity', 'spouse_consent'],
    allowedConditionalPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerCompanyAuthority,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
    ],
    recommendedPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerCompanyAuthority,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
    ],
    remediation: [
      'Include company representative authority wording.',
      'Include sectional-title scheme, body corporate, and levy wording.',
      'Remove full-title, trust, individual, and spouse-consent wording.',
    ],
  }),
  trust_full_title: buildRouteRule({
    key: 'trust_full_title',
    label: 'Trust + Full Title',
    sellerProfile: 'trust',
    propertyProfile: 'full_title',
    requiredSignalGroups: ['trust_authority', 'full_title'],
    forbiddenUnconditionalSignalGroups: ['sectional_title', 'company_authority', 'individual_capacity', 'spouse_consent'],
    allowedConditionalPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerTrustAuthority,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertyFullTitle,
    ],
    recommendedPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerTrustAuthority,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertyFullTitle,
    ],
    remediation: [
      'Include trustee authority wording.',
      'Include full-title land particulars.',
      'Remove sectional-title, company, individual, and spouse-consent wording.',
    ],
  }),
  trust_sectional_title: buildRouteRule({
    key: 'trust_sectional_title',
    label: 'Trust + Sectional Title',
    sellerProfile: 'trust',
    propertyProfile: 'sectional_title',
    requiredSignalGroups: ['trust_authority', 'sectional_title'],
    forbiddenUnconditionalSignalGroups: ['full_title', 'company_authority', 'individual_capacity', 'spouse_consent'],
    allowedConditionalPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerTrustAuthority,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
    ],
    recommendedPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerTrustAuthority,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
    ],
    remediation: [
      'Include trustee authority wording.',
      'Include sectional-title scheme, body corporate, and levy wording.',
      'Remove full-title, company, individual, and spouse-consent wording.',
    ],
  }),
  individual_full_title: buildRouteRule({
    key: 'individual_full_title',
    label: 'Individual + Full Title',
    sellerProfile: 'individual',
    propertyProfile: 'full_title',
    requiredSignalGroups: ['individual_capacity', 'full_title'],
    forbiddenUnconditionalSignalGroups: ['sectional_title', 'company_authority', 'trust_authority', 'spouse_consent'],
    allowedConditionalPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerIndividualCapacity,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertyFullTitle,
    ],
    recommendedPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerIndividualCapacity,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertyFullTitle,
    ],
    remediation: [
      'Include individual seller capacity wording.',
      'Include full-title land particulars.',
      'Remove sectional-title, company, trust, and spouse-consent wording.',
    ],
  }),
  individual_sectional_title: buildRouteRule({
    key: 'individual_sectional_title',
    label: 'Individual + Sectional Title',
    sellerProfile: 'individual',
    propertyProfile: 'sectional_title',
    requiredSignalGroups: ['individual_capacity', 'sectional_title'],
    forbiddenUnconditionalSignalGroups: ['full_title', 'company_authority', 'trust_authority', 'spouse_consent'],
    allowedConditionalPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerIndividualCapacity,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
    ],
    recommendedPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerIndividualCapacity,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
    ],
    remediation: [
      'Include individual seller capacity wording.',
      'Include sectional-title scheme, body corporate, and levy wording.',
      'Remove full-title, company, trust, and spouse-consent wording.',
    ],
  }),
  individual_spouse_consent_full_title: buildRouteRule({
    key: 'individual_spouse_consent_full_title',
    label: 'Married ICOP + Full Title',
    sellerProfile: 'individual_spouse_consent',
    propertyProfile: 'full_title',
    requiredSignalGroups: ['individual_capacity', 'spouse_consent', 'full_title'],
    forbiddenUnconditionalSignalGroups: ['sectional_title', 'company_authority', 'trust_authority'],
    allowedConditionalPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerIndividualCapacity,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerSpouseConsent,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertyFullTitle,
    ],
    recommendedPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerIndividualCapacity,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerSpouseConsent,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertyFullTitle,
    ],
    remediation: [
      'Include individual seller capacity wording.',
      'Include spouse-consent signer wording.',
      'Include full-title land particulars.',
      'Remove sectional-title, company, and trust wording.',
    ],
  }),
  individual_spouse_consent_sectional_title: buildRouteRule({
    key: 'individual_spouse_consent_sectional_title',
    label: 'Married ICOP + Sectional Title',
    sellerProfile: 'individual_spouse_consent',
    propertyProfile: 'sectional_title',
    requiredSignalGroups: ['individual_capacity', 'spouse_consent', 'sectional_title'],
    forbiddenUnconditionalSignalGroups: ['full_title', 'company_authority', 'trust_authority'],
    allowedConditionalPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerIndividualCapacity,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerSpouseConsent,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
    ],
    recommendedPackKeys: [
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerIndividualCapacity,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.sellerSpouseConsent,
      MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
    ],
    remediation: [
      'Include individual seller capacity wording.',
      'Include spouse-consent signer wording.',
      'Include sectional-title scheme, body corporate, and levy wording.',
      'Remove full-title, company, and trust wording.',
    ],
  }),
}

export function listMandateTemplateSignalGroups() {
  return Object.values(MANDATE_TEMPLATE_CONTENT_SIGNAL_GROUPS).map((group) => ({
    ...group,
    fieldKeys: cloneArray(group.fieldKeys),
    phrases: cloneArray(group.phrases),
  }))
}

export function getMandateTemplateSignalGroup(groupKey = '') {
  const key = normalizeMandateTemplateVariant(groupKey)
  const group = MANDATE_TEMPLATE_CONTENT_SIGNAL_GROUPS[key] || null
  if (!group) return null
  return {
    ...group,
    fieldKeys: cloneArray(group.fieldKeys),
    phrases: cloneArray(group.phrases),
  }
}

export function listMandateTemplateContentRules() {
  return Object.values(MANDATE_TEMPLATE_CONTENT_ROUTE_RULES).map(cloneRule)
}

export function getMandateTemplateContentRule(routeKey = 'default') {
  const key = normalizeMandateTemplateVariant(routeKey) || 'default'
  return cloneRule(MANDATE_TEMPLATE_CONTENT_ROUTE_RULES[key] || MANDATE_TEMPLATE_CONTENT_ROUTE_RULES.default)
}

export function resolveMandateTemplateContentRuleProfile(routeKey = 'default') {
  const rule = getMandateTemplateContentRule(routeKey)
  const requiredGroups = rule.requiredSignalGroups
    .map((groupKey) => getMandateTemplateSignalGroup(groupKey))
    .filter(Boolean)
  const forbiddenGroups = rule.forbiddenUnconditionalSignalGroups
    .map((groupKey) => getMandateTemplateSignalGroup(groupKey))
    .filter(Boolean)

  return {
    ruleVersion: MANDATE_TEMPLATE_CONTENT_RULE_VERSION,
    routeKey: rule.key,
    label: rule.label,
    sellerProfile: rule.sellerProfile,
    propertyProfile: rule.propertyProfile,
    requiredSignalGroups: requiredGroups,
    forbiddenUnconditionalSignalGroups: forbiddenGroups,
    allowedConditionalPackKeys: cloneArray(rule.allowedConditionalPackKeys),
    recommendedPackKeys: cloneArray(rule.recommendedPackKeys),
    remediation: cloneArray(rule.remediation),
  }
}

export function mandateTemplateSignalGroupIsAllowedForRoute(groupKey = '', routeKey = 'default', { conditionalPackKey = '' } = {}) {
  const group = getMandateTemplateSignalGroup(groupKey)
  if (!group) return false
  const rule = getMandateTemplateContentRule(routeKey)
  const packKey = normalizeText(conditionalPackKey)
  if (packKey && rule.allowedConditionalPackKeys.includes(packKey) && group.packKey === packKey) return true
  if (rule.requiredSignalGroups.includes(group.key)) return true
  return !rule.forbiddenUnconditionalSignalGroups.includes(group.key)
}
