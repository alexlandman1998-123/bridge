import { normalizeFinanceType } from '../core/transactions/financeType'
import { buildDocumentTemplate } from '../core/documents/documentVaultArchitecture'

export const PURCHASER_TYPES = [
  'individual',
  'married_coc',
  'married_anc',
  'married_anc_accrual',
  'trust',
  'company',
  'foreign_purchaser',
]

export const PURCHASER_TYPE_LABELS = {
  individual: 'Individual',
  married_coc: 'Married in Community of Property',
  married_anc: 'Married out of Community of Property',
  married_anc_accrual: 'Married out of Community of Property with Accrual',
  trust: 'Trust',
  company: 'Company / Pty Ltd',
  foreign_purchaser: 'Foreign Purchaser',
}

export const PURCHASER_ENTITY_OPTIONS = [
  { value: 'individual', label: 'Individual', caption: 'A natural person buying in a personal capacity.' },
  { value: 'foreign_purchaser', label: 'Foreign Individual', caption: 'A foreign national or non-resident individual purchasing the property.' },
  { value: 'company', label: 'Company', caption: 'A company or Pty Ltd purchasing the property.' },
  { value: 'trust', label: 'Trust', caption: 'A trust purchasing through its trustees and signatories.' },
]

export const INDIVIDUAL_MARITAL_STRUCTURE_OPTIONS = [
  { value: 'not_applicable', label: 'Not Applicable', caption: 'Buying in your own name without a marital structure affecting the purchase.' },
  { value: 'married_in_community', label: 'Married in Community of Property', caption: 'Both spouses form part of the purchase.' },
  { value: 'married_out_of_community', label: 'Married out of Community of Property', caption: 'Marital status still matters, but the ownership structure differs.' },
]

const PURCHASER_TYPE_ALIASES = {
  married: 'married_coc',
  married_in_community: 'married_coc',
  married_in_community_of_property: 'married_coc',
  married_cop: 'married_coc',
  married_out_of_community: 'married_anc',
  married_out_of_community_of_property: 'married_anc',
  anc: 'married_anc',
  anc_with_accrual: 'married_anc_accrual',
  married_out_of_community_with_accrual: 'married_anc_accrual',
  coc: 'married_coc',
  foreign: 'foreign_purchaser',
  foreign_buyer: 'foreign_purchaser',
}

const ONBOARDING_SUMMARY_META_KEYS = new Set([
  '__bridge_configuration',
  '__bridge_summary',
  '__bridge_parties',
  '__bridge_flags',
  '__bridge_workflows',
])

function field(config) {
  return config
}

function textField(key, label, options = {}) {
  return field({ key, label, type: 'text', required: false, ...options })
}

function emailField(key, label, options = {}) {
  return field({ key, label, type: 'email', required: false, ...options })
}

function phoneField(key, label, options = {}) {
  return field({ key, label, type: 'tel', required: false, ...options })
}

function textareaField(key, label, options = {}) {
  return field({ key, label, type: 'textarea', required: false, ...options })
}

function dateField(key, label, options = {}) {
  return field({ key, label, type: 'date', required: false, ...options })
}

function numberField(key, label, options = {}) {
  return field({ key, label, type: 'number', required: false, min: 0, step: '1', ...options })
}

function currencyField(key, label, options = {}) {
  return field({ key, label, type: 'currency', required: false, min: 0, step: '1000', ...options })
}

function yesNoField(key, label, options = {}) {
  return field({
    key,
    label,
    type: 'radio',
    required: false,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    ...options,
  })
}

function selectField(key, label, options = [], config = {}) {
  return field({
    key,
    label,
    type: 'select',
    required: false,
    options: [{ value: '', label: 'Select' }, ...options],
    ...config,
  })
}

function checkboxField(key, label, options = {}) {
  return field({ key, label, type: 'checkbox', required: false, ...options })
}

function section(key, title, fields, options = {}) {
  return { key, title, fields, description: '', ...options }
}

function repeatableSection(key, title, options = {}) {
  return {
    key,
    title,
    repeatable: true,
    itemLabel: options.itemLabel || 'Entry',
    addLabel: options.addLabel || 'Add entry',
    minItems: options.minItems ?? 0,
    createItem: options.createItem,
    fields: options.fields || [],
    description: options.description || '',
  }
}

function isYes(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === 'yes'
}

function isCoPurchasing(values = {}) {
  return String(values.natural_person_purchase_mode || '')
    .trim()
    .toLowerCase() === 'co_purchasing'
}

function normalizeYesNoChoice(value) {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (normalized === 'yes' || normalized === 'no') {
    return normalized
  }
  return ''
}

const STRUCTURED_PURCHASER_KEYS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'identity_number',
  'passport_number',
  'nationality',
  'residency_status',
  'tax_number',
  'email',
  'phone',
  'street_address',
  'suburb',
  'city',
  'postal_code',
  'marital_status',
  'marital_regime',
  'spouse_full_name',
  'spouse_identity_number',
  'spouse_email',
  'spouse_phone',
  'spouse_is_co_purchaser',
  'employment_type',
  'employer_name',
  'job_title',
  'employment_start_date',
  'business_name',
  'years_in_business',
  'gross_monthly_income',
  'net_monthly_income',
  'income_frequency',
  'number_of_dependants',
  'monthly_credit_commitments',
  'first_time_buyer',
  'primary_residence',
  'investment_purchase',
]

const STRUCTURED_FINANCE_KEYS = [
  'purchase_price',
  'cash_amount',
  'bond_amount',
  'bond_bank_name',
  'bond_current_status',
  'bond_process_started',
  'bond_help_requested',
  'ooba_assist_requested',
  'joint_bond_application',
  'source_of_funds',
]

const COMPANY_VALIDATION_KEYS = [
  'company_name',
  'company_registration_number',
  'authorised_signatory_name',
  'authorised_signatory_identity_number',
  'authorised_signatory_email',
  'authorised_signatory_phone',
]

const TRUST_VALIDATION_KEYS = [
  'trust_name',
  'trust_registration_number',
  'authorised_trustee_name',
  'authorised_trustee_identity_number',
  'authorised_trustee_email',
  'authorised_trustee_phone',
  'trust_resolution_available',
]

function normalizePurchaserEntry(entry = {}) {
  const normalized = {}
  STRUCTURED_PURCHASER_KEYS.forEach((key) => {
    normalized[key] = entry?.[key] ?? ''
  })
  normalized.spouse_is_co_purchaser = normalizeYesNoChoice(normalized.spouse_is_co_purchaser)
  normalized.first_time_buyer = normalizeYesNoChoice(normalized.first_time_buyer)
  normalized.primary_residence = normalizeYesNoChoice(normalized.primary_residence)
  normalized.investment_purchase = normalizeYesNoChoice(normalized.investment_purchase)
  if (!String(normalized.spouse_identity_number || '').trim() && String(entry?.spouse_id_number || '').trim()) {
    normalized.spouse_identity_number = entry.spouse_id_number
  }
  if (!String(normalized.street_address || '').trim() && String(entry?.residential_address || '').trim()) {
    normalized.street_address = entry.residential_address
  }
  return normalized
}

function getLegacyPurchaserEntry(formData = {}, prefix = '') {
  const legacy = {}
  STRUCTURED_PURCHASER_KEYS.forEach((key) => {
    legacy[key] = formData[`${prefix}${key}`]
  })
  legacy.spouse_id_number = formData[`${prefix}spouse_id_number`]
  legacy.residential_address = formData[`${prefix}residential_address`]
  return normalizePurchaserEntry(legacy)
}

function resolveStructuredPurchasers(formData = {}, purchaserType = 'individual') {
  const structured = Array.isArray(formData.purchasers) ? formData.purchasers.map((item) => normalizePurchaserEntry(item)) : []
  const primary = normalizePurchaserEntry(structured[0] || getLegacyPurchaserEntry(formData, ''))
  const secondary = normalizePurchaserEntry(structured[1] || getLegacyPurchaserEntry(formData, 'co_'))

  const modeCandidate = String(formData?.purchaser?.natural_person_purchase_mode || formData.natural_person_purchase_mode || '')
    .trim()
    .toLowerCase()
  const coPurchasing = modeCandidate === 'co_purchasing' || STRUCTURED_PURCHASER_KEYS.some((key) => String(secondary[key] || '').trim().length > 0)
  const purchaserCount = isNaturalPersonPurchaserType(purchaserType) ? (coPurchasing ? 2 : 1) : 0

  return {
    mode: coPurchasing ? 'co_purchasing' : 'individual',
    purchasers: purchaserCount === 2 ? [primary, secondary] : purchaserCount === 1 ? [primary] : [],
  }
}

