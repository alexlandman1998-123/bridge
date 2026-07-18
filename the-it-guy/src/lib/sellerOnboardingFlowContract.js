import { normalizePropertyCategory, normalizePropertyStructureType } from './propertyTaxonomy.js'

export const SELLER_ONBOARDING_FLOW_VERSION = 'seller_onboarding_flow_v2'

export const SELLER_ONBOARDING_FIELD_ALIASES = Object.freeze({
  'seller.ownership_type': Object.freeze(['seller.owner_entity_type', 'seller.owner_structure_type']),
  'property.canonical_property_type': Object.freeze(['property.category', 'property.structure_type', 'property.estate_or_hoa']),
  'property.property_type': Object.freeze(['property.category', 'property.structure_type']),
  'property.type': Object.freeze(['property.category', 'property.structure_type']),
  'property.estate_structure': Object.freeze(['property.estate_or_hoa', 'property.estate.name']),
  'property.address.canonical': Object.freeze(['property.address.line_1']),
})

export function getSellerOnboardingFieldAliases(field) {
  const key = normalizeText(field)
  if (!key) return []
  return SELLER_ONBOARDING_FIELD_ALIASES[key] || [key]
}

export function migrateSellerOnboardingFieldListToV2(fields = []) {
  return mergeUnique(
    (Array.isArray(fields) ? fields : [fields]).flatMap((field) => getSellerOnboardingFieldAliases(field)),
  )
}

export const SELLER_ONBOARDING_BRANCHES = Object.freeze([
  'individual',
  'married',
  'company',
  'trust',
  'deceased_estate',
  'power_of_attorney',
  'multiple_owners',
  'other',
])

export const PROPERTY_ONBOARDING_BRANCHES = Object.freeze([
  'residential',
  'sectional_title',
  'estate_hoa',
  'commercial',
  'mixed_use',
  'agricultural',
  'vacant_land',
])

const CORE_SELLER_RULES = Object.freeze({
  sellerFacingQuestions: Object.freeze([
    'seller.owner_entity_type',
    'seller.owner_structure_type',
    'seller.first_name',
    'seller.surname',
    'seller.email',
    'seller.phone',
  ]),
  requiredFields: Object.freeze([
    'seller.owner_entity_type',
    'seller.owner_structure_type',
    'seller.first_name',
    'seller.surname',
    'seller.email',
    'seller.phone',
  ]),
  optionalFields: Object.freeze([
    'seller.tax_number',
    'seller.vat_registered',
    'seller.vat_number',
    'seller.foreign_owner_country',
    'seller.foreign.passport_number',
    'seller.foreign.registration_number',
    'seller.foreign.residency_status',
  ]),
  internalDerivedFacts: Object.freeze([
    'seller.branch',
    'seller.legal_type',
    'seller.ownership_type',
    'seller.owner_entity_type',
    'seller.owner_structure_type',
    'seller.foreign_owner',
  ]),
  documentTriggers: Object.freeze([
    'identity_documents',
    'proof_of_address',
    'signed_mandate',
  ]),
})

const CORE_PROPERTY_RULES = Object.freeze({
  sellerFacingQuestions: Object.freeze([
    'property.category',
    'property.type',
    'property.structure_type',
    'property.address.search_query',
    'property.address.line_1',
    'property.address.line_2',
    'property.address.suburb',
    'property.address.city',
    'property.address.province',
    'property.address.postal_code',
    'property.municipality',
    'property.rates_taxes',
    'property.levies',
    'property.levies_not_applicable',
    'property.utilities.water_billing_type',
  ]),
  requiredFields: Object.freeze([
    'property.category',
    'property.type',
    'property.structure_type',
    'property.address.line_1',
    'property.address.suburb',
    'property.address.city',
    'property.province',
    'property.rates_taxes',
    'property.levies_or_not_applicable',
    'property.utilities.water_billing_type',
  ]),
  optionalFields: Object.freeze([
    'property.address.search_query',
    'property.address.line_2',
    'property.address.postal_code',
    'property.municipality',
    'property.address.country',
    'property.erf_size',
    'property.floor_size',
    'property.utilities.monthly_water_spend',
    'property.utilities.monthly_electricity_spend',
  ]),
  internalDerivedFacts: Object.freeze([
    'property.branch',
    'property.category',
    'property.structure_type',
    'property.canonical_property_type',
  ]),
  documentTriggers: Object.freeze([
    'title_deed_copy',
    'rates_account',
    'property_condition_disclosure',
  ]),
})

