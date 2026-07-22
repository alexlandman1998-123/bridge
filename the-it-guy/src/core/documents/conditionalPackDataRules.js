import {
  classifyBuyerParty,
  classifyDealFinance,
  classifySellerParty,
  normalizeDealFinanceType,
  normalizeDocumentMaritalRegime,
  normalizeDocumentPartyEntityType,
} from './documentPartyClassification.js'

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

function mergeUnique(...groups) {
  const seen = new Set()
  const merged = []
  for (const item of groups.flat()) {
    const value = normalizeText(item)
    if (!value || seen.has(value)) continue
    seen.add(value)
    merged.push(value)
  }
  return merged
}

function readPath(source = {}, path = '') {
  const parts = String(path || '').split('.').filter(Boolean)
  let current = source
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

function firstValue(sources = [], paths = []) {
  for (const path of paths) {
    for (const source of sources) {
      const value = readPath(source, path)
      if (value !== null && value !== undefined && normalizeText(value) !== '') return value
    }
  }
  return ''
}

function compactObject(source = {}) {
  return Object.entries(source).reduce((acc, [key, value]) => {
    if (value !== null && value !== undefined && normalizeText(value) !== '') {
      acc[key] = value
    }
    return acc
  }, {})
}

function normalizePartyEntitySignal(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return ''
  if (
    [
      'individual',
      'single',
      'married',
      'married_coc',
      'married_cop',
      'married_anc',
      'married_anc_accrual',
      'married_in_community',
      'married_in_community_of_property',
      'married_out_of_community',
      'married_out_of_community_of_property',
      'natural_person',
      'person',
      'private_individual',
    ].includes(normalized)
  ) {
    return 'individual'
  }
  return normalizeDocumentPartyEntityType(value)
}

function normalizeFinanceSignal(value = '') {
  if (!normalizeText(value)) return ''
  const normalized = normalizeKey(value)
  if (normalized === 'hybrid') return 'combination'
  return normalizeDealFinanceType(value)
}

function normalizeYesNo(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const normalized = normalizeKey(value)
  if (['yes', 'true', '1', 'y', 'required', 'consent_required'].includes(normalized)) return 'Yes'
  if (['no', 'false', '0', 'n', 'not_required', 'not_applicable', 'na', 'n_a'].includes(normalized)) return 'No'
  return ''
}

function deriveSpouseConsentSignal(role = 'seller', sources = []) {
  const explicit = firstValue(sources, [
    `${role}_spouse_consent_required`,
    `${role}.spouse_consent_required`,
    `${role}.spouseConsentRequired`,
    `${role}SpouseConsentRequired`,
    'spouse_consent_required',
    'spouseConsentRequired',
  ])
  const normalizedExplicit = normalizeYesNo(explicit)
  if (normalizedExplicit) return normalizedExplicit

  const branch = normalizeKey(firstValue(sources, [
    `${role}_branch`,
    `${role}Branch`,
    role === 'buyer' ? 'buyer_branch' : 'seller_branch',
    role === 'buyer' ? 'purchaser_branch' : 'seller_branch',
    role === 'buyer' ? 'purchaser_type' : 'ownershipType',
    role === 'buyer' ? 'purchaserType' : 'sellerType',
  ]))

  if (role === 'buyer' && branch === 'married_coc') return 'Yes'

  const maritalRegime = normalizeDocumentMaritalRegime(firstValue(sources, [
    `${role}_marital_regime`,
    `${role}_marital_status`,
    `${role}.marital_regime`,
    `${role}.marital_status`,
    'maritalRegime',
    'marriageRegime',
    'marital_regime',
    'marital_status',
    'ownershipType',
  ]))

  if (maritalRegime === 'in_community') return 'Yes'
  if (maritalRegime === 'out_of_community' || maritalRegime === 'single') return 'No'
  return ''
}

function derivePlaceholders(options = {}) {
  const flow = asRecord(options.flow)
  const form = asRecord(options.form)
  const transaction = asRecord(options.transaction)
  const facts = asRecord(options.facts)
  const context = asRecord(options.context)
  const source = asRecord(options.source)
  const placeholders = asRecord(options.placeholders)
  const sources = [placeholders, flow, form, transaction, facts, context, source, options]

  const sellerEntityType = normalizePartyEntitySignal(firstValue(sources, [
    'seller_entity_type',
    'seller.entity_type_raw',
    'seller.entity_type',
    'sellerEntityType',
    'seller_branch',
    'sellerBranch',
    'seller_type',
    'sellerType',
    'sellerLegalType',
    'ownershipType',
    'ownership_type',
  ]))
  const buyerEntityType = normalizePartyEntitySignal(firstValue(sources, [
    'buyer_entity_type',
    'buyer.entity_type_raw',
    'buyer.entity_type',
    'buyerEntityType',
    'buyer_branch',
    'buyerBranch',
    'purchaser_branch',
    'purchaser_type',
    'purchaserType',
    'purchaser_entity_type',
    'buyer_type',
  ]))
  const financeType = normalizeFinanceSignal(firstValue(sources, [
    'finance_type',
    'financeType',
    'finance_branch',
    'buyer_finance_branch',
    'purchase_finance_type',
    'transaction.finance_type',
    'transaction.finance_type_raw',
    'finance.type',
  ]))

  return compactObject({
    seller_entity_type: sellerEntityType,
    buyer_entity_type: buyerEntityType,
    finance_type: financeType,
    seller_marital_status: firstValue(sources, [
      'seller_marital_status',
      'seller_marital_regime',
      'seller.marital_status',
      'seller.marital_regime',
      'maritalStatus',
      'maritalRegime',
      'marital_status',
      'marital_regime',
      'ownershipType',
    ]),
    buyer_marital_status: firstValue(sources, [
      'buyer_marital_status',
      'buyer_marital_regime',
      'buyer.marital_status',
      'buyer.marital_regime',
      'purchaser.marital_status',
      'purchaser.marital_regime',
      'marital_status',
      'marital_regime',
    ]),
    seller_spouse_consent_required: deriveSpouseConsentSignal('seller', sources),
    buyer_spouse_consent_required: deriveSpouseConsentSignal('buyer', sources),
  })
}

export function buildConditionalPackClassifierInput(options = {}) {
  const source = asRecord(options.source)
  const context = asRecord(options.context)
  const placeholders = {
    ...derivePlaceholders(options),
    ...asRecord(options.placeholders),
  }

  return {
    ...source,
    ...asRecord(options.form),
    ...asRecord(options.transaction),
    ...asRecord(options.facts),
    ...asRecord(options.flow),
    placeholders,
    context: {
      ...context,
      source,
      flow: asRecord(options.flow),
      form: asRecord(options.form),
      transaction: asRecord(options.transaction),
      facts: asRecord(options.facts),
    },
  }
}

export const CONDITIONAL_PACK_DATA_RULES = Object.freeze([
  Object.freeze({
    key: 'seller_individual_capacity_pack',
    label: 'Individual seller capacity pack',
    role: 'seller',
    packetTypes: Object.freeze(['mandate', 'otp']),
    activation: 'seller_individual',
    requiredOnboardingFields: Object.freeze(['seller.id_number', 'seller.marital_status']),
    optionalOnboardingFields: Object.freeze(['seller.marital_regime']),
    requiredMergeFields: Object.freeze(['seller_entity_type', 'seller_marital_status', 'seller_spouse_consent_required']),
    documentTriggers: Object.freeze(['identity_documents', 'proof_of_address']),
  }),
  Object.freeze({
    key: 'seller_company_authority_pack',
    label: 'Seller company authority pack',
    role: 'seller',
    packetTypes: Object.freeze(['mandate', 'otp']),
    activation: 'seller_company',
    requiredOnboardingFields: Object.freeze([
      'seller.company.name',
      'seller.company.registration_number',
      'seller.company.authorised_signatory.name',
      'seller.company.authorised_signatory.capacity',
      'seller.company.resolution_date',
      'seller.company.authority_basis',
    ]),
    optionalOnboardingFields: Object.freeze([
      'seller.company.registered_address',
      'seller.company.directors',
      'seller.company.resolution_available',
      'seller.company.authorised_signatory.email',
      'seller.company.authorised_signatory.phone',
    ]),
    requiredMergeFields: Object.freeze([
      'seller_entity_type',
      'seller_company_registration_number',
      'seller_representative_name',
      'seller_representative_capacity',
      'seller_resolution_date',
      'seller_authority_basis',
    ]),
    documentTriggers: Object.freeze(['company_registration', 'company_resolution', 'director_identity']),
  }),
  Object.freeze({
    key: 'seller_trust_authority_pack',
    label: 'Seller trust authority pack',
    role: 'seller',
    packetTypes: Object.freeze(['mandate', 'otp']),
    activation: 'seller_trust',
    requiredOnboardingFields: Object.freeze([
      'seller.trust.name',
      'seller.trust.registration_number',
      'seller.trust.trustees',
      'seller.trust.authorised_trustee.name',
      'seller.trust.authorised_trustee.capacity',
      'seller.trust.authority_basis',
    ]),
    optionalOnboardingFields: Object.freeze([
      'seller.trust.registered_address',
      'seller.trust.resolution_available',
      'seller.trust.authorised_trustee.email',
      'seller.trust.authorised_trustee.phone',
    ]),
    requiredMergeFields: Object.freeze([
      'seller_entity_type',
      'seller_trust_registration_number',
      'seller_trustee_names',
      'seller_representative_name',
      'seller_representative_capacity',
      'seller_authority_basis',
    ]),
    documentTriggers: Object.freeze(['trust_deed', 'letters_of_authority', 'trustee_resolution']),
  }),
  Object.freeze({
    key: 'seller_spouse_consent_pack',
    label: 'Seller spouse consent pack',
    role: 'seller',
    packetTypes: Object.freeze(['mandate', 'otp']),
    activation: 'seller_spouse_consent',
    requiredOnboardingFields: Object.freeze([
      'seller.spouse.name',
      'seller.spouse.id_number',
      'seller.spouse.email',
      'seller.spouse.consent_required',
    ]),
    optionalOnboardingFields: Object.freeze(['seller.spouse.phone', 'seller.spouse.residential_address']),
    requiredMergeFields: Object.freeze([
      'seller_spouse_consent_required',
      'seller_spouse_full_name',
      'seller_spouse_id_number',
      'seller_spouse_email',
    ]),
    documentTriggers: Object.freeze(['spouse_consent', 'marriage_certificate']),
  }),
  Object.freeze({
    key: 'buyer_individual_capacity_pack',
    label: 'Individual buyer capacity pack',
    role: 'buyer',
    packetTypes: Object.freeze(['otp']),
    activation: 'buyer_individual',
    requiredOnboardingFields: Object.freeze([
      'buyer.person.identity_number_or_passport_number',
      'buyer.person.marital_status',
    ]),
    optionalOnboardingFields: Object.freeze(['buyer.person.marital_regime']),
    requiredMergeFields: Object.freeze(['buyer_entity_type', 'buyer_marital_status', 'buyer_spouse_consent_required']),
    documentTriggers: Object.freeze(['id_document', 'proof_of_address']),
  }),
  Object.freeze({
    key: 'buyer_company_authority_pack',
    label: 'Buyer company authority pack',
    role: 'buyer',
    packetTypes: Object.freeze(['otp']),
    activation: 'buyer_company',
    requiredOnboardingFields: Object.freeze([
      'buyer.company.name',
      'buyer.company.registration_number',
      'buyer.company.authorised_signatory.name',
      'buyer.company.authorised_signatory.capacity',
      'buyer.company.resolution_date',
      'buyer.company.authority_basis',
      'buyer.company.board_resolution_available',
    ]),
    optionalOnboardingFields: Object.freeze(['buyer.company.registered_address', 'buyer.company.directors']),
    requiredMergeFields: Object.freeze([
      'buyer_entity_type',
      'buyer_company_registration_number',
      'buyer_representative_name',
      'buyer_representative_capacity',
      'buyer_resolution_date',
      'buyer_authority_basis',
    ]),
    documentTriggers: Object.freeze(['cipc_registration', 'company_resolution', 'director_id']),
  }),
  Object.freeze({
    key: 'buyer_trust_authority_pack',
    label: 'Buyer trust authority pack',
    role: 'buyer',
    packetTypes: Object.freeze(['otp']),
    activation: 'buyer_trust',
    requiredOnboardingFields: Object.freeze([
      'buyer.trust.name',
      'buyer.trust.registration_number',
      'buyer.trust.trustees',
      'buyer.trust.authorised_trustee.name',
      'buyer.trust.authorised_trustee.capacity',
      'buyer.trust.authority_basis',
      'buyer.trust.resolution_available',
    ]),
    optionalOnboardingFields: Object.freeze([
      'buyer.trust.registered_address',
      'buyer.trust.authorised_trustee.email',
      'buyer.trust.authorised_trustee.phone',
    ]),
    requiredMergeFields: Object.freeze([
      'buyer_entity_type',
      'buyer_trust_registration_number',
      'buyer_trustee_names',
      'buyer_representative_name',
      'buyer_representative_capacity',
      'buyer_authority_basis',
    ]),
    documentTriggers: Object.freeze(['trust_deed', 'letters_of_authority', 'trust_resolution']),
  }),
  Object.freeze({
    key: 'buyer_spouse_consent_pack',
    label: 'Buyer spouse consent pack',
    role: 'buyer',
    packetTypes: Object.freeze(['otp']),
    activation: 'buyer_spouse_consent',
    requiredOnboardingFields: Object.freeze([
      'buyer.person.spouse_full_name',
      'buyer.person.spouse_identity_number',
      'buyer.person.spouse_email',
      'buyer.person.spouse_consent_required',
    ]),
    optionalOnboardingFields: Object.freeze(['buyer.person.spouse_phone', 'buyer.person.spouse_residential_address']),
    requiredMergeFields: Object.freeze([
      'buyer_spouse_consent_required',
      'buyer_spouse_full_name',
      'buyer_spouse_id_number',
      'buyer_spouse_email',
    ]),
    documentTriggers: Object.freeze(['spouse_id', 'spouse_proof_of_address', 'marriage_certificate']),
  }),
  Object.freeze({
    key: 'bond_finance_pack',
    sectionKeys: Object.freeze(['schedule_2', 'finance_clause_bond']),
    label: 'Bond finance pack',
    role: 'finance',
    packetTypes: Object.freeze(['otp']),
    activation: 'bond_finance',
    requiredOnboardingFields: Object.freeze([
      'finance.bond_amount',
      'finance.bond_process_started',
      'finance.bond_current_status',
      'finance.bond_readiness_consent',
    ]),
    optionalOnboardingFields: Object.freeze(['finance.bond_bank_name', 'finance.bond_originator_name']),
    requiredMergeFields: Object.freeze(['finance_type', 'bond_amount']),
    documentTriggers: Object.freeze(['bond_approval', 'grant_signed']),
  }),
  Object.freeze({
    key: 'cash_sale_pack',
    label: 'Cash sale payment pack',
    role: 'finance',
    packetTypes: Object.freeze(['otp']),
    activation: 'cash_sale',
    requiredOnboardingFields: Object.freeze([
      'finance.cash_amount',
      'finance.proof_of_funds_available',
      'finance.source_of_funds',
    ]),
    optionalOnboardingFields: Object.freeze(['finance.bank_statements_available', 'finance.cash_contribution_available']),
    requiredMergeFields: Object.freeze(['finance_type', 'cash_amount']),
    documentTriggers: Object.freeze(['proof_of_funds']),
  }),
  Object.freeze({
    key: 'cash_contribution_pack',
    label: 'Combination finance cash contribution pack',
    role: 'finance',
    packetTypes: Object.freeze(['otp']),
    activation: 'combination_finance',
    requiredOnboardingFields: Object.freeze([
      'finance.cash_amount',
      'finance.proof_of_funds_available',
      'finance.source_of_funds',
    ]),
    optionalOnboardingFields: Object.freeze(['finance.bank_statements_available', 'finance.cash_contribution_available']),
    requiredMergeFields: Object.freeze(['finance_type', 'cash_amount', 'bond_amount']),
    documentTriggers: Object.freeze(['proof_of_funds']),
  }),
])

function isPacketTypeMatch(rule = {}, packetType = 'otp') {
  const packetTypes = Array.isArray(rule.packetTypes) ? rule.packetTypes : []
  return packetTypes.includes(normalizeKey(packetType))
}

function isRuleActive(rule = {}, classifiers = {}, signals = {}) {
  const seller = classifiers.seller || {}
  const buyer = classifiers.buyer || {}
  const finance = classifiers.finance || {}

  switch (rule.activation) {
    case 'seller_individual':
      return signals.sellerEntity && seller.isIndividual
    case 'seller_company':
      return signals.sellerEntity && seller.isCompany
    case 'seller_trust':
      return signals.sellerEntity && seller.isTrust
    case 'seller_spouse_consent':
      return signals.sellerSpouseConsent && seller.isMarriedInCommunity
    case 'buyer_individual':
      return signals.buyerEntity && buyer.isIndividual
    case 'buyer_company':
      return signals.buyerEntity && buyer.isCompany
    case 'buyer_trust':
      return signals.buyerEntity && buyer.isTrust
    case 'buyer_spouse_consent':
      return signals.buyerSpouseConsent && buyer.isMarriedInCommunity
    case 'bond_finance':
      return signals.finance && finance.isBond
    case 'cash_sale':
      return signals.finance && finance.isCash
    case 'combination_finance':
      return signals.finance && finance.isHybrid
    default:
      return false
  }
}

function serializeRule(rule = {}, active = false) {
  return {
    key: rule.key,
    packKey: rule.key,
    sectionKeys: Array.isArray(rule.sectionKeys) ? [...rule.sectionKeys] : [rule.key],
    label: rule.label,
    role: rule.role,
    packetTypes: [...(rule.packetTypes || [])],
    activation: rule.activation,
    active: Boolean(active),
    requiredOnboardingFields: [...(rule.requiredOnboardingFields || [])],
    optionalOnboardingFields: [...(rule.optionalOnboardingFields || [])],
    requiredMergeFields: [...(rule.requiredMergeFields || [])],
    documentTriggers: [...(rule.documentTriggers || [])],
  }
}

export function listConditionalPackDataRules({ packetType = '' } = {}) {
  return CONDITIONAL_PACK_DATA_RULES
    .filter((rule) => (!packetType ? true : isPacketTypeMatch(rule, packetType)))
    .map((rule) => serializeRule(rule, false))
}

export function resolveConditionalPackDataRequirements(options = {}) {
  const packetType = normalizeKey(options.packetType || options.packet_type || 'otp') || 'otp'
  const input = buildConditionalPackClassifierInput(options)
  const classifiers = {
    seller: classifySellerParty(input),
    buyer: classifyBuyerParty(input),
    finance: classifyDealFinance(input),
  }
  const signals = {
    sellerEntity: Boolean(normalizeText(input.placeholders?.seller_entity_type)),
    buyerEntity: Boolean(normalizeText(input.placeholders?.buyer_entity_type)),
    sellerSpouseConsent: Boolean(normalizeText(input.placeholders?.seller_spouse_consent_required)),
    buyerSpouseConsent: Boolean(normalizeText(input.placeholders?.buyer_spouse_consent_required)),
    finance: Boolean(normalizeText(input.placeholders?.finance_type)),
  }

  return CONDITIONAL_PACK_DATA_RULES
    .filter((rule) => isPacketTypeMatch(rule, packetType))
    .map((rule) => serializeRule(rule, isRuleActive(rule, classifiers, signals)))
    .filter((rule) => options.includeInactive || rule.active)
}

export function getConditionalPackRequiredOnboardingFields(options = {}) {
  return mergeUnique(
    ...resolveConditionalPackDataRequirements(options).map((rule) => rule.requiredOnboardingFields),
  )
}

export function getConditionalPackOptionalOnboardingFields(options = {}) {
  return mergeUnique(
    ...resolveConditionalPackDataRequirements(options).map((rule) => rule.optionalOnboardingFields),
  )
}

export function getConditionalPackRequiredMergeFields(options = {}) {
  return mergeUnique(
    ...resolveConditionalPackDataRequirements(options).map((rule) => rule.requiredMergeFields),
  )
}

export function getConditionalPackDocumentTriggers(options = {}) {
  return mergeUnique(
    ...resolveConditionalPackDataRequirements(options).map((rule) => rule.documentTriggers),
  )
}