function resolveStructuredFinance(formData = {}, financeType = 'cash') {
  const base = {
    ...(formData.finance || {}),
  }
  STRUCTURED_FINANCE_KEYS.forEach((key) => {
    if (!isFilledValue(base[key]) && isFilledValue(formData[key])) {
      base[key] = formData[key]
    }
  })
  base.bond_help_requested = normalizeYesNoChoice(base.bond_help_requested || base.ooba_assist_requested || formData.bond_help_requested || formData.ooba_assist_requested)
  base.ooba_assist_requested = normalizeYesNoChoice(base.ooba_assist_requested || base.bond_help_requested)
  return {
    purchase_finance_type: financeType,
    ...base,
  }
}

function isFilledValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some((item) => isFilledValue(item))
  if (typeof value === 'object') return Object.values(value).some((item) => isFilledValue(item))
  return false
}

function normalizeNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function createTrustee() {
  return {
    full_name: '',
    id_number: '',
    phone: '',
    email: '',
    residential_address: '',
    signing_authority: false,
    role_title: 'Trustee',
  }
}

function createDirector() {
  return {
    full_name: '',
    id_number: '',
    phone: '',
    email: '',
    residential_address: '',
    role_title: 'Director',
    signing_authority: false,
  }
}

const PERSONAL_SECTION = section(
  'personal_details',
  'Your Details',
  [
    textField('first_name', 'First Name', { required: true }),
    textField('last_name', 'Surname', { required: true }),
    dateField('date_of_birth', 'Date of Birth', { required: true }),
    emailField('email', 'Email Address', { required: true }),
    phoneField('phone', 'Mobile Number', { required: true }),
    textField('identity_number', 'South African ID Number or Passport Number', { required: true }),
    selectField(
      'residency_status',
      'Citizenship / Residency Status',
      [
        { value: 'sa_citizen', label: 'South African citizen' },
        { value: 'permanent_resident', label: 'Permanent resident' },
        { value: 'foreign_national', label: 'Foreign national / non-resident' },
      ],
      { required: true },
    ),
    textField('nationality', 'Nationality', { required: true }),
    textareaField('residential_address', 'Current Residential Address', { required: true, fullWidth: true }),
    textareaField('postal_address', 'Postal Address (if different)', { fullWidth: true }),
    textField('tax_number', 'Income Tax Number'),
    textField('occupation', 'Occupation'),
    textField('income_source', 'Income Source'),
  ],
  {
    description: 'We use these details to identify the purchaser and prepare the transaction correctly.',
  },
)

const CO_PURCHASER_SECTION = section(
  'co_purchaser_details',
  'Purchaser 2 Details',
  [
    textField('co_first_name', 'First Name', { required: true }),
    textField('co_last_name', 'Surname', { required: true }),
    dateField('co_date_of_birth', 'Date of Birth', { required: true }),
    emailField('co_email', 'Email Address', { required: true }),
    phoneField('co_phone', 'Mobile Number', { required: true }),
    textField('co_identity_number', 'South African ID Number or Passport Number', { required: true }),
    selectField(
      'co_residency_status',
      'Citizenship / Residency Status',
      [
        { value: 'sa_citizen', label: 'South African citizen' },
        { value: 'permanent_resident', label: 'Permanent resident' },
        { value: 'foreign_national', label: 'Foreign national / non-resident' },
      ],
      { required: true },
    ),
    textField('co_nationality', 'Nationality', { required: true }),
    textareaField('co_residential_address', 'Current Residential Address', { required: true, fullWidth: true }),
    textareaField('co_postal_address', 'Postal Address (if different)', { fullWidth: true }),
    textField('co_tax_number', 'Income Tax Number'),
    textField('co_occupation', 'Occupation'),
    textField('co_income_source', 'Income Source'),
  ],
  {
    description: 'Capture the second purchaser details when purchasing jointly.',
    visibleWhen: (values) => isCoPurchasing(values),
  },
)

const INDIVIDUAL_SECTIONS = []

const MARRIED_COC_SECTIONS = [
  section(
    'married_coc_details',
    'Spouse Details',
    [
      textField('spouse_full_name', 'Spouse Full Name', { required: true }),
      textField('spouse_id_number', 'Spouse ID Number', { required: true }),
      phoneField('spouse_phone', 'Spouse Contact Number', { required: true }),
      emailField('spouse_email', 'Spouse Email Address'),
      textareaField('spouse_residential_address', 'Spouse Residential Address', { required: true, fullWidth: true }),
      dateField('marriage_date', 'Marriage Date'),
    ],
    {
      description: 'Both spouses form part of the purchase and will usually need to complete FICA and signing requirements.',
    },
  ),
]

const MARRIED_ANC_SECTIONS = [
  section(
    'married_anc_details',
    'Marital Structure Details',
    [
      textField('spouse_full_name', 'Spouse Full Name', { required: true }),
      textField('spouse_id_number', 'Spouse ID Number', { required: true }),
      phoneField('spouse_phone', 'Spouse Contact Number'),
      emailField('spouse_email', 'Spouse Email Address'),
      yesNoField('spouse_is_co_purchaser', 'Is your spouse also a co-purchaser?', { required: true }),
      yesNoField('anc_available', 'Is an antenuptial contract available if required?', { required: true }),
    ],
    {
      description: 'We capture the spouse and marital regime because it can change who signs and what supporting records are needed.',
    },
  ),
]

const TRUST_SECTIONS = [
  section(
    'trust_entity',
    'Trust Details',
    [
      textField('trust_name', 'Trust Name', { required: true }),
      textField('trust_registration_number', 'Trust Registration Number', { required: true }),
      textField('trust_type', 'Trust Type'),
      textField('masters_office_reference', 'Master’s Office Reference'),
      textareaField('trust_registered_address', 'Registered Address', { required: true, fullWidth: true }),
      textField('trust_tax_number', 'Trust Tax Number'),
      textField('trust_contact_name', 'Primary Trust Contact', { required: true }),
      emailField('trust_contact_email', 'Primary Trust Contact Email', { required: true }),
      phoneField('trust_contact_phone', 'Primary Trust Contact Number', { required: true }),
      yesNoField('trust_resolution_available', 'Is a resolution to purchase available?', { required: true }),
      yesNoField('all_trustees_signing', 'Are all trustees signing?', { required: true }),
    ],
    {
      description: 'Trust purchases need entity verification, trustee information, and authority to purchase.',
    },
  ),
  repeatableSection('trustees', 'Trustees', {
    itemLabel: 'Trustee',
    addLabel: 'Add Trustee',
    minItems: 1,
    createItem: createTrustee,
    description: 'Capture every trustee involved in the trust structure. Mark the people who are authorised to sign.',
    fields: [
      textField('full_name', 'Full Name', { required: true }),
      textField('id_number', 'ID Number / Passport', { required: true }),
      phoneField('phone', 'Contact Number', { required: true }),
      emailField('email', 'Email Address'),
      textareaField('residential_address', 'Residential Address', { required: true, fullWidth: true }),
      textField('role_title', 'Role / Title'),
      checkboxField('signing_authority', 'This trustee is authorised to sign'),
    ],
  }),
]

const COMPANY_SECTIONS = [
  section(
    'company_entity',
    'Company Details',
    [
      textField('company_name', 'Company Name', { required: true }),
      textField('company_registration_number', 'Registration Number', { required: true }),
      textField('vat_number', 'VAT Number'),
      textareaField('company_registered_address', 'Registered Address', { required: true, fullWidth: true }),
      textareaField('company_business_address', 'Business Address (if different)', { fullWidth: true }),
      textField('nature_of_business', 'Nature of Business'),
      textField('company_tax_number', 'Tax Number'),
      textField('company_contact_name', 'Primary Company Contact', { required: true }),
      emailField('company_contact_email', 'Primary Company Contact Email', { required: true }),
      phoneField('company_contact_phone', 'Primary Company Contact Number', { required: true }),
      textField('authorised_signatory_capacity', 'Authorised Signatory Capacity'),
      yesNoField('board_resolution_available', 'Is a board resolution available?', { required: true }),
    ],
    {
      description: 'Company purchases need entity verification and signatory authority before legal work can move ahead.',
    },
  ),
  repeatableSection('directors', 'Directors / Signatories', {
    itemLabel: 'Director',
    addLabel: 'Add Director',
    minItems: 1,
    createItem: createDirector,
    description: 'Capture all relevant directors and mark the people who have authority to sign the purchase documents.',
    fields: [
      textField('full_name', 'Full Name', { required: true }),
      textField('id_number', 'ID Number / Passport', { required: true }),
      phoneField('phone', 'Contact Number', { required: true }),
      emailField('email', 'Email Address'),
      textareaField('residential_address', 'Residential Address', { required: true, fullWidth: true }),
      textField('role_title', 'Role / Title', { required: true }),
      checkboxField('signing_authority', 'This director is authorised to sign'),
    ],
  }),
]

