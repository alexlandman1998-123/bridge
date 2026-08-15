export const BOND_APPLICATION_PREFILL_SOURCE_KEYS = Object.freeze({
  savedBondApplication: 'saved_bond_application',
  buyerOnboarding: 'buyer_onboarding_form',
  agentTransactionSetup: 'agent_transaction_setup',
  structuredOtp: 'signed_otp_structured_transaction',
  buyerProfile: 'buyer_profile',
  propertyContext: 'property_context',
})

export const BOND_APPLICATION_PREFILL_SOURCE_PRIORITY = Object.freeze([
  {
    key: BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication,
    label: 'Saved bond application',
    owner: 'Buyer portal',
    description: 'Existing buyer answers stored under onboarding formData.bond_application.',
  },
  {
    key: BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding,
    label: 'Buyer onboarding form',
    owner: 'Buyer',
    description: 'Client portal onboarding or bio onboarding answers already captured from the buyer.',
  },
  {
    key: BOND_APPLICATION_PREFILL_SOURCE_KEYS.agentTransactionSetup,
    label: 'Agent transaction setup',
    owner: 'Agent',
    description: 'Structured finance, purchaser, and property facts captured by the agent when opening the transaction.',
  },
  {
    key: BOND_APPLICATION_PREFILL_SOURCE_KEYS.structuredOtp,
    label: 'Signed OTP structured transaction data',
    owner: 'OTP workflow',
    description: 'OTP facts after the signed OTP flow has hydrated the transaction or onboarding form data.',
  },
  {
    key: BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerProfile,
    label: 'Buyer profile',
    owner: 'CRM',
    description: 'Buyer contact record attached to the transaction.',
  },
  {
    key: BOND_APPLICATION_PREFILL_SOURCE_KEYS.propertyContext,
    label: 'Property context',
    owner: 'Transaction',
    description: 'Unit, development, and property address context already attached to the portal payload.',
  },
])

function source(key, paths, note = '') {
  return {
    sourceKey: key,
    paths: Array.isArray(paths) ? paths : [paths],
    note,
  }
}

function field({
  path,
  legacyPath = path,
  label,
  section,
  originatorField = '',
  required = false,
  sources = [],
  gap = '',
}) {
  return {
    path,
    legacyPath,
    label,
    section,
    originatorField,
    required,
    sources,
    gap,
  }
}

const {
  savedBondApplication,
  buyerOnboarding,
  agentTransactionSetup,
  structuredOtp,
  buyerProfile,
  propertyContext,
} = BOND_APPLICATION_PREFILL_SOURCE_KEYS