const SELLER_BRANCH_RULES = Object.freeze({
  individual: Object.freeze({
    label: 'Individual',
    aliases: Object.freeze(['individual', 'single', 'sole_owner']),
    sellerFacingQuestions: Object.freeze([
      'seller.id_number',
      'seller.residential_address',
      'seller.marital_status',
    ]),
    requiredFields: Object.freeze([
      'seller.id_number',
      'seller.residential_address',
      'seller.marital_status',
    ]),
    optionalFields: Object.freeze([
      'seller.marital_regime',
    ]),
    internalDerivedFacts: Object.freeze([
      'seller.branch',
      'seller.authority_model',
      'seller.marital_regime',
    ]),
    documentTriggers: Object.freeze([
      'identity_documents',
      'proof_of_address',
    ]),
  }),
  married: Object.freeze({
    label: 'Married',
    aliases: Object.freeze([
      'married',
      'married_cop',
      'married_anc',
      'married_in_community',
      'married_out_of_community',
      'married_in_community_of_property',
      'married_out_of_community_of_property',
      'anc',
    ]),
    sellerFacingQuestions: Object.freeze([
      'seller.id_number',
      'seller.marital_status',
      'seller.marital_regime',
      'seller.spouse.name',
      'seller.spouse.id_number',
      'seller.spouse.email',
      'seller.spouse.phone',
      'seller.spouse.consent_required',
    ]),
    requiredFields: Object.freeze([
      'seller.id_number',
      'seller.marital_status',
      'seller.marital_regime',
      'seller.spouse.name',
      'seller.spouse.id_number',
      'seller.spouse.consent_required',
    ]),
    optionalFields: Object.freeze([
      'seller.spouse.email',
      'seller.spouse.phone',
      'seller.spouse.residential_address',
    ]),
    internalDerivedFacts: Object.freeze([
      'seller.branch',
      'seller.marital_regime',
      'seller.spouse_consent_required',
      'seller.antenuptial_contract_required',
    ]),
    documentTriggers: Object.freeze([
      'identity_documents',
      'proof_of_address',
      'marriage_certificate',
      'spouse_consent',
      'antenuptial_contract',
    ]),
  }),
  company: Object.freeze({
    label: 'Company',
    aliases: Object.freeze(['company', 'pty', 'pty_ltd', 'corporate']),
    sellerFacingQuestions: Object.freeze([
      'seller.company.name',
      'seller.company.registration_number',
      'seller.company.registered_address',
      'seller.company.directors',
      'seller.company.authorised_signatory.name',
      'seller.company.authorised_signatory.capacity',
      'seller.company.resolution_date',
      'seller.company.authority_basis',
      'seller.company.authorised_signatory.email',
      'seller.company.authorised_signatory.phone',
      'seller.company.authorised_signatory.residential_address',
    ]),
    requiredFields: Object.freeze([
      'seller.company.name',
      'seller.company.registration_number',
      'seller.company.registered_address',
      'seller.company.authorised_signatory.name',
      'seller.company.authorised_signatory.capacity',
      'seller.company.resolution_date',
      'seller.company.authority_basis',
    ]),
    optionalFields: Object.freeze([
      'seller.company.registered_address',
      'seller.company.directors',
      'seller.company.resolution_available',
      'seller.company.beneficial_owners',
      'seller.company.tax_number',
      'seller.company.vat_number',
      'seller.company.authorised_signatory.email',
      'seller.company.authorised_signatory.phone',
      'seller.company.authorised_signatory.residential_address',
    ]),
    internalDerivedFacts: Object.freeze([
      'seller.branch',
      'seller.company.director_count',
      'seller.company.authorised_signatory',
    ]),
    documentTriggers: Object.freeze([
      'company_registration',
      'company_resolution',
      'director_identity',
      'company_address_proof',
    ]),
  }),
  trust: Object.freeze({
    label: 'Trust',
    aliases: Object.freeze(['trust']),
    sellerFacingQuestions: Object.freeze([
      'seller.trust.name',
      'seller.trust.registration_number',
      'seller.trust.registered_address',
      'seller.trust.trustees',
      'seller.trust.authorised_trustee.name',
      'seller.trust.authorised_trustee.capacity',
      'seller.trust.authority_basis',
      'seller.trust.authorised_trustee.email',
      'seller.trust.authorised_trustee.phone',
      'seller.trust.authorised_trustee.residential_address',
    ]),
    requiredFields: Object.freeze([
      'seller.trust.name',
      'seller.trust.registration_number',
      'seller.trust.registered_address',
      'seller.trust.authorised_trustee.name',
      'seller.trust.authorised_trustee.capacity',
      'seller.trust.authority_basis',
    ]),
    optionalFields: Object.freeze([
      'seller.trust.registered_address',
      'seller.trust.trustees',
      'seller.trust.resolution_available',
      'seller.trust.beneficiaries',
      'seller.trust.authorised_trustee.email',
      'seller.trust.authorised_trustee.phone',
      'seller.trust.authorised_trustee.residential_address',
    ]),
    internalDerivedFacts: Object.freeze([
      'seller.branch',
      'seller.trust.trustee_count',
      'seller.trust.authorised_trustee',
    ]),
    documentTriggers: Object.freeze([
      'trust_deed',
      'letters_of_authority',
      'trustee_identity',
      'trustee_resolution',
    ]),
  }),
  deceased_estate: Object.freeze({
    label: 'Deceased Estate',
    aliases: Object.freeze(['deceased_estate', 'deceased', 'estate']),
    sellerFacingQuestions: Object.freeze([
      'seller.deceased_estate.executor_name',
      'seller.deceased_estate.estate_reference',
      'seller.deceased_estate.authority_details',
      'seller.deceased_estate.executor_email',
      'seller.deceased_estate.executor_phone',
    ]),
    requiredFields: Object.freeze([
      'seller.deceased_estate.executor_name',
      'seller.deceased_estate.estate_reference',
      'seller.deceased_estate.authority_details',
    ]),
    optionalFields: Object.freeze([
      'seller.deceased_estate.executor_email',
      'seller.deceased_estate.executor_phone',
      'seller.deceased_estate.executor_id_number',
    ]),
    internalDerivedFacts: Object.freeze([
      'seller.branch',
      'seller.deceased_estate.authority_status',
    ]),
    documentTriggers: Object.freeze([
      'estate_executorship',
      'deceased_death_certificate',
      'executor_identity',
    ]),
  }),
  power_of_attorney: Object.freeze({
    label: 'Power of Attorney',
    aliases: Object.freeze(['power_of_attorney', 'poa', 'attorney']),
    sellerFacingQuestions: Object.freeze([
      'seller.power_of_attorney.representative_name',
      'seller.power_of_attorney.representative_email',
      'seller.power_of_attorney.representative_phone',
      'seller.power_of_attorney.principal.name',
      'seller.power_of_attorney.principal.id_number',
      'seller.power_of_attorney.authority_details',
    ]),
    requiredFields: Object.freeze([
      'seller.power_of_attorney.representative_name',
      'seller.power_of_attorney.principal.name',
      'seller.power_of_attorney.principal.id_number',
      'seller.power_of_attorney.authority_details',
    ]),
    optionalFields: Object.freeze([
      'seller.power_of_attorney.representative_email',
      'seller.power_of_attorney.representative_phone',
      'seller.power_of_attorney.principal.email',
      'seller.power_of_attorney.principal.phone',
    ]),
    internalDerivedFacts: Object.freeze([
      'seller.branch',
      'seller.power_of_attorney.authority_status',
      'seller.power_of_attorney.reference',
    ]),
    documentTriggers: Object.freeze([
      'power_of_attorney_document',
      'principal_identity',
    ]),
  }),
  multiple_owners: Object.freeze({
    label: 'Multiple Owners',
    aliases: Object.freeze(['multiple_owners', 'multiple_individuals', 'multiple', 'joint']),
    sellerFacingQuestions: Object.freeze([
      'seller.multiple_owner_capture_mode',
      'seller.owners',
      'seller.owners[].ownership_share',
      'seller.owners[].consent_to_sell',
    ]),
    requiredFields: Object.freeze([
      'seller.multiple_owner_capture_mode',
      'seller.owners',
    ]),
    optionalFields: Object.freeze([
      'seller.owners[].ownership_share',
      'seller.owners[].email',
      'seller.owners[].phone',
    ]),
    internalDerivedFacts: Object.freeze([
      'seller.branch',
      'seller.owner_count',
      'seller.owner_shares',
      'seller.owner_consents',
    ]),
    documentTriggers: Object.freeze([
      'ownership_split_confirmation',
      'owner_consent',
      'owner_identity_documents',
    ]),
  }),
  other: Object.freeze({
    label: 'Other',
    aliases: Object.freeze(['other', 'other_legal_entity', 'legal_entity']),
    sellerFacingQuestions: Object.freeze([
      'seller.ownership_description',
    ]),
    requiredFields: Object.freeze([
      'seller.ownership_description',
    ]),
    optionalFields: Object.freeze([]),
    internalDerivedFacts: Object.freeze([
      'seller.branch',
      'seller.legal_type',
    ]),
    documentTriggers: Object.freeze([
      'seller_authority',
    ]),
  }),
})

