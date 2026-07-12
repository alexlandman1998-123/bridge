export const LEGAL_SCENARIO_MATRIX_VERSION = 'legal_scenario_matrix_v1'

export const LEGAL_SCENARIO_STATUSES = Object.freeze({
  supported: 'supported',
  manualReview: 'manual_review',
  unsupported: 'unsupported',
})

export const LEGAL_SCENARIO_ACTIONS = Object.freeze({
  supported: 'allow_automated_baseline',
  manual_review: 'collect_intake_then_pause_for_conveyancer_review',
  unsupported: 'stop_automated_workflow',
})

const STATUS_PRIORITY = Object.freeze({
  supported: 0,
  manual_review: 1,
  unsupported: 2,
})

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

function freezeArray(values = []) {
  return Object.freeze([...values])
}

function createAliasMap(definitions = {}) {
  const entries = []
  for (const [canonical, aliases] of Object.entries(definitions)) {
    entries.push([normalizeKey(canonical), canonical])
    for (const alias of aliases || []) {
      entries.push([normalizeKey(alias), canonical])
    }
  }
  return Object.freeze(Object.fromEntries(entries.filter(([key]) => key)))
}

const AXIS_ALIASES = createAliasMap({
  buyer: ['purchaser', 'buyer_type', 'purchaser_type'],
  seller: ['owner', 'vendor', 'seller_type', 'owner_type'],
  finance: ['funding', 'payment', 'finance_type'],
  property: ['property_type', 'tenure'],
  condition: ['suspensive_condition', 'special_condition', 'workflow_condition'],
})

function normalizeAxis(value) {
  const normalized = normalizeKey(value)
  return AXIS_ALIASES[normalized] || normalized
}

function defineScenario(definition = {}) {
  return Object.freeze({
    key: definition.key,
    axis: definition.axis,
    value: definition.value || definition.key,
    title: definition.title || definition.key,
    status: definition.status || LEGAL_SCENARIO_STATUSES.manualReview,
    aliases: freezeArray(definition.aliases || []),
    requiredQuestions: freezeArray(definition.requiredQuestions || []),
    requiredDocuments: freezeArray(definition.requiredDocuments || []),
    workflow: freezeArray(definition.workflow || []),
    legalChecks: freezeArray(definition.legalChecks || []),
    partnerTasks: freezeArray(definition.partnerTasks || []),
    boundaryReason: definition.boundaryReason || '',
  })
}

function supported(definition = {}) {
  return defineScenario({ ...definition, status: LEGAL_SCENARIO_STATUSES.supported })
}

function manualReview(definition = {}) {
  return defineScenario({ ...definition, status: LEGAL_SCENARIO_STATUSES.manualReview })
}

function unsupported(definition = {}) {
  return defineScenario({ ...definition, status: LEGAL_SCENARIO_STATUSES.unsupported })
}