const FOREIGN_PURCHASER_SECTIONS = []

const COMMON_CONTEXT_SECTIONS = []

const FINANCE_OPTIONS = [
  { value: 'bond', label: 'Bond' },
  { value: 'cash', label: 'Cash' },
  { value: 'combination', label: 'Hybrid (bond + cash)' },
]

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full-time employed', caption: 'Stable salaried income with standard monthly payslips.' },
  {
    value: 'self_employed',
    label: 'Self-employed / Business owner',
    caption: 'Business-led income that usually needs financial statements and longer bank history.',
  },
  {
    value: 'commission',
    label: 'Commission-based / Variable income',
    caption: 'Income varies month to month and needs earning history support.',
  },
  {
    value: 'contract',
    label: 'Contract / Freelance',
    caption: 'Independent or project-based income supported by bank history and work records.',
  },
  {
    value: 'retired',
    label: 'Retired / Pension income',
    caption: 'Retirement or pension-based income with pension proof and bank statements.',
  },
  {
    value: 'other',
    label: 'Other',
    caption: 'Any other income profile that still needs finance support documents.',
  },
]

const EMPLOYMENT_COMPLEXITY_SCORE = {
  full_time: 'low',
  self_employed: 'high',
  commission: 'medium',
  contract: 'medium',
  retired: 'medium',
  other: 'medium',
}

function isNaturalPersonPurchaserType(value) {
  const normalized = normalizePurchaserType(value)
  return !['trust', 'company'].includes(normalized)
}

export function getEmploymentTypeLabel(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return EMPLOYMENT_TYPE_OPTIONS.find((item) => item.value === normalized)?.label || 'Not provided'
}

export function getEmploymentTypeHelper(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  switch (normalized) {
    case 'full_time':
      return 'You will usually be asked for the last 3 months of payslips and bank statements.'
    case 'self_employed':
      return 'You may be asked for additional financial documents such as financial statements and extended bank history.'
    case 'commission':
      return 'You will usually be asked for longer bank history and commission or income statements.'
    case 'contract':
      return 'You may be asked for bank statements and supporting contracts or invoices where available.'
    case 'retired':
      return 'You will usually be asked for proof of pension income and recent bank statements.'
    case 'other':
      return 'Bridge will request a broader set of finance support documents so the bond application is not delayed.'
    default:
      return ''
  }
}

function getFinanceSections(financeType, purchaserType = 'individual') {
  const normalized = normalizeFinanceType(financeType || 'cash')
  const naturalPersonPurchase = isNaturalPersonPurchaserType(purchaserType)
  const shared = [
    section(
      'finance_totals',
      'Finance Structure',
      [
        currencyField('purchase_price', 'Purchase Price', { required: true }),
        ...(normalized === 'cash' || normalized === 'combination'
          ? [currencyField('cash_amount', normalized === 'cash' ? 'Cash Amount' : 'Cash Contribution', { required: true })]
          : []),
        ...(normalized === 'bond' || normalized === 'combination'
          ? [currencyField('bond_amount', 'Bond Amount Requested', { required: true })]
          : []),
      ],
      {
        description: 'This tells Bridge how the purchase will actually be funded and which workflows must be activated.',
      },
    ),
  ]

  const bondLike = normalized === 'bond' || normalized === 'combination'
  if (bondLike) {
    if (naturalPersonPurchase) {
      shared.push(
        section(
          'employment_type',
          'Employment Type',
          [
            selectField('employment_type', 'What best describes your current employment?', EMPLOYMENT_TYPE_OPTIONS, {
              required: true,
            }),
          ],
          {
            description: 'This tells Bridge exactly which finance documents must be requested for the bond or hybrid funding lane.',
          },
        ),
      )
    }

    if (naturalPersonPurchase) {
      shared.push(
        section(
          'affordability_snapshot',
          'Affordability Snapshot',
          [
            numberField('number_of_dependants', 'Number of Dependants', { required: true }),
            currencyField('gross_monthly_income', 'Gross Monthly Income', { required: true }),
            currencyField('net_monthly_income', 'Net Monthly Income'),
            currencyField('monthly_credit_commitments', 'Monthly Credit Commitments'),
          ],
          {
            description: 'These figures help the bond originator assess affordability and identify the correct supporting documents upfront.',
          },
        ),
      )

      shared.push(
        section(
          'employment_profile_salaried',
          'Employment Details',
          [
            textField('employer_name', 'Employer Name', { required: true }),
            textField('job_title', 'Job Title / Role', { required: true }),
            dateField('employment_start_date', 'Employment Start Date', { required: true }),
            selectField(
              'income_frequency',
              'Income Frequency',
              [
                { value: 'monthly', label: 'Monthly' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'fortnightly', label: 'Fortnightly' },
              ],
              { required: true },
            ),
          ],
          {
            description: 'Required for salaried or regularly employed bond applicants.',
            visibleWhen: (values) => ['full_time', 'commission', 'contract'].includes(String(values.employment_type || '').trim().toLowerCase()),
          },
        ),
      )

      shared.push(
        section(
          'employment_profile_self_employed',
          'Business / Self-Employment Details',
          [
            textField('business_name', 'Business Name', { required: true }),
            textField('business_registration_number', 'Business Registration Number'),
            numberField('years_trading', 'Years Trading', { required: true }),
            textField('industry_type', 'Industry / Business Type'),
            textField('accountant_name', 'Accountant Name'),
            phoneField('accountant_phone', 'Accountant Contact Number'),
          ],
          {
            description: 'Required where the bond application depends on self-employed or business-led income.',
            visibleWhen: (values) => String(values.employment_type || '').trim().toLowerCase() === 'self_employed',
          },
        ),
      )

      shared.push(
        section(
          'employment_profile_retired',
          'Retirement Income Details',
          [
            textField('pension_provider', 'Pension / Annuity Provider', { required: true }),
            currencyField('monthly_pension_income', 'Monthly Pension / Annuity Income', { required: true }),
            dateField('retirement_date', 'Retired Since'),
          ],
          {
            description: 'Required where affordability will rely on retirement income.',
            visibleWhen: (values) => String(values.employment_type || '').trim().toLowerCase() === 'retired',
          },
        ),
      )

      shared.push(
        section(
          'employment_profile_other',
          'Other Income Details',
          [
            textareaField('income_explanation', 'Explain the Income Structure', { required: true, fullWidth: true }),
            currencyField('average_monthly_income', 'Average Monthly Income', { required: true }),
          ],
          {
            description: 'Used when the income profile does not fit the standard salaried or retirement paths.',
            visibleWhen: (values) => ['other', 'contract', 'commission'].includes(String(values.employment_type || '').trim().toLowerCase()),
          },
        ),
      )
    }

    shared.push(
      section(
        'bond_progress',
        'Bond Progress',
        [
          yesNoField('bond_process_started', 'Have you already started the bond process?', { required: true }),
          selectField(
            'bond_current_status',
            'Current Bond Status',
            [
              { value: 'not_started', label: 'Not started' },
              { value: 'pre_approval_only', label: 'Pre-approval only' },
              { value: 'application_in_progress', label: 'Application in progress' },
              { value: 'submitted_to_banks', label: 'Submitted to banks' },
              { value: 'bond_approved', label: 'Bond approved' },
            ],
            { required: true },
          ),
          textField('bond_bank_name', 'Bank / Bond Provider'),
          yesNoField('ooba_assist_requested', 'Would you like OOBA to assist with the bond?', { required: true }),
          yesNoField('joint_bond_application', 'Is this a joint bond application?', { required: true }),
          textField('monthly_income_range', 'Monthly Income Range'),
        ],
        {
          description: 'These answers determine whether the finance lane and bond-originator support should be activated.',
        },
      ),
    )
  }

  if (normalized === 'cash' || normalized === 'combination') {
    shared.push(
      section(
        'cash_funding',
        'Cash Funding',
        [
          yesNoField('proof_of_funds_available', 'Is proof of funds available?', { required: true }),
          selectField(
            'source_of_funds',
            'Source of Funds',
            [
              { value: 'savings', label: 'Savings' },
              { value: 'investment', label: 'Investment' },
              { value: 'sale_of_property', label: 'Sale of property' },
              { value: 'business_funds', label: 'Business funds' },
              { value: 'inheritance', label: 'Inheritance' },
              { value: 'other', label: 'Other' },
            ],
            { required: true },
          ),
        ],
        {
          description: 'Cash and hybrid deals need source-of-funds clarity early so the transfer team is not blocked later.',
        },
      ),
    )
  }

  if (normalized === 'cash' || normalized === 'combination') {
    shared.push(
      repeatableSection('funding_sources', 'Funding Sources / Payment Plan', {
        itemLabel: 'Funding Source',
        addLabel: 'Add Funding Source',
        minItems: 1,
        createItem: () => ({
          sourceType: 'personal_account',
          amount: '',
          expectedPaymentDate: '',
          actualPaymentDate: '',
          proofDocument: '',
          status: 'planned',
          notes: '',
        }),
        description: 'Add one or more entries when cash is coming from more than one place.',
        fields: [
          selectField(
            'sourceType',
            'Source Type',
            [
              { value: 'personal_account', label: 'Personal account' },
              { value: 'company_account', label: 'Company account' },
              { value: 'trust_account', label: 'Trust account' },
              { value: 'family_contribution', label: 'Family contribution' },
              { value: 'foreign_funds', label: 'Foreign funds' },
              { value: 'other', label: 'Other' },
            ],
            { required: true },
          ),
          currencyField('amount', 'Amount', { required: true }),
          dateField('expectedPaymentDate', 'Expected Payment Date'),
          dateField('actualPaymentDate', 'Actual Payment Date'),
          textField('proofDocument', 'Proof Document Reference'),
          selectField(
            'status',
            'Status',
            [
              { value: 'planned', label: 'Planned' },
              { value: 'pending', label: 'Pending' },
              { value: 'paid', label: 'Paid' },
              { value: 'verified', label: 'Verified' },
            ],
            { required: true },
          ),
          textareaField('notes', 'Notes', { fullWidth: true }),
        ],
      }),
    )
  }

  return shared
}

