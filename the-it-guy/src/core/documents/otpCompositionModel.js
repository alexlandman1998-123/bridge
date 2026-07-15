import {
  listConditionalPackDataRules,
  resolveConditionalPackDataRequirements,
} from './conditionalPackDataRules.js'
import { classifyLegalDocumentEditorSection } from './legalDocumentEditorScope.js'
import {
  buildLegalDocumentScenarioPlaceholders,
  resolveLegalDocumentScenarioProfile,
} from './legalDocumentScenarioProfile.js'
import { classifyOtpBaselineSection } from './otpLegalBaseline.js'
import { evaluateVisibilityRules } from './sectionVisibilityRules.js'
import { resolveSouthAfricanLegalClausePacks } from './southAfricanLegalClausePacks.js'

export const OTP_MANAGED_FACTS = Object.freeze([
  Object.freeze({ key: 'buyer_entity_type', label: 'Who is buying?', group: 'Buyer', question: 'Is the buyer an individual, company, close corporation or trust?' }),
  Object.freeze({ key: 'buyer_marital_regime', label: 'Buyer marital position', group: 'Buyer', question: 'If the buyer is an individual, what is their marital regime?' }),
  Object.freeze({ key: 'seller_entity_type', label: 'Who is selling?', group: 'Seller', question: 'Is the seller an individual, company, close corporation or trust?' }),
  Object.freeze({ key: 'seller_marital_regime', label: 'Seller marital position', group: 'Seller', question: 'If the seller is an individual, what is their marital regime?' }),
  Object.freeze({ key: 'property_title_type', label: 'Property ownership type', group: 'Property', question: 'Is the property full title, sectional title, share block or an agricultural holding?' }),
  Object.freeze({ key: 'finance_type', label: 'How is the purchase funded?', group: 'Finance', question: 'Is this cash, bond finance, or a combination?' }),
])

export const OTP_EXCEPTION_FACTS = Object.freeze([
  Object.freeze({ key: 'property_in_estate_or_hoa', label: 'Estate or HOA', group: 'Exceptions', question: 'Is the property subject to estate or HOA rules?', factPath: 'property.inEstateOrHoa' }),
  Object.freeze({ key: 'property_exclusive_use_areas', label: 'Exclusive-use areas', group: 'Exceptions', question: 'Are parking bays, storerooms or other exclusive-use areas included?', factPath: 'property.existingExclusiveUseAreas' }),
  Object.freeze({ key: 'deposit_amount', label: 'Deposit payable', group: 'Exceptions', question: 'Is a deposit payable and who will hold it in trust?', factPath: 'finance.depositAmount' }),
  Object.freeze({ key: 'sale_of_existing_property', label: 'Linked property sale', group: 'Exceptions', question: 'Does the buyer need to sell another property first?', factPath: 'conditions.saleOfExistingProperty' }),
  Object.freeze({ key: 'occupation_before_transfer', label: 'Early occupation', group: 'Exceptions', question: 'Will occupation happen before transfer?', factPath: 'occupation.beforeTransfer' }),
  Object.freeze({ key: 'existing_lease', label: 'Existing lease or occupier', group: 'Exceptions', question: 'Is there an existing lease or occupier?', factPath: 'occupation.existingLease' }),
  Object.freeze({ key: 'vat_treatment', label: 'VAT or transfer duty', group: 'Exceptions', question: 'Is the sale subject to transfer duty, VAT-inclusive, VAT-exclusive or potentially zero-rated treatment?', factPath: 'tax.vatTreatment' }),
])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function getValue(record = {}, camelKey, snakeKey) {
  return record?.[camelKey] ?? record?.[snakeKey]
}