export const LEGAL_SCENARIOS_BY_AXIS = Object.freeze({
  buyer: freezeArray([
    supported({
      key: 'buyer_individual',
      axis: 'buyer',
      value: 'individual',
      title: 'Individual buyer',
      aliases: ['single', 'sole_buyer', 'sole_purchaser', 'natural_person', 'private_individual'],
      requiredQuestions: ['identity', 'tax', 'nationality', 'residency', 'address', 'marital_status', 'employment', 'finance', 'source_of_funds'],
      requiredDocuments: ['id_or_passport', 'proof_of_address', 'tax_number_if_available', 'finance_proof'],
      workflow: ['buyer_onboarding', 'otp', 'finance', 'transfer'],
      legalChecks: ['fica', 'capacity', 'marital_status', 'source_of_funds'],
    }),
    supported({
      key: 'buyer_married_coc',
      axis: 'buyer',
      value: 'married_coc',
      title: 'Married in community buyer',
      aliases: ['married', 'married_cop', 'married_in_community', 'married_in_community_of_property', 'coc'],
      requiredQuestions: ['buyer_identity', 'spouse_details', 'spouse_identity', 'marital_regime', 'finance'],
      requiredDocuments: ['buyer_id', 'spouse_id', 'marriage_certificate', 'proof_of_address', 'finance_proof'],
      workflow: ['buyer_onboarding', 'spouse_signing_checks', 'finance', 'transfer'],
      legalChecks: ['spouse_authority', 'spouse_fica_where_relevant', 'marital_regime'],
    }),
    supported({
      key: 'buyer_married_anc',
      axis: 'buyer',
      value: 'married_anc',
      title: 'Married ANC buyer',
      aliases: ['anc', 'married_out_of_community', 'married_out_of_community_of_property'],
      requiredQuestions: ['buyer_identity', 'spouse_details', 'anc_indicator', 'finance'],
      requiredDocuments: ['buyer_id', 'proof_of_address', 'marriage_certificate', 'anc_if_required', 'finance_proof'],
      workflow: ['buyer_onboarding', 'marital_document_check', 'finance', 'transfer'],
      legalChecks: ['marital_regime', 'signing_implications'],
    }),
    supported({
      key: 'buyer_married_anc_accrual',
      axis: 'buyer',
      value: 'married_anc_accrual',
      title: 'Married ANC with accrual buyer',
      aliases: ['anc_with_accrual', 'married_out_of_community_with_accrual'],
      requiredQuestions: ['buyer_identity', 'spouse_details', 'anc_indicator', 'accrual_indicator', 'finance'],
      requiredDocuments: ['buyer_id', 'proof_of_address', 'marriage_certificate', 'anc_accrual_docs', 'finance_proof'],
      workflow: ['buyer_onboarding', 'marital_document_check', 'finance', 'transfer'],
      legalChecks: ['accrual_regime', 'signing_implications'],
    }),
    supported({
      key: 'buyer_co_purchasers_natural_persons',
      axis: 'buyer',
      value: 'co_purchasers_natural_persons',
      title: 'Natural-person co-purchasers',
      aliases: ['co_purchasers', 'multiple_buyers', 'joint_buyers', 'joint_purchasers'],
      requiredQuestions: ['each_purchaser_identity', 'each_purchaser_address', 'marital_statuses', 'ownership_shares', 'consents', 'finance_contributions'],
      requiredDocuments: ['each_purchaser_id', 'each_purchaser_proof_of_address', 'ownership_split_confirmation', 'finance_proof'],
      workflow: ['buyer_onboarding', 'ownership_share_validation', 'otp', 'finance', 'transfer'],
      legalChecks: ['shares_total_100', 'all_purchasers_consent', 'fica_per_purchaser'],
    }),
    supported({
      key: 'buyer_company',
      axis: 'buyer',
      value: 'company',
      title: 'Company buyer',
      aliases: ['business', 'corporate', 'pty', 'pty_ltd', 'private_company'],
      requiredQuestions: ['company_registration', 'directors', 'beneficial_owners', 'authorised_signatory', 'finance', 'tax_or_vat_where_relevant'],
      requiredDocuments: ['registration_docs', 'director_ids', 'company_resolution', 'signatory_id', 'proof_of_address', 'beneficial_owner_docs', 'finance_proof'],
      workflow: ['entity_onboarding', 'authority_check', 'finance', 'transfer'],
      legalChecks: ['company_status', 'authority', 'fica', 'beneficial_ownership'],
    }),
    supported({
      key: 'buyer_trust',
      axis: 'buyer',
      value: 'trust',
      title: 'Trust buyer',
      aliases: ['family_trust'],
      requiredQuestions: ['trust_registration', 'trustees', 'authorised_trustee', 'trust_address', 'finance', 'beneficial_owners'],
      requiredDocuments: ['trust_deed', 'letters_of_authority', 'trustee_ids', 'trust_resolution', 'proof_of_address', 'finance_proof'],
      workflow: ['entity_onboarding', 'trustee_authority', 'finance', 'transfer'],
      legalChecks: ['current_authority', 'trustee_signing', 'fica', 'beneficial_ownership'],
    }),
    manualReview({
      key: 'buyer_foreign_individual',
      axis: 'buyer',
      value: 'foreign_purchaser',
      title: 'Foreign individual buyer',
      aliases: ['foreign', 'foreign_individual', 'foreign_buyer', 'non_resident', 'non_resident_individual'],
      requiredQuestions: ['passport', 'nationality', 'residency', 'tax', 'source_of_funds', 'source_of_wealth', 'payment_route'],
      requiredDocuments: ['passport', 'visa_or_residency_evidence', 'proof_of_address', 'source_of_funds', 'source_of_wealth', 'exchange_control_declaration', 'finance_proof'],
      workflow: ['buyer_onboarding', 'compliance_review', 'finance', 'transfer'],
      legalChecks: ['enhanced_due_diligence', 'exchange_control_route', 'tax_residency'],
      boundaryReason: 'Foreign individual purchases need compliance and exchange-control review before full automation.',
    }),
    manualReview({
      key: 'buyer_foreign_company',
      axis: 'buyer',
      value: 'foreign_company',
      title: 'Foreign company buyer',
      aliases: ['foreign_corporate', 'offshore_company'],
      requiredQuestions: ['foreign_registration', 'jurisdiction', 'directors', 'beneficial_owners', 'authorised_signatory', 'source_of_funds', 'payment_route'],
      requiredDocuments: ['foreign_registration', 'authenticated_authority', 'director_ids_or_passports', 'beneficial_owner_docs', 'source_of_funds_docs'],
      workflow: ['entity_onboarding', 'compliance_legal_review', 'finance', 'transfer'],
      legalChecks: ['enhanced_due_diligence', 'foreign_authority', 'authentication', 'exchange_control'],
      boundaryReason: 'Foreign entity authority and funds cannot be inferred from ordinary company rules.',
    }),
    manualReview({
      key: 'buyer_foreign_trust',
      axis: 'buyer',
      value: 'foreign_trust',
      title: 'Foreign trust buyer',
      aliases: ['offshore_trust'],
      requiredQuestions: ['foreign_trust_jurisdiction', 'trustees', 'beneficial_owners', 'authority', 'source_of_funds'],
      requiredDocuments: ['foreign_trust_deed', 'authenticated_trustee_authority', 'trustee_ids_or_passports', 'beneficial_owner_docs', 'source_of_funds_docs'],
      workflow: ['entity_onboarding', 'compliance_legal_review', 'finance', 'transfer'],
      legalChecks: ['enhanced_due_diligence', 'foreign_trust_authority', 'exchange_control'],
    }),
    manualReview({
      key: 'buyer_close_corporation',
      axis: 'buyer',
      value: 'close_corporation',
      title: 'Close corporation buyer',
      aliases: ['cc', 'close_corp'],
      requiredQuestions: ['cc_registration', 'members', 'beneficial_owners', 'authorised_member_or_signatory', 'finance'],
      requiredDocuments: ['ck_documents', 'member_ids', 'member_resolution', 'beneficial_owner_docs', 'finance_proof'],
      workflow: ['entity_onboarding', 'authority_review', 'finance', 'transfer'],
      legalChecks: ['member_authority', 'fica'],
      boundaryReason: 'Close corporations require first-class member authority rules rather than company aliasing.',
    }),
    manualReview({
      key: 'buyer_power_of_attorney',
      axis: 'buyer',
      value: 'power_of_attorney',
      title: 'Buyer using power of attorney',
      aliases: ['poa', 'buyer_poa', 'attorney'],
      requiredQuestions: ['principal_details', 'representative_details', 'poa_scope', 'expiry', 'signing_location', 'authentication'],
      requiredDocuments: ['power_of_attorney', 'principal_id', 'representative_id', 'authority_proof', 'authentication_if_foreign'],
      workflow: ['buyer_onboarding', 'poa_review', 'otp_signing', 'transfer'],
      legalChecks: ['poa_validity', 'authority_scope', 'capacity'],
    }),
    manualReview({
      key: 'buyer_minor',
      axis: 'buyer',
      value: 'minor',
      title: 'Minor buyer',
      aliases: ['under_18', 'child_buyer'],
      requiredQuestions: ['minor_identity', 'guardian_details', 'source_of_funds', 'ownership_intention'],
      requiredDocuments: ['minor_birth_certificate_or_id', 'guardian_id', 'authority_or_court_docs_if_required', 'finance_proof'],
      workflow: ['intake', 'legal_review', 'manual_continuation'],
      legalChecks: ['capacity', 'guardian_or_court_authority'],
    }),
    manualReview({
      key: 'buyer_deceased_estate',
      axis: 'buyer',
      value: 'deceased_estate',
      title: 'Deceased estate buyer',
      aliases: ['estate_late', 'estate'],
      requiredQuestions: ['estate_details', 'executor_details', 'authority', 'source_of_funds'],
      requiredDocuments: ['letters_of_executorship_or_authority', 'executor_id', 'estate_bank_or_source_docs'],
      workflow: ['intake', 'legal_review', 'manual_continuation'],
      legalChecks: ['executor_authority', 'estate_capacity'],
    }),
    manualReview({
      key: 'buyer_insolvent',
      axis: 'buyer',
      value: 'insolvent',
      title: 'Insolvent or sequestrated buyer',
      aliases: ['sequestrated', 'insolvency'],
      requiredQuestions: ['insolvency_status', 'trustee_or_curator_details', 'authority'],
      requiredDocuments: ['trustee_or_curator_appointment', 'authority_docs', 'finance_or_source_docs'],
      workflow: ['intake', 'legal_review', 'manual_continuation'],
      legalChecks: ['capacity', 'insolvency_authority'],
    }),
    manualReview({
      key: 'buyer_curatorship',
      axis: 'buyer',
      value: 'curatorship',
      title: 'Buyer under curatorship or administration',
      aliases: ['administration', 'administrator', 'curator'],
      requiredQuestions: ['curator_or_administrator_details', 'authority', 'transaction_scope'],
      requiredDocuments: ['court_or_order_documents', 'curator_id', 'authority_docs'],
      workflow: ['intake', 'legal_review', 'manual_continuation'],
      legalChecks: ['capacity', 'authority'],
    }),
    unsupported({
      key: 'buyer_business_rescue',
      axis: 'buyer',
      value: 'business_rescue',
      title: 'Buyer in business rescue',
      aliases: ['business_rescue_buyer', 'company_in_business_rescue'],
      requiredQuestions: ['business_rescue_details_for_triage'],
      requiredDocuments: ['business_rescue_practitioner_docs_if_collected_manually'],
      workflow: ['unsupported_stop'],
      legalChecks: ['business_rescue_authority_outside_current_workflow'],
      boundaryReason: 'Business rescue is outside automated buyer workflow scope.',
    }),
    unsupported({
      key: 'buyer_liquidation',
      axis: 'buyer',
      value: 'liquidation',
      title: 'Buyer in liquidation',
      aliases: ['liquidated_company', 'company_liquidation', 'liquidation_buyer'],
      requiredQuestions: ['liquidator_details_for_triage'],
      requiredDocuments: ['liquidator_appointment_docs_if_collected_manually'],
      workflow: ['unsupported_stop'],
      legalChecks: ['liquidation_authority_outside_current_workflow'],
      boundaryReason: 'Liquidation is outside automated buyer workflow scope.',
    }),
    manualReview({
      key: 'buyer_other_legal_entity',
      axis: 'buyer',
      value: 'other',
      title: 'Other buyer legal type',
      aliases: ['other_legal_entity', 'legal_entity', 'unknown_entity'],
      workflow: ['intake', 'legal_review'],
      boundaryReason: 'Other buyer types must be classified by a versioned rule before automation.',
    }),
  ]),
  seller: freezeArray([
    supported({
      key: 'seller_individual',
      axis: 'seller',
      value: 'individual',
      title: 'Individual seller',
      aliases: ['single', 'sole_owner', 'natural_person', 'private_individual'],
      requiredQuestions: ['identity', 'tax', 'address', 'marital_status', 'mandate', 'property', 'existing_bond', 'occupancy'],
      requiredDocuments: ['id', 'proof_of_address', 'signed_mandate', 'title_deed_or_rates_docs', 'disclosure', 'compliance_certificates'],
      workflow: ['seller_onboarding', 'mandate', 'offer', 'transfer'],
      legalChecks: ['fica', 'capacity', 'mandate_validity', 'disclosure'],
    }),
    supported({
      key: 'seller_married',
      axis: 'seller',
      value: 'married',
      title: 'Married seller',
      aliases: ['married_cop', 'married_anc', 'married_in_community', 'married_out_of_community', 'anc'],
      requiredQuestions: ['seller_identity', 'spouse_details', 'marital_regime', 'consent_need'],
      requiredDocuments: ['seller_id', 'spouse_id', 'marriage_certificate', 'spouse_consent', 'anc_if_relevant'],
      workflow: ['seller_onboarding', 'spouse_authority_check', 'mandate', 'offer', 'transfer'],
      legalChecks: ['matrimonial_authority', 'signing'],
    }),
    supported({
      key: 'seller_multiple_owners',
      axis: 'seller',
      value: 'multiple_owners',
      title: 'Multiple natural-person owners',
      aliases: ['multiple_individuals', 'multiple', 'joint', 'joint_owners'],
      requiredQuestions: ['each_owner_identity', 'share', 'consent', 'contact', 'marital_status'],
      requiredDocuments: ['each_owner_id', 'proof_of_address', 'ownership_split', 'all_owner_consent_or_authority'],
      workflow: ['seller_onboarding', 'owner_completeness', 'mandate', 'offer', 'transfer'],
      legalChecks: ['all_owners_captured', 'all_owners_consenting'],
    }),
    supported({
      key: 'seller_company',
      axis: 'seller',
      value: 'company',
      title: 'Company seller',
      aliases: ['business', 'corporate', 'pty', 'pty_ltd', 'private_company'],
      requiredQuestions: ['company_registration', 'directors', 'beneficial_owners', 'authorised_signatory', 'mandate_authority'],
      requiredDocuments: ['registration_docs', 'director_ids', 'company_resolution', 'signatory_id', 'proof_of_address'],
      workflow: ['entity_onboarding', 'authority_check', 'mandate', 'offer', 'transfer'],
      legalChecks: ['company_status', 'authority', 'fica', 'beneficial_ownership'],
    }),
    supported({
      key: 'seller_trust',
      axis: 'seller',
      value: 'trust',
      title: 'Trust seller',
      aliases: ['family_trust'],
      requiredQuestions: ['trust_registration', 'trustees', 'authorised_trustee', 'mandate_authority'],
      requiredDocuments: ['trust_deed', 'letters_of_authority', 'trustee_ids', 'trust_resolution', 'signatory_id'],
      workflow: ['entity_onboarding', 'trustee_authority', 'mandate', 'offer', 'transfer'],
      legalChecks: ['current_letters', 'trustee_signing_authority', 'fica'],
    }),
    supported({
      key: 'seller_deceased_estate',
      axis: 'seller',
      value: 'deceased_estate',
      title: 'Deceased estate seller',
      aliases: ['deceased', 'estate', 'estate_late'],
      requiredQuestions: ['executor_details', 'estate_reference', 'authority', 'property_or_mandate_details'],
      requiredDocuments: ['letters_of_executorship_or_authority', 'executor_id', 'death_certificate', 'estate_docs', 'title_or_rates_docs'],
      workflow: ['estate_onboarding', 'authority_check', 'mandate', 'offer', 'transfer'],
      legalChecks: ['executor_authority', 'estate_capacity'],
    }),
    manualReview({
      key: 'seller_power_of_attorney',
      axis: 'seller',
      value: 'power_of_attorney',
      title: 'Seller using power of attorney',
      aliases: ['poa', 'seller_poa', 'attorney'],
      requiredQuestions: ['principal_details', 'representative_details', 'poa_scope', 'authority_status', 'authentication'],
      requiredDocuments: ['power_of_attorney', 'principal_id', 'representative_id', 'authority_proof', 'authentication_if_foreign'],
      workflow: ['poa_onboarding', 'attorney_review', 'mandate_or_offer', 'transfer'],
      legalChecks: ['poa_validity', 'authority_scope', 'signing_capacity'],
      boundaryReason: 'Seller POA can be captured, but attorney approval must remain mandatory.',
    }),
    manualReview({
      key: 'seller_foreign_individual',
      axis: 'seller',
      value: 'foreign_individual',
      title: 'Foreign individual seller',
      aliases: ['foreign', 'foreign_owner', 'non_resident'],
      requiredQuestions: ['passport', 'residency', 'proceeds_route', 'tax', 'bank_or_remittance', 'signing_location'],
      requiredDocuments: ['passport', 'proof_of_address', 'tax_docs', 'remittance_or_exchange_control_docs', 'poa_or_authentication_if_signing_abroad'],
      workflow: ['seller_onboarding', 'compliance_review', 'mandate_or_offer', 'transfer'],
      legalChecks: ['enhanced_due_diligence', 'exchange_control_or_remittance', 'tax'],
    }),
    manualReview({
      key: 'seller_foreign_company',
      axis: 'seller',
      value: 'foreign_company',
      title: 'Foreign company seller',
      aliases: ['foreign_corporate', 'offshore_company'],
      requiredQuestions: ['foreign_registration', 'directors', 'beneficial_owners', 'authority', 'proceeds_route'],
      requiredDocuments: ['foreign_registration', 'authenticated_authority', 'director_ids_or_passports', 'beneficial_owner_docs'],
      workflow: ['entity_onboarding', 'compliance_legal_review', 'mandate_or_offer'],
      legalChecks: ['foreign_authority', 'enhanced_due_diligence', 'remittance'],
    }),
    manualReview({
      key: 'seller_close_corporation',
      axis: 'seller',
      value: 'close_corporation',
      title: 'Close corporation seller',
      aliases: ['cc', 'close_corp'],
      requiredQuestions: ['cc_registration', 'members', 'beneficial_owners', 'authorised_member', 'mandate_authority'],
      requiredDocuments: ['cc_docs', 'member_ids', 'member_resolution', 'beneficial_owner_docs'],
      workflow: ['entity_onboarding', 'authority_review', 'mandate_or_offer'],
      legalChecks: ['member_authority', 'fica'],
    }),
    manualReview({
      key: 'seller_insolvent_estate',
      axis: 'seller',
      value: 'insolvent_estate',
      title: 'Insolvent estate seller',
      aliases: ['insolvent', 'sequestrated', 'insolvency'],
      requiredQuestions: ['trustee_details', 'authority', 'property_authority', 'sale_approval'],
      requiredDocuments: ['trustee_appointment', 'authority_docs', 'court_or_master_docs_if_required'],
      workflow: ['intake', 'legal_review', 'manual_continuation'],
      legalChecks: ['insolvency_authority'],
    }),
    manualReview({
      key: 'seller_minor',
      axis: 'seller',
      value: 'minor',
      title: 'Minor seller',
      aliases: ['under_18', 'child_owner'],
      requiredQuestions: ['minor_details', 'guardian_or_authority', 'property_share'],
      requiredDocuments: ['minor_id_or_birth_certificate', 'guardian_id', 'court_or_authority_docs'],
      workflow: ['intake', 'legal_review', 'manual_continuation'],
      legalChecks: ['capacity', 'guardian_or_court_authority'],
    }),
    manualReview({
      key: 'seller_curatorship',
      axis: 'seller',
      value: 'curatorship',
      title: 'Seller under curatorship or administration',
      aliases: ['administration', 'administrator', 'curator'],
      requiredQuestions: ['curator_or_administrator_details', 'authority'],
      requiredDocuments: ['court_or_order_docs', 'curator_id', 'authority_docs'],
      workflow: ['intake', 'legal_review', 'manual_continuation'],
      legalChecks: ['capacity', 'authority'],
    }),
    unsupported({
      key: 'seller_business_rescue',
      axis: 'seller',
      value: 'business_rescue',
      title: 'Company in business rescue',
      aliases: ['business_rescue_seller'],
      requiredQuestions: ['business_rescue_details_for_triage'],
      requiredDocuments: ['business_rescue_practitioner_docs_if_collected_manually'],
      workflow: ['unsupported_stop'],
      legalChecks: ['business_rescue_authority_outside_current_workflow'],
      boundaryReason: 'Business rescue is outside automated workflow scope.',
    }),
    unsupported({
      key: 'seller_liquidation',
      axis: 'seller',
      value: 'liquidation',
      title: 'Company in liquidation',
      aliases: ['liquidated_company', 'company_liquidation'],
      requiredQuestions: ['liquidator_details_for_triage'],
      requiredDocuments: ['liquidator_appointment_docs_if_collected_manually'],
      workflow: ['unsupported_stop'],
      legalChecks: ['liquidation_authority_outside_current_workflow'],
      boundaryReason: 'Liquidation is outside automated workflow scope.',
    }),
    manualReview({
      key: 'seller_other_legal_entity',
      axis: 'seller',
      value: 'other',
      title: 'Other seller legal type',
      aliases: ['other_legal_entity', 'legal_entity', 'unknown_entity'],
      workflow: ['intake', 'legal_review'],
      boundaryReason: 'Other seller types must be classified by a versioned rule before automation.',
    }),
  ]),
  finance: freezeArray([
    supported({
      key: 'finance_cash',
      axis: 'finance',
      value: 'cash',
      title: 'Cash finance',
      aliases: ['cash_sale', 'cash_deal', 'proof_of_funds'],
      requiredQuestions: ['cash_amount', 'source_of_funds', 'deposit', 'payer', 'third_party_payer'],
      requiredDocuments: ['proof_of_funds', 'bank_statement_or_source_docs', 'third_party_fica_if_applicable'],
      workflow: ['finance_cash', 'proof_review', 'transfer'],
      legalChecks: ['source_of_funds', 'third_party_payer_check'],
    }),
    supported({
      key: 'finance_bond',
      axis: 'finance',
      value: 'bond',
      title: 'Bond finance',
      aliases: ['bonded', 'bond_finance', 'mortgage', 'home_loan'],
      requiredQuestions: ['bond_amount', 'bank_or_originator', 'preapproval', 'bond_status', 'affordability_consent'],
      requiredDocuments: ['bond_application_docs', 'proof_of_income', 'bank_statements', 'approval_or_grant', 'bond_instruction'],
      workflow: ['finance_bond', 'originator_or_bank', 'transfer'],
      legalChecks: ['affordability_consent', 'bond_approval_vs_preapproval'],
    }),
    supported({
      key: 'finance_hybrid',
      axis: 'finance',
      value: 'hybrid',
      title: 'Hybrid finance',
      aliases: ['combination', 'cash_and_bond', 'partial_bond', 'cash_bond', 'bond_cash', 'cash+bond'],
      requiredQuestions: ['cash_amount', 'bond_amount', 'source_of_cash', 'bank_or_originator'],
      requiredDocuments: ['proof_of_cash_component', 'bond_docs', 'approval_or_grant'],
      workflow: ['finance_hybrid', 'cash_proof', 'bond_proof', 'transfer'],
      legalChecks: ['cash_plus_bond_sum', 'source_of_funds', 'bond_approval'],
    }),
    manualReview({
      key: 'finance_developer',
      axis: 'finance',
      value: 'developer',
      title: 'Developer finance',
      aliases: ['developer_finance'],
      requiredQuestions: ['developer_terms', 'repayment_or_discount_terms', 'conditions'],
      requiredDocuments: ['developer_finance_docs', 'sale_terms', 'approval_docs'],
      workflow: ['intake', 'manual_finance_review'],
      legalChecks: ['developer_specific_finance_authority'],
    }),
    manualReview({
      key: 'finance_third_party_payer',
      axis: 'finance',
      value: 'third_party_payer',
      title: 'Third-party payer',
      aliases: ['third_party_payment'],
      requiredQuestions: ['payer_identity', 'relationship', 'source_of_funds', 'amount'],
      requiredDocuments: ['payer_id_or_fica', 'proof_of_funds', 'declaration'],
      workflow: ['finance_review', 'compliance_gate'],
      legalChecks: ['enhanced_due_diligence', 'source_of_funds'],
    }),
    manualReview({
      key: 'finance_offshore_funds',
      axis: 'finance',
      value: 'offshore_funds',
      title: 'Offshore funds',
      aliases: ['foreign_funds', 'international_funds'],
      requiredQuestions: ['country', 'payer', 'authorised_dealer', 'remittance_route', 'source_of_funds'],
      requiredDocuments: ['offshore_bank_proof', 'authorised_dealer_evidence', 'source_of_funds_docs'],
      workflow: ['finance_review', 'compliance_gate'],
      legalChecks: ['exchange_control', 'enhanced_due_diligence'],
    }),
    manualReview({
      key: 'finance_unknown',
      axis: 'finance',
      value: 'unknown',
      title: 'Unknown finance',
      aliases: ['unclear', 'not_set'],
      workflow: ['intake', 'finance_classification'],
      boundaryReason: 'Unknown finance must be classified before document automation can proceed.',
    }),
  ]),
  property: freezeArray([
    supported({
      key: 'property_residential',
      axis: 'property',
      value: 'residential',
      title: 'Freehold residential resale',
      aliases: ['freehold_residential_resale', 'house', 'apartment', 'townhouse', 'cluster', 'duplex', 'penthouse', 'freehold', 'full_title'],
      requiredQuestions: ['address', 'title', 'rates', 'disclosure', 'occupancy', 'certificates'],
      requiredDocuments: ['title_deed_copy', 'rates_account_or_clearance', 'disclosure', 'required_certificates'],
      workflow: ['listing', 'mandate', 'offer', 'transfer', 'registration'],
      legalChecks: ['mandate', 'disclosure', 'fica', 'rates'],
    }),
    supported({
      key: 'property_sectional_title',
      axis: 'property',
      value: 'sectional_title',
      title: 'Sectional title',
      aliases: ['sectional', 'sectional_scheme', 'body_corporate'],
      requiredQuestions: ['scheme', 'unit_or_section', 'body_corporate', 'levies', 'exclusive_use'],
      requiredDocuments: ['levy_statement_or_clearance', 'body_corporate_details', 'title_or_rates_docs'],
      workflow: ['listing', 'mandate', 'offer', 'levy_or_rates', 'transfer'],
      legalChecks: ['levy_clearance', 'scheme_details'],
    }),
    supported({
      key: 'property_estate_hoa',
      axis: 'property',
      value: 'estate_hoa',
      title: 'Estate or HOA',
      aliases: ['estate', 'hoa', 'estate_or_hoa'],
      requiredQuestions: ['estate_or_hoa_name', 'levies', 'consent_or_clearance', 'conduct_rules'],
      requiredDocuments: ['hoa_or_estate_levy_docs', 'consent_or_clearance_if_required'],
      workflow: ['listing', 'mandate', 'offer', 'hoa_clearance', 'transfer'],
      legalChecks: ['hoa_consent_or_clearance'],
    }),
    manualReview({
      key: 'property_commercial',
      axis: 'property',
      value: 'commercial',
      title: 'Commercial property',
      aliases: ['office', 'office_building', 'industrial', 'retail', 'warehouse', 'commercial_property'],
      requiredQuestions: ['vat_status', 'leases', 'zoning_or_use', 'tenant_details', 'income_schedule'],
      requiredDocuments: ['lease_docs', 'vat_docs', 'zoning_or_use_docs', 'rates', 'certificates'],
      workflow: ['listing', 'commercial_review', 'mandate', 'offer', 'transfer'],
      legalChecks: ['vat_or_transfer_duty', 'leases', 'fica'],
    }),
    manualReview({
      key: 'property_mixed_use',
      axis: 'property',
      value: 'mixed_use',
      title: 'Mixed-use property',
      aliases: ['mixed', 'mixed_use_building', 'mixed_use_estate'],
      requiredQuestions: ['split_use', 'vat_allocation', 'leases', 'zoning', 'occupancy'],
      requiredDocuments: ['commercial_and_residential_docs', 'vat_docs', 'lease_docs'],
      workflow: ['intake', 'legal_tax_review', 'transfer'],
      legalChecks: ['vat_or_transfer_duty_split'],
    }),
    manualReview({
      key: 'property_agricultural',
      axis: 'property',
      value: 'agricultural',
      title: 'Agricultural property',
      aliases: ['farm', 'smallholding', 'agricultural_holding', 'agricultural_land'],
      requiredQuestions: ['land_use', 'water_source', 'servitudes', 'zoning', 'occupancy'],
      requiredDocuments: ['zoning_or_land_use_docs', 'water_or_borehole_docs', 'title_or_rates', 'servitude_docs'],
      workflow: ['intake', 'legal_review', 'transfer'],
      legalChecks: ['land_use', 'servitude_or_water_rights'],
    }),
    manualReview({
      key: 'property_vacant_land',
      axis: 'property',
      value: 'vacant_land',
      title: 'Vacant land',
      aliases: ['vacant', 'vacant_stand', 'stand', 'land'],
      requiredQuestions: ['zoning', 'services', 'plans', 'servitudes', 'development_conditions'],
      requiredDocuments: ['zoning', 'services', 'title_or_rates', 'planning_docs'],
      workflow: ['intake', 'legal_review', 'transfer'],
      legalChecks: ['planning_or_servitude_restrictions'],
    }),
    unsupported({
      key: 'property_share_block',
      axis: 'property',
      value: 'share_block',
      title: 'Share block',
      aliases: ['shareblock'],
      workflow: ['unsupported_stop'],
      legalChecks: ['not_normal_immovable_property_transfer_workflow'],
      boundaryReason: 'Share block is outside current automated conveyancing scope.',
    }),
    unsupported({
      key: 'property_long_term_leasehold',
      axis: 'property',
      value: 'long_term_leasehold',
      title: 'Long-term leasehold',
      aliases: ['leasehold'],
      workflow: ['unsupported_stop'],
      legalChecks: ['leasehold_specific_transfer_outside_current_workflow'],
      boundaryReason: 'Long-term leasehold is outside current automated conveyancing scope.',
    }),
    unsupported({
      key: 'property_land_claim_restitution',
      axis: 'property',
      value: 'land_claim_restitution',
      title: 'Land claim or restitution risk',
      aliases: ['land_claim', 'restitution_risk'],
      workflow: ['unsupported_stop'],
      legalChecks: ['high_risk_legal_restriction'],
      boundaryReason: 'Land claim or restitution risk must be handled outside automation.',
    }),
  ]),
  condition: freezeArray([
    supported({
      key: 'condition_standard_bond',
      axis: 'condition',
      value: 'standard_bond_condition',
      title: 'Standard bond condition',
      aliases: ['bond_condition', 'bond_approval_deadline'],
      requiredQuestions: ['bond_deadline', 'amount', 'bank_or_originator'],
      requiredDocuments: ['bond_approval_or_grant', 'condition_fulfilment_proof'],
      workflow: ['otp', 'finance_bond_or_hybrid', 'transfer'],
      legalChecks: ['deadline', 'fulfilment', 'waiver_or_extension_if_late'],
    }),
    supported({
      key: 'condition_deposit',
      axis: 'condition',
      value: 'deposit_condition',
      title: 'Deposit condition',
      aliases: ['deposit', 'reservation_deposit'],
      requiredQuestions: ['deposit_amount', 'due_date', 'paid_by', 'trust_account'],
      requiredDocuments: ['proof_of_payment', 'trust_receipt'],
      workflow: ['otp', 'deposit_gate', 'finance_or_transfer'],
      legalChecks: ['timely_payment', 'refund_authority'],
    }),
    manualReview({
      key: 'condition_subject_to_sale',
      axis: 'condition',
      value: 'subject_to_sale',
      title: 'Subject to sale of buyer property',
      aliases: ['sale_of_buyer_property', 'purchase_subject_to_sale'],
      requiredQuestions: ['buyer_property', 'sale_status', 'deadline', 'linked_transaction'],
      requiredDocuments: ['sale_proof', 'linked_otp_or_transfer_status'],
      workflow: ['otp', 'condition_review', 'finance_or_transfer'],
      legalChecks: ['suspensive_condition_tracking'],
    }),
    manualReview({
      key: 'condition_subject_to_inspection',
      axis: 'condition',
      value: 'subject_to_inspection',
      title: 'Subject to inspection or defects',
      aliases: ['inspection_condition', 'defects_condition', 'subject_to_defects'],
      requiredQuestions: ['inspection_scope', 'deadline', 'remedy_or_waiver'],
      requiredDocuments: ['inspection_report', 'defect_list', 'waiver_or_addendum'],
      workflow: ['otp', 'condition_review', 'transfer'],
      legalChecks: ['written_fulfilment_or_waiver'],
    }),
    manualReview({
      key: 'condition_otp_addendum',
      axis: 'condition',
      value: 'otp_addendum',
      title: 'OTP addendum or variation',
      aliases: ['variation', 'addendum', 'sale_agreement_addendum'],
      requiredQuestions: ['changed_terms', 'affected_parties', 'signature_requirement'],
      requiredDocuments: ['signed_addendum', 'updated_otp_version'],
      workflow: ['otp_versioning', 'resign', 'transfer'],
      legalChecks: ['all_required_parties_sign_latest_terms'],
    }),
  ]),
})

