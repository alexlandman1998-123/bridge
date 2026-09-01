import {
  getCanonicalDocumentRequestRequirement,
} from './documentRequestCanonicalMatrix.js'

export const DOCUMENT_REQUEST_CANONICAL_ADAPTER_VERSION = 'document_request_canonical_adapter_v1'

const BUYER_KEY_ALIASES = Object.freeze({
  information_sheet: '',
  otp: 'signed_otp',
  transfer_documents: 'transfer_documents',
  id_document: 'buyer_id_document',
  purchaser_id: 'buyer_id_document',
  purchaser_1_id: 'buyer_id_document',
  passport_copy: 'buyer_passport',
  proof_of_address: 'buyer_proof_of_address',
  purchaser_proof_of_address: 'buyer_proof_of_address',
  purchaser_1_proof_of_address: 'buyer_proof_of_address',
  marital_status_details: '',
  spouse_id: 'buyer_spouse_id_document',
  spouse_id_optional: 'buyer_spouse_id_document',
  spouse_proof_of_address: 'buyer_spouse_proof_of_address',
  spouse_proof_of_address_optional: 'buyer_spouse_proof_of_address',
  marriage_certificate: 'buyer_marriage_certificate',
  anc_document_optional: 'buyer_anc_document',
  anc_accrual_document_optional: 'buyer_anc_document',
  source_of_funds: 'buyer_source_of_funds',
  cipc_registration: 'buyer_company_registration',
  company_resolution: 'buyer_company_resolution',
  director_id: 'buyer_director_fica',
  director_proof_of_address: 'buyer_director_fica',
  buyer_company_beneficial_ownership: 'buyer_company_beneficial_ownership',
  trust_deed: 'buyer_trust_deed',
  letters_of_authority: 'buyer_letters_of_authority',
  trust_resolution: 'buyer_trustee_resolution',
  trustee_id: 'buyer_trustee_fica',
  trustee_proof_of_address: 'buyer_trustee_fica',
  buyer_trust_beneficial_ownership: 'buyer_trust_beneficial_ownership',
  proof_of_funds: 'proof_of_funds',
  proof_of_funds_cash_component: 'proof_of_funds_cash_component',
  bond_approval: 'bond_approval',
  grant_signed: 'grant_signed',
  payslips_3_months: 'income_affordability_documents',
  payslips: 'income_affordability_documents',
  bank_statements_3_months: 'income_affordability_documents',
  bank_statements_6_months: 'income_affordability_documents',
  bank_statements_12_months: 'income_affordability_documents',
  bank_statements: 'income_affordability_documents',
  financial_statements: 'income_affordability_documents',
  tax_returns_latest: 'income_affordability_documents',
  accountant_letter: 'income_affordability_documents',
  commission_statements: 'income_affordability_documents',
  contracts_or_invoices: 'income_affordability_documents',
  pension_proof: 'income_affordability_documents',
  income_explanation: 'income_affordability_documents',
  proof_of_income: 'income_affordability_documents',
  entity_bank_statements: 'income_affordability_documents',
  entity_financials: 'income_affordability_documents',
  entity_income_support: 'income_affordability_documents',
  entity_tax_clearance_optional: 'income_affordability_documents',
  spouse_income_support: 'income_affordability_documents',
  spouse_bank_statements: 'income_affordability_documents',
})