const PROPERTY_BRANCH_RULES = Object.freeze({
  residential: Object.freeze({
    label: 'Residential',
    aliases: Object.freeze(['residential', 'freehold', 'house', 'apartment', 'townhouse', 'cluster', 'duplex']),
    sellerFacingQuestions: Object.freeze([
      'property.features',
      'property.title_deed_available',
      'property.sg_diagram_available',
      'property.erf_diagram_available',
      'property.floor_plan_available',
    ]),
    requiredFields: Object.freeze([]),
    optionalFields: Object.freeze([
      'property.features',
      'property.title_deed_available',
      'property.sg_diagram_available',
      'property.erf_diagram_available',
      'property.floor_plan_available',
      'property.bedrooms',
      'property.bathrooms',
      'property.garages',
      'property.parking.covered',
      'property.parking.open',
    ]),
    internalDerivedFacts: Object.freeze([
      'property.branch',
    ]),
    documentTriggers: Object.freeze([]),
  }),
  sectional_title: Object.freeze({
    label: 'Sectional Title',
    aliases: Object.freeze(['sectional_title', 'sectional', 'share_block']),
    sellerFacingQuestions: Object.freeze([
      'property.scheme.name',
      'property.scheme.unit_number',
      'property.scheme.section_number',
      'property.scheme.body_corporate_name',
      'property.scheme.managing_agent.name',
      'property.scheme.managing_agent.email',
      'property.scheme.managing_agent.phone',
      'property.scheme.levies',
      'property.scheme.rules',
    ]),
    requiredFields: Object.freeze([
      'property.scheme.name',
      'property.scheme.unit_number',
      'property.scheme.section_number',
      'property.scheme.managing_agent.name',
    ]),
    optionalFields: Object.freeze([
      'property.scheme.body_corporate_name',
      'property.scheme.managing_agent.email',
      'property.scheme.managing_agent.phone',
      'property.scheme.levies',
      'property.scheme.rules',
    ]),
    internalDerivedFacts: Object.freeze([
      'property.branch',
      'property.sectional_title',
      'property.body_corporate',
    ]),
    documentTriggers: Object.freeze([
      'sectional_levy_statement',
      'body_corporate_details',
    ]),
  }),
  estate_hoa: Object.freeze({
    label: 'Estate / HOA',
    aliases: Object.freeze(['estate_hoa', 'estate', 'hoa', 'estate_or_hoa', 'complex']),
    sellerFacingQuestions: Object.freeze([
      'property.estate.name',
      'property.estate.hoa_contact.name',
      'property.estate.hoa_contact.email',
      'property.estate.hoa_contact.phone',
      'property.estate.management_company',
      'property.levies',
      'property.estate.rules',
    ]),
    requiredFields: Object.freeze([
      'property.estate.name',
      'property.estate.hoa_contact.name',
    ]),
    optionalFields: Object.freeze([
      'property.estate.management_company',
      'property.estate.rules',
      'property.levies',
    ]),
    internalDerivedFacts: Object.freeze([
      'property.branch',
      'property.estate_or_hoa',
    ]),
    documentTriggers: Object.freeze([
      'hoa_levy_statement',
      'hoa_details',
    ]),
  }),
  commercial: Object.freeze({
    label: 'Commercial',
    aliases: Object.freeze(['commercial', 'industrial', 'retail', 'office_building', 'warehouse', 'factory', 'retail_store', 'showroom']),
    sellerFacingQuestions: Object.freeze([
      'property.use.description',
      'property.use.mixed_use_split',
      'property.tenant_schedule',
      'property.floor_size',
      'property.utilities.monthly_water_spend',
      'property.utilities.monthly_electricity_spend',
    ]),
    requiredFields: Object.freeze([
      'property.use.description',
      'property.floor_size',
    ]),
    optionalFields: Object.freeze([
      'property.tenant_schedule',
      'property.utilities.monthly_water_spend',
      'property.utilities.monthly_electricity_spend',
      'property.rates_taxes',
    ]),
    internalDerivedFacts: Object.freeze([
      'property.branch',
      'property.commercial_property',
    ]),
    documentTriggers: Object.freeze([
      'zoning_certificate',
      'occupation_certificate',
      'commercial_use_summary',
    ]),
  }),
  mixed_use: Object.freeze({
    label: 'Mixed Use',
    aliases: Object.freeze(['mixed_use', 'mixed-use']),
    sellerFacingQuestions: Object.freeze([
      'property.use.description',
      'property.use.mixed_use_split',
      'property.tenant_schedule',
      'property.floor_size',
    ]),
    requiredFields: Object.freeze([
      'property.use.description',
    ]),
    optionalFields: Object.freeze([
      'property.use.mixed_use_split',
      'property.floor_size',
      'property.tenant_schedule',
      'property.utilities.monthly_water_spend',
      'property.utilities.monthly_electricity_spend',
    ]),
    internalDerivedFacts: Object.freeze([
      'property.branch',
      'property.mixed_use',
    ]),
    documentTriggers: Object.freeze([
      'zoning_certificate',
      'occupation_certificate',
      'mixed_use_summary',
    ]),
  }),
  agricultural: Object.freeze({
    label: 'Agricultural',
    aliases: Object.freeze(['agricultural', 'farm', 'smallholding', 'agricultural_holding']),
    sellerFacingQuestions: Object.freeze([
      'property.land.size',
      'property.land.zoning',
      'property.land.water_source',
      'property.utilities.monthly_water_spend',
      'property.utilities.monthly_electricity_spend',
    ]),
    requiredFields: Object.freeze([
      'property.land.size',
    ]),
    optionalFields: Object.freeze([
      'property.land.zoning',
      'property.land.water_source',
      'property.land.borehole',
      'property.utilities.monthly_water_spend',
      'property.utilities.monthly_electricity_spend',
    ]),
    internalDerivedFacts: Object.freeze([
      'property.branch',
      'property.agricultural',
    ]),
    documentTriggers: Object.freeze([
      'zoning_disclosure',
      'water_source_disclosure',
    ]),
  }),
  vacant_land: Object.freeze({
    label: 'Vacant Land',
    aliases: Object.freeze(['vacant_land', 'vacant_stand', 'land']),
    sellerFacingQuestions: Object.freeze([
      'property.land.size',
      'property.land.zoning',
      'property.land.services_available',
      'property.sg_diagram_available',
    ]),
    requiredFields: Object.freeze([
      'property.land.size',
    ]),
    optionalFields: Object.freeze([
      'property.land.zoning',
      'property.land.services_available',
      'property.sg_diagram_available',
      'property.erf_diagram_available',
    ]),
    internalDerivedFacts: Object.freeze([
      'property.branch',
      'property.vacant_land',
    ]),
    documentTriggers: Object.freeze([
      'sg_diagram',
      'zoning_disclosure',
    ]),
  }),
})

