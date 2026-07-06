import {
  buildConditionalPackClassifierInput,
  resolveConditionalPackDataRequirements,
} from './conditionalPackDataRules.js'
import {
  isMissingConditionalPackGenerationValue,
  resolveConditionalPackPreflight,
} from './conditionalPackPreflight.js'
import {
  getCanonicalMergeFieldDefinition,
  normalizeMergeFieldPayload,
} from './mergeFieldRegistry.js'

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

function uniqueStrings(values = []) {
  const seen = new Set()
  const rows = []
  for (const value of values.flat()) {
    const text = normalizeText(value)
    if (!text || seen.has(text)) continue
    seen.add(text)
    rows.push(text)
  }
  return rows
}

function readFirstValue(source = {}, keys = []) {
  for (const key of keys) {
    const normalizedKey = normalizeText(key)
    if (!normalizedKey) continue
    const value = source?.[normalizedKey]
    if (value !== undefined && normalizeText(value) !== '') return value
  }
  return ''
}

function resolveActivationDescription(pack = {}) {
  switch (pack.activation) {
    case 'seller_individual':
      return 'Seller is an individual.'
    case 'seller_company':
      return 'Seller is a company or close corporation.'
    case 'seller_trust':
      return 'Seller is a trust.'
    case 'seller_spouse_consent':
      return 'Seller spouse consent is required.'
    case 'buyer_individual':
      return 'Buyer is an individual.'
    case 'buyer_company':
      return 'Buyer is a company or close corporation.'
    case 'buyer_trust':
      return 'Buyer is a trust.'
    case 'buyer_spouse_consent':
      return 'Buyer spouse consent is required.'
    case 'bond_finance':
      return 'Finance type is bond.'
    case 'cash_sale':
      return 'Finance type is cash.'
    default:
      return 'Conditional pack activation rule did not match this scenario.'
  }
}

function resolveInactiveReason(pack = {}) {
  switch (pack.activation) {
    case 'seller_individual':
      return 'Requires seller entity type to resolve as individual.'
    case 'seller_company':
      return 'Requires seller entity type to resolve as company or close corporation.'
    case 'seller_trust':
      return 'Requires seller entity type to resolve as trust.'
    case 'seller_spouse_consent':
      return 'Requires seller marital/spouse-consent signals to resolve as married in community.'
    case 'buyer_individual':
      return 'Requires buyer entity type to resolve as individual.'
    case 'buyer_company':
      return 'Requires buyer entity type to resolve as company or close corporation.'
    case 'buyer_trust':
      return 'Requires buyer entity type to resolve as trust.'
    case 'buyer_spouse_consent':
      return 'Requires buyer marital/spouse-consent signals to resolve as married in community.'
    case 'bond_finance':
      return 'Requires finance type to resolve as bond.'
    case 'cash_sale':
      return 'Requires finance type to resolve as cash.'
    default:
      return 'No matching activation signal was detected.'
  }
}

function buildActivationSignals(placeholders = {}) {
  return {
    sellerEntityType: normalizeText(readFirstValue(placeholders, [
      'seller_entity_type',
      'seller.entity_type',
      'seller.entity_type_raw',
    ])),
    buyerEntityType: normalizeText(readFirstValue(placeholders, [
      'buyer_entity_type',
      'buyer.entity_type',
      'buyer.entity_type_raw',
    ])),
    sellerMaritalStatus: normalizeText(readFirstValue(placeholders, [
      'seller_marital_status',
      'seller.marital_status',
      'seller.marital_status_raw',
    ])),
    buyerMaritalStatus: normalizeText(readFirstValue(placeholders, [
      'buyer_marital_status',
      'buyer.marital_status',
      'buyer.marital_status_raw',
    ])),
    sellerSpouseConsentRequired: normalizeText(readFirstValue(placeholders, [
      'seller_spouse_consent_required',
      'seller.spouse_consent_required',
    ])),
    buyerSpouseConsentRequired: normalizeText(readFirstValue(placeholders, [
      'buyer_spouse_consent_required',
      'buyer.spouse_consent_required',
    ])),
    financeType: normalizeText(readFirstValue(placeholders, [
      'finance_type',
      'transaction.finance_type',
      'transaction.finance_type_raw',
    ])),
  }
}

function buildMissingByPack(missingPlaceholders = []) {
  const byPack = new Map()
  for (const issue of missingPlaceholders) {
    const key = normalizeText(issue?.packKey || issue?.sectionKey || issue?.source || 'conditional_pack')
    if (!byPack.has(key)) byPack.set(key, [])
    byPack.get(key).push(issue)
  }
  return byPack
}

