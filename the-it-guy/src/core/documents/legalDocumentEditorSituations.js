import { getConditionalMasterPackDefinitions } from './conditionalMasterTemplateDefinitions.js'

const PACK_EDITOR_DETAILS = Object.freeze({
  seller_individual_capacity_pack: { label: 'Individual seller', description: 'Natural-person capacity and marital-status wording.', groupKey: 'seller', groupLabel: 'Seller', iconKey: 'individual' },
  seller_company_authority_pack: { label: 'Company or CC seller', description: 'Representative, resolution and authority wording.', groupKey: 'seller', groupLabel: 'Seller', iconKey: 'company' },
  seller_trust_authority_pack: { label: 'Trust seller', description: 'Trust registration, trustees and authority wording.', groupKey: 'seller', groupLabel: 'Seller', iconKey: 'trust' },
  seller_spouse_consent_pack: { label: 'Seller spouse consent', description: 'Consent wording when the seller must sign with a spouse.', groupKey: 'seller_consent', groupLabel: 'Seller consent', iconKey: 'consent' },
  buyer_individual_capacity_pack: { label: 'Individual purchaser', description: 'Natural-person capacity and marital-status wording.', groupKey: 'buyer', groupLabel: 'Purchaser', iconKey: 'individual' },
  buyer_company_authority_pack: { label: 'Company or CC purchaser', description: 'Representative, resolution and authority wording.', groupKey: 'buyer', groupLabel: 'Purchaser', iconKey: 'company' },
  buyer_trust_authority_pack: { label: 'Trust purchaser', description: 'Trust registration, trustees and authority wording.', groupKey: 'buyer', groupLabel: 'Purchaser', iconKey: 'trust' },
  buyer_spouse_consent_pack: { label: 'Purchaser spouse consent', description: 'Consent wording when the purchaser must sign with a spouse.', groupKey: 'buyer_consent', groupLabel: 'Purchaser consent', iconKey: 'consent' },
  property_full_title_pack: { label: 'Full-title property', description: 'Erf, extent, estate and HOA wording.', groupKey: 'property', groupLabel: 'Property title', iconKey: 'property' },
  property_sectional_title_pack: { label: 'Sectional-title property', description: 'Unit, section, scheme and body-corporate wording.', groupKey: 'property', groupLabel: 'Property title', iconKey: 'sectional' },
  bond_finance_pack: { label: 'Bond finance', description: 'Bond approval, amount and suspensive-condition wording.', groupKey: 'finance', groupLabel: 'Payment and finance', iconKey: 'finance' },
  cash_sale_pack: { label: 'Cash sale', description: 'Cash payment and proof-of-funds wording.', groupKey: 'finance', groupLabel: 'Payment and finance', iconKey: 'cash' },
  cash_contribution_pack: { label: 'Combination cash contribution', description: 'The cash portion used alongside bond finance.', groupKey: 'finance', groupLabel: 'Payment and finance', iconKey: 'combination' },
})

const LEGACY_SELECTIONS = Object.freeze({
  individual: { label: 'Individual', match: /_individual_capacity_pack$/ },
  company: { label: 'Company', match: /_company_authority_pack$/ },
  trust: { label: 'Trust', match: /_trust_authority_pack$/ },
  married_in_community: { label: 'Spouse consent', match: /_spouse_consent_pack$/ },
  sectional_title: { label: 'Sectional title', match: /^property_sectional_title_pack$/ },
  finance: { label: 'Finance', match: /^(bond_finance|cash_sale|cash_contribution)_pack$/ },
})

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s./-]+/g, '_')
}

function getSectionKey(section = {}) {
  return normalizeKey(section.sectionKey || section.section_key)
}

function describeActivation(conditionJson = {}) {
  const rule = conditionJson.rule && typeof conditionJson.rule === 'object' ? conditionJson.rule : conditionJson
  const field = normalizeKey(rule.field)
  const values = Array.isArray(rule.value) ? rule.value : [rule.value]
  const readableValues = values.filter(Boolean).map((value) => String(value).replace(/_/g, ' ')).join(' or ')
  const fieldLabels = {
    seller_entity_type: 'seller type',
    buyer_entity_type: 'purchaser type',
    seller_spouse_consent_required: 'seller spouse consent',
    buyer_spouse_consent_required: 'purchaser spouse consent',
    property_title_type: 'property title',
    finance_type: 'finance type',
  }
  return `${fieldLabels[field] || field.replace(/_/g, ' ')} is ${readableValues}`
}

export function listLegalDocumentEditorSituations({ packetType = '' } = {}) {
  return getConditionalMasterPackDefinitions(packetType).map((pack) => {
    const details = PACK_EDITOR_DETAILS[pack.key] || {}
    return {
      key: pack.key,
      sectionKeys: [pack.key],
      label: details.label || pack.label,
      description: details.description || 'Conditional legal wording.',
      groupKey: details.groupKey || 'other',
      groupLabel: details.groupLabel || 'Other conditional wording',
      iconKey: details.iconKey || 'conditional',
      activationLabel: describeActivation(pack.conditionJson),
      locked: pack.lockedCondition === true,
    }
  })
}

export function listLegalDocumentEditorSituationGroups({ packetType = '' } = {}) {
  return listLegalDocumentEditorSituations({ packetType }).reduce((groups, item) => {
    const current = groups.find((group) => group.key === item.groupKey)
    if (current) current.items.push(item)
    else groups.push({ key: item.groupKey, label: item.groupLabel, items: [item] })
    return groups
  }, [])
}

export function getLegalDocumentEditorSituation(value = '', { packetType = '' } = {}) {
  const key = normalizeKey(value)
  const exact = listLegalDocumentEditorSituations({ packetType }).find((situation) => situation.key === key)
  if (exact) return exact
  const legacy = LEGACY_SELECTIONS[key]
  if (!legacy) return null
  const sectionKeys = getConditionalMasterPackDefinitions(packetType || 'otp')
    .map((pack) => pack.key)
    .filter((packKey) => legacy.match.test(packKey))
  return { key, label: legacy.label, description: 'Legacy conditional-section link.', sectionKeys, legacy: true }
}

export function sectionMatchesLegalDocumentEditorSituation(section = {}, situationKey = '', { packetType = '' } = {}) {
  const situation = getLegalDocumentEditorSituation(situationKey, { packetType })
  return Boolean(situation?.sectionKeys?.includes(getSectionKey(section)))
}
