import { normalizeFinanceType } from '../core/transactions/financeType.js'
import { LEGAL_BUYER_TYPES, LEGAL_FINANCE_TYPES } from '../core/legal/legalRuleRegistry.js'

export const BUYER_ONBOARDING_FLOW_VERSION = 'buyer_onboarding_flow_v2'

export const BUYER_ONBOARDING_FIELD_ALIASES = Object.freeze({
  'finance.bond_bank_name': Object.freeze(['finance.buyer_banks', 'finance.buyer_banks_other']),
  'finance.bond_process_started': Object.freeze(['finance.bond_preapproval_completed']),
  'finance.bond_current_status': Object.freeze(['finance.bond_preapproval_completed']),
  'finance.bond_readiness_consent': Object.freeze(['finance.credit_check_consent']),
  'finance.affordability_confirmed': Object.freeze([]),
  'finance.ooba_assist_requested': Object.freeze(['finance.bond_help_requested']),
  'finance.bond_originator_name': Object.freeze([]),
  'finance.bond_originator_contact': Object.freeze([]),
})

export function getBuyerOnboardingFieldAliases(field) {
  const key = normalizeText(field)
  if (!key) return []
  return BUYER_ONBOARDING_FIELD_ALIASES[key] || [key]
}

export function migrateBuyerOnboardingFieldListToV2(fields = []) {
  return mergeUnique(
    (Array.isArray(fields) ? fields : [fields]).flatMap((field) => getBuyerOnboardingFieldAliases(field)),
  )
}

export const BUYER_PURCHASE_MODES = Object.freeze(['individual', 'co_purchasing'])

export const BUYER_BRANCHES = LEGAL_BUYER_TYPES

export const BUYER_FINANCE_BRANCHES = Object.freeze(LEGAL_FINANCE_TYPES.filter((type) => ['cash', 'bond', 'hybrid'].includes(type)))

const NATURAL_PERSON_BASE_RULES = Object.freeze({
  buyerFacingQuestions: Object.freeze([
    'buyer.person.first_name',
    'buyer.person.last_name',
    'buyer.person.date_of_birth',
    'buyer.person.identity_number_or_passport_number',
    'buyer.person.nationality',
    'buyer.person.residency_status',
    'buyer.person.tax_number',
    'buyer.person.email',
    'buyer.person.phone',
    'buyer.person.residential_address.line_1',
    'buyer.person.residential_address.suburb',
    'buyer.person.residential_address.city',
    'buyer.person.residential_address.postal_code',
    'buyer.person.postal_address.line_1',
    'buyer.person.postal_address.suburb',
    'buyer.person.postal_address.city',
    'buyer.person.postal_address.postal_code',
    'buyer.person.marital_status',
    'buyer.person.occupation',
    'buyer.person.income_source',
    'buyer.person.number_of_dependants',
    'buyer.person.monthly_credit_commitments',
    'buyer.person.first_time_buyer',
    'buyer.person.primary_residence',
    'buyer.person.investment_purchase',
  ]),
  requiredFields: Object.freeze([
    'buyer.person.first_name',
    'buyer.person.last_name',
    'buyer.person.date_of_birth',
    'buyer.person.identity_number_or_passport_number',
    'buyer.person.nationality',
    'buyer.person.residency_status',
    'buyer.person.tax_number',
    'buyer.person.email',
    'buyer.person.phone',
    'buyer.person.residential_address.line_1',
    'buyer.person.residential_address.suburb',
    'buyer.person.residential_address.city',
    'buyer.person.residential_address.postal_code',
    'buyer.person.marital_status',
    'buyer.person.number_of_dependants',
    'buyer.person.monthly_credit_commitments',
    'buyer.person.first_time_buyer',
    'buyer.person.primary_residence',
    'buyer.person.investment_purchase',
  ]),
  optionalFields: Object.freeze([
    'buyer.person.passport_number',
    'buyer.person.postal_address.line_1',
    'buyer.person.postal_address.suburb',
    'buyer.person.postal_address.city',
    'buyer.person.postal_address.postal_code',
    'buyer.person.occupation',
    'buyer.person.income_source',
  ]),
  internalDerivedFacts: Object.freeze([
    'buyer.branch',
    'buyer.legal_type',
    'buyer.purchase_mode',
    'buyer.marital_structure',
  ]),
  documentTriggers: Object.freeze([]),
})

const ENTITY_BASE_RULES = Object.freeze({
  buyerFacingQuestions: Object.freeze([]),
  requiredFields: Object.freeze([]),
  optionalFields: Object.freeze([]),
  internalDerivedFacts: Object.freeze([]),
  documentTriggers: Object.freeze([]),
})

const PURCHASE_MODE_RULES = Object.freeze({
  individual: Object.freeze({
    label: 'Individual',
    aliases: Object.freeze(['individual', 'single', 'sole_buyer', 'sole_purchaser', 'natural_person']),
    buyerFacingQuestions: Object.freeze([]),
    requiredFields: Object.freeze([]),
    optionalFields: Object.freeze([]),
    internalDerivedFacts: Object.freeze(['buyer.purchase_mode']),
    documentTriggers: Object.freeze([]),
  }),
  co_purchasing: Object.freeze({
    label: 'Co-Purchasing',
    aliases: Object.freeze(['co_purchasing', 'joint_purchase', 'joint_buyer', 'joint']),
    buyerFacingQuestions: Object.freeze([
      'buyer.co_purchasers',
      'buyer.co_purchasers[].first_name',
      'buyer.co_purchasers[].last_name',
      'buyer.co_purchasers[].identity_number_or_passport_number',
      'buyer.co_purchasers[].email',
      'buyer.co_purchasers[].phone',
      'buyer.co_purchasers[].residential_address',
      'buyer.co_purchasers[].ownership_share',
      'buyer.co_purchasers[].consent_to_purchase',
    ]),
    requiredFields: Object.freeze([
      'buyer.co_purchasers',
      'buyer.co_purchasers[].first_name',
      'buyer.co_purchasers[].last_name',
      'buyer.co_purchasers[].identity_number_or_passport_number',
      'buyer.co_purchasers[].email',
      'buyer.co_purchasers[].phone',
      'buyer.co_purchasers[].ownership_share',
      'buyer.co_purchasers[].consent_to_purchase',
    ]),
    optionalFields: Object.freeze([
      'buyer.co_purchasers[].residential_address',
      'buyer.co_purchasers[].passport_number',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.purchase_mode',
      'buyer.co_purchaser_count',
      'buyer.ownership_split',
    ]),
    documentTriggers: Object.freeze([
      'co_purchaser_id_document',
      'co_purchaser_proof_of_address',
      'ownership_split_confirmation',
    ]),
  }),
})

