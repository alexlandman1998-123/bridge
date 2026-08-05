import { getCanonicalMergeFieldDefinition } from './mergeFieldRegistry.js'
import { listOtpResaleReferenceFieldFamilies } from './otpReferenceExtraction.js'
import { OTP_DATA_SOURCE_OWNERS } from './otpRouteUniverse.js'

export const OTP_FIELD_REGISTRY_VERSION = 'otp_field_registry_phase4_v1'
export const OTP_FIELD_REGISTRY_PHASE3_VERSION = 'otp_field_registry_phase3_v1'

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

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function cloneField(field = {}) {
  return {
    ...field,
    variants: Object.freeze([...(field.variants || [])]),
    clauseFamilies: Object.freeze([...(field.clauseFamilies || [])]),
    definitionTerms: Object.freeze([...(field.definitionTerms || [])]),
    sourcePaths: Object.freeze([...(field.sourcePaths || [])]),
  }
}

function field({
  key,
  label,
  owner,
  policy = 'optional_hide_when_empty',
  variants = ['resale_existing_property', 'new_development'],
  clauseFamilies = [],
  definitionTerms = [],
  sourcePaths = [],
  renderable = true,
} = {}) {
  return Object.freeze(cloneField({
    key,
    label,
    owner,
    policy,
    variants,
    clauseFamilies,
    definitionTerms,
    sourcePaths,
    renderable,
  }))
}

export const OTP_FIELD_POLICIES = Object.freeze({
  blockGeneration: 'block_generation',
  conditionalRequired: 'conditional_required',
  optionalHideWhenEmpty: 'optional_hide_when_empty',
  runtimeGenerated: 'runtime_generated',
  reviewRequired: 'review_required',
})

export const OTP_PHASE3_REFERENCE_FIELD_FAMILY_BINDINGS = Object.freeze([
  Object.freeze({
    familyKey: 'purchaser_identity_capacity',
    fieldKeys: Object.freeze([
      'buyer_full_name',
      'buyer_id_number',
      'buyer_domicilium_address',
      'buyer_income_tax_number',
      'buyer_vat_number',
      'buyer_marital_status',
      'buyer_marital_regime',
    ]),
  }),
  Object.freeze({
    familyKey: 'property_identity',
    fieldKeys: Object.freeze([
      'property_address',
      'erf_number',
      'property_township',
      'homeowners_association_name',
    ]),
  }),
  Object.freeze({
    familyKey: 'commercial_offer_terms',
    fieldKeys: Object.freeze([
      'purchase_price',
      'purchase_price_words',
      'deposit_amount',
      'deposit_due_date',
      'cash_amount',
      'irrevocable_offer_expiry',
    ]),
  }),
  Object.freeze({
    familyKey: 'structured_suspensive_conditions',
    fieldKeys: Object.freeze([
      'structured_suspensive_conditions',
      'bond_amount',
      'bond_approval_deadline',
      'subject_sale_property',
      'subject_sale_minimum_price',
      'subject_sale_fulfilment_date',
    ]),
  }),
  Object.freeze({
    familyKey: 'occupation_rental_guarantees',
    fieldKeys: Object.freeze([
      'occupation_date',
      'occupational_rent_payable',
      'occupational_rent_amount',
      'guarantee_delivery_deadline',
      'guarantee_delivery_period',
    ]),
  }),
  Object.freeze({
    familyKey: 'fixtures_fittings',
    fieldKeys: Object.freeze([
      'fixtures_included',
      'fixtures_excluded',
    ]),
  }),
  Object.freeze({
    familyKey: 'agent_agency_commission',
    fieldKeys: Object.freeze([
      'organisation_trading_name',
      'agent_full_name',
      'agent_ffc_number',
      'gross_commission_amount',
    ]),
  }),
  Object.freeze({
    familyKey: 'seller_identity_admin',
    fieldKeys: Object.freeze([
      'seller_full_name',
      'seller_id_number',
      'seller_domicilium_address',
      'seller_vat_number',
      'seller_bond_institution',
      'seller_bond_account_number',
      'seller_outstanding_bond_amount',
      'seller_rates_taxes_up_to_date',
      'rates_and_taxes_account_number',
    ]),
  }),
  Object.freeze({
    familyKey: 'conveyancing_attorneys',
    fieldKeys: Object.freeze([
      'transfer_attorney_company_name',
      'transfer_attorney_contact_person',
      'transfer_attorney_email',
      'transfer_attorney_phone',
      'trust_account_recipient',
    ]),
  }),
  Object.freeze({
    familyKey: 'bond_originator_documents',
    fieldKeys: Object.freeze([
      'buyer_employment_type',
      'buyer_employer_name',
      'buyer_occupation',
      'buyer_gross_monthly_income',
      'buyer_banking_institution',
      'bond_documents_required',
      'bond_originator_acknowledgement',
    ]),
  }),
])