function getPurchaserSpecificSections(purchaserType) {
  switch (normalizePurchaserType(purchaserType)) {
    case 'married_coc':
      return MARRIED_COC_SECTIONS
    case 'married_anc':
    case 'married_anc_accrual':
      return MARRIED_ANC_SECTIONS
    case 'trust':
      return TRUST_SECTIONS
    case 'company':
      return COMPANY_SECTIONS
    case 'foreign_purchaser':
      return FOREIGN_PURCHASER_SECTIONS
    case 'individual':
    default:
      return INDIVIDUAL_SECTIONS
  }
}

function getVisibleFields(fields = [], values = {}) {
  return fields.filter((item) => {
    if (typeof item.visibleWhen === 'function') {
      return item.visibleWhen(values)
    }
    return true
  })
}

function toDocument(definition, index) {
  const template = buildDocumentTemplate(
    {
      ...definition,
      sortOrder: index + 1,
      keywords: definition.keywords || [definition.label, definition.key],
    },
    index + 1,
  )

  return {
    key: template.key,
    label: template.label,
    group: template.groupLabel,
    groupKey: template.groupKey,
    groupLabel: template.groupLabel,
    description: template.description || '',
    requirementLevel: template.requirementLevel || 'required',
    expectedFromRole: template.expectedFromRole,
    defaultVisibility: template.defaultVisibility,
    allowMultiple: template.allowMultiple,
    keywords: template.keywords,
    sortOrder: template.sortOrder,
  }
}