export const SELLER_ONBOARDING_FLOW_MATRIX = Object.freeze({
  seller: SELLER_BRANCH_RULES,
  property: PROPERTY_BRANCH_RULES,
  coreSeller: CORE_SELLER_RULES,
  coreProperty: CORE_PROPERTY_RULES,
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['true', 'yes', 'y', '1', 'on', 'enabled'].includes(normalized)
}

function hasOwnValue(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== null && source[key] !== undefined && source[key] !== '')
}

function normalizeSellerStructureType(value, { fallback = null } = {}) {
  const normalized = normalizePropertyStructureType(value, { fallback })
  return normalized === 'estate' ? 'full_title' : normalized
}

function mergeUnique(...groups) {
  const seen = new Set()
  const merged = []
  for (const group of groups.flat()) {
    const item = normalizeText(group)
    if (!item || seen.has(item)) continue
    seen.add(item)
    merged.push(item)
  }
  return merged
}

function normalizeFactsSource(form = {}, listing = {}, facts = {}) {
  if (facts && typeof facts === 'object' && Object.keys(facts).length) return facts
  const listingFacts = listing?.sellerOnboarding?.canonicalFacts
  if (listingFacts && typeof listingFacts === 'object' && Object.keys(listingFacts).length) return listingFacts
  const listingCanonicalFacts = listing?.sellerCanonicalFacts
  if (listingCanonicalFacts && typeof listingCanonicalFacts === 'object' && Object.keys(listingCanonicalFacts).length) return listingCanonicalFacts
  const formFacts = form?.canonicalSellerFacts
  if (formFacts && typeof formFacts === 'object' && Object.keys(formFacts).length) return formFacts
  return {}
}

function aliasMatches(value, aliases = []) {
  const normalized = normalizeKey(value)
  if (!normalized) return false
  return aliases.includes(normalized) || aliases.some((alias) => normalized.includes(alias))
}