export const OTP_FIELD_REGISTRY = Object.freeze([
  field({
    key: 'otp_document_variant',
    label: 'OTP document variant',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['routing'],
    sourcePaths: ['invite.otpDocumentVariant', 'transaction.transaction_type', 'listing.developmentId'],
  }),
  field({
    key: 'buyer_full_name',
    label: 'Buyer legal name',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['parties'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.fullName', 'residentialOfferTerms.buyer.fullName'],
  }),
  field({
    key: 'buyer_id_number',
    label: 'Buyer ID or registration number',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['parties', 'capacity_authority'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.idNumber', 'residentialOfferTerms.buyer.idNumber'],
  }),
  field({
    key: 'buyer_email',
    label: 'Buyer email',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['parties'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.email', 'residentialOfferTerms.buyer.email'],
  }),
  field({
    key: 'buyer_phone',
    label: 'Buyer phone',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['parties'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.phone', 'residentialOfferTerms.buyer.phone'],
  }),
  field({
    key: 'buyer_entity_type',
    label: 'Buyer entity type',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['parties', 'capacity_authority'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['residentialOfferTerms.capacity.purchaserType'],
  }),
  field({
    key: 'buyer_marital_status',
    label: 'Buyer marital status',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['capacity_authority', 'signatures'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.person.marital_status', 'onboarding_form_data.maritalStatus'],
  }),
  field({
    key: 'buyer_spouse_full_name',
    label: 'Buyer spouse full name',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property', 'new_development'],
    clauseFamilies: ['parties', 'signatures'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.person.spouse_full_name', 'onboarding_form_data.spouseFullName'],
  }),
  field({
    key: 'buyer_spouse_consent_required',
    label: 'Buyer spouse consent required',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property', 'new_development'],
    clauseFamilies: ['parties', 'signatures'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.person.spouse_consent_required', 'onboarding_form_data.spouseConsentRequired'],
  }),
  field({
    key: 'buyer_representative_name',
    label: 'Buyer representative name',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property', 'new_development'],
    clauseFamilies: ['capacity_authority', 'parties', 'signatures'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.company.authorised_signatory.name', 'buyer.trust.authorised_trustee.name', 'onboarding_form_data.representativeName'],
  }),
  field({
    key: 'buyer_representative_capacity',
    label: 'Buyer representative capacity',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property', 'new_development'],
    clauseFamilies: ['capacity_authority', 'parties', 'signatures'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.company.authorised_signatory.capacity', 'buyer.trust.authorised_trustee.capacity', 'onboarding_form_data.representativeCapacity'],
  }),
  field({
    key: 'buyer_marital_regime',
    label: 'Buyer marital regime',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['capacity_authority', 'signatures'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.person.marital_regime', 'onboarding_form_data.maritalRegime'],
  }),
  field({
    key: 'buyer_domicilium_address',
    label: 'Buyer domicilium address',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property', 'new_development'],
    clauseFamilies: ['parties', 'domicilium_notices'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.person.residential_address', 'onboarding_form_data.residentialAddress'],
  }),
  field({
    key: 'buyer_income_tax_number',
    label: 'Buyer income tax number',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['parties'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.taxNumber', 'residentialOfferTerms.buyer.incomeTaxNumber'],
  }),
  field({
    key: 'buyer_vat_number',
    label: 'Buyer VAT number',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['parties', 'purchase_price'],
    definitionTerms: ['purchaser', 'vat'],
    sourcePaths: ['buyer.vatNumber', 'residentialOfferTerms.buyer.vatNumber'],
  }),
  field({
    key: 'seller_full_name',
    label: 'Seller legal name',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['resale_existing_property'],
    clauseFamilies: ['parties'],
    definitionTerms: ['seller'],
    sourcePaths: ['seller.fullName', 'seller_onboarding.fullName'],
  }),
  field({
    key: 'seller_id_number',
    label: 'Seller ID or registration number',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['resale_existing_property'],
    clauseFamilies: ['parties', 'capacity_authority'],
    definitionTerms: ['seller'],
    sourcePaths: ['seller.idNumber', 'seller_onboarding.idNumber'],
  }),
  field({
    key: 'seller_email',
    label: 'Seller email',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['resale_existing_property'],
    clauseFamilies: ['parties'],
    definitionTerms: ['seller'],
    sourcePaths: ['seller.email', 'seller_onboarding.email'],
  }),
  field({
    key: 'seller_phone',
    label: 'Seller phone',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['parties'],
    definitionTerms: ['seller'],
    sourcePaths: ['seller.phone', 'seller_onboarding.phone'],
  }),
  field({
    key: 'seller_entity_type',
    label: 'Seller entity type',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['resale_existing_property'],
    clauseFamilies: ['parties', 'capacity_authority'],
    definitionTerms: ['seller'],
    sourcePaths: ['seller.entityType', 'seller_onboarding.ownershipType'],
  }),
  field({
    key: 'seller_domicilium_address',
    label: 'Seller domicilium address',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['parties', 'domicilium_notices'],
    definitionTerms: ['seller'],
    sourcePaths: ['seller.domiciliumAddress', 'seller_onboarding.currentAddress'],
  }),
  field({
    key: 'seller_vat_number',
    label: 'Seller VAT number',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['parties', 'purchase_price'],
    definitionTerms: ['seller', 'vat'],
    sourcePaths: ['seller.vatNumber', 'seller_onboarding.vatNumber'],
  }),
  field({
    key: 'seller_bond_institution',
    label: 'Seller bond institution',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['rates_taxes_consumption_charges'],
    definitionTerms: ['property'],
    sourcePaths: ['seller.bondInstitution', 'seller_onboarding.bondInstitution'],
  }),
  field({
    key: 'seller_bond_account_number',
    label: 'Seller bond account number',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['rates_taxes_consumption_charges'],
    definitionTerms: ['property'],
    sourcePaths: ['seller.bondAccountNumber', 'seller_onboarding.bondAccountNumber'],
  }),
  field({
    key: 'seller_outstanding_bond_amount',
    label: 'Seller outstanding bond amount',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['rates_taxes_consumption_charges'],
    definitionTerms: ['property'],
    sourcePaths: ['seller.outstandingBondAmount', 'seller_onboarding.outstandingBondAmount'],
  }),
  field({
    key: 'seller_rates_taxes_up_to_date',
    label: 'Seller rates and taxes up to date',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['rates_taxes_consumption_charges'],
    definitionTerms: ['property'],
    sourcePaths: ['seller.ratesTaxesUpToDate', 'seller_onboarding.ratesTaxesUpToDate'],
  }),
  field({
    key: 'rates_and_taxes_account_number',
    label: 'Rates and taxes account number',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['rates_taxes_consumption_charges'],
    definitionTerms: ['property'],
    sourcePaths: ['seller.ratesTaxesAccountNumber', 'seller_onboarding.ratesTaxesAccountNumber'],
  }),
  field({
    key: 'developer_name',
    label: 'Developer seller',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['new_development'],
    clauseFamilies: ['parties', 'development_unit'],
    definitionTerms: ['seller', 'development'],
    sourcePaths: ['development.developerName', 'developer.company_name'],
  }),
  field({
    key: 'developer_company_registration',
    label: 'Developer registration',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['parties', 'capacity_authority'],
    definitionTerms: ['seller'],
    sourcePaths: ['development.developerRegistrationNumber', 'developer.registration_number'],
  }),
  field({
    key: 'developer_representative',
    label: 'Developer representative',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['parties', 'capacity_authority', 'signatures'],
    definitionTerms: ['seller', 'development'],
    sourcePaths: ['development.developerRepresentative', 'developer.representative_name'],
  }),
  field({
    key: 'developer_contact_email',
    label: 'Developer contact email',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['parties', 'domicilium_notices'],
    definitionTerms: ['seller', 'development'],
    sourcePaths: ['development.developerContactEmail', 'developer.contact_email'],
  }),
  field({
    key: 'contractor_company_name',
    label: 'Contractor company',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['development_unit', 'compliance_certificates'],
    definitionTerms: ['contractor', 'nhbrc'],
    sourcePaths: ['development.contractorCompanyName', 'contractor.company_name'],
  }),
  field({
    key: 'contractor_registration_number',
    label: 'Contractor registration',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['development_unit', 'compliance_certificates', 'signatures'],
    definitionTerms: ['contractor', 'nhbrc'],
    sourcePaths: ['development.contractorRegistrationNumber', 'contractor.registration_number'],
  }),
  field({
    key: 'property_address',
    label: 'Property address',
    owner: 'listing_property_record',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['resale_existing_property'],
    clauseFamilies: ['property'],
    definitionTerms: ['property'],
    sourcePaths: ['listing.propertyAddress', 'property.address'],
  }),
  field({
    key: 'erf_number',
    label: 'Erf number',
    owner: 'listing_property_record',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['property'],
    definitionTerms: ['property'],
    sourcePaths: ['listing.erfNumber', 'property.erf_number', 'seller_onboarding.erfNumber'],
  }),
  field({
    key: 'property_township',
    label: 'Property township',
    owner: 'listing_property_record',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['property'],
    definitionTerms: ['property'],
    sourcePaths: ['listing.township', 'property.township', 'seller_onboarding.township'],
  }),
  field({
    key: 'homeowners_association_name',
    label: 'Homeowners association',
    owner: 'listing_property_record',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['property', 'rates_taxes_consumption_charges'],
    definitionTerms: ['property'],
    sourcePaths: ['listing.homeownersAssociationName', 'property.hoaName', 'seller_onboarding.homeownersAssociationName'],
  }),
  field({
    key: 'property_title_type',
    label: 'Property title type',
    owner: 'listing_property_record',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['resale_existing_property'],
    clauseFamilies: ['property'],
    definitionTerms: ['property'],
    sourcePaths: ['property.title_type', 'listing.propertyStructureType'],
  }),
  field({
    key: 'development_name',
    label: 'Development name',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['new_development'],
    clauseFamilies: ['development_unit'],
    definitionTerms: ['development'],
    sourcePaths: ['development.name', 'unit.development.name'],
  }),
  field({
    key: 'property_unit_number',
    label: 'Unit or section number',
    owner: 'development_unit_setup',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['new_development'],
    clauseFamilies: ['property', 'development_unit'],
    definitionTerms: ['section_unit', 'property'],
    sourcePaths: ['unit.unitNumber', 'property.unit_number'],
  }),
  field({
    key: 'sectional_plan_status',
    label: 'Sectional plan status',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['transfer_conveyancer', 'development_unit'],
    definitionTerms: ['sectional_plan'],
    sourcePaths: ['development.sectionalPlanStatus'],
  }),
  field({
    key: 'body_corporate_name',
    label: 'Body corporate name',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['body_corporate'],
    definitionTerms: ['body_corporate'],
    sourcePaths: ['development.bodyCorporateName'],
  }),
  field({
    key: 'body_corporate_rules_annexure',
    label: 'Body corporate rules annexure',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['body_corporate', 'annexures'],
    definitionTerms: ['rules', 'body_corporate'],
    sourcePaths: ['development.bodyCorporateRulesAnnexure'],
  }),
  field({
    key: 'participation_quota',
    label: 'Participation quota',
    owner: 'development_unit_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['development_unit'],
    definitionTerms: ['participation_quota', 'common_property'],
    sourcePaths: ['unit.participationQuota'],
  }),
  field({
    key: 'parking_bay',
    label: 'Parking bay',
    owner: 'development_unit_setup',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['new_development'],
    clauseFamilies: ['development_unit'],
    definitionTerms: ['parking_bay'],
    sourcePaths: ['unit.parkingBay'],
  }),
  field({
    key: 'garage_allocation',
    label: 'Garage allocation',
    owner: 'development_unit_setup',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['new_development'],
    clauseFamilies: ['development_unit'],
    definitionTerms: ['parking_bay'],
    sourcePaths: ['unit.garageAllocation'],
  }),
  field({
    key: 'purchase_price',
    label: 'Purchase price',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['purchase_price'],
    definitionTerms: ['purchase_price'],
    sourcePaths: ['transaction.purchase_price', 'residentialOfferTerms.finance.offerAmount'],
  }),
  field({
    key: 'purchase_price_words',
    label: 'Purchase price in words',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['purchase_price'],
    definitionTerms: ['purchase_price'],
    sourcePaths: ['computed.purchasePriceWords'],
  }),
  field({
    key: 'vat_inclusive_purchase_price',
    label: 'VAT-inclusive purchase price',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['new_development'],
    clauseFamilies: ['purchase_price', 'development_unit'],
    definitionTerms: ['vat', 'purchase_price'],
    sourcePaths: ['development.vatInclusivePurchasePrice', 'transaction.vatInclusivePurchasePrice'],
  }),
  field({
    key: 'deposit_amount',
    label: 'Deposit amount',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    clauseFamilies: ['purchase_price'],
    definitionTerms: ['deposit'],
    sourcePaths: ['residentialOfferTerms.finance.depositAmount'],
  }),
  field({
    key: 'deposit_due_date',
    label: 'Deposit due date',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['purchase_price'],
    definitionTerms: ['deposit'],
    sourcePaths: ['residentialOfferTerms.finance.depositDueDate'],
  }),
  field({
    key: 'finance_type',
    label: 'Finance type',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['finance', 'suspensive_conditions'],
    definitionTerms: ['suspensive_conditions'],
    sourcePaths: ['residentialOfferTerms.finance.financeType'],
  }),
  field({
    key: 'bond_amount',
    label: 'Bond amount',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['finance', 'suspensive_conditions'],
    definitionTerms: ['suspensive_conditions'],
    sourcePaths: ['residentialOfferTerms.finance.bondAmount'],
  }),
  field({
    key: 'bond_approval_deadline',
    label: 'Bond approval deadline',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['finance', 'suspensive_conditions'],
    definitionTerms: ['suspensive_conditions'],
    sourcePaths: ['residentialOfferTerms.finance.bondApprovalDeadline'],
  }),
  field({
    key: 'cash_amount',
    label: 'Cash contribution',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['finance', 'suspensive_conditions'],
    definitionTerms: ['suspensive_conditions'],
    sourcePaths: ['residentialOfferTerms.finance.cashContribution'],
  }),
  field({
    key: 'cash_proof_deadline',
    label: 'Cash proof deadline',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['finance', 'suspensive_conditions'],
    definitionTerms: ['suspensive_conditions'],
    sourcePaths: ['residentialOfferTerms.finance.cashProofDeadline'],
  }),
  field({
    key: 'guarantee_delivery_deadline',
    label: 'Guarantee delivery deadline',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['finance', 'transfer_conveyancer'],
    definitionTerms: ['guarantees'],
    sourcePaths: ['residentialOfferTerms.finance.guaranteeDeliveryDeadline'],
  }),
  field({
    key: 'guarantee_delivery_period',
    label: 'Guarantee delivery period',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['finance', 'transfer_conveyancer'],
    definitionTerms: ['guarantees'],
    sourcePaths: ['residentialOfferTerms.finance.guaranteeDeliveryPeriod'],
  }),
  field({
    key: 'irrevocable_offer_expiry',
    label: 'Irrevocable offer expiry',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['offer_acceptance'],
    definitionTerms: ['agreement'],
    sourcePaths: ['residentialOfferTerms.terms.expiryDate', 'residentialOfferTerms.terms.expiryTime'],
  }),
  field({
    key: 'structured_suspensive_conditions',
    label: 'Structured suspensive conditions',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    clauseFamilies: ['suspensive_conditions'],
    definitionTerms: ['suspensive_conditions'],
    sourcePaths: ['residentialOfferTerms.conditionRequests.structuredConditions'],
  }),
  field({
    key: 'buyer_employment_type',
    label: 'Buyer employment type',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['finance'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.employment.type', 'buyer_onboarding.employmentType'],
  }),
  field({
    key: 'buyer_employer_name',
    label: 'Buyer employer name',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['finance'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.employment.employerName', 'buyer_onboarding.employerName'],
  }),
  field({
    key: 'buyer_occupation',
    label: 'Buyer occupation',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['finance'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.employment.occupation', 'buyer_onboarding.occupation'],
  }),
  field({
    key: 'buyer_gross_monthly_income',
    label: 'Buyer gross monthly income',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['finance'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.finance.grossMonthlyIncome', 'buyer_onboarding.grossMonthlyIncome'],
  }),
  field({
    key: 'buyer_banking_institution',
    label: 'Buyer banking institution',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['finance'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.finance.bankingInstitution', 'buyer_onboarding.bankingInstitution'],
  }),
  field({
    key: 'bond_documents_required',
    label: 'Bond documents required',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    variants: ['resale_existing_property'],
    clauseFamilies: ['finance', 'annexures'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.bondDocumentsRequired', 'bondOriginator.requiredDocuments'],
  }),
  field({
    key: 'bond_originator_acknowledgement',
    label: 'Bond originator acknowledgement',
    owner: 'buyer_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['finance'],
    definitionTerms: ['purchaser'],
    sourcePaths: ['buyer.bondOriginatorAcknowledgement', 'residentialOfferTerms.acknowledgements.bondOriginator'],
  }),
  field({
    key: 'subject_sale_property',
    label: 'Subject-to-sale property',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['suspensive_conditions'],
    definitionTerms: ['suspensive_conditions', 'property'],
    sourcePaths: ['residentialOfferTerms.terms.subjectSaleProperty'],
  }),
  field({
    key: 'subject_sale_minimum_price',
    label: 'Subject-to-sale minimum price',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['suspensive_conditions'],
    definitionTerms: ['suspensive_conditions', 'purchase_price'],
    sourcePaths: ['residentialOfferTerms.terms.subjectSaleMinimumPrice'],
  }),
  field({
    key: 'subject_sale_fulfilment_date',
    label: 'Subject-to-sale fulfilment date',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['suspensive_conditions'],
    definitionTerms: ['suspensive_conditions'],
    sourcePaths: ['residentialOfferTerms.terms.subjectSaleFulfilmentDate'],
  }),
  field({
    key: 'occupation_date',
    label: 'Occupation date',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['occupation_rent'],
    definitionTerms: ['occupation_date'],
    sourcePaths: ['residentialOfferTerms.terms.occupationDate'],
  }),
  field({
    key: 'occupational_rent_payable',
    label: 'Occupational rent payable',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['occupation_rent'],
    definitionTerms: ['occupational_rental'],
    sourcePaths: ['residentialOfferTerms.terms.occupationalRent'],
  }),
  field({
    key: 'occupational_rent_amount',
    label: 'Occupational rent amount',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['occupation_rent'],
    definitionTerms: ['occupational_rental'],
    sourcePaths: ['residentialOfferTerms.terms.occupationalRentAmount'],
  }),
  field({
    key: 'fixtures_included',
    label: 'Included fixtures',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['fixtures_defects_disclosure'],
    definitionTerms: ['fixtures'],
    sourcePaths: ['seller.fixturesIncluded', 'residentialOfferTerms.terms.includedFixtures'],
  }),
  field({
    key: 'fixtures_excluded',
    label: 'Excluded fixtures',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['fixtures_defects_disclosure'],
    definitionTerms: ['fixtures'],
    sourcePaths: ['seller.fixturesExcluded', 'residentialOfferTerms.terms.excludedFixtures'],
  }),
  field({
    key: 'mandatory_disclosure_status',
    label: 'Mandatory disclosure status',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['resale_existing_property'],
    clauseFamilies: ['fixtures_defects_disclosure', 'annexures'],
    definitionTerms: ['mandatory_disclosure_form'],
    sourcePaths: ['seller.propertyDisclosure.status'],
  }),
  field({
    key: 'mandatory_disclosure_annexure',
    label: 'Mandatory disclosure annexure',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    variants: ['resale_existing_property'],
    clauseFamilies: ['fixtures_defects_disclosure', 'annexures'],
    definitionTerms: ['mandatory_disclosure_form'],
    sourcePaths: ['seller.propertyDisclosure.annexureTitle'],
  }),
  field({
    key: 'mandatory_disclosure_comments',
    label: 'Mandatory disclosure comments',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['fixtures_defects_disclosure', 'annexures'],
    definitionTerms: ['mandatory_disclosure_form'],
    sourcePaths: ['seller.propertyDisclosure.comments'],
  }),
  field({
    key: 'compliance_certificate_schedule',
    label: 'Compliance certificate schedule',
    owner: 'seller_onboarding',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['resale_existing_property'],
    clauseFamilies: ['compliance_certificates'],
    definitionTerms: ['compliance_certificates'],
    sourcePaths: ['seller.complianceCertificates'],
  }),
  field({
    key: 'development_compliance_certificate_schedule',
    label: 'Development compliance certificate schedule',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['compliance_certificates', 'body_corporate'],
    definitionTerms: ['compliance_certificates', 'development'],
    sourcePaths: ['development.complianceCertificateSchedule', 'development.complianceCertificates'],
  }),
  field({
    key: 'property_nhbrc_certificate_number',
    label: 'NHBRC certificate number',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['compliance_certificates', 'development_unit'],
    definitionTerms: ['nhbrc'],
    sourcePaths: ['development.nhbrcCertificateNumber'],
  }),
  field({
    key: 'development_levy_estimate',
    label: 'Development levy estimate',
    owner: 'development_unit_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['body_corporate', 'costs'],
    definitionTerms: ['body_corporate'],
    sourcePaths: ['unit.levyEstimate'],
  }),
  field({
    key: 'development_rates_estimate',
    label: 'Development rates estimate',
    owner: 'development_unit_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['costs'],
    definitionTerms: ['property'],
    sourcePaths: ['unit.ratesEstimate'],
  }),
  field({
    key: 'utility_connection_charges',
    label: 'Utility connection charges',
    owner: 'development_unit_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['costs', 'development_unit'],
    definitionTerms: ['development'],
    sourcePaths: ['unit.utilityConnectionCharges'],
  }),
  field({
    key: 'snagging_period_days',
    label: 'Snagging period',
    owner: 'development_setup',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    variants: ['new_development'],
    clauseFamilies: ['development_defects'],
    definitionTerms: ['nhbrc', 'contractor'],
    sourcePaths: ['development.snaggingPeriodDays'],
  }),
  field({
    key: 'transfer_attorney_company_name',
    label: 'Transfer attorney firm',
    owner: 'conveyancer_transfer_assignment',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['transfer_conveyancer'],
    definitionTerms: ['conveyancer'],
    sourcePaths: ['transaction.transferAttorneyCompanyName'],
  }),
  field({
    key: 'transfer_attorney_contact_person',
    label: 'Transfer attorney contact',
    owner: 'conveyancer_transfer_assignment',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['transfer_conveyancer'],
    definitionTerms: ['conveyancer'],
    sourcePaths: ['transaction.transferAttorneyContactPerson', 'conveyancer.contactPerson'],
  }),
  field({
    key: 'transfer_attorney_email',
    label: 'Transfer attorney email',
    owner: 'conveyancer_transfer_assignment',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['transfer_conveyancer'],
    definitionTerms: ['conveyancer'],
    sourcePaths: ['transaction.transferAttorneyEmail', 'conveyancer.email'],
  }),
  field({
    key: 'transfer_attorney_phone',
    label: 'Transfer attorney phone',
    owner: 'conveyancer_transfer_assignment',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['transfer_conveyancer'],
    definitionTerms: ['conveyancer'],
    sourcePaths: ['transaction.transferAttorneyPhone', 'conveyancer.phone'],
  }),
  field({
    key: 'trust_account_recipient',
    label: 'Trust account recipient',
    owner: 'conveyancer_transfer_assignment',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['purchase_price', 'transfer_conveyancer'],
    definitionTerms: ['deposit', 'conveyancer'],
    sourcePaths: ['transaction.trustAccountRecipient'],
  }),
  field({
    key: 'organisation_trading_name',
    label: 'Organisation trading name',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['parties', 'agency_commission', 'document_shell'],
    definitionTerms: ['agent'],
    sourcePaths: ['organisation.tradingName', 'organisation.displayName'],
  }),
  field({
    key: 'organisation_legal_name',
    label: 'Organisation legal name',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['parties', 'document_shell'],
    definitionTerms: ['agent'],
    sourcePaths: ['organisation.legalName', 'agency.legalName'],
  }),
  field({
    key: 'organisation_registration_number',
    label: 'Organisation registration number',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['parties', 'document_shell'],
    definitionTerms: ['agent'],
    sourcePaths: ['organisation.registrationNumber', 'agency.registrationNumber'],
  }),
  field({
    key: 'organisation_vat_number',
    label: 'Organisation VAT number',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    clauseFamilies: ['parties', 'document_shell'],
    definitionTerms: ['agent', 'vat'],
    sourcePaths: ['organisation.vatNumber', 'agency.vatNumber'],
  }),
  field({
    key: 'organisation_registered_address',
    label: 'Organisation registered address',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['parties', 'document_shell'],
    definitionTerms: ['agent'],
    sourcePaths: ['organisation.registeredAddress', 'organisation.physicalAddress', 'agency.address'],
  }),
  field({
    key: 'organisation_website',
    label: 'Organisation website',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    clauseFamilies: ['document_shell'],
    definitionTerms: ['agent'],
    sourcePaths: ['organisation.website', 'agency.website'],
  }),
  field({
    key: 'agent_full_name',
    label: 'Agent full name',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['parties', 'agency_commission', 'document_shell'],
    definitionTerms: ['agent'],
    sourcePaths: ['agent.fullName', 'agent.displayName'],
  }),
  field({
    key: 'agent_email',
    label: 'Agent email',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['document_shell'],
    definitionTerms: ['agent'],
    sourcePaths: ['agent.email', 'organisation.agentEmail'],
  }),
  field({
    key: 'agent_phone',
    label: 'Agent phone',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['document_shell'],
    definitionTerms: ['agent'],
    sourcePaths: ['agent.phone', 'organisation.agentPhone'],
  }),
  field({
    key: 'organisation_logo_url',
    label: 'Organisation logo',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    clauseFamilies: ['document_shell'],
    sourcePaths: ['organisation.logoUrl', 'organisation.logoLightUrl'],
  }),
  field({
    key: 'agent_ffc_number',
    label: 'Agent FFC number',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['agency_commission'],
    definitionTerms: ['agent'],
    sourcePaths: ['agent.ffcNumber'],
  }),
  field({
    key: 'gross_commission_amount',
    label: 'Gross commission amount',
    owner: 'organisation_agent_settings',
    policy: OTP_FIELD_POLICIES.conditionalRequired,
    clauseFamilies: ['agency_commission'],
    definitionTerms: ['agent'],
    sourcePaths: ['transaction.grossCommissionAmount'],
  }),
  field({
    key: 'mandate_commission_snapshot',
    label: 'Mandate commission snapshot',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    clauseFamilies: ['agency_commission'],
    definitionTerms: ['agent'],
    sourcePaths: ['commercialTerms.commission.mandateCommissionSnapshot', 'transaction.commission.mandateCommissionSnapshot'],
  }),
  field({
    key: 'otp_commission_proposal',
    label: 'OTP commission proposal',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    clauseFamilies: ['agency_commission'],
    definitionTerms: ['agent'],
    sourcePaths: ['commercialTerms.commission.proposedOtpCommission', 'transaction.commission.proposedOtpCommission'],
  }),
  field({
    key: 'otp_commission_variation_status',
    label: 'OTP commission variation status',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    clauseFamilies: ['agency_commission'],
    definitionTerms: ['agent'],
    sourcePaths: ['commercialTerms.commission.approval.status', 'transaction.commission.variationStatus'],
  }),
  field({
    key: 'otp_commission_approval_reference',
    label: 'OTP commission approval reference',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    clauseFamilies: ['agency_commission'],
    definitionTerms: ['agent'],
    sourcePaths: ['commercialTerms.commission.approval.approvalReference', 'transaction.commission.approvalReference'],
  }),
  field({
    key: 'otp_buyer_cost_obligations',
    label: 'OTP buyer cost obligations',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    clauseFamilies: ['costs'],
    definitionTerms: ['costs'],
    sourcePaths: ['commercialTerms.costObligations.buyerVisibleItems', 'transaction.costObligations'],
  }),
  field({
    key: 'otp_pending_cost_obligations',
    label: 'OTP pending cost obligations',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    clauseFamilies: ['costs'],
    definitionTerms: ['costs'],
    sourcePaths: ['commercialTerms.costObligations.pendingItems', 'transaction.pendingCostObligations'],
  }),
  field({
    key: 'matter_attorney_cost_quote_status',
    label: 'Matter attorney cost quote status',
    owner: 'conveyancer_transfer_assignment',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    clauseFamilies: ['transfer_conveyancer', 'costs'],
    definitionTerms: ['conveyancer', 'costs'],
    sourcePaths: ['commercialTerms.matterAttorneyCostQuote.status', 'transaction.matterAttorneyCostQuote.status'],
  }),
  field({
    key: 'special_conditions',
    label: 'Special conditions',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.reviewRequired,
    clauseFamilies: ['special_conditions'],
    definitionTerms: ['agreement'],
    sourcePaths: ['residentialOfferTerms.terms.specialConditions'],
  }),
  field({
    key: 'annexures_list',
    label: 'Annexures list',
    owner: 'legal_template_registry',
    policy: OTP_FIELD_POLICIES.optionalHideWhenEmpty,
    clauseFamilies: ['annexures'],
    definitionTerms: ['agreement'],
    sourcePaths: ['legalTemplate.annexuresList', 'transaction.annexuresList'],
  }),
  field({
    key: 'document_reference',
    label: 'Document reference',
    owner: 'legal_template_registry',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['document_shell'],
    definitionTerms: ['agreement'],
    sourcePaths: ['legalDocument.reference', 'templateRender.documentReference'],
  }),
  field({
    key: 'template_version',
    label: 'Template version',
    owner: 'legal_template_registry',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['document_shell'],
    definitionTerms: ['agreement'],
    sourcePaths: ['legalTemplate.version', 'templateRender.templateVersion'],
  }),
  field({
    key: 'transaction_reference',
    label: 'Transaction reference',
    owner: 'transaction_offer_terms',
    policy: OTP_FIELD_POLICIES.blockGeneration,
    clauseFamilies: ['document_shell'],
    definitionTerms: ['agreement'],
    sourcePaths: ['transaction.reference', 'transaction.id'],
  }),
  field({
    key: 'buyer_signature',
    label: 'Buyer signature',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.buyer_signature'],
  }),
  field({
    key: 'buyer_initials',
    label: 'Buyer initials',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.buyer_initials'],
  }),
  field({
    key: 'seller_signature',
    label: 'Seller signature',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    variants: ['resale_existing_property'],
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.seller_signature'],
  }),
  field({
    key: 'seller_initials',
    label: 'Seller initials',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    variants: ['resale_existing_property'],
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.seller_initials'],
  }),
  field({
    key: 'developer_signature',
    label: 'Developer signature',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    variants: ['new_development'],
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.developer_signature'],
  }),
  field({
    key: 'developer_initials',
    label: 'Developer initials',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    variants: ['new_development'],
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.developer_initials'],
  }),
  field({
    key: 'contractor_signature',
    label: 'Contractor signature',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    variants: ['new_development'],
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.contractor_signature'],
  }),
  field({
    key: 'contractor_initials',
    label: 'Contractor initials',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    variants: ['new_development'],
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.contractor_initials'],
  }),
  field({
    key: 'agent_signature',
    label: 'Agent signature',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    variants: ['new_development'],
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.agent_signature'],
  }),
  field({
    key: 'agent_initials',
    label: 'Agent initials',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    variants: ['new_development'],
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.agent_initials'],
  }),
  field({
    key: 'signed_date',
    label: 'Signed date',
    owner: 'signing_runtime',
    policy: OTP_FIELD_POLICIES.runtimeGenerated,
    clauseFamilies: ['signatures'],
    sourcePaths: ['document_signing_fields.signed_date'],
  }),
])

export const OTP_DEFINITION_TERMS = Object.freeze([
  Object.freeze({ key: 'agreement', label: 'Agreement', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'agent', label: 'Agent', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'conveyancer', label: 'Conveyancer', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'costs', label: 'Costs', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'deposit', label: 'Deposit', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'guarantees', label: 'Guarantees', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'occupation_date', label: 'Occupation Date', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'purchase_price', label: 'Purchase Price', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'property', label: 'Property', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'purchaser', label: 'Purchaser', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'seller', label: 'Seller', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'suspensive_conditions', label: 'Suspensive Conditions', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'vat', label: 'VAT', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'fixtures', label: 'Fixtures', variants: Object.freeze(['resale_existing_property']) }),
  Object.freeze({ key: 'mandatory_disclosure_form', label: 'Mandatory Disclosure Form', variants: Object.freeze(['resale_existing_property']) }),
  Object.freeze({ key: 'occupational_rental', label: 'Occupational Rental', variants: Object.freeze(['resale_existing_property']) }),
  Object.freeze({ key: 'voetstoots', label: 'Voetstoots', variants: Object.freeze(['resale_existing_property']) }),
  Object.freeze({ key: 'compliance_certificates', label: 'Compliance Certificates', variants: Object.freeze(['resale_existing_property', 'new_development']) }),
  Object.freeze({ key: 'act', label: 'Sectional Titles Act', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'architect', label: 'Architect', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'body_corporate', label: 'Body Corporate', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'common_property', label: 'Common Property', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'contractor', label: 'Contractor', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'development', label: 'Development', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'nhbrc', label: 'NHBRC', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'parking_bay', label: 'Parking Bay', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'participation_quota', label: 'Participation Quota', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'rules', label: 'Rules', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'section_unit', label: 'Section / Unit', variants: Object.freeze(['new_development']) }),
  Object.freeze({ key: 'sectional_plan', label: 'Sectional Plan', variants: Object.freeze(['new_development']) }),
])

export const OTP_CLAUSE_DEFINITION_MAP = Object.freeze([
  Object.freeze({
    clauseFamily: 'offer_acceptance',
    variants: Object.freeze(['resale_existing_property', 'new_development']),
    requiredDefinitionTerms: Object.freeze(['agreement', 'purchaser', 'seller']),
  }),
  Object.freeze({
    clauseFamily: 'parties',
    variants: Object.freeze(['resale_existing_property', 'new_development']),
    requiredDefinitionTerms: Object.freeze(['purchaser', 'seller']),
  }),
  Object.freeze({
    clauseFamily: 'purchase_price',
    variants: Object.freeze(['resale_existing_property', 'new_development']),
    requiredDefinitionTerms: Object.freeze(['purchase_price', 'deposit', 'vat']),
  }),
  Object.freeze({
    clauseFamily: 'finance',
    variants: Object.freeze(['resale_existing_property', 'new_development']),
    requiredDefinitionTerms: Object.freeze(['guarantees', 'suspensive_conditions']),
  }),
  Object.freeze({
    clauseFamily: 'suspensive_conditions',
    variants: Object.freeze(['resale_existing_property', 'new_development']),
    requiredDefinitionTerms: Object.freeze(['suspensive_conditions']),
  }),
  Object.freeze({
    clauseFamily: 'occupation_rent',
    variants: Object.freeze(['resale_existing_property']),
    requiredDefinitionTerms: Object.freeze(['occupation_date', 'occupational_rental']),
  }),
  Object.freeze({
    clauseFamily: 'fixtures_defects_disclosure',
    variants: Object.freeze(['resale_existing_property']),
    requiredDefinitionTerms: Object.freeze(['fixtures', 'mandatory_disclosure_form', 'voetstoots']),
  }),
  Object.freeze({
    clauseFamily: 'compliance_certificates',
    variants: Object.freeze(['resale_existing_property', 'new_development']),
    requiredDefinitionTerms: Object.freeze(['compliance_certificates']),
  }),
  Object.freeze({
    clauseFamily: 'transfer_conveyancer',
    variants: Object.freeze(['resale_existing_property', 'new_development']),
    requiredDefinitionTerms: Object.freeze(['conveyancer', 'guarantees']),
  }),
  Object.freeze({
    clauseFamily: 'agency_commission',
    variants: Object.freeze(['resale_existing_property', 'new_development']),
    requiredDefinitionTerms: Object.freeze(['agent', 'costs']),
  }),
  Object.freeze({
    clauseFamily: 'costs',
    variants: Object.freeze(['resale_existing_property', 'new_development']),
    requiredDefinitionTerms: Object.freeze(['costs', 'conveyancer']),
  }),
  Object.freeze({
    clauseFamily: 'development_unit',
    variants: Object.freeze(['new_development']),
    requiredDefinitionTerms: Object.freeze(['act', 'development', 'section_unit', 'sectional_plan', 'common_property']),
  }),
  Object.freeze({
    clauseFamily: 'body_corporate',
    variants: Object.freeze(['new_development']),
    requiredDefinitionTerms: Object.freeze(['body_corporate', 'rules', 'participation_quota']),
  }),
  Object.freeze({
    clauseFamily: 'development_defects',
    variants: Object.freeze(['new_development']),
    requiredDefinitionTerms: Object.freeze(['contractor', 'nhbrc']),
  }),
])

export function listOtpFieldRegistry({ variant = '', owner = '', clauseFamily = '' } = {}) {
  const normalizedVariant = normalizeKey(variant)
  const normalizedOwner = normalizeKey(owner)
  const normalizedClauseFamily = normalizeKey(clauseFamily)
  return OTP_FIELD_REGISTRY.filter((definition) => {
    if (normalizedVariant && !definition.variants.includes(normalizedVariant)) return false
    if (normalizedOwner && definition.owner !== normalizedOwner) return false
    if (normalizedClauseFamily && !definition.clauseFamilies.includes(normalizedClauseFamily)) return false
    return true
  })
}

export function getOtpFieldDefinition(key = '') {
  const normalized = normalizeKey(key)
  return OTP_FIELD_REGISTRY.find((definition) => definition.key === normalized) || null
}

function cloneReferenceBinding(binding = {}) {
  return {
    ...binding,
    fieldKeys: [...(binding.fieldKeys || [])],
  }
}

export function listOtpPhase3ReferenceFieldFamilyBindings() {
  return OTP_PHASE3_REFERENCE_FIELD_FAMILY_BINDINGS.map(cloneReferenceBinding)
}

export function buildOtpFieldRegistryPhase3Audit({ checkedAt = new Date().toISOString() } = {}) {
  const referenceFamilies = listOtpResaleReferenceFieldFamilies()
  const bindings = listOtpPhase3ReferenceFieldFamilyBindings()
  const bindingByFamily = new Map(bindings.map((binding) => [binding.familyKey, binding]))
  const missingFamilyBindings = referenceFamilies
    .filter((family) => !bindingByFamily.has(family.key))
    .map((family) => family.key)
  const orphanBindings = bindings
    .filter((binding) => !referenceFamilies.some((family) => family.key === binding.familyKey))
    .map((binding) => binding.familyKey)
  const missingRegistryFields = []
  const ownerMismatches = []
  const routeGaps = []
  const sourcePathGaps = []
  const mergeRegistryGaps = []
  const policyGaps = []

  for (const family of referenceFamilies) {
    const binding = bindingByFamily.get(family.key)
    if (!binding) continue
    for (const fieldKey of binding.fieldKeys || []) {
      const definition = getOtpFieldDefinition(fieldKey)
      if (!definition) {
        missingRegistryFields.push({ familyKey: family.key, fieldKey })
        continue
      }
      if (definition.owner !== family.owner) {
        ownerMismatches.push({ familyKey: family.key, fieldKey, expectedOwner: family.owner, actualOwner: definition.owner })
      }
      if (!definition.variants.includes('resale_existing_property')) {
        routeGaps.push({ familyKey: family.key, fieldKey, requiredVariant: 'resale_existing_property', variants: definition.variants })
      }
      if (!definition.sourcePaths?.length) {
        sourcePathGaps.push({ familyKey: family.key, fieldKey })
      }
      if (!Object.values(OTP_FIELD_POLICIES).includes(definition.policy)) {
        policyGaps.push({ familyKey: family.key, fieldKey, policy: definition.policy })
      }
      if (definition.renderable !== false && !getCanonicalMergeFieldDefinition(definition.key, { packetType: 'otp' })) {
        mergeRegistryGaps.push({ familyKey: family.key, fieldKey })
      }
    }
  }

  const buyerOwnedForbiddenKeys = listOtpFieldRegistry({ owner: 'buyer_onboarding' })
    .filter((definition) => (
      /^(seller|developer|transfer_attorney|trust_account|agent|organisation|property_|homeowners_association)/.test(definition.key) ||
      definition.clauseFamilies.includes('agency_commission') ||
      definition.clauseFamilies.includes('transfer_conveyancer')
    ))
    .map((definition) => definition.key)

  const blockerCodes = [
    missingFamilyBindings.length ? 'OTP_PHASE3_REFERENCE_FAMILY_BINDING_GAPS' : '',
    orphanBindings.length ? 'OTP_PHASE3_ORPHAN_REFERENCE_BINDINGS' : '',
    missingRegistryFields.length ? 'OTP_PHASE3_REFERENCE_FIELD_REGISTRY_GAPS' : '',
    ownerMismatches.length ? 'OTP_PHASE3_REFERENCE_OWNER_MISMATCHES' : '',
    routeGaps.length ? 'OTP_PHASE3_REFERENCE_ROUTE_GAPS' : '',
    sourcePathGaps.length ? 'OTP_PHASE3_REFERENCE_SOURCE_PATH_GAPS' : '',
    policyGaps.length ? 'OTP_PHASE3_REFERENCE_POLICY_GAPS' : '',
    mergeRegistryGaps.length ? 'OTP_PHASE3_REFERENCE_MERGE_REGISTRY_GAPS' : '',
    buyerOwnedForbiddenKeys.length ? 'OTP_PHASE3_BUYER_OWNERSHIP_BOUNDARY_VIOLATION' : '',
  ].filter(Boolean)

  return {
    version: OTP_FIELD_REGISTRY_PHASE3_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockerCodes.length ? 'OTP_FIELD_REGISTRY_PHASE3_REMEDIATION_REQUIRED' : 'OTP_FIELD_REGISTRY_PHASE3_READY_FOR_DATA_LOCK',
    blockerCodes,
    summary: {
      referenceFamilyCount: referenceFamilies.length,
      boundFamilyCount: bindings.length,
      boundFieldCount: bindings.reduce((sum, binding) => sum + binding.fieldKeys.length, 0),
      blockerCount: blockerCodes.length,
    },
    referenceFamilies,
    bindings,
    missingFamilyBindings,
    orphanBindings,
    missingRegistryFields,
    ownerMismatches,
    routeGaps,
    sourcePathGaps,
    policyGaps,
    mergeRegistryGaps,
    buyerOwnedForbiddenKeys,
  }
}

export function listOtpDefinitionTerms({ variant = '' } = {}) {
  const normalizedVariant = normalizeKey(variant)
  return OTP_DEFINITION_TERMS.filter((definition) => (
    !normalizedVariant || definition.variants.includes(normalizedVariant)
  ))
}

export function getOtpClauseDefinitionRequirement(clauseFamily = '', variant = '') {
  const normalizedClauseFamily = normalizeKey(clauseFamily)
  const normalizedVariant = normalizeKey(variant)
  return OTP_CLAUSE_DEFINITION_MAP.find((requirement) => (
    requirement.clauseFamily === normalizedClauseFamily &&
    (!normalizedVariant || requirement.variants.includes(normalizedVariant))
  )) || null
}

export function buildOtpFieldRegistryAudit({ checkedAt = new Date().toISOString() } = {}) {
  const ownerKeys = new Set(OTP_DATA_SOURCE_OWNERS.map((owner) => owner.key))
  const fieldKeys = new Set()
  const duplicateFieldKeys = []
  for (const definition of OTP_FIELD_REGISTRY) {
    if (fieldKeys.has(definition.key)) duplicateFieldKeys.push(definition.key)
    fieldKeys.add(definition.key)
  }

  const ownerGaps = OTP_FIELD_REGISTRY
    .filter((definition) => !ownerKeys.has(definition.owner))
    .map((definition) => ({ key: definition.key, owner: definition.owner }))

  const mergeRegistryGaps = OTP_FIELD_REGISTRY
    .filter((definition) => definition.renderable !== false)
    .filter((definition) => !getCanonicalMergeFieldDefinition(definition.key, { packetType: 'otp' }))
    .map((definition) => definition.key)

  const termsByVariant = new Map([
    ['resale_existing_property', new Set(listOtpDefinitionTerms({ variant: 'resale_existing_property' }).map((term) => term.key))],
    ['new_development', new Set(listOtpDefinitionTerms({ variant: 'new_development' }).map((term) => term.key))],
  ])

  const definitionGaps = []
  for (const definition of OTP_FIELD_REGISTRY) {
    for (const variant of definition.variants || []) {
      const allowedTerms = termsByVariant.get(variant) || new Set()
      for (const term of definition.definitionTerms || []) {
        if (!allowedTerms.has(term)) definitionGaps.push({ field: definition.key, variant, term })
      }
    }
  }

  const clauseDefinitionGaps = []
  for (const requirement of OTP_CLAUSE_DEFINITION_MAP) {
    for (const variant of requirement.variants || []) {
      const allowedTerms = termsByVariant.get(variant) || new Set()
      for (const term of requirement.requiredDefinitionTerms || []) {
        if (!allowedTerms.has(term)) clauseDefinitionGaps.push({ clauseFamily: requirement.clauseFamily, variant, term })
      }
    }
  }

  const requiredPhase3Fields = [
    'otp_document_variant',
    'deposit_due_date',
    'bond_approval_deadline',
    'cash_proof_deadline',
    'guarantee_delivery_deadline',
    'irrevocable_offer_expiry',
    'structured_suspensive_conditions',
    'subject_sale_property',
    'subject_sale_minimum_price',
    'subject_sale_fulfilment_date',
    'occupation_date',
    'occupational_rent_amount',
  ]
  const missingPhase3Fields = requiredPhase3Fields.filter((key) => !fieldKeys.has(key))

  const blockerCodes = [
    duplicateFieldKeys.length ? 'OTP_FIELD_REGISTRY_DUPLICATE_KEYS' : '',
    ownerGaps.length ? 'OTP_FIELD_REGISTRY_OWNER_GAPS' : '',
    mergeRegistryGaps.length ? 'OTP_FIELD_REGISTRY_MERGE_FIELD_GAPS' : '',
    definitionGaps.length ? 'OTP_FIELD_REGISTRY_DEFINITION_GAPS' : '',
    clauseDefinitionGaps.length ? 'OTP_CLAUSE_DEFINITION_GAPS' : '',
    missingPhase3Fields.length ? 'OTP_PHASE3_FIELD_GAPS' : '',
  ].filter(Boolean)

  return {
    version: OTP_FIELD_REGISTRY_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockerCodes.length ? 'OTP_FIELD_REGISTRY_REMEDIATION_REQUIRED' : 'OTP_FIELD_REGISTRY_READY_FOR_CONTENT_RULES',
    blockerCodes,
    fieldCount: OTP_FIELD_REGISTRY.length,
    definitionTermCount: OTP_DEFINITION_TERMS.length,
    clauseDefinitionCount: OTP_CLAUSE_DEFINITION_MAP.length,
    ownerGaps,
    duplicateFieldKeys: unique(duplicateFieldKeys),
    mergeRegistryGaps: unique(mergeRegistryGaps),
    definitionGaps,
    clauseDefinitionGaps,
    missingPhase3Fields,
  }
}