function uniqueByKey(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const key = String(item?.key || '').trim()
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function getPurchaserDocumentDefinitions(purchaserType, values = {}) {
  const type = normalizePurchaserType(purchaserType)

  switch (type) {
    case 'married_coc':
      return [
        {
          key: 'purchaser_1_id',
          label: 'Purchaser ID Copy',
          groupKey: 'buyer_fica',
          description: 'Required to verify the first spouse for FICA and transfer preparation.',
        },
        {
          key: 'purchaser_1_proof_of_address',
          label: 'Purchaser Proof of Address',
          groupKey: 'buyer_fica',
          description: 'Required to verify the first spouse’s residential address.',
        },
        {
          key: 'spouse_id',
          label: 'Spouse ID Copy',
          groupKey: 'buyer_fica',
          description: 'Required because both spouses form part of an in-community transaction.',
        },
        {
          key: 'spouse_proof_of_address',
          label: 'Spouse Proof of Address',
          groupKey: 'buyer_fica',
          description: 'Required to verify the spouse’s address for compliance.',
        },
        {
          key: 'marriage_certificate',
          label: 'Marriage Certificate',
          groupKey: 'buyer_fica',
          description: 'Used to confirm the marital regime and signing requirements.',
        },
      ]
    case 'married_anc':
    case 'married_anc_accrual':
      return [
        {
          key: 'purchaser_id',
          label: 'Purchaser ID Copy',
          groupKey: 'buyer_fica',
          description: 'Required to verify the purchaser for compliance.',
        },
        {
          key: 'purchaser_proof_of_address',
          label: 'Purchaser Proof of Address',
          groupKey: 'buyer_fica',
          description: 'Required to verify the purchaser’s residential address.',
        },
        ...(values.spouse_full_name || isYes(values.spouse_is_co_purchaser)
          ? [
              {
                key: 'spouse_id_optional',
                label: 'Spouse ID Copy',
                groupKey: 'buyer_fica',
                description: 'May be required because the marital structure has been disclosed.',
              },
              {
                key: 'spouse_proof_of_address_optional',
                label: 'Spouse Proof of Address',
                groupKey: 'buyer_fica',
                description: 'May be required depending on the attorney’s compliance workflow.',
              },
            ]
          : []),
        {
          key: type === 'married_anc_accrual' ? 'anc_accrual_document_optional' : 'anc_document_optional',
          label: type === 'married_anc_accrual' ? 'ANC / Accrual Document' : 'ANC Document',
          groupKey: 'buyer_fica',
          description: 'May be needed to confirm the marital regime and signatory logic.',
        },
      ]
    case 'trust': {
      const trusteeCount = Math.max((values.trustees || []).length, 1)
      return [
        {
          key: 'trust_deed',
          label: 'Trust Deed',
          groupKey: 'buyer_fica',
          description: 'Required because the purchaser is a trust and the legal team must verify its structure.',
        },
        {
          key: 'letters_of_authority',
          label: 'Letters of Authority',
          groupKey: 'buyer_fica',
          description: 'Required to confirm the trustees who may act for the trust.',
        },
        {
          key: 'trust_resolution',
          label: 'Trust Resolution to Purchase',
          groupKey: 'buyer_fica',
          description: 'Required to confirm authority for the trust to buy the property.',
        },
        {
          key: 'trustee_id',
          label: trusteeCount > 1 ? 'Trustee ID Copies' : 'Trustee ID Copy',
          groupKey: 'buyer_fica',
          description: 'Required for every trustee involved in the purchase.',
        },
        {
          key: 'trustee_proof_of_address',
          label: trusteeCount > 1 ? 'Trustee Proofs of Address' : 'Trustee Proof of Address',
          groupKey: 'buyer_fica',
          description: 'Required for every trustee involved in the purchase.',
        },
      ]
    }
    case 'company': {
      const directorCount = Math.max((values.directors || []).length, 1)
      return [
        {
          key: 'cipc_registration',
          label: 'Company / CIPC Registration Documents',
          groupKey: 'buyer_fica',
          description: 'Required to confirm the company’s legal registration and existence.',
        },
        {
          key: 'company_resolution',
          label: 'Company Resolution to Purchase',
          groupKey: 'buyer_fica',
          description: 'Required to authorise the purchase and identify approved signatories.',
        },
        {
          key: 'director_id',
          label: directorCount > 1 ? 'Director ID Copies' : 'Director ID Copy',
          groupKey: 'buyer_fica',
          description: 'Required for the directors involved in the purchase and signing process.',
        },
        {
          key: 'director_proof_of_address',
          label: directorCount > 1 ? 'Director Proofs of Address' : 'Director Proof of Address',
          groupKey: 'buyer_fica',
          description: 'Required for the directors involved in the purchase and signing process.',
        },
      ]
    }
    case 'foreign_purchaser':
      return [
        {
          key: 'passport_copy',
          label: 'Passport Copy',
          groupKey: 'buyer_fica',
          description: 'Required to verify the purchaser identity.',
        },
        {
          key: 'proof_of_address',
          label: 'Proof of Address',
          groupKey: 'buyer_fica',
          description: 'Required to verify the purchaser’s residential address.',
        },
        {
          key: 'source_of_funds',
          label: 'Source of Funds Evidence',
          groupKey: 'buyer_fica',
          description: 'Required where foreign funds are involved for compliance and exchange-control checks.',
        },
      ]
    case 'individual':
    default:
      return [
        {
          key: 'id_document',
          label: 'ID Document',
          groupKey: 'buyer_fica',
          description: 'Required to verify the purchaser identity for compliance and transfer preparation.',
        },
        {
          key: 'proof_of_address',
          label: 'Proof of Address',
          groupKey: 'buyer_fica',
          description: 'Required to verify the purchaser’s residential address.',
        },
        ...(isCoPurchasing(values)
          ? [
              {
                key: 'co_purchaser_id_document',
                label: 'Co-purchaser ID Document',
                groupKey: 'buyer_fica',
                description: 'Required to verify the co-purchaser identity for compliance and transfer preparation.',
              },
              {
                key: 'co_purchaser_proof_of_address',
                label: 'Co-purchaser Proof of Address',
                groupKey: 'buyer_fica',
                description: 'Required to verify the co-purchaser residential address.',
              },
            ]
          : []),
      ]
  }
}

function getFinanceDocumentDefinitions(values = {}, financeType) {
  const normalizedFinanceType = normalizeFinanceType(financeType || values.purchase_finance_type || 'cash')
  const documents = []
  const purchaserType = resolvePurchaserTypeFromFormData(values, {
    purchaserType: values.purchaser_type,
  })
  const purchaserSnapshot = resolveStructuredPurchasers(values, purchaserType)
  const naturalPersonPurchase = isNaturalPersonPurchaserType(purchaserType)
  const employmentType = String(values.employment_type || purchaserSnapshot.purchasers?.[0]?.employment_type || '')
    .trim()
    .toLowerCase()

  if (normalizedFinanceType === 'cash') {
    documents.push({
      key: 'proof_of_funds',
      label: 'Proof of Funds',
      groupKey: 'finance',
      description: 'Required because this purchase is funded in cash and the legal team must verify the source of funds.',
    })
  }

  if (normalizedFinanceType === 'bond' || normalizedFinanceType === 'combination') {
    if (naturalPersonPurchase && employmentType) {
      switch (employmentType) {
        case 'full_time':
          documents.push(
            {
              key: 'payslips_3_months',
              label: 'Payslips (Last 3 Months)',
              groupKey: 'finance',
              description: 'Used to assess your affordability for the bond.',
            },
            {
              key: 'bank_statements_3_months',
              label: 'Bank Statements (Last 3 Months)',
              groupKey: 'finance',
              description: 'Used to verify your income and spending.',
            },
          )
          break
        case 'self_employed':
          documents.push(
            {
              key: 'bank_statements_12_months',
              label: 'Bank Statements (Last 12 Months)',
              groupKey: 'finance',
              description: 'Used to assess income consistency.',
            },
            {
              key: 'financial_statements',
              label: 'Financial Statements (Latest)',
              groupKey: 'finance',
              description: 'Your business financials.',
            },
            {
              key: 'tax_returns_latest',
              label: 'Latest Tax Returns / Assessments',
              groupKey: 'finance',
              description: 'Required to support self-employed affordability and tax compliance.',
            },
            {
              key: 'accountant_letter',
              label: 'Accountant Letter',
              groupKey: 'finance',
              description: 'Confirms income and financial standing if available.',
              requirementLevel: 'optional_required',
            },
          )
          break
        case 'commission':
          documents.push(
            {
              key: 'bank_statements_6_months',
              label: 'Bank Statements (Last 6 Months)',
              groupKey: 'finance',
              description: 'Used to assess average income.',
            },
            {
              key: 'commission_statements',
              label: 'Commission Statements / Income History',
              groupKey: 'finance',
              description: 'Breakdown of earnings over time.',
            },
          )
          break
        case 'contract':
          documents.push(
            {
              key: 'bank_statements_6_months',
              label: 'Bank Statements (Last 6 Months)',
              groupKey: 'finance',
              description: 'Used to assess income.',
            },
            {
              key: 'contracts_or_invoices',
              label: 'Contracts / Invoices',
              groupKey: 'finance',
              description: 'Proof of ongoing work if available.',
              requirementLevel: 'optional_required',
            },
          )
          break
        case 'retired':
          documents.push(
            {
              key: 'pension_proof',
              label: 'Proof of Pension Income',
              groupKey: 'finance',
              description: 'Your monthly pension or retirement income.',
            },
            {
              key: 'bank_statements_3_months',
              label: 'Bank Statements (Last 3 Months)',
              groupKey: 'finance',
              description: 'Used to support the pension income position.',
            },
          )
          break
        case 'other':
          documents.push({
            key: 'bank_statements_6_months',
            label: 'Bank Statements (Last 6 Months)',
            groupKey: 'finance',
            description: 'Used to assess income and overall finance readiness.',
          })
          break
        default:
          break
      }
    } else {
      documents.push(
        ...(purchaserType === 'company' || purchaserType === 'trust'
          ? [
              {
                key: 'entity_bank_statements',
                label: 'Entity Bank Statements',
                groupKey: 'finance',
                description: 'Required to support the bond application and affordability checks for the entity.',
              },
              {
                key: 'entity_financials',
                label: 'Entity Financial Statements',
                groupKey: 'finance',
                description: 'Required for underwriting where the purchaser is an entity.',
              },
              {
                key: 'entity_income_support',
                label: 'Entity Income Support',
                groupKey: 'finance',
                description: 'Supporting income or cashflow documents for the entity purchaser.',
              },
              {
                key: 'entity_tax_clearance_optional',
                label: 'Entity Tax Compliance / Tax Clearance',
                groupKey: 'finance',
                description: 'May be required to support lender underwriting and entity compliance.',
                requirementLevel: 'optional_required',
              },
            ]
          : [
              {
                key: 'payslips',
                label: 'Payslips',
                groupKey: 'finance',
                description: 'Required to support the bond application and affordability checks.',
              },
              {
                key: 'bank_statements',
                label: 'Bank Statements',
                groupKey: 'finance',
                description: 'Required to support the bond application and affordability checks.',
              },
              {
                key: 'proof_of_income',
                label: 'Proof of Income',
                groupKey: 'finance',
                description: 'Required for bond processing and underwriting.',
              },
            ]),
      )
    }

    if (purchaserType === 'married_coc' || isYes(values.spouse_is_co_purchaser) || isCoPurchasing(values)) {
      documents.push(
        {
          key: 'spouse_income_support',
          label: 'Spouse / Co-purchaser Proof of Income',
          groupKey: 'finance',
          description: 'Required because another natural-person applicant is involved in the bond assessment.',
        },
        {
          key: 'spouse_bank_statements',
          label: 'Spouse / Co-purchaser Bank Statements',
          groupKey: 'finance',
          description: 'Required because another natural-person applicant is involved in the bond assessment.',
        },
      )
    }

    documents.push(
      {
        key: 'bond_approval',
        label: 'Bond Approval',
        groupKey: 'finance',
        description: 'Required once the finance approval has been issued.',
      },
      {
        key: 'grant_signed',
        label: 'Grant / Loan Agreement',
        groupKey: 'finance',
        description: 'Required once the lender has issued the final finance documents.',
      },
    )
  }

  if (normalizedFinanceType === 'combination') {
    documents.push({
      key: 'proof_of_funds_cash_component',
      label: 'Proof of Funds for Cash Contribution',
      groupKey: 'finance',
      description: 'Required because part of the purchase price will be paid in cash.',
    })
  }

  return documents
}

function getSaleAndTransferDocuments(options = {}) {
  const reservationRequired = Boolean(options.reservationRequired)
  return [
    {
      key: 'information_sheet',
      label: 'Information Sheet',
      groupKey: 'sale',
      description: 'This structured onboarding form becomes part of the transaction file.',
    },
    {
      key: 'otp',
      label: 'Offer to Purchase (OTP)',
      groupKey: 'sale',
      description: 'The sale agreement will be uploaded once prepared by the internal team.',
    },
    ...(reservationRequired
      ? [
          {
            key: 'reservation_deposit_proof',
            label: 'Reservation / Security Deposit Proof of Payment',
            groupKey: 'sale',
            description: 'Required where a reservation or security deposit applies.',
          },
        ]
      : []),
    {
      key: 'transfer_documents',
      label: 'Transfer Documents',
      groupKey: 'transfer',
      description: 'Transfer and lodgement documentation will be managed through the attorney workflow.',
      expectedFromRole: 'attorney',
      defaultVisibility: 'shared',
    },
  ]
}

function buildParty({ role, name, type = 'person', purchaser = false, signatory = false, relationship = null }) {
  return { role, name, type, purchaser, signatory, relationship }
}

export function normalizePurchaserType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  const aliased = PURCHASER_TYPE_ALIASES[normalized] || normalized
  return PURCHASER_TYPES.includes(aliased) ? aliased : 'individual'
}

