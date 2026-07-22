import {
  buildLegalDocumentScenarioPlaceholders,
  resolveLegalDocumentScenarioProfile,
} from './legalDocumentScenarioProfile.js'
import { evaluateConditionalMasterSections } from './conditionalMasterEngine.js'
import { evaluateConditionalSigningPlan } from './conditionalSigningEngine.js'

export const LEGAL_DOCUMENT_SCENARIO_PREVIEW_VERSION = 'legal-document-scenario-preview-v1'

export const LEGAL_DOCUMENT_PREVIEW_OPTIONS = Object.freeze({
  partyTypes: Object.freeze([
    Object.freeze({ value: 'individual', label: 'Individual' }),
    Object.freeze({ value: 'company', label: 'Company' }),
    Object.freeze({ value: 'close_corporation', label: 'Close corporation' }),
    Object.freeze({ value: 'trust', label: 'Trust' }),
  ]),
  maritalRegimes: Object.freeze([
    Object.freeze({ value: 'single', label: 'Single' }),
    Object.freeze({ value: 'out_of_community', label: 'Married out of community' }),
    Object.freeze({ value: 'in_community', label: 'Married in community' }),
  ]),
  propertyTitleTypes: Object.freeze([
    Object.freeze({ value: 'full_title', label: 'Full title' }),
    Object.freeze({ value: 'sectional_title', label: 'Sectional title' }),
  ]),
  financeTypes: Object.freeze([
    Object.freeze({ value: 'cash', label: 'Cash' }),
    Object.freeze({ value: 'bond', label: 'Bond' }),
    Object.freeze({ value: 'combination', label: 'Cash and bond' }),
  ]),
})

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

function normalizeSelection(selection = {}, fallback = PREVIEW_SCENARIOS[0], packetType = 'otp') {
  const normalizedPacketType = String(packetType || '').trim().toLowerCase() === 'mandate' ? 'mandate' : 'otp'
  const partyValues = new Set(LEGAL_DOCUMENT_PREVIEW_OPTIONS.partyTypes.map((item) => item.value))
  const maritalValues = new Set(LEGAL_DOCUMENT_PREVIEW_OPTIONS.maritalRegimes.map((item) => item.value))
  const propertyValues = new Set(LEGAL_DOCUMENT_PREVIEW_OPTIONS.propertyTitleTypes.map((item) => item.value))
  const financeValues = new Set(LEGAL_DOCUMENT_PREVIEW_OPTIONS.financeTypes.map((item) => item.value))
  const sellerEntityType = partyValues.has(selection.sellerEntityType) ? selection.sellerEntityType : fallback.sellerEntityType
  const buyerEntityType = partyValues.has(selection.buyerEntityType) ? selection.buyerEntityType : fallback.buyerEntityType
  return {
    sellerEntityType,
    sellerMaritalRegime: sellerEntityType === 'individual'
      ? maritalValues.has(selection.sellerMaritalRegime) ? selection.sellerMaritalRegime : fallback.sellerMaritalRegime || 'single'
      : '',
    buyerEntityType: normalizedPacketType === 'otp' ? buyerEntityType : '',
    buyerMaritalRegime: normalizedPacketType === 'otp' && buyerEntityType === 'individual'
      ? maritalValues.has(selection.buyerMaritalRegime) ? selection.buyerMaritalRegime : fallback.buyerMaritalRegime || 'single'
      : '',
    propertyTitleType: propertyValues.has(selection.propertyTitleType) ? selection.propertyTitleType : fallback.propertyTitleType,
    financeType: normalizedPacketType === 'otp'
      ? financeValues.has(selection.financeType) ? selection.financeType : fallback.financeType
      : '',
  }
}

export function resolveLegalDocumentPreviewSelection({ scenarioKey = '', selection = {}, packetType = 'otp' } = {}) {
  const scenario = getScenario(scenarioKey)
  return normalizeSelection(selection, scenario, packetType)
}

export function listLegalDocumentPreviewScenarios() {
  return PREVIEW_SCENARIOS
}

