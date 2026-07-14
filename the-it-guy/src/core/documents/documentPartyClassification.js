function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s./-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function resolveSource(input = {}) {
  const source = asRecord(input)
  return {
    placeholders: asRecord(source.placeholders) || {},
    root: source,
    context: asRecord(source.context || source.sourceContext),
  }
}

function getPathValue(source = {}, path = '') {
  const object = asRecord(source)
  const key = normalizeText(path)
  if (!key) return undefined
  if (Object.prototype.hasOwnProperty.call(object, key)) return object[key]
  if (!key.includes('.')) return undefined
  return key.split('.').reduce((current, part) => (
    current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)
      ? current[part]
      : undefined
  ), object)
}

function firstValue(input = {}, paths = []) {
  const { placeholders, root, context } = resolveSource(input)
  const sourceList = [placeholders, root, context]
  for (const path of paths) {
    for (const source of sourceList) {
      const value = getPathValue(source, path)
      if (value !== null && value !== undefined && normalizeText(value) !== '') return value
    }
  }
  return ''
}

function normalizeBooleanSignal(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  if (!normalized) return null
  if (['true', 'yes', 'y', '1', 'required', 'consent_required'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'not_required', 'not_applicable', 'n_a', 'na'].includes(normalized)) return false
  return null
}

export function normalizeDocumentPartyEntityType(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return 'individual'
  if (['company', 'pty_ltd', 'proprietary_limited', 'private_company', 'public_company', 'close_corporation', 'cc'].includes(normalized)) {
    return normalized === 'close_corporation' || normalized === 'cc' ? 'close_corporation' : 'company'
  }
  if (normalized.includes('company') || normalized.includes('proprietary') || normalized.includes('pty')) return 'company'
  if (normalized.includes('close_corporation')) return 'close_corporation'
  if (normalized === 'trust' || normalized.includes('trust')) return 'trust'
  if (['individual', 'natural_person', 'person', 'sole_owner', 'private_individual'].includes(normalized)) return 'individual'
  return normalized
}

export function normalizeDocumentMaritalRegime(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return ''
  if (/(^|_)(single|unmarried|divorced|widowed|not_married|never_married)(_|$)/.test(normalized)) return 'single'
  if (
    normalized === 'married_anc' ||
    normalized === 'anc' ||
    normalized.includes('antenuptial') ||
    normalized.includes('out_of_community')
  ) {
    return 'out_of_community'
  }
  if (
    normalized === 'married_cop' ||
    normalized === 'cop' ||
    normalized.includes('in_community') ||
    normalized.includes('community_of_property') ||
    normalized.includes('community_property')
  ) {
    return 'in_community'
  }
  if (normalized.includes('married')) return 'married'
  return normalized
}

function partyFieldPaths(role = 'seller', field = '') {
  const normalizedRole = normalizeKey(role) === 'buyer' ? 'buyer' : 'seller'
  const roleAlias = normalizedRole === 'buyer' ? 'purchaser' : 'seller'
  const camelRole = normalizedRole === 'buyer' ? 'buyer' : 'seller'
  const camelField = field.replace(/_([a-z])/g, (_, character) => character.toUpperCase())
  const rawField = `${field}_raw`
  return [
    `${normalizedRole}_${field}`,
    `${normalizedRole}_${rawField}`,
    `${normalizedRole}.${field}`,
    `${normalizedRole}.${rawField}`,
    `${camelRole}${camelField.charAt(0).toUpperCase()}${camelField.slice(1)}`,
    `${roleAlias}_${field}`,
    `${roleAlias}.${field}`,
    `${normalizedRole}.${camelField}`,
    `${normalizedRole}.canonicalFacts.${field}`,
    `canonicalFacts.${normalizedRole}.${field}`,
  ]
}

export function resolveDocumentPartyEntityType(input = {}, role = 'seller') {
  return normalizeDocumentPartyEntityType(firstValue(input, partyFieldPaths(role, 'entity_type')))
}