const SELLER_KEY_ALIASES = Object.freeze({
  signed_mandate: 'signed_mandate',
  signed_disclosure_form: 'property_condition_disclosure',
  signed_mandatory_disclosure: 'property_condition_disclosure',
  signed_mandatory_disclosure_form: 'property_condition_disclosure',
  signed_defect_form: 'property_condition_disclosure',
  signed_defects_form: 'property_condition_disclosure',
  signed_fica_declaration: '',
  signed_fica_declaration_pack: '',
  signed_fica_form: '',
  seller_onboarding_submission: '',
  id_document: 'seller_id_document',
  proof_of_address: 'seller_proof_of_address',
  marriage_certificate: 'seller_marriage_certificate',
  spouse_id_document: 'seller_spouse_id_document',
  spouse_consent: 'seller_spouse_consent',
  antenuptial_contract: 'seller_anc_document',
  company_registration: 'seller_company_registration',
  cipc_documents: 'seller_company_registration',
  company_resolution_to_sell: 'seller_company_resolution',
  director_member_ids: 'seller_director_fica',
  authorised_signatory_id: 'seller_director_fica',
  company_address_proof: 'seller_company_registration',
  beneficial_ownership_fica: 'seller_company_beneficial_ownership',
  seller_trust_deed: 'seller_trust_deed',
  seller_letters_of_authority: 'seller_letters_of_authority',
  trustee_ids: 'seller_trustee_fica',
  trust_resolution_to_sell: 'seller_trustee_resolution',
  authorised_trustee_signatory_id: 'seller_trustee_fica',
  trust_address_proof: 'seller_trust_deed',
  trust_beneficial_ownership_fica: 'seller_trust_beneficial_ownership',
  seller_executor_authority: 'seller_executor_authority',
  executor_id_document: 'seller_executor_authority',
  deceased_death_certificate: 'seller_executor_authority',
  estate_owner_details: 'seller_executor_authority',
  power_of_attorney_document: 'seller_power_of_attorney',
  principal_identity: 'seller_power_of_attorney',
  title_deed_copy: 'title_deed_copy',
  rates_account: 'rates_account',
  property_condition_disclosure: 'property_condition_disclosure',
  seller_bank_account_confirmation: 'seller_bank_account_confirmation',
  seller_tax_number: 'seller_tax_number',
  bond_statement: 'bond_statement',
  bond_bank_details: 'bond_statement',
  bond_cancellation_attorney_details: 'bond_statement',
  settlement_figure: 'bond_statement',
  levy_statement: 'levy_statement',
  body_corporate_details: 'body_corporate_details',
  hoa_levy_statement: 'hoa_levy_statement',
  hoa_contact_details: 'hoa_levy_statement',
  lease_agreement: 'lease_agreement',
  tenant_details: 'lease_agreement',
  zoning_certificate: 'zoning_certificate',
  vat_registration_certificate: 'vat_status_confirmation',
  going_concern_supporting_documents: 'vat_status_confirmation',
  gas_compliance_certificate: 'gas_compliance_certificate',
  electric_fence_certificate: 'electric_fence_certificate',
  water_installation_certificate: 'water_installation_certificate',
  plumbing_certificate: 'water_installation_certificate',
  beetle_certificate: 'beetle_certificate',
  solar_compliance_documents: 'solar_compliance_documents',
  approved_building_plans: 'approved_building_plans',
  alteration_approvals: 'approved_building_plans',
  occupation_certificate: 'occupation_certificate',
})

const ATTORNEY_KEY_ALIASES = Object.freeze({
  sale_agreement_or_otp: 'signed_otp',
  buyer_fica: '',
  seller_fica: '',
  transfer_duty_information: 'transfer_duty_information',
  transfer_documents: 'transfer_documents',
  rates_clearance: 'rates_clearance',
  buyer_id_document: 'buyer_id_document',
  buyer_proof_of_address: 'buyer_proof_of_address',
  buyer_marital_status_details: '',
  buyer_company_registration_documents: 'buyer_company_registration',
  buyer_director_ids: 'buyer_director_fica',
  buyer_business_address: 'buyer_company_registration',
  buyer_company_resolution: 'buyer_company_resolution',
  buyer_beneficial_ownership: 'buyer_company_beneficial_ownership',
  buyer_trust_deed: 'buyer_trust_deed',
  buyer_letters_of_authority: 'buyer_letters_of_authority',
  buyer_trustee_ids: 'buyer_trustee_fica',
  buyer_trustee_resolution: 'buyer_trustee_resolution',
  buyer_trust_beneficial_ownership: 'buyer_trust_beneficial_ownership',
  seller_id_document: 'seller_id_document',
  seller_proof_of_address: 'seller_proof_of_address',
  seller_marital_status_details: 'seller_marriage_certificate',
  seller_company_registration_documents: 'seller_company_registration',
  seller_director_ids: 'seller_director_fica',
  seller_company_resolution: 'seller_company_resolution',
  seller_beneficial_ownership: 'seller_company_beneficial_ownership',
  seller_trust_deed: 'seller_trust_deed',
  seller_letters_of_authority: 'seller_letters_of_authority',
  seller_trustee_ids: 'seller_trustee_fica',
  seller_trustee_resolution: 'seller_trustee_resolution',
  title_deed_copy: 'title_deed_copy',
  electrical_compliance_certificate: 'electrical_compliance_certificate',
  gas_compliance_certificate: 'gas_compliance_certificate',
  electric_fence_certificate: 'electric_fence_certificate',
  beetle_certificate: 'beetle_certificate',
  body_corporate_levy_clearance: 'levy_statement',
  body_corporate_statement: 'body_corporate_details',
  hoa_levy_clearance: 'hoa_levy_statement',
  lease_agreements: 'lease_agreement',
  zoning_use_information: 'zoning_certificate',
  vat_status_confirmation: 'vat_status_confirmation',
  zero_rated_going_concern_confirmation: 'vat_status_confirmation',
  bond_instruction: 'bond_approval',
  bond_grant_letter: 'grant_signed',
  bank_requirements: 'bond_approval',
  buyer_bank_fica: '',
  bond_documents: 'grant_signed',
  bank_signing_documents: 'grant_signed',
  guarantees_issued: 'grant_signed',
  cancellation_instruction: 'bond_cancellation_figures',
  existing_bond_account_details: 'bond_statement',
  cancellation_figures: 'bond_cancellation_figures',
  cancellation_guarantees: 'bond_cancellation_figures',
  bank_cancellation_documents: 'bond_cancellation_figures',
})