export function buildLegalDocumentPreviewContext({
  scenarioKey = PREVIEW_SCENARIOS[0].key,
  packetType = 'otp',
  organisationId = null,
  selection = {},
} = {}) {
  const preset = getScenario(scenarioKey)
  const normalizedPacketType = String(packetType || '').trim().toLowerCase() === 'mandate' ? 'mandate' : 'otp'
  const scenario = {
    ...preset,
    ...normalizeSelection(selection, preset, normalizedPacketType),
  }
  const property = {
    title_type: scenario.propertyTitleType,
    property_type: scenario.propertyTitleType,
    address: '24 Sample Avenue, Parkview, Johannesburg',
    erf_number: 'ERF 1245',
    unit_number: scenario.propertyTitleType === 'sectional_title' ? 'Section 18' : '',
    section_number: scenario.propertyTitleType === 'sectional_title' ? '18' : '',
    complex_name: scenario.propertyTitleType === 'sectional_title' ? 'Bridge View Scheme' : '',
  }
  const sellerIsCompany = ['company', 'close_corporation'].includes(scenario.sellerEntityType)
  const buyerIsCompany = ['company', 'close_corporation'].includes(scenario.buyerEntityType)
  const seller = {
    entity_type: scenario.sellerEntityType,
    marital_status: scenario.sellerMaritalRegime,
    marital_regime: scenario.sellerMaritalRegime,
    full_name: scenario.sellerEntityType === 'individual' ? 'Jordan Sample' : '',
    legal_name: sellerIsCompany ? 'Sample Property Holdings (Pty) Ltd' : scenario.sellerEntityType === 'trust' ? 'The Sample Family Trust' : 'Jordan Sample',
    registration_number: sellerIsCompany ? '2020/123456/07' : scenario.sellerEntityType === 'trust' ? 'IT 1234/2020' : '',
    representative_name: scenario.sellerEntityType === 'individual' ? 'Jordan Sample' : 'Alex Sample',
    representative_email: 'seller.representative@example.com',
    email: 'seller@example.com',
    spouse_name: scenario.sellerMaritalRegime === 'in_community' ? 'Taylor Sample' : '',
    spouse_email: scenario.sellerMaritalRegime === 'in_community' ? 'seller.spouse@example.com' : '',
    trustee_names: scenario.sellerEntityType === 'trust' ? ['Alex Sample', 'Morgan Sample'] : [],
  }
  const buyer = {
    entity_type: scenario.buyerEntityType,
    purchaser_type: scenario.buyerEntityType,
    marital_status: scenario.buyerMaritalRegime,
    marital_regime: scenario.buyerMaritalRegime,
    full_name: scenario.buyerEntityType === 'individual' ? 'Casey Sample' : '',
    legal_name: buyerIsCompany ? 'Sample Investments (Pty) Ltd' : scenario.buyerEntityType === 'trust' ? 'The Sample Investment Trust' : 'Casey Sample',
    registration_number: buyerIsCompany ? '2021/654321/07' : scenario.buyerEntityType === 'trust' ? 'IT 5678/2021' : '',
    representative_name: scenario.buyerEntityType === 'individual' ? 'Casey Sample' : 'Riley Sample',
    representative_email: 'buyer.representative@example.com',
    email: 'buyer@example.com',
    spouse_name: scenario.buyerMaritalRegime === 'in_community' ? 'Jamie Sample' : '',
    spouse_email: scenario.buyerMaritalRegime === 'in_community' ? 'buyer.spouse@example.com' : '',
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
    representativeEmail: buyer.representative_email,
    email: buyer.email,
    spouseEmail: buyer.spouse_email,
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
    representativeEmail: seller.representative_email,
    email: seller.email,
    spouseEmail: seller.spouse_email,
    trusteeNames: seller.trustee_names,
  }

  return {
    organisationId,
    previewScenarioKey: scenario.key,
    previewScenarioSelection: normalizeSelection(selection, preset, normalizedPacketType),
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
    agent: {
      name: 'Arch9 Template Tester',
      fullName: 'Arch9 Template Tester',
      email: 'agent@example.com',
    },
    generatedByName: 'Arch9 Template Tester',
    generatedByUserEmail: 'agent@example.com',
  }
}

export function resolveLegalDocumentPreviewScenario({
  scenarioKey,
  selection = {},
  packetType = 'otp',
  organisationId = null,
  template = null,
  sections = null,
} = {}) {
  const scenario = getScenario(scenarioKey)
  const resolvedSelection = resolveLegalDocumentPreviewSelection({ scenarioKey: scenario.key, selection, packetType })
  const context = buildLegalDocumentPreviewContext({
    scenarioKey: scenario.key,
    selection: resolvedSelection,
    packetType,
    organisationId,
  })
  const profile = resolveLegalDocumentScenarioProfile({
    packetType,
    sourceContext: context,
    seller: context.seller,
    buyer: context.buyer,
    property: context.property,
    transaction: context.transaction,
  })
  const placeholders = {
    ...buildLegalDocumentScenarioPlaceholders(profile),
    seller_full_name: context.seller.full_name || context.seller.legal_name,
    seller_email: context.seller.email,
    seller_representative_name: context.seller.representative_name,
    seller_representative_email: context.seller.representative_email,
    seller_spouse_full_name: context.seller.spouse_name,
    seller_spouse_email: context.seller.spouse_email,
    buyer_full_name: context.buyer.full_name || context.buyer.legal_name,
    buyer_email: context.buyer.email,
    buyer_representative_name: context.buyer.representative_name,
    buyer_representative_email: context.buyer.representative_email,
    buyer_spouse_full_name: context.buyer.spouse_name,
    buyer_spouse_email: context.buyer.spouse_email,
    agent_full_name: context.agent.fullName,
    agent_email: context.agent.email,
  }
  const sourceSections = Array.isArray(sections)
    ? sections
    : Array.isArray(template?.sections)
      ? template.sections
      : []
  const conditionalMasterAudit = sourceSections.length
    ? evaluateConditionalMasterSections({
        packetType,
        sections: sourceSections,
        placeholders,
        canonicalPlaceholders: buildLegalDocumentScenarioPlaceholders(profile),
        scenarioProfile: profile,
      })
    : null
  const signingAudit = evaluateConditionalSigningPlan({
    packetType,
    placeholders,
    scenarioProfile: profile,
  })
  return {
    previewVersion: LEGAL_DOCUMENT_SCENARIO_PREVIEW_VERSION,
    scenario,
    selection: resolvedSelection,
    context,
    placeholders,
    profile,
    conditionalMasterAudit,
    signingAudit,
    includedPackKeys: conditionalMasterAudit?.includedPackKeys || profile.activeClausePacks || [],
    excludedPackKeys: conditionalMasterAudit?.excludedPackKeys || [],
    includedSectionKeys: conditionalMasterAudit?.includedSectionKeys || [],
    excludedSectionKeys: conditionalMasterAudit?.excludedSectionKeys || [],
    selectedSignerRoles: signingAudit.selectedSignerRoles || [],
    ready: Boolean(profile.complete && (!conditionalMasterAudit || conditionalMasterAudit.canProceed) && signingAudit.documentCanProceed),
  }
}