function resolveBranchFromRules(value, rules, fallback) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  for (const [branchKey, rule] of Object.entries(rules)) {
    if (normalized === branchKey) return branchKey
    if (aliasMatches(normalized, rule.aliases || [])) return branchKey
  }
  return fallback
}

function getMaritalRegimeHint(form = {}, facts = {}) {
  return normalizeKey(
    form?.maritalRegime ||
      form?.marriageRegime ||
      facts?.seller?.marital_regime ||
      facts?.seller?.marital_status ||
      '',
  )
}

function mapSellerBranchToLegacySellerType(branch) {
  if (branch === 'multiple_owners') return 'multiple_individuals'
  if (branch === 'power_of_attorney') return 'other_legal_entity'
  if (branch === 'other') return 'other_legal_entity'
  if (branch === 'married') return 'individual'
  if (SELLER_ONBOARDING_BRANCHES.includes(branch)) return branch
  return 'individual'
}

function mapPropertyBranchToLegacyPropertyType(branch, category = '', structureType = '') {
  if (structureType && structureType !== 'other') return structureType
  if (branch === 'sectional_title') return 'sectional_title'
  if (branch === 'estate_hoa') return 'full_title'
  if (branch === 'commercial') return normalizePropertyCategory(category, { fallback: 'commercial' })
  if (branch === 'mixed_use') return 'mixed_use'
  if (branch === 'agricultural') return 'agricultural_holding'
  if (branch === 'vacant_land') return 'vacant_land'
  return normalizePropertyCategory(category, { fallback: 'residential' })
}

function normalizeOwnerEntityType(value, { fallback = '' } = {}) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  if (['company', 'pty', 'pty_ltd', 'corporate'].includes(normalized)) return 'company'
  if (['trust', 'family_trust'].includes(normalized)) return 'trust'
  if (['foreign', 'foreign_owner', 'foreign_individual', 'foreign_company', 'foreign_trust', 'non_resident'].includes(normalized)) return 'foreign'
  if (['other', 'other_legal_entity', 'legal_entity'].includes(normalized)) return 'other'
  if (
    [
      'natural_person',
      'individual',
      'single',
      'sole_owner',
      'married',
      'married_cop',
      'married_anc',
      'multiple_owners',
      'deceased_estate',
      'power_of_attorney',
      'poa',
    ].includes(normalized)
  ) {
    return 'natural_person'
  }
  return fallback
}

function normalizeOwnerStructureType(value, ownerEntityType = 'natural_person', { fallback = '' } = {}) {
  const normalized = normalizeKey(value)
  if (ownerEntityType === 'company') return normalized === 'foreign_company' ? 'foreign_company' : 'company'
  if (ownerEntityType === 'trust') return normalized === 'foreign_trust' ? 'foreign_trust' : 'trust'
  if (ownerEntityType === 'foreign') {
    if (['foreign_company', 'company'].includes(normalized)) return 'foreign_company'
    if (['foreign_trust', 'trust'].includes(normalized)) return 'foreign_trust'
    return 'foreign_individual'
  }
  if (ownerEntityType === 'other') return 'other'
  if (!normalized) return fallback || 'individual'
  if (['single', 'sole_owner', 'natural_person'].includes(normalized)) return 'individual'
  if (['poa', 'attorney'].includes(normalized)) return 'power_of_attorney'
  if (['deceased', 'estate'].includes(normalized)) return 'deceased_estate'
  if (['multiple', 'joint', 'multiple_individuals'].includes(normalized)) return 'multiple_owners'
  if (
    [
      'individual',
      'married',
      'married_cop',
      'married_anc',
      'multiple_owners',
      'deceased_estate',
      'power_of_attorney',
      'foreign_individual',
    ].includes(normalized)
  ) {
    return normalized
  }
  return fallback || 'individual'
}

function resolveSellerBranchFromOwnerFields(ownerEntityType = '', ownerStructureType = '') {
  if (ownerStructureType === 'foreign_company' || ownerStructureType === 'company' || ownerEntityType === 'company') return 'company'
  if (ownerStructureType === 'foreign_trust' || ownerStructureType === 'trust' || ownerEntityType === 'trust') return 'trust'
  if (ownerStructureType === 'multiple_owners') return 'multiple_owners'
  if (ownerStructureType === 'deceased_estate') return 'deceased_estate'
  if (ownerStructureType === 'power_of_attorney') return 'power_of_attorney'
  if (ownerStructureType === 'married_cop' || ownerStructureType === 'married_anc' || ownerStructureType === 'married') return 'married'
  if (ownerStructureType === 'other' || ownerEntityType === 'other') return 'other'
  if (ownerEntityType === 'foreign' || ownerStructureType === 'foreign_individual') return 'individual'
  if (ownerStructureType === 'individual') return 'individual'
  return ''
}

export function resolveSellerOwnershipModel(form = {}, listing = {}, facts = {}) {
  const source = normalizeFactsSource(form, listing, facts)
  const legacyOwnershipType = normalizeKey(
    form?.ownershipType ||
      form?.ownership_type ||
      listing?.ownershipType ||
      listing?.ownership_type ||
      source?.seller?.ownership_type ||
      source?.seller?.ownershipType ||
      '',
  )
  const directEntityType = normalizeOwnerEntityType(
    form?.ownerEntityType ||
      form?.owner_entity_type ||
      source?.seller?.owner_entity_type ||
      source?.seller?.ownerEntityType ||
      '',
  )
  const legacyBranch = resolveBranchFromRules(legacyOwnershipType, SELLER_BRANCH_RULES, '')
  const ownerEntityType =
    directEntityType ||
    normalizeOwnerEntityType(legacyOwnershipType) ||
    (legacyBranch === 'company' || legacyBranch === 'trust' ? legacyBranch : legacyBranch === 'other' ? 'other' : 'natural_person')
  const ownerStructureType = normalizeOwnerStructureType(
    form?.ownerStructureType ||
      form?.owner_structure_type ||
      source?.seller?.owner_structure_type ||
      source?.seller?.ownerStructureType ||
      legacyOwnershipType,
    ownerEntityType,
  )
  const branch = resolveSellerBranchFromOwnerFields(ownerEntityType, ownerStructureType) || legacyBranch || 'individual'

  return {
    entity_type: ownerEntityType,
    structure_type: ownerStructureType,
    branch,
    legacy_ownership_type: legacyOwnershipType || mapSellerBranchToLegacySellerType(branch),
    foreign_owner: ownerEntityType === 'foreign' || ownerStructureType.startsWith('foreign_'),
  }
}