export const BOND_APPLICATION_PREFILL_SOURCE_MATRIX = Object.freeze([
  field({
    path: 'summary.applicant_name',
    label: 'Applicant name',
    section: 'application_summary',
    originatorField: 'Applicant / purchaser name',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.applicant_name'),
      source(buyerOnboarding, ['formData.first_name', 'formData.last_name']),
      source(buyerProfile, 'portal.buyer.name'),
    ],
  }),
  field({
    path: 'summary.has_co_applicant',
    label: 'Co-applicant present',
    section: 'application_summary',
    originatorField: 'Co-applicant indicator',
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.has_co_applicant'),
      source(buyerOnboarding, ['formData.spouse_full_name', 'formData.spouse_email', 'formData.spouse_identity_number']),
    ],
  }),
  field({
    path: 'summary.property_reference',
    label: 'Property reference',
    section: 'application_summary',
    originatorField: 'Property reference',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.property_reference'),
      source(propertyContext, ['portal.unit.development.name', 'portal.unit.unit_number']),
    ],
  }),
  field({
    path: 'summary.development_name',
    label: 'Development',
    section: 'application_summary',
    originatorField: 'Development',
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.development_name'),
      source(propertyContext, 'portal.unit.development.name'),
    ],
  }),
  field({
    path: 'summary.unit_reference',
    label: 'Unit reference',
    section: 'application_summary',
    originatorField: 'Unit reference',
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.unit_reference'),
      source(propertyContext, 'portal.unit.unit_number'),
    ],
  }),
  field({
    path: 'summary.purchase_price',
    label: 'Purchase price',
    section: 'application_summary',
    originatorField: 'Purchase price',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.purchase_price'),
      source(buyerOnboarding, 'formData.purchase_price'),
      source(agentTransactionSetup, ['portal.transaction.purchase_price', 'portal.transaction.sales_price']),
      source(structuredOtp, ['portal.transaction.purchase_price', 'portal.transaction.sales_price'], 'Available when signed OTP terms hydrate the transaction.'),
      source(propertyContext, 'portal.unit.price'),
    ],
  }),
  field({
    path: 'summary.deposit_contribution',
    label: 'Deposit or contribution',
    section: 'application_summary',
    originatorField: 'Deposit contribution',
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.deposit_contribution'),
      source(buyerOnboarding, ['formData.deposit_amount', 'formData.cash_amount']),
      source(agentTransactionSetup, 'portal.transaction.deposit_amount'),
      source(structuredOtp, 'portal.transaction.deposit_amount', 'Available when signed OTP terms hydrate the transaction.'),
    ],
  }),
  field({
    path: 'summary.finance_type',
    label: 'Finance type',
    section: 'application_summary',
    originatorField: 'Finance type',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.finance_type'),
      source(buyerOnboarding, 'formData.purchase_finance_type'),
      source(agentTransactionSetup, 'portal.transaction.finance_type'),
      source(structuredOtp, 'portal.transaction.finance_type', 'Available when signed OTP terms hydrate the transaction.'),
    ],
  }),
  field({
    path: 'summary.buyer_entity_type',
    label: 'Purchaser type',
    section: 'application_summary',
    originatorField: 'Purchaser entity type',
    required: true,
    sources: [
      source(savedBondApplication, ['formData.bond_application.summary.buyer_entity_type', 'formData.bond_application.summary.purchaser_type']),
      source(buyerOnboarding, ['formData.buyer_entity_type', 'formData.purchaser_entity_type', 'formData.purchaser_type']),
      source(agentTransactionSetup, ['portal.transaction.buyer_entity_type', 'portal.transaction.purchaser_type']),
      source(structuredOtp, ['portal.transaction.buyer_entity_type', 'portal.transaction.purchaser_type']),
    ],
  }),
  field({
    path: 'summary.buyer_entity_name',
    label: 'Company or trust name',
    section: 'application_summary',
    originatorField: 'Purchaser entity name',
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.buyer_entity_name'),
      source(buyerOnboarding, ['formData.buyer_entity_name', 'formData.purchaser_entity_name', 'formData.company_name', 'formData.trust_name']),
      source(agentTransactionSetup, ['portal.transaction.buyer_entity_name', 'portal.transaction.purchaser_entity_name', 'portal.transaction.company_name', 'portal.transaction.trust_name']),
      source(structuredOtp, ['portal.transaction.buyer_entity_name', 'portal.transaction.purchaser_entity_name', 'portal.transaction.company_name', 'portal.transaction.trust_name']),
    ],
  }),
  field({
    path: 'summary.buyer_entity_registration_number',
    label: 'Company or trust registration number',
    section: 'application_summary',
    originatorField: 'Purchaser entity registration number',
    sources: [
      source(savedBondApplication, 'formData.bond_application.summary.buyer_entity_registration_number'),
      source(buyerOnboarding, ['formData.buyer_entity_registration_number', 'formData.purchaser_entity_registration_number', 'formData.company_registration_number', 'formData.trust_registration_number', 'formData.registration_number']),
      source(agentTransactionSetup, ['portal.transaction.buyer_entity_registration_number', 'portal.transaction.purchaser_entity_registration_number', 'portal.transaction.company_registration_number', 'portal.transaction.trust_registration_number', 'portal.transaction.registration_number']),
      source(structuredOtp, ['portal.transaction.buyer_entity_registration_number', 'portal.transaction.purchaser_entity_registration_number', 'portal.transaction.company_registration_number', 'portal.transaction.trust_registration_number', 'portal.transaction.registration_number']),
    ],
  }),
  field({
    path: 'applicants.primary.first_name',
    legacyPath: 'applicants[primary].first_name',
    label: 'Primary applicant first name',
    section: 'personal_details',
    originatorField: 'Primary first name',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[primary].first_name'),
      source(buyerOnboarding, 'formData.first_name'),
      source(buyerProfile, 'portal.buyer.name'),
    ],
  }),
  field({
    path: 'applicants.primary.last_name',
    legacyPath: 'applicants[primary].last_name',
    label: 'Primary applicant surname',
    section: 'personal_details',
    originatorField: 'Primary surname',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[primary].last_name'),
      source(buyerOnboarding, 'formData.last_name'),
      source(buyerProfile, 'portal.buyer.name'),
    ],
  }),
  field({
    path: 'applicants.primary.id_number',
    legacyPath: 'applicants[primary].id_number',
    label: 'Primary applicant ID number',
    section: 'personal_details',
    originatorField: 'Primary ID number',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[primary].id_number'),
      source(buyerOnboarding, 'formData.identity_number'),
    ],
  }),
  field({
    path: 'applicants.primary.passport_number',
    legacyPath: 'applicants[primary].passport_number',
    label: 'Primary applicant passport number',
    section: 'personal_details',
    originatorField: 'Primary passport number',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[primary].passport_number'),
      source(buyerOnboarding, 'formData.passport_number'),
    ],
  }),
  field({
    path: 'applicants.primary.date_of_birth',
    legacyPath: 'applicants[primary].date_of_birth',
    label: 'Primary applicant date of birth',
    section: 'personal_details',
    originatorField: 'Primary date of birth',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[primary].date_of_birth'),
      source(buyerOnboarding, 'formData.date_of_birth'),
    ],
  }),
  field({
    path: 'applicants.primary.nationality',
    legacyPath: 'applicants[primary].nationality',
    label: 'Primary applicant nationality',
    section: 'personal_details',
    originatorField: 'Nationality',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[primary].nationality'),
      source(buyerOnboarding, 'formData.nationality'),
    ],
  }),
  field({
    path: 'applicants.primary.marital_status',
    legacyPath: 'applicants[primary].marital_status',
    label: 'Marital status',
    section: 'personal_details',
    originatorField: 'Marital status',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[primary].marital_status'),
      source(buyerOnboarding, 'formData.marital_status'),
    ],
  }),
  field({
    path: 'applicants.primary.number_of_dependants',
    legacyPath: 'applicants[primary].number_of_dependants',
    label: 'Number of dependants',
    section: 'personal_details',
    originatorField: 'Dependants',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[primary].number_of_dependants'),
      source(buyerOnboarding, 'formData.number_of_dependants'),
    ],
  }),
  field({
    path: 'applicants.primary.sa_tax_number',
    legacyPath: 'applicants[primary].sa_tax_number',
    label: 'SA tax number',
    section: 'personal_details',
    originatorField: 'SA tax number',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[primary].sa_tax_number'),
      source(buyerOnboarding, 'formData.tax_number'),
    ],
  }),
  field({
    path: 'applicants.co_applicant.first_name',
    legacyPath: 'applicants[co_applicant].first_name',
    label: 'Co-applicant first name',
    section: 'personal_details',
    originatorField: 'Co-applicant first name',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[co_applicant].first_name'),
      source(buyerOnboarding, ['formData.spouse_first_name', 'formData.spouse_full_name.first', 'formData.spouse_full_name']),
    ],
  }),
  field({
    path: 'applicants.co_applicant.last_name',
    legacyPath: 'applicants[co_applicant].last_name',
    label: 'Co-applicant surname',
    section: 'personal_details',
    originatorField: 'Co-applicant surname',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[co_applicant].last_name'),
      source(buyerOnboarding, ['formData.spouse_last_name', 'formData.spouse_surname', 'formData.spouse_full_name.last']),
    ],
  }),
  field({
    path: 'applicants.co_applicant.id_number',
    legacyPath: 'applicants[co_applicant].id_number',
    label: 'Co-applicant ID number',
    section: 'personal_details',
    originatorField: 'Co-applicant ID number',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[co_applicant].id_number'),
      source(buyerOnboarding, 'formData.spouse_identity_number'),
    ],
  }),
  field({
    path: 'applicants.co_applicant.email',
    legacyPath: 'applicants[co_applicant].email',
    label: 'Co-applicant email',
    section: 'personal_details',
    originatorField: 'Co-applicant email',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[co_applicant].email'),
      source(buyerOnboarding, 'formData.spouse_email'),
    ],
  }),
  field({
    path: 'applicants.co_applicant.phone',
    legacyPath: 'applicants[co_applicant].phone',
    label: 'Co-applicant phone',
    section: 'personal_details',
    originatorField: 'Co-applicant phone',
    sources: [
      source(savedBondApplication, 'formData.bond_application.applicants[co_applicant].phone'),
      source(buyerOnboarding, 'formData.spouse_phone'),
    ],
  }),
  field({
    path: 'contact_address.cellphone_number',
    label: 'Cellphone number',
    section: 'contact_address',
    originatorField: 'Mobile number',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.contact_address.cellphone_number'),
      source(buyerOnboarding, 'formData.phone'),
      source(buyerProfile, 'portal.buyer.phone'),
    ],
  }),
  field({
    path: 'contact_address.email_address',
    label: 'Email address',
    section: 'contact_address',
    originatorField: 'Email address',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.contact_address.email_address'),
      source(buyerOnboarding, 'formData.email'),
      source(buyerProfile, 'portal.buyer.email'),
    ],
  }),
  field({
    path: 'contact_address.residential_address_street',
    label: 'Residential street',
    section: 'contact_address',
    originatorField: 'Residential street',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.contact_address.residential_address_street'),
      source(buyerOnboarding, 'formData.street_address'),
    ],
  }),
  field({
    path: 'contact_address.residential_address_suburb',
    label: 'Residential suburb',
    section: 'contact_address',
    originatorField: 'Residential suburb',
    sources: [
      source(savedBondApplication, 'formData.bond_application.contact_address.residential_address_suburb'),
      source(buyerOnboarding, 'formData.suburb'),
    ],
  }),
  field({
    path: 'contact_address.residential_address_city',
    label: 'Residential city',
    section: 'contact_address',
    originatorField: 'Residential city',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.contact_address.residential_address_city'),
      source(buyerOnboarding, 'formData.city'),
    ],
  }),
  field({
    path: 'contact_address.residential_address_postal_code',
    label: 'Residential postal code',
    section: 'contact_address',
    originatorField: 'Residential postal code',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.contact_address.residential_address_postal_code'),
      source(buyerOnboarding, 'formData.postal_code'),
    ],
  }),
  field({
    path: 'employment.primary.employer_name',
    label: 'Employer name',
    section: 'employment',
    originatorField: 'Employer name',
    sources: [
      source(savedBondApplication, 'formData.bond_application.employment.primary.employer_name'),
      source(buyerOnboarding, 'formData.employer_name'),
    ],
  }),
  field({
    path: 'employment.primary.occupation_status',
    label: 'Occupation status',
    section: 'employment',
    originatorField: 'Occupation status',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.employment.primary.occupation_status'),
      source(buyerOnboarding, ['formData.occupation_status', 'formData.employment_status']),
    ],
  }),
  field({
    path: 'employment.primary.nature_of_occupation',
    label: 'Nature of occupation',
    section: 'employment',
    originatorField: 'Nature of occupation',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.employment.primary.nature_of_occupation'),
      source(buyerOnboarding, ['formData.nature_of_occupation', 'formData.occupation', 'formData.job_title']),
    ],
  }),
  field({
    path: 'employment.primary.employment_years',
    label: 'Employment years',
    section: 'employment',
    originatorField: 'Employment years',
    sources: [
      source(savedBondApplication, 'formData.bond_application.employment.primary.employment_years'),
      source(buyerOnboarding, ['formData.employment_years', 'formData.years_employed']),
    ],
  }),
  field({
    path: 'employment.primary.employment_months',
    label: 'Employment months',
    section: 'employment',
    originatorField: 'Employment months',
    sources: [
      source(savedBondApplication, 'formData.bond_application.employment.primary.employment_months'),
      source(buyerOnboarding, ['formData.employment_months', 'formData.months_employed']),
    ],
  }),
  field({
    path: 'income_deductions_expenses.primary.gross_salary',
    label: 'Gross monthly income',
    section: 'income_deductions_expenses',
    originatorField: 'Gross monthly income',
    sources: [
      source(savedBondApplication, 'formData.bond_application.income_deductions_expenses.primary.gross_salary'),
      source(buyerOnboarding, 'formData.gross_monthly_income'),
    ],
  }),
  field({
    path: 'income_deductions_expenses.primary.rental_income',
    label: 'Rental income',
    section: 'income_deductions_expenses',
    originatorField: 'Rental income',
    sources: [
      source(savedBondApplication, 'formData.bond_application.income_deductions_expenses.primary.rental_income'),
      source(savedBondApplication, 'formData.bond_application.income.rental_income'),
      source(buyerOnboarding, ['formData.rental_income', 'formData.monthly_rental_income']),
    ],
  }),
  field({
    path: 'income_deductions_expenses.primary.other_income_value',
    label: 'Other monthly income',
    section: 'income_deductions_expenses',
    originatorField: 'Other income',
    sources: [
      source(savedBondApplication, 'formData.bond_application.income_deductions_expenses.primary.other_income_value'),
      source(savedBondApplication, 'formData.bond_application.income.other_income'),
      source(buyerOnboarding, ['formData.other_income', 'formData.other_monthly_income']),
    ],
  }),
  field({
    path: 'income_deductions_expenses.primary.rental_expense',
    label: 'Rental or housing expense',
    section: 'income_deductions_expenses',
    originatorField: 'Housing expense',
    sources: [
      source(savedBondApplication, 'formData.bond_application.income_deductions_expenses.primary.rental_expense'),
      source(savedBondApplication, 'formData.bond_application.expenses.housing'),
      source(buyerOnboarding, ['formData.rental_expense', 'formData.monthly_rent', 'formData.housing_expense']),
    ],
  }),
  field({
    path: 'income_deductions_expenses.primary.water_electricity',
    label: 'Water and electricity',
    section: 'income_deductions_expenses',
    originatorField: 'Utilities expense',
    sources: [
      source(savedBondApplication, 'formData.bond_application.income_deductions_expenses.primary.water_electricity'),
      source(savedBondApplication, 'formData.bond_application.expenses.utilities'),
      source(buyerOnboarding, ['formData.water_electricity', 'formData.utilities', 'formData.monthly_utilities']),
    ],
  }),
  field({
    path: 'income_deductions_expenses.primary.groceries',
    label: 'Groceries',
    section: 'income_deductions_expenses',
    originatorField: 'Groceries expense',
    sources: [
      source(savedBondApplication, 'formData.bond_application.income_deductions_expenses.primary.groceries'),
      source(savedBondApplication, 'formData.bond_application.expenses.groceries'),
      source(buyerOnboarding, ['formData.groceries', 'formData.monthly_groceries']),
    ],
  }),
  field({
    path: 'income_deductions_expenses.primary.transport',
    label: 'Transport',
    section: 'income_deductions_expenses',
    originatorField: 'Transport expense',
    sources: [
      source(savedBondApplication, 'formData.bond_application.income_deductions_expenses.primary.transport'),
      source(savedBondApplication, 'formData.bond_application.expenses.transport'),
      source(buyerOnboarding, ['formData.transport', 'formData.monthly_transport']),
    ],
  }),
  field({
    path: 'income_deductions_expenses.primary.other_expenses_value',
    label: 'Other monthly expenses',
    section: 'income_deductions_expenses',
    originatorField: 'Other expenses',
    sources: [
      source(savedBondApplication, 'formData.bond_application.income_deductions_expenses.primary.other_expenses_value'),
      source(savedBondApplication, 'formData.bond_application.expenses.other_expenses'),
      source(buyerOnboarding, ['formData.other_expenses', 'formData.other_monthly_expenses']),
    ],
  }),
  field({
    path: 'loan_details.erf_or_section_number',
    label: 'Erf or section number',
    section: 'loan_details',
    originatorField: 'Erf or section number',
    sources: [
      source(savedBondApplication, 'formData.bond_application.loan_details.erf_or_section_number'),
      source(propertyContext, 'portal.unit.unit_number'),
    ],
  }),
  field({
    path: 'loan_details.street_or_complex',
    label: 'Street or complex',
    section: 'loan_details',
    originatorField: 'Property street or complex',
    sources: [
      source(savedBondApplication, 'formData.bond_application.loan_details.street_or_complex'),
      source(agentTransactionSetup, 'portal.transaction.property_address_line_1'),
      source(buyerOnboarding, 'formData.street_address'),
      source(structuredOtp, 'portal.transaction.property_address_line_1'),
    ],
  }),
  field({
    path: 'loan_details.suburb',
    label: 'Property suburb',
    section: 'loan_details',
    originatorField: 'Property suburb',
    sources: [
      source(savedBondApplication, 'formData.bond_application.loan_details.suburb'),
      source(agentTransactionSetup, 'portal.transaction.suburb'),
      source(buyerOnboarding, 'formData.suburb'),
      source(structuredOtp, 'portal.transaction.suburb'),
    ],
  }),
  field({
    path: 'loan_details.amount_to_be_registered',
    label: 'Amount to be registered',
    section: 'loan_details',
    originatorField: 'Requested bond amount',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.loan_details.amount_to_be_registered'),
      source(buyerOnboarding, 'formData.bond_amount'),
      source(agentTransactionSetup, 'portal.transaction.bond_amount'),
      source(structuredOtp, 'portal.transaction.bond_amount', 'Available when signed OTP terms hydrate the transaction.'),
    ],
  }),
  field({
    path: 'loan_details.debit_order_bank_name',
    label: 'Debit order bank name',
    section: 'loan_details',
    originatorField: 'Debit order bank',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.loan_details.debit_order_bank_name'),
      source(buyerOnboarding, ['formData.debit_order_bank_name', 'formData.bank_name', 'formData.primary_bank_name']),
    ],
  }),
  field({
    path: 'loan_details.debit_order_account_number',
    label: 'Debit order account number',
    section: 'loan_details',
    originatorField: 'Debit order account number',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.loan_details.debit_order_account_number'),
      source(buyerOnboarding, ['formData.debit_order_account_number', 'formData.bank_account_number', 'formData.primary_account_number']),
    ],
  }),
  field({
    path: 'loan_details.preferred_debit_order_date',
    label: 'Preferred debit order date',
    section: 'loan_details',
    originatorField: 'Preferred debit order date',
    sources: [
      source(savedBondApplication, 'formData.bond_application.loan_details.preferred_debit_order_date'),
      source(buyerOnboarding, ['formData.preferred_debit_order_date', 'formData.debit_order_date']),
    ],
  }),
  field({
    path: 'banking_liabilities.primary_bank_name',
    label: 'Primary bank name',
    section: 'banking_liabilities',
    originatorField: 'Primary bank',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.banking_liabilities.primary_bank_name'),
      source(buyerOnboarding, ['formData.primary_bank_name', 'formData.bank_name']),
    ],
  }),
  field({
    path: 'banking_liabilities.primary_account_type',
    label: 'Primary account type',
    section: 'banking_liabilities',
    originatorField: 'Primary account type',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.banking_liabilities.primary_account_type'),
      source(buyerOnboarding, ['formData.primary_account_type', 'formData.bank_account_type']),
    ],
  }),
  field({
    path: 'banking_liabilities.primary_account_number',
    label: 'Primary account number',
    section: 'banking_liabilities',
    originatorField: 'Primary account number',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.banking_liabilities.primary_account_number'),
      source(buyerOnboarding, ['formData.primary_account_number', 'formData.bank_account_number']),
    ],
  }),
  field({
    path: 'credit_history.currently_under_administration',
    label: 'Currently under administration',
    section: 'credit_history',
    originatorField: 'Currently under administration',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.credit_history.currently_under_administration'),
      source(buyerOnboarding, 'formData.currently_under_administration'),
    ],
  }),
  field({
    path: 'credit_history.judgments_taken',
    label: 'Judgments taken',
    section: 'credit_history',
    originatorField: 'Judgments taken',
    sources: [
      source(savedBondApplication, 'formData.bond_application.credit_history.judgments_taken'),
      source(savedBondApplication, 'formData.bond_application.credit_history.judgments'),
      source(buyerOnboarding, ['formData.judgments_taken', 'formData.judgments']),
    ],
  }),
  field({
    path: 'credit_history.currently_under_debt_review',
    label: 'Currently under debt review',
    section: 'credit_history',
    originatorField: 'Debt review status',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.credit_history.currently_under_debt_review'),
      source(savedBondApplication, 'formData.bond_application.credit_history.under_debt_review'),
      source(buyerOnboarding, ['formData.currently_under_debt_review', 'formData.under_debt_review']),
    ],
  }),
  field({
    path: 'credit_history.ever_declared_insolvent',
    label: 'Ever declared insolvent',
    section: 'credit_history',
    originatorField: 'Insolvency status',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.credit_history.ever_declared_insolvent'),
      source(savedBondApplication, 'formData.bond_application.credit_history.insolvent'),
      source(buyerOnboarding, ['formData.ever_declared_insolvent', 'formData.insolvent']),
    ],
  }),
  field({
    path: 'credit_history.bound_by_surety_agreements',
    label: 'Bound by surety agreements',
    section: 'credit_history',
    originatorField: 'Surety agreement status',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.credit_history.bound_by_surety_agreements'),
      source(buyerOnboarding, 'formData.bound_by_surety_agreements'),
    ],
  }),
  field({
    path: 'assets_liabilities.fixed_property',
    label: 'Fixed property owned',
    section: 'assets_liabilities',
    originatorField: 'Fixed property assets',
    sources: [
      source(savedBondApplication, 'formData.bond_application.assets_liabilities.fixed_property'),
      source(savedBondApplication, 'formData.bond_application.assets.property_owned'),
      source(buyerOnboarding, ['formData.fixed_property', 'formData.property_owned']),
    ],
  }),
  field({
    path: 'assets_liabilities.vehicles',
    label: 'Vehicles',
    section: 'assets_liabilities',
    originatorField: 'Vehicle assets',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.assets_liabilities.vehicles'),
      source(buyerOnboarding, ['formData.vehicles', 'formData.vehicle_value']),
    ],
  }),
  field({
    path: 'assets_liabilities.investments',
    label: 'Investments',
    section: 'assets_liabilities',
    originatorField: 'Investments',
    sources: [
      source(savedBondApplication, 'formData.bond_application.assets_liabilities.investments'),
      source(savedBondApplication, 'formData.bond_application.assets.investments'),
      source(buyerOnboarding, 'formData.investments'),
    ],
  }),
  field({
    path: 'assets_liabilities.total_assets',
    label: 'Total assets',
    section: 'assets_liabilities',
    originatorField: 'Total assets',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.assets_liabilities.total_assets'),
      source(buyerOnboarding, 'formData.total_assets'),
    ],
  }),
  field({
    path: 'assets_liabilities.total_liabilities',
    label: 'Total liabilities',
    section: 'assets_liabilities',
    originatorField: 'Total liabilities',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.assets_liabilities.total_liabilities'),
      source(savedBondApplication, 'formData.bond_application.assets_liabilities.liabilities_total'),
      source(buyerOnboarding, ['formData.total_liabilities', 'formData.liabilities_total']),
    ],
  }),
  field({
    path: 'assets_liabilities.net_asset_value',
    label: 'Net asset value',
    section: 'assets_liabilities',
    originatorField: 'Net asset value',
    sources: [
      source(savedBondApplication, 'formData.bond_application.assets_liabilities.net_asset_value'),
      source(savedBondApplication, 'formData.bond_application.assets.net_worth'),
      source(buyerOnboarding, ['formData.net_asset_value', 'formData.net_worth']),
    ],
  }),
  field({
    path: 'declarations_consents.loan_processing_consent',
    label: 'Loan processing consent',
    section: 'declarations_consents',
    originatorField: 'Loan processing consent',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.declarations_consents.loan_processing_consent'),
      source(savedBondApplication, 'formData.bond_application.consent.credit_check_consent'),
    ],
  }),
  field({
    path: 'declarations_consents.credit_bureau_fraud_bank_data_consent',
    label: 'Credit bureau and bank data consent',
    section: 'declarations_consents',
    originatorField: 'Credit bureau consent',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.declarations_consents.credit_bureau_fraud_bank_data_consent'),
      source(savedBondApplication, 'formData.bond_application.consent.credit_check_consent'),
    ],
  }),
  field({
    path: 'declarations_consents.declaration_accepted',
    label: 'Declaration accepted',
    section: 'declarations_consents',
    originatorField: 'Declaration accepted',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.declarations_consents.declaration_accepted'),
      source(savedBondApplication, 'formData.bond_application.consent.declaration_accepted'),
    ],
  }),
  field({
    path: 'declarations_consents.digital_signature_name',
    label: 'Digital signature name',
    section: 'declarations_consents',
    originatorField: 'Typed signature name',
    required: true,
    sources: [
      source(savedBondApplication, 'formData.bond_application.declarations_consents.digital_signature_name'),
      source(buyerOnboarding, ['formData.first_name', 'formData.last_name']),
    ],
  }),
])

export function getBondApplicationPrefillSource(sourceKey) {
  return BOND_APPLICATION_PREFILL_SOURCE_PRIORITY.find((item) => item.key === sourceKey) || null
}

export function getBondApplicationPrefillField(path) {
  return BOND_APPLICATION_PREFILL_SOURCE_MATRIX.find((item) => item.path === path || item.legacyPath === path) || null
}

export function getBondApplicationPrefillCoverageSummary(matrix = BOND_APPLICATION_PREFILL_SOURCE_MATRIX) {
  const sourceCounts = Object.fromEntries(BOND_APPLICATION_PREFILL_SOURCE_PRIORITY.map((item) => [item.key, 0]))
  const sections = new Set()
  let requiredFields = 0
  let fieldsWithGaps = 0

  for (const item of matrix) {
    sections.add(item.section)
    if (item.required) requiredFields += 1
    if (item.gap) fieldsWithGaps += 1
    for (const fieldSource of item.sources) {
      sourceCounts[fieldSource.sourceKey] = (sourceCounts[fieldSource.sourceKey] || 0) + 1
    }
  }

  return {
    totalFields: matrix.length,
    requiredFields,
    fieldsWithGaps,
    sections: Array.from(sections).sort(),
    sourceCounts,
  }
}
