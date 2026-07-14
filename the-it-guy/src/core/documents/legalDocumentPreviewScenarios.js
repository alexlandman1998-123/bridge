import { resolveLegalDocumentScenarioProfile } from './legalDocumentScenarioProfile.js'

const PREVIEW_SCENARIOS = Object.freeze([
  Object.freeze({
    key: 'company',
    label: 'Company',
    description: 'Company authority and representative wording.',
    sellerEntityType: 'company',
    sellerMaritalRegime: '',
    buyerEntityType: 'company',
    buyerMaritalRegime: '',
    propertyTitleType: 'full_title',
    financeType: 'bond',
  }),
  Object.freeze({
    key: 'trust',
    label: 'Trust',
    description: 'Trustee authority and trust identification wording.',
    sellerEntityType: 'trust',
    sellerMaritalRegime: '',
    buyerEntityType: 'trust',
    buyerMaritalRegime: '',
    propertyTitleType: 'full_title',
    financeType: 'cash',
  }),
  Object.freeze({
    key: 'married_in_community',
    label: 'Married in community',
    description: 'Individual capacity and spouse-consent wording.',
    sellerEntityType: 'individual',
    sellerMaritalRegime: 'in_community',
    buyerEntityType: 'individual',
    buyerMaritalRegime: 'in_community',
    propertyTitleType: 'full_title',
    financeType: 'bond',
  }),
  Object.freeze({
    key: 'sectional_title',
    label: 'Sectional title',
    description: 'Section, scheme and body corporate wording.',
    sellerEntityType: 'individual',
    sellerMaritalRegime: 'single',
    buyerEntityType: 'individual',
    buyerMaritalRegime: 'single',
    propertyTitleType: 'sectional_title',
    financeType: 'bond',
  }),
])

function getScenario(scenarioKey = '') {
  return PREVIEW_SCENARIOS.find((scenario) => scenario.key === String(scenarioKey || '').trim().toLowerCase()) || PREVIEW_SCENARIOS[0]
}

export function listLegalDocumentPreviewScenarios() {
  return PREVIEW_SCENARIOS
}