function getObject(record = {}, camelKey, snakeKey) {
  const value = getValue(record, camelKey, snakeKey)
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getSectionKey(section = {}) {
  return normalizeKey(getValue(section, 'sectionKey', 'section_key'))
}

function getSectionLabel(section = {}, key = '') {
  return normalizeText(getValue(section, 'sectionLabel', 'section_label')) || key.replace(/_/g, ' ')
}

function getFactValues(profile = {}) {
  return {
    buyer_entity_type: profile.buyerEntityType || '',
    buyer_marital_regime: profile.buyerMaritalRegime || '',
    seller_entity_type: profile.sellerEntityType || '',
    seller_marital_regime: profile.sellerMaritalRegime || '',
    property_title_type: profile.propertyTitleType || '',
    finance_type: profile.financeType || '',
  }
}

function readPath(source = {}, path = '') {
  return String(path || '').split('.').filter(Boolean).reduce((current, key) => (
    current && typeof current === 'object' ? current[key] : undefined
  ), source)
}

function buildActivationRuleMap() {
  const entries = listConditionalPackDataRules({ packetType: 'otp' }).flatMap((rule) => (
    (rule.sectionKeys || [rule.key]).map((sectionKey) => [normalizeKey(sectionKey), rule])
  ))
  return new Map(entries)
}

function describeDecision({ included, rule, condition, facts, missingFacts }) {
  if (rule) {
    const relevantMissing = missingFacts.filter((key) => rule.requiredMergeFields?.includes(key))
    if (relevantMissing.length) return `Needs ${relevantMissing.join(', ').replace(/_/g, ' ')} before Bridge can decide.`
    const status = included ? 'Included' : 'Not included'
    return `${status}: ${rule.label} is triggered by the matching onboarding answers.`
  }
  const field = normalizeText(condition?.rule?.field || condition?.field)
  if (!field) return included ? 'Included by its configured condition.' : 'Its configured condition did not match.'
  const value = facts[field]
  if (!value) return `Needs ${field.replace(/_/g, ' ')} before Bridge can decide.`
  return `${included ? 'Included' : 'Not included'} because ${field.replace(/_/g, ' ')} is ${value}.`
}

export function listOtpManagedFacts({ includeExceptions = true } = {}) {
  return [
    ...OTP_MANAGED_FACTS.map((fact) => ({ ...fact, layer: 'primary' })),
    ...(includeExceptions ? OTP_EXCEPTION_FACTS.map((fact) => ({ ...fact, layer: 'exception' })) : []),
  ]
}

export function buildOtpCompositionPlan({ sections = [], input = {} } = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const legalFacts = source.legalDealFacts || source.canonicalFacts || source.facts || {}
  const profile = resolveLegalDocumentScenarioProfile({ packetType: 'otp', ...source })
  const facts = getFactValues(profile)
  const placeholders = {
    ...(source.placeholders && typeof source.placeholders === 'object' ? source.placeholders : {}),
    ...facts,
    ...buildLegalDocumentScenarioPlaceholders(profile),
  }
  const activeRules = resolveConditionalPackDataRequirements({
    packetType: 'otp',
    ...source,
    placeholders,
  })
  const legalPackResolution = legalFacts && typeof legalFacts === 'object' && Object.keys(legalFacts).length
    ? resolveSouthAfricanLegalClausePacks(legalFacts)
    : null
  const activePackKeys = new Set([
    ...(profile.activeClausePacks || []).map(normalizeKey),
    ...activeRules.map((rule) => normalizeKey(rule.key)),
    ...(legalPackResolution?.activePacks || []).map((pack) => normalizeKey(pack.key)),
  ])
  const ruleBySectionKey = buildActivationRuleMap()
  const missingFacts = [...(profile.missingRoutingFacts || [])]

  const decisions = (Array.isArray(sections) ? sections : [])
    .map((section, index) => {
      const key = getSectionKey(section) || `section_${index + 1}`
      const editorClass = classifyLegalDocumentEditorSection(section, { packetType: 'otp' })
      const classification = classifyOtpBaselineSection(section)
      const condition = getObject(section, 'conditionJson', 'condition_json')
      const hasCondition = condition.enabled !== false && Boolean(condition.rule || condition.field || condition.all || condition.any || condition.not)
      const rule = ruleBySectionKey.get(key) || null
      const rulePackKey = normalizeKey(rule?.key)
      const included = editorClass.isSituation
        ? Boolean(
            activePackKeys.has(key) ||
            (rulePackKey && activePackKeys.has(rulePackKey)) ||
            (rule && (rule.sectionKeys || []).some((sectionKey) => activePackKeys.has(normalizeKey(sectionKey)))) ||
            (hasCondition && evaluateVisibilityRules(condition, placeholders)),
          )
        : true
      const kind = editorClass.isSigning ? 'signing' : editorClass.isSituation ? 'conditional' : 'standard'
      return {
        key,
        label: getSectionLabel(section, key),
        sortOrder: Number(getValue(section, 'sortOrder', 'sort_order') ?? index),
        kind,
        classification,
        included,
        reason: kind === 'standard'
          ? classification === 'transaction_data' ? 'Always included and filled from transaction information.' : 'Always included as part of the standard OTP.'
          : kind === 'signing'
            ? 'Included in the signing and execution part of the OTP.'
            : describeDecision({ included, rule, condition, facts, missingFacts }),
        activation: kind === 'conditional' ? {
          packKey: rule?.key || null,
          label: rule?.label || normalizeText(condition.label) || null,
          onboardingFields: [...(rule?.requiredOnboardingFields || [])],
          mergeFields: [...(rule?.requiredMergeFields || [])],
          condition,
        } : null,
      }
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key))

  const standard = decisions.filter((decision) => decision.kind === 'standard')
  const conditional = decisions.filter((decision) => decision.kind === 'conditional')
  const signing = decisions.filter((decision) => decision.kind === 'signing')
  const core = standard.filter((decision) => decision.classification === 'core_wording')
  const transactionData = standard.filter((decision) => decision.classification === 'transaction_data')
  return {
    profile,
    facts: [
      ...OTP_MANAGED_FACTS.map((definition) => ({
        ...definition,
        layer: 'primary',
        value: facts[definition.key] || '',
        answered: Boolean(facts[definition.key]),
        required: missingFacts.includes(definition.key) || Boolean(facts[definition.key]),
      })),
      ...OTP_EXCEPTION_FACTS.map((definition) => {
        const value = readPath(legalFacts, definition.factPath)
        return {
          ...definition,
          layer: 'exception',
          value: value ?? '',
          answered: value !== undefined && value !== null && value !== '',
          required: false,
        }
      }),
    ],
    legalPackResolution,
    missingFacts,
    decisions,
    includedSections: decisions.filter((decision) => decision.included),
    excludedSections: decisions.filter((decision) => !decision.included),
    groups: { standard, core, transactionData, conditional, signing },
    summary: {
      standardCount: standard.length,
      coreCount: core.length,
      transactionDataCount: transactionData.length,
      conditionalCount: conditional.length,
      activeConditionalCount: conditional.filter((decision) => decision.included).length,
      signingCount: signing.length,
      includedCount: decisions.filter((decision) => decision.included).length,
      missingFactCount: missingFacts.length,
    },
    ready: core.length > 0 && signing.length > 0 && missingFacts.length === 0,
  }
}
