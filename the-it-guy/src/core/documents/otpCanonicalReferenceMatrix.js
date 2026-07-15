import {
  OTP_CANONICAL_RUNTIME_BINDING_VERSION,
  OTP_CANONICAL_TEMPLATE_ASSET_VERSION,
  OTP_CANONICAL_TEMPLATE_TOKENS,
  buildCanonicalOtpRuntimeBinding,
} from '../../../../supabase/functions/_shared/otpCanonicalRuntimeBinding.mjs'
import { OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION } from './otpCanonicalTemplateContract.js'

export const OTP_CANONICAL_REFERENCE_MATRIX_VERSION = 'kingstons_2026_otp_reference_matrix_v1'
export const OTP_CANONICAL_DOCX_SHA256 = '4e7fb4415a7b412dbbfb4fbdc430d62f4146a5eed68a619c3c83d3d685bdd691'
export const OTP_CANONICAL_MANIFEST_SHA256 = '15c9ed00779a4d4173eec89822437e714d141c7b11c975720d3ffc1828f2135f'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function fingerprint(value) {
  const input = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function templateMetadata(template = {}) {
  return asRecord(template.metadata_json || template.metadataJson)
}

export function isCanonicalOtpTemplate(template = {}) {
  const metadata = templateMetadata(template)
  return normalizeText(template.document_model || template.documentModel || metadata.document_model).toLowerCase() === 'single_master_document'
}

export function buildCanonicalOtpCertificationFingerprint(template = {}) {
  const metadata = templateMetadata(template)
  return fingerprint({
    documentModel: normalizeText(template.document_model || template.documentModel || metadata.document_model),
    contractVersion: normalizeText(template.canonical_contract_version || template.canonicalContractVersion || metadata.canonical_contract_version) || OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
    runtimeVersion: normalizeText(template.canonical_runtime_binding_version || template.canonicalRuntimeBindingVersion || metadata.canonical_runtime_binding_version) || OTP_CANONICAL_RUNTIME_BINDING_VERSION,
    assetVersion: normalizeText(template.canonical_template_asset_version || template.canonicalTemplateAssetVersion || metadata.canonical_template_asset_version) || OTP_CANONICAL_TEMPLATE_ASSET_VERSION,
    storageBucket: normalizeText(template.template_storage_bucket || template.storage_bucket || metadata.template_storage_bucket),
    storagePath: normalizeText(template.template_storage_path || template.storage_path || metadata.template_storage_path),
    fileName: normalizeText(template.template_file_name || template.file_name || metadata.template_file_name),
    docxSha256: normalizeText(template.docx_sha256 || template.docxSha256 || metadata.docx_sha256) || OTP_CANONICAL_DOCX_SHA256,
    manifestSha256: normalizeText(template.manifest_sha256 || template.manifestSha256 || metadata.manifest_sha256) || OTP_CANONICAL_MANIFEST_SHA256,
  })
}

function baseFixture() {
  return {
    transaction: {
      purchase_price: 2_500_000,
      deposit_amount: 100_000,
      cash_amount: 2_400_000,
      irrevocable_offer_date: '2026-07-20',
    },
    buyer: { name: 'Alex Buyer', email: 'alex@example.test', phone: '0825550101' },
    unit: { address_line1: '14 Example Avenue', suburb: 'Northmead', city: 'Benoni', province: 'Gauteng' },
    onboardingFormData: {
      purchaser_entity_type: 'individual',
      purchasers: [{
        first_name: 'Alex', last_name: 'Buyer', identity_number: '9001015009087', tax_number: '0123456789',
        street_address: '10 Sample Street', suburb: 'Northmead', city: 'Benoni', postal_code: '1501',
        marital_regime: 'unmarried', email: 'alex@example.test', phone: '0825550101',
        employment_type: 'full_time', employer_name: 'Example Employer', job_title: 'Manager', gross_monthly_income: 85_000,
      }],
      finance: { purchase_price: 2_500_000, cash_amount: 2_400_000 },
    },
    sourceContext: {
      property: { erf_number: 'Erf 1234', township: 'Northmead Township' },
      agent: { name: 'Alyssa Agent', ffc_number: 'AGENT-FFC', phone: '0825550301', email: 'agent@example.test' },
      organisation: {
        legal_name: 'Kingstons Real Estate', ffc_number: 'AGENCY-FFC', physical_address: '14th Avenue, Northmead',
        phone: '0100202431', email: 'offers@example.test', principal_agent: { name: 'Principal Agent', ffc_number: 'PRINCIPAL-FFC' },
      },
      seller: { owners: [{ full_name: 'Taylor Seller', id_number: '8001015009089', residential_address: '14 Example Avenue' }] },
    },
  }
}

export const OTP_CANONICAL_REFERENCE_SCENARIOS = Object.freeze([
  Object.freeze({
    key: 'individual_cash',
    label: 'Individual buying with cash',
    capabilities: ['individual', 'cash'],
    buildFixture: baseFixture,
    expected: { purchaser_1_full_name: 'Alex Buyer', marital_unmarried_mark: 'X', offer_bond_finance_amount: '' },
  }),
  Object.freeze({
    key: 'joint_married_bond',
    label: 'Married joint purchasers using a bond',
    capabilities: ['individual', 'second_purchaser', 'marital', 'bond'],
    buildFixture: () => {
      const fixture = baseFixture()
      fixture.transaction = { ...fixture.transaction, cash_amount: 400_000, bond_amount: 2_000_000 }
      fixture.onboardingFormData.purchasers[0].marital_regime = 'in_community'
      fixture.onboardingFormData.purchasers.push({
        first_name: 'Jordan', last_name: 'Buyer', identity_number: '9202025009088', street_address: '10 Sample Street',
        suburb: 'Northmead', city: 'Benoni', postal_code: '1501', employment_type: 'self_employed',
        business_name: 'Buyer Consulting', occupation: 'Consultant', gross_monthly_income: 60_000,
      })
      fixture.onboardingFormData.finance = { purchase_price: 2_500_000, cash_amount: 400_000, bond_amount: 2_000_000, bond_bank_name: 'Example Bank' }
      return fixture
    },
    expected: { purchaser_2_full_name: 'Jordan Buyer', marital_community_mark: 'X', offer_bond_finance_amount: '2 000 000,00', bond_applicant_2_self_employed_mark: 'X' },
  }),
  Object.freeze({
    key: 'company_bond',
    label: 'Company buying with bond finance',
    capabilities: ['company', 'bond'],
    buildFixture: () => {
      const fixture = baseFixture()
      fixture.transaction = { ...fixture.transaction, cash_amount: 500_000, bond_amount: 1_900_000 }
      fixture.onboardingFormData = {
        purchaser_entity_type: 'company',
        company: {
          company_name: 'Example Holdings (Pty) Ltd', company_registration_number: '2020/123456/07',
          company_registered_address: '1 Company Road, Sandton', company_tax_number: '9999999999', vat_number: '4123456789',
        },
        finance: { purchase_price: 2_500_000, cash_amount: 500_000, bond_amount: 1_900_000 },
      }
      return fixture
    },
    expected: { purchaser_1_full_name: 'Example Holdings (Pty) Ltd', purchaser_1_identity_number: '2020/123456/07', marital_unmarried_mark: '', marital_community_mark: '' },
  }),
  Object.freeze({
    key: 'trust_cash',
    label: 'Trust buying with cash',
    capabilities: ['trust', 'cash'],
    buildFixture: () => {
      const fixture = baseFixture()
      fixture.onboardingFormData = {
        purchaser_entity_type: 'trust',
        trust: { trust_name: 'Example Family Trust', trust_registration_number: 'IT1234/2020', trust_registered_address: '2 Trust Lane, Pretoria', trust_tax_number: '8888888888' },
        finance: { purchase_price: 2_500_000, cash_amount: 2_400_000 },
      }
      return fixture
    },
    expected: { purchaser_1_full_name: 'Example Family Trust', purchaser_1_identity_number: 'IT1234/2020', marital_unmarried_mark: '', marital_community_mark: '' },
  }),
  Object.freeze({
    key: 'linked_sale_early_occupation',
    label: 'Linked property sale and early occupation',
    capabilities: ['linked_sale', 'occupation'],
    buildFixture: () => {
      const fixture = baseFixture()
      fixture.transaction = {
        ...fixture.transaction, cash_amount: 500_000, bond_amount: 1_500_000, linked_sale_amount: 500_000,
        linked_sale_minimum_price: 1_500_000, occupation_date: '2026-09-01', occupational_rent: 12_500,
      }
      fixture.sourceContext.transaction = { linked_property: { address: '20 Existing Property Road, Benoni', erf_number: 'Erf 5678', registered_owner: 'Alex Buyer', bond_details: 'Example Bank' } }
      return fixture
    },
    expected: { linked_property_physical_address: '20 Existing Property Road, Benoni', offer_linked_property_sale_amount: '500 000,00', occupation_occupational_rental: 'R 12 500,00', occupation_after_registration_no_mark: 'X' },
  }),
  Object.freeze({
    key: 'attorney_approved_exception',
    label: 'Attorney-approved exceptional conditions',
    capabilities: ['approved_exception'],
    buildFixture: () => {
      const fixture = baseFixture()
      fixture.sourceContext.transaction = {
        approved_special_conditions: [{ status: 'approved', wording: 'Seller must repair the pool pump before transfer.' }],
        approved_suspensive_conditions: [{ status: 'approved', wording: 'Subject to an approved inspection by 15 August 2026.' }],
        suspensive_condition_fulfilment_date: '2026-08-15',
      }
      return fixture
    },
    expected: { special_conditions: 'Seller must repair the pool pump before transfer.', other_suspensive_conditions: 'Subject to an approved inspection by 15 August 2026.', other_suspensive_fulfilment_date: '15 August 2026' },
  }),
])

export const OTP_CANONICAL_REQUIRED_CAPABILITIES = Object.freeze([
  'individual', 'second_purchaser', 'marital', 'company', 'trust', 'cash', 'bond', 'linked_sale', 'occupation', 'approved_exception',
])

export function runCanonicalOtpReferenceMatrix({ template = {}, scenarios = OTP_CANONICAL_REFERENCE_SCENARIOS } = {}) {
  const scenarioResults = scenarios.map((scenario) => {
    const binding = buildCanonicalOtpRuntimeBinding(scenario.buildFixture())
    const issues = []
    if (!binding.ready) issues.push(...binding.blockers.map((item) => ({ code: item.code, message: item.message, token: item.token || null })))
    if (Object.keys(binding.placeholders).length !== OTP_CANONICAL_TEMPLATE_TOKENS.length) {
      issues.push({ code: 'token_inventory_mismatch', message: 'The runtime result does not match the canonical DOCX token inventory.' })
    }
    for (const [token, expected] of Object.entries(scenario.expected || {})) {
      if (binding.placeholders[token] !== expected) {
        issues.push({ code: 'unexpected_value', token, message: `${token} did not contain the expected reference value.` })
      }
    }
    return {
      key: scenario.key,
      label: scenario.label,
      capabilities: [...scenario.capabilities],
      passed: issues.length === 0,
      resolvedTokenCount: binding.resolvedTokenCount,
      tokenCount: Object.keys(binding.placeholders).length,
      issues,
    }
  })
  const exercisedCapabilities = [...new Set(scenarioResults.flatMap((result) => result.capabilities))].sort()
  const missingCapabilities = OTP_CANONICAL_REQUIRED_CAPABILITIES.filter((capability) => !exercisedCapabilities.includes(capability))
  const failedScenarios = scenarioResults.filter((result) => !result.passed)
  const unapprovedExceptionBinding = buildCanonicalOtpRuntimeBinding({
    ...baseFixture(),
    specialConditions: 'Unapproved reference wording must never enter the OTP.',
  })
  const safetyChecks = [{
    key: 'unapproved_exception_blocked',
    label: 'Unapproved legal wording is blocked',
    passed: !unapprovedExceptionBinding.ready && unapprovedExceptionBinding.attorneyReviewRequiredTokens.includes('special_conditions'),
  }]
  const failedSafetyChecks = safetyChecks.filter((check) => !check.passed)
  const templateFingerprint = buildCanonicalOtpCertificationFingerprint(template)
  const certificationKey = fingerprint({
    schemaVersion: OTP_CANONICAL_REFERENCE_MATRIX_VERSION,
    templateFingerprint,
    scenarios: scenarioResults.map(({ key, passed, tokenCount, issues }) => ({ key, passed, tokenCount, issues })),
    safetyChecks,
  })
  return {
    schemaVersion: OTP_CANONICAL_REFERENCE_MATRIX_VERSION,
    templateFingerprint,
    certificationKey,
    assetEvidence: {
      contractVersion: OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
      runtimeVersion: OTP_CANONICAL_RUNTIME_BINDING_VERSION,
      assetVersion: OTP_CANONICAL_TEMPLATE_ASSET_VERSION,
      docxSha256: OTP_CANONICAL_DOCX_SHA256,
      manifestSha256: OTP_CANONICAL_MANIFEST_SHA256,
      tokenCount: OTP_CANONICAL_TEMPLATE_TOKENS.length,
    },
    scenarioCount: scenarioResults.length,
    passedCount: scenarioResults.filter((result) => result.passed).length,
    failedCount: failedScenarios.length,
    scenarios: scenarioResults,
    failedScenarios,
    exercisedCapabilities,
    missingCapabilities,
    exercisedPackCount: exercisedCapabilities.length,
    publishablePackCount: OTP_CANONICAL_REQUIRED_CAPABILITIES.length,
    unexercisedPackKeys: missingCapabilities,
    safetyChecks,
    failedSafetyChecks,
    canPublish: failedScenarios.length === 0 && failedSafetyChecks.length === 0 && missingCapabilities.length === 0 && isCanonicalOtpTemplate(template),
    blockingMessages: [
      ...failedScenarios.map((result) => `${result.label}: ${result.issues[0]?.message || 'reference transaction failed'}`),
      ...(missingCapabilities.length ? [`Reference transactions do not exercise: ${missingCapabilities.join(', ')}.`] : []),
      ...failedSafetyChecks.map((check) => `${check.label} failed.`),
      ...(!isCanonicalOtpTemplate(template) ? ['Reference certification requires a single master OTP document.'] : []),
    ],
  }
}