export const LEGAL_SCENARIOS = freezeArray(Object.values(LEGAL_SCENARIOS_BY_AXIS).flat())

function createScenarioIndex(scenarios = []) {
  const index = {}
  for (const scenario of scenarios) {
    const axis = normalizeAxis(scenario.axis)
    if (!index[axis]) index[axis] = {}
    const aliases = [scenario.key, scenario.value, ...(scenario.aliases || [])]
    for (const alias of aliases) {
      const normalized = normalizeKey(alias)
      if (normalized) index[axis][normalized] = scenario
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(index).map(([axis, values]) => [axis, Object.freeze(values)])))
}

const SCENARIO_INDEX = createScenarioIndex(LEGAL_SCENARIOS)

function pickScenarioValue(input = {}, axis = '') {
  if (input.value || input.scenario || input.scenarioType) return input.value || input.scenario || input.scenarioType
  if (axis === 'buyer') return input.buyerType || input.purchaserType || input.purchaser_type || input.buyerLegalType
  if (axis === 'seller') return input.sellerType || input.ownerType || input.ownershipType || input.seller_entity_type
  if (axis === 'finance') return input.financeType || input.finance_type || input.fundingType
  if (axis === 'property') return input.propertyType || input.property_type || input.tenure || input.propertyTenure
  if (axis === 'condition') return input.conditionType || input.suspensiveConditionType || input.specialConditionType
  return ''
}

