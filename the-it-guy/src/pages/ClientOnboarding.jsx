import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { normalizeFinanceType } from '../core/transactions/financeType'
import Button from '../components/ui/Button'
import {
  EMPLOYMENT_TYPE_OPTIONS,
  PURCHASER_ENTITY_OPTIONS,
  getOnboardingStepDefinitions,
  getPurchaserEntityType,
  normalizePurchaserType,
  resolvePurchaserTypeFromFormData,
  validateOnboardingSubmission,
} from '../lib/purchaserPersonas'
import {
  fetchClientOnboardingByToken,
  saveClientOnboardingDraft,
  submitClientOnboarding,
} from '../lib/api'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const SECTION_CARD_CLASS =
  'rounded-[26px] border border-[#dbe5ef] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.06)] md:p-6'
const INNER_PANEL_CLASS =
  'rounded-[20px] border border-[#dfe8f2] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] md:p-5'
const MUTED_TEXT_CLASS = 'text-sm leading-6 text-[#6b7d93]'
const DETAIL_FLOW_WRAP_CLASS =
  'mx-auto w-full max-w-[1120px] space-y-5'
const DETAIL_INPUT_CLASS =
  'w-full rounded-[12px] border border-[#d9e2ee] bg-white px-4 py-3 text-sm text-[#162334] outline-none transition duration-150 ease-out placeholder:text-[#8aa0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12'

const NATURAL_PURCHASER_MODE_OPTIONS = [
  {
    value: 'individual',
    title: 'Individual Purchaser',
    description: 'You are purchasing the unit alone',
  },
  {
    value: 'co_purchasing',
    title: 'Co-Purchasing',
    description: 'You are purchasing with another person',
  },
]

const RESIDENCY_STATUS_OPTIONS = [
  { value: '', label: 'Select status' },
  { value: 'sa_citizen', label: 'South African citizen' },
  { value: 'permanent_resident', label: 'Permanent resident' },
  { value: 'foreign_national', label: 'Foreign national / non-resident' },
]

const MARITAL_STATUS_OPTIONS = [
  { value: '', label: 'Select status' },
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
]

const MARITAL_REGIME_OPTIONS = [
  { value: '', label: 'Select regime' },
  { value: 'not_applicable', label: 'Not applicable' },
  { value: 'in_community', label: 'In community of property' },
  { value: 'out_of_community', label: 'Out of community of property' },
  { value: 'out_of_community_with_accrual', label: 'Out of community with accrual' },
]

const YES_NO_OPTIONS = [
  { value: '', label: 'Select option' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

const INCOME_FREQUENCY_OPTIONS = [
  { value: '', label: 'Select frequency' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'weekly', label: 'Weekly' },
]

const BOND_STATUS_OPTIONS = [
  { value: '', label: 'Select status' },
  { value: 'not_started', label: 'Not started' },
  { value: 'pre_approval_only', label: 'Pre-approval only' },
  { value: 'application_in_progress', label: 'Application in progress' },
  { value: 'submitted_to_banks', label: 'Submitted to banks' },
  { value: 'bond_approved', label: 'Bond approved' },
]

const PURCHASER_STRUCTURED_KEYS = [
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

const FINANCE_DETAIL_KEYS = [
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

const COMPANY_DETAIL_KEYS = [
  'company_name',
  'company_registration_number',
  'vat_number',
  'authorised_signatory_name',
  'authorised_signatory_identity_number',
  'authorised_signatory_email',
  'authorised_signatory_phone',
]

const TRUST_DETAIL_KEYS = [
  'trust_name',
  'trust_registration_number',
  'authorised_trustee_name',
  'authorised_trustee_identity_number',
  'authorised_trustee_email',
  'authorised_trustee_phone',
  'trust_resolution_available',
]

const NATURAL_PURCHASER_SECTIONS = [
  {
    key: 'personal_details',
    title: 'Personal Details',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true, placeholder: 'e.g. Ayanda' },
      { key: 'last_name', label: 'Surname', type: 'text', required: true, placeholder: 'e.g. Nkosi' },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
      {
        key: 'identity_number',
        label: 'South African ID Number',
        type: 'text',
        required: true,
        placeholder: 'e.g. 9001015009087',
        visibleWhen: ({ purchaserEntityType }) => purchaserEntityType !== 'foreign_purchaser',
      },
      {
        key: 'passport_number',
        label: 'Passport Number',
        type: 'text',
        required: true,
        placeholder: 'e.g. X1234567',
        visibleWhen: ({ purchaserEntityType }) => purchaserEntityType === 'foreign_purchaser',
      },
      { key: 'nationality', label: 'Nationality', type: 'text', required: true, placeholder: 'e.g. South African' },
      {
        key: 'residency_status',
        label: 'Citizenship / Residency Status',
        type: 'select',
        required: true,
        options: RESIDENCY_STATUS_OPTIONS,
      },
      { key: 'tax_number', label: 'Tax Number', type: 'text', required: true, placeholder: 'e.g. 9123456789' },
    ],
  },
  {
    key: 'contact_details',
    title: 'Contact Details',
    fields: [
      { key: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'name@email.com' },
      { key: 'phone', label: 'Mobile Number', type: 'tel', required: true, placeholder: '+27 82 000 0000' },
    ],
  },
  {
    key: 'residential_address',
    title: 'Residential Address',
    fields: [
      { key: 'street_address', label: 'Street Address', type: 'text', required: true, placeholder: '123 Main Road' },
      { key: 'suburb', label: 'Suburb', type: 'text', required: true, placeholder: 'Sandton' },
      { key: 'city', label: 'City', type: 'text', required: true, placeholder: 'Johannesburg' },
      { key: 'postal_code', label: 'Postal Code', type: 'text', required: true, placeholder: '2196' },
    ],
  },
  {
    key: 'marital_legal_status',
    title: 'Marital / Legal Status',
    fields: [
      { key: 'marital_status', label: 'Marital Status', type: 'select', required: true, options: MARITAL_STATUS_OPTIONS },
      { key: 'marital_regime', label: 'Marital Regime', type: 'select', required: true, options: MARITAL_REGIME_OPTIONS },
      {
        key: 'spouse_full_name',
        label: 'Spouse Full Name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Jamie Nkosi',
        visibleWhen: ({ purchaser }) => String(purchaser.marital_status || '').trim().toLowerCase() === 'married',
      },
      {
        key: 'spouse_identity_number',
        label: 'Spouse ID Number',
        type: 'text',
        required: true,
        placeholder: 'e.g. 9001015009087',
        visibleWhen: ({ purchaser }) => String(purchaser.marital_status || '').trim().toLowerCase() === 'married',
      },
      {
        key: 'spouse_email',
        label: 'Spouse Email Address',
        type: 'email',
        required: true,
        placeholder: 'spouse@email.com',
        visibleWhen: ({ purchaser }) => String(purchaser.marital_status || '').trim().toLowerCase() === 'married',
      },
      {
        key: 'spouse_phone',
        label: 'Spouse Contact Number',
        type: 'tel',
        required: true,
        placeholder: '+27 82 000 0000',
        visibleWhen: ({ purchaser }) => String(purchaser.marital_status || '').trim().toLowerCase() === 'married',
      },
      {
        key: 'spouse_is_co_purchaser',
        label: 'Is your spouse a co-purchaser?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
        visibleWhen: ({ purchaser }) => String(purchaser.marital_status || '').trim().toLowerCase() === 'married',
      },
    ],
  },
  {
    key: 'employment_income',
    title: 'Employment & Income',
    fields: [
      {
        key: 'employment_type',
        label: 'Employment Type',
        type: 'select',
        required: true,
        options: [{ value: '', label: 'Select type' }, ...EMPLOYMENT_TYPE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))],
        requiredWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
      },
      {
        key: 'employer_name',
        label: 'Employer Name',
        type: 'text',
        required: true,
        visibleWhen: ({ purchaser, financeType }) =>
          ['bond', 'combination'].includes(financeType) && String(purchaser.employment_type || '').trim().toLowerCase() === 'full_time',
      },
      {
        key: 'job_title',
        label: 'Job Title',
        type: 'text',
        required: true,
        visibleWhen: ({ purchaser, financeType }) =>
          ['bond', 'combination'].includes(financeType) && String(purchaser.employment_type || '').trim().toLowerCase() === 'full_time',
      },
      {
        key: 'employment_start_date',
        label: 'Employment Start Date',
        type: 'date',
        required: true,
        visibleWhen: ({ purchaser, financeType }) =>
          ['bond', 'combination'].includes(financeType) && String(purchaser.employment_type || '').trim().toLowerCase() === 'full_time',
      },
      {
        key: 'business_name',
        label: 'Business Name',
        type: 'text',
        required: true,
        visibleWhen: ({ purchaser, financeType }) =>
          ['bond', 'combination'].includes(financeType) && String(purchaser.employment_type || '').trim().toLowerCase() === 'self_employed',
      },
      {
        key: 'years_in_business',
        label: 'Years in Business',
        type: 'number',
        required: true,
        visibleWhen: ({ purchaser, financeType }) =>
          ['bond', 'combination'].includes(financeType) && String(purchaser.employment_type || '').trim().toLowerCase() === 'self_employed',
      },
      {
        key: 'gross_monthly_income',
        label: 'Gross Monthly Income',
        type: 'number',
        required: true,
        visibleWhen: ({ purchaser, financeType }) =>
          ['bond', 'combination'].includes(financeType) &&
          ['full_time', 'self_employed', 'retired', 'contract', 'other', 'commission'].includes(
            String(purchaser.employment_type || '').trim().toLowerCase(),
          ),
      },
      {
        key: 'net_monthly_income',
        label: 'Net Monthly Income',
        type: 'number',
        required: true,
        visibleWhen: ({ purchaser, financeType }) =>
          ['bond', 'combination'].includes(financeType) &&
          ['full_time', 'self_employed', 'retired', 'contract', 'other', 'commission'].includes(
            String(purchaser.employment_type || '').trim().toLowerCase(),
          ),
      },
      {
        key: 'income_frequency',
        label: 'Income Frequency',
        type: 'select',
        required: true,
        options: INCOME_FREQUENCY_OPTIONS,
        visibleWhen: ({ purchaser, financeType }) =>
          ['bond', 'combination'].includes(financeType) &&
          ['full_time', 'self_employed', 'retired', 'contract', 'other', 'commission'].includes(
            String(purchaser.employment_type || '').trim().toLowerCase(),
          ),
      },
    ],
  },
  {
    key: 'financial_snapshot',
    title: 'Financial Snapshot',
    fields: [
      { key: 'number_of_dependants', label: 'Number of Dependants', type: 'number', required: true },
      { key: 'monthly_credit_commitments', label: 'Monthly Credit Commitments', type: 'number', required: true },
      { key: 'first_time_buyer', label: 'First-time Buyer?', type: 'select', required: true, options: YES_NO_OPTIONS },
      { key: 'primary_residence', label: 'Primary Residence?', type: 'select', required: true, options: YES_NO_OPTIONS },
      { key: 'investment_purchase', label: 'Investment Purchase?', type: 'select', required: true, options: YES_NO_OPTIONS },
    ],
  },
]

