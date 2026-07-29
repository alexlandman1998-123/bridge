export const GUIDED_BOND_APPLICATION_PHASE3_FLOW_VERSION = 'phase-3-v1'
export const GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_REASON = 'phase_3_documents'
export const GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_SECTION = 'documents'
export const GUIDED_BOND_APPLICATION_PHASE4_FLOW_VERSION = 'phase-4-v1'
export const GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_REASON = 'phase_4_review_sign'
export const GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_SECTION = 'declarations_consents'
export const GUIDED_BOND_APPLICATION_PHASE5_FLOW_VERSION = 'phase-5-v1'
export const GUIDED_BOND_APPLICATION_PHASE6_FLOW_VERSION = 'phase-6-v1'

export const BOND_APPLICATION_FLOW_STEPS = [
  { key: 'your_application', label: 'Your application', order: 1 },
  { key: 'applicants', label: 'Applicants', order: 2 },
  { key: 'about_you', label: 'About you', order: 3 },
  { key: 'employment_income', label: 'Employment and income', order: 4 },
  { key: 'monthly_commitments', label: 'Monthly commitments', order: 5 },
  { key: 'accounts_assets', label: 'Accounts and assets', order: 6 },
  { key: 'documents', label: 'Documents', order: 7 },
  { key: 'review_sign', label: 'Review and sign', order: 8 },
]

export const EMPLOYMENT_TYPE_VALUES = {
  permanent: ['permanent_employee', 'full_time_employed', 'permanent', 'employed_permanent'],
  contract: ['contract_employee', 'temporary_employed', 'contract', 'fixed_term_contract'],
  selfEmployed: ['self_employed', 'self-employed', 'own_business'],
  commission: ['commission_based', 'commission', 'commission_earner'],
  retired: ['retired', 'pensioner'],
  other: ['other', 'other_income'],
}

const mainIncomeOptions = [
  { value: 'permanent_employee', label: 'Permanent employee' },
  { value: 'contract_employee', label: 'Contract employee' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'commission_based', label: 'Commission-based' },
  { value: 'retired', label: 'Retired' },
  { value: 'other', label: 'Other' },
]

const yesNoOptions = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

function isEmploymentType(group) {
  return { field: 'participants.primaryApplicant.employment.occupation_status', in: EMPLOYMENT_TYPE_VALUES[group] || [] }
}

function q({
  key,
  path,
  label,
  type = 'text',
  requiredWhen = true,
  visibleWhen = true,
  options = null,
  inputMode = null,
  validation = {},
  helperText = '',
  groupKey = null,
}) {
  return { key, path, label, type, requiredWhen, visibleWhen, options, inputMode, validation, helperText, groupKey }
}