function createFallbackScenario(axis = '', rawValue = '') {
  const normalizedAxis = normalizeAxis(axis)
  const normalizedValue = normalizeKey(rawValue)
  const hasValue = Boolean(normalizedValue)
  return Object.freeze({
    key: `${normalizedAxis}_${hasValue ? 'unrecognized' : 'missing'}`,
    axis: normalizedAxis,
    value: normalizedValue || '',
    title: hasValue ? `Unrecognized ${normalizedAxis} scenario` : `Missing ${normalizedAxis} scenario`,
    status: hasValue ? LEGAL_SCENARIO_STATUSES.unsupported : LEGAL_SCENARIO_STATUSES.manualReview,
    aliases: freezeArray([]),
    requiredQuestions: freezeArray([`${normalizedAxis}_classification`]),
    requiredDocuments: freezeArray([]),
    workflow: freezeArray(hasValue ? ['unsupported_stop'] : ['intake', 'classification_review']),
    legalChecks: freezeArray(['versioned_rule_mapping_required']),
    partnerTasks: freezeArray(['conveyancer_or_compliance_review']),
    boundaryReason: hasValue
      ? `Unrecognized ${normalizedAxis} scenario "${rawValue}" must not be normalized into a supported branch.`
      : `Missing ${normalizedAxis} scenario must be collected before automation.`,
  })
}