function resolveSellerBranchFromOwnerModel(form = {}, source = {}) {
  const hasOwnerModel =
    hasOwnValue(form, 'ownerEntityType') ||
    hasOwnValue(form, 'owner_entity_type') ||
    hasOwnValue(form, 'ownerStructureType') ||
    hasOwnValue(form, 'owner_structure_type') ||
    hasOwnValue(source?.seller || {}, 'owner_entity_type') ||
    hasOwnValue(source?.seller || {}, 'ownerEntityType') ||
    hasOwnValue(source?.seller || {}, 'owner_structure_type') ||
    hasOwnValue(source?.seller || {}, 'ownerStructureType')
  if (!hasOwnerModel) return ''
  return resolveSellerOwnershipModel(form, {}, source).branch || ''
}

export function resolveSellerBranch(form = {}, listing = {}, facts = {}) {
  const source = normalizeFactsSource(form, listing, facts)
  const ownerModelBranch = resolveSellerBranchFromOwnerModel(form, source)
  if (ownerModelBranch) {
    return ownerModelBranch
  }
  const explicitOwnershipBranch = resolveBranchFromRules(form?.ownershipType, SELLER_BRANCH_RULES, '')
  if (explicitOwnershipBranch) {
    return explicitOwnershipBranch
  }

  const directCandidates = [
    source?.flow?.seller_branch,
    source?.seller?.branch,
    form?.sellerBranch,
    form?.sellerLegalType,
    form?.sellerType,
    listing?.sellerBranch,
    listing?.seller_type,
    listing?.ownershipType,
    listing?.ownership_structure,
    listing?.sellerType,
    source?.seller?.legal_type,
    source?.seller?.ownership_type,
    source?.seller?.marital_regime,
    source?.seller?.marital_status,
  ]

  for (const candidate of directCandidates) {
    const resolved = resolveBranchFromRules(candidate, SELLER_BRANCH_RULES, '')
    if (!resolved) continue
    if (resolved === 'individual') continue
    return resolved
  }

  const maritalHint = getMaritalRegimeHint(form, source)
  if (maritalHint.includes('married') || maritalHint === 'anc' || maritalHint === 'in_community' || maritalHint === 'out_of_community') {
    return 'married'
  }

  if (normalizeKey(form?.ownershipType).startsWith('married')) return 'married'
  if (normalizeKey(form?.maritalStatus) === 'married') return 'married'

  return 'individual'
}

export function resolveSellerPropertyModel(form = {}, listing = {}, facts = {}) {
  const source = normalizeFactsSource(form, listing, facts)
  const propertyCategoryCandidate =
    form?.propertyCategory ||
    listing?.propertyCategory ||
    listing?.property_category ||
    source?.property?.category ||
    source?.property?.property_category ||
    source?.property?.propertyType ||
    source?.property?.property_type
  const propertyCategory = normalizePropertyCategory(propertyCategoryCandidate, { fallback: '' })
  const explicitStructureType = normalizePropertyStructureType(form?.propertyStructureType, { fallback: '' })
  const fallbackStructureType = normalizePropertyStructureType(
    form?.canonicalPropertyType ||
      form?.propertyType ||
      listing?.propertyStructureType ||
      listing?.property_structure_type ||
      source?.property?.structure_type ||
      source?.property?.property_structure_type ||
      source?.property?.propertyType ||
      source?.property?.property_type,
    { fallback: 'other' },
  )
  const propertyStructureType = normalizeSellerStructureType(explicitStructureType || fallbackStructureType, { fallback: 'other' })
  const legacyEstateStructure = explicitStructureType === 'estate' || fallbackStructureType === 'estate'
  const estateName = normalizeText(
    form?.estateName ||
      form?.estateComplexName ||
      listing?.estateName ||
      listing?.estateComplexName ||
      source?.property?.estate_name ||
      source?.property?.estateName ||
      source?.property?.estate_complex_name,
  )
  const explicitEstateAnswer = hasOwnValue(form, 'estateOrHoa')
  const estateOrHoa = explicitEstateAnswer
    ? normalizeBoolean(form?.estateOrHoa)
    : Boolean(
        legacyEstateStructure ||
          normalizeBoolean(source?.property?.estate_or_hoa) ||
          normalizeBoolean(source?.property?.hoa) ||
          estateName,
      )
  const legacySectionalSignal = !explicitStructureType && Boolean(form?.sectionalTitle || form?.shareBlock)

  let branch = 'residential'
  if (propertyCategory === 'mixed_use') {
    branch = 'mixed_use'
  } else if (propertyCategory === 'commercial' || propertyCategory === 'industrial' || propertyCategory === 'retail') {
    branch = 'commercial'
  } else if (propertyCategory === 'agricultural') {
    branch = 'agricultural'
  } else if (propertyCategory === 'vacant_land') {
    branch = 'vacant_land'
  } else if (['sectional_title', 'share_block'].includes(propertyStructureType) || legacySectionalSignal) {
    branch = 'sectional_title'
  } else if (estateOrHoa) {
    branch = 'estate_hoa'
  } else if (propertyStructureType === 'agricultural_holding') {
    branch = 'agricultural'
  }

  return {
    branch,
    category: propertyCategory || 'residential',
    structure_type: propertyStructureType,
    estate_or_hoa: estateOrHoa,
    legacy_property_type: mapPropertyBranchToLegacyPropertyType(branch, propertyCategory, propertyStructureType),
  }
}