export function getPurchaserEntityType(value) {
  const normalized = normalizePurchaserType(value)
  if (normalized === 'trust') return 'trust'
  if (normalized === 'company') return 'company'
  if (normalized === 'foreign_purchaser') return 'foreign_purchaser'
  return 'individual'
}

export function getIndividualMaritalStructureValue(value) {
  const normalized = normalizePurchaserType(value)
  if (normalized === 'married_coc') return 'married_in_community'
  if (normalized === 'married_anc' || normalized === 'married_anc_accrual') return 'married_out_of_community'
  return 'not_applicable'
}

export function resolvePurchaserTypeFromFormData(formData = {}, options = {}) {
  const fallbackType = normalizePurchaserType(formData.purchaser_type || options.purchaserType || options.transaction?.purchaser_type)
  const entityType = String(formData.purchaser_entity_type || getPurchaserEntityType(fallbackType)).trim().toLowerCase()

  if (entityType === 'trust') {
    return 'trust'
  }

  if (entityType === 'company') {
    return 'company'
  }

  if (entityType === 'foreign_purchaser') {
    return 'foreign_purchaser'
  }

  return 'individual'
}

export function getTransactionPurchaserTypeValue(value) {
  const normalized = normalizePurchaserType(value)
  if (normalized === 'married_anc_accrual') {
    return 'married_anc'
  }
  return normalized
}

export function getPurchaserTypeLabel(value) {
  const normalized = normalizePurchaserType(value)
  return PURCHASER_TYPE_LABELS[normalized] || PURCHASER_TYPE_LABELS.individual
}

export function getPurchaserTypeOptions({ includeOptional = false } = {}) {
  const baseTypes = includeOptional ? PURCHASER_TYPES : PURCHASER_TYPES.filter((type) => type !== 'foreign_purchaser')
  return baseTypes.map((type) => ({ value: type, label: PURCHASER_TYPE_LABELS[type] }))
}

export function getPersonaFormConfig(value, options = {}) {
  const purchaserType = resolvePurchaserTypeFromFormData(options.formData || {}, {
    purchaserType: value,
    transaction: options.transaction,
  })
  const financeType = normalizeFinanceType(options.financeType || options.formData?.purchase_finance_type || 'cash')
  const sections = [
    PERSONAL_SECTION,
    ...(isNaturalPersonPurchaserType(purchaserType) ? [CO_PURCHASER_SECTION] : []),
    ...getPurchaserSpecificSections(purchaserType),
    ...(!isNaturalPersonPurchaserType(purchaserType) ? getFinanceSections(financeType, purchaserType) : []),
    ...COMMON_CONTEXT_SECTIONS,
  ]

  return {
    sections,
  }
}

export function getVisibleOnboardingSections({ purchaserType, financeType, values = {} }) {
  return getPersonaFormConfig(purchaserType, { financeType, formData: values }).sections
    .filter((item) => (typeof item.visibleWhen === 'function' ? item.visibleWhen(values) : true))
    .map((item) => ({
      ...item,
      fields: getVisibleFields(item.fields || [], values),
    }))
}

export function deriveOnboardingConfiguration(formData = {}, options = {}) {
  const transaction = options.transaction || null
  const purchaserType = resolvePurchaserTypeFromFormData(formData, {
    purchaserType: options.purchaserType,
    transaction,
  })
  const transactionPurchaserType = getTransactionPurchaserTypeValue(purchaserType)
  const financeType = normalizeFinanceType(formData.purchase_finance_type || options.financeType || transaction?.finance_type || 'cash')
  const purchasePrice = normalizeNumber(formData.purchase_price ?? transaction?.purchase_price ?? transaction?.sales_price)
  const cashAmount = normalizeNumber(formData.cash_amount ?? transaction?.cash_amount)
  const bondAmount = normalizeNumber(formData.bond_amount ?? transaction?.bond_amount)
  const depositAmount = normalizeNumber(formData.deposit_amount ?? transaction?.deposit_amount)
  const reservationRequired = isYes(formData.reservation_required) || formData.reservation_required === true || Boolean(transaction?.reservation_required)
  const trustees = Array.isArray(formData.trustees) ? formData.trustees.filter((item) => isFilledValue(item)) : []
  const directors = Array.isArray(formData.directors) ? formData.directors.filter((item) => isFilledValue(item)) : []
  const fundingSources = Array.isArray(formData.funding_sources) ? formData.funding_sources.filter((item) => isFilledValue(item)) : []
  const employmentType = String(formData.employment_type || '')
    .trim()
    .toLowerCase()

  const parties = []
  const primaryName = [formData.first_name, formData.last_name].filter(Boolean).join(' ').trim()
  if (primaryName) {
    parties.push(buildParty({ role: 'primary_purchaser', name: primaryName, purchaser: true, signatory: true }))
  }

  if (isCoPurchasing(formData)) {
    const coPurchaserName = [formData.co_first_name, formData.co_last_name].filter(Boolean).join(' ').trim()
    if (coPurchaserName) {
      parties.push(
        buildParty({
          role: 'co_purchaser',
          name: coPurchaserName,
          purchaser: true,
          signatory: true,
          relationship: 'co_purchaser',
        }),
      )
    }
  }

  if (purchaserType === 'married_coc' && formData.spouse_full_name) {
    parties.push(buildParty({ role: 'spouse_purchaser', name: formData.spouse_full_name, purchaser: true, signatory: true, relationship: 'spouse' }))
  }

  if ((purchaserType === 'married_anc' || purchaserType === 'married_anc_accrual') && formData.spouse_full_name) {
    parties.push(
      buildParty({
        role: isYes(formData.spouse_is_co_purchaser) ? 'spouse_co_purchaser' : 'spouse_related_party',
        name: formData.spouse_full_name,
        purchaser: isYes(formData.spouse_is_co_purchaser),
        signatory: isYes(formData.spouse_is_co_purchaser),
        relationship: 'spouse',
      }),
    )
  }

  if (purchaserType === 'trust' && formData.trust_name) {
    parties.push(buildParty({ role: 'trust_entity', name: formData.trust_name, type: 'entity', purchaser: true }))
    trustees.forEach((item) => {
      parties.push(
        buildParty({
          role: item.signing_authority ? 'authorised_trustee' : 'trustee',
          name: item.full_name,
          purchaser: false,
          signatory: Boolean(item.signing_authority),
          relationship: 'trustee',
        }),
      )
    })
  }

  if (purchaserType === 'company' && formData.company_name) {
    parties.push(buildParty({ role: 'company_entity', name: formData.company_name, type: 'entity', purchaser: true }))
    directors.forEach((item) => {
      parties.push(
        buildParty({
          role: item.signing_authority ? 'authorised_director' : 'director',
          name: item.full_name,
          purchaser: false,
          signatory: Boolean(item.signing_authority),
          relationship: 'director',
        }),
      )
    })
  }

  const hasBondComponent = financeType === 'bond' || financeType === 'combination'
  const hasCashComponent = financeType === 'cash' || financeType === 'combination'
  const naturalPersonPurchase = isNaturalPersonPurchaserType(purchaserType)
  const employmentComplexityScore = EMPLOYMENT_COMPLEXITY_SCORE[employmentType] || null
  const bondOriginatorRequired = hasBondComponent && (isYes(formData.ooba_assist_requested) || isYes(formData.bond_process_started))
  const multipleSignatories =
    purchaserType === 'married_coc' ||
    (purchaserType === 'trust' && trustees.filter((item) => item.signing_authority).length > 1) ||
    (purchaserType === 'company' && directors.filter((item) => item.signing_authority).length > 1)

  const flags = uniqueByKey(
    [
      purchaserType === 'trust' ? { key: 'entity_purchase', label: 'Trust purchase' } : null,
      purchaserType === 'company' ? { key: 'entity_purchase_company', label: 'Company purchase' } : null,
      purchaserType === 'married_coc' ? { key: 'spouse_required', label: 'Both spouses required' } : null,
      (purchaserType === 'married_anc' || purchaserType === 'married_anc_accrual') && formData.spouse_full_name
        ? { key: 'spouse_recorded', label: 'Spouse recorded' }
        : null,
      purchaserType === 'married_anc_accrual' ? { key: 'accrual_structure', label: 'ANC with accrual' } : null,
      hasBondComponent ? { key: 'bond_component', label: 'Bond component' } : null,
      hasCashComponent ? { key: 'cash_component', label: 'Cash component' } : null,
      financeType === 'combination' ? { key: 'hybrid_funding', label: 'Hybrid funding' } : null,
      naturalPersonPurchase && hasBondComponent && employmentType
        ? { key: `employment_${employmentType}`, label: `Employment type: ${getEmploymentTypeLabel(employmentType)}` }
        : null,
      reservationRequired ? { key: 'reservation_required', label: 'Reservation deposit required' } : null,
      purchaserType === 'foreign_purchaser' || isYes(formData.non_resident_exchange_control)
        ? { key: 'foreign_buyer', label: 'Foreign / exchange-control review' }
        : null,
      multipleSignatories ? { key: 'multi_signatory', label: 'Multiple signatories' } : null,
    ].filter(Boolean),
  )

  const workflows = {
    transfer: { enabled: true, reason: 'Transfer workflow is always active.' },
    finance: {
      enabled: hasBondComponent,
      reason: hasBondComponent ? 'Finance workflow activated because the purchase includes a bond component.' : 'Cash purchase only.',
    },
    buyerDocumentCollection: {
      enabled: true,
      reason: 'Buyer document collection is active because compliance and transaction documents are required.',
    },
    bondOriginator: {
      enabled: bondOriginatorRequired,
      reason: bondOriginatorRequired ? 'Bond originator support requested or already active.' : 'No bond-originator assistance selected.',
    },
  }

  const documentDefinitions = uniqueByKey([
    ...getSaleAndTransferDocuments({ reservationRequired }),
    ...getPurchaserDocumentDefinitions(purchaserType, formData),
    ...getFinanceDocumentDefinitions(formData, financeType),
  ])

  const requiredDocuments = documentDefinitions.map((item, index) =>
    toDocument(
      {
        ...item,
        expectedFromRole: item.expectedFromRole || 'client',
        defaultVisibility: item.defaultVisibility || 'client',
        allowMultiple: item.allowMultiple || false,
      },
      index,
    ),
  )

  const summaryLines = [
    `Purchaser type: ${getPurchaserTypeLabel(purchaserType)}`,
    `Finance type: ${financeType === 'combination' ? 'Hybrid (bond + cash)' : financeType === 'bond' ? 'Bond' : 'Cash'}`,
    ...(naturalPersonPurchase && hasBondComponent && employmentType
      ? [`Employment type: ${getEmploymentTypeLabel(employmentType)}`]
      : []),
    ...(purchaserType === 'trust' ? [`Trustees captured: ${trustees.length || 0}`] : []),
    ...(purchaserType === 'company' ? [`Directors captured: ${directors.length || 0}`] : []),
    ...(isYes(formData.ooba_assist_requested) ? ['OOBA assistance requested: Yes'] : []),
    `Required document sets: ${[...new Set(requiredDocuments.map((item) => item.groupLabel))].join(', ')}`,
    `Finance workflow: ${workflows.finance.enabled ? 'Enabled' : 'Skipped'}`,
    `Transfer workflow: Enabled`,
    `Special flags: ${flags.length ? flags.map((item) => item.label).join(', ') : 'None'}`,
  ]

  return {
    purchaserType,
    purchaserTypeLabel: getPurchaserTypeLabel(purchaserType),
    transactionPurchaserType,
    financeType,
    purchasePrice,
    cashAmount,
    bondAmount,
    depositAmount,
    reservationRequired,
    fundingSources,
    parties,
    requiredDocuments,
    workflows,
    flags,
    summary: {
      headlineItems: [
        { label: 'Purchaser Type', value: getPurchaserTypeLabel(purchaserType) },
        { label: 'Finance Type', value: financeType === 'combination' ? 'Hybrid (bond + cash)' : financeType === 'bond' ? 'Bond' : 'Cash' },
        ...(naturalPersonPurchase && hasBondComponent && employmentType
          ? [{ label: 'Employment Type', value: getEmploymentTypeLabel(employmentType) }]
          : []),
        { label: 'Parties Captured', value: String(parties.length) },
        { label: 'Document Sets', value: String([...new Set(requiredDocuments.map((item) => item.groupLabel))].length) },
      ],
      lines: summaryLines,
    },
    derivedFields: {
      purchaser_type: purchaserType,
      transaction_purchaser_type: transactionPurchaserType,
      marital_structure:
        purchaserType === 'married_coc'
          ? 'in_community'
          : purchaserType === 'married_anc_accrual'
            ? 'out_of_community_with_accrual'
            : purchaserType === 'married_anc'
              ? 'out_of_community'
              : purchaserType,
      finance_type: financeType,
      employment_type: employmentType || null,
      employment_complexity_score: employmentComplexityScore,
      has_bond_component: hasBondComponent,
      has_cash_component: hasCashComponent,
      needs_bond_originator: bondOriginatorRequired,
      requires_multiple_signatories: multipleSignatories,
      requires_spouse_fica: purchaserType === 'married_coc' || isYes(formData.spouse_is_co_purchaser) || isCoPurchasing(formData),
      requires_entity_documents: ['trust', 'company'].includes(purchaserType),
      requires_proof_of_funds: hasCashComponent,
      requires_bond_documents: hasBondComponent,
      buyer_party_count: parties.filter((item) => item.purchaser).length,
      signatory_count: parties.filter((item) => item.signatory).length,
    },
  }
}