export function listLegalScenarios(axis = '') {
  const normalizedAxis = normalizeAxis(axis)
  if (!normalizedAxis) return LEGAL_SCENARIOS
  return LEGAL_SCENARIOS_BY_AXIS[normalizedAxis] || freezeArray([])
}

export function resolveLegalScenario(input = {}) {
  const axis = normalizeAxis(input.axis || input.role || input.kind)
  if (!axis || !SCENARIO_INDEX[axis]) {
    return createFallbackScenario(axis || 'unknown', pickScenarioValue(input, axis))
  }

  const rawValue = pickScenarioValue(input, axis)
  const scenario = SCENARIO_INDEX[axis][normalizeKey(rawValue)]
  return scenario || createFallbackScenario(axis, rawValue)
}

export function resolveLegalScenarioSupport(input = {}) {
  const scenario = resolveLegalScenario(input)
  const status = scenario.status
  return Object.freeze({
    scenario,
    axis: scenario.axis,
    scenarioKey: scenario.key,
    status,
    action: LEGAL_SCENARIO_ACTIONS[status] || LEGAL_SCENARIO_ACTIONS.manual_review,
    automationAllowed: status === LEGAL_SCENARIO_STATUSES.supported,
    manualReviewRequired: status === LEGAL_SCENARIO_STATUSES.manualReview,
    unsupported: status === LEGAL_SCENARIO_STATUSES.unsupported,
    reason: scenario.boundaryReason || scenario.legalChecks[0] || scenario.title,
  })
}