const PURCHASER_BRANCH_RULES = Object.freeze({
  individual: Object.freeze({
    label: 'Individual',
    aliases: Object.freeze(['individual', 'single', 'natural_person', 'person', 'private_individual']),
    buyerFacingQuestions: Object.freeze([]),
    requiredFields: Object.freeze([]),
    optionalFields: Object.freeze([]),
    internalDerivedFacts: Object.freeze(['buyer.branch']),
    documentTriggers: Object.freeze([
      'id_document',
      'proof_of_address',
    ]),
  }),
  married_coc: Object.freeze({
    label: 'Married in Community of Property',
    aliases: Object.freeze([
      'married',
      'married_coc',
      'married_cop',
      'married_in_community',
      'married_in_community_of_property',
      'coc',
      'cop',
    ]),
    buyerFacingQuestions: Object.freeze([
      'buyer.person.spouse_full_name',
      'buyer.person.spouse_identity_number',
      'buyer.person.spouse_email',
      'buyer.person.spouse_phone',
      'buyer.person.spouse_residential_address',
      'buyer.person.spouse_consent_required',
      'buyer.person.marriage_date',
    ]),
    requiredFields: Object.freeze([
      'buyer.person.spouse_full_name',
      'buyer.person.spouse_identity_number',
      'buyer.person.marital_regime',
      'buyer.person.spouse_email',
      'buyer.person.spouse_phone',
      'buyer.person.spouse_consent_required',
    ]),
    optionalFields: Object.freeze([
      'buyer.person.spouse_residential_address',
      'buyer.person.marriage_date',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.marital_structure',
      'buyer.spouse_consent_required',
    ]),
    documentTriggers: Object.freeze([
      'spouse_id',
      'spouse_proof_of_address',
      'marriage_certificate',
    ]),
  }),
  married_anc: Object.freeze({
    label: 'Married Out of Community of Property',
    aliases: Object.freeze([
      'married_anc',
      'married_out_of_community',
      'married_out_of_community_of_property',
      'anc',
    ]),
    buyerFacingQuestions: Object.freeze([
      'buyer.person.spouse_full_name',
      'buyer.person.spouse_identity_number',
      'buyer.person.spouse_email',
      'buyer.person.spouse_phone',
      'buyer.person.spouse_is_co_purchaser',
      'buyer.person.anc_available',
    ]),
    requiredFields: Object.freeze([
      'buyer.person.spouse_full_name',
      'buyer.person.spouse_identity_number',
      'buyer.person.marital_regime',
      'buyer.person.spouse_is_co_purchaser',
      'buyer.person.anc_available',
    ]),
    optionalFields: Object.freeze([
      'buyer.person.spouse_email',
      'buyer.person.spouse_phone',
      'buyer.person.spouse_residential_address',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.marital_structure',
      'buyer.spouse_recorded',
    ]),
    documentTriggers: Object.freeze([
      'spouse_id_optional',
      'spouse_proof_of_address_optional',
      'anc_document_optional',
    ]),
  }),
  married_anc_accrual: Object.freeze({
    label: 'Married Out of Community of Property with Accrual',
    aliases: Object.freeze([
      'married_anc_accrual',
      'anc_with_accrual',
      'married_out_of_community_with_accrual',
      'accrual',
    ]),
    buyerFacingQuestions: Object.freeze([
      'buyer.person.spouse_full_name',
      'buyer.person.spouse_identity_number',
      'buyer.person.spouse_email',
      'buyer.person.spouse_phone',
      'buyer.person.spouse_is_co_purchaser',
      'buyer.person.anc_available',
    ]),
    requiredFields: Object.freeze([
      'buyer.person.spouse_full_name',
      'buyer.person.spouse_identity_number',
      'buyer.person.marital_regime',
      'buyer.person.spouse_is_co_purchaser',
      'buyer.person.anc_available',
    ]),
    optionalFields: Object.freeze([
      'buyer.person.spouse_email',
      'buyer.person.spouse_phone',
      'buyer.person.spouse_residential_address',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.marital_structure',
      'buyer.spouse_recorded',
      'buyer.accrual_structure',
    ]),
    documentTriggers: Object.freeze([
      'spouse_id_optional',
      'spouse_proof_of_address_optional',
      'anc_accrual_document_optional',
    ]),
  }),
  company: Object.freeze({
    label: 'Company',
    aliases: Object.freeze(['company', 'business', 'corporate', 'pty', 'pty_ltd']),
    buyerFacingQuestions: Object.freeze([
      'buyer.company.name',
      'buyer.company.registration_number',
      'buyer.company.registered_address',
      'buyer.company.business_address',
      'buyer.company.tax_number',
      'buyer.company.vat_number',
      'buyer.company.nature_of_business',
      'buyer.company.authorised_signatory.name',
      'buyer.company.authorised_signatory.identity_number_or_passport_number',
      'buyer.company.authorised_signatory.email',
      'buyer.company.authorised_signatory.phone',
      'buyer.company.authorised_signatory.capacity',
      'buyer.company.directors',
      'buyer.company.board_resolution_available',
      'buyer.company.resolution_date',
      'buyer.company.authority_basis',
    ]),
    requiredFields: Object.freeze([
      'buyer.company.name',
      'buyer.company.registration_number',
      'buyer.company.registered_address',
      'buyer.company.nature_of_business',
      'buyer.company.authorised_signatory.name',
      'buyer.company.authorised_signatory.identity_number_or_passport_number',
      'buyer.company.authorised_signatory.email',
      'buyer.company.authorised_signatory.phone',
      'buyer.company.authorised_signatory.capacity',
      'buyer.company.directors',
      'buyer.company.board_resolution_available',
      'buyer.company.resolution_date',
      'buyer.company.authority_basis',
    ]),
    optionalFields: Object.freeze([
      'buyer.company.business_address',
      'buyer.company.tax_number',
      'buyer.company.vat_number',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.director_count',
      'buyer.authorised_signatory',
    ]),
    documentTriggers: Object.freeze([
      'cipc_registration',
      'company_resolution',
      'director_id',
      'director_proof_of_address',
    ]),
  }),
  close_corporation: Object.freeze({
    label: 'Close Corporation',
    aliases: Object.freeze(['close_corporation', 'cc', 'close_corp']),
    buyerFacingQuestions: Object.freeze([
      'buyer.close_corporation.name',
      'buyer.close_corporation.registration_number',
      'buyer.close_corporation.registered_address',
      'buyer.close_corporation.business_address',
      'buyer.close_corporation.tax_number',
      'buyer.close_corporation.vat_number',
      'buyer.close_corporation.nature_of_business',
      'buyer.close_corporation.authorised_member.name',
      'buyer.close_corporation.authorised_member.identity_number_or_passport_number',
      'buyer.close_corporation.authorised_member.email',
      'buyer.close_corporation.authorised_member.phone',
      'buyer.close_corporation.authorised_member.capacity',
      'buyer.close_corporation.members',
      'buyer.close_corporation.member_resolution_available',
      'buyer.close_corporation.resolution_date',
      'buyer.close_corporation.authority_basis',
    ]),
    requiredFields: Object.freeze([
      'buyer.close_corporation.name',
      'buyer.close_corporation.registration_number',
      'buyer.close_corporation.registered_address',
      'buyer.close_corporation.nature_of_business',
      'buyer.close_corporation.authorised_member.name',
      'buyer.close_corporation.authorised_member.identity_number_or_passport_number',
      'buyer.close_corporation.authorised_member.email',
      'buyer.close_corporation.authorised_member.phone',
      'buyer.close_corporation.authorised_member.capacity',
      'buyer.close_corporation.members',
      'buyer.close_corporation.member_resolution_available',
      'buyer.close_corporation.resolution_date',
      'buyer.close_corporation.authority_basis',
    ]),
    optionalFields: Object.freeze([
      'buyer.close_corporation.business_address',
      'buyer.close_corporation.tax_number',
      'buyer.close_corporation.vat_number',
      'buyer.close_corporation.beneficial_owners',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.member_count',
      'buyer.authorised_member',
    ]),
    documentTriggers: Object.freeze([
      'ck_documents',
      'member_resolution',
      'member_id',
      'member_proof_of_address',
    ]),
  }),
  trust: Object.freeze({
    label: 'Trust',
    aliases: Object.freeze(['trust', 'family_trust']),
    buyerFacingQuestions: Object.freeze([
      'buyer.trust.name',
      'buyer.trust.registration_number',
      'buyer.trust.type',
      'buyer.trust.masters_office_reference',
      'buyer.trust.registered_address',
      'buyer.trust.tax_number',
      'buyer.trust.contact.name',
      'buyer.trust.contact.email',
      'buyer.trust.contact.phone',
      'buyer.trust.authorised_trustee.name',
      'buyer.trust.authorised_trustee.identity_number_or_passport_number',
      'buyer.trust.authorised_trustee.email',
      'buyer.trust.authorised_trustee.phone',
      'buyer.trust.authorised_trustee.capacity',
      'buyer.trust.authority_basis',
      'buyer.trust.trust_deed_available',
      'buyer.trust.letters_of_authority_available',
      'buyer.trust.resolution_available',
      'buyer.trust.all_trustees_signing',
      'buyer.trust.trustees',
    ]),
    requiredFields: Object.freeze([
      'buyer.trust.name',
      'buyer.trust.registration_number',
      'buyer.trust.type',
      'buyer.trust.masters_office_reference',
      'buyer.trust.registered_address',
      'buyer.trust.authorised_trustee.name',
      'buyer.trust.authorised_trustee.identity_number_or_passport_number',
      'buyer.trust.authorised_trustee.email',
      'buyer.trust.authorised_trustee.phone',
      'buyer.trust.authorised_trustee.capacity',
      'buyer.trust.authority_basis',
      'buyer.trust.trust_deed_available',
      'buyer.trust.letters_of_authority_available',
      'buyer.trust.resolution_available',
      'buyer.trust.all_trustees_signing',
      'buyer.trust.trustees',
    ]),
    optionalFields: Object.freeze([
      'buyer.trust.tax_number',
      'buyer.trust.contact.name',
      'buyer.trust.contact.email',
      'buyer.trust.contact.phone',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.trustee_count',
      'buyer.authorised_trustee',
    ]),
    documentTriggers: Object.freeze([
      'trust_deed',
      'letters_of_authority',
      'trust_resolution',
      'trustee_id',
      'trustee_proof_of_address',
    ]),
  }),
  foreign_purchaser: Object.freeze({
    label: 'Foreign Purchaser',
    aliases: Object.freeze(['foreign_purchaser', 'foreign', 'foreign_individual', 'foreign_buyer', 'non_resident', 'non-resident']),
    buyerFacingQuestions: Object.freeze([
      'buyer.person.passport_number',
      'buyer.person.nationality',
      'buyer.person.residency_status',
      'buyer.person.source_of_funds',
      'buyer.person.exchange_control_declaration',
    ]),
    requiredFields: Object.freeze([
      'buyer.person.passport_number',
      'buyer.person.nationality',
      'buyer.person.residency_status',
    ]),
    optionalFields: Object.freeze([
      'buyer.person.source_of_funds',
      'buyer.person.exchange_control_declaration',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.foreign_review_required',
    ]),
    documentTriggers: Object.freeze([
      'passport_copy',
      'proof_of_address',
      'source_of_funds',
    ]),
  }),
  power_of_attorney: Object.freeze({
    label: 'Power of Attorney',
    aliases: Object.freeze(['power_of_attorney', 'poa', 'buyer_poa', 'attorney']),
    buyerFacingQuestions: Object.freeze([
      'buyer.power_of_attorney.principal.name',
      'buyer.power_of_attorney.principal.identity_number_or_passport_number',
      'buyer.power_of_attorney.representative.name',
      'buyer.power_of_attorney.representative.identity_number_or_passport_number',
      'buyer.power_of_attorney.scope',
      'buyer.power_of_attorney.expiry_date',
      'buyer.power_of_attorney.signing_location',
      'buyer.power_of_attorney.authentication_required',
    ]),
    requiredFields: Object.freeze([
      'buyer.power_of_attorney.principal.name',
      'buyer.power_of_attorney.principal.identity_number_or_passport_number',
      'buyer.power_of_attorney.representative.name',
      'buyer.power_of_attorney.representative.identity_number_or_passport_number',
      'buyer.power_of_attorney.scope',
      'buyer.power_of_attorney.signing_location',
    ]),
    optionalFields: Object.freeze([
      'buyer.power_of_attorney.expiry_date',
      'buyer.power_of_attorney.authentication_required',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.power_of_attorney_review_required',
    ]),
    documentTriggers: Object.freeze([
      'buyer_power_of_attorney',
      'buyer_principal_id',
      'buyer_representative_id',
      'buyer_authority_proof',
      'buyer_authentication_if_foreign',
    ]),
  }),
  deceased_estate: Object.freeze({
    label: 'Deceased Estate',
    aliases: Object.freeze(['deceased_estate', 'deceased', 'estate', 'estate_late']),
    buyerFacingQuestions: Object.freeze([
      'buyer.deceased_estate.name',
      'buyer.deceased_estate.reference',
      'buyer.deceased_estate.executor.name',
      'buyer.deceased_estate.executor.identity_number_or_passport_number',
      'buyer.deceased_estate.executor.email',
      'buyer.deceased_estate.executor.phone',
      'buyer.deceased_estate.authority_details',
      'buyer.deceased_estate.source_of_funds',
    ]),
    requiredFields: Object.freeze([
      'buyer.deceased_estate.name',
      'buyer.deceased_estate.executor.name',
      'buyer.deceased_estate.executor.identity_number_or_passport_number',
      'buyer.deceased_estate.authority_details',
      'buyer.deceased_estate.source_of_funds',
    ]),
    optionalFields: Object.freeze([
      'buyer.deceased_estate.reference',
      'buyer.deceased_estate.executor.email',
      'buyer.deceased_estate.executor.phone',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.estate_capacity_review_required',
    ]),
    documentTriggers: Object.freeze([
      'buyer_estate_authority',
      'buyer_executor_id',
      'buyer_estate_source_of_funds',
    ]),
  }),
  minor: Object.freeze({
    label: 'Minor',
    aliases: Object.freeze(['minor', 'under_18', 'child_buyer']),
    buyerFacingQuestions: Object.freeze([
      'buyer.minor.name',
      'buyer.minor.identity_number_or_birth_certificate',
      'buyer.minor.guardian.name',
      'buyer.minor.guardian.identity_number_or_passport_number',
      'buyer.minor.guardian.email',
      'buyer.minor.guardian.phone',
      'buyer.minor.guardian_authority',
      'buyer.minor.source_of_funds',
      'buyer.minor.ownership_intention',
    ]),
    requiredFields: Object.freeze([
      'buyer.minor.name',
      'buyer.minor.identity_number_or_birth_certificate',
      'buyer.minor.guardian.name',
      'buyer.minor.guardian.identity_number_or_passport_number',
      'buyer.minor.guardian_authority',
      'buyer.minor.source_of_funds',
      'buyer.minor.ownership_intention',
    ]),
    optionalFields: Object.freeze([
      'buyer.minor.guardian.email',
      'buyer.minor.guardian.phone',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.guardian_authority_review_required',
    ]),
    documentTriggers: Object.freeze([
      'minor_birth_certificate_or_id',
      'guardian_id',
      'guardian_authority_or_court_order',
      'minor_source_of_funds',
    ]),
  }),
  insolvent: Object.freeze({
    label: 'Insolvent / Sequestrated',
    aliases: Object.freeze(['insolvent', 'sequestrated', 'insolvency']),
    buyerFacingQuestions: Object.freeze([
      'buyer.insolvency.status',
      'buyer.insolvency.trustee_or_curator.name',
      'buyer.insolvency.trustee_or_curator.identity_number_or_passport_number',
      'buyer.insolvency.authority_details',
      'buyer.insolvency.source_of_funds',
    ]),
    requiredFields: Object.freeze([
      'buyer.insolvency.status',
      'buyer.insolvency.trustee_or_curator.name',
      'buyer.insolvency.authority_details',
      'buyer.insolvency.source_of_funds',
    ]),
    optionalFields: Object.freeze([
      'buyer.insolvency.trustee_or_curator.identity_number_or_passport_number',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.insolvency_review_required',
    ]),
    documentTriggers: Object.freeze([
      'trustee_or_curator_appointment',
      'insolvency_authority_docs',
      'insolvency_finance_or_source_docs',
    ]),
  }),
  curatorship: Object.freeze({
    label: 'Curatorship / Administration',
    aliases: Object.freeze(['curatorship', 'administration', 'administrator', 'curator']),
    buyerFacingQuestions: Object.freeze([
      'buyer.curatorship.represented_person.name',
      'buyer.curatorship.curator_or_administrator.name',
      'buyer.curatorship.curator_or_administrator.identity_number_or_passport_number',
      'buyer.curatorship.authority_details',
      'buyer.curatorship.transaction_scope',
    ]),
    requiredFields: Object.freeze([
      'buyer.curatorship.represented_person.name',
      'buyer.curatorship.curator_or_administrator.name',
      'buyer.curatorship.authority_details',
      'buyer.curatorship.transaction_scope',
    ]),
    optionalFields: Object.freeze([
      'buyer.curatorship.curator_or_administrator.identity_number_or_passport_number',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.curatorship_review_required',
    ]),
    documentTriggers: Object.freeze([
      'curatorship_court_order',
      'curator_id',
      'curator_authority_docs',
    ]),
  }),
  business_rescue: Object.freeze({
    label: 'Business Rescue',
    aliases: Object.freeze(['business_rescue', 'business_rescue_buyer', 'company_in_business_rescue']),
    buyerFacingQuestions: Object.freeze([
      'buyer.business_rescue.details',
      'buyer.business_rescue.practitioner.name',
    ]),
    requiredFields: Object.freeze([
      'buyer.business_rescue.details',
    ]),
    optionalFields: Object.freeze([
      'buyer.business_rescue.practitioner.name',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.unsupported',
    ]),
    documentTriggers: Object.freeze([]),
  }),
  liquidation: Object.freeze({
    label: 'Liquidation',
    aliases: Object.freeze(['liquidation', 'liquidated_company', 'company_liquidation', 'liquidation_buyer']),
    buyerFacingQuestions: Object.freeze([
      'buyer.liquidation.details',
      'buyer.liquidation.liquidator.name',
    ]),
    requiredFields: Object.freeze([
      'buyer.liquidation.details',
    ]),
    optionalFields: Object.freeze([
      'buyer.liquidation.liquidator.name',
    ]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
      'buyer.unsupported',
    ]),
    documentTriggers: Object.freeze([]),
  }),
  other: Object.freeze({
    label: 'Other',
    aliases: Object.freeze(['other', 'other_legal_entity', 'legal_entity']),
    buyerFacingQuestions: Object.freeze([
      'buyer.entity.description',
    ]),
    requiredFields: Object.freeze([
      'buyer.entity.description',
    ]),
    optionalFields: Object.freeze([]),
    internalDerivedFacts: Object.freeze([
      'buyer.branch',
      'buyer.legal_type',
    ]),
    documentTriggers: Object.freeze([
      'buyer_authority',
    ]),
  }),
})