export const BOND_APPLICATION_REPEATABLE_GROUPS = {
  income_sources: {
    key: 'income_sources',
    path: 'participants.primaryApplicant.incomeSources',
    label: 'Additional income sources',
    addLabel: 'Add income source',
    summaryLabelPath: 'sourceName',
    itemFields: [
      q({ key: 'income_source_type', path: 'type', label: 'Income type', type: 'select', requiredWhen: true, options: [
        { value: 'rental_income', label: 'Rental income' },
        { value: 'investment_income', label: 'Investment income' },
        { value: 'maintenance_received', label: 'Maintenance received' },
        { value: 'part_time_income', label: 'Part-time income' },
        { value: 'pension', label: 'Pension' },
        { value: 'other', label: 'Other recurring income' },
      ] }),
      q({ key: 'income_source_name', path: 'sourceName', label: 'Source name', requiredWhen: true }),
      q({ key: 'income_source_amount', path: 'monthlyAmount', label: 'Monthly amount', type: 'currency', requiredWhen: true }),
      q({ key: 'income_source_frequency', path: 'frequency', label: 'How often is it received?', requiredWhen: false }),
    ],
  },
  monthly_commitments: {
    key: 'monthly_commitments',
    path: 'participants.primaryApplicant.monthlyCommitments',
    label: 'Other recurring commitments',
    addLabel: 'Add commitment',
    summaryLabelPath: 'description',
    itemFields: [
      q({ key: 'commitment_description', path: 'description', label: 'Commitment', requiredWhen: true }),
      q({ key: 'commitment_amount', path: 'monthlyAmount', label: 'Monthly amount', type: 'currency', requiredWhen: true }),
    ],
  },
  bank_accounts: {
    key: 'bank_accounts',
    path: 'participants.primaryApplicant.bankAccounts',
    label: 'Bank accounts',
    addLabel: 'Add bank account',
    summaryLabelPath: 'bankName',
    itemFields: [
      q({ key: 'bank_account_bank', path: 'bankName', label: 'Bank', requiredWhen: true }),
      q({ key: 'bank_account_type', path: 'accountType', label: 'Account type', requiredWhen: true }),
      q({ key: 'bank_account_holder', path: 'accountHolderName', label: 'Account holder name', requiredWhen: false }),
      q({ key: 'bank_account_number', path: 'accountNumber', label: 'Account number', requiredWhen: false }),
      q({ key: 'bank_account_balance', path: 'currentBalance', label: 'Current balance', type: 'currency', requiredWhen: false }),
    ],
  },
  debts: {
    key: 'debts',
    path: 'participants.primaryApplicant.debts',
    label: 'Existing debts',
    addLabel: 'Add debt',
    summaryLabelPath: 'bank',
    itemFields: [
      q({ key: 'debt_type', path: 'type', label: 'Debt type', type: 'select', requiredWhen: true, options: [
        { value: 'home_loan', label: 'Home loan' },
        { value: 'vehicle_finance', label: 'Vehicle finance' },
        { value: 'personal_loan', label: 'Personal loan' },
        { value: 'credit_card', label: 'Credit card' },
        { value: 'store_account', label: 'Store account' },
        { value: 'overdraft', label: 'Overdraft' },
        { value: 'other', label: 'Other credit agreement' },
      ] }),
      q({ key: 'debt_institution', path: 'bank', label: 'Financial institution', requiredWhen: true }),
      q({ key: 'debt_balance', path: 'outstandingBalance', label: 'Outstanding balance', type: 'currency', requiredWhen: true }),
      q({ key: 'debt_instalment', path: 'monthlyInstalment', label: 'Monthly instalment', type: 'currency', requiredWhen: true }),
      q({ key: 'debt_settlement', path: 'settled', label: 'Will this be settled before registration?', type: 'yes_no', requiredWhen: false, options: yesNoOptions }),
    ],
  },
  existing_properties: {
    key: 'existing_properties',
    path: 'participants.primaryApplicant.existingProperties',
    label: 'Existing properties',
    addLabel: 'Add property',
    summaryLabelPath: 'address',
    itemFields: [
      q({ key: 'existing_property_address', path: 'address', label: 'Property address', requiredWhen: true }),
      q({ key: 'existing_property_value', path: 'estimatedValue', label: 'Estimated value', type: 'currency', requiredWhen: true }),
      q({ key: 'existing_property_bond', path: 'outstandingBondBalance', label: 'Outstanding bond balance', type: 'currency', requiredWhen: false }),
      q({ key: 'existing_property_repayment', path: 'monthlyBondRepayment', label: 'Monthly bond repayment', type: 'currency', requiredWhen: false }),
      q({ key: 'existing_property_sold', path: 'willBeSold', label: 'Will this property be sold?', type: 'yes_no', requiredWhen: false, options: yesNoOptions }),
    ],
  },
  assets: {
    key: 'assets',
    path: 'participants.primaryApplicant.assets',
    label: 'Assets',
    addLabel: 'Add asset',
    summaryLabelPath: 'description',
    itemFields: [
      q({ key: 'asset_type', path: 'type', label: 'Asset type', type: 'select', requiredWhen: true, options: [
        { value: 'vehicle', label: 'Vehicle' },
        { value: 'savings', label: 'Savings' },
        { value: 'investments', label: 'Investments' },
        { value: 'retirement_investment', label: 'Retirement investment' },
        { value: 'business_interest', label: 'Business interest' },
        { value: 'other', label: 'Other asset' },
      ] }),
      q({ key: 'asset_description', path: 'description', label: 'Description', requiredWhen: true }),
      q({ key: 'asset_value', path: 'value', label: 'Estimated value', type: 'currency', requiredWhen: true }),
    ],
  },
  liabilities: {
    key: 'liabilities',
    path: 'participants.primaryApplicant.liabilities',
    label: 'Other liabilities',
    addLabel: 'Add liability',
    summaryLabelPath: 'description',
    itemFields: [
      q({ key: 'liability_description', path: 'description', label: 'Liability', requiredWhen: true }),
      q({ key: 'liability_value', path: 'value', label: 'Amount', type: 'currency', requiredWhen: true }),
    ],
  },
}