const COMPANY_DETAIL_FIELDS = [
  { key: 'company_name', label: 'Company Name', type: 'text', required: true },
  { key: 'company_registration_number', label: 'Company Registration Number', type: 'text', required: true },
  { key: 'vat_number', label: 'VAT Number', type: 'text', required: false },
  { key: 'authorised_signatory_name', label: 'Authorised Signatory Name', type: 'text', required: true },
  {
    key: 'authorised_signatory_identity_number',
    label: 'Authorised Signatory ID Number',
    type: 'text',
    required: true,
  },
  { key: 'authorised_signatory_email', label: 'Authorised Signatory Email', type: 'email', required: true },
  { key: 'authorised_signatory_phone', label: 'Authorised Signatory Phone', type: 'tel', required: true },
]

const TRUST_DETAIL_FIELDS = [
  { key: 'trust_name', label: 'Trust Name', type: 'text', required: true },
  { key: 'trust_registration_number', label: 'Trust Registration Number', type: 'text', required: true },
  { key: 'authorised_trustee_name', label: 'Authorised Trustee Name', type: 'text', required: true },
  {
    key: 'authorised_trustee_identity_number',
    label: 'Authorised Trustee ID Number',
    type: 'text',
    required: true,
  },
  { key: 'authorised_trustee_email', label: 'Authorised Trustee Email', type: 'email', required: true },
  { key: 'authorised_trustee_phone', label: 'Authorised Trustee Phone', type: 'tel', required: true },
  { key: 'trust_resolution_available', label: 'Trust Resolution Available?', type: 'select', required: true, options: YES_NO_OPTIONS },
]

const FINANCE_DETAIL_FIELDS = [
  { key: 'purchase_price', label: 'Purchase Price', type: 'number', required: true },
  {
    key: 'cash_amount',
    label: 'Cash Amount',
    type: 'number',
    required: true,
    visibleWhen: ({ financeType }) => ['cash', 'combination'].includes(financeType),
  },
  {
    key: 'bond_amount',
    label: 'Bond Amount',
    type: 'number',
    required: true,
    visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
  },
  {
    key: 'bond_bank_name',
    label: 'Bond Bank Name',
    type: 'text',
    required: true,
    visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
  },
  {
    key: 'bond_current_status',
    label: 'Bond Current Status',
    type: 'select',
    required: true,
    options: BOND_STATUS_OPTIONS,
    visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
  },
  {
    key: 'bond_process_started',
    label: 'Bond Process Started?',
    type: 'select',
    required: true,
    options: YES_NO_OPTIONS,
    visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
  },
  {
    key: 'bond_help_requested',
    label: 'Need bond help / OOBA assist?',
    type: 'select',
    required: true,
    options: YES_NO_OPTIONS,
    visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
  },
  {
    key: 'joint_bond_application',
    label: 'Joint Bond Application?',
    type: 'select',
    required: true,
    options: YES_NO_OPTIONS,
    visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
  },
  {
    key: 'source_of_funds',
    label: 'Source of Funds',
    type: 'text',
    required: true,
    visibleWhen: ({ purchaserEntityType, financeType }) =>
      purchaserEntityType === 'foreign_purchaser' && ['cash', 'combination'].includes(financeType),
  },
]

const CLIENT_CONTROLLED_REMOVED_KEYS = new Set([
  'deposit_required',
  'deposit_amount',
  'deposit_source',
  'deposit_already_paid',
  'deposit_holder',
  'reservation_required',
  'reservation_amount',
  'reservation_status',
  'reservation_paid_date',
  'uses_representative',
  'representative_name',
  'representative_relationship',
  'representative_phone',
  'representative_email',
  'authority_document_available',
  'reservation_proof_document',
  'uses_representative',
])

function choiceCardClass(active) {
  return `h-full rounded-[20px] border px-5 py-5 text-left transition duration-150 ease-out ${
    active
      ? 'border-[#35546c] bg-[#f4f8fd] text-[#142132] shadow-[0_14px_30px_rgba(53,84,108,0.12)]'
      : 'border-[#dde4ee] bg-white text-[#142132] shadow-[0_12px_28px_rgba(15,23,42,0.04)] hover:border-[#c8d6e5] hover:bg-[#fbfdff]'
  }`
}

function chipChoiceClass(active) {
  return `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition duration-150 ease-out ${
    active
      ? 'border-[#35546c] bg-[#35546c] text-white'
      : 'border-[#d8e3ef] bg-white text-[#516277] hover:border-[#c4d4e5] hover:bg-[#f8fbff]'
  }`
}

function formatCurrency(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '—'
  }

  return currency.format(numeric)
}

function normalizeFundingSources(list = []) {
  if (!Array.isArray(list)) {
    return []
  }

  return list.map((item) => ({
    sourceType: item?.sourceType ?? item?.source_type ?? 'personal_account',
    amount: item?.amount ?? '',
    expectedPaymentDate: item?.expectedPaymentDate ?? item?.expected_payment_date ?? '',
    actualPaymentDate: item?.actualPaymentDate ?? item?.actual_payment_date ?? '',
    proofDocument: item?.proofDocument ?? item?.proof_document ?? '',
    status: item?.status || 'planned',
    notes: item?.notes || '',
  }))
}

function getCompactStepLabel(step) {
  switch (step?.key) {
    case 'intro':
      return 'Context'
    case 'purchaser_entity':
      return 'Buyer'
    case 'finance_type':
      return 'Finance'
    case 'details':
      return 'Details'
    default:
      return step?.title || 'Step'
  }
}

function isNaturalPersonEntityType(entityType) {
  const normalized = String(entityType || '')
    .trim()
    .toLowerCase()

  return normalized === 'individual' || normalized === 'foreign_purchaser'
}