function highestStatus(results = []) {
  return results.reduce((highest, result) => {
    const currentPriority = STATUS_PRIORITY[result.status] ?? STATUS_PRIORITY.manual_review
    const highestPriority = STATUS_PRIORITY[highest] ?? STATUS_PRIORITY.supported
    return currentPriority > highestPriority ? result.status : highest
  }, LEGAL_SCENARIO_STATUSES.supported)
}

export function resolveLegalMatterSupport(input = {}) {
  const results = []
  const buyerValue = pickScenarioValue(input, 'buyer')
  const sellerValue = pickScenarioValue(input, 'seller')
  const financeValue = pickScenarioValue(input, 'finance')
  const propertyValue = pickScenarioValue(input, 'property')

  if (buyerValue) results.push(resolveLegalScenarioSupport({ axis: 'buyer', value: buyerValue }))
  if (sellerValue) results.push(resolveLegalScenarioSupport({ axis: 'seller', value: sellerValue }))
  if (financeValue) results.push(resolveLegalScenarioSupport({ axis: 'finance', value: financeValue }))
  if (propertyValue) results.push(resolveLegalScenarioSupport({ axis: 'property', value: propertyValue }))

  const conditionValues = Array.isArray(input.conditions || input.conditionTypes)
    ? input.conditions || input.conditionTypes
    : [pickScenarioValue(input, 'condition')].filter(Boolean)

  for (const condition of conditionValues) {
    results.push(resolveLegalScenarioSupport({ axis: 'condition', value: condition }))
  }

  const status = highestStatus(results)
  return Object.freeze({
    status,
    action: LEGAL_SCENARIO_ACTIONS[status] || LEGAL_SCENARIO_ACTIONS.manual_review,
    automationAllowed: status === LEGAL_SCENARIO_STATUSES.supported,
    manualReviewRequired: results.some((result) => result.manualReviewRequired),
    unsupported: results.some((result) => result.unsupported),
    results: freezeArray(results),
  })
}