export const BOND_APPLICATION_QUESTIONS = [
  q({ key: 'purchase_price', path: 'application.finance.purchasePrice', label: 'Purchase price', type: 'currency', requiredWhen: true }),
  q({ key: 'deposit_amount', path: 'application.finance.depositAmount', label: 'Deposit', type: 'currency', requiredWhen: false }),
  q({ key: 'requested_bond_amount', path: 'application.finance.requestedBondAmount', label: 'Bond required', type: 'currency', requiredWhen: true }),
  q({ key: 'finance_type', path: 'application.finance.financeType', label: 'Finance type', requiredWhen: false }),
  q({ key: 'applicant_structure', path: 'application.applicantStructure', label: 'How are you applying?', type: 'single_select', requiredWhen: true, options: [
    { value: 'sole', label: 'I am applying alone', description: 'Continue in the guided application.' },
    { value: 'joint', label: 'I am applying with another person', description: 'We will save your progress and continue in the full application.' },
    { value: 'surety', label: 'A surety will be involved', description: 'We will save your progress and continue in the full application.' },
  ] }),
  q({ key: 'first_name', path: 'participants.primaryApplicant.personal.first_name', label: 'First name', requiredWhen: true }),
  q({ key: 'surname', path: 'participants.primaryApplicant.personal.surname', label: 'Surname', requiredWhen: true }),
  q({ key: 'identity_number', path: 'participants.primaryApplicant.personal.identity_number', label: 'Identity or passport number', requiredWhen: false }),
  q({ key: 'email', path: 'participants.primaryApplicant.contact.email', label: 'Email address', type: 'email', requiredWhen: true }),
  q({ key: 'phone', path: 'participants.primaryApplicant.contact.phone', label: 'Mobile number', type: 'phone', requiredWhen: true }),
  q({ key: 'residential_street', path: 'participants.primaryApplicant.address.residential_address_street', label: 'Residential street', requiredWhen: false }),
  q({ key: 'residential_city', path: 'participants.primaryApplicant.address.residential_address_city', label: 'Residential city', requiredWhen: false }),
  q({ key: 'marital_status', path: 'participants.primaryApplicant.personal.marital_status', label: 'Marital status', requiredWhen: false }),
  q({ key: 'marital_regime', path: 'participants.primaryApplicant.marital.regime', label: 'Marital regime', requiredWhen: { field: 'participants.primaryApplicant.personal.marital_status', equals: 'married' }, visibleWhen: { field: 'participants.primaryApplicant.personal.marital_status', equals: 'married' } }),
  q({ key: 'employment_type', path: 'participants.primaryApplicant.employment.occupation_status', label: 'How do you currently earn your main income?', type: 'single_select', requiredWhen: true, options: mainIncomeOptions }),
  q({ key: 'employer_name', path: 'participants.primaryApplicant.employment.employer_name', label: 'Employer or organisation', requiredWhen: true, visibleWhen: { any: [isEmploymentType('permanent'), isEmploymentType('contract'), isEmploymentType('commission')] } }),
  q({ key: 'occupation', path: 'participants.primaryApplicant.employment.nature_of_occupation', label: 'Job title or occupation', requiredWhen: true, visibleWhen: { any: [isEmploymentType('permanent'), isEmploymentType('contract'), isEmploymentType('commission')] } }),
  q({ key: 'gross_salary', path: 'participants.primaryApplicant.expenses.gross_salary', label: 'Gross monthly income', type: 'currency', requiredWhen: true, visibleWhen: { any: [isEmploymentType('permanent'), isEmploymentType('contract'), isEmploymentType('commission')] } }),
  q({ key: 'net_salary', path: 'participants.primaryApplicant.expenses.net_salary', label: 'Net monthly income', type: 'currency', requiredWhen: false, visibleWhen: { any: [isEmploymentType('permanent'), isEmploymentType('contract'), isEmploymentType('commission')] } }),
  q({ key: 'employment_years', path: 'participants.primaryApplicant.employment.employment_years', label: 'Years', type: 'integer', requiredWhen: { any: [{ field: 'participants.primaryApplicant.employment.employment_months', notExists: true }, { field: 'participants.primaryApplicant.employment.employment_years', exists: true }] }, visibleWhen: { any: [isEmploymentType('permanent'), isEmploymentType('commission')] }, validation: { min: 0 } }),
  q({ key: 'employment_months', path: 'participants.primaryApplicant.employment.employment_months', label: 'Months', type: 'integer', requiredWhen: false, visibleWhen: { any: [isEmploymentType('permanent'), isEmploymentType('commission')] }, validation: { min: 0, max: 11 } }),
  q({ key: 'works_in_south_africa', path: 'participants.primaryApplicant.employment.works_in_south_africa', label: 'Do you work in South Africa?', type: 'yes_no', requiredWhen: true, visibleWhen: { any: [isEmploymentType('permanent'), isEmploymentType('contract'), isEmploymentType('commission')] }, options: yesNoOptions }),
  q({ key: 'contract_start_date', path: 'participants.primaryApplicant.employment.contract_start_date', label: 'Contract start date', type: 'date', requiredWhen: true, visibleWhen: isEmploymentType('contract') }),
  q({ key: 'contract_end_date', path: 'participants.primaryApplicant.employment.contract_end_date', label: 'Contract end date', type: 'date', requiredWhen: true, visibleWhen: isEmploymentType('contract'), validation: { afterOrEqualPath: 'participants.primaryApplicant.employment.contract_start_date' } }),
  q({ key: 'business_name', path: 'participants.primaryApplicant.employment.employer_name', label: 'Business or trading name', requiredWhen: true, visibleWhen: isEmploymentType('selfEmployed') }),
  q({ key: 'business_type', path: 'participants.primaryApplicant.employment.business_type', label: 'Business type', requiredWhen: false, visibleWhen: isEmploymentType('selfEmployed') }),
  q({ key: 'business_registration_number', path: 'participants.primaryApplicant.employment.company_registration_number', label: 'Company registration number', requiredWhen: false, visibleWhen: isEmploymentType('selfEmployed') }),
  q({ key: 'business_income', path: 'participants.primaryApplicant.expenses.gross_salary', label: 'Average monthly income', type: 'currency', requiredWhen: true, visibleWhen: isEmploymentType('selfEmployed') }),
  q({ key: 'ownership_percentage', path: 'participants.primaryApplicant.employment.ownership_percentage', label: 'Ownership percentage', type: 'percentage', requiredWhen: false, visibleWhen: isEmploymentType('selfEmployed'), validation: { min: 0, max: 100 } }),
  q({ key: 'base_salary', path: 'participants.primaryApplicant.expenses.basic_salary', label: 'Base salary', type: 'currency', requiredWhen: false, visibleWhen: isEmploymentType('commission') }),
  q({ key: 'average_commission', path: 'participants.primaryApplicant.expenses.average_commission', label: 'Average monthly commission', type: 'currency', requiredWhen: true, visibleWhen: isEmploymentType('commission') }),
  q({ key: 'retirement_income_sources', path: 'participants.primaryApplicant.incomeSources', label: 'Retirement income sources', type: 'repeatable_group', groupKey: 'income_sources', requiredWhen: true, visibleWhen: isEmploymentType('retired') }),
  q({ key: 'other_income_sources', path: 'participants.primaryApplicant.incomeSources', label: 'Income sources', type: 'repeatable_group', groupKey: 'income_sources', requiredWhen: true, visibleWhen: isEmploymentType('other') }),
  q({ key: 'has_additional_income', path: 'participants.primaryApplicant.employment.has_additional_income', label: 'Do you receive income from any other sources?', type: 'yes_no', requiredWhen: true, options: yesNoOptions, visibleWhen: { not: { any: [isEmploymentType('retired'), isEmploymentType('other')] } } }),
  q({ key: 'additional_income_sources', path: 'participants.primaryApplicant.incomeSources', label: 'Additional income sources', type: 'repeatable_group', groupKey: 'income_sources', requiredWhen: { field: 'participants.primaryApplicant.employment.has_additional_income', equals: 'yes' }, visibleWhen: { field: 'participants.primaryApplicant.employment.has_additional_income', equals: 'yes' } }),
  q({ key: 'dependants', path: 'participants.primaryApplicant.expenses.number_of_dependants', label: 'Number of dependants', type: 'integer', requiredWhen: false, validation: { min: 0 } }),
  q({ key: 'maintenance_paid', path: 'participants.primaryApplicant.expenses.maintenance_paid', label: 'Do you pay maintenance?', type: 'yes_no', requiredWhen: true, options: yesNoOptions }),
  q({ key: 'maintenance_amount', path: 'participants.primaryApplicant.expenses.maintenance_amount', label: 'Monthly maintenance amount', type: 'currency', requiredWhen: { field: 'participants.primaryApplicant.expenses.maintenance_paid', equals: 'yes' }, visibleWhen: { field: 'participants.primaryApplicant.expenses.maintenance_paid', equals: 'yes' } }),
  q({ key: 'rent_paid', path: 'participants.primaryApplicant.expenses.pays_rent', label: 'Do you pay rent?', type: 'yes_no', requiredWhen: true, options: yesNoOptions }),
  q({ key: 'rent_amount', path: 'participants.primaryApplicant.expenses.rental_expense', label: 'Monthly rent', type: 'currency', requiredWhen: { field: 'participants.primaryApplicant.expenses.pays_rent', equals: 'yes' }, visibleWhen: { field: 'participants.primaryApplicant.expenses.pays_rent', equals: 'yes' } }),
  q({ key: 'groceries', path: 'participants.primaryApplicant.expenses.groceries', label: 'Groceries and household costs', type: 'currency', requiredWhen: true }),
  q({ key: 'transport', path: 'participants.primaryApplicant.expenses.transport', label: 'Transport costs', type: 'currency', requiredWhen: false }),
  q({ key: 'medical_aid', path: 'participants.primaryApplicant.expenses.medical_aid', label: 'Medical aid and healthcare', type: 'currency', requiredWhen: false }),
  q({ key: 'education', path: 'participants.primaryApplicant.expenses.education', label: 'Education and childcare', type: 'currency', requiredWhen: false }),
  q({ key: 'other_commitments', path: 'participants.primaryApplicant.monthlyCommitments', label: 'Other recurring commitments', type: 'repeatable_group', groupKey: 'monthly_commitments', requiredWhen: false }),
  q({ key: 'bank_accounts', path: 'participants.primaryApplicant.bankAccounts', label: 'Bank accounts', type: 'repeatable_group', groupKey: 'bank_accounts', requiredWhen: true }),
  q({ key: 'has_debts', path: 'participants.primaryApplicant.credit.has_debts', label: 'Do you currently have loans, credit agreements or other debt?', type: 'yes_no', requiredWhen: true, options: yesNoOptions }),
  q({ key: 'debts', path: 'participants.primaryApplicant.debts', label: 'Existing debts', type: 'repeatable_group', groupKey: 'debts', requiredWhen: { field: 'participants.primaryApplicant.credit.has_debts', equals: 'yes' }, visibleWhen: { field: 'participants.primaryApplicant.credit.has_debts', equals: 'yes' } }),
  q({ key: 'owns_property', path: 'participants.primaryApplicant.credit.owns_property', label: 'Do you currently own any property?', type: 'yes_no', requiredWhen: true, options: yesNoOptions }),
  q({ key: 'existing_properties', path: 'participants.primaryApplicant.existingProperties', label: 'Existing properties', type: 'repeatable_group', groupKey: 'existing_properties', requiredWhen: { field: 'participants.primaryApplicant.credit.owns_property', equals: 'yes' }, visibleWhen: { field: 'participants.primaryApplicant.credit.owns_property', equals: 'yes' } }),
  q({ key: 'assets', path: 'participants.primaryApplicant.assets', label: 'Assets', type: 'repeatable_group', groupKey: 'assets', requiredWhen: false }),
  q({ key: 'liabilities', path: 'participants.primaryApplicant.liabilities', label: 'Other liabilities', type: 'repeatable_group', groupKey: 'liabilities', requiredWhen: false }),
  q({ key: 'under_debt_review', path: 'participants.primaryApplicant.credit.under_debt_review', label: 'Are you currently under debt review?', type: 'yes_no', requiredWhen: true, options: yesNoOptions }),
  q({ key: 'debt_review_details', path: 'participants.primaryApplicant.credit.debt_review_details', label: 'Debt review details', type: 'textarea', requiredWhen: { field: 'participants.primaryApplicant.credit.under_debt_review', equals: 'yes' }, visibleWhen: { field: 'participants.primaryApplicant.credit.under_debt_review', equals: 'yes' } }),
  q({ key: 'has_judgment', path: 'participants.primaryApplicant.credit.has_judgment', label: 'Do you have any judgments?', type: 'yes_no', requiredWhen: true, options: yesNoOptions }),
  q({ key: 'judgment_details', path: 'participants.primaryApplicant.credit.judgment_details', label: 'Judgment details', type: 'textarea', requiredWhen: { field: 'participants.primaryApplicant.credit.has_judgment', equals: 'yes' }, visibleWhen: { field: 'participants.primaryApplicant.credit.has_judgment', equals: 'yes' } }),
  q({ key: 'has_arrears', path: 'participants.primaryApplicant.credit.has_arrears', label: 'Have you had accounts in arrears?', type: 'yes_no', requiredWhen: true, options: yesNoOptions }),
  q({ key: 'arrears_details', path: 'participants.primaryApplicant.credit.arrears_details', label: 'Arrears details', type: 'textarea', requiredWhen: { field: 'participants.primaryApplicant.credit.has_arrears', equals: 'yes' }, visibleWhen: { field: 'participants.primaryApplicant.credit.has_arrears', equals: 'yes' } }),
  q({ key: 'declared_insolvent', path: 'participants.primaryApplicant.credit.declared_insolvent', label: 'Have you been sequestrated or declared insolvent?', type: 'yes_no', requiredWhen: true, options: yesNoOptions }),
]