function normalizeInputValue(value) {
  return String(value || '').trim()
}

function normalizeYesNoChoice(value) {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  const normalized = normalizeInputValue(value).toLowerCase()
  if (['yes', 'no'].includes(normalized)) {
    return normalized
  }
  return ''
}

function createEmptyPurchaser() {
  return {
    first_name: '',
    last_name: '',
    date_of_birth: '',
    identity_number: '',
    passport_number: '',
    nationality: '',
    residency_status: '',
    tax_number: '',
    email: '',
    phone: '',
    street_address: '',
    suburb: '',
    city: '',
    postal_code: '',
    marital_status: '',
    marital_regime: '',
    spouse_full_name: '',
    spouse_identity_number: '',
    spouse_email: '',
    spouse_phone: '',
    spouse_is_co_purchaser: '',
    employment_type: '',
    employer_name: '',
    job_title: '',
    employment_start_date: '',
    business_name: '',
    years_in_business: '',
    gross_monthly_income: '',
    net_monthly_income: '',
    income_frequency: '',
    number_of_dependants: '',
    monthly_credit_commitments: '',
    first_time_buyer: '',
    primary_residence: '',
    investment_purchase: '',
  }
}

function createEmptyFinance() {
  return {
    purchase_price: '',
    cash_amount: '',
    bond_amount: '',
    bond_bank_name: '',
    bond_current_status: '',
    bond_process_started: '',
    bond_help_requested: '',
    ooba_assist_requested: '',
    joint_bond_application: '',
    source_of_funds: '',
  }
}

function createEmptyCompany() {
  return {
    company_name: '',
    company_registration_number: '',
    vat_number: '',
    authorised_signatory_name: '',
    authorised_signatory_identity_number: '',
    authorised_signatory_email: '',
    authorised_signatory_phone: '',
  }
}

function createEmptyTrust() {
  return {
    trust_name: '',
    trust_registration_number: '',
    authorised_trustee_name: '',
    authorised_trustee_identity_number: '',
    authorised_trustee_email: '',
    authorised_trustee_phone: '',
    trust_resolution_available: '',
  }
}

function hasPurchaserData(entry = {}) {
  return PURCHASER_STRUCTURED_KEYS.some((key) => normalizeInputValue(entry?.[key]).length > 0)
}

function normalizePurchaserRecord(record = {}) {
  const normalized = createEmptyPurchaser()
  PURCHASER_STRUCTURED_KEYS.forEach((key) => {
    if (key === 'spouse_is_co_purchaser' || key === 'first_time_buyer' || key === 'primary_residence' || key === 'investment_purchase') {
      normalized[key] = normalizeYesNoChoice(record?.[key])
      return
    }
    normalized[key] = record?.[key] ?? ''
  })

  const legacySpouseId = record?.spouse_id_number ?? ''
  if (!normalizeInputValue(normalized.spouse_identity_number) && normalizeInputValue(legacySpouseId)) {
    normalized.spouse_identity_number = legacySpouseId
  }

  if (!normalizeInputValue(normalized.street_address) && normalizeInputValue(record?.residential_address)) {
    normalized.street_address = record.residential_address
  }

  return normalized
}

function getPurchaserFromLegacyFields(formData = {}, prefix = '') {
  const legacy = {}
  PURCHASER_STRUCTURED_KEYS.forEach((key) => {
    legacy[key] = formData[`${prefix}${key}`]
  })
  legacy.spouse_id_number = formData[`${prefix}spouse_id_number`]
  legacy.residential_address = formData[`${prefix}residential_address`]
  return normalizePurchaserRecord(legacy)
}

function normalizeDetailsState(formData = {}, { purchaserEntityType, financeType }) {
  const structuredPurchasers = Array.isArray(formData.purchasers) ? formData.purchasers.map((item) => normalizePurchaserRecord(item)) : []
  const legacyPrimary = getPurchaserFromLegacyFields(formData, '')
  const legacySecondary = getPurchaserFromLegacyFields(formData, 'co_')
  const primaryPurchaser = normalizePurchaserRecord(structuredPurchasers[0] || legacyPrimary)
  const secondaryPurchaser = normalizePurchaserRecord(structuredPurchasers[1] || legacySecondary)

  const modeCandidate = normalizeInputValue(formData?.purchaser?.natural_person_purchase_mode || formData.natural_person_purchase_mode).toLowerCase()
  const inferredMode =
    modeCandidate === 'co_purchasing'
      ? 'co_purchasing'
      : hasPurchaserData(secondaryPurchaser)
        ? 'co_purchasing'
        : 'individual'
  const naturalMode = isNaturalPersonEntityType(purchaserEntityType) ? inferredMode : 'individual'

  const finance = {
    ...createEmptyFinance(),
    ...(formData.finance || {}),
  }
  FINANCE_DETAIL_KEYS.forEach((key) => {
    if (normalizeInputValue(finance[key]).length) {
      return
    }
    const fallbackValue = formData[key]
    if (fallbackValue !== undefined && fallbackValue !== null) {
      finance[key] = fallbackValue
    }
  })
  if (!normalizeInputValue(finance.bond_help_requested)) {
    finance.bond_help_requested = normalizeYesNoChoice(formData.bond_help_requested || formData.ooba_assist_requested || finance.ooba_assist_requested)
  }
  finance.ooba_assist_requested = normalizeYesNoChoice(finance.ooba_assist_requested || finance.bond_help_requested)

  const company = {
    ...createEmptyCompany(),
    ...(formData.company || {}),
  }
  COMPANY_DETAIL_KEYS.forEach((key) => {
    if (normalizeInputValue(company[key]).length) return
    if (formData[key] !== undefined && formData[key] !== null) {
      company[key] = formData[key]
    }
  })

  const trust = {
    ...createEmptyTrust(),
    ...(formData.trust || {}),
  }
  TRUST_DETAIL_KEYS.forEach((key) => {
    if (normalizeInputValue(trust[key]).length) return
    if (formData[key] !== undefined && formData[key] !== null) {
      trust[key] = formData[key]
    }
  })
  trust.trust_resolution_available = normalizeYesNoChoice(trust.trust_resolution_available)

  const normalizedFinanceType = normalizeFinanceType(formData.purchase_finance_type || financeType || 'cash')
  const activePurchasers = isNaturalPersonEntityType(purchaserEntityType)
    ? naturalMode === 'co_purchasing'
      ? [primaryPurchaser, secondaryPurchaser]
      : [primaryPurchaser]
    : []

  return {
    purchasers: activePurchasers,
    naturalPersonPurchaseMode: naturalMode,
    finance,
    company,
    trust,
    financeType: normalizedFinanceType,
  }
}

function setFlatPurchaserFields(target, purchaser, prefix = '') {
  if (!purchaser) return
  PURCHASER_STRUCTURED_KEYS.forEach((key) => {
    target[`${prefix}${key}`] = purchaser[key] ?? ''
  })
  target[`${prefix}spouse_id_number`] = purchaser.spouse_identity_number ?? ''
  target[`${prefix}residential_address`] = purchaser.street_address ?? ''
}

function stripFlatPurchaserFields(target) {
  PURCHASER_STRUCTURED_KEYS.forEach((key) => {
    delete target[key]
    delete target[`co_${key}`]
  })
  delete target.spouse_id_number
  delete target.co_spouse_id_number
  delete target.residential_address
  delete target.co_residential_address
}

