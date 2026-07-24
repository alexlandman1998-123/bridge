import {
  resolveConditionalPackDataRequirements,
} from './conditionalPackDataRules.js'
import {
  resolveLegalDocumentScenarioProfile,
} from './legalDocumentScenarioProfile.js'

function text(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function hasIllegalMandatePack(packKey = '') {
  const key = text(packKey)
  return key.startsWith('buyer_') || ['bond_finance_pack', 'cash_sale_pack'].includes(key)
}

function scenarioPlaceholders(scenario = {}) {
  const placeholders = {
    seller_entity_type: scenario.seller?.entityType,
    seller_marital_status: scenario.seller?.maritalStatus || scenario.seller?.maritalRegime,
    seller_spouse_consent_required: scenario.seller?.spouseConsentRequired,
    buyer_entity_type: scenario.buyer?.entityType,
    buyer_marital_status: scenario.buyer?.maritalStatus || scenario.buyer?.maritalRegime,
    buyer_spouse_consent_required: scenario.buyer?.spouseConsentRequired,
    property_title_type: scenario.property?.propertyType,
    finance_type: scenario.transaction?.financeType,
  }

  return Object.fromEntries(Object.entries(placeholders).filter(([, value]) => text(value)))
}

export const PLATFORM_DEFAULT_SCENARIO_MATRIX_PHASE6 = Object.freeze([
  Object.freeze({
    key: 'mandate_seller_individual_full_title',
    packetType: 'mandate',
    seller: Object.freeze({ entityType: 'individual', maritalStatus: 'single' }),
    buyer: Object.freeze({ entityType: 'company' }),
    property: Object.freeze({ propertyType: 'full_title' }),
    transaction: Object.freeze({ financeType: 'bond' }),
    expectedClausePacks: Object.freeze(['seller_individual_capacity_pack', 'property_full_title_pack']),
    forbiddenClausePacks: Object.freeze(['buyer_company_authority_pack', 'bond_finance_pack']),
  }),
  Object.freeze({
    key: 'mandate_seller_married_sectional',
    packetType: 'mandate',
    seller: Object.freeze({ entityType: 'individual', maritalStatus: 'in community of property' }),
    property: Object.freeze({ propertyType: 'sectional_title' }),
    expectedClausePacks: Object.freeze(['seller_individual_capacity_pack', 'seller_spouse_consent_pack', 'property_sectional_title_pack']),
  }),
  Object.freeze({
    key: 'mandate_seller_company_full_title',
    packetType: 'mandate',
    seller: Object.freeze({ entityType: 'company' }),
    property: Object.freeze({ propertyType: 'freehold' }),
    expectedClausePacks: Object.freeze(['seller_company_authority_pack', 'property_full_title_pack']),
  }),
  Object.freeze({
    key: 'mandate_seller_close_corporation_sectional',
    packetType: 'mandate',
    seller: Object.freeze({ entityType: 'close corporation' }),
    property: Object.freeze({ propertyType: 'apartment' }),
    expectedClausePacks: Object.freeze(['seller_company_authority_pack', 'property_sectional_title_pack']),
  }),
  Object.freeze({
    key: 'mandate_seller_trust_sectional',
    packetType: 'mandate',
    seller: Object.freeze({ entityType: 'trust' }),
    property: Object.freeze({ propertyType: 'sectional title' }),
    expectedClausePacks: Object.freeze(['seller_trust_authority_pack', 'property_sectional_title_pack']),
  }),
  Object.freeze({
    key: 'otp_company_seller_trust_buyer_cash',
    packetType: 'otp',
    seller: Object.freeze({ entityType: 'company' }),
    buyer: Object.freeze({ entityType: 'trust' }),
    property: Object.freeze({ propertyType: 'full_title' }),
    transaction: Object.freeze({ financeType: 'cash' }),
    expectedClausePacks: Object.freeze(['seller_company_authority_pack', 'buyer_trust_authority_pack', 'property_full_title_pack', 'cash_sale_pack']),
  }),
  Object.freeze({
    key: 'otp_trust_seller_company_buyer_bond_sectional',
    packetType: 'otp',
    seller: Object.freeze({ entityType: 'trust' }),
    buyer: Object.freeze({ entityType: 'company' }),
    property: Object.freeze({ propertyType: 'sectional_title' }),
    transaction: Object.freeze({ financeType: 'bond' }),
    expectedClausePacks: Object.freeze(['seller_trust_authority_pack', 'buyer_company_authority_pack', 'property_sectional_title_pack', 'bond_finance_pack']),
  }),
  Object.freeze({
    key: 'otp_close_corporation_buyer_combination',
    packetType: 'otp',
    seller: Object.freeze({ entityType: 'individual', maritalStatus: 'single' }),
    buyer: Object.freeze({ entityType: 'close corporation' }),
    property: Object.freeze({ propertyType: 'freehold' }),
    transaction: Object.freeze({ financeType: 'combination' }),
    expectedClausePacks: Object.freeze(['seller_individual_capacity_pack', 'buyer_company_authority_pack', 'property_full_title_pack', 'bond_finance_pack']),
  }),
  Object.freeze({
    key: 'otp_married_individuals_sectional_bond',
    packetType: 'otp',
    seller: Object.freeze({ entityType: 'individual', maritalStatus: 'in community of property' }),
    buyer: Object.freeze({ entityType: 'individual', maritalStatus: 'in community of property' }),
    property: Object.freeze({ propertyType: 'sectional_title' }),
    transaction: Object.freeze({ financeType: 'bond' }),
    expectedClausePacks: Object.freeze([
      'seller_individual_capacity_pack',
      'seller_spouse_consent_pack',
      'buyer_individual_capacity_pack',
      'buyer_spouse_consent_pack',
      'property_sectional_title_pack',
      'bond_finance_pack',
    ]),
  }),
])

export function assessPlatformDefaultScenarioLogic(scenarios = PLATFORM_DEFAULT_SCENARIO_MATRIX_PHASE6) {
  const results = asArray(scenarios).map((scenario) => {
    const placeholders = scenarioPlaceholders(scenario)
    const profile = resolveLegalDocumentScenarioProfile({
      packetType: scenario.packetType,
      placeholders,
      seller: scenario.seller,
      buyer: scenario.buyer,
      property: scenario.property,
      transaction: scenario.transaction,
    })
    const conditionalPacks = resolveConditionalPackDataRequirements({
      packetType: scenario.packetType,
      placeholders,
    })
    const activeClausePacks = asArray(profile.activeClausePacks)
    const activeConditionalPackKeys = conditionalPacks.map((pack) => pack.key)
    const expected = asArray(scenario.expectedClausePacks)
    const forbidden = asArray(scenario.forbiddenClausePacks)
    const blockers = []

    for (const packKey of expected) {
      if (!activeClausePacks.includes(packKey)) blockers.push(`Missing expected clause pack ${packKey}.`)
    }
    for (const packKey of forbidden) {
      if (activeClausePacks.includes(packKey) || activeConditionalPackKeys.includes(packKey)) {
        blockers.push(`Forbidden clause pack ${packKey} was activated.`)
      }
    }
    if (!profile.complete) blockers.push(`Scenario is incomplete: ${profile.missingRoutingFacts.join(', ')}.`)
    if (scenario.packetType === 'mandate') {
      const illegalMandatePacks = unique([...activeClausePacks, ...activeConditionalPackKeys].filter(hasIllegalMandatePack))
      if (illegalMandatePacks.length) blockers.push(`Mandate activated buyer/finance packs: ${illegalMandatePacks.join(', ')}.`)
      if (profile.buyerClauseProfile || profile.financeClauseProfile) blockers.push('Mandate resolved buyer or finance clause profile.')
    }
    if (scenario.packetType === 'otp') {
      if (!profile.buyerClauseProfile || profile.buyerClauseProfile === 'party_unknown') blockers.push('OTP did not resolve buyer clause profile.')
      if (!profile.financeClauseProfile || profile.financeClauseProfile === 'finance_unknown') blockers.push('OTP did not resolve finance clause profile.')
    }

    return {
      key: scenario.key,
      packetType: scenario.packetType,
      scenarioKey: profile.scenarioKey,
      complete: profile.complete,
      activeClausePacks,
      activeConditionalPackKeys,
      blockers,
      ready: blockers.length === 0,
    }
  })

  const blockers = results.flatMap((result) => result.blockers.map((message) => ({
    scenarioKey: result.key,
    message,
  })))

  return {
    phase: 6,
    contract: 'legal-template-platform-default-scenario-logic-v1',
    ready: blockers.length === 0,
    scenarioCount: results.length,
    blockers,
    results,
  }
}
