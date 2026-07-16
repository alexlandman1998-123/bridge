export const CROSS_MODULE_DOCUMENT_KEY_MAP_VERSION = 'cross_module_document_key_map_v2'

export const DOCUMENT_PARTY_ROLES = Object.freeze([
  'buyer',
  'seller',
  'agent',
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
  'bond_originator',
  'developer',
  'internal',
])

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

export function normalizeCrossModuleDocumentKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function uniqueNormalized(values = []) {
  return [...new Set(normalizeArray(values).map(normalizeCrossModuleDocumentKey).filter(Boolean))]
}

function documentDefinition({
  canonicalKey,
  label,
  ownerRole,
  responsibleRoles = [],
  packKey,
  category,
  aliases = [],
  modules = [],
}) {
  const key = normalizeCrossModuleDocumentKey(canonicalKey)
  return Object.freeze({
    canonicalKey: key,
    label,
    ownerRole,
    responsibleRoles: Object.freeze(uniqueNormalized([ownerRole, ...responsibleRoles])),
    packKey: normalizeCrossModuleDocumentKey(packKey),
    category: normalizeCrossModuleDocumentKey(category || packKey),
    aliases: Object.freeze(uniqueNormalized(aliases).filter((alias) => alias !== key)),
    modules: Object.freeze(uniqueNormalized(modules)),
  })
}