function sanitizeClientFormData(formData = {}, { purchaserType, financeType, fundingSources }) {
  const cleaned = {}

  Object.entries(formData).forEach(([key, value]) => {
    if (!CLIENT_CONTROLLED_REMOVED_KEYS.has(key)) {
      cleaned[key] = value
    }
  })

  cleaned.purchaser_type = purchaserType
  cleaned.purchase_finance_type = financeType
  cleaned.funding_sources = fundingSources

  const purchaserEntityType = String(cleaned.purchaser_entity_type || getPurchaserEntityType(purchaserType)).trim().toLowerCase()
  const normalized = normalizeDetailsState(cleaned, { purchaserEntityType, financeType })
  const naturalMode = normalized.naturalPersonPurchaseMode

  cleaned.purchaser = {
    purchaser_entity_type: purchaserEntityType,
    natural_person_purchase_mode: isNaturalPersonEntityType(purchaserEntityType) ? naturalMode : null,
  }
  cleaned.natural_person_purchase_mode = naturalMode
  cleaned.finance = {
    ...normalized.finance,
    purchase_finance_type: financeType,
  }
  cleaned.purchase_finance_type = financeType

  FINANCE_DETAIL_KEYS.forEach((key) => {
    cleaned[key] = cleaned.finance[key] ?? ''
  })
  cleaned.bond_help_requested = normalizeYesNoChoice(cleaned.finance.bond_help_requested)
  cleaned.ooba_assist_requested = normalizeYesNoChoice(cleaned.bond_help_requested || cleaned.finance.ooba_assist_requested)

  stripFlatPurchaserFields(cleaned)
  delete cleaned.purchasers
  delete cleaned.company
  delete cleaned.trust

  if (isNaturalPersonEntityType(purchaserEntityType)) {
    const purchaserCount = naturalMode === 'co_purchasing' ? 2 : 1
    cleaned.purchasers = normalized.purchasers.slice(0, purchaserCount)
    setFlatPurchaserFields(cleaned, cleaned.purchasers[0], '')
    if (purchaserCount === 2) {
      setFlatPurchaserFields(cleaned, cleaned.purchasers[1], 'co_')
    }
    if (purchaserCount < 2) {
      PURCHASER_STRUCTURED_KEYS.forEach((key) => {
        delete cleaned[`co_${key}`]
      })
      delete cleaned.co_spouse_id_number
      delete cleaned.co_residential_address
    }
  } else if (purchaserEntityType === 'company') {
    cleaned.company = { ...createEmptyCompany(), ...normalized.company }
    COMPANY_DETAIL_KEYS.forEach((key) => {
      cleaned[key] = cleaned.company[key] ?? ''
    })
    TRUST_DETAIL_KEYS.forEach((key) => {
      delete cleaned[key]
    })
  } else if (purchaserEntityType === 'trust') {
    cleaned.trust = { ...createEmptyTrust(), ...normalized.trust }
    TRUST_DETAIL_KEYS.forEach((key) => {
      cleaned[key] = cleaned.trust[key] ?? ''
    })
    COMPANY_DETAIL_KEYS.forEach((key) => {
      delete cleaned[key]
    })
  }

  if (financeType === 'cash') {
    cleaned.bond_amount = ''
    cleaned.bond_bank_name = ''
    cleaned.bond_current_status = ''
    cleaned.bond_process_started = ''
    cleaned.bond_help_requested = ''
    cleaned.ooba_assist_requested = ''
    cleaned.joint_bond_application = ''
    cleaned.finance.bond_amount = ''
    cleaned.finance.bond_bank_name = ''
    cleaned.finance.bond_current_status = ''
    cleaned.finance.bond_process_started = ''
    cleaned.finance.bond_help_requested = ''
    cleaned.finance.ooba_assist_requested = ''
    cleaned.finance.joint_bond_application = ''
  }

  return cleaned
}