export function resolveDocumentPartyMaritalRegime(input = {}, role = 'seller') {
  return normalizeDocumentMaritalRegime(firstValue(input, [
    ...partyFieldPaths(role, 'marital_regime'),
    ...partyFieldPaths(role, 'marital_status'),
    ...partyFieldPaths(role, 'ownership_type'),
    ...partyFieldPaths(role, 'ownership_structure'),
    'maritalRegime',
    'marriageRegime',
    'ownershipType',
    'ownership_structure',
  ]))
}

export function resolveDocumentPartySpouseConsentRequired(input = {}, role = 'seller') {
  const explicit = firstValue(input, [
    ...partyFieldPaths(role, 'spouse_consent_required'),
    `${role}SpouseConsentRequired`,
    'spouseConsentRequired',
    'spouse_consent_required',
  ])
  const explicitBoolean = normalizeBooleanSignal(explicit)
  if (explicitBoolean !== null) return explicitBoolean
  return resolveDocumentPartyMaritalRegime(input, role) === 'in_community'
}

export function classifyDocumentParty(input = {}, role = 'seller') {
  const entityType = resolveDocumentPartyEntityType(input, role)
  const maritalRegime = resolveDocumentPartyMaritalRegime(input, role)
  const isCompany = entityType === 'company' || entityType === 'close_corporation'
  const isTrust = entityType === 'trust'
  const isIndividual = entityType === 'individual'
  return {
    role: normalizeKey(role) === 'buyer' ? 'buyer' : 'seller',
    entityType,
    maritalRegime,
    isCompany,
    isTrust,
    isIndividual,
    isLegalEntity: isCompany || isTrust,
    isMarriedInCommunity: resolveDocumentPartySpouseConsentRequired(input, role),
  }
}

export function classifySellerParty(input = {}) {
  return classifyDocumentParty(input, 'seller')
}

export function classifyBuyerParty(input = {}) {
  return classifyDocumentParty(input, 'buyer')
}

export function isCompanySeller(input = {}) {
  return classifySellerParty(input).isCompany
}

export function isTrustSeller(input = {}) {
  return classifySellerParty(input).isTrust
}

export function isIndividualSeller(input = {}) {
  return classifySellerParty(input).isIndividual
}

export function isLegalEntitySeller(input = {}) {
  return classifySellerParty(input).isLegalEntity
}

export function isMarriedInCommunitySeller(input = {}) {
  return classifySellerParty(input).isMarriedInCommunity
}

export function isCompanyBuyer(input = {}) {
  return classifyBuyerParty(input).isCompany
}

export function isTrustBuyer(input = {}) {
  return classifyBuyerParty(input).isTrust
}

export function isIndividualBuyer(input = {}) {
  return classifyBuyerParty(input).isIndividual
}

export function isLegalEntityBuyer(input = {}) {
  return classifyBuyerParty(input).isLegalEntity
}

export function isMarriedInCommunityBuyer(input = {}) {
  return classifyBuyerParty(input).isMarriedInCommunity
}

export function normalizeDealFinanceType(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return 'cash'
  if (['bond', 'mortgage', 'home_loan', 'loan'].includes(normalized)) return 'bond'
  if (['combination', 'hybrid', 'cash_and_bond', 'bond_and_cash', 'part_cash_part_bond'].includes(normalized)) return 'combination'
  if (['cash', 'cash_sale', 'cash_buyer', 'cash_only'].includes(normalized)) return 'cash'
  return normalized
}

export function resolveDealFinanceType(input = {}) {
  return normalizeDealFinanceType(firstValue(input, [
    'finance_type',
    'transaction.finance_type_raw',
    'transaction.finance_type',
    'financeType',
    'deal.finance_type',
    'offer.finance_type',
  ]))
}

export function classifyDealFinance(input = {}) {
  const financeType = resolveDealFinanceType(input)
  const isBond = ['bond', 'combination'].includes(financeType)
  const isCash = financeType === 'cash'
  return {
    financeType,
    isBond,
    isCash,
    isHybrid: financeType === 'combination',
    hasCashComponent: isCash || financeType === 'combination',
  }
}

export function isBondSale(input = {}) {
  return classifyDealFinance(input).isBond
}

export function isCashSale(input = {}) {
  return classifyDealFinance(input).isCash
}
