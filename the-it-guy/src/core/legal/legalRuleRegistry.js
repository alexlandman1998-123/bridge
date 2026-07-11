export const LEGAL_RULE_REGISTRY_VERSION = 'legal_rule_registry_v1'

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

function freezeRegistry(values) {
  return Object.freeze([...values])
}

function createAliasMap(definitions = {}) {
  const entries = []
  for (const [canonical, aliases] of Object.entries(definitions)) {
    entries.push([normalizeKey(canonical), canonical])
    for (const alias of aliases || []) {
      entries.push([normalizeKey(alias), canonical])
    }
  }
  return Object.freeze(Object.fromEntries(entries.filter(([key]) => key)))
}

export const LEGAL_BUYER_TYPES = freezeRegistry([
  'individual',
  'married_coc',
  'married_anc',
  'married_anc_accrual',
  'company',
  'trust',
  'foreign_purchaser',
  'other',
])

export const LEGAL_SELLER_TYPES = freezeRegistry([
  'individual',
  'married',
  'company',
  'trust',
  'deceased_estate',
  'power_of_attorney',
  'multiple_owners',
  'other',
])

export const LEGAL_FINANCE_TYPES = freezeRegistry([
  'cash',
  'bond',
  'hybrid',
  'developer',
  'unknown',
])

export const LEGAL_PROPERTY_TYPES = freezeRegistry([
  'residential',
  'sectional_title',
  'estate_hoa',
  'commercial',
  'mixed_use',
  'agricultural',
  'vacant_land',
])

export const LEGAL_OWNERSHIP_STRUCTURES = freezeRegistry([
  'individual',
  'married',
  'married_cop',
  'married_anc',
  'multiple_owners',
  'company',
  'trust',
  'deceased_estate',
  'power_of_attorney',
  'foreign_individual',
  'foreign_company',
  'foreign_trust',
  'other',
])

export const LEGAL_TRANSACTION_TYPES = freezeRegistry([
  'private_sale',
  'resale',
  'development_sale',
  'commercial',
  'unknown',
])

export const BUYER_TYPE_ALIASES = createAliasMap({
  individual: ['single', 'sole_buyer', 'sole_purchaser', 'natural_person', 'person', 'private_individual'],
  married_coc: ['married', 'married_cop', 'married_in_community', 'married_in_community_of_property', 'coc'],
  married_anc: ['anc', 'married_out_of_community', 'married_out_of_community_of_property'],
  married_anc_accrual: ['anc_with_accrual', 'married_out_of_community_with_accrual'],
  company: ['business', 'corporate', 'pty', 'pty_ltd'],
  trust: ['family_trust'],
  foreign_purchaser: ['foreign', 'foreign_individual', 'foreign_buyer', 'non_resident', 'non-resident'],
  other: ['other_legal_entity', 'legal_entity'],
})

export const SELLER_TYPE_ALIASES = createAliasMap({
  individual: ['single', 'sole_owner', 'natural_person', 'person', 'private_individual'],
  married: ['married_cop', 'married_anc', 'married_in_community', 'married_out_of_community', 'anc'],
  company: ['business', 'corporate', 'pty', 'pty_ltd'],
  trust: ['family_trust'],
  deceased_estate: ['deceased', 'estate', 'estate_late'],
  power_of_attorney: ['poa', 'attorney'],
  multiple_owners: ['multiple_individuals', 'multiple', 'joint', 'joint_owners'],
  other: ['other_legal_entity', 'legal_entity'],
})

export const FINANCE_TYPE_ALIASES = createAliasMap({
  cash: ['cash_sale', 'cash_deal', 'proof_of_funds'],
  bond: ['bonded', 'bond_finance', 'mortgage', 'home_loan'],
  hybrid: ['combination', 'cash_and_bond', 'partial_bond', 'cash_bond', 'bond_cash', 'cash+bond'],
  developer: ['developer_finance', 'developer finance'],
  unknown: ['unclear', 'not_set'],
})