export const LEGAL_SCENARIO_PHASE0_FIXTURES = freezeArray([
  { key: 'standard_individual_cash_buyer', axis: 'buyer', value: 'individual', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'married_cop_buyer', axis: 'buyer', value: 'married_cop', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'company_buyer_with_many_directors', axis: 'buyer', value: 'company', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'trust_buyer_with_many_trustees', axis: 'buyer', value: 'trust', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'foreign_individual_buyer', axis: 'buyer', value: 'foreign_purchaser', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'close_corporation_buyer', axis: 'buyer', value: 'cc', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'buyer_using_poa', axis: 'buyer', value: 'buyer_poa', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'minor_buyer', axis: 'buyer', value: 'minor', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'deceased_estate_buyer', axis: 'buyer', value: 'deceased_estate', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'insolvent_buyer', axis: 'buyer', value: 'sequestrated', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'curatorship_buyer', axis: 'buyer', value: 'curatorship', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'buyer_business_rescue', axis: 'buyer', value: 'business_rescue', expectedStatus: LEGAL_SCENARIO_STATUSES.unsupported },
  { key: 'buyer_liquidation', axis: 'buyer', value: 'liquidated_company', expectedStatus: LEGAL_SCENARIO_STATUSES.unsupported },
  { key: 'standard_individual_seller', axis: 'seller', value: 'individual', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'multiple_owner_seller', axis: 'seller', value: 'multiple_individuals', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'company_seller', axis: 'seller', value: 'company', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'deceased_estate_seller', axis: 'seller', value: 'deceased_estate', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'seller_using_poa', axis: 'seller', value: 'poa', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'seller_business_rescue', axis: 'seller', value: 'business_rescue', expectedStatus: LEGAL_SCENARIO_STATUSES.unsupported },
  { key: 'seller_liquidation', axis: 'seller', value: 'liquidated_company', expectedStatus: LEGAL_SCENARIO_STATUSES.unsupported },
  { key: 'cash_finance', axis: 'finance', value: 'cash', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'hybrid_finance', axis: 'finance', value: 'cash_and_bond', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'offshore_funds', axis: 'finance', value: 'offshore_funds', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'sectional_title_property', axis: 'property', value: 'sectional_title', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'commercial_property', axis: 'property', value: 'commercial', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'share_block_property', axis: 'property', value: 'share_block', expectedStatus: LEGAL_SCENARIO_STATUSES.unsupported },
  { key: 'standard_bond_condition', axis: 'condition', value: 'standard_bond_condition', expectedStatus: LEGAL_SCENARIO_STATUSES.supported },
  { key: 'subject_to_sale_condition', axis: 'condition', value: 'subject_to_sale', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
  { key: 'otp_addendum_condition', axis: 'condition', value: 'addendum', expectedStatus: LEGAL_SCENARIO_STATUSES.manualReview },
])