function validateEmail(value, label) {
  if (!value) return
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())
  if (!valid) {
    throw new Error(`${label} must be a valid email address.`)
  }
}

function validatePhone(value, label) {
  if (!value) return
  const digits = String(value).replace(/\D/g, '')
  if (digits.length < 10) {
    throw new Error(`${label} must be a valid phone number.`)
  }
}

function validateIdLike(value, label) {
  if (!value) return
  const text = String(value).trim()
  if (text.length < 6) {
    throw new Error(`${label} looks incomplete.`)
  }
}

export function validateOnboardingSubmission(formData = {}, options = {}) {
  const purchaserType = resolvePurchaserTypeFromFormData(formData, {
    purchaserType: options.purchaserType,
    transaction: options.transaction,
  })
  const financeType = normalizeFinanceType(formData.purchase_finance_type || options.financeType || 'cash')
  const purchaserEntityType = String(formData.purchaser_entity_type || getPurchaserEntityType(purchaserType))
    .trim()
    .toLowerCase()
  const purchaserSnapshot = resolveStructuredPurchasers(formData, purchaserType)
  const finance = resolveStructuredFinance(formData, financeType)

  function requireField(value, label) {
    if (!isFilledValue(value)) {
      throw new Error(`${label} is required.`)
    }
  }

  function requireYesNo(value, label) {
    if (!['yes', 'no'].includes(normalizeYesNoChoice(value))) {
      throw new Error(`${label} is required.`)
    }
  }

  function validateEmailIfPresent(value, label) {
    if (!isFilledValue(value)) {
      return
    }
    validateEmail(value, label)
  }

  function validatePhoneIfPresent(value, label) {
    if (!isFilledValue(value)) {
      return
    }
    validatePhone(value, label)
  }

  function validateNaturalPurchaser(purchaser, index) {
    const buyerLabel = index === 0 ? 'Purchaser 1' : 'Purchaser 2'
    requireField(purchaser.first_name, `${buyerLabel} First Name`)
    requireField(purchaser.last_name, `${buyerLabel} Surname`)
    requireField(purchaser.date_of_birth, `${buyerLabel} Date of Birth`)
    if (purchaserEntityType === 'foreign_purchaser') {
      requireField(purchaser.passport_number, `${buyerLabel} Passport Number`)
    } else {
      requireField(purchaser.identity_number, `${buyerLabel} ID Number`)
      validateIdLike(purchaser.identity_number, `${buyerLabel} ID Number`)
    }
    requireField(purchaser.nationality, `${buyerLabel} Nationality`)
    requireField(purchaser.residency_status, `${buyerLabel} Residency Status`)
    requireField(purchaser.tax_number, `${buyerLabel} Tax Number`)
    requireField(purchaser.email, `${buyerLabel} Email`)
    validateEmailIfPresent(purchaser.email, `${buyerLabel} Email`)
    requireField(purchaser.phone, `${buyerLabel} Phone`)
    validatePhoneIfPresent(purchaser.phone, `${buyerLabel} Phone`)
    requireField(purchaser.street_address, `${buyerLabel} Street Address`)
    requireField(purchaser.suburb, `${buyerLabel} Suburb`)
    requireField(purchaser.city, `${buyerLabel} City`)
    requireField(purchaser.postal_code, `${buyerLabel} Postal Code`)
    requireField(purchaser.marital_status, `${buyerLabel} Marital Status`)
    requireField(purchaser.marital_regime, `${buyerLabel} Marital Regime`)

    if (String(purchaser.marital_status || '').trim().toLowerCase() === 'married') {
      requireField(purchaser.spouse_full_name, `${buyerLabel} Spouse Full Name`)
      requireField(purchaser.spouse_identity_number, `${buyerLabel} Spouse ID Number`)
      requireField(purchaser.spouse_email, `${buyerLabel} Spouse Email`)
      validateEmailIfPresent(purchaser.spouse_email, `${buyerLabel} Spouse Email`)
      requireField(purchaser.spouse_phone, `${buyerLabel} Spouse Phone`)
      validatePhoneIfPresent(purchaser.spouse_phone, `${buyerLabel} Spouse Phone`)
      requireYesNo(purchaser.spouse_is_co_purchaser, `${buyerLabel} Spouse Co-purchaser`)
    }

    requireField(purchaser.number_of_dependants, `${buyerLabel} Number of Dependants`)
    requireField(purchaser.monthly_credit_commitments, `${buyerLabel} Monthly Credit Commitments`)
    requireYesNo(purchaser.first_time_buyer, `${buyerLabel} First-time Buyer`)
    requireYesNo(purchaser.primary_residence, `${buyerLabel} Primary Residence`)
    requireYesNo(purchaser.investment_purchase, `${buyerLabel} Investment Purchase`)

    const requiresEmployment = financeType === 'bond' || financeType === 'combination'
    if (!requiresEmployment) {
      return
    }

    const employmentType = String(purchaser.employment_type || '')
      .trim()
      .toLowerCase()
    requireField(employmentType, `${buyerLabel} Employment Type`)

    if (employmentType === 'full_time') {
      requireField(purchaser.employer_name, `${buyerLabel} Employer Name`)
      requireField(purchaser.job_title, `${buyerLabel} Job Title`)
      requireField(purchaser.employment_start_date, `${buyerLabel} Employment Start Date`)
    }

    if (employmentType === 'self_employed') {
      requireField(purchaser.business_name, `${buyerLabel} Business Name`)
      requireField(purchaser.years_in_business, `${buyerLabel} Years in Business`)
    }

    if (['full_time', 'self_employed', 'retired', 'contract', 'other', 'commission'].includes(employmentType)) {
      requireField(purchaser.gross_monthly_income, `${buyerLabel} Gross Monthly Income`)
      requireField(purchaser.net_monthly_income, `${buyerLabel} Net Monthly Income`)
      requireField(purchaser.income_frequency, `${buyerLabel} Income Frequency`)
    }
  }

  if (isNaturalPersonPurchaserType(purchaserType)) {
    if (!['individual', 'co_purchasing'].includes(purchaserSnapshot.mode)) {
      throw new Error('Select whether you are purchasing alone or with a co-purchaser.')
    }
    if (!purchaserSnapshot.purchasers.length) {
      throw new Error('Purchaser details are required.')
    }

    validateNaturalPurchaser(purchaserSnapshot.purchasers[0], 0)
    if (purchaserSnapshot.mode === 'co_purchasing') {
      if (purchaserSnapshot.purchasers.length < 2) {
        throw new Error('Purchaser 2 details are required for co-purchasing.')
      }
      validateNaturalPurchaser(purchaserSnapshot.purchasers[1], 1)
    }
  } else if (purchaserType === 'company') {
    const company = {}
    COMPANY_VALIDATION_KEYS.forEach((key) => {
      company[key] = formData?.company?.[key] ?? formData[key] ?? ''
    })
    COMPANY_VALIDATION_KEYS.forEach((key) => {
      const label = key.replaceAll('_', ' ')
      requireField(company[key], label.charAt(0).toUpperCase() + label.slice(1))
    })
    validateEmailIfPresent(company.authorised_signatory_email, 'Authorised Signatory Email')
    validatePhoneIfPresent(company.authorised_signatory_phone, 'Authorised Signatory Phone')
    validateIdLike(company.authorised_signatory_identity_number, 'Authorised Signatory ID Number')
  } else if (purchaserType === 'trust') {
    const trust = {}
    TRUST_VALIDATION_KEYS.forEach((key) => {
      trust[key] = formData?.trust?.[key] ?? formData[key] ?? ''
    })
    TRUST_VALIDATION_KEYS.forEach((key) => {
      const label = key.replaceAll('_', ' ')
      requireField(trust[key], label.charAt(0).toUpperCase() + label.slice(1))
    })
    validateEmailIfPresent(trust.authorised_trustee_email, 'Authorised Trustee Email')
    validatePhoneIfPresent(trust.authorised_trustee_phone, 'Authorised Trustee Phone')
    validateIdLike(trust.authorised_trustee_identity_number, 'Authorised Trustee ID Number')
    requireYesNo(trust.trust_resolution_available, 'Trust Resolution Available')
  }

  const purchasePrice = normalizeNumber(finance.purchase_price)
  const cashAmount = normalizeNumber(finance.cash_amount)
  const bondAmount = normalizeNumber(finance.bond_amount)
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    throw new Error('Purchase Price is required.')
  }

  if (financeType === 'cash' && (!Number.isFinite(cashAmount) || cashAmount <= 0)) {
    throw new Error('Cash Amount is required for a cash purchase.')
  }

  if (financeType === 'bond' && (!Number.isFinite(bondAmount) || bondAmount <= 0)) {
    throw new Error('Bond Amount is required for a bond purchase.')
  }

  if (financeType === 'combination') {
    if (!Number.isFinite(cashAmount) || cashAmount <= 0 || !Number.isFinite(bondAmount) || bondAmount <= 0) {
      throw new Error('Both cash amount and bond amount are required for a hybrid purchase.')
    }
    if (Math.abs(cashAmount + bondAmount - purchasePrice) > 1) {
      throw new Error('For a hybrid purchase, cash amount plus bond amount must equal the purchase price.')
    }
  }

  if (financeType === 'bond' || financeType === 'combination') {
    requireField(finance.bond_bank_name, 'Bond Bank Name')
    requireField(finance.bond_current_status, 'Bond Current Status')
    requireYesNo(finance.bond_process_started, 'Bond Process Started')
    requireYesNo(finance.bond_help_requested || finance.ooba_assist_requested, 'Bond Help Requested')
    requireYesNo(finance.joint_bond_application, 'Joint Bond Application')
  }

  if (purchaserType === 'foreign_purchaser' && (financeType === 'cash' || financeType === 'combination')) {
    requireField(finance.source_of_funds, 'Source of Funds')
  }
}