function buildMergeFieldAudit({ pack = {}, packetType = 'otp', placeholders = {} } = {}) {
  return (pack.requiredMergeFields || []).map((fieldKey) => {
    const canonicalKey = normalizeText(fieldKey)
    const definition = getCanonicalMergeFieldDefinition(canonicalKey, { packetType })
    const resolvedKey = normalizeText(definition?.key || canonicalKey)
    const value = placeholders?.[resolvedKey] ?? placeholders?.[canonicalKey]
    const missing = isMissingConditionalPackGenerationValue(value)
    return {
      key: resolvedKey,
      label: normalizeText(definition?.label) || resolvedKey,
      present: !missing,
      missing,
    }
  })
}

function buildPackAudit({ pack = {}, packetType = 'otp', placeholders = {}, missingByPack = new Map() } = {}) {
  const key = normalizeText(pack.key || pack.packKey || pack.activation)
  const missingPlaceholders = missingByPack.get(key) || []
  const requiredMergeFields = buildMergeFieldAudit({ pack, packetType, placeholders })
  const active = Boolean(pack.active)

  return {
    key,
    packKey: key,
    sectionKeys: Array.isArray(pack.sectionKeys) ? [...pack.sectionKeys] : [key],
    label: pack.label,
    role: pack.role,
    activation: pack.activation,
    active,
    status: active ? (missingPlaceholders.length ? 'missing_data' : 'ready') : 'inactive',
    reason: active ? resolveActivationDescription(pack) : resolveInactiveReason(pack),
    requiredOnboardingFields: [...(pack.requiredOnboardingFields || [])],
    optionalOnboardingFields: [...(pack.optionalOnboardingFields || [])],
    requiredMergeFields,
    documentTriggers: [...(pack.documentTriggers || [])],
    missingPlaceholders,
  }
}

export function resolveConditionalPackAudit(options = {}) {
  const normalizedPacketType = normalizeKey(options.packetType || options.packet_type || 'otp') || 'otp'
  const classifierInput = buildConditionalPackClassifierInput(options)
  const normalizedPayload = normalizeMergeFieldPayload(
    {
      ...asRecord(options.source),
      ...asRecord(options.flow),
      ...asRecord(options.form),
      ...asRecord(options.transaction),
      ...asRecord(options.facts),
      ...asRecord(options.context),
      ...asRecord(classifierInput.placeholders),
      ...asRecord(options.placeholders),
    },
    {
      packetType: normalizedPacketType,
      includeAliasKeys: true,
    },
  ).payload
  const preflight = resolveConditionalPackPreflight({
    ...options,
    packetType: normalizedPacketType,
    placeholders: normalizedPayload,
  })
  const packs = resolveConditionalPackDataRequirements({
    ...options,
    packetType: normalizedPacketType,
    placeholders: normalizedPayload,
    includeInactive: true,
  })
  const missingByPack = buildMissingByPack(preflight.missingPlaceholders)
  const packAudits = packs.map((pack) => buildPackAudit({
    pack,
    packetType: normalizedPacketType,
    placeholders: normalizedPayload,
    missingByPack,
  }))
  const activePacks = packAudits.filter((pack) => pack.active)
  const inactivePacks = packAudits.filter((pack) => !pack.active)

  return {
    packetType: normalizedPacketType,
    canProceed: Boolean(preflight.canProceed),
    activationSignals: buildActivationSignals(normalizedPayload),
    summary: {
      packCount: packAudits.length,
      activePackCount: activePacks.length,
      inactivePackCount: inactivePacks.length,
      readyPackCount: activePacks.filter((pack) => pack.status === 'ready').length,
      blockedPackCount: activePacks.filter((pack) => pack.status === 'missing_data').length,
      missingPlaceholderCount: preflight.missingPlaceholders.length,
      requiredOnboardingFieldCount: uniqueStrings(activePacks.map((pack) => pack.requiredOnboardingFields)).length,
      optionalOnboardingFieldCount: uniqueStrings(activePacks.map((pack) => pack.optionalOnboardingFields)).length,
      requiredMergeFieldCount: uniqueStrings(activePacks.map((pack) => pack.requiredMergeFields.map((field) => field.key))).length,
      documentTriggerCount: uniqueStrings(activePacks.map((pack) => pack.documentTriggers)).length,
    },
    activePacks,
    inactivePacks,
    packs: packAudits,
    requiredOnboardingFields: uniqueStrings(activePacks.map((pack) => pack.requiredOnboardingFields)),
    optionalOnboardingFields: uniqueStrings(activePacks.map((pack) => pack.optionalOnboardingFields)),
    requiredMergeFields: uniqueStrings(activePacks.map((pack) => pack.requiredMergeFields.map((field) => field.key))),
    documentTriggers: uniqueStrings(activePacks.map((pack) => pack.documentTriggers)),
    missingPlaceholders: preflight.missingPlaceholders,
    preflight,
  }
}