export function resolvePropertyBranch(form = {}, listing = {}, facts = {}) {
  return resolveSellerPropertyModel(form, listing, facts).branch
}

function resolveBranchContract(branchType, branchKey, baseRules) {
  const branchDefinition = branchType[branchKey] || branchType.individual || {}
  return {
    key: branchKey,
    label: branchDefinition.label || branchKey,
    aliases: branchDefinition.aliases || [],
    sellerFacingQuestions: mergeUnique(baseRules.sellerFacingQuestions, branchDefinition.sellerFacingQuestions),
    requiredFields: mergeUnique(baseRules.requiredFields, branchDefinition.requiredFields),
    optionalFields: mergeUnique(baseRules.optionalFields, branchDefinition.optionalFields),
    internalDerivedFacts: mergeUnique(baseRules.internalDerivedFacts, branchDefinition.internalDerivedFacts),
    documentTriggers: mergeUnique(baseRules.documentTriggers, branchDefinition.documentTriggers),
  }
}

function collectDynamicTriggers(form = {}, source = {}) {
  const triggers = []
  const seller = form?.seller || source?.seller || {}
  const compliance = form?.compliance || source?.compliance || {}
  const property = form?.property || source?.property || {}
  const occupancy = form?.occupancy || source?.occupancy || {}
  const finance = form?.finance || source?.finance || {}
  const disclosureResponses = form?.propertyDisclosure?.responses || form?.property_disclosure?.responses || source?.property_disclosure?.responses || {}
  const disclosureAnswer = (key) => normalizeKey(disclosureResponses?.[key]?.answer || disclosureResponses?.[key] || '')
  const hasBond = normalizeBoolean(
    form?.existingBond ??
      form?.sellerHasExistingBond ??
      finance?.existing_bond ??
      source?.finance?.existing_bond ??
      false,
  )
  const tenantOccupied = normalizeBoolean(
    form?.leaseExists ||
      form?.tenantOccupied ||
      occupancy?.tenant_occupied ||
      source?.occupancy?.tenant_occupied ||
      false,
  ) || normalizeKey(occupancy?.status) === 'tenant_occupied'
  const municipality = normalizeKey(
    form?.municipality ||
      form?.propertyMunicipality ||
      property?.municipality ||
      property?.address_details?.municipality ||
      source?.property?.municipality ||
      source?.property?.address_details?.municipality ||
      '',
  )
  const residencyStatus = normalizeKey(
    form?.foreignResidencyStatus ||
      form?.residencyStatus ||
      seller?.foreign?.residency_status ||
      seller?.residency_status ||
      source?.seller?.foreign?.residency_status ||
      '',
  )
  const maritalRegime = normalizeKey(
    form?.maritalRegime || form?.marriageRegime || seller?.marital_regime || source?.seller?.marital_regime || '',
  )

  if (hasBond) triggers.push('bond_statement')
  if (hasBond) triggers.push('bond_bank_details')
  if (hasBond) triggers.push('settlement_figure')
  if (tenantOccupied) {
    triggers.push('lease_agreement', 'tenant_details', 'rental_schedule', 'deposit_details', 'notice_period_details')
  }

  if (['city_of_cape_town', 'cape_town', 'city_cape_town'].includes(municipality)) {
    triggers.push('water_installation_certificate')
  }
  if (
    normalizeBoolean(
      form?.beetleCertificateRegion ||
        compliance?.beetle_certificate_region ||
        source?.compliance?.beetle_certificate_region ||
        false,
    )
  ) {
    triggers.push('beetle_certificate')
  }
  if (['foreign_marriage', 'foreign'].includes(maritalRegime)) {
    triggers.push('foreign_marriage_documents')
  }
  if (['non_resident', 'nonresident', 'foreign_non_resident'].includes(residencyStatus)) {
    triggers.push('seller_tax_residency_declaration', 'non_resident_tax_documents')
  }
  if (normalizeBoolean(form?.vatRegistered ?? seller?.vat_registered ?? source?.seller?.vat_registered, false)) {
    triggers.push('vat_registration_certificate')
  }
  if (
    normalizeBoolean(
      form?.goingConcernSale ?? form?.saleAsGoingConcern ?? source?.transaction?.going_concern ?? false,
      false,
    )
  ) {
    triggers.push('going_concern_supporting_documents')
  }

  if (
    normalizeBoolean(
      form?.gasInstallation ||
        form?.gasGeyser ||
        compliance?.gas_installation ||
        compliance?.gas_geyser ||
        source?.compliance?.gas_installation ||
        false,
    )
  ) {
    triggers.push('gas_compliance_certificate')
  }
  if (
    normalizeBoolean(
      form?.solarInstallation ||
        compliance?.solar_installation ||
        source?.compliance?.solar_installation ||
        false,
    )
  ) {
    triggers.push('solar_compliance_documents')
  }
  if (
    normalizeBoolean(
      form?.electricFence ||
        compliance?.electric_fence ||
        source?.compliance?.electric_fence ||
        false,
    )
  ) {
    triggers.push('electric_fence_certificate')
  }
  if (
    normalizeBoolean(
      form?.plumbingCertificateRequired ||
        compliance?.plumbing_certificate_required ||
        source?.compliance?.plumbing_certificate_required ||
        false,
    )
  ) {
    triggers.push('plumbing_certificate')
  }
  if (
    normalizeBoolean(
      form?.boreholeInstallation ||
        form?.borehole ||
        compliance?.borehole_installation ||
        compliance?.borehole ||
        property?.borehole ||
        source?.property?.borehole ||
        source?.compliance?.borehole_installation ||
        false,
    )
  ) {
    triggers.push('borehole_certificate')
  }
  if (
    normalizeBoolean(
      form?.recentAlterations ||
        property?.alterations?.recent ||
        source?.property?.alterations?.recent ||
        ['no', 'unsure'].includes(disclosureAnswer('improvements_on_plans')) ||
        ['no', 'unsure'].includes(disclosureAnswer('approved_plans_possession')) ||
        false,
    )
  ) {
    triggers.push('alteration_approvals', 'approved_building_plans', 'occupation_certificate')
  }

  return triggers
}