export function getOnboardingStepDefinitions(formData = {}, options = {}) {
  const purchaserType = resolvePurchaserTypeFromFormData(formData, {
    purchaserType: options.purchaserType || 'individual',
    transaction: options.transaction,
  })
  const financeType = normalizeFinanceType(formData.purchase_finance_type || options.financeType || 'cash')

  return [
    {
      key: 'intro',
      title: 'Transaction Context',
      description: 'This onboarding helps Bridge configure your purchase, document checklist, and the teams involved.',
    },
    {
      key: 'purchaser_entity',
      title: 'Who is buying this property?',
      description: 'Start by choosing the type of purchaser.',
    },
    {
      key: 'finance_type',
      title: 'How will this purchase be financed?',
      description: 'Choose the funding structure so the correct workflows and document sets can be activated.',
    },
    {
      key: 'details',
      title: 'Details',
      description: 'Provide purchaser, finance, and legal details needed to move your transaction forward.',
      sections: getVisibleOnboardingSections({ purchaserType, financeType, values: formData }),
    },
  ]
}

export function isOnboardingSummaryMetaKey(key) {
  return ONBOARDING_SUMMARY_META_KEYS.has(String(key || ''))
}

export function getRequiredDocumentsForPurchaserType(value, options = {}) {
  const config = deriveOnboardingConfiguration(
    {
      ...(options.formData || {}),
      purchaser_type: resolvePurchaserTypeFromFormData(options.formData || {}, {
        purchaserType: value,
        transaction: options.transaction,
      }),
      purchase_finance_type: options.financeType || options.formData?.purchase_finance_type,
      reservation_required: options.reservationRequired ?? options.formData?.reservation_required,
      cash_amount: options.cashAmount ?? options.formData?.cash_amount,
      bond_amount: options.bondAmount ?? options.formData?.bond_amount,
    },
    options,
  )

  return config.requiredDocuments
}

export function getDocumentRequirementMetadataMap(value, options = {}) {
  const docs = getRequiredDocumentsForPurchaserType(value, options)
  return docs.reduce((accumulator, item) => {
    accumulator[item.key] = {
      label: item.label,
      group: item.group,
      groupKey: item.groupKey,
      groupLabel: item.groupLabel,
      description: item.description,
      requirementLevel: item.requirementLevel || 'required',
      expectedFromRole: item.expectedFromRole,
      defaultVisibility: item.defaultVisibility,
      allowMultiple: item.allowMultiple,
      sortOrder: item.sortOrder,
      keywords: item.keywords,
    }
    return accumulator
  }, {})
}