export function buildLegalDocumentPreviewContext({
  scenarioKey = PREVIEW_SCENARIOS[0].key,
  packetType = 'otp',
  organisationId = null,
} = {}) {
  const scenario = getScenario(scenarioKey)
  const normalizedPacketType = String(packetType || '').trim().toLowerCase() === 'mandate' ? 'mandate' : 'otp'
  const property = {
    title_type: scenario.propertyTitleType,
    property_type: scenario.propertyTitleType,
    address: '24 Sample Avenue, Parkview, Johannesburg',
    erf_number: 'ERF 1245',
    unit_number: scenario.propertyTitleType === 'sectional_title' ? 'Section 18' : '',
    section_number: scenario.propertyTitleType === 'sectional_title' ? '18' : '',
    complex_name: scenario.propertyTitleType === 'sectional_title' ? 'Bridge View Scheme' : '',
  }
  const seller = {
    entity_type: scenario.sellerEntityType,
    marital_status: scenario.sellerMaritalRegime,
    marital_regime: scenario.sellerMaritalRegime,
    full_name: scenario.sellerEntityType === 'individual' ? 'Jordan Sample' : '',
    legal_name: scenario.sellerEntityType === 'company' ? 'Sample Property Holdings (Pty) Ltd' : scenario.sellerEntityType === 'trust' ? 'The Sample Family Trust' : 'Jordan Sample',
    registration_number: scenario.sellerEntityType === 'company' ? '2020/123456/07' : scenario.sellerEntityType === 'trust' ? 'IT 1234/2020' : '',
    representative_name: scenario.sellerEntityType === 'individual' ? 'Jordan Sample' : 'Alex Sample',
    spouse_name: scenario.sellerMaritalRegime === 'in_community' ? 'Taylor Sample' : '',
    trustee_names: scenario.sellerEntityType === 'trust' ? ['Alex Sample', 'Morgan Sample'] : [],
  }
  const buyer = {
    entity_type: scenario.buyerEntityType,
    purchaser_type: scenario.buyerEntityType,
    marital_status: scenario.buyerMaritalRegime,
    marital_regime: scenario.buyerMaritalRegime,
    full_name: scenario.buyerEntityType === 'individual' ? 'Casey Sample' : '',
    legal_name: scenario.buyerEntityType === 'company' ? 'Sample Investments (Pty) Ltd' : scenario.buyerEntityType === 'trust' ? 'The Sample Investment Trust' : 'Casey Sample',
    registration_number: scenario.buyerEntityType === 'company' ? '2021/654321/07' : scenario.buyerEntityType === 'trust' ? 'IT 5678/2021' : '',
    representative_name: scenario.buyerEntityType === 'individual' ? 'Casey Sample' : 'Riley Sample',
    spouse_name: scenario.buyerMaritalRegime === 'in_community' ? 'Jamie Sample' : '',
    trustee_names: scenario.buyerEntityType === 'trust' ? ['Riley Sample', 'Avery Sample'] : [],
  }
  const transaction = {
    id: 'sample-preview-transaction',
    organisation_id: organisationId,
    finance_type: scenario.financeType,
    purchase_price: 2450000,
    deposit_amount: 245000,
    occupation_date: '2026-09-01',
    property_title_type: scenario.propertyTitleType,
    property_type: scenario.propertyTitleType,
  }
  const onboardingFormData = {
    purchaserType: buyer.entity_type,
    entityType: buyer.entity_type,
    maritalStatus: buyer.marital_status,
    maritalRegime: buyer.marital_regime,
    fullName: buyer.full_name || buyer.legal_name,
    legalName: buyer.legal_name,
    registrationNumber: buyer.registration_number,
    spouseName: buyer.spouse_name,
    representativeName: buyer.representative_name,
    trusteeNames: buyer.trustee_names,
  }
  const sellerDetails = {
    entityType: seller.entity_type,
    maritalStatus: seller.marital_status,
    maritalRegime: seller.marital_regime,
    fullName: seller.full_name || seller.legal_name,
    legalName: seller.legal_name,
    registrationNumber: seller.registration_number,
    spouseName: seller.spouse_name,
    representativeName: seller.representative_name,
    trusteeNames: seller.trustee_names,
  }

  return {
    organisationId,
    previewScenarioKey: scenario.key,
    seller_entity_type: seller.entity_type,
    seller_marital_regime: seller.marital_regime,
    buyer_entity_type: buyer.entity_type,
    buyer_marital_regime: buyer.marital_regime,
    property_title_type: property.title_type,
    finance_type: transaction.finance_type,
    seller,
    buyer,
    property,
    transaction,
    unit: property,
    onboardingFormData,
    sellerDetails,
    lead: {
      id: 'sample-preview-lead',
      sellerOnboarding: { formData: sellerDetails },
    },
    mandateDraft: {
      sellerEntityType: seller.entity_type,
      sellerMaritalRegime: seller.marital_regime,
      propertyTitleType: property.title_type,
      propertyAddress: property.address,
      sectionalTitleScheme: property.complex_name,
      sectionNumber: property.section_number,
    },
    packetType: normalizedPacketType,
  }
}

export function resolveLegalDocumentPreviewScenario({ scenarioKey, packetType = 'otp', organisationId = null } = {}) {
  const scenario = getScenario(scenarioKey)
  const context = buildLegalDocumentPreviewContext({ scenarioKey: scenario.key, packetType, organisationId })
  const profile = resolveLegalDocumentScenarioProfile({
    packetType,
    sourceContext: context,
    seller: context.seller,
    buyer: context.buyer,
    property: context.property,
    transaction: context.transaction,
  })
  return { scenario, context, profile }
}