export const BOND_APPLICATION_SCREENS = [
  { key: 'application_confirmation', stepKey: 'your_application', title: 'Your purchase', questionKeys: ['purchase_price', 'deposit_amount', 'requested_bond_amount', 'finance_type'], custom: true },
  { key: 'applicant_structure', stepKey: 'applicants', title: 'How are you applying?', questionKeys: ['applicant_structure'], custom: true },
  { key: 'about_you_confirmation', stepKey: 'about_you', title: 'Confirm your details', questionKeys: ['first_name', 'surname', 'identity_number', 'email', 'phone', 'residential_street', 'residential_city', 'marital_status'], custom: true },
  { key: 'about_you_edit', stepKey: 'about_you', title: 'Update your details', questionKeys: ['first_name', 'surname', 'identity_number', 'email', 'phone', 'residential_street', 'residential_city', 'marital_status', 'marital_regime'], custom: true, editOnly: true },
  { key: 'employment_type', stepKey: 'employment_income', title: 'Your main income', questionKeys: ['employment_type'], custom: true },
  { key: 'employment_details', stepKey: 'employment_income', title: 'Employment details', questionKeys: ['employer_name', 'occupation', 'gross_salary', 'net_salary'], visibleWhen: { any: [isEmploymentType('permanent'), isEmploymentType('contract'), isEmploymentType('commission')] } },
  { key: 'employment_additional_details', stepKey: 'employment_income', title: 'Employment duration', questionKeys: ['employment_years', 'employment_months', 'works_in_south_africa'], visibleWhen: { any: [isEmploymentType('permanent'), isEmploymentType('commission')] } },
  { key: 'contract_details', stepKey: 'employment_income', title: 'Contract details', questionKeys: ['contract_start_date', 'contract_end_date', 'works_in_south_africa'], visibleWhen: isEmploymentType('contract') },
  { key: 'self_employed_details', stepKey: 'employment_income', title: 'Business details', questionKeys: ['business_name', 'business_type', 'business_registration_number', 'ownership_percentage', 'business_income'], visibleWhen: isEmploymentType('selfEmployed') },
  { key: 'retirement_income', stepKey: 'employment_income', title: 'Retirement income', questionKeys: ['retirement_income_sources'], visibleWhen: isEmploymentType('retired') },
  { key: 'other_income', stepKey: 'employment_income', title: 'Other income', questionKeys: ['other_income_sources'], visibleWhen: isEmploymentType('other') },
  { key: 'additional_income_gate', stepKey: 'employment_income', title: 'Additional income', questionKeys: ['has_additional_income'] },
  { key: 'additional_income_sources', stepKey: 'employment_income', title: 'Additional income sources', questionKeys: ['additional_income_sources'], visibleWhen: { field: 'participants.primaryApplicant.employment.has_additional_income', equals: 'yes' } },
  { key: 'monthly_dependants', stepKey: 'monthly_commitments', title: 'Dependants and maintenance', questionKeys: ['dependants', 'maintenance_paid', 'maintenance_amount'] },
  { key: 'monthly_housing', stepKey: 'monthly_commitments', title: 'Housing costs', questionKeys: ['rent_paid', 'rent_amount'] },
  { key: 'monthly_living_costs', stepKey: 'monthly_commitments', title: 'Living costs', questionKeys: ['groceries', 'transport', 'medical_aid', 'education'] },
  { key: 'monthly_other_commitments', stepKey: 'monthly_commitments', title: 'Other commitments', questionKeys: ['other_commitments'] },
  { key: 'monthly_commitments_summary', stepKey: 'monthly_commitments', title: 'Monthly commitment summary', questionKeys: [], custom: true },
  { key: 'bank_accounts', stepKey: 'accounts_assets', title: 'Bank accounts', questionKeys: ['bank_accounts'] },
  { key: 'debts_gate', stepKey: 'accounts_assets', title: 'Existing debts', questionKeys: ['has_debts'] },
  { key: 'debts', stepKey: 'accounts_assets', title: 'Debt details', questionKeys: ['debts'], visibleWhen: { field: 'participants.primaryApplicant.credit.has_debts', equals: 'yes' } },
  { key: 'existing_properties_gate', stepKey: 'accounts_assets', title: 'Existing properties', questionKeys: ['owns_property'] },
  { key: 'existing_properties', stepKey: 'accounts_assets', title: 'Property details', questionKeys: ['existing_properties'], visibleWhen: { field: 'participants.primaryApplicant.credit.owns_property', equals: 'yes' } },
  { key: 'assets', stepKey: 'accounts_assets', title: 'Assets', questionKeys: ['assets'] },
  { key: 'liabilities', stepKey: 'accounts_assets', title: 'Liabilities', questionKeys: ['liabilities'] },
  { key: 'credit_history', stepKey: 'accounts_assets', title: 'Credit history', questionKeys: ['under_debt_review', 'debt_review_details', 'has_judgment', 'judgment_details', 'has_arrears', 'arrears_details', 'declared_insolvent'] },
  { key: 'document_checklist', stepKey: 'documents', title: 'Documents for your application', questionKeys: [], custom: true },
  { key: 'review_overview', stepKey: 'review_sign', title: 'Review your application', questionKeys: [], custom: true },
  { key: 'declarations', stepKey: 'review_sign', title: 'Declarations and consents', questionKeys: [], custom: true },
  { key: 'prepare_signature', stepKey: 'review_sign', title: 'Prepare for signing', questionKeys: [], custom: true },
  { key: 'awaiting_signature', stepKey: 'review_sign', title: 'Awaiting your signature', questionKeys: [], custom: true },
  { key: 'submitted_status', stepKey: 'review_sign', title: 'Application submitted', questionKeys: [], custom: true },
  { key: 'phase4_review_sign_handoff', stepKey: 'review_sign', title: 'Continue to review', questionKeys: [], transitionOnly: true },
  { key: 'phase2_completion_handoff', stepKey: 'employment_income', title: 'Continue application', questionKeys: [], transitionOnly: true, visibleWhen: { field: 'application.applicantStructure', in: ['joint', 'surety'] } },
]

export const BOND_APPLICATION_FLOW_CONTRACT = {
  version: GUIDED_BOND_APPLICATION_PHASE6_FLOW_VERSION,
  steps: BOND_APPLICATION_FLOW_STEPS,
  screens: BOND_APPLICATION_SCREENS,
  questions: BOND_APPLICATION_QUESTIONS,
  repeatableGroups: BOND_APPLICATION_REPEATABLE_GROUPS,
}

export function getBondApplicationQuestion(questionKey, contract = BOND_APPLICATION_FLOW_CONTRACT) {
  return contract.questions.find((question) => question.key === questionKey) || null
}

export function getBondApplicationRepeatableGroup(groupKey, contract = BOND_APPLICATION_FLOW_CONTRACT) {
  return contract.repeatableGroups[groupKey] || null
}

export function getBondApplicationStep(stepKey, contract = BOND_APPLICATION_FLOW_CONTRACT) {
  return contract.steps.find((step) => step.key === stepKey) || contract.steps[0]
}