export const PROPERTY_TYPE_ALIASES = createAliasMap({
  residential: ['house', 'apartment', 'townhouse', 'cluster', 'duplex', 'penthouse', 'freehold', 'full_title'],
  sectional_title: ['sectional', 'sectional', 'sectional_scheme', 'body_corporate'],
  estate_hoa: ['estate', 'hoa', 'estate_or_hoa'],
  commercial: ['office', 'office_building', 'industrial', 'retail', 'warehouse', 'commercial_property'],
  mixed_use: ['mixed', 'mixed_use_building', 'mixed_use_estate'],
  agricultural: ['farm', 'smallholding', 'agricultural_holding', 'agricultural_land'],
  vacant_land: ['vacant', 'vacant_stand', 'stand', 'land'],
})

export const OWNERSHIP_STRUCTURE_ALIASES = createAliasMap({
  individual: ['single', 'sole_owner', 'natural_person'],
  married: ['married_cop', 'married_anc', 'married_in_community', 'married_out_of_community'],
  married_cop: ['married_in_community', 'married_in_community_of_property'],
  married_anc: ['anc', 'married_out_of_community', 'married_out_of_community_of_property'],
  multiple_owners: ['multiple_individuals', 'multiple', 'joint', 'joint_owners'],
  company: ['business', 'corporate', 'pty', 'pty_ltd'],
  trust: ['family_trust'],
  deceased_estate: ['deceased', 'estate', 'estate_late'],
  power_of_attorney: ['poa', 'attorney'],
  foreign_individual: ['foreign', 'foreign_owner', 'foreign_natural_person', 'non_resident'],
  foreign_company: ['foreign_corporate'],
  foreign_trust: ['offshore_trust'],
  other: ['other_legal_entity', 'legal_entity'],
})

export const TRANSACTION_TYPE_ALIASES = createAliasMap({
  private_sale: ['private', 'private_property', 'seller_owned', 'sale'],
  resale: ['resale_sale'],
  development_sale: ['development', 'new_development', 'off_plan', 'developer_sale'],
  commercial: ['commercial_sale', 'commercial_transaction'],
  unknown: ['unclear', 'not_set'],
})

export function normalizeBuyerType(value, { fallback = 'individual' } = {}) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  return BUYER_TYPE_ALIASES[normalized] || fallback
}

export function normalizeSellerType(value, { fallback = 'individual' } = {}) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  return SELLER_TYPE_ALIASES[normalized] || fallback
}

export function normalizeFinanceTypeForLegalRules(value, { fallback = 'cash', allowUnknown = false } = {}) {
  const normalized = normalizeKey(value)
  if (!normalized) return allowUnknown ? 'unknown' : fallback
  const resolved = FINANCE_TYPE_ALIASES[normalized]
  if (resolved) return resolved
  if (normalized.includes('cash') && (normalized.includes('bond') || normalized.includes('mortgage'))) return 'hybrid'
  if (normalized.includes('bond') || normalized.includes('mortgage')) return 'bond'
  if (normalized.includes('cash')) return 'cash'
  if (normalized.includes('developer')) return 'developer'
  return allowUnknown ? 'unknown' : fallback
}

export function normalizePropertyType(value, { fallback = 'residential' } = {}) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  return PROPERTY_TYPE_ALIASES[normalized] || fallback
}

export function normalizeOwnershipStructure(value, { fallback = 'individual' } = {}) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  return OWNERSHIP_STRUCTURE_ALIASES[normalized] || fallback
}

export function normalizeTransactionType(value, { fallback = 'unknown' } = {}) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  return TRANSACTION_TYPE_ALIASES[normalized] || fallback
}

export function isMultipleOwnerSellerType(value) {
  return normalizeSellerType(value, { fallback: '' }) === 'multiple_owners'
}

export function isCanonicalLegalValue(registry = [], value = '') {
  return registry.includes(normalizeKey(value))
}