const FINANCE_CORE_RULES = Object.freeze({
  buyerFacingQuestions: Object.freeze([
    'finance.purchase_price',
  ]),
  requiredFields: Object.freeze([
    'finance.purchase_price',
  ]),
  optionalFields: Object.freeze([]),
  internalDerivedFacts: Object.freeze([
    'finance.type',
  ]),
  documentTriggers: Object.freeze([]),
})

const FINANCE_BRANCH_RULES = Object.freeze({
  cash: Object.freeze({
    label: 'Cash',
    aliases: Object.freeze(['cash', 'cash_sale', 'cash_deal', 'proof_of_funds']),
    buyerFacingQuestions: Object.freeze([
      'finance.cash_amount',
      'finance.proof_of_funds_available',
      'finance.source_of_funds',
      'finance.cash_funds_confirmed',
    ]),
    requiredFields: Object.freeze([
      'finance.cash_amount',
      'finance.proof_of_funds_available',
      'finance.source_of_funds',
      'finance.cash_funds_confirmed',
    ]),
    optionalFields: Object.freeze([
      'finance.bank_statements_available',
      'finance.cash_contribution_available',
      'finance.deposit_source',
      'finance.cash_contribution_source',
    ]),
    internalDerivedFacts: Object.freeze([
      'finance.has_cash_component',
      'finance.requires_proof_of_funds',
      'finance.support_mode',
    ]),
    documentTriggers: Object.freeze([
      'proof_of_funds',
    ]),
  }),
  bond: Object.freeze({
    label: 'Bond',
    aliases: Object.freeze(['bond', 'bonded', 'bond_finance', 'mortgage', 'home_loan']),
    buyerFacingQuestions: Object.freeze([
      'finance.bond_amount',
      'finance.buyer_banks',
      'finance.buyer_banks_other',
      'finance.bond_preapproval_completed',
      'finance.bond_preapproval_document_available',
      'finance.employment_type',
      'finance.employer_name',
      'finance.job_title',
      'finance.employment_start_date',
      'finance.business_name',
      'finance.years_in_business',
      'finance.gross_monthly_income',
      'finance.net_monthly_income',
      'finance.income_frequency',
      'finance.monthly_living_expenses',
      'finance.number_of_dependants',
      'finance.bank_statements_available',
      'finance.credit_check_consent',
      'finance.bond_help_requested',
      'finance.joint_bond_application',
      'finance.cash_contribution_available',
      'finance.deposit_source',
      'finance.cash_contribution_source',
    ]),
    requiredFields: Object.freeze([
      'finance.bond_amount',
      'finance.buyer_banks',
      'finance.bond_preapproval_completed',
      'finance.employment_type',
      'finance.gross_monthly_income',
      'finance.monthly_living_expenses',
      'finance.bank_statements_available',
      'finance.credit_check_consent',
    ]),
    optionalFields: Object.freeze([
      'finance.buyer_banks_other',
      'finance.bond_preapproval_document_available',
      'finance.bond_help_requested',
      'finance.employer_name',
      'finance.job_title',
      'finance.employment_start_date',
      'finance.business_name',
      'finance.years_in_business',
      'finance.net_monthly_income',
      'finance.income_frequency',
      'finance.joint_bond_application',
      'finance.number_of_dependants',
      'finance.cash_contribution_available',
      'finance.deposit_source',
      'finance.cash_contribution_source',
    ]),
    internalDerivedFacts: Object.freeze([
      'finance.has_bond_component',
      'finance.requires_bond_documents',
      'finance.needs_bond_originator',
      'finance.preapproval_status',
      'finance.credit_consent',
      'finance.support_mode',
    ]),
    documentTriggers: Object.freeze([
      'bond_approval',
      'grant_signed',
    ]),
  }),
  hybrid: Object.freeze({
    label: 'Hybrid',
    aliases: Object.freeze(['hybrid', 'combination', 'cash_and_bond', 'partial_bond']),
    buyerFacingQuestions: Object.freeze([
      'finance.cash_amount',
      'finance.bond_amount',
      'finance.proof_of_funds_available',
      'finance.source_of_funds',
      'finance.cash_funds_confirmed',
      'finance.buyer_banks',
      'finance.buyer_banks_other',
      'finance.bond_preapproval_completed',
      'finance.bond_preapproval_document_available',
      'finance.employment_type',
      'finance.gross_monthly_income',
      'finance.monthly_living_expenses',
      'finance.bank_statements_available',
      'finance.credit_check_consent',
      'finance.bond_help_requested',
      'finance.joint_bond_application',
      'finance.cash_contribution_available',
      'finance.deposit_source',
      'finance.cash_contribution_source',
    ]),
    requiredFields: Object.freeze([
      'finance.cash_amount',
      'finance.bond_amount',
      'finance.proof_of_funds_available',
      'finance.source_of_funds',
      'finance.cash_funds_confirmed',
      'finance.buyer_banks',
      'finance.bond_preapproval_completed',
      'finance.employment_type',
      'finance.gross_monthly_income',
      'finance.monthly_living_expenses',
      'finance.bank_statements_available',
      'finance.credit_check_consent',
    ]),
    optionalFields: Object.freeze([
      'finance.buyer_banks_other',
      'finance.bond_preapproval_document_available',
      'finance.bond_help_requested',
      'finance.net_monthly_income',
      'finance.income_frequency',
      'finance.joint_bond_application',
      'finance.number_of_dependants',
      'finance.cash_contribution_available',
      'finance.deposit_source',
      'finance.cash_contribution_source',
    ]),
    internalDerivedFacts: Object.freeze([
      'finance.has_cash_component',
      'finance.has_bond_component',
      'finance.requires_bond_documents',
      'finance.requires_proof_of_funds',
      'finance.preapproval_status',
      'finance.credit_consent',
      'finance.support_mode',
    ]),
    documentTriggers: Object.freeze([
      'proof_of_funds',
      'bond_approval',
      'grant_signed',
      'proof_of_funds_cash_component',
    ]),
  }),
})