export function resolveSellerOnboardingFlowContract(form = {}, listing = {}, facts = {}) {
  const source = normalizeFactsSource(form, listing, facts)
  const ownershipModel = resolveSellerOwnershipModel(form, listing, source)
  const propertyModel = resolveSellerPropertyModel(form, listing, source)
  const sellerBranch = resolveSellerBranch(form, listing, source)
  const propertyBranch = resolvePropertyBranch(form, listing, source)
  const resolvedOwnershipModel = {
    ...ownershipModel,
    branch: sellerBranch,
    legacy_ownership_type: ownershipModel.legacy_ownership_type || mapSellerBranchToLegacySellerType(sellerBranch),
  }
  const resolvedPropertyModel = {
    ...propertyModel,
    branch: propertyBranch,
    legacy_property_type: propertyModel.legacy_property_type || mapPropertyBranchToLegacyPropertyType(propertyBranch, propertyModel.category, propertyModel.structure_type),
  }
  const sellerDefinition = resolveBranchContract(SELLER_BRANCH_RULES, sellerBranch, CORE_SELLER_RULES)
  const propertyDefinition = resolveBranchContract(PROPERTY_BRANCH_RULES, propertyBranch, CORE_PROPERTY_RULES)
  const propertyCategory = propertyModel.category
  const propertyStructureType = propertyModel.structure_type
  const estateOverlayDefinition = propertyModel.estate_or_hoa && propertyBranch !== 'estate_hoa'
    ? PROPERTY_BRANCH_RULES.estate_hoa
    : null
  const dynamicTriggers = collectDynamicTriggers(form, source)
  const sellerFacingQuestions = migrateSellerOnboardingFieldListToV2(mergeUnique(
    CORE_SELLER_RULES.sellerFacingQuestions,
    sellerDefinition.sellerFacingQuestions,
    CORE_PROPERTY_RULES.sellerFacingQuestions,
    propertyDefinition.sellerFacingQuestions,
    estateOverlayDefinition?.sellerFacingQuestions,
  ))
  const requiredFields = migrateSellerOnboardingFieldListToV2(mergeUnique(
    CORE_SELLER_RULES.requiredFields,
    sellerDefinition.requiredFields,
    CORE_PROPERTY_RULES.requiredFields,
    propertyDefinition.requiredFields,
    estateOverlayDefinition?.requiredFields,
  ))
  const optionalFields = migrateSellerOnboardingFieldListToV2(mergeUnique(
    CORE_SELLER_RULES.optionalFields,
    sellerDefinition.optionalFields,
    CORE_PROPERTY_RULES.optionalFields,
    propertyDefinition.optionalFields,
    estateOverlayDefinition?.optionalFields,
  ))
  const internalDerivedFacts = mergeUnique(
    CORE_SELLER_RULES.internalDerivedFacts,
    sellerDefinition.internalDerivedFacts,
    CORE_PROPERTY_RULES.internalDerivedFacts,
    propertyDefinition.internalDerivedFacts,
    estateOverlayDefinition?.internalDerivedFacts,
    'flow.version',
    'flow.seller_branch',
    'flow.property_branch',
  )
  const documentTriggers = mergeUnique(
    CORE_SELLER_RULES.documentTriggers,
    sellerDefinition.documentTriggers,
    CORE_PROPERTY_RULES.documentTriggers,
    propertyDefinition.documentTriggers,
    estateOverlayDefinition?.documentTriggers,
    dynamicTriggers,
  )

  return {
    version: SELLER_ONBOARDING_FLOW_VERSION,
    seller_branch: sellerBranch,
    seller_branch_label: sellerDefinition.label,
    seller_legacy_type: mapSellerBranchToLegacySellerType(sellerBranch),
    seller_owner_entity_type: resolvedOwnershipModel.entity_type,
    seller_owner_structure_type: resolvedOwnershipModel.structure_type,
    property_branch: propertyBranch,
    property_branch_label: propertyDefinition.label,
    property_legacy_type: resolvedPropertyModel.legacy_property_type,
    property_category: propertyCategory,
    property_structure_type: propertyStructureType,
    seller_facing_questions: sellerFacingQuestions,
    required_fields: requiredFields,
    optional_fields: optionalFields,
    internal_derived_facts: internalDerivedFacts,
    document_triggers: documentTriggers,
    field_aliases: SELLER_ONBOARDING_FIELD_ALIASES,
    ownership_model: resolvedOwnershipModel,
    property_model: resolvedPropertyModel,
    seller: sellerDefinition,
    property: propertyDefinition,
  }
}