export const CROSS_MODULE_DOCUMENT_DEFINITIONS = Object.freeze([
  documentDefinition({
    canonicalKey: 'signed_mandate',
    label: 'Signed Mandate',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'seller_authority',
    aliases: ['mandate_signature'],
    modules: ['seller_portal', 'listing_documents', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'generated_mandate',
    label: 'Generated Mandate',
    ownerRole: 'agent',
    responsibleRoles: ['agent'],
    packKey: 'attorney_generated_documents',
    aliases: ['mandate_generated'],
    modules: ['listing_documents', 'transaction_documents', 'legal_workspace'],
  }),
  documentDefinition({
    canonicalKey: 'generated_otp',
    label: 'Generated OTP',
    ownerRole: 'agent',
    responsibleRoles: ['agent'],
    packKey: 'attorney_generated_documents',
    aliases: ['generated_offer_to_purchase', 'otp_generated', 'otp_pending_approval'],
    modules: ['buyer_onboarding', 'transaction_documents', 'legal_workspace'],
  }),
  documentDefinition({
    canonicalKey: 'signed_otp',
    label: 'Signed OTP / Sale Agreement',
    ownerRole: 'agent',
    responsibleRoles: ['buyer', 'seller', 'agent', 'transfer_attorney'],
    packKey: 'attorney_transfer_readiness',
    aliases: ['otp', 'otp_signed', 'signed_offer_to_purchase', 'sale_agreement_or_otp'],
    modules: ['buyer_onboarding', 'transaction_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'information_sheet',
    label: 'Information Sheet',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer', 'agent'],
    packKey: 'buyer_identity_fica',
    aliases: [],
    modules: ['buyer_onboarding', 'transaction_documents'],
  }),

  documentDefinition({
    canonicalKey: 'seller_id_document',
    label: 'Seller ID Document',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: ['seller_id', 'seller_fica', 'seller_director_ids', 'seller_trustee_ids'],
    modules: ['seller_portal', 'listing_documents', 'seller_leads', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_proof_of_address',
    label: 'Seller Proof of Address',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: ['seller_address'],
    modules: ['seller_portal', 'listing_documents', 'seller_leads', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_tax_number',
    label: 'Seller Tax Number',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: ['seller_tax_certificate', 'seller_income_tax_number'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_company_registration',
    label: 'Seller Company Registration',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: ['company_registration', 'company_registration_document', 'seller_company_registration_documents', 'seller_beneficial_ownership'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_trust_deed',
    label: 'Seller Trust Deed',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_letters_of_authority',
    label: 'Seller Letters of Authority',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_executor_authority',
    label: 'Seller Executor Authority',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: ['executor_authority'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_spouse_consent',
    label: 'Seller Spouse Consent',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_marriage_certificate',
    label: 'Seller Marriage Certificate',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: ['seller_marital_status_details'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_anc',
    label: 'Seller Antenuptial Contract',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: ['seller_anc_document'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'seller_divorce_order',
    label: 'Seller Divorce Order',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_identity_fica',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'company_resolution_to_sell',
    label: 'Company Resolution to Sell',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_authority',
    aliases: ['seller_company_resolution', 'seller_director_resolution_signature'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'trust_resolution_to_sell',
    label: 'Trust Resolution to Sell',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'seller_authority',
    aliases: ['seller_trustee_resolution', 'seller_trustee_resolution_signature'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'power_of_attorney',
    label: 'Power of Attorney',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'seller_authority',
    aliases: ['buyer_authority'],
    modules: ['seller_portal', 'buyer_onboarding', 'attorney_transfer'],
  }),

  documentDefinition({
    canonicalKey: 'title_deed_copy',
    label: 'Title Deed Copy',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_ownership',
    aliases: ['title_deed', 'title_deed_reference', 'final_title_deed_copy'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'deed_office_copy',
    label: 'Deeds Office Copy',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['agent', 'transfer_attorney'],
    packKey: 'property_ownership',
    aliases: ['deeds_office_copy'],
    modules: ['listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'sg_diagram',
    label: 'SG Diagram',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'property_ownership',
    aliases: ['surveyor_general_diagram'],
    modules: ['listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'erf_diagram',
    label: 'Erf Diagram',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'property_ownership',
    aliases: [],
    modules: ['listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'zoning_certificate',
    label: 'Zoning Certificate',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent', 'transfer_attorney'],
    packKey: 'property_ownership',
    aliases: ['zoning_use_information'],
    modules: ['listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'rates_account',
    label: 'Rates Account',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'property_ownership',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'rates_clearance_certificate',
    label: 'Rates Clearance Certificate',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_ownership',
    aliases: ['rates_clearance', 'clearance_documents'],
    modules: ['transaction_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'occupation_certificate',
    label: 'Occupation Certificate',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'developer', 'transfer_attorney'],
    packKey: 'property_ownership',
    aliases: ['nhbrc_compliance_documents'],
    modules: ['listing_documents', 'attorney_transfer', 'developer'],
  }),
  documentDefinition({
    canonicalKey: 'bond_statement',
    label: 'Bond Statement',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'property_finance_existing_bond',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'bond_cancellation'],
  }),
  documentDefinition({
    canonicalKey: 'bond_bank_details',
    label: 'Bond Bank Details',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'cancellation_attorney'],
    packKey: 'property_finance_existing_bond',
    aliases: ['seller_bond_cancellation_information', 'existing_bond_account_details'],
    modules: ['seller_portal', 'listing_documents', 'bond_cancellation'],
  }),
  documentDefinition({
    canonicalKey: 'bond_cancellation_notice',
    label: 'Bond Cancellation Notice',
    ownerRole: 'cancellation_attorney',
    responsibleRoles: ['seller', 'cancellation_attorney'],
    packKey: 'property_finance_existing_bond',
    aliases: ['cancellation_instruction', 'cancellation_confirmation', 'bank_cancellation_documents', 'seller_cancellation_documents_signature'],
    modules: ['bond_cancellation', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'bond_cancellation_attorney_details',
    label: 'Bond Cancellation Attorney Details',
    ownerRole: 'cancellation_attorney',
    responsibleRoles: ['agent', 'cancellation_attorney'],
    packKey: 'property_finance_existing_bond',
    aliases: [],
    modules: ['bond_cancellation', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'settlement_figure',
    label: 'Settlement Figure',
    ownerRole: 'cancellation_attorney',
    responsibleRoles: ['cancellation_attorney'],
    packKey: 'property_finance_existing_bond',
    aliases: ['settlement_figures', 'cancellation_figures', 'financial_settlement_documents'],
    modules: ['bond_cancellation', 'transaction_documents'],
  }),

  documentDefinition({
    canonicalKey: 'electrical_compliance_certificate',
    label: 'Electrical Compliance Certificate',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_compliance',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'gas_compliance_certificate',
    label: 'Gas Compliance Certificate',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_compliance',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'electric_fence_certificate',
    label: 'Electric Fence Certificate',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_compliance',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'plumbing_certificate',
    label: 'Plumbing Certificate',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_compliance',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'beetle_certificate',
    label: 'Beetle Certificate',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_compliance',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'solar_compliance_documents',
    label: 'Solar Compliance Documents',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_compliance',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'approved_building_plans',
    label: 'Approved Building Plans',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'developer', 'transfer_attorney'],
    packKey: 'property_compliance',
    aliases: ['building_plans'],
    modules: ['listing_documents', 'attorney_transfer', 'developer'],
  }),
  documentDefinition({
    canonicalKey: 'property_condition_disclosure',
    label: 'Property Condition Disclosure',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'property_compliance',
    aliases: ['defects_declaration'],
    modules: ['seller_portal', 'listing_documents', 'buyer_agency', 'attorney_transfer'],
  }),

  documentDefinition({
    canonicalKey: 'levy_statement',
    label: 'Levy Statement',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'sectional_title_body_corporate',
    aliases: ['levy_docs', 'body_corporate_statement'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'levy_clearance_certificate',
    label: 'Levy Clearance Certificate',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'sectional_title_body_corporate',
    aliases: ['levy_clearance', 'body_corporate_levy_clearance'],
    modules: ['transaction_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'body_corporate_details',
    label: 'Body Corporate Details',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'sectional_title_body_corporate',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'body_corporate_rules',
    label: 'Body Corporate Rules',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'sectional_title_body_corporate',
    aliases: ['sectional_title_conduct_rules', 'sectional_title_documents', 'hoa_body_corporate_rules'],
    modules: ['seller_portal', 'listing_documents', 'buyer_agency', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'body_corporate_insurance_schedule',
    label: 'Body Corporate Insurance Schedule',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'sectional_title_body_corporate',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'hoa_levy_statement',
    label: 'HOA Levy Statement',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'estate_hoa',
    aliases: ['hoa_docs'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'hoa_clearance_certificate',
    label: 'HOA Clearance Certificate',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'estate_hoa',
    aliases: ['hoa_levy_clearance'],
    modules: ['transaction_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'hoa_details',
    label: 'HOA Details',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'estate_hoa',
    aliases: ['hoa_contact_details', 'hoa_consent'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'estate_conduct_rules',
    label: 'Estate Conduct Rules',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'estate_hoa',
    aliases: ['hoa_conduct_rules'],
    modules: ['seller_portal', 'listing_documents', 'buyer_agency', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'lease_agreement',
    label: 'Lease Agreement',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'tenant_occupancy',
    aliases: ['tenant_docs', 'lease_agreements'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'tenant_details',
    label: 'Tenant Details',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'tenant_occupancy',
    aliases: ['occupancy_schedule'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'rental_schedule',
    label: 'Rental Schedule',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'tenant_occupancy',
    aliases: ['property_income_schedule'],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'deposit_details',
    label: 'Deposit Details',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'tenant_occupancy',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'notice_period_details',
    label: 'Notice Period Details',
    ownerRole: 'seller',
    responsibleRoles: ['seller'],
    packKey: 'tenant_occupancy',
    aliases: [],
    modules: ['seller_portal', 'listing_documents', 'attorney_transfer'],
  }),

  documentDefinition({
    canonicalKey: 'buyer_id_document',
    label: 'Buyer ID Document',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_identity_fica',
    aliases: [
      'id_document',
      'buyer_fica',
      'buyer_id',
      'purchaser_id',
      'purchaser_1_id',
      'passport_copy',
      'director_id',
      'trustee_id',
      'co_purchaser_id_document',
      'spouse_id',
      'spouse_id_optional',
      'buyer_director_ids',
      'buyer_trustee_ids',
      'buyer_bank_fica',
    ],
    modules: ['buyer_onboarding', 'buyer_agency', 'transaction_documents', 'attorney_transfer', 'bond_originator'],
  }),
  documentDefinition({
    canonicalKey: 'buyer_proof_of_address',
    label: 'Buyer Proof of Address',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_identity_fica',
    aliases: [
      'proof_of_address',
      'buyer_address',
      'purchaser_proof_of_address',
      'purchaser_1_proof_of_address',
      'co_purchaser_proof_of_address',
      'spouse_proof_of_address',
      'spouse_proof_of_address_optional',
      'director_proof_of_address',
      'trustee_proof_of_address',
      'buyer_business_address',
    ],
    modules: ['buyer_onboarding', 'buyer_agency', 'transaction_documents', 'attorney_transfer', 'bond_originator'],
  }),
  documentDefinition({
    canonicalKey: 'buyer_marriage_certificate',
    label: 'Buyer Marriage Certificate',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_identity_fica',
    aliases: ['marriage_certificate', 'buyer_marital_status_details'],
    modules: ['buyer_onboarding', 'buyer_agency', 'transaction_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'buyer_anc',
    label: 'Buyer Antenuptial Contract',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_identity_fica',
    aliases: ['anc_document_optional', 'anc_accrual_document_optional'],
    modules: ['buyer_onboarding', 'buyer_agency', 'transaction_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'buyer_company_registration',
    label: 'Buyer Company Registration',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_identity_fica',
    aliases: [
      'cipc_registration',
      'company_resolution',
      'buyer_company_registration_documents',
      'buyer_company_resolution',
      'buyer_beneficial_ownership',
      'buyer_director_resolution_signature',
    ],
    modules: ['buyer_onboarding', 'buyer_agency', 'transaction_documents', 'attorney_transfer', 'bond_originator'],
  }),
  documentDefinition({
    canonicalKey: 'buyer_trust_deed',
    label: 'Buyer Trust Deed',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_identity_fica',
    aliases: [
      'trust_deed',
      'letters_of_authority',
      'trust_resolution',
      'buyer_letters_of_authority',
      'buyer_trustee_resolution',
      'buyer_trust_beneficial_ownership',
      'buyer_trustee_resolution_signature',
    ],
    modules: ['buyer_onboarding', 'buyer_agency', 'transaction_documents', 'attorney_transfer', 'bond_originator'],
  }),
  documentDefinition({
    canonicalKey: 'ownership_split_confirmation',
    label: 'Ownership Split Confirmation',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_identity_fica',
    aliases: [],
    modules: ['buyer_onboarding', 'buyer_agency'],
  }),
  documentDefinition({
    canonicalKey: 'proof_of_funds',
    label: 'Proof of Funds',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_finance',
    aliases: ['cash_proof', 'proof_of_funds_cash_component', 'source_of_funds'],
    modules: ['buyer_onboarding', 'buyer_agency', 'transaction_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'reservation_deposit_proof',
    label: 'Reservation Deposit Proof',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_finance',
    aliases: ['reservation_deposit_pop'],
    modules: ['buyer_onboarding', 'buyer_agency', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'bond_preapproval',
    label: 'Bond Pre-approval',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer', 'bond_originator'],
    packKey: 'buyer_finance',
    aliases: ['bond_pre_approval'],
    modules: ['buyer_onboarding', 'buyer_agency', 'bond_originator'],
  }),
  documentDefinition({
    canonicalKey: 'bond_approval',
    label: 'Bond Approval',
    ownerRole: 'bond_originator',
    responsibleRoles: ['buyer', 'bond_originator'],
    packKey: 'buyer_finance',
    aliases: ['bank_approval_to_lodge', 'bond_approval_confirmation'],
    modules: ['buyer_onboarding', 'buyer_agency', 'transaction_documents', 'bond_originator'],
  }),
  documentDefinition({
    canonicalKey: 'grant_letter',
    label: 'Grant Letter',
    ownerRole: 'bond_originator',
    responsibleRoles: ['buyer', 'bond_originator'],
    packKey: 'buyer_finance',
    aliases: ['grant_signed', 'bond_grant_letter'],
    modules: ['buyer_onboarding', 'transaction_documents', 'bond_originator', 'bond_attorney'],
  }),
  documentDefinition({
    canonicalKey: 'bank_statements',
    label: 'Bank Statements',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_finance',
    aliases: ['bank_statements_3_months', 'bank_statements_6_months', 'bank_statements_12_months', 'entity_bank_statements', 'spouse_bank_statements'],
    modules: ['buyer_onboarding', 'buyer_agency', 'bond_originator'],
  }),
  documentDefinition({
    canonicalKey: 'payslips',
    label: 'Payslips',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_finance',
    aliases: ['payslips_3_months'],
    modules: ['buyer_onboarding', 'buyer_agency', 'bond_originator'],
  }),
  documentDefinition({
    canonicalKey: 'proof_of_income',
    label: 'Proof of Income',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer'],
    packKey: 'buyer_finance',
    aliases: [
      'income_verification',
      'financial_statements',
      'tax_returns_latest',
      'accountant_letter',
      'commission_statements',
      'contracts_or_invoices',
      'pension_proof',
      'income_explanation',
      'entity_financials',
      'entity_income_support',
      'entity_tax_clearance_optional',
      'spouse_income_support',
    ],
    modules: ['buyer_onboarding', 'buyer_agency', 'bond_originator'],
  }),

  documentDefinition({
    canonicalKey: 'bond_application_form',
    label: 'Bond Application Form',
    ownerRole: 'bond_originator',
    responsibleRoles: ['buyer', 'bond_originator'],
    packKey: 'bond_originator',
    aliases: ['bond_application'],
    modules: ['bond_originator', 'buyer_agency', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'affordability_assessment',
    label: 'Affordability Assessment',
    ownerRole: 'bond_originator',
    responsibleRoles: ['bond_originator'],
    packKey: 'bond_originator',
    aliases: [],
    modules: ['bond_originator', 'buyer_agency', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'bank_submission_confirmation',
    label: 'Bank Submission Confirmation',
    ownerRole: 'bond_originator',
    responsibleRoles: ['bond_originator'],
    packKey: 'bond_originator',
    aliases: [],
    modules: ['bond_originator', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'bank_feedback',
    label: 'Bank Feedback',
    ownerRole: 'bond_originator',
    responsibleRoles: ['bond_originator'],
    packKey: 'bond_originator',
    aliases: ['bank_requirements', 'bank_approval_conditions'],
    modules: ['bond_originator', 'transaction_documents', 'bond_attorney'],
  }),
  documentDefinition({
    canonicalKey: 'bond_instruction_to_attorneys',
    label: 'Bond Instruction to Attorneys',
    ownerRole: 'bond_originator',
    responsibleRoles: ['bond_originator', 'bond_attorney'],
    packKey: 'bond_originator',
    aliases: ['bond_instruction', 'buyer_signed_bond_documents', 'buyer_bond_documents_signature'],
    modules: ['bond_originator', 'transaction_documents', 'bond_attorney'],
  }),

  documentDefinition({
    canonicalKey: 'transfer_documents',
    label: 'Transfer Documents',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['transfer_attorney'],
    packKey: 'attorney_transfer_readiness',
    aliases: ['transfer_duty_information', 'developer_sale_pack', 'final_account', 'transfer_duty_receipt', 'unit_schedule', 'developer_signing_authority'],
    modules: ['transaction_documents', 'attorney_transfer', 'developer'],
  }),
  documentDefinition({
    canonicalKey: 'guarantees',
    label: 'Guarantees',
    ownerRole: 'bond_originator',
    responsibleRoles: ['bond_originator', 'bond_attorney', 'transfer_attorney'],
    packKey: 'attorney_transfer_readiness',
    aliases: ['guarantee_letter', 'guarantees_issued', 'cancellation_guarantees'],
    modules: ['transaction_documents', 'attorney_transfer', 'bond_attorney', 'bond_originator'],
  }),
  documentDefinition({
    canonicalKey: 'lodgement_confirmation',
    label: 'Lodgement Confirmation',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['transfer_attorney'],
    packKey: 'attorney_transfer_readiness',
    aliases: [],
    modules: ['transaction_documents', 'attorney_transfer'],
  }),
  documentDefinition({
    canonicalKey: 'registration_confirmation',
    label: 'Registration Confirmation',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['transfer_attorney'],
    packKey: 'attorney_transfer_readiness',
    aliases: ['bond_registration_confirmation'],
    modules: ['transaction_documents', 'attorney_transfer', 'attorney_closeout'],
  }),
  documentDefinition({
    canonicalKey: 'signed_transfer_documents',
    label: 'Signed Transfer Documents',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['buyer', 'seller', 'transfer_attorney'],
    packKey: 'attorney_generated_documents',
    aliases: ['transfer_document_pack', 'signed_transfer_pack', 'buyer_transfer_signature', 'seller_transfer_signature'],
    modules: ['transaction_documents', 'attorney_transfer', 'attorney_closeout'],
  }),
  documentDefinition({
    canonicalKey: 'signed_packet_version',
    label: 'Signed Packet Version',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['buyer', 'seller', 'agent', 'transfer_attorney', 'internal'],
    packKey: 'attorney_generated_documents',
    aliases: ['final_signed_packet', 'closing_pack'],
    modules: ['transaction_documents', 'legal_workspace'],
  }),
  documentDefinition({
    canonicalKey: 'signed_addendum',
    label: 'Signed Addendum',
    ownerRole: 'agent',
    responsibleRoles: ['buyer', 'seller', 'agent', 'transfer_attorney'],
    packKey: 'attorney_generated_documents',
    aliases: [],
    modules: ['transaction_documents', 'legal_workspace'],
  }),

  documentDefinition({
    canonicalKey: 'bond_documents',
    label: 'Bond Documents',
    ownerRole: 'bond_attorney',
    responsibleRoles: ['bond_attorney'],
    packKey: 'bond_originator',
    aliases: [],
    modules: ['bond_attorney', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'bank_signing_documents',
    label: 'Bank Signing Documents',
    ownerRole: 'bond_attorney',
    responsibleRoles: ['bond_attorney'],
    packKey: 'bond_originator',
    aliases: [],
    modules: ['bond_attorney', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'proof_of_insurance',
    label: 'Proof of Insurance',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer', 'bond_originator'],
    packKey: 'bond_originator',
    aliases: [],
    modules: ['bond_attorney', 'bond_originator', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'banking_mandate',
    label: 'Banking Mandate',
    ownerRole: 'buyer',
    responsibleRoles: ['buyer', 'bond_originator'],
    packKey: 'bond_originator',
    aliases: [],
    modules: ['bond_attorney', 'bond_originator', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'cancellation_consent',
    label: 'Cancellation Consent',
    ownerRole: 'cancellation_attorney',
    responsibleRoles: ['seller', 'cancellation_attorney'],
    packKey: 'property_finance_existing_bond',
    aliases: [],
    modules: ['bond_cancellation', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'proof_of_settlement',
    label: 'Proof of Settlement',
    ownerRole: 'cancellation_attorney',
    responsibleRoles: ['cancellation_attorney'],
    packKey: 'property_finance_existing_bond',
    aliases: [],
    modules: ['bond_cancellation', 'transaction_documents'],
  }),

  documentDefinition({
    canonicalKey: 'vat_status_confirmation',
    label: 'VAT Status Confirmation',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_compliance',
    aliases: [],
    modules: ['attorney_transfer', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'zero_rated_going_concern_confirmation',
    label: 'Zero-Rated Going Concern Confirmation',
    ownerRole: 'seller',
    responsibleRoles: ['seller', 'transfer_attorney'],
    packKey: 'property_compliance',
    aliases: [],
    modules: ['attorney_transfer', 'transaction_documents'],
  }),

  documentDefinition({
    canonicalKey: 'floor_plan',
    label: 'Floor Plan',
    ownerRole: 'agent',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'marketing_assets',
    aliases: [],
    modules: ['listing_documents'],
  }),
  documentDefinition({
    canonicalKey: 'property_photos',
    label: 'Property Photos',
    ownerRole: 'agent',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'marketing_assets',
    aliases: [],
    modules: ['listing_documents'],
  }),
  documentDefinition({
    canonicalKey: 'video_walkthrough',
    label: 'Video Walkthrough',
    ownerRole: 'agent',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'marketing_assets',
    aliases: [],
    modules: ['listing_documents'],
  }),
  documentDefinition({
    canonicalKey: 'matterport_virtual_tour',
    label: 'Matterport Virtual Tour',
    ownerRole: 'agent',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'marketing_assets',
    aliases: [],
    modules: ['listing_documents'],
  }),
  documentDefinition({
    canonicalKey: 'property_features_sheet',
    label: 'Property Features Sheet',
    ownerRole: 'agent',
    responsibleRoles: ['seller', 'agent'],
    packKey: 'marketing_assets',
    aliases: [],
    modules: ['listing_documents'],
  }),

  documentDefinition({
    canonicalKey: 'buyer_transfer_cost_invoice',
    label: 'Buyer Transfer Cost Invoice',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['transfer_attorney'],
    packKey: 'attorney_client_financials',
    aliases: [],
    modules: ['attorney_client_financials', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'seller_attorney_invoice',
    label: 'Seller Attorney Invoice',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['transfer_attorney'],
    packKey: 'attorney_client_financials',
    aliases: [],
    modules: ['attorney_client_financials', 'transaction_documents'],
  }),
  documentDefinition({
    canonicalKey: 'buyer_final_statement',
    label: 'Buyer Final Statement',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['transfer_attorney'],
    packKey: 'attorney_client_financials',
    aliases: [],
    modules: ['attorney_client_financials', 'transaction_documents', 'attorney_closeout'],
  }),
  documentDefinition({
    canonicalKey: 'seller_final_statement',
    label: 'Seller Final Statement',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['transfer_attorney'],
    packKey: 'attorney_client_financials',
    aliases: [],
    modules: ['attorney_client_financials', 'transaction_documents', 'attorney_closeout'],
  }),
  documentDefinition({
    canonicalKey: 'attorney_invoice',
    label: 'Attorney Invoice (Legacy)',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['transfer_attorney'],
    packKey: 'attorney_closeout',
    aliases: [],
    modules: ['attorney_closeout'],
  }),
  documentDefinition({
    canonicalKey: 'attorney_statement',
    label: 'Attorney Statement (Legacy)',
    ownerRole: 'transfer_attorney',
    responsibleRoles: ['transfer_attorney'],
    packKey: 'attorney_closeout',
    aliases: [],
    modules: ['attorney_closeout'],
  }),
  documentDefinition({
    canonicalKey: 'commission_statement',
    label: 'Commission Statement',
    ownerRole: 'bond_originator',
    responsibleRoles: ['bond_originator'],
    packKey: 'bond_originator_closeout',
    aliases: [],
    modules: ['bond_closeout'],
  }),
  documentDefinition({
    canonicalKey: 'commission_tax_invoice',
    label: 'Commission Tax Invoice',
    ownerRole: 'bond_originator',
    responsibleRoles: ['bond_originator'],
    packKey: 'bond_originator_closeout',
    aliases: [],
    modules: ['bond_closeout'],
  }),
])

function buildDefinitionMap(definitions = []) {
  return definitions.reduce((accumulator, definition) => {
    accumulator[definition.canonicalKey] = definition
    return accumulator
  }, {})
}

function buildAliasAudit(definitions = []) {
  const aliasMap = {}
  const duplicateAliases = []

  for (const definition of definitions) {
    for (const alias of uniqueNormalized([definition.canonicalKey, ...definition.aliases])) {
      if (aliasMap[alias] && aliasMap[alias] !== definition.canonicalKey) {
        duplicateAliases.push({
          alias,
          canonicalKeys: Object.freeze([aliasMap[alias], definition.canonicalKey]),
        })
        continue
      }
      aliasMap[alias] = definition.canonicalKey
    }
  }

  return {
    aliasMap: Object.freeze(aliasMap),
    duplicateAliases: Object.freeze(duplicateAliases),
  }
}

export const CROSS_MODULE_DOCUMENT_DEFINITION_BY_KEY = Object.freeze(buildDefinitionMap(CROSS_MODULE_DOCUMENT_DEFINITIONS))
const aliasAudit = buildAliasAudit(CROSS_MODULE_DOCUMENT_DEFINITIONS)
export const CROSS_MODULE_DOCUMENT_ALIAS_MAP = aliasAudit.aliasMap
export const CROSS_MODULE_DOCUMENT_ALIAS_COLLISIONS = aliasAudit.duplicateAliases

const CONTEXT_ROLE_ALIASES = Object.freeze({
  seller: Object.freeze({
    id_document: 'seller_id_document',
    proof_of_address: 'seller_proof_of_address',
    company_registration: 'seller_company_registration',
    company_registration_document: 'seller_company_registration',
    company_resolution: 'company_resolution_to_sell',
    trust_deed: 'seller_trust_deed',
    letters_of_authority: 'seller_letters_of_authority',
    trust_resolution: 'trust_resolution_to_sell',
    marital_status_details: 'seller_marriage_certificate',
  }),
  buyer: Object.freeze({
    id_document: 'buyer_id_document',
    proof_of_address: 'buyer_proof_of_address',
    company_registration: 'buyer_company_registration',
    company_registration_document: 'buyer_company_registration',
    company_resolution: 'buyer_company_registration',
    trust_deed: 'buyer_trust_deed',
    letters_of_authority: 'buyer_trust_deed',
    trust_resolution: 'buyer_trust_deed',
    marital_status_details: 'buyer_marriage_certificate',
  }),
})

function inferDocumentContextRole(context = {}) {
  const signals = [
    context.ownerRole,
    context.documentOwnerRole,
    context.requestedFromRole,
    context.requiredFromRole,
    context.expectedFromRole,
    context.role,
    context.appliesTo,
    context.groupKey,
    context.group_key,
    context.packKey,
    context.pack_key,
    context.visibleSection,
    context.visible_section,
    context.portalWorkspaceCategory,
    context.portal_workspace_category,
  ].map(normalizeCrossModuleDocumentKey).filter(Boolean)

  if (signals.some((signal) => signal === 'seller' || signal.includes('seller'))) return 'seller'
  if (signals.some((signal) => signal === 'buyer' || signal.includes('buyer') || signal === 'client' || signal === 'fica')) return 'buyer'
  return ''
}

function resolveContextualDocumentKey(value, context = {}) {
  const normalized = normalizeCrossModuleDocumentKey(value)
  const contextRole = inferDocumentContextRole(context)
  return CONTEXT_ROLE_ALIASES[contextRole]?.[normalized] || normalized
}

export function resolveCrossModuleDocumentKey(value, fallback = '') {
  const normalized = normalizeCrossModuleDocumentKey(value)
  if (!normalized) return normalizeCrossModuleDocumentKey(fallback)
  return CROSS_MODULE_DOCUMENT_ALIAS_MAP[normalized] || normalizeCrossModuleDocumentKey(fallback) || normalized
}

export function getCrossModuleDocumentDefinition(value) {
  const canonicalKey = resolveCrossModuleDocumentKey(value)
  return CROSS_MODULE_DOCUMENT_DEFINITION_BY_KEY[canonicalKey] || null
}

export function getCrossModuleDocumentOwnerRole(value) {
  return getCrossModuleDocumentDefinition(value)?.ownerRole || ''
}

export function getCrossModuleDocumentAliases(value) {
  const definition = getCrossModuleDocumentDefinition(value)
  if (!definition) return []
  return [definition.canonicalKey, ...definition.aliases]
}

export function resolveCrossModuleDocumentReference(value, context = {}) {
  const originalDocumentKey = normalizeCrossModuleDocumentKey(value)
  const contextualKey = resolveContextualDocumentKey(originalDocumentKey, context)
  const canonicalDocumentKey = resolveCrossModuleDocumentKey(contextualKey, contextualKey)
  const definition = CROSS_MODULE_DOCUMENT_DEFINITION_BY_KEY[canonicalDocumentKey] || null
  const fallbackPackKey = normalizeCrossModuleDocumentKey(context.packKey || context.pack_key || context.groupKey || context.group_key)

  return {
    originalDocumentKey,
    canonicalDocumentKey,
    crossModuleDocumentKey: canonicalDocumentKey,
    crossModuleDocumentMapVersion: CROSS_MODULE_DOCUMENT_KEY_MAP_VERSION,
    crossModuleDocumentKnown: Boolean(definition),
    documentOwnerRole: definition?.ownerRole || inferDocumentContextRole(context),
    documentResponsibleRoles: definition?.responsibleRoles ? [...definition.responsibleRoles] : [],
    documentPackKey: definition?.packKey || fallbackPackKey,
    documentCategory: definition?.category || '',
    documentLabel: definition?.label || '',
    documentAliases: definition ? [definition.canonicalKey, ...definition.aliases] : [],
  }
}

export function listCrossModuleDocumentDefinitions() {
  return [...CROSS_MODULE_DOCUMENT_DEFINITIONS]
}

export function listCrossModuleDocumentAliases() {
  return Object.entries(CROSS_MODULE_DOCUMENT_ALIAS_MAP)
    .map(([alias, canonicalKey]) => ({ alias, canonicalKey }))
    .sort((left, right) => left.alias.localeCompare(right.alias))
}

export function buildCrossModuleDocumentMapAudit(groups = {}) {
  const groupEntries = Object.entries(groups || {})
  const auditedGroups = groupEntries.map(([groupName, keys]) => {
    const rows = uniqueNormalized(keys).map((key) => {
      const canonicalKey = resolveCrossModuleDocumentKey(key)
      const definition = CROSS_MODULE_DOCUMENT_DEFINITION_BY_KEY[canonicalKey] || null
      return {
        key,
        canonicalKey,
        ownerRole: definition?.ownerRole || '',
        packKey: definition?.packKey || '',
        known: Boolean(definition),
      }
    })
    return {
      groupName,
      totalKeys: rows.length,
      unknownKeys: rows.filter((row) => !row.known).map((row) => row.key),
      rows,
    }
  })

  return {
    version: CROSS_MODULE_DOCUMENT_KEY_MAP_VERSION,
    totalDefinitions: CROSS_MODULE_DOCUMENT_DEFINITIONS.length,
    totalAliases: Object.keys(CROSS_MODULE_DOCUMENT_ALIAS_MAP).length,
    duplicateAliases: [...CROSS_MODULE_DOCUMENT_ALIAS_COLLISIONS],
    unknownKeys: auditedGroups.flatMap((group) => group.unknownKeys.map((key) => ({ groupName: group.groupName, key }))),
    groups: auditedGroups,
  }
}