export const BUYER_ONBOARDING_FLOW_MATRIX = Object.freeze({
  naturalPersonBase: NATURAL_PERSON_BASE_RULES,
  entityBase: ENTITY_BASE_RULES,
  purchaseMode: PURCHASE_MODE_RULES,
  purchaser: PURCHASER_BRANCH_RULES,
  financeCore: FINANCE_CORE_RULES,
  finance: FINANCE_BRANCH_RULES,
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function mergeUnique(...groups) {
  const seen = new Set()
  const merged = []
  for (const group of groups.flat()) {
    const item = normalizeText(group)
    if (!item || seen.has(item)) continue
    seen.add(item)
    merged.push(item)
  }
  return merged
}

function readPath(source, path) {
  const parts = String(path || '').split('.').filter(Boolean)
  let current = source
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

function aliasMatches(value, aliases = []) {
  const normalized = normalizeKey(value)
  if (!normalized) return false
  return aliases.includes(normalized)
}

function resolveBranchFromRules(value, rules, fallback) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  for (const [branchKey, rule] of Object.entries(rules)) {
    if (normalized === branchKey) return branchKey
    if (aliasMatches(normalized, rule.aliases || [])) return branchKey
  }
  return fallback
}

function isFilled(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.values(value).some((item) => isFilled(item))
  return false
}

function hasForeignIndicators(form = {}, transaction = {}, facts = {}) {
  const source = facts && typeof facts === 'object' && Object.keys(facts).length ? facts : {}
  const residencyStatus =
    readPath(form, 'purchaser.residency_status') ||
    readPath(form, 'residency_status') ||
    readPath(transaction, 'residency_status') ||
    readPath(source, 'buyer.residency_status') ||
    ''
  const nonResidentFlag = [
    readPath(form, 'non_resident_exchange_control'),
    readPath(form, 'purchaser.non_resident_exchange_control'),
    readPath(transaction, 'non_resident_exchange_control'),
    readPath(source, 'buyer.non_resident_exchange_control'),
  ].some((value) => ['true', 'yes', 'y', '1', 'required'].includes(normalizeKey(value)))
  const nationality =
    readPath(form, 'purchaser.nationality') ||
    readPath(form, 'nationality') ||
    readPath(transaction, 'nationality') ||
    readPath(source, 'buyer.nationality') ||
    ''
  const normalizedNationality = normalizeKey(nationality)
  const identityNumber =
    readPath(form, 'purchaser.identity_number') ||
    readPath(form, 'identity_number') ||
    readPath(transaction, 'identity_number') ||
    readPath(source, 'buyer.identity_number') ||
    ''
  const passportNumber =
    readPath(form, 'purchaser.passport_number') ||
    readPath(form, 'passport_number') ||
    readPath(transaction, 'passport_number') ||
    readPath(source, 'buyer.passport_number') ||
    ''

  return (
    nonResidentFlag ||
    ['foreign_national', 'non_resident', 'non-resident', 'foreign', 'foreign_resident'].includes(normalizeKey(residencyStatus)) ||
    (normalizedNationality && !['south_african', 'south_africa', 'za', 'rsa'].includes(normalizedNationality)) ||
    (isFilled(passportNumber) && !isFilled(identityNumber))
  )
}

function resolveMarriedBranch(maritalRegime = '', fallback = 'married_coc') {
  const regime = normalizeKey(maritalRegime)
  if (regime.includes('accrual')) return 'married_anc_accrual'
  if (regime.includes('out_of_community')) return 'married_anc'
  if (regime.includes('in_community')) return 'married_coc'
  return fallback
}

export function resolveBuyerPurchaseMode(form = {}, transaction = {}, facts = {}) {
  const source = facts && typeof facts === 'object' && Object.keys(facts).length ? facts : {}
  const directCandidates = [
    readPath(source, 'purchaseMode'),
    readPath(source, 'purchase_mode'),
    readPath(form, 'natural_person_purchase_mode'),
    readPath(form, 'purchase_mode'),
    readPath(form, 'buyer.purchase_mode'),
    readPath(transaction, 'natural_person_purchase_mode'),
    readPath(transaction, 'purchase_mode'),
    readPath(source, 'buyer.purchase_mode'),
  ]

  for (const candidate of directCandidates) {
    const normalized = normalizeKey(candidate)
    if (!normalized) continue
    if (normalized === 'co_purchasing' || normalized === 'joint_purchase' || normalized === 'joint_buyer' || normalized === 'joint') {
      return 'co_purchasing'
    }
    if (normalized === 'individual' || normalized === 'single' || normalized === 'sole' || normalized === 'sole_buyer') {
      return 'individual'
    }
  }

  const purchasers = Array.isArray(form.purchasers) ? form.purchasers : []
  const coPurchaserPresent =
    isFilled(readPath(form, 'co_first_name')) ||
    isFilled(readPath(form, 'co_last_name')) ||
    isFilled(readPath(form, 'co_identity_number')) ||
    isFilled(readPath(form, 'co_passport_number')) ||
    isFilled(readPath(form, 'co_email')) ||
    isFilled(readPath(form, 'co_phone')) ||
    purchasers.length > 1

  return coPurchaserPresent ? 'co_purchasing' : 'individual'
}

export function resolveBuyerBranch(form = {}, transaction = {}, facts = {}) {
  const source = facts && typeof facts === 'object' && Object.keys(facts).length ? facts : {}
  const directCandidates = [
    readPath(source, 'flow.purchaser_branch'),
    readPath(source, 'purchaser_branch'),
    readPath(source, 'purchaser_type'),
    readPath(source, 'buyer.branch'),
    readPath(source, 'purchaserType'),
    readPath(form, 'purchaser_type'),
    readPath(form, 'purchaserType'),
    readPath(form, 'purchaser_entity_type'),
    readPath(form, 'buyer_entity_type'),
    readPath(form, 'buyer_type'),
    readPath(transaction, 'purchaser_type'),
    readPath(transaction, 'buyer_entity_type'),
    readPath(transaction, 'buyer_type'),
    readPath(source, 'buyer.purchaser_type'),
    readPath(source, 'buyer.legal_type'),
  ]

  for (const candidate of directCandidates) {
    const resolved = resolveBranchFromRules(candidate, PURCHASER_BRANCH_RULES, '')
    if (resolved && resolved !== 'individual') {
      return resolved
    }
  }

  if (hasForeignIndicators(form, transaction, source)) {
    return 'foreign_purchaser'
  }

  const maritalStatus =
    readPath(form, 'marital_status') ||
    readPath(form, 'purchaser.marital_status') ||
    readPath(transaction, 'marital_status') ||
    readPath(source, 'buyer.marital_status') ||
    ''
  const maritalRegime =
    readPath(form, 'marital_regime') ||
    readPath(form, 'purchaser.marital_regime') ||
    readPath(transaction, 'marital_regime') ||
    readPath(source, 'buyer.marital_regime') ||
    ''

  if (normalizeKey(maritalStatus) === 'married') {
    return resolveMarriedBranch(maritalRegime)
  }

  return 'individual'
}

export function resolveBuyerFinanceBranch(form = {}, transaction = {}, facts = {}) {
  const source = facts && typeof facts === 'object' && Object.keys(facts).length ? facts : {}
  const candidate = (
    readPath(source, 'finance_branch') ||
    readPath(source, 'financeType') ||
    readPath(source, 'finance_type') ||
    readPath(form, 'purchase_finance_type') ||
    readPath(form, 'finance_type') ||
    readPath(form, 'buyer.finance_type') ||
    readPath(transaction, 'finance_type') ||
    readPath(source, 'purchase.finance_type') ||
    readPath(source, 'finance.type') ||
    'cash'
  )

  const normalized = normalizeFinanceType(candidate, { allowUnknown: true })
  if (normalized === 'bond') return 'bond'
  if (normalized === 'combination') return 'hybrid'
  if (normalized === 'cash') return 'cash'
  return 'cash'
}

function normalizeYesNoChoice(value) {
  const normalized = normalizeKey(value)
  if (['yes', 'true', '1', 'y', 'confirmed', 'required'].includes(normalized)) {
    return 'yes'
  }
  if (['no', 'false', '0', 'n'].includes(normalized)) {
    return 'no'
  }
  return ''
}

function normalizeBuyerBankList(value) {
  if (Array.isArray(value)) {
    return mergeUnique(value.map((item) => normalizeKey(item)).filter(Boolean))
  }
  const text = normalizeText(value)
  if (!text) return []
  return mergeUnique(
    text
      .split(/[,;/|]+/)
      .map((item) => normalizeKey(item))
      .filter(Boolean),
  )
}

function resolveBuyerPreapprovalCompleted(form = {}, transaction = {}, facts = {}) {
  const source = facts && typeof facts === 'object' && Object.keys(facts).length ? facts : {}
  const explicit = normalizeYesNoChoice(
    readPath(form, 'finance.bond_preapproval_completed') ||
      readPath(form, 'bond_preapproval_completed') ||
      readPath(transaction, 'bond_preapproval_completed') ||
      readPath(source, 'finance.bond_preapproval_completed') ||
      readPath(source, 'finance.preapproval_completed'),
  )
  if (explicit) return explicit

  const legacyStatus = normalizeKey(
    readPath(form, 'finance.bond_current_status') ||
      readPath(form, 'bond_current_status') ||
      readPath(transaction, 'bond_current_status') ||
      readPath(source, 'finance.bond_current_status') ||
      readPath(source, 'finance.current_status'),
  )
  if (['pre_approval_only', 'preapproval', 'pre_approved', 'approved', 'approval_granted', 'grant_issued'].includes(legacyStatus)) {
    return 'yes'
  }
  if (['not_started', 'none', 'no_application', 'not_applicable'].includes(legacyStatus)) {
    return 'no'
  }

  const legacyStarted = normalizeYesNoChoice(
    readPath(form, 'finance.bond_process_started') ||
      readPath(form, 'bond_process_started') ||
      readPath(transaction, 'bond_process_started') ||
      readPath(source, 'finance.bond_process_started'),
  )
  if (legacyStarted === 'no') return 'no'
  return ''
}

export function resolveBuyerFinanceModel(form = {}, transaction = {}, facts = {}) {
  const source = facts && typeof facts === 'object' && Object.keys(facts).length ? facts : {}
  const financeBranch = resolveBuyerFinanceBranch(form, transaction, source)
  const preapprovalCompleted = financeBranch === 'cash' ? '' : resolveBuyerPreapprovalCompleted(form, transaction, source)
  const preapprovalDocumentAvailable = normalizeYesNoChoice(
    readPath(form, 'finance.bond_preapproval_document_available') ||
      readPath(form, 'bond_preapproval_document_available') ||
      readPath(transaction, 'bond_preapproval_document_available') ||
      readPath(source, 'finance.bond_preapproval_document_available') ||
      readPath(source, 'finance.preapproval_document_available'),
  )
  const buyerBanks = normalizeBuyerBankList(
    readPath(form, 'finance.buyer_banks') ||
      readPath(form, 'buyer_banks') ||
      readPath(transaction, 'buyer_banks') ||
      readPath(source, 'finance.buyer_banks') ||
      readPath(form, 'finance.bond_bank_name') ||
      readPath(form, 'bond_bank_name') ||
      readPath(transaction, 'bond_bank_name') ||
      readPath(source, 'finance.bond_bank_name'),
  )
  const buyerBanksOther = normalizeText(
    readPath(form, 'finance.buyer_banks_other') ||
      readPath(form, 'buyer_banks_other') ||
      readPath(transaction, 'buyer_banks_other') ||
      readPath(source, 'finance.buyer_banks_other'),
  )
  const creditCheckConsent = normalizeYesNoChoice(
    readPath(form, 'finance.credit_check_consent') ||
      readPath(form, 'credit_check_consent') ||
      readPath(transaction, 'credit_check_consent') ||
      readPath(source, 'finance.credit_check_consent') ||
      readPath(form, 'finance.bond_readiness_consent') ||
      readPath(form, 'bond_readiness_consent') ||
      readPath(transaction, 'bond_readiness_consent') ||
      readPath(source, 'finance.bond_readiness_consent'),
  )
  const financeSupportMode = financeBranch === 'cash' ? 'self_managed' : resolveBuyerFinanceSupportMode(form, transaction, source)

  return {
    branch: financeBranch,
    finance_branch: financeBranch,
    finance_type: financeBranch === 'hybrid' ? 'combination' : financeBranch,
    buyer_banks: buyerBanks,
    buyer_banks_other: buyerBanks.includes('other') ? buyerBanksOther : '',
    preapproval_completed: preapprovalCompleted,
    preapproval_status: financeBranch === 'cash' ? 'not_applicable' : preapprovalCompleted === 'yes' ? 'completed' : preapprovalCompleted === 'no' ? 'not_completed' : 'unknown',
    preapproval_document_available: preapprovalCompleted === 'yes' ? preapprovalDocumentAvailable : '',
    credit_check_consent: creditCheckConsent,
    support_mode: financeSupportMode,
    bond_help_requested: financeSupportMode === 'originator_led' ? 'yes' : 'no',
  }
}

function resolveBuyerFinanceSupportMode(form = {}, transaction = {}, facts = {}) {
  const source = facts && typeof facts === 'object' && Object.keys(facts).length ? facts : {}
  const preapprovalCompleted = resolveBuyerPreapprovalCompleted(form, transaction, source)
  if (preapprovalCompleted === 'yes') {
    return 'self_managed'
  }
  const directCandidates = [
    readPath(source, 'finance_support_mode'),
    readPath(source, 'buyer.finance_support_mode'),
    readPath(source, 'finance.support_mode'),
    readPath(form, 'finance_support_mode'),
    readPath(form, 'finance.bond_help_requested'),
    readPath(form, 'bond_help_requested'),
    readPath(form, 'ooba_assist_requested'),
    readPath(form, 'finance.ooba_assist_requested'),
    readPath(transaction, 'bond_help_requested'),
    readPath(transaction, 'ooba_assist_requested'),
  ]

  for (const candidate of directCandidates) {
    const yesNo = normalizeYesNoChoice(candidate)
    if (yesNo === 'yes') {
      return 'originator_led'
    }
    if (yesNo === 'no') {
      return 'self_managed'
    }
    const normalized = normalizeKey(candidate)
    if (['originator_led', 'originator-led', 'assisted', 'assisted_originator'].includes(normalized)) {
      return 'originator_led'
    }
    if (['self_managed', 'self-managed', 'self_service'].includes(normalized)) {
      return 'self_managed'
    }
  }

  return 'self_managed'
}

function resolveBranchContract(rules, branchKey, baseRules) {
  const branchDefinition = rules[branchKey] || rules.individual || {}
  return {
    key: branchKey,
    label: branchDefinition.label || branchKey,
    aliases: branchDefinition.aliases || [],
    buyerFacingQuestions: mergeUnique(baseRules.buyerFacingQuestions, branchDefinition.buyerFacingQuestions),
    requiredFields: mergeUnique(baseRules.requiredFields, branchDefinition.requiredFields),
    optionalFields: mergeUnique(baseRules.optionalFields, branchDefinition.optionalFields),
    internalDerivedFacts: mergeUnique(baseRules.internalDerivedFacts, branchDefinition.internalDerivedFacts),
    documentTriggers: mergeUnique(baseRules.documentTriggers, branchDefinition.documentTriggers),
  }
}

function buyerLegalTypeForBranch(branch = '') {
  if (branch === 'company') return 'company'
  if (branch === 'close_corporation') return 'close_corporation'
  if (branch === 'trust') return 'trust'
  if (branch === 'foreign_purchaser') return 'foreign_individual'
  if (
    [
      'power_of_attorney',
      'deceased_estate',
      'minor',
      'insolvent',
      'curatorship',
      'business_rescue',
      'liquidation',
    ].includes(branch)
  ) {
    return branch
  }
  return 'individual'
}

function usesNonNaturalBuyerBase(branch = '') {
  return [
    'company',
    'close_corporation',
    'trust',
    'power_of_attorney',
    'deceased_estate',
    'minor',
    'insolvent',
    'curatorship',
    'business_rescue',
    'liquidation',
  ].includes(branch)
}

function buildBranchSummary({
  purchaserDefinition,
  purchaseModeDefinition,
  financeDefinition,
  purchaserBranch,
  purchaseMode,
  financeBranch,
  financeSupportMode,
}) {
  return {
    purchaser: {
      key: purchaserBranch,
      label: purchaserDefinition.label || purchaserBranch,
      legal_type: buyerLegalTypeForBranch(purchaserBranch),
    },
    purchase_mode: {
      key: purchaseMode,
      label: purchaseModeDefinition.label || purchaseMode,
    },
    finance: {
      key: financeBranch,
      label: financeDefinition.label || financeBranch,
      support_mode: {
        key: financeSupportMode,
        label: financeSupportMode === 'originator_led' ? 'Bond Help Requested' : 'Self Managed',
      },
    },
  }
}

export function resolveBuyerOnboardingFlowContract(form = {}, transaction = {}, facts = {}) {
  const source = facts && typeof facts === 'object' && Object.keys(facts).length ? facts : {}
  const purchaserBranch = resolveBuyerBranch(form, transaction, source)
  const usesEntityLikeBase = usesNonNaturalBuyerBase(purchaserBranch)
  const purchaseMode = usesEntityLikeBase ? 'individual' : resolveBuyerPurchaseMode(form, transaction, source)
  const financeModel = resolveBuyerFinanceModel(form, transaction, source)
  const financeBranch = financeModel.finance_branch
  const financeSupportMode = financeModel.support_mode

  const purchaserDefinition = resolveBranchContract(
    PURCHASER_BRANCH_RULES,
    purchaserBranch,
    usesEntityLikeBase ? ENTITY_BASE_RULES : NATURAL_PERSON_BASE_RULES,
  )
  const purchaseModeDefinition = resolveBranchContract(PURCHASE_MODE_RULES, purchaseMode, { buyerFacingQuestions: [], requiredFields: [], optionalFields: [], internalDerivedFacts: [], documentTriggers: [] })
  const financeDefinition = resolveBranchContract(FINANCE_BRANCH_RULES, financeBranch, FINANCE_CORE_RULES)

  const buyerFacingQuestions = mergeUnique(
    purchaserDefinition.buyerFacingQuestions,
    purchaseModeDefinition.buyerFacingQuestions,
    financeDefinition.buyerFacingQuestions,
  )
  const requiredFields = mergeUnique(
    purchaserDefinition.requiredFields,
    purchaseModeDefinition.requiredFields,
    financeDefinition.requiredFields,
  )
  const optionalFields = mergeUnique(
    purchaserDefinition.optionalFields,
    purchaseModeDefinition.optionalFields,
    financeDefinition.optionalFields,
  )
  const internalDerivedFacts = mergeUnique(
    purchaserDefinition.internalDerivedFacts,
    purchaseModeDefinition.internalDerivedFacts,
    financeDefinition.internalDerivedFacts,
    'flow.version',
    'flow.purchaser_branch',
    'flow.purchase_mode',
    'flow.finance_branch',
    'flow.finance_support_mode',
  )
  const documentTriggers = mergeUnique(
    purchaserDefinition.documentTriggers,
    purchaseModeDefinition.documentTriggers,
    financeDefinition.documentTriggers,
  )

  return {
    version: BUYER_ONBOARDING_FLOW_VERSION,
    buyer_branch: purchaserBranch,
    buyer_branch_label: purchaserDefinition.label,
    purchaser_branch: purchaserBranch,
    purchaser_branch_label: purchaserDefinition.label,
    purchaser_type: purchaserBranch,
    buyer_legal_type: buyerLegalTypeForBranch(purchaserBranch),
    buyer_purchase_mode: purchaseMode,
    buyer_purchase_mode_label: purchaseModeDefinition.label,
    purchase_mode: purchaseMode,
    purchase_mode_label: purchaseModeDefinition.label,
    buyer_finance_branch: financeBranch,
    buyer_finance_branch_label: financeDefinition.label,
    buyer_finance_support_mode: financeSupportMode,
    buyer_finance_support_mode_label: financeSupportMode === 'originator_led' ? 'Bond Help Requested' : 'Self Managed',
    finance_branch: financeBranch,
    finance_branch_label: financeDefinition.label,
    finance_support_mode: financeSupportMode,
    finance_support_mode_label: financeSupportMode === 'originator_led' ? 'Bond Help Requested' : 'Self Managed',
    finance_type: financeBranch === 'hybrid' ? 'combination' : financeBranch,
    finance_preapproval_status: financeModel.preapproval_status,
    visible_fields: mergeUnique(buyerFacingQuestions, requiredFields, optionalFields),
    buyer_facing_questions: buyerFacingQuestions,
    required_fields: requiredFields,
    optional_fields: optionalFields,
    internal_derived_facts: internalDerivedFacts,
    document_triggers: documentTriggers,
    field_aliases: BUYER_ONBOARDING_FIELD_ALIASES,
    resolver_models: {
      finance: financeModel,
    },
    branch_summary: buildBranchSummary({
      purchaserDefinition,
      purchaseModeDefinition,
      financeDefinition,
      purchaserBranch,
      purchaseMode,
      financeBranch,
      financeSupportMode,
    }),
    purchaser: purchaserDefinition,
    purchase_mode_definition: purchaseModeDefinition,
    finance: financeDefinition,
  }
}