const CONTEXT_ALIASES = Object.freeze({
  buyer: BUYER_KEY_ALIASES,
  seller: SELLER_KEY_ALIASES,
  attorney: ATTORNEY_KEY_ALIASES,
  transfer_attorney: ATTORNEY_KEY_ALIASES,
  bond_attorney: ATTORNEY_KEY_ALIASES,
  cancellation_attorney: ATTORNEY_KEY_ALIASES,
})

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function inferContext(requirement = {}, explicitContext = '') {
  const normalized = normalizeKey(explicitContext)
  if (normalized) return normalized
  const owner = normalizeKey(requirement.ownerRole || requirement.requiredFrom || requirement.requiredFromRole || requirement.required_from_role || requirement.applies_to)
  if (owner.includes('seller')) return 'seller'
  if (owner.includes('buyer') || owner === 'client') return 'buyer'
  if (owner.includes('attorney')) return 'attorney'
  return owner || 'attorney'
}

function keyFromRequirement(requirement = {}) {
  return normalizeKey(
    requirement.canonicalDocumentRequestKey ||
      requirement.documentRequestCanonicalKey ||
      requirement.canonical_document_request_key ||
      requirement.key ||
      requirement.id ||
      requirement.requirement_key ||
      requirement.document_type ||
      requirement.documentType,
  )
}

export function resolveCanonicalDocumentRequestKey(requirementOrKey = {}, context = '') {
  const requirement = typeof requirementOrKey === 'string' ? { key: requirementOrKey } : requirementOrKey || {}
  const key = keyFromRequirement(requirement)
  if (!key) return ''
  if (getCanonicalDocumentRequestRequirement(key)) return key

  const normalizedContext = inferContext(requirement, context)
  const aliases = CONTEXT_ALIASES[normalizedContext] || CONTEXT_ALIASES[normalizeKey(context)] || {}
  if (aliases[key]) return aliases[key]

  if (key.startsWith('buyer_') || key.startsWith('seller_')) {
    return getCanonicalDocumentRequestRequirement(key) ? key : ''
  }

  return ''
}

export function getCanonicalDocumentRequestMetadata(requirementOrKey = {}, options = {}) {
  const context = options.context || options.ownerRole || options.requiredFrom || ''
  const canonicalKey = resolveCanonicalDocumentRequestKey(requirementOrKey, context)
  const canonicalRequirement = canonicalKey ? getCanonicalDocumentRequestRequirement(canonicalKey) : null
  return Object.freeze({
    canonicalDocumentRequestKey: canonicalKey || null,
    canonicalDocumentRequestKnown: Boolean(canonicalRequirement),
    canonicalDocumentRequest: canonicalRequirement,
    canonicalDocumentRequestLevel: canonicalRequirement?.level || null,
    canonicalDocumentRequestVisibility: canonicalRequirement?.visibility || null,
    canonicalDocumentRequestBlocker: canonicalRequirement?.blocker || null,
    canonicalDocumentRequestOwnerRole: canonicalRequirement?.ownerRole || null,
    documentRequestCanonicalAdapterVersion: DOCUMENT_REQUEST_CANONICAL_ADAPTER_VERSION,
  })
}

export function withCanonicalDocumentRequestMetadata(requirement = {}, options = {}) {
  return {
    ...requirement,
    ...getCanonicalDocumentRequestMetadata(requirement, options),
  }
}