function ClientOnboarding() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState(null)
  const [formData, setFormData] = useState({})
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [completionBannerVisible, setCompletionBannerVisible] = useState(false)
  const [welcomeAcknowledged, setWelcomeAcknowledged] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [touchedFields, setTouchedFields] = useState({})

  const loadData = useCallback(async () => {
    if (!token) {
      setError('Missing onboarding token.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = await fetchClientOnboardingByToken(token)
      const initialPurchaserType = normalizePurchaserType(data.formData?.purchaser_type || data.purchaserType)
      const initialPurchaserEntityType = String(
        data.formData?.purchaser_entity_type || getPurchaserEntityType(initialPurchaserType),
      )
        .trim()
        .toLowerCase()
      const initialFinanceType = normalizeFinanceType(data.formData?.purchase_finance_type || data.transaction?.finance_type || 'cash')
      const normalizedDetails = normalizeDetailsState(data.formData || {}, {
        purchaserEntityType: initialPurchaserEntityType,
        financeType: initialFinanceType,
      })
      setPayload(data)
      setFormData({
        ...(data.formData || {}),
        purchaser_type: initialPurchaserType,
        purchaser_entity_type: initialPurchaserEntityType,
        natural_person_purchase_mode: normalizedDetails.naturalPersonPurchaseMode,
        purchasers: normalizedDetails.purchasers,
        finance: normalizedDetails.finance,
        company: normalizedDetails.company,
        trust: normalizedDetails.trust,
        purchase_finance_type: initialFinanceType,
        funding_sources: normalizeFundingSources(data.formData?.funding_sources || data.fundingSources || []),
      })
      setCompletionBannerVisible(data?.onboarding?.status === 'Submitted')
      setWelcomeAcknowledged((previous) => previous || data?.onboarding?.status === 'Submitted')
      setFieldErrors({})
      setTouchedFields({})
    } catch (loadError) {
      setError(loadError.message || 'Unable to load onboarding form.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const purchaserType = resolvePurchaserTypeFromFormData(formData, {
    purchaserType: payload?.purchaserType || payload?.transaction?.purchaser_type || 'individual',
    transaction: payload?.transaction,
  })
  const purchaserEntityType = String(formData.purchaser_entity_type || getPurchaserEntityType(purchaserType)).trim().toLowerCase()
  const isNaturalPersonPurchase = isNaturalPersonEntityType(purchaserEntityType)
  const normalizedFinanceType = normalizeFinanceType(
    formData.purchase_finance_type || payload?.transaction?.finance_type || 'cash',
  )
  const detailsState = useMemo(
    () =>
      normalizeDetailsState(formData, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      }),
    [formData, purchaserEntityType, normalizedFinanceType],
  )
  const naturalPersonPurchaseMode = detailsState.naturalPersonPurchaseMode
  const structuredPurchasers = detailsState.purchasers
  const structuredFinance = detailsState.finance
  const structuredCompany = detailsState.company
  const structuredTrust = detailsState.trust
  const buyerDisplayName = String(payload?.buyer?.name || '').trim() || 'Client'
  const propertyAddressLine = String(
    payload?.unit?.address ||
      payload?.transaction?.property_address ||
      payload?.transaction?.propertyAddress ||
      '',
  ).trim()
  const onboardingLocationLabel = propertyAddressLine
    ? propertyAddressLine
    : [payload?.unit?.development?.name, payload?.unit?.unit_number ? `Unit ${payload.unit.unit_number}` : '']
        .filter(Boolean)
        .join(' | ')
  const purchasePrice =
    structuredFinance.purchase_price || formData.purchase_price || payload?.transaction?.purchase_price || payload?.transaction?.sales_price
  const fundingSources = normalizeFundingSources(formData.funding_sources || payload?.fundingSources || [])
  const stepDefinitions = useMemo(
    () =>
      getOnboardingStepDefinitions({ ...formData, funding_sources: fundingSources }, { transaction: payload?.transaction }).filter(
        (step) => step.key !== 'intro',
      ),
    [formData, fundingSources, payload?.transaction],
  )
  const activeStep = stepDefinitions[activeStepIndex] || stepDefinitions[0]
  const stepGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${Math.max(stepDefinitions.length, 1)}, minmax(0, 1fr))`,
      minWidth: stepDefinitions.length > 6 ? `${stepDefinitions.length * 150}px` : '100%',
    }),
    [stepDefinitions.length],
  )
  const stepCompletionPercent = stepDefinitions.length
    ? Math.round(((activeStepIndex + 1) / stepDefinitions.length) * 100)
    : 0
  const submissionComplete = completionBannerVisible || payload?.onboarding?.status === 'Submitted'
  const isLastStep = activeStepIndex >= Math.max(stepDefinitions.length - 1, 0)

  useEffect(() => {
    if (!stepDefinitions.length) {
      setActiveStepIndex(0)
      return
    }

    setActiveStepIndex((previous) => Math.min(previous, stepDefinitions.length - 1))
  }, [stepDefinitions.length])

  function updatePurchaserEntityType(nextEntityType) {
    setFormData((previous) => {
      const next = {
        ...previous,
        purchaser_entity_type: nextEntityType,
      }
      const normalized = normalizeDetailsState(next, {
        purchaserEntityType: nextEntityType,
        financeType: normalizeFinanceType(next.purchase_finance_type || normalizedFinanceType || 'cash'),
      })
      return {
        ...next,
        natural_person_purchase_mode: normalized.naturalPersonPurchaseMode,
        purchasers: normalized.purchasers,
        finance: normalized.finance,
        company: normalized.company,
        trust: normalized.trust,
      }
    })
  }

  function updateFinanceType(nextFinanceType) {
    setFormData((previous) => {
      const normalizedType = normalizeFinanceType(nextFinanceType || 'cash')
      const next = {
        ...previous,
        purchase_finance_type: normalizedType,
      }
      const normalized = normalizeDetailsState(next, {
        purchaserEntityType: String(next.purchaser_entity_type || purchaserEntityType || 'individual')
          .trim()
          .toLowerCase(),
        financeType: normalizedType,
      })
      return {
        ...next,
        finance: normalized.finance,
      }
    })
  }

  function isDetailFieldVisible(fieldConfig, context) {
    if (typeof fieldConfig.visibleWhen === 'function') {
      return fieldConfig.visibleWhen(context)
    }
    return true
  }

  function detailFieldPath(group, index, fieldKey) {
    if (group === 'purchasers') {
      return `purchasers.${index}.${fieldKey}`
    }
    return `${group}.${fieldKey}`
  }

  function getVisibleNaturalFieldsForPurchaser(purchaser, purchaserIndex, purchaseMode, financeType, entityType) {
    if (purchaserIndex > 0 && purchaseMode !== 'co_purchasing') {
      return []
    }
    return NATURAL_PURCHASER_SECTIONS.flatMap((sectionConfig) =>
      sectionConfig.fields
        .filter((fieldConfig) =>
          isDetailFieldVisible(fieldConfig, {
            purchaser,
            purchaserIndex,
            financeType,
            purchaserEntityType: entityType,
            purchaseMode,
          }),
        )
        .map((fieldConfig) => detailFieldPath('purchasers', purchaserIndex, fieldConfig.key)),
    )
  }

  function getVisibleDetailFieldKeys(values = formData) {
    const details = normalizeDetailsState(values, {
      purchaserEntityType,
      financeType: normalizedFinanceType,
    })
    const keys = []

    if (isNaturalPersonPurchase) {
      keys.push('natural_person_purchase_mode')
      details.purchasers.forEach((purchaser, purchaserIndex) => {
        keys.push(
          ...getVisibleNaturalFieldsForPurchaser(
            purchaser,
            purchaserIndex,
            details.naturalPersonPurchaseMode,
            normalizedFinanceType,
            purchaserEntityType,
          ),
        )
      })
    }

    if (purchaserEntityType === 'company') {
      COMPANY_DETAIL_FIELDS.forEach((fieldConfig) => {
        keys.push(detailFieldPath('company', 0, fieldConfig.key))
      })
    }

    if (purchaserEntityType === 'trust') {
      TRUST_DETAIL_FIELDS.forEach((fieldConfig) => {
        keys.push(detailFieldPath('trust', 0, fieldConfig.key))
      })
    }

    FINANCE_DETAIL_FIELDS.filter((fieldConfig) =>
      isDetailFieldVisible(fieldConfig, {
        financeType: normalizedFinanceType,
        purchaserEntityType,
      }),
    ).forEach((fieldConfig) => {
      keys.push(detailFieldPath('finance', 0, fieldConfig.key))
    })

    return keys
  }

  const validateDetailsStep = useCallback((values) => {
    const details = normalizeDetailsState(values, {
      purchaserEntityType,
      financeType: normalizedFinanceType,
    })
    const nextErrors = {}

    function requireField(pathKey, label, value, options = {}) {
      const required = options.required !== false
      if (required && !normalizeInputValue(value)) {
        nextErrors[pathKey] = `${label} is required.`
        return
      }
      if (!normalizeInputValue(value)) {
        return
      }

      if (options.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())) {
        nextErrors[pathKey] = 'Enter a valid email address.'
      }

      if (options.type === 'tel') {
        const digits = String(value).replace(/\D/g, '')
        if (digits.length < 10) {
          nextErrors[pathKey] = 'Enter a valid phone number.'
        }
      }
    }

    if (isNaturalPersonPurchase) {
      if (!['individual', 'co_purchasing'].includes(details.naturalPersonPurchaseMode)) {
        nextErrors.natural_person_purchase_mode = 'Select whether you are purchasing alone or with a co-purchaser.'
      }

      details.purchasers.forEach((purchaser, purchaserIndex) => {
        NATURAL_PURCHASER_SECTIONS.forEach((sectionConfig) => {
          sectionConfig.fields.forEach((fieldConfig) => {
            const isVisible = isDetailFieldVisible(fieldConfig, {
              purchaser,
              purchaserIndex,
              financeType: normalizedFinanceType,
              purchaserEntityType,
              purchaseMode: details.naturalPersonPurchaseMode,
            })
            if (!isVisible) {
              return
            }
            const pathKey = detailFieldPath('purchasers', purchaserIndex, fieldConfig.key)
            const shouldRequire =
              (typeof fieldConfig.requiredWhen === 'function'
                ? fieldConfig.requiredWhen({ purchaser, financeType: normalizedFinanceType, purchaserEntityType })
                : fieldConfig.required) !== false
            requireField(pathKey, fieldConfig.label, purchaser[fieldConfig.key], {
              type: fieldConfig.type,
              required: shouldRequire,
            })
          })
        })
      })
    } else if (purchaserEntityType === 'company') {
      COMPANY_DETAIL_FIELDS.forEach((fieldConfig) => {
        const pathKey = detailFieldPath('company', 0, fieldConfig.key)
        requireField(pathKey, fieldConfig.label, details.company[fieldConfig.key], {
          type: fieldConfig.type,
          required: fieldConfig.required,
        })
      })
    } else if (purchaserEntityType === 'trust') {
      TRUST_DETAIL_FIELDS.forEach((fieldConfig) => {
        const pathKey = detailFieldPath('trust', 0, fieldConfig.key)
        requireField(pathKey, fieldConfig.label, details.trust[fieldConfig.key], {
          type: fieldConfig.type,
          required: fieldConfig.required,
        })
      })
    }

    FINANCE_DETAIL_FIELDS.forEach((fieldConfig) => {
      const isVisible = isDetailFieldVisible(fieldConfig, {
        financeType: normalizedFinanceType,
        purchaserEntityType,
      })
      if (!isVisible) {
        return
      }
      const pathKey = detailFieldPath('finance', 0, fieldConfig.key)
      requireField(pathKey, fieldConfig.label, details.finance[fieldConfig.key], {
        type: fieldConfig.type,
        required: fieldConfig.required,
      })
    })

    const purchasePrice = Number(details.finance.purchase_price || 0)
    const cashAmount = Number(details.finance.cash_amount || 0)
    const bondAmount = Number(details.finance.bond_amount || 0)
    if (normalizedFinanceType === 'combination' && Number.isFinite(purchasePrice) && purchasePrice > 0) {
      if (Math.abs(cashAmount + bondAmount - purchasePrice) > 1) {
        nextErrors['finance.cash_amount'] = 'For hybrid finance, cash and bond amounts must equal the purchase price.'
      }
    }

    return nextErrors
  }, [isNaturalPersonPurchase, normalizedFinanceType, purchaserEntityType])

  useEffect(() => {
    if (!Object.keys(touchedFields).length || activeStep?.key !== 'details') {
      return
    }
    setFieldErrors(validateDetailsStep(formData))
  }, [formData, touchedFields, activeStep?.key, validateDetailsStep])

  function updateNaturalPurchaseMode(value) {
    setFormData((previous) => {
      const normalizedMode = value === 'co_purchasing' ? 'co_purchasing' : 'individual'
      const details = normalizeDetailsState(
        {
          ...previous,
          natural_person_purchase_mode: normalizedMode,
        },
        {
          purchaserEntityType,
          financeType: normalizedFinanceType,
        },
      )
      return {
        ...previous,
        natural_person_purchase_mode: normalizedMode,
        purchasers: normalizedMode === 'co_purchasing' ? details.purchasers.slice(0, 2) : [details.purchasers[0] || createEmptyPurchaser()],
      }
    })
  }

  function updatePurchaserField(purchaserIndex, fieldKey, value) {
    setFormData((previous) => {
      const details = normalizeDetailsState(previous, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      })
      const nextPurchasers = [...details.purchasers]
      const current = { ...(nextPurchasers[purchaserIndex] || createEmptyPurchaser()) }
      current[fieldKey] = value

      if (fieldKey === 'marital_status' && String(value || '').trim().toLowerCase() !== 'married') {
        current.spouse_full_name = ''
        current.spouse_identity_number = ''
        current.spouse_email = ''
        current.spouse_phone = ''
        current.spouse_is_co_purchaser = ''
      }

      if (fieldKey === 'employment_type') {
        const employmentType = String(value || '').trim().toLowerCase()
        if (employmentType !== 'full_time') {
          current.employer_name = ''
          current.job_title = ''
          current.employment_start_date = ''
        }
        if (employmentType !== 'self_employed') {
          current.business_name = ''
          current.years_in_business = ''
        }
      }

      nextPurchasers[purchaserIndex] = current
      return {
        ...previous,
        purchasers: nextPurchasers,
      }
    })
  }

  function updateFinanceField(fieldKey, value) {
    setFormData((previous) => {
      const details = normalizeDetailsState(previous, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      })
      const nextFinance = {
        ...details.finance,
        [fieldKey]: value,
      }
      if (fieldKey === 'bond_help_requested') {
        nextFinance.ooba_assist_requested = normalizeYesNoChoice(value)
      }
      return {
        ...previous,
        finance: nextFinance,
      }
    })
  }

  function updateCompanyField(fieldKey, value) {
    setFormData((previous) => ({
      ...previous,
      company: {
        ...(previous.company || createEmptyCompany()),
        [fieldKey]: value,
      },
    }))
  }

  function updateTrustField(fieldKey, value) {
    setFormData((previous) => ({
      ...previous,
      trust: {
        ...(previous.trust || createEmptyTrust()),
        [fieldKey]: value,
      },
    }))
  }

  function markFieldTouched(fieldKey) {
    setTouchedFields((previous) => ({ ...previous, [fieldKey]: true }))
  }

  async function handleSaveDraft() {
    try {
      setSaving(true)
      setError('')
      const submissionData = sanitizeClientFormData(formData, {
        purchaserType,
        financeType: normalizedFinanceType,
        fundingSources,
      })
      await saveClientOnboardingDraft({
        token,
        formData: submissionData,
      })
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save draft.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    try {
      setSaving(true)
      setError('')
      const submissionData = sanitizeClientFormData(formData, {
        purchaserType,
        financeType: normalizedFinanceType,
        fundingSources,
      })
      validateOnboardingSubmission(
        submissionData,
        { transaction: payload?.transaction },
      )
      await submitClientOnboarding({
        token,
        formData: submissionData,
      })
      setCompletionBannerVisible(true)
      setWelcomeAcknowledged(true)
      await loadData()
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit onboarding.')
    } finally {
      setSaving(false)
    }
  }

  function validateCurrentStep() {
    try {
      setError('')

      if (activeStep?.key === 'purchaser_entity' && !purchaserEntityType) {
        throw new Error('Select who is buying this property to continue.')
      }

      if (activeStep?.key === 'finance_type' && !normalizedFinanceType) {
        throw new Error('Select the finance type to continue.')
      }

      if (activeStep?.key === 'details') {
        const detailsErrors = validateDetailsStep(formData)
        setFieldErrors(detailsErrors)

        const touched = getVisibleDetailFieldKeys(formData).reduce(
          (accumulator, key) => ({ ...accumulator, [key]: true }),
          isNaturalPersonPurchase ? { natural_person_purchase_mode: true } : {},
        )
        setTouchedFields((previous) => ({ ...previous, ...touched }))

        if (Object.keys(detailsErrors).length) {
          const firstError = Object.values(detailsErrors)[0]
          throw new Error(firstError || 'Please complete the required details before continuing.')
        }

        const submissionData = sanitizeClientFormData(formData, {
          purchaserType,
          financeType: normalizedFinanceType,
          fundingSources,
        })
        validateOnboardingSubmission(
          submissionData,
          { transaction: payload?.transaction },
        )
      }

      return true
    } catch (validationError) {
      setError(validationError.message || 'Please complete the required fields before continuing.')
      return false
    }
  }

  function handleNextStep() {
    if (!validateCurrentStep()) {
      return
    }

    setActiveStepIndex((previous) => Math.min(previous + 1, stepDefinitions.length - 1))
  }

  function handlePreviousStep() {
    setActiveStepIndex((previous) => Math.max(previous - 1, 0))
  }

  function renderDetailField({
    fieldConfig,
    value,
    fieldPath,
    onChange,
    onBlur,
    className = '',
  }) {
    const errorMessage = fieldErrors[fieldPath]
    const fieldTouched = Boolean(touchedFields[fieldPath])
    const showError = Boolean(errorMessage && fieldTouched)
    const hasValue = normalizeInputValue(value).length > 0
    const showSuccess = fieldTouched && !showError && hasValue
    const baseInputClass = `${DETAIL_INPUT_CLASS} ${
      showError
        ? 'border-[#d92d20] focus:border-[#d92d20] focus:ring-[#d92d20]/12'
        : showSuccess
          ? 'border-[#1f9d61]/45 focus:border-[#1f9d61] focus:ring-[#1f9d61]/12'
          : ''
    }`

    return (
      <label key={fieldPath} className={`flex flex-col gap-1.5 text-sm font-medium text-[#233247] ${className}`}>
        <span className="text-[0.86rem]">
          {fieldConfig.label}
          {fieldConfig.required ? <span className="ml-1 text-[#d92d20]">*</span> : null}
        </span>
        {fieldConfig.type === 'select' ? (
          <select
            className={baseInputClass}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
          >
            {(fieldConfig.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : fieldConfig.type === 'textarea' ? (
          <textarea
            className={`${baseInputClass} min-h-[100px] resize-y`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            placeholder={fieldConfig.placeholder || ''}
          />
        ) : (
          <input
            className={baseInputClass}
            type={fieldConfig.type || 'text'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            placeholder={fieldConfig.placeholder || ''}
          />
        )}
        {showError ? <span className="text-xs font-medium text-[#d92d20]">{errorMessage}</span> : null}
        {showSuccess ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1f9d61]">
            <CheckCircle2 size={12} /> Looks good
          </span>
        ) : null}
      </label>
    )
  }

  function renderNaturalPurchaserCard(purchaser, purchaserIndex) {
    return (
      <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)] md:p-6">
        <header className="mb-5 border-b border-[#edf2f7] pb-4">
          <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Purchaser {purchaserIndex + 1} Details</h4>
        </header>
        <div className="space-y-5">
          {NATURAL_PURCHASER_SECTIONS.map((sectionConfig) => {
            const visibleFields = sectionConfig.fields.filter((fieldConfig) =>
              isDetailFieldVisible(fieldConfig, {
                purchaser,
                purchaserIndex,
                financeType: normalizedFinanceType,
                purchaserEntityType,
                purchaseMode: naturalPersonPurchaseMode,
              }),
            )
            if (!visibleFields.length) {
              return null
            }
            return (
              <section key={`${sectionConfig.key}-${purchaserIndex}`} className="space-y-3">
                <h5 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#5f7590]">{sectionConfig.title}</h5>
                <div className="grid gap-3 md:grid-cols-2">
                  {visibleFields.map((fieldConfig) => {
                    const fieldPath = detailFieldPath('purchasers', purchaserIndex, fieldConfig.key)
                    const value = purchaser[fieldConfig.key] ?? ''
                    return renderDetailField({
                      fieldConfig,
                      value,
                      fieldPath,
                      onChange: (nextValue) => updatePurchaserField(purchaserIndex, fieldConfig.key, nextValue),
                      onBlur: () => markFieldTouched(fieldPath),
                    })
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </article>
    )
  }

  function renderFinanceDetailsCard() {
    const visibleFinanceFields = FINANCE_DETAIL_FIELDS.filter((fieldConfig) =>
      isDetailFieldVisible(fieldConfig, {
        financeType: normalizedFinanceType,
        purchaserEntityType,
      }),
    )
    return (
      <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)] md:p-6">
        <header className="mb-5 border-b border-[#edf2f7] pb-4">
          <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Finance Details</h4>
        </header>
        <div className="grid gap-3 md:grid-cols-2">
          {visibleFinanceFields.map((fieldConfig) => {
            const fieldPath = detailFieldPath('finance', 0, fieldConfig.key)
            const value = structuredFinance[fieldConfig.key] ?? ''
            return renderDetailField({
              fieldConfig,
              value,
              fieldPath,
              onChange: (nextValue) => updateFinanceField(fieldConfig.key, nextValue),
              onBlur: () => markFieldTouched(fieldPath),
            })
          })}
        </div>
      </article>
    )
  }

  function renderCompanyOrTrustDetailsCard() {
    const fields = purchaserEntityType === 'company' ? COMPANY_DETAIL_FIELDS : TRUST_DETAIL_FIELDS
    const entityKey = purchaserEntityType === 'company' ? 'company' : 'trust'
    const entityState = purchaserEntityType === 'company' ? structuredCompany : structuredTrust
    const updateEntityField = purchaserEntityType === 'company' ? updateCompanyField : updateTrustField
    const title = purchaserEntityType === 'company' ? 'Company Details' : 'Trust Details'

    return (
      <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)] md:p-6">
        <header className="mb-5 border-b border-[#edf2f7] pb-4">
          <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">{title}</h4>
        </header>
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map((fieldConfig) => {
            const fieldPath = detailFieldPath(entityKey, 0, fieldConfig.key)
            const value = entityState[fieldConfig.key] ?? ''
            return renderDetailField({
              fieldConfig,
              value,
              fieldPath,
              onChange: (nextValue) => updateEntityField(fieldConfig.key, nextValue),
              onBlur: () => markFieldTouched(fieldPath),
            })
          })}
        </div>
      </article>
    )
  }

  function renderDetailsStep() {
    const modeError = fieldErrors.natural_person_purchase_mode
    const showModeError = Boolean(modeError && touchedFields.natural_person_purchase_mode)
    const isCoPurchasingSelected = naturalPersonPurchaseMode === 'co_purchasing'

    if (isNaturalPersonPurchase) {
      return (
        <div className={`${DETAIL_FLOW_WRAP_CLASS} xl:grid xl:grid-cols-2 xl:gap-5 xl:space-y-0`}>
          <section className="rounded-[20px] border border-[#e2eaf3] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)] md:p-6 xl:col-span-2">
            <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">
              Are you purchasing this unit alone or with a co-purchaser?
            </h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {NATURAL_PURCHASER_MODE_OPTIONS.map((option) => {
                const active = naturalPersonPurchaseMode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`w-full rounded-[16px] border px-4 py-4 text-left transition duration-150 ease-out ${
                      active
                        ? 'border-[#35546c] bg-[#f3f8ff] shadow-[0_10px_24px_rgba(53,84,108,0.14)]'
                        : 'border-[#dbe5ef] bg-white hover:border-[#b6c9de] hover:bg-[#fafcff]'
                    }`}
                    onClick={() => {
                      markFieldTouched('natural_person_purchase_mode')
                      updateNaturalPurchaseMode(option.value)
                    }}
                  >
                    <strong className="block text-sm font-semibold text-[#142132]">{option.title}</strong>
                    <span className="mt-1 block text-sm leading-6 text-[#6b7d93]">{option.description}</span>
                  </button>
                )
              })}
            </div>
            {showModeError ? <p className="mt-3 text-xs font-medium text-[#d92d20]">{modeError}</p> : null}
          </section>

          {structuredPurchasers[0] ? (
            <div className={isCoPurchasingSelected ? '' : 'xl:col-span-2'}>{renderNaturalPurchaserCard(structuredPurchasers[0], 0)}</div>
          ) : null}

          {isCoPurchasingSelected && structuredPurchasers[1] ? (
            <div>{renderNaturalPurchaserCard(structuredPurchasers[1], 1)}</div>
          ) : null}

          <div className="xl:col-span-2">{renderFinanceDetailsCard()}</div>
        </div>
      )
    }

    return (
      <div className={`${DETAIL_FLOW_WRAP_CLASS} xl:grid xl:grid-cols-2 xl:gap-5 xl:space-y-0`}>
        <div>{renderCompanyOrTrustDetailsCard()}</div>
        <div>{renderFinanceDetailsCard()}</div>
      </div>
    )
  }

  function renderActiveStepBody() {
    if (!activeStep) {
      return null
    }

    if (activeStep.key === 'intro') {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <section className={INNER_PANEL_CLASS}>
            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Development</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{payload.unit?.development?.name || '—'}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Unit</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{payload.unit?.unit_number || '—'}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Purchaser</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{payload.buyer?.name || '—'}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Purchase Price</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{formatCurrency(purchasePrice)}</strong>
              </article>
            </div>
          </section>

          <section className={INNER_PANEL_CLASS}>
            <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">What this form is for</h4>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[#516277]">
              <li>Collects the purchaser and finance information needed to prepare the sale agreement correctly.</li>
              <li>Helps the team identify which documents must later appear in your client portal.</li>
              <li>Captures the correct legal buying structure from the start.</li>
              <li>Keeps this step focused on information capture only, without asking for supporting documents yet.</li>
            </ul>
          </section>
        </div>
      )
    }

    if (activeStep.key === 'purchaser_entity') {
      return (
        <section className={INNER_PANEL_CLASS}>
          <p className={MUTED_TEXT_CLASS}>Choose the purchaser type first. We will only ask the questions relevant to that structure.</p>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {PURCHASER_ENTITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={choiceCardClass(purchaserEntityType === option.value)}
                onClick={() => updatePurchaserEntityType(option.value)}
              >
                <strong className="block text-base font-semibold">{option.label}</strong>
                <span className={`mt-3 block text-sm leading-6 ${purchaserEntityType === option.value ? 'text-[#4e6278]' : 'text-[#6b7d93]'}`}>{option.caption}</span>
              </button>
            ))}
          </div>
        </section>
      )
    }

    if (activeStep.key === 'finance_type') {
      return (
        <section className={INNER_PANEL_CLASS}>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { value: 'bond', label: 'Bond', caption: 'Mortgage finance with bank / lender workflow' },
              { value: 'cash', label: 'Cash', caption: 'Cash-funded purchase with proof-of-funds requirement' },
              { value: 'combination', label: 'Hybrid', caption: 'Part bond, part cash contribution' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={choiceCardClass(normalizedFinanceType === option.value)}
                onClick={() => {
                  updateFinanceType(option.value)
                  if (option.value === 'cash') {
                    updateFinanceField('bond_help_requested', '')
                  }
                }}
              >
                <strong className="block text-base font-semibold">{option.label}</strong>
                <span className={`mt-3 block text-sm leading-6 ${normalizedFinanceType === option.value ? 'text-[#4e6278]' : 'text-[#6b7d93]'}`}>{option.caption}</span>
              </button>
            ))}
          </div>

          {['bond', 'combination'].includes(normalizedFinanceType) ? (
            <div className="mt-5 rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-5">
              <h5 className="text-base font-semibold text-[#142132]">Do you need help sorting your bond?</h5>
              <p className={`mt-2 ${MUTED_TEXT_CLASS}`}>OOBA can assist you at no cost and help move the finance process forward faster.</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {[
                  { value: 'yes', label: 'Yes, please' },
                  { value: 'no', label: 'No, I have this covered' },
                ].map((option) => (
                  <label key={option.value} className={chipChoiceClass(String(structuredFinance.bond_help_requested || '') === option.value)}>
                    <input
                      type="radio"
                      name="bond_help_requested"
                      checked={String(structuredFinance.bond_help_requested || '') === option.value}
                      onChange={() => updateFinanceField('bond_help_requested', option.value)}
                      className="sr-only"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )
    }

    if (activeStep.key === 'details') {
      return renderDetailsStep()
    }

    return null
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-3 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-[1240px] rounded-[34px] border border-[#dbe5ef] bg-[#f7fafc] p-5 shadow-[0_28px_70px_rgba(15,23,42,0.1)] md:p-6">
          <p className="rounded-[18px] border border-[#dde4ee] bg-white px-5 py-4 text-sm text-[#516277] shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
            Loading onboarding form...
          </p>
        </div>
      </main>
    )
  }

  if (error && !payload) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-3 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-[1240px] rounded-[34px] border border-[#dbe5ef] bg-[#f7fafc] p-5 shadow-[0_28px_70px_rgba(15,23,42,0.1)] md:p-6">
          <section className={SECTION_CARD_CLASS}>
            <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[#142132]">Client Onboarding</h1>
            <p className="mt-4 rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p>
          </section>
        </div>
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-3 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-[1240px] rounded-[34px] border border-[#dbe5ef] bg-[#f7fafc] p-5 shadow-[0_28px_70px_rgba(15,23,42,0.1)] md:p-6">
          <section className={SECTION_CARD_CLASS}>
            <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[#142132]">Client Onboarding</h1>
            <p className="mt-4 rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">
              Unable to load onboarding data.
            </p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-3 py-3 md:px-6 md:py-4">
      <div className="mx-auto max-w-[1240px] rounded-[32px] border border-[#dbe5ef] bg-[#f7fafc] p-3 shadow-[0_28px_70px_rgba(15,23,42,0.1)] md:p-5">
        <div className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-[30px] border border-[#d7e1ec] bg-white shadow-[0_22px_56px_rgba(15,23,42,0.08)]">
            <div className="bg-[linear-gradient(135deg,#35546c_0%,#4f7593_100%)] px-5 py-5 text-white md:px-7 md:py-6">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/78">bridge.</p>
              <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-4xl">
                  <h1 className="text-[1.65rem] font-semibold leading-[0.98] tracking-[-0.045em] text-white md:text-[2.2rem]">Information Sheet</h1>
                  <p className="mt-2 text-sm font-medium text-[#dce7f3] md:text-base">{onboardingLocationLabel || 'Property Purchase'}</p>
                </div>
                {welcomeAcknowledged && !submissionComplete ? (
                  <div className="inline-flex items-center rounded-full border border-white/20 bg-white/12 px-4 py-1.5 text-sm font-semibold text-white/95 backdrop-blur-sm">
                    Step {activeStepIndex + 1} of {stepDefinitions.length}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2.5 border-t border-[#e4edf6] bg-[#f8fbff] px-5 py-4 md:grid-cols-3 md:px-7">
              <article className="rounded-[16px] border border-[#dde7f1] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Development</span>
                <strong className="mt-1.5 block text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">{payload.unit?.development?.name || '—'}</strong>
              </article>
              <article className="rounded-[16px] border border-[#dde7f1] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Unit</span>
                <strong className="mt-1.5 block text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">{payload.unit?.unit_number || '—'}</strong>
              </article>
              <article className="rounded-[16px] border border-[#dde7f1] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Progress</span>
                <strong className="mt-1.5 block text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">{stepCompletionPercent}% complete</strong>
                <span className="mt-0.5 block text-xs text-[#6b7d93]">Step {activeStepIndex + 1} of {stepDefinitions.length}</span>
              </article>
            </div>
          </section>

          {error ? <p className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p> : null}

          {!welcomeAcknowledged ? (
            <section className="overflow-hidden rounded-[30px] border border-[#d8e3ef] bg-[linear-gradient(145deg,#edf5fc_0%,#f7fbff_46%,#ffffff_100%)] shadow-[0_24px_56px_rgba(15,23,42,0.1)]">
              <div
                className="grid gap-5 p-5 md:gap-6 md:p-6 xl:grid-cols-[minmax(0,1.2fr)_320px] xl:gap-8"
                style={{ paddingTop: 'clamp(1rem, 1.6vh, 1.5rem)', paddingBottom: 'clamp(1rem, 1.6vh, 1.5rem)' }}
              >
                <div className="space-y-4">
                  <span className="inline-flex items-center rounded-full border border-[#d8e7f6] bg-white/90 px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#35546c] shadow-[0_12px_26px_rgba(15,23,42,0.06)]">
                    Welcome
                  </span>
                  <div className="space-y-3">
                    <h2 className="text-[1.75rem] font-semibold tracking-[-0.05em] text-[#142132] md:text-[2.2rem]">Welcome {buyerDisplayName}</h2>
                    <p className="max-w-3xl text-sm leading-7 text-[#4b5d73] md:text-base">
                      We are excited to guide you through the process. This information sheet helps Bridge collect the right purchase, finance,
                      and legal details upfront so your team can move faster and keep communication streamlined.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      'You will only see the questions relevant to your purchase structure.',
                      'Bridge will use your answers to prepare the correct document request list.',
                      'After submission, you will receive access to the client portal for document uploads.',
                    ].map((item) => (
                      <article key={item} className="rounded-[16px] border border-[#dde7f1] bg-white/92 p-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(15,23,42,0.07)]">
                        <p className="text-xs leading-6 text-[#516277] md:text-sm">{item}</p>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-[22px] border border-[#dbe5ef] bg-white/92 p-5 shadow-[0_18px_38px_rgba(15,23,42,0.08)] md:p-6">
                  <div className="space-y-4">
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6b7d93]">
                      Before you begin
                    </span>
                    <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">One guided onboarding flow</h3>
                    <p className="text-sm leading-6 text-[#516277]">
                      Once you proceed, Bridge will take you directly into the information sheet. On future visits, this welcome screen will be skipped.
                    </p>
                  </div>
                  <Button type="button" className="mt-5" onClick={() => setWelcomeAcknowledged(true)}>
                    Proceed <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </section>
          ) : submissionComplete ? (
            <section className="mx-auto w-full max-w-3xl rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_22px_56px_rgba(15,23,42,0.08)] md:p-8">
              <div className="mx-auto max-w-2xl space-y-7 text-center">
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#cfe8da] bg-[#effaf3] text-[#22824d]">
                  <CheckCircle2 size={26} />
                </div>
                <div className="space-y-3">
                  <h3 className="text-[1.8rem] font-semibold tracking-[-0.04em] text-[#142132]">Thank you for submitting your information</h3>
                  <p className="text-base leading-7 text-[#516277]">
                    Thank you for submitting your information. Our team will send you a secure link to complete the next step, where you will be able to upload your FICA documents using OTP verification.
                  </p>
                </div>

                <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-5 text-left">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#35546c]">Please have the following documents ready:</h4>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-[#233247]">
                    <li>South African ID document or passport</li>
                    <li>Proof of address</li>
                    <li>3 months&rsquo; bank statements</li>
                    <li>3 months&rsquo; payslips</li>
                    <li>Proof of income</li>
                    <li>Marriage certificate or ANC documents (if applicable)</li>
                    <li>Company or trust registration documents (if applicable)</li>
                  </ul>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="overflow-hidden rounded-[28px] border border-[#d8e3ef] bg-[linear-gradient(135deg,#edf4fb_0%,#e3edf8_48%,#f4f8fc_100%)] p-5 shadow-[0_20px_42px_rgba(15,23,42,0.08)] md:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Progress</strong>
                    <span className="mt-1 block text-sm text-[#6b7d93]">
                      Step {activeStepIndex + 1} of {stepDefinitions.length}
                    </span>
                  </div>
                  <span className="text-2xl font-semibold tracking-[-0.04em] text-[#35546c]">{stepCompletionPercent}%</span>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-[#35546c] transition-[width] duration-300" style={{ width: `${stepCompletionPercent}%` }} />
                </div>
                <div className="mt-5 overflow-x-auto pb-1">
                  <div className="grid gap-3" style={stepGridStyle}>
                    {stepDefinitions.map((step, index) => (
                      <button
                        key={step.key}
                        type="button"
                        className={`rounded-[18px] border px-3 py-3 text-left transition duration-150 ease-out ${
                          index === activeStepIndex
                            ? 'border-[#35546c] bg-[#35546c] text-white'
                            : index < activeStepIndex
                              ? 'border-[#cfe8da] bg-[#effaf3] text-[#22824d]'
                              : 'border-white/85 bg-white/88 text-[#516277] hover:border-[#cbd8e5] hover:bg-white'
                        }`}
                        onClick={() => setActiveStepIndex(index)}
                      >
                        <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] opacity-75">{index + 1}</span>
                        <strong className="mt-2 block text-[0.94rem] font-semibold leading-5">{getCompactStepLabel(step)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className={SECTION_CARD_CLASS}>
                {activeStep ? (
                  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <h3 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#142132]">{activeStep.title}</h3>
                      <p className={MUTED_TEXT_CLASS}>{activeStep.description}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#d8e7f6] bg-[#f6fbff] px-4 py-2 text-sm font-semibold text-[#35546c]">
                      Step {activeStepIndex + 1} of {stepDefinitions.length}
                    </span>
                  </div>
                ) : null}

                {renderActiveStepBody()}

                <div className="sticky bottom-2 z-20 mt-6 border-t border-[#edf2f7] pt-5">
                  <div className="rounded-[18px] border border-[#dbe5ef] bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.1)] backdrop-blur md:bg-white">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Button type="button" variant="ghost" onClick={() => void handleSaveDraft()} disabled={saving}>
                    Save Draft
                      </Button>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                        {activeStepIndex > 0 ? (
                          <Button type="button" variant="ghost" onClick={handlePreviousStep}>
                            <ChevronLeft size={14} /> Back
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          onClick={() => {
                            if (isLastStep) {
                              if (!validateCurrentStep()) {
                                return
                              }
                              void handleSubmit()
                              return
                            }
                            handleNextStep()
                          }}
                          disabled={saving}
                          className="w-full sm:w-auto"
                        >
                          {isLastStep ? 'Submit Details' : 'Next'}
                          {isLastStep ? null : <ChevronRight size={14} />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default ClientOnboarding
