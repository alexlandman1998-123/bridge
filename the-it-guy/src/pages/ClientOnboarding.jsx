import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  Home,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { deriveFinanceManagedBy, normalizeFinanceType } from '../core/transactions/financeType'
import Button from '../components/ui/Button'
import { parseEdgeFunctionError } from '../lib/edgeFunctions'
import { resolveBuyerOnboardingFlow } from '../lib/buyerOnboardingFlow.js'
import {
  EMPLOYMENT_TYPE_OPTIONS,
  PURCHASER_ENTITY_OPTIONS,
  getOnboardingStepDefinitions,
  getPurchaserEntityType,
  normalizePurchaserType,
  validateOnboardingSubmission,
} from '../lib/purchaserPersonas'
import {
  fetchClientOnboardingByToken,
  resolveOnboardingWhatsAppContacts,
  saveClientOnboardingDraft,
  submitClientOnboarding,
} from '../lib/api'
import { getDemoBuyerOnboardingPayload, isBuyerOnboardingDemoToken } from '../lib/onboardingDemoLinks'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { sendWhatsAppNotification } from '../lib/whatsapp'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const SECTION_CARD_CLASS =
  'rounded-[20px] border border-[#dbe5ef] bg-white/95 p-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] backdrop-blur md:rounded-[32px] md:p-7'
const INNER_PANEL_CLASS =
  'rounded-[18px] border border-[#dfe8f2] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] md:rounded-[24px] md:p-6'
const MUTED_TEXT_CLASS = 'text-sm leading-6 text-[#6b7d93]'
const DETAIL_FLOW_WRAP_CLASS =
  'mx-auto w-full max-w-[1120px] space-y-4 md:space-y-6'
const PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[560px] md:max-w-[1120px]'
const DETAIL_INPUT_CLASS =
  'w-full min-h-[52px] rounded-[12px] border border-[#d9e2ee] bg-white px-4 py-3 text-base text-[#162334] outline-none transition duration-150 ease-out placeholder:text-[#8aa0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12'
const HERO_SECTION_CLASS =
  'overflow-hidden rounded-[22px] border border-[#dbe4ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] shadow-[0_16px_38px_rgba(15,23,42,0.06)] md:rounded-[32px] md:shadow-[0_22px_48px_rgba(15,23,42,0.08)]'
const HERO_SUMMARY_CLASS =
  'rounded-[18px] border border-[#d9e4ee] bg-white/92 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur md:rounded-[28px] md:p-5 md:shadow-[0_16px_34px_rgba(15,23,42,0.06)]'
const STEP_OVERVIEW_CARD_CLASS =
  'h-full rounded-[16px] border px-3 py-3 text-left transition duration-150 ease-out md:rounded-[22px] md:px-5 md:py-5'
const STEP_OVERVIEW_ACTIVE_CLASS =
  'border-[#35546c] bg-[#f5f9ff] shadow-[0_12px_28px_rgba(53,84,108,0.12)]'
const STEP_OVERVIEW_INACTIVE_CLASS =
  'border-[#dbe5ef] bg-white shadow-[0_10px_22px_rgba(15,23,42,0.04)] hover:border-[#c9d7e6] hover:bg-[#fbfdff]'

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
  'ownership_share',
  'consent_to_purchase',
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
  'monthly_living_expenses',
  'first_time_buyer',
  'primary_residence',
  'investment_purchase',
  'under_debt_review',
  'under_administration',
  'ever_declared_insolvent',
  'surety_obligations',
]

const FINANCE_DETAIL_KEYS = [
  'purchase_price',
  'cash_amount',
  'bond_amount',
  'proof_of_funds_available',
  'source_of_funds',
  'cash_funds_confirmed',
  'cash_contribution_available',
  'deposit_source',
  'cash_contribution_source',
  'bank_statements_available',
  'bond_readiness_consent',
  'affordability_confirmed',
  'bond_current_status',
  'bond_process_started',
  'bond_bank_name',
  'bond_help_requested',
  'ooba_assist_requested',
  'joint_bond_application',
  'bond_originator_name',
  'bond_originator_contact',
]

const COMPANY_DETAIL_KEYS = [
  'company_name',
  'company_registration_number',
  'company_registered_address',
  'company_business_address',
  'company_tax_number',
  'vat_number',
  'nature_of_business',
  'authorised_signatory_name',
  'authorised_signatory_identity_number',
  'authorised_signatory_email',
  'authorised_signatory_phone',
  'authorised_signatory_capacity',
  'board_resolution_available',
]

const TRUST_DETAIL_KEYS = [
  'trust_name',
  'trust_registration_number',
  'trust_type',
  'masters_office_reference',
  'trust_registered_address',
  'trust_tax_number',
  'authorised_trustee_name',
  'authorised_trustee_identity_number',
  'authorised_trustee_email',
  'authorised_trustee_phone',
  'trust_deed_available',
  'letters_of_authority_available',
  'trust_resolution_available',
  'all_trustees_signing',
]

function isMarriedPurchaser(purchaser = {}) {
  return String(purchaser.marital_status || '').trim().toLowerCase() === 'married'
}

function isSpouseContactRequired(purchaser = {}) {
  const maritalRegime = String(purchaser.marital_regime || '').trim().toLowerCase()
  return maritalRegime === 'in_community' || normalizeYesNoChoice(purchaser.spouse_is_co_purchaser) === 'yes'
}

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
    title: 'Marital Status',
    description: 'If you are married, we will only ask for the regime and spouse details that matter.',
    fields: [
      { key: 'marital_status', label: 'Marital Status', type: 'select', required: true, options: MARITAL_STATUS_OPTIONS },
      {
        key: 'marital_regime',
        label: 'Marital Regime',
        type: 'select',
        required: true,
        options: MARITAL_REGIME_OPTIONS,
        visibleWhen: ({ purchaser }) => isMarriedPurchaser(purchaser),
      },
      {
        key: 'spouse_full_name',
        label: 'Spouse Full Name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Jamie Nkosi',
        visibleWhen: ({ purchaser }) => isMarriedPurchaser(purchaser),
      },
      {
        key: 'spouse_identity_number',
        label: 'Spouse ID Number',
        type: 'text',
        required: true,
        placeholder: 'e.g. 9001015009087',
        visibleWhen: ({ purchaser }) => isMarriedPurchaser(purchaser),
      },
      {
        key: 'spouse_is_co_purchaser',
        label: 'Is your spouse a co-purchaser?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
        visibleWhen: ({ purchaser }) => isMarriedPurchaser(purchaser),
      },
      {
        key: 'spouse_email',
        label: 'Spouse Email Address',
        type: 'email',
        required: false,
        requiredWhen: ({ purchaser }) => isSpouseContactRequired(purchaser),
        placeholder: 'spouse@email.com',
        visibleWhen: ({ purchaser }) => isMarriedPurchaser(purchaser),
      },
      {
        key: 'spouse_phone',
        label: 'Spouse Contact Number',
        type: 'tel',
        required: false,
        requiredWhen: ({ purchaser }) => isSpouseContactRequired(purchaser),
        placeholder: '+27 82 000 0000',
        visibleWhen: ({ purchaser }) => isMarriedPurchaser(purchaser),
      },
    ],
  },
  {
    key: 'ownership_split',
    title: 'Ownership Split',
    description: 'If you are buying with someone else, tell us how the ownership should be split.',
    fields: [
      {
        key: 'ownership_share',
        label: 'Ownership Share (%)',
        type: 'number',
        required: true,
        placeholder: 'e.g. 50',
        visibleWhen: ({ purchaseMode }) => purchaseMode === 'co_purchasing',
      },
      {
        key: 'consent_to_purchase',
        label: 'Consent to Purchase',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
        visibleWhen: ({ purchaseMode }) => purchaseMode === 'co_purchasing',
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
      {
        key: 'monthly_living_expenses',
        label: 'Monthly Living Expenses',
        type: 'number',
        required: true,
        visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
      },
      { key: 'first_time_buyer', label: 'First-time Buyer?', type: 'select', required: true, options: YES_NO_OPTIONS },
      { key: 'primary_residence', label: 'Primary Residence?', type: 'select', required: true, options: YES_NO_OPTIONS },
      { key: 'investment_purchase', label: 'Investment Purchase?', type: 'select', required: true, options: YES_NO_OPTIONS },
    ],
  },
  {
    key: 'bond_readiness_declarations',
    title: 'Bond Readiness Declarations',
    fields: [
      {
        key: 'under_debt_review',
        label: 'Currently under debt review?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
        visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
      },
      {
        key: 'under_administration',
        label: 'Currently under administration?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
        visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
      },
      {
        key: 'ever_declared_insolvent',
        label: 'Ever declared insolvent?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
        visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
      },
      {
        key: 'surety_obligations',
        label: 'Any surety obligations?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
        visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
      },
    ],
  },
]

const COMPANY_DETAIL_FIELDS = [
  { key: 'company_name', label: 'Company Name', type: 'text', required: true },
  { key: 'company_registration_number', label: 'Company Registration Number', type: 'text', required: true },
  { key: 'company_registered_address', label: 'Registered Address', type: 'textarea', required: true },
  { key: 'company_business_address', label: 'Business Address', type: 'textarea', required: false },
  { key: 'company_tax_number', label: 'Tax Number', type: 'text', required: false },
  { key: 'vat_number', label: 'VAT Number', type: 'text', required: false },
  { key: 'nature_of_business', label: 'Nature of Business', type: 'text', required: true },
  { key: 'authorised_signatory_name', label: 'Authorised Signatory Name', type: 'text', required: true },
  {
    key: 'authorised_signatory_identity_number',
    label: 'Authorised Signatory ID Number',
    type: 'text',
    required: true,
  },
  { key: 'authorised_signatory_email', label: 'Authorised Signatory Email', type: 'email', required: true },
  { key: 'authorised_signatory_phone', label: 'Authorised Signatory Phone', type: 'tel', required: true },
  { key: 'authorised_signatory_capacity', label: 'Authorised Signatory Capacity', type: 'text', required: true },
  { key: 'board_resolution_available', label: 'Board Resolution Available?', type: 'select', required: true, options: YES_NO_OPTIONS },
]

const TRUST_DETAIL_FIELDS = [
  { key: 'trust_name', label: 'Trust Name', type: 'text', required: true },
  { key: 'trust_registration_number', label: 'Trust Registration Number', type: 'text', required: true },
  { key: 'trust_type', label: 'Trust Type', type: 'text', required: true },
  { key: 'masters_office_reference', label: 'Master’s Office Reference', type: 'text', required: true },
  { key: 'trust_registered_address', label: 'Registered Address', type: 'textarea', required: true },
  { key: 'trust_tax_number', label: 'Trust Tax Number', type: 'text', required: false },
  { key: 'authorised_trustee_name', label: 'Authorised Trustee Name', type: 'text', required: true },
  {
    key: 'authorised_trustee_identity_number',
    label: 'Authorised Trustee ID Number',
    type: 'text',
    required: true,
  },
  { key: 'authorised_trustee_email', label: 'Authorised Trustee Email', type: 'email', required: true },
  { key: 'authorised_trustee_phone', label: 'Authorised Trustee Phone', type: 'tel', required: true },
  { key: 'trust_deed_available', label: 'Trust Deed Available?', type: 'select', required: true, options: YES_NO_OPTIONS },
  { key: 'letters_of_authority_available', label: 'Letters of Authority Available?', type: 'select', required: true, options: YES_NO_OPTIONS },
  { key: 'trust_resolution_available', label: 'Trust Resolution Available?', type: 'select', required: true, options: YES_NO_OPTIONS },
  { key: 'all_trustees_signing', label: 'Are All Trustees Signing?', type: 'select', required: true, options: YES_NO_OPTIONS },
]

const ASSOCIATED_PERSON_FIELDS = [
  { key: 'full_name', label: 'Full Name', type: 'text', required: true, placeholder: 'e.g. Alex Principal' },
  { key: 'id_number', label: 'ID Number / Passport', type: 'text', required: true, placeholder: 'e.g. 9001015009083' },
  { key: 'phone', label: 'Contact Number', type: 'tel', required: true, placeholder: '+27 82 000 0000' },
  { key: 'email', label: 'Email Address', type: 'email', required: false, placeholder: 'name@email.com' },
  { key: 'residential_address', label: 'Residential Address', type: 'textarea', required: true, fullWidth: true },
  { key: 'role_title', label: 'Role / Title', type: 'text', required: false, placeholder: 'e.g. Director' },
  { key: 'signing_authority', label: 'Signing Authority', type: 'select', required: false, options: YES_NO_OPTIONS },
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
  return `h-full rounded-[16px] border px-3 py-3 text-left transition duration-150 ease-out md:rounded-[20px] md:px-5 md:py-5 ${
    active
      ? 'border-[#35546c] bg-[#f4f8fd] text-[#142132] shadow-[0_14px_30px_rgba(53,84,108,0.12)]'
      : 'border-[#dde4ee] bg-white text-[#142132] shadow-[0_12px_28px_rgba(15,23,42,0.04)] hover:border-[#c8d6e5] hover:bg-[#fbfdff]'
  }`
}

function getJourneyStepLabel(step = {}, index = 0) {
  switch (step.key) {
    case 'purchaser_entity':
      return 'Buyer'
    case 'finance_type':
      return 'Finance'
    case 'details':
      return 'Details'
    case 'review':
      return 'Review'
    default:
      return step.title || `Step ${index + 1}`
  }
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

function isNaturalPersonEntityType(entityType) {
  const normalized = String(entityType || '')
    .trim()
    .toLowerCase()

  return normalized === 'individual' || normalized === 'foreign_purchaser'
}

function normalizeInputValue(value) {
  return String(value || '').trim()
}

function isFilledValue(value) {
  if (value === 0 || value === '0') {
    return true
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
  }

  if (typeof value === 'boolean') {
    return true
  }

  return normalizeInputValue(value).length > 0
}

function normalizeWhatsappLabel(value, fallback = '') {
  const normalized = normalizeInputValue(value)
  return normalized || fallback
}

function toBooleanLike(value) {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized = normalizeInputValue(value).toLowerCase()
  return ['true', 'yes', '1', 'required', 'pending', 'paid', 'verified'].includes(normalized)
}

function normalizeWhatsappReservationPaymentDetails(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    accountHolderName: normalizeWhatsappLabel(
      source.account_holder_name || source.accountHolderName,
      '',
    ),
    bankName: normalizeWhatsappLabel(source.bank_name || source.bankName, ''),
    accountNumber: normalizeWhatsappLabel(
      source.account_number || source.accountNumber,
      '',
    ),
    branchCode: normalizeWhatsappLabel(source.branch_code || source.branchCode, ''),
    accountType: normalizeWhatsappLabel(source.account_type || source.accountType, ''),
    paymentReference: normalizeWhatsappLabel(
      source.payment_reference ||
        source.paymentReference ||
        source.payment_reference_format ||
        source.paymentReferenceFormat,
      '',
    ),
    paymentInstructions: normalizeWhatsappLabel(
      source.payment_instructions || source.paymentInstructions,
      '',
    ),
  }
}

function formatFinanceTypeForWhatsApp(value) {
  const normalized = normalizeFinanceType(value || '')
  switch (normalized) {
    case 'bond':
      return 'Bond'
    case 'hybrid':
    case 'combination':
      return 'Hybrid'
    case 'cash':
      return 'Cash'
    default:
      return normalizeWhatsappLabel(value, 'Unspecified')
  }
}

function isBondOrHybridFinanceTypeForWhatsApp(value) {
  const normalized = normalizeFinanceType(value || '')
  return normalized === 'bond' || normalized === 'hybrid' || normalized === 'combination'
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

function formatReviewText(value, fallback = 'Not provided') {
  if (value === 0 || value === '0') {
    return '0'
  }

  return normalizeInputValue(value) || fallback
}

function formatReviewCurrency(value, fallback = 'Not provided') {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(numericValue)) {
    return formatReviewText(value, fallback)
  }

  return currency.format(numericValue)
}

function formatReviewOption(options = [], value, fallback = 'Not provided') {
  const normalizedValue = normalizeInputValue(value)
  if (!normalizedValue) {
    return fallback
  }

  const matchedOption = (Array.isArray(options) ? options : []).find((option) => String(option.value) === normalizedValue)
  return matchedOption?.label || formatReviewText(value, fallback)
}

function formatReviewYesNo(value, fallback = 'Not provided') {
  const normalized = normalizeYesNoChoice(value)
  if (normalized === 'yes') return 'Yes'
  if (normalized === 'no') return 'No'
  return fallback
}

function getReviewPersonName(person = {}, fallback = 'Not provided') {
  return formatReviewText([person.first_name, person.last_name].filter(Boolean).join(' '), fallback)
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
    ownership_share: '',
    consent_to_purchase: '',
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
    monthly_living_expenses: '',
    first_time_buyer: '',
    primary_residence: '',
    investment_purchase: '',
    under_debt_review: '',
    under_administration: '',
    ever_declared_insolvent: '',
    surety_obligations: '',
  }
}

function createEmptyFinance() {
  return {
    purchase_price: '',
    cash_amount: '',
    bond_amount: '',
    proof_of_funds_available: '',
    source_of_funds: '',
    cash_funds_confirmed: '',
    cash_contribution_available: '',
    deposit_source: '',
    cash_contribution_source: '',
    bank_statements_available: '',
    bond_readiness_consent: '',
    affordability_confirmed: '',
    bond_current_status: '',
    bond_process_started: '',
    bond_bank_name: '',
    bond_help_requested: '',
    ooba_assist_requested: '',
    joint_bond_application: '',
    bond_originator_name: '',
    bond_originator_contact: '',
  }
}

function createEmptyCompany() {
  return {
    company_name: '',
    company_registration_number: '',
    company_registered_address: '',
    company_business_address: '',
    company_tax_number: '',
    vat_number: '',
    nature_of_business: '',
    authorised_signatory_name: '',
    authorised_signatory_identity_number: '',
    authorised_signatory_email: '',
    authorised_signatory_phone: '',
    authorised_signatory_capacity: '',
    board_resolution_available: '',
    directors: [],
  }
}

function createEmptyTrust() {
  return {
    trust_name: '',
    trust_registration_number: '',
    trust_type: '',
    masters_office_reference: '',
    trust_registered_address: '',
    trust_tax_number: '',
    authorised_trustee_name: '',
    authorised_trustee_identity_number: '',
    authorised_trustee_email: '',
    authorised_trustee_phone: '',
    trust_deed_available: '',
    letters_of_authority_available: '',
    trust_resolution_available: '',
    all_trustees_signing: '',
    trustees: [],
  }
}

function createEmptyAssociatedPerson(roleTitle) {
  return {
    full_name: '',
    id_number: '',
    phone: '',
    email: '',
    residential_address: '',
    role_title: roleTitle,
    signing_authority: '',
  }
}

function normalizeRepeatablePeople(list = [], roleTitle = 'Director') {
  if (!Array.isArray(list)) {
    return []
  }

  return list.map((item) => ({
    ...createEmptyAssociatedPerson(roleTitle),
    ...(item || {}),
    id_number: item?.id_number ?? item?.identity_number ?? item?.passport_number ?? '',
    signing_authority: normalizeYesNoChoice(item?.signing_authority),
  }))
}

function applyFirstFilled(target, key, values = []) {
  if (normalizeInputValue(target[key]).length) {
    return
  }
  const firstFilled = values.find((value) => normalizeInputValue(value).length)
  if (firstFilled !== undefined) {
    target[key] = firstFilled
  }
}

function hasPurchaserData(entry = {}) {
  return PURCHASER_STRUCTURED_KEYS.some((key) => normalizeInputValue(entry?.[key]).length > 0)
}

function hasAssociatedPersonData(entry = {}, defaultRole = 'Director') {
  return (
    ['full_name', 'id_number', 'phone', 'email', 'residential_address'].some((key) => normalizeInputValue(entry?.[key]).length > 0) ||
    (normalizeInputValue(entry?.role_title).length > 0 &&
      normalizeInputValue(entry?.role_title).toLowerCase() !== String(defaultRole).trim().toLowerCase()) ||
    normalizeYesNoChoice(entry?.signing_authority) !== ''
  )
}

function isOriginatorAssistedFinance(finance = {}) {
  return normalizeYesNoChoice(finance.bond_help_requested || finance.ooba_assist_requested) === 'yes'
}

const FINANCE_DETAIL_SECTIONS = [
  {
    key: 'finance_totals',
    title: 'Finance Structure',
    description: 'Confirm how the purchase is being funded.',
    fields: [
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
    ],
  },
  {
    key: 'cash_funding',
    title: 'Cash Funding',
    description: 'Capture cash support, proof of funds, and the source of the cash component.',
    visibleWhen: ({ financeType }) => ['cash', 'combination'].includes(financeType),
    fields: [
      {
        key: 'proof_of_funds_available',
        label: 'Is proof of funds available?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
      },
      {
        key: 'source_of_funds',
        label: 'Source of Funds',
        type: 'select',
        required: true,
        options: [
          { value: '', label: 'Select source' },
          { value: 'savings', label: 'Savings' },
          { value: 'investment', label: 'Investment' },
          { value: 'sale_of_property', label: 'Sale of property' },
          { value: 'business_funds', label: 'Business funds' },
          { value: 'inheritance', label: 'Inheritance' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        key: 'cash_funds_confirmed',
        label: 'Confirm the cash funds are available?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
      },
    ],
  },
  {
    key: 'bond_progress',
    title: 'Bond Progress',
    description: 'Capture the current bond state and the cash contribution, if any.',
    visibleWhen: ({ financeType }) => ['bond', 'combination'].includes(financeType),
    fields: [
      {
        key: 'bond_process_started',
        label: 'Have you already started the bond process?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
      },
      {
        key: 'bond_current_status',
        label: 'Current Bond Status',
        type: 'select',
        required: true,
        options: BOND_STATUS_OPTIONS,
      },
      {
        key: 'bond_bank_name',
        label: 'Bank / Bond Provider',
        type: 'text',
        required: true,
        visibleWhen: ({ finance }) => normalizeYesNoChoice(finance?.bond_process_started) === 'yes',
        requiredWhen: ({ finance }) => normalizeYesNoChoice(finance?.bond_process_started) === 'yes',
      },
      {
        key: 'bond_help_requested',
        label: 'Would you like bond originator help?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
      },
      {
        key: 'joint_bond_application',
        label: 'Is this a joint bond application?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
      },
      {
        key: 'cash_contribution_available',
        label: 'Deposit / Cash Contribution Amount',
        type: 'number',
        required: false,
        allowZero: true,
      },
      {
        key: 'deposit_source',
        label: 'Deposit / Cash Contribution Source',
        type: 'text',
        required: false,
        visibleWhen: ({ finance }) => isFilledValue(finance?.cash_contribution_available),
        requiredWhen: ({ finance }) => isFilledValue(finance?.cash_contribution_available),
      },
      {
        key: 'bank_statements_available',
        label: 'Recent Bank Statements Available?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
      },
      {
        key: 'bond_readiness_consent',
        label: 'Consent to share this finance snapshot with the bond originator?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
      },
      {
        key: 'affordability_confirmed',
        label: 'Affordability ready / confirmed?',
        type: 'select',
        required: true,
        options: YES_NO_OPTIONS,
      },
    ],
  },
  {
    key: 'bond_originator_support',
    title: 'Originator Support',
    description: 'Show the person or team helping with the bond when originator support is requested.',
    visibleWhen: ({ finance }) => isOriginatorAssistedFinance(finance),
    fields: [
      {
        key: 'bond_originator_name',
        label: 'Bond Originator / Consultant Name',
        type: 'text',
        required: false,
        requiredWhen: ({ finance }) => isOriginatorAssistedFinance(finance),
      },
      {
        key: 'bond_originator_contact',
        label: 'Bond Originator Contact Details',
        type: 'text',
        required: false,
      },
    ],
  },
]

function normalizePurchaserRecord(record = {}) {
  const normalized = createEmptyPurchaser()
  PURCHASER_STRUCTURED_KEYS.forEach((key) => {
    if (
      key === 'spouse_is_co_purchaser' ||
      key === 'consent_to_purchase' ||
      key === 'first_time_buyer' ||
      key === 'primary_residence' ||
      key === 'investment_purchase' ||
      key === 'under_debt_review' ||
      key === 'under_administration' ||
      key === 'ever_declared_insolvent' ||
      key === 'surety_obligations'
    ) {
      normalized[key] = normalizeYesNoChoice(record?.[key])
      return
    }
    if (key === 'ownership_share') {
      normalized[key] = record?.[key] ?? ''
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

  if (String(normalized.marital_status || '').trim().toLowerCase() !== 'married') {
    normalized.marital_regime = ''
    normalized.spouse_full_name = ''
    normalized.spouse_identity_number = ''
    normalized.spouse_email = ''
    normalized.spouse_phone = ''
    normalized.spouse_is_co_purchaser = ''
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
  if (!normalizeInputValue(finance.deposit_source) && normalizeInputValue(finance.cash_contribution_source)) {
    finance.deposit_source = finance.cash_contribution_source
  }
  if (!normalizeInputValue(finance.cash_contribution_source) && normalizeInputValue(finance.deposit_source)) {
    finance.cash_contribution_source = finance.deposit_source
  }
  finance.proof_of_funds_available = normalizeYesNoChoice(finance.proof_of_funds_available)
  finance.cash_funds_confirmed = normalizeYesNoChoice(finance.cash_funds_confirmed)
  finance.bond_process_started = normalizeYesNoChoice(finance.bond_process_started)
  finance.bond_help_requested = normalizeYesNoChoice(
    finance.bond_help_requested || formData.bond_help_requested || formData.ooba_assist_requested || finance.ooba_assist_requested,
  )
  finance.ooba_assist_requested = normalizeYesNoChoice(finance.ooba_assist_requested || finance.bond_help_requested)
  finance.bank_statements_available = normalizeYesNoChoice(finance.bank_statements_available)
  finance.bond_readiness_consent = normalizeYesNoChoice(finance.bond_readiness_consent)
  finance.affordability_confirmed = normalizeYesNoChoice(finance.affordability_confirmed)

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
  applyFirstFilled(company, 'company_registered_address', [
    company.registered_address,
    formData.company_registered_address,
    formData.registered_address,
  ])
  applyFirstFilled(company, 'company_business_address', [
    company.business_address,
    formData.company_business_address,
    formData.business_address,
  ])
  applyFirstFilled(company, 'company_tax_number', [
    company.tax_number,
    formData.company_tax_number,
    formData.tax_number,
  ])
  company.board_resolution_available = normalizeYesNoChoice(company.board_resolution_available || company.company_resolution_available)
  const companyDirectors = Array.isArray(company.directors)
    ? company.directors
    : Array.isArray(formData.directors)
      ? formData.directors
      : []
  company.directors = normalizeRepeatablePeople(companyDirectors, 'Director')

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
  applyFirstFilled(trust, 'trust_registered_address', [
    trust.registered_address,
    formData.trust_registered_address,
    formData.registered_address,
  ])
  applyFirstFilled(trust, 'trust_tax_number', [
    trust.tax_number,
    formData.trust_tax_number,
    formData.tax_number,
  ])
  trust.trust_deed_available = normalizeYesNoChoice(trust.trust_deed_available)
  trust.letters_of_authority_available = normalizeYesNoChoice(trust.letters_of_authority_available)
  trust.trust_resolution_available = normalizeYesNoChoice(trust.trust_resolution_available || trust.resolution_available)
  trust.all_trustees_signing = normalizeYesNoChoice(trust.all_trustees_signing)
  const trustTrustees = Array.isArray(trust.trustees)
    ? trust.trustees
    : Array.isArray(formData.trustees)
      ? formData.trustees
      : []
  trust.trustees = normalizeRepeatablePeople(trustTrustees, 'Trustee')

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
  cleaned.deposit_source = cleaned.finance.deposit_source ?? cleaned.cash_contribution_source ?? ''
  cleaned.cash_contribution_source = cleaned.finance.cash_contribution_source ?? cleaned.deposit_source ?? ''
  cleaned.bond_help_requested = normalizeYesNoChoice(cleaned.finance.bond_help_requested)
  cleaned.ooba_assist_requested = normalizeYesNoChoice(cleaned.bond_help_requested || cleaned.finance.ooba_assist_requested)

  stripFlatPurchaserFields(cleaned)
  delete cleaned.purchasers
  delete cleaned.company
  delete cleaned.trust
  delete cleaned.directors
  delete cleaned.trustees

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
    cleaned.company.directors = Array.isArray(normalized.company.directors) ? normalized.company.directors : []
    cleaned.directors = cleaned.company.directors
    COMPANY_DETAIL_KEYS.forEach((key) => {
      cleaned[key] = cleaned.company[key] ?? ''
    })
    TRUST_DETAIL_KEYS.forEach((key) => {
      delete cleaned[key]
    })
  } else if (purchaserEntityType === 'trust') {
    cleaned.trust = { ...createEmptyTrust(), ...normalized.trust }
    cleaned.trust.trustees = Array.isArray(normalized.trust.trustees) ? normalized.trust.trustees : []
    cleaned.trustees = cleaned.trust.trustees
    TRUST_DETAIL_KEYS.forEach((key) => {
      cleaned[key] = cleaned.trust[key] ?? ''
    })
    COMPANY_DETAIL_KEYS.forEach((key) => {
      delete cleaned[key]
    })
  }

  if (financeType === 'cash') {
    cleaned.bond_amount = ''
    cleaned.cash_contribution_available = ''
    cleaned.deposit_source = ''
    cleaned.cash_contribution_source = ''
    cleaned.proof_of_funds_available = cleaned.proof_of_funds_available || ''
    cleaned.source_of_funds = cleaned.source_of_funds || ''
    cleaned.cash_funds_confirmed = cleaned.cash_funds_confirmed || ''
    cleaned.bond_process_started = ''
    cleaned.bond_bank_name = ''
    cleaned.bank_statements_available = ''
    cleaned.bond_readiness_consent = ''
    cleaned.affordability_confirmed = ''
    cleaned.bond_current_status = ''
    cleaned.bond_help_requested = ''
    cleaned.ooba_assist_requested = ''
    cleaned.joint_bond_application = ''
    cleaned.bond_originator_name = ''
    cleaned.bond_originator_contact = ''
    cleaned.finance.bond_amount = ''
    cleaned.finance.cash_contribution_available = ''
    cleaned.finance.deposit_source = ''
    cleaned.finance.cash_contribution_source = ''
    cleaned.finance.proof_of_funds_available = cleaned.proof_of_funds_available || ''
    cleaned.finance.source_of_funds = cleaned.source_of_funds || ''
    cleaned.finance.cash_funds_confirmed = cleaned.cash_funds_confirmed || ''
    cleaned.finance.bond_process_started = ''
    cleaned.finance.bond_bank_name = ''
    cleaned.finance.bank_statements_available = ''
    cleaned.finance.bond_readiness_consent = ''
    cleaned.finance.affordability_confirmed = ''
    cleaned.finance.bond_current_status = ''
    cleaned.finance.bond_help_requested = ''
    cleaned.finance.ooba_assist_requested = ''
    cleaned.finance.joint_bond_application = ''
    cleaned.finance.bond_originator_name = ''
    cleaned.finance.bond_originator_contact = ''
    if (Array.isArray(cleaned.purchasers)) {
      cleaned.purchasers = cleaned.purchasers.map((purchaser) => {
        const nextPurchaser = { ...purchaser }
        nextPurchaser.monthly_living_expenses = ''
        nextPurchaser.under_debt_review = ''
        nextPurchaser.under_administration = ''
        nextPurchaser.ever_declared_insolvent = ''
        nextPurchaser.surety_obligations = ''
        return nextPurchaser
      })
    }
    const purchaserBondReadinessKeys = [
      'monthly_living_expenses',
      'under_debt_review',
      'under_administration',
      'ever_declared_insolvent',
      'surety_obligations',
    ]
    purchaserBondReadinessKeys.forEach((key) => {
      cleaned[key] = ''
      delete cleaned[`co_${key}`]
    })
  } else if (financeType === 'bond') {
    cleaned.cash_amount = ''
    cleaned.proof_of_funds_available = ''
    cleaned.source_of_funds = ''
    cleaned.cash_funds_confirmed = ''
    cleaned.finance.cash_amount = ''
    cleaned.finance.proof_of_funds_available = ''
    cleaned.finance.source_of_funds = ''
    cleaned.finance.cash_funds_confirmed = ''
  }

  if (normalizeYesNoChoice(cleaned.bond_help_requested) !== 'yes') {
    cleaned.bond_originator_name = ''
    cleaned.bond_originator_contact = ''
    cleaned.finance.bond_originator_name = ''
    cleaned.finance.bond_originator_contact = ''
  }

  if (normalizeYesNoChoice(cleaned.bond_process_started) !== 'yes') {
    cleaned.bond_bank_name = ''
    cleaned.finance.bond_bank_name = ''
  }

  if (!normalizeInputValue(cleaned.cash_contribution_available)) {
    cleaned.deposit_source = ''
    cleaned.cash_contribution_source = ''
    cleaned.finance.deposit_source = ''
    cleaned.finance.cash_contribution_source = ''
  }

  const financeManagedBy = deriveFinanceManagedBy({
    financeType,
    financeManagedBy: cleaned.finance_managed_by || cleaned.financeManagedBy,
    formData: cleaned,
  })
  cleaned.finance_managed_by = financeManagedBy
  cleaned.financeManagedBy = financeManagedBy
  cleaned.finance.finance_managed_by = financeManagedBy
  cleaned.finance.financeManagedBy = financeManagedBy

  return cleaned
}

function getBuyerLandingInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) return 'B9'

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function resolveBuyerLandingBrand(payload = {}) {
  const branding = payload?.branding || {}
  const organisation = payload?.organisation || {}
  const development = Array.isArray(payload?.unit?.development)
    ? payload.unit.development[0]
    : payload?.unit?.development
  const name =
    String(
      branding.senderName ||
        branding.organisationName ||
        branding.agencyName ||
        organisation.display_name ||
        organisation.name ||
        payload?.transaction?.assigned_agent ||
        development?.name ||
        '',
    ).trim() || 'Your property team'
  const logoUrl = String(
    branding.logoDarkUrl ||
      branding.logoUrl ||
      branding.logoLightUrl ||
      organisation.logo_url ||
      organisation.logoUrl ||
      '',
  ).trim()

  return {
    name,
    logoUrl,
    initials: getBuyerLandingInitials(name),
  }
}

function resolveBuyerLandingName(payload = {}, formData = {}) {
  const firstStructuredPurchaser = Array.isArray(formData.purchasers) ? formData.purchasers[0] : null
  const rawName = String(
    firstStructuredPurchaser?.first_name ||
      formData.first_name ||
      formData.full_name ||
      payload?.buyer?.name ||
      '',
  ).trim()

  if (!rawName) {
    return 'there'
  }

  return rawName.split(/\s+/)[0] || rawName
}

function BuyerLandingBrandMark({ brand }) {
  if (brand?.logoUrl) {
    return (
      <span className="inline-flex h-14 min-w-14 max-w-[220px] items-center justify-center rounded-[18px] border border-white/20 bg-white px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <img
          src={brand.logoUrl}
          alt={`${brand.name || 'Agency'} logo`}
          className="max-h-10 w-auto max-w-[190px] object-contain"
        />
      </span>
    )
  }

  return (
    <span className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/20 bg-white/10 text-base font-semibold text-white shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
      {brand?.initials || 'B9'}
    </span>
  )
}

function BuyerOnboardingLanding({ brand, buyerName, propertyLabel, isResume, onStart }) {
  const expectationItems = [
    { label: 'Takes about 10 minutes', icon: Clock3 },
    { label: 'Information is secure', icon: ShieldCheck },
    { label: 'Save and continue later', icon: CheckCircle2 },
  ]

  return (
    <section className="relative min-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[30px] bg-[#101a18] text-white shadow-[0_24px_60px_rgba(15,23,42,0.24)] md:min-h-[720px]">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(145deg, rgba(10,18,22,0.96) 0%, rgba(19,56,42,0.9) 54%, rgba(9,15,18,0.96) 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 56px)',
        }}
      />
      <div className="relative flex min-h-[calc(100dvh-1.5rem)] flex-col px-5 py-6 md:min-h-[720px] md:px-10 md:py-9">
        <div className="flex items-center justify-between gap-4">
          <BuyerLandingBrandMark brand={brand} />
          <span className="inline-flex min-h-9 items-center rounded-full border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white/85 backdrop-blur">
            Buyer onboarding
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-end pb-5 pt-14 md:max-w-[560px] md:pb-7 md:pt-20">
          <p className="text-sm font-semibold text-white/80">{brand?.name}</p>
          <h1 className="mt-4 text-[2.45rem] font-semibold leading-[1.02] tracking-normal text-white md:text-6xl">
            Welcome, <span className="text-[#34c66f]">{buyerName}.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-white/80">
            Let us get your property purchase journey started.
          </p>

          <div className="mt-8 rounded-[22px] border border-white/20 bg-white/95 p-3 text-[#142132] shadow-[0_20px_48px_rgba(0,0,0,0.22)] backdrop-blur">
            <div className="flex items-start gap-3 rounded-[16px] border border-[#e1e8ef] bg-[#f8fbfd] p-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf7ef] text-[#16834a]">
                <Home size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#142132]">Buyer</p>
                <p className="mt-1 text-xs leading-5 text-[#65788f]">
                  {propertyLabel || 'Your selected property'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 px-1">
              {expectationItems.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex items-center gap-3 text-sm font-medium text-[#2f4358]">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#eef8f2] text-[#16834a]">
                      <Icon size={15} />
                    </span>
                    <span>{item.label}</span>
                  </div>
                )
              })}
            </div>

            <Button type="button" onClick={onStart} className="mt-5 w-full min-h-[52px] bg-[#168f43] text-white hover:bg-[#117a38]">
              {isResume ? 'Resume buyer onboarding' : 'Start buyer onboarding'}
              <ChevronRight size={16} />
            </Button>
          </div>

          <p className="mt-6 text-center text-sm font-medium leading-6 text-white/80 md:text-left">
            Your information is secure and protected.
          </p>
        </div>
      </div>
    </section>
  )
}

function isVisibleDetailField(fieldConfig, context) {
  if (typeof fieldConfig?.visibleWhen === 'function') {
    return fieldConfig.visibleWhen(context)
  }
  return true
}

function resolveVisibleFinanceSections({
  values = {},
  purchaserEntityType,
  normalizedFinanceType,
  buyerAppointedBondOriginatorAllowed,
  buyerAppointedBondOriginatorRequiresApproval,
} = {}) {
  const details = normalizeDetailsState(values, {
    purchaserEntityType,
    financeType: normalizedFinanceType,
  })
  const context = {
    financeType: details.financeType,
    purchaserEntityType,
    finance: details.finance,
  }

  return FINANCE_DETAIL_SECTIONS.filter((sectionConfig) => isVisibleDetailField(sectionConfig, context))
    .map((sectionConfig) => {
      if (sectionConfig.key === 'bond_originator_support' && !buyerAppointedBondOriginatorAllowed) {
        return null
      }
      const nextSection = { ...sectionConfig }
      if (sectionConfig.key === 'bond_originator_support') {
        nextSection.title = buyerAppointedBondOriginatorRequiresApproval
          ? 'Nominate Bond Originator'
          : 'Your Bond Originator'
        nextSection.description = buyerAppointedBondOriginatorRequiresApproval
          ? 'Share the bond originator you would like to use. Your agent/developer will review this before the assigned originator changes.'
          : 'Share the bond originator you would like to use for this transaction.'
        nextSection.notice = buyerAppointedBondOriginatorRequiresApproval
          ? 'This request will be routed for approval before the assigned originator changes.'
          : 'This originator can be applied immediately when you submit onboarding.'
      }
      nextSection.fields = (nextSection.fields || [])
        .filter((fieldConfig) => isVisibleDetailField(fieldConfig, context))
        .map((fieldConfig) => {
          if (fieldConfig.key !== 'bond_help_requested') return fieldConfig
          return {
            ...fieldConfig,
            label: buyerAppointedBondOriginatorAllowed
              ? 'Would you like to nominate your own bond originator?'
              : 'Would you like help from the appointed bond originator?',
          }
        })
      return nextSection
    })
    .filter(Boolean)
}

function ClientOnboarding() {
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const onboardingRole = String(searchParams.get('role') || '').trim().toLowerCase()
  const isDemoOnboarding = isBuyerOnboardingDemoToken(token)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState(null)
  const [formData, setFormData] = useState({})
  const [submittedClientPortalPath, setSubmittedClientPortalPath] = useState('')
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [completionBannerVisible, setCompletionBannerVisible] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [touchedFields, setTouchedFields] = useState({})
  const [landingDismissed, setLandingDismissed] = useState(false)
  const [activeMobileDetailPaneIndex, setActiveMobileDetailPaneIndex] = useState(0)
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  )

  const loadData = useCallback(async () => {
    if (!token) {
      setError('Missing onboarding token.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = isDemoOnboarding
        ? getDemoBuyerOnboardingPayload(token)
        : await fetchClientOnboardingByToken(token)
      setSubmittedClientPortalPath('')
      const transactionPurchasePriceValue = normalizeInputValue(data?.transaction?.purchase_price)
      const initialFlow =
        data?.onboardingFlow ||
        resolveBuyerOnboardingFlow(data.formData || {}, data.transaction || {}, {
          purchaserType: data.formData?.purchaser_type || data.purchaserType,
          financeType: data.formData?.purchase_finance_type || data.transaction?.finance_type || 'cash',
        })
      const initialPurchaserType = normalizePurchaserType(initialFlow.purchaser_branch || data.formData?.purchaser_type || data.purchaserType)
      const initialPurchaserEntityType = String(
        data.formData?.purchaser_entity_type || getPurchaserEntityType(initialPurchaserType),
      )
        .trim()
        .toLowerCase()
      const initialFinanceType = normalizeFinanceType(initialFlow.finance_type || data.formData?.purchase_finance_type || data.transaction?.finance_type || 'cash')
      const normalizedDetails = normalizeDetailsState(data.formData || {}, {
        purchaserEntityType: initialPurchaserEntityType,
        financeType: initialFinanceType,
      })
      setPayload({
        ...data,
        onboardingFlow: initialFlow,
      })
      setFormData({
        ...(data.formData || {}),
        purchaser_type: initialPurchaserType,
        purchaser_entity_type: initialPurchaserEntityType,
        natural_person_purchase_mode: normalizedDetails.naturalPersonPurchaseMode,
        purchasers: normalizedDetails.purchasers,
        finance: {
          ...normalizedDetails.finance,
          purchase_price: transactionPurchasePriceValue,
        },
        company: normalizedDetails.company,
        trust: normalizedDetails.trust,
        directors: normalizedDetails.company.directors || [],
        trustees: normalizedDetails.trust.trustees || [],
        purchase_price: transactionPurchasePriceValue,
        purchase_finance_type: initialFinanceType,
        funding_sources: normalizeFundingSources(data.formData?.funding_sources || data.fundingSources || []),
      })
      setCompletionBannerVisible(data?.onboarding?.status === 'Submitted')
      setFieldErrors({})
      setTouchedFields({})
    } catch (loadError) {
      setError(loadError.message || 'Unable to load onboarding form.')
    } finally {
      setLoading(false)
    }
  }, [isDemoOnboarding, token])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setLandingDismissed(false)
  }, [token])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const syncMobileViewport = () => setIsMobileViewport(mediaQuery.matches)
    syncMobileViewport()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncMobileViewport)
      return () => mediaQuery.removeEventListener('change', syncMobileViewport)
    }

    mediaQuery.addListener(syncMobileViewport)
    return () => mediaQuery.removeListener(syncMobileViewport)
  }, [])

  const buyerFlow = useMemo(
    () =>
      resolveBuyerOnboardingFlow(formData, payload?.transaction || {}, {
        purchaserType: formData.purchaser_type || payload?.purchaserType || payload?.transaction?.purchaser_type || 'individual',
        financeType: formData.purchase_finance_type || payload?.transaction?.finance_type || 'cash',
      }),
    [formData, payload?.purchaserType, payload?.transaction],
  )
  const purchaserType = normalizePurchaserType(
    buyerFlow.purchaser_branch || formData.purchaser_type || payload?.purchaserType || 'individual',
  )
  const purchaserEntityType = String(formData.purchaser_entity_type || getPurchaserEntityType(purchaserType)).trim().toLowerCase()
  const isNaturalPersonPurchase = isNaturalPersonEntityType(purchaserEntityType)
  const normalizedFinanceType = normalizeFinanceType(
    buyerFlow.finance_type || formData.purchase_finance_type || payload?.transaction?.finance_type || 'cash',
  )
  const detailsState = useMemo(
    () =>
      normalizeDetailsState(formData, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      }),
    [formData, purchaserEntityType, normalizedFinanceType],
  )
  const naturalPersonPurchaseMode = buyerFlow.purchase_mode === 'co_purchasing' ? 'co_purchasing' : detailsState.naturalPersonPurchaseMode
  const structuredPurchasers = detailsState.purchasers
  const structuredFinance = detailsState.finance
  const structuredCompany = detailsState.company
  const structuredTrust = detailsState.trust
  const rolePlayerPolicy = payload?.rolePlayerPolicy || {}
  const buyerAppointedBondOriginatorAllowed = rolePlayerPolicy.buyerAppointedBondOriginatorAllowed !== false
  const buyerAppointedBondOriginatorRequiresApproval = Boolean(
    rolePlayerPolicy.buyerAppointedBondOriginatorRequiresApproval,
  )
  const visibleFinanceSections = useMemo(
    () =>
      resolveVisibleFinanceSections({
        values: formData,
        purchaserEntityType,
        normalizedFinanceType,
        buyerAppointedBondOriginatorAllowed,
        buyerAppointedBondOriginatorRequiresApproval,
      }),
    [
      buyerAppointedBondOriginatorAllowed,
      buyerAppointedBondOriginatorRequiresApproval,
      formData,
      normalizedFinanceType,
      purchaserEntityType,
    ],
  )
  const visibleFinanceFields = useMemo(
    () => visibleFinanceSections.flatMap((section) => section.fields || []),
    [visibleFinanceSections],
  )
  const unitDevelopment = Array.isArray(payload?.unit?.development)
    ? payload.unit.development[0]
    : payload?.unit?.development
  const transactionAddressLine = [
    payload?.transaction?.property_address_line_1,
    payload?.transaction?.property_address_line_2,
    payload?.transaction?.suburb,
    payload?.transaction?.city,
    payload?.transaction?.province,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ')
  const propertyAddressLine = String(
    payload?.unit?.address ||
      payload?.transaction?.property_address ||
      payload?.transaction?.propertyAddress ||
      transactionAddressLine ||
      '',
  ).trim()
  const onboardingLocationLabel = propertyAddressLine
    ? propertyAddressLine
    : [unitDevelopment?.name, payload?.unit?.unit_number ? `Unit ${payload.unit.unit_number}` : '']
        .filter(Boolean)
        .join(' | ')
  const clientPortalPath = String(submittedClientPortalPath || payload?.clientPortalPath || '').trim()
  const fundingSources = normalizeFundingSources(formData.funding_sources || payload?.fundingSources || [])
  const baseStepDefinitions = useMemo(
    () =>
      getOnboardingStepDefinitions({ ...formData, funding_sources: fundingSources }, { transaction: payload?.transaction }).filter(
        (step) => step.key !== 'intro',
      ),
    [formData, fundingSources, payload?.transaction],
  )
  const stepDefinitions = useMemo(
    () => [
      ...baseStepDefinitions.filter((step) => step.key !== 'review'),
      {
        key: 'review',
        title: 'Review & Submit',
        description: 'Check your buyer, property, finance, and document next steps before submitting.',
      },
    ],
    [baseStepDefinitions],
  )
  const journeySteps = useMemo(
    () =>
      stepDefinitions.map((step, index) => ({
        ...step,
        index,
        shortLabel: getJourneyStepLabel(step, index),
      })),
    [stepDefinitions],
  )
  const activeStep = stepDefinitions[activeStepIndex] || stepDefinitions[0]
  const totalJourneySteps = Math.max(journeySteps.length, 1)
  const mobileProgressStepIndex = Math.min(Math.max(activeStepIndex, 0), totalJourneySteps - 1)
  const mobileProgressPercent = Math.round(((mobileProgressStepIndex + 1) / totalJourneySteps) * 100)
  const mobileStepLabel = journeySteps[mobileProgressStepIndex]?.shortLabel || journeySteps[0]?.shortLabel || 'Step'
  const submissionComplete = completionBannerVisible || payload?.onboarding?.status === 'Submitted'
  const onboardingBrand = useMemo(() => resolveBuyerLandingBrand(payload), [payload])
  const buyerLandingName = useMemo(() => resolveBuyerLandingName(payload, formData), [payload, formData])
  const isResumingOnboarding = Boolean(
    payload?.onboarding?.status && !['Not Started', 'Submitted'].includes(payload.onboarding.status),
  )
  const showLandingPage = !submissionComplete && !landingDismissed
  const mobileDetailPanes = useMemo(() => {
    const panes = []

    if (isNaturalPersonPurchase) {
      panes.push({
        key: 'purchase-mode',
        type: 'purchase_mode',
        title: 'Purchase Mode',
        description: 'Tell us whether you are buying alone or with another purchaser.',
      })

      structuredPurchasers.forEach((purchaser, purchaserIndex) => {
        if (purchaserIndex > 0 && naturalPersonPurchaseMode !== 'co_purchasing') {
          return
        }

        NATURAL_PURCHASER_SECTIONS.forEach((sectionConfig) => {
          const fields = sectionConfig.fields.filter((fieldConfig) =>
            isVisibleDetailField(fieldConfig, {
              purchaser,
              purchaserIndex,
              financeType: normalizedFinanceType,
              purchaserEntityType,
              purchaseMode: naturalPersonPurchaseMode,
            }),
          )

          if (!fields.length) {
            return
          }

          panes.push({
            key: `purchaser-${purchaserIndex}-${sectionConfig.key}`,
            type: 'natural_section',
            title: sectionConfig.title,
            description: sectionConfig.description || `Purchaser ${purchaserIndex + 1} details.`,
            purchaser,
            purchaserIndex,
            fields,
          })
        })
      })
    } else {
      const entityKey = purchaserEntityType === 'trust' ? 'trust' : 'company'
      const entityTitle = purchaserEntityType === 'trust' ? 'Trust' : 'Company'
      const entityState = purchaserEntityType === 'trust' ? structuredTrust : structuredCompany
      const entityFields = purchaserEntityType === 'trust' ? TRUST_DETAIL_FIELDS : COMPANY_DETAIL_FIELDS
      const entityFieldGroups =
        purchaserEntityType === 'trust'
          ? [
              {
                key: 'identity',
                title: 'Trust Details',
                description: 'Capture the trust registration and authority basics.',
                fieldKeys: ['trust_name', 'trust_registration_number', 'trust_type', 'masters_office_reference', 'trust_tax_number'],
              },
              {
                key: 'address',
                title: 'Trust Address',
                description: 'Confirm the registered trust address.',
                fieldKeys: ['trust_registered_address'],
              },
              {
                key: 'authority',
                title: 'Trustee Authority',
                description: 'Confirm the authorised trustee and available trust documents.',
                fieldKeys: [
                  'authorised_trustee_name',
                  'authorised_trustee_identity_number',
                  'authorised_trustee_email',
                  'authorised_trustee_phone',
                  'trust_deed_available',
                  'letters_of_authority_available',
                  'trust_resolution_available',
                  'all_trustees_signing',
                ],
              },
            ]
          : [
              {
                key: 'identity',
                title: 'Company Details',
                description: 'Capture the company registration and tax basics.',
                fieldKeys: ['company_name', 'company_registration_number', 'nature_of_business', 'company_tax_number', 'vat_number'],
              },
              {
                key: 'address',
                title: 'Company Address',
                description: 'Confirm the registered and business addresses.',
                fieldKeys: ['company_registered_address', 'company_business_address'],
              },
              {
                key: 'authority',
                title: 'Signing Authority',
                description: 'Confirm who is authorised to sign for the company.',
                fieldKeys: [
                  'authorised_signatory_name',
                  'authorised_signatory_identity_number',
                  'authorised_signatory_email',
                  'authorised_signatory_phone',
                  'authorised_signatory_capacity',
                  'board_resolution_available',
                ],
              },
            ]

      entityFieldGroups.forEach((group) => {
        const fields = entityFields.filter((fieldConfig) => group.fieldKeys.includes(fieldConfig.key))
        if (!fields.length) {
          return
        }

        panes.push({
          key: `${entityKey}-${group.key}`,
          type: 'entity_fields',
          title: group.title,
          description: group.description,
          entityKey,
          entityTitle,
          entityState,
          fields,
        })
      })

      panes.push({
        key: `${entityKey}-associated-people`,
        type: 'associated_people',
        title: purchaserEntityType === 'trust' ? 'Additional Trustees' : 'Directors / Owners',
        description:
          purchaserEntityType === 'trust'
            ? 'Add any other trustees involved in the trust.'
            : 'Add the directors or beneficial owners involved in the company.',
        collectionKey: purchaserEntityType === 'trust' ? 'trust.trustees' : 'company.directors',
        items: purchaserEntityType === 'trust' ? structuredTrust.trustees || [] : structuredCompany.directors || [],
      })
    }

    visibleFinanceSections.forEach((sectionConfig) => {
      panes.push({
        key: `finance-${sectionConfig.key}`,
        type: 'finance_section',
        title: sectionConfig.title,
        description: sectionConfig.description || '',
        notice: sectionConfig.notice || '',
        fields: sectionConfig.fields || [],
      })
    })

    return panes
  }, [
    isNaturalPersonPurchase,
    naturalPersonPurchaseMode,
    normalizedFinanceType,
    purchaserEntityType,
    structuredCompany,
    structuredPurchasers,
    structuredTrust,
    visibleFinanceSections,
  ])
  const activeMobileDetailPane = mobileDetailPanes[activeMobileDetailPaneIndex] || mobileDetailPanes[0] || null
  const isMobileDetailFlowActive = Boolean(
    isMobileViewport && activeStep?.key === 'details' && mobileDetailPanes.length > 0,
  )
  const isLastMobileDetailPane = activeMobileDetailPaneIndex >= Math.max(mobileDetailPanes.length - 1, 0)
  const mobileQuestionTotal = Math.max(
    stepDefinitions.reduce(
      (total, step) => total + (step.key === 'details' ? Math.max(mobileDetailPanes.length, 1) : 1),
      0,
    ),
    1,
  )
  const mobileQuestionPosition = Math.min(
    Math.max(
      activeStep?.key === 'details'
        ? stepDefinitions
            .slice(0, activeStepIndex)
            .reduce((total, step) => total + (step.key === 'details' ? Math.max(mobileDetailPanes.length, 1) : 1), 0) +
          activeMobileDetailPaneIndex +
          1
        : stepDefinitions
            .slice(0, activeStepIndex + 1)
            .reduce((total, step) => total + (step.key === 'details' ? Math.max(mobileDetailPanes.length, 1) : 1), 0),
      1,
    ),
    mobileQuestionTotal,
  )
  const mobileQuestionProgressPercent = Math.round((mobileQuestionPosition / mobileQuestionTotal) * 100)
  const mobileQuestionTitle =
    activeStep?.key === 'details'
      ? activeMobileDetailPane?.title || activeStep?.title || 'Buyer details'
      : activeStep?.title || 'Buyer onboarding'
  const mobileQuestionDescription =
    activeStep?.key === 'details'
      ? activeMobileDetailPane?.description || activeStep?.description || ''
      : activeStep?.description || ''
  const isLastStep = activeStepIndex >= Math.max(stepDefinitions.length - 1, 0)
  const shouldAdvanceMobileDetailPane = isMobileDetailFlowActive && !isLastMobileDetailPane
  const shouldShowBackButton = activeStepIndex > 0 || (isMobileDetailFlowActive && activeMobileDetailPaneIndex > 0)
  const primaryActionLabel = shouldAdvanceMobileDetailPane ? 'Continue' : isLastStep ? 'Submit Onboarding' : isMobileViewport ? 'Continue' : 'Next Step'
  const buyerFlowSummaryItems = [
    {
      label: 'Property',
      value: onboardingLocationLabel || 'Selected property',
    },
    {
      label: 'Buyer',
      value: buyerFlow.branch_summary?.purchaser?.label || purchaserType || 'Individual',
    },
    {
      label: 'Finance',
      value:
        buyerFlow.branch_summary?.finance?.label ||
        buyerFlow.buyer_finance_branch_label ||
        normalizedFinanceType ||
        'Cash',
    },
    {
      label: 'Step',
      value: `Step ${mobileProgressStepIndex + 1} of ${totalJourneySteps}`,
    },
  ]
  const purchaserEntityLabel = formatReviewOption(PURCHASER_ENTITY_OPTIONS, purchaserEntityType, 'Individual purchaser')
  const naturalPurchaseModeLabel =
    naturalPersonPurchaseMode === 'co_purchasing' ? 'Co-purchasing' : 'Individual purchase'
  const financeTypeReviewLabel = formatFinanceTypeForWhatsApp(normalizedFinanceType)
  const requiredDocumentItems = Array.isArray(payload?.requiredDocuments) ? payload.requiredDocuments : []
  const completedDocumentCount = requiredDocumentItems.filter((item) => item?.complete).length
  const outstandingDocumentItems = requiredDocumentItems.filter((item) => !item?.complete).slice(0, 3)
  const reviewBuyerDetailPaneKey = isNaturalPersonPurchase
    ? 'purchaser-0-personal_details'
    : purchaserEntityType === 'trust'
      ? 'trust-identity'
      : 'company-identity'
  const reviewFinanceDetailPaneKey = mobileDetailPanes.find((pane) => pane.key === 'finance-finance_totals')
    ? 'finance-finance_totals'
    : mobileDetailPanes.find((pane) => pane.type === 'finance_section')?.key || ''

  useEffect(() => {
    if (!stepDefinitions.length) {
      setActiveStepIndex(0)
      return
    }

    setActiveStepIndex((previous) => Math.min(previous, stepDefinitions.length - 1))
  }, [stepDefinitions.length])

  useEffect(() => {
    if (activeStep?.key !== 'details') {
      setActiveMobileDetailPaneIndex(0)
    }
  }, [activeStep?.key])

  useEffect(() => {
    setActiveMobileDetailPaneIndex((previous) => Math.min(previous, Math.max(mobileDetailPanes.length - 1, 0)))
  }, [mobileDetailPanes.length])

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
        directors: normalized.company.directors || [],
        trustees: normalized.trust.trustees || [],
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
    return isVisibleDetailField(fieldConfig, context)
  }

  function detailFieldPath(group, index, fieldKey) {
    if (group === 'purchasers') {
      return `purchasers.${index}.${fieldKey}`
    }
    return `${group}.${fieldKey}`
  }

  function collectionFieldPath(group, index, fieldKey) {
    return `${group}.${index}.${fieldKey}`
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

  function getVisibleRepeatablePeopleFields(items = [], groupKey = '') {
    return items.flatMap((item, itemIndex) =>
      ASSOCIATED_PERSON_FIELDS.filter((fieldConfig) =>
        isDetailFieldVisible(fieldConfig, {
          item,
          itemIndex,
          groupKey,
          purchaserEntityType,
        }),
      ).map((fieldConfig) => collectionFieldPath(groupKey, itemIndex, fieldConfig.key)),
    )
  }

  function getVisibleFinanceSections(values = formData) {
    return resolveVisibleFinanceSections({
      values,
      purchaserEntityType,
      normalizedFinanceType,
      buyerAppointedBondOriginatorAllowed,
      buyerAppointedBondOriginatorRequiresApproval,
    })
  }

  function getVisibleFinanceFields(values = formData) {
    return getVisibleFinanceSections(values).flatMap((section) => section.fields || [])
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
      keys.push(...getVisibleRepeatablePeopleFields(details.company.directors || [], 'company.directors'))
    }

    if (purchaserEntityType === 'trust') {
      TRUST_DETAIL_FIELDS.forEach((fieldConfig) => {
        keys.push(detailFieldPath('trust', 0, fieldConfig.key))
      })
      keys.push(...getVisibleRepeatablePeopleFields(details.trust.trustees || [], 'trust.trustees'))
    }

    getVisibleFinanceFields(values).forEach((fieldConfig) => {
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

    function requirePositiveFinanceAmount(pathKey, label, value) {
      if (nextErrors[pathKey] || !normalizeInputValue(value)) {
        return
      }
      const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
      if (!Number.isFinite(parsed) || parsed < 0 || parsed === 0) {
        nextErrors[pathKey] = `${label} must be greater than zero.`
      }
    }

    function requireNonNegativeFinanceAmount(pathKey, label, value) {
      if (nextErrors[pathKey] || !normalizeInputValue(value)) {
        return
      }
      const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
      if (!Number.isFinite(parsed) || parsed < 0) {
        nextErrors[pathKey] = `${label} must be zero or greater.`
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

      if (details.naturalPersonPurchaseMode === 'co_purchasing') {
        let ownershipShareTotal = 0
        let ownershipShareCount = 0

        details.purchasers.forEach((purchaser, purchaserIndex) => {
          const sharePath = detailFieldPath('purchasers', purchaserIndex, 'ownership_share')
          const consentPath = detailFieldPath('purchasers', purchaserIndex, 'consent_to_purchase')
          requireField(sharePath, `Purchaser ${purchaserIndex + 1} Ownership Share`, purchaser.ownership_share, {
            type: 'number',
            required: true,
          })
          const numericShare = Number(String(purchaser.ownership_share || '').replace(/[^\d.-]/g, ''))
          if (!Number.isFinite(numericShare)) {
            nextErrors[sharePath] = 'Ownership Share must be a valid number.'
          } else if (numericShare <= 0 || numericShare > 100) {
            nextErrors[sharePath] = 'Ownership Share must be between 1 and 100.'
          } else {
            ownershipShareTotal += numericShare
            ownershipShareCount += 1
          }
          requireField(consentPath, `Purchaser ${purchaserIndex + 1} Consent to Purchase`, purchaser.consent_to_purchase, {
            type: 'select',
            required: true,
          })
        })

        if (ownershipShareCount === details.purchasers.length && Math.abs(ownershipShareTotal - 100) > 0.5) {
          nextErrors['purchasers.ownership_share_total'] = 'Ownership shares must add up to 100%.'
        }
      }
    } else if (purchaserEntityType === 'company') {
      COMPANY_DETAIL_FIELDS.forEach((fieldConfig) => {
        const pathKey = detailFieldPath('company', 0, fieldConfig.key)
        requireField(pathKey, fieldConfig.label, details.company[fieldConfig.key], {
          type: fieldConfig.type,
          required: fieldConfig.required,
        })
      })
      const populatedDirectors = (details.company.directors || []).filter((director) => hasAssociatedPersonData(director, 'Director'))
      if (!populatedDirectors.length) {
        nextErrors['company.directors'] = 'Add at least one director or beneficial owner.'
      }
      ;(details.company.directors || []).forEach((director, directorIndex) => {
        if (!hasAssociatedPersonData(director, 'Director')) {
          return
        }
        ASSOCIATED_PERSON_FIELDS.forEach((fieldConfig) => {
          const isVisible = isDetailFieldVisible(fieldConfig, {
            item: director,
            itemIndex: directorIndex,
            groupKey: 'company.directors',
            purchaserEntityType,
          })
          if (!isVisible) {
            return
          }
          const pathKey = collectionFieldPath('company.directors', directorIndex, fieldConfig.key)
          const shouldRequire = fieldConfig.required !== false
          requireField(pathKey, `Director ${directorIndex + 1} ${fieldConfig.label}`, director[fieldConfig.key], {
            type: fieldConfig.type,
            required: shouldRequire,
          })
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
      const populatedTrustees = (details.trust.trustees || []).filter((trustee) => hasAssociatedPersonData(trustee, 'Trustee'))
      if (!populatedTrustees.length) {
        nextErrors['trust.trustees'] = 'Add at least one trustee.'
      }
      ;(details.trust.trustees || []).forEach((trustee, trusteeIndex) => {
        if (!hasAssociatedPersonData(trustee, 'Trustee')) {
          return
        }
        ASSOCIATED_PERSON_FIELDS.forEach((fieldConfig) => {
          const isVisible = isDetailFieldVisible(fieldConfig, {
            item: trustee,
            itemIndex: trusteeIndex,
            groupKey: 'trust.trustees',
            purchaserEntityType,
          })
          if (!isVisible) {
            return
          }
          const pathKey = collectionFieldPath('trust.trustees', trusteeIndex, fieldConfig.key)
          const shouldRequire = fieldConfig.required !== false
          requireField(pathKey, `Trustee ${trusteeIndex + 1} ${fieldConfig.label}`, trustee[fieldConfig.key], {
            type: fieldConfig.type,
            required: shouldRequire,
          })
        })
      })
    }

    visibleFinanceFields.forEach((fieldConfig) => {
      const pathKey = detailFieldPath('finance', 0, fieldConfig.key)
      const shouldRequire =
        (typeof fieldConfig.requiredWhen === 'function'
          ? fieldConfig.requiredWhen({ financeType: normalizedFinanceType, purchaserEntityType, finance: details.finance })
          : fieldConfig.required) !== false
      const value = details.finance[fieldConfig.key]
      requireField(pathKey, fieldConfig.label, value, {
        type: fieldConfig.type,
        required: shouldRequire,
      })
      if (fieldConfig.type === 'number' && normalizeInputValue(value)) {
        if (fieldConfig.allowZero) {
          requireNonNegativeFinanceAmount(pathKey, fieldConfig.label, value)
        } else {
          requirePositiveFinanceAmount(pathKey, fieldConfig.label, value)
        }
      }
    })

    return nextErrors
  }, [isNaturalPersonPurchase, normalizedFinanceType, purchaserEntityType, visibleFinanceFields])

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
        current.marital_regime = ''
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
        if (!buyerAppointedBondOriginatorAllowed || normalizeYesNoChoice(value) !== 'yes') {
          nextFinance.bond_originator_name = ''
          nextFinance.bond_originator_contact = ''
        }
      }
      if (fieldKey === 'ooba_assist_requested') {
        nextFinance.bond_help_requested = normalizeYesNoChoice(value)
        if (!buyerAppointedBondOriginatorAllowed || normalizeYesNoChoice(value) !== 'yes') {
          nextFinance.bond_originator_name = ''
          nextFinance.bond_originator_contact = ''
        }
      }
      if (fieldKey === 'bond_process_started' && normalizeYesNoChoice(value) !== 'yes') {
        nextFinance.bond_bank_name = ''
      }
      if (fieldKey === 'deposit_source') {
        nextFinance.cash_contribution_source = value
      }
      if (fieldKey === 'cash_contribution_source') {
        nextFinance.deposit_source = value
      }
      if (fieldKey === 'cash_contribution_available' && !normalizeInputValue(value)) {
        nextFinance.deposit_source = ''
        nextFinance.cash_contribution_source = ''
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

  function updateCompanyDirectorField(index, fieldKey, value) {
    setFormData((previous) => {
      const details = normalizeDetailsState(previous, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      })
      const directors = [...(details.company.directors || [])]
      const current = { ...(directors[index] || createEmptyAssociatedPerson('Director')) }
      current[fieldKey] = value
      directors[index] = current
      return {
        ...previous,
        company: {
          ...(previous.company || createEmptyCompany()),
          directors,
        },
        directors,
      }
    })
  }

  function addCompanyDirector() {
    setFormData((previous) => {
      const details = normalizeDetailsState(previous, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      })
      const directors = [...(details.company.directors || []), createEmptyAssociatedPerson('Director')]
      return {
        ...previous,
        company: {
          ...(previous.company || createEmptyCompany()),
          directors,
        },
        directors,
      }
    })
  }

  function removeCompanyDirector(index) {
    setFormData((previous) => {
      const details = normalizeDetailsState(previous, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      })
      const directors = (details.company.directors || []).filter((_, itemIndex) => itemIndex !== index)
      return {
        ...previous,
        company: {
          ...(previous.company || createEmptyCompany()),
          directors,
        },
        directors,
      }
    })
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

  function updateTrusteeField(index, fieldKey, value) {
    setFormData((previous) => {
      const details = normalizeDetailsState(previous, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      })
      const trustees = [...(details.trust.trustees || [])]
      const current = { ...(trustees[index] || createEmptyAssociatedPerson('Trustee')) }
      current[fieldKey] = value
      trustees[index] = current
      return {
        ...previous,
        trust: {
          ...(previous.trust || createEmptyTrust()),
          trustees,
        },
        trustees,
      }
    })
  }

  function addTrustee() {
    setFormData((previous) => {
      const details = normalizeDetailsState(previous, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      })
      const trustees = [...(details.trust.trustees || []), createEmptyAssociatedPerson('Trustee')]
      return {
        ...previous,
        trust: {
          ...(previous.trust || createEmptyTrust()),
          trustees,
        },
        trustees,
      }
    })
  }

  function removeTrustee(index) {
    setFormData((previous) => {
      const details = normalizeDetailsState(previous, {
        purchaserEntityType,
        financeType: normalizedFinanceType,
      })
      const trustees = (details.trust.trustees || []).filter((_, itemIndex) => itemIndex !== index)
      return {
        ...previous,
        trust: {
          ...(previous.trust || createEmptyTrust()),
          trustees,
        },
        trustees,
      }
    })
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
      if (isDemoOnboarding) {
        setPayload((previous) => ({
          ...(previous || getDemoBuyerOnboardingPayload(token)),
          formData: submissionData,
          onboarding: {
            ...((previous || {}).onboarding || getDemoBuyerOnboardingPayload(token).onboarding),
            status: 'In Progress',
            updatedAt: new Date().toISOString(),
          },
        }))
        setFormData((previous) => ({ ...previous, ...submissionData }))
        return
      }
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
      if (isDemoOnboarding) {
        setPayload((previous) => ({
          ...(previous || getDemoBuyerOnboardingPayload(token)),
          formData: submissionData,
          onboarding: {
            ...((previous || {}).onboarding || getDemoBuyerOnboardingPayload(token).onboarding),
            status: 'Submitted',
            submittedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }))
        setCompletionBannerVisible(true)
        return
      }
      const submitResult = await submitClientOnboarding({
        token,
        formData: submissionData,
      })
      const nextClientPortalPath = String(submitResult?.clientPortalPath || payload?.clientPortalPath || '').trim()
      setSubmittedClientPortalPath(nextClientPortalPath)
      const submittedTransactionId = String(
        submitResult?.transactionId || payload?.transaction?.id || '',
      ).trim()
      if (submittedTransactionId && isSupabaseConfigured && supabase) {
        void (async () => {
          try {
            const { data: onboardingSubmittedEmailResult, error: onboardingSubmittedEmailError } =
              await invokeEdgeFunction('send-email', {
                body: {
                  type: 'onboarding_submitted',
                  transactionId: submittedTransactionId,
                },
              })

            if (onboardingSubmittedEmailError) {
              const message = await parseEdgeFunctionError(
                onboardingSubmittedEmailError,
                'Onboarding submitted email failed to send.',
              )
              console.warn('[ClientOnboarding] onboarding_submitted email invoke failed:', message)
            } else if (onboardingSubmittedEmailResult?.sent === false) {
              const reason =
                onboardingSubmittedEmailResult?.error ||
                onboardingSubmittedEmailResult?.reason ||
                'unknown_reason'
              console.warn('[ClientOnboarding] onboarding_submitted email was skipped:', reason)
            }
          } catch (emailError) {
            console.warn(
              '[ClientOnboarding] onboarding_submitted email unexpected error:',
              emailError?.message || String(emailError),
            )
          }

          try {
            const whatsappContext = await resolveOnboardingWhatsAppContacts({
              token,
              transactionId: submittedTransactionId,
            })

            const payloadDevelopmentName = normalizeWhatsappLabel(
              Array.isArray(payload?.unit?.development)
                ? payload?.unit?.development?.[0]?.name
                : payload?.unit?.development?.name,
            )
            const payloadUnitReference = normalizeWhatsappLabel(
              payload?.unit?.unit_number ? `Unit ${payload.unit.unit_number}` : '',
            )

            const developmentName = normalizeWhatsappLabel(
              whatsappContext?.developmentName || payloadDevelopmentName,
              'the development',
            )
            const unitReference = normalizeWhatsappLabel(
              whatsappContext?.unitReference || payloadUnitReference,
              'the property',
            )
            const clientName = normalizeWhatsappLabel(
              whatsappContext?.client?.name || payload?.buyer?.name || formData?.full_name,
              'Client',
            )
            const financeTypeValue = normalizeWhatsappLabel(
              whatsappContext?.financeType || normalizedFinanceType,
              '',
            )
            const financeTypeLabel = formatFinanceTypeForWhatsApp(financeTypeValue)
            const clientPhone = normalizeWhatsappLabel(whatsappContext?.client?.phone || payload?.buyer?.phone, '')
            const agentPhone = normalizeWhatsappLabel(whatsappContext?.agent?.phone, '')
            const developerPhone = normalizeWhatsappLabel(whatsappContext?.developer?.phone, '')
            const attorneyPhone = normalizeWhatsappLabel(whatsappContext?.attorney?.phone, '')
            const bondOriginatorPhone = normalizeWhatsappLabel(whatsappContext?.bondOriginator?.phone, '')
            const normalizedClientPortalPath = String(nextClientPortalPath || clientPortalPath || '').trim()
            const clientPortalLink = normalizedClientPortalPath
              ? `${window.location.origin}${normalizedClientPortalPath.startsWith('/') ? normalizedClientPortalPath : `/${normalizedClientPortalPath}`}`
              : `${window.location.origin}/client-access`
            const reservationRequiredFromTransaction = toBooleanLike(payload?.transaction?.reservation_required)
            const reservationRequiredFromPayloadForm = toBooleanLike(payload?.formData?.reservation_required)
            const reservationRequiredFromLiveForm = toBooleanLike(formData?.reservation_required)
            const reservationAmountValue = Number(
              payload?.transaction?.reservation_amount ??
                payload?.formData?.reservation_amount ??
                formData?.reservation_amount,
            )
            const formattedReservationAmount =
              Number.isFinite(reservationAmountValue) && reservationAmountValue > 0
                ? currency.format(reservationAmountValue)
                : 'Amount pending'
            const reservationPaymentDetails = normalizeWhatsappReservationPaymentDetails(
              payload?.transaction?.reservation_payment_details ||
                payload?.formData?.reservation_payment_details ||
                formData?.reservation_payment_details ||
                {},
            )
            const hasReservationPaymentDetails = Boolean(
              reservationPaymentDetails.accountHolderName ||
                reservationPaymentDetails.bankName ||
                reservationPaymentDetails.accountNumber ||
                reservationPaymentDetails.branchCode ||
                reservationPaymentDetails.accountType ||
                reservationPaymentDetails.paymentReference ||
                reservationPaymentDetails.paymentInstructions,
            )
            const shouldSendReservationDetailsWhatsApp =
              reservationRequiredFromTransaction ||
              reservationRequiredFromPayloadForm ||
              reservationRequiredFromLiveForm ||
              (Number.isFinite(reservationAmountValue) && reservationAmountValue > 0) ||
              hasReservationPaymentDetails
            const reservationReference = normalizeWhatsappLabel(
              reservationPaymentDetails.paymentReference,
              'Use your client/transaction reference',
            )

            console.log('[WhatsApp Debug] onboarding-submitted role phones', {
              transactionId: submittedTransactionId,
              clientPhone,
              agentPhone,
              developerPhone,
              attorneyPhone,
              bondOriginatorPhone,
              reservationRequiredFromTransaction,
              reservationRequiredFromPayloadForm,
              reservationRequiredFromLiveForm,
              shouldSendReservationDetailsWhatsApp,
              reservationAmountValue,
            })

            console.log('[WhatsApp Debug] send attempt', {
              transactionId: submittedTransactionId,
              role: 'client',
              phone: clientPhone,
            })
            const onboardingThankYouResult = await sendWhatsAppNotification({
              to: clientPhone,
              role: 'client',
              message: [
                `Hi ${clientName},`,
                '',
                `Thank you — we’ve received your onboarding for ${developmentName} – ${unitReference}.`,
                '',
                'Based on your submission, the next step is to upload the required supporting documents. These will vary depending on your profile and finance structure.',
                '',
                'Please log into your client portal to view and upload your documents:',
                clientPortalLink,
                '',
                'This ensures we can:',
                '• Prepare your agreement correctly',
                '• Progress your transaction without delays',
                '• Keep all role-players aligned',
                '',
                'You’ll continue to receive updates as your transaction progresses.',
                '',
                '– Arch9',
              ].join('\n'),
            })

            if (shouldSendReservationDetailsWhatsApp) {
              if (!onboardingThankYouResult?.ok) {
                console.warn('[WhatsApp Debug] reservation deposit details skipped: thank-you message not sent', {
                  transactionId: submittedTransactionId,
                  clientPhone,
                  reason: onboardingThankYouResult?.reason || 'unknown',
                })
              } else {
                console.log('[WhatsApp Debug] reservation deposit details delayed send scheduled', {
                  transactionId: submittedTransactionId,
                  delayMs: 10000,
                  clientPhone,
                })
                await new Promise((resolve) => setTimeout(resolve, 10000))

                console.log('[WhatsApp Debug] reservation deposit details send attempt', {
                  transactionId: submittedTransactionId,
                  clientPhone,
                  amount: formattedReservationAmount,
                  bankName: reservationPaymentDetails.bankName,
                  accountHolderName: reservationPaymentDetails.accountHolderName,
                })
                const reservationDetailsResult = await sendWhatsAppNotification({
                  to: clientPhone,
                  role: 'client_reservation_deposit',
                  message: [
                    `Hi ${clientName},`,
                    '',
                    `As part of securing your property at ${developmentName} – ${unitReference}, a reservation deposit is required.`,
                    '',
                    `Deposit Amount: ${formattedReservationAmount}`,
                    `Reference: ${reservationReference}`,
                    '',
                    'Banking details:',
                    reservationPaymentDetails.accountHolderName
                      ? `Account Name: ${reservationPaymentDetails.accountHolderName}`
                      : null,
                    reservationPaymentDetails.bankName
                      ? `Bank Name: ${reservationPaymentDetails.bankName}`
                      : null,
                    reservationPaymentDetails.accountNumber
                      ? `Account Number: ${reservationPaymentDetails.accountNumber}`
                      : null,
                    reservationPaymentDetails.branchCode
                      ? `Branch Code: ${reservationPaymentDetails.branchCode}`
                      : null,
                    reservationPaymentDetails.accountType
                      ? `Account Type: ${reservationPaymentDetails.accountType}`
                      : null,
                    reservationPaymentDetails.paymentInstructions
                      ? `Payment Notes: ${reservationPaymentDetails.paymentInstructions}`
                      : null,
                    '',
                    'Next steps:',
                    '1. Make payment using the banking details above.',
                    `2. Use the provided reference exactly: ${reservationReference}.`,
                    '3. Upload your proof of payment in your client portal Documents > Sales Documents > Reservation Deposit Proof of Payment.',
                    '',
                    `Client portal: ${clientPortalLink}`,
                    '',
                    'Once payment is received, our team will continue with the next transaction steps.',
                    '',
                    '– Arch9',
                  ]
                    .filter(Boolean)
                    .join('\n'),
                })
                if (reservationDetailsResult?.ok) {
                  console.log('[WhatsApp Debug] reservation deposit details sent', {
                    transactionId: submittedTransactionId,
                    clientPhone,
                  })
                } else if (reservationDetailsResult?.skipped) {
                  console.warn('[WhatsApp Debug] reservation deposit details skipped', {
                    transactionId: submittedTransactionId,
                    clientPhone,
                    reason: reservationDetailsResult?.reason || 'unknown',
                  })
                } else {
                  console.error('[WhatsApp Debug] reservation deposit details failed', {
                    transactionId: submittedTransactionId,
                    clientPhone,
                    error: reservationDetailsResult?.error || reservationDetailsResult,
                  })
                }
              }
            } else {
              console.log('[WhatsApp Debug] reservation deposit details skipped: reservation not enabled', {
                transactionId: submittedTransactionId,
              })
            }

            console.log('[WhatsApp Debug] send attempt', {
              transactionId: submittedTransactionId,
              role: 'agent',
              phone: agentPhone,
            })
            await sendWhatsAppNotification({
              to: agentPhone,
              role: 'agent',
              message: `${clientName} has submitted onboarding for ${unitReference} at ${developmentName}.\n\nNext step: generate the OTP.`,
            })

            console.log('[WhatsApp Debug] send attempt', {
              transactionId: submittedTransactionId,
              role: 'developer',
              phone: developerPhone,
            })
            await sendWhatsAppNotification({
              to: developerPhone,
              role: 'developer',
              message: `${clientName} has submitted onboarding for ${unitReference} at ${developmentName}.\n\nNext step: review the information and generate the OTP.`,
            })

            console.log('[WhatsApp Debug] send attempt', {
              transactionId: submittedTransactionId,
              role: 'attorney',
              phone: attorneyPhone,
            })
            await sendWhatsAppNotification({
              to: attorneyPhone,
              role: 'attorney',
              message: `${clientName} has submitted onboarding for ${unitReference} at ${developmentName}.\n\nThe transaction information is now ready for review.`,
            })

            if (isBondOrHybridFinanceTypeForWhatsApp(financeTypeValue)) {
              console.log('[WhatsApp Debug] send attempt', {
                transactionId: submittedTransactionId,
                role: 'bond_originator',
                phone: bondOriginatorPhone,
              })
              await sendWhatsAppNotification({
                to: bondOriginatorPhone,
                role: 'bond_originator',
                message: `${clientName} has submitted onboarding for ${unitReference} at ${developmentName}.\n\nFinance type: ${financeTypeLabel}\n\nPlease review the buyer information and begin the bond application process.`,
              })
            }
          } catch (whatsappError) {
            console.error(
              '[ClientOnboarding] onboarding-submitted WhatsApp automation failed:',
              whatsappError?.message || String(whatsappError),
            )
          }
        })()
      } else if (!submittedTransactionId) {
        console.warn('[ClientOnboarding] onboarding_submitted email skipped: missing transaction id')
      }
      setCompletionBannerVisible(true)
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

      if (activeStep?.key === 'details' || activeStep?.key === 'review') {
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

  function getMobileDetailPaneFieldKeys(pane = activeMobileDetailPane) {
    if (!pane) {
      return []
    }

    if (pane.type === 'purchase_mode') {
      return ['natural_person_purchase_mode']
    }

    if (pane.type === 'natural_section') {
      const keys = (pane.fields || []).map((fieldConfig) =>
        detailFieldPath('purchasers', pane.purchaserIndex || 0, fieldConfig.key),
      )
      if ((pane.fields || []).some((fieldConfig) => fieldConfig.key === 'ownership_share')) {
        keys.push('purchasers.ownership_share_total')
      }
      return keys
    }

    if (pane.type === 'entity_fields') {
      return (pane.fields || []).map((fieldConfig) => detailFieldPath(pane.entityKey, 0, fieldConfig.key))
    }

    if (pane.type === 'associated_people') {
      return [
        pane.collectionKey,
        ...getVisibleRepeatablePeopleFields(pane.items || [], pane.collectionKey),
      ].filter(Boolean)
    }

    if (pane.type === 'finance_section') {
      return (pane.fields || []).map((fieldConfig) => detailFieldPath('finance', 0, fieldConfig.key))
    }

    return []
  }

  function validateActiveMobileDetailPane() {
    const pane = activeMobileDetailPane
    if (!pane) {
      return true
    }

    const detailErrors = validateDetailsStep(formData)
    const paneFieldKeys = getMobileDetailPaneFieldKeys(pane)
    const touched = paneFieldKeys.reduce((accumulator, key) => ({ ...accumulator, [key]: true }), {})
    setFieldErrors(detailErrors)
    setTouchedFields((previous) => ({ ...previous, ...touched }))

    const firstPaneErrorKey = paneFieldKeys.find((key) => detailErrors[key])
    if (firstPaneErrorKey) {
      setError(detailErrors[firstPaneErrorKey] || 'Please complete this section before continuing.')
      return false
    }

    setError('')
    return true
  }

  function scrollMobilePaneToTop() {
    if (typeof window === 'undefined' || !isMobileViewport) {
      return
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  function handleNextMobileDetailPane() {
    if (!validateActiveMobileDetailPane()) {
      return
    }

    setActiveMobileDetailPaneIndex((previous) => Math.min(previous + 1, Math.max(mobileDetailPanes.length - 1, 0)))
    scrollMobilePaneToTop()
  }

  function handlePreviousMobileDetailPane() {
    setError('')
    setActiveMobileDetailPaneIndex((previous) => Math.max(previous - 1, 0))
    scrollMobilePaneToTop()
  }

  function handleNextStep() {
    if (!validateCurrentStep()) {
      return
    }

    const nextStepIndex = Math.min(activeStepIndex + 1, stepDefinitions.length - 1)
    if (stepDefinitions[nextStepIndex]?.key !== 'review') {
      setActiveMobileDetailPaneIndex(0)
    }
    setActiveStepIndex(nextStepIndex)
  }

  function handlePreviousStep() {
    setError('')
    setActiveStepIndex((previous) => Math.max(previous - 1, 0))
  }

  function handleFooterBack() {
    if (isMobileDetailFlowActive && activeMobileDetailPaneIndex > 0) {
      handlePreviousMobileDetailPane()
      return
    }

    handlePreviousStep()
  }

  function handleFooterPrimaryAction() {
    if (shouldAdvanceMobileDetailPane) {
      handleNextMobileDetailPane()
      return
    }

    if (isLastStep) {
      if (!validateCurrentStep()) {
        return
      }
      void handleSubmit()
      return
    }

    handleNextStep()
  }

  function handleReviewEdit({ stepKey, paneKey = '' } = {}) {
    const targetStepIndex = stepDefinitions.findIndex((step) => step.key === stepKey)
    if (targetStepIndex < 0) {
      return
    }

    setError('')
    setActiveStepIndex(targetStepIndex)

    if (stepKey === 'details') {
      const paneIndex = paneKey ? mobileDetailPanes.findIndex((pane) => pane.key === paneKey) : 0
      setActiveMobileDetailPaneIndex(Math.max(paneIndex, 0))
    } else {
      setActiveMobileDetailPaneIndex(0)
    }

    scrollMobilePaneToTop()
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
            inputMode={
              fieldConfig.type === 'email'
                ? 'email'
                : fieldConfig.type === 'number' || fieldConfig.type === 'tel'
                  ? 'numeric'
                  : 'text'
            }
            autoComplete={
              fieldConfig.type === 'email'
                ? 'email'
                : fieldConfig.type === 'tel'
                  ? 'tel'
                  : fieldConfig.type === 'date'
                    ? 'bday'
                    : 'on'
            }
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

  function renderRepeatablePeopleCard({
    title,
    description,
    items,
    itemLabel,
    addLabel,
    collectionKey,
    onAdd,
    onRemove,
    onChange,
  }) {
    const people = Array.isArray(items) ? items : []
    const groupError = fieldErrors[collectionKey]

    return (
      <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
        <header className="mb-5 border-b border-[#edf2f7] pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">{title}</h4>
              <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{description}</p>
            </div>
            <Button type="button" variant="ghost" onClick={onAdd} className="min-h-[42px] shrink-0">
              <Plus size={14} /> {addLabel}
            </Button>
          </div>
          {groupError ? <p className="mt-3 text-xs font-medium text-[#d92d20]">{groupError}</p> : null}
        </header>

        {people.length ? (
          <div className="space-y-4">
            {people.map((person, index) => (
              <section key={`${collectionKey}-${index}`} className="rounded-[18px] border border-[#e3ebf5] bg-[#fbfdff] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-base font-semibold text-[#142132]">
                      {itemLabel} {index + 1}
                    </h5>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Capture the details of this {itemLabel.toLowerCase()} if they are involved in the transaction.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onRemove(index)}
                    className="min-h-[40px] text-[#8b3a36]"
                  >
                    <Trash2 size={14} /> Remove
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {ASSOCIATED_PERSON_FIELDS.map((fieldConfig) => {
                    const fieldPath = collectionFieldPath(collectionKey, index, fieldConfig.key)
                    const value = person[fieldConfig.key] ?? ''
                    return renderDetailField({
                      fieldConfig,
                      value,
                      fieldPath,
                      className: fieldConfig.type === 'textarea' ? 'md:col-span-2' : '',
                      onChange: (nextValue) => onChange(index, fieldConfig.key, nextValue),
                      onBlur: () => markFieldTouched(fieldPath),
                    })
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-[#d8e3ef] bg-[#fbfdff] px-4 py-5 text-sm leading-6 text-[#6b7d93]">
            No {itemLabel.toLowerCase()}s added yet. Use the button above to capture the required people for this buyer.
          </div>
        )}
      </article>
    )
  }

  function renderNaturalPurchaserCard(purchaser, purchaserIndex) {
    return (
      <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
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
                      className: fieldConfig.type === 'textarea' ? 'md:col-span-2' : '',
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

  function renderCompanyOrTrustDetailsCard() {
    const fields = purchaserEntityType === 'company' ? COMPANY_DETAIL_FIELDS : TRUST_DETAIL_FIELDS
    const entityKey = purchaserEntityType === 'company' ? 'company' : 'trust'
    const entityState = purchaserEntityType === 'company' ? structuredCompany : structuredTrust
    const updateEntityField = purchaserEntityType === 'company' ? updateCompanyField : updateTrustField
    const title = purchaserEntityType === 'company' ? 'Company Details' : 'Trust Details'

    return (
      <div className="space-y-4">
        <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
          <header className="mb-5 border-b border-[#edf2f7] pb-4">
            <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">{title}</h4>
            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
              Capture the entity details and the primary authority first. Additional directors or trustees can be added below.
            </p>
          </header>
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((fieldConfig) => {
              const fieldPath = detailFieldPath(entityKey, 0, fieldConfig.key)
              const value = entityState[fieldConfig.key] ?? ''
              return renderDetailField({
                fieldConfig,
                value,
                fieldPath,
                className: fieldConfig.type === 'textarea' ? 'md:col-span-2' : '',
                onChange: (nextValue) => updateEntityField(fieldConfig.key, nextValue),
                onBlur: () => markFieldTouched(fieldPath),
              })
            })}
          </div>
        </article>

        {purchaserEntityType === 'company'
          ? renderRepeatablePeopleCard({
              title: 'Directors / Beneficial Owners',
              description:
                'Capture the directors or beneficial owners involved in the company. Mark the people with signing authority.',
              items: structuredCompany.directors || [],
              itemLabel: 'Director / Owner',
              addLabel: 'Add Director',
              collectionKey: 'company.directors',
              onAdd: addCompanyDirector,
              onRemove: removeCompanyDirector,
              onChange: updateCompanyDirectorField,
            })
          : renderRepeatablePeopleCard({
              title: 'Additional Trustees',
              description:
                'Add any other trustees involved in the trust. The primary trustee details are captured above.',
              items: structuredTrust.trustees || [],
              itemLabel: 'Trustee',
              addLabel: 'Add Trustee',
              collectionKey: 'trust.trustees',
              onAdd: addTrustee,
              onRemove: removeTrustee,
              onChange: updateTrusteeField,
            })}
      </div>
    )
  }

  function renderFinanceDetailsCard() {
    if (!visibleFinanceSections.length) {
      return null
    }

    return (
      <div className="space-y-4">
        {visibleFinanceSections.map((sectionConfig) => (
          <article key={sectionConfig.key} className="rounded-[20px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
            <header className="mb-5 border-b border-[#edf2f7] pb-4">
              <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">{sectionConfig.title}</h4>
              {sectionConfig.description ? <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{sectionConfig.description}</p> : null}
              {sectionConfig.notice ? (
                <p className="mt-3 rounded-[14px] border border-[#d7eadf] bg-[#f3fbf7] px-3 py-2 text-sm leading-6 text-[#1f6f46]">
                  {sectionConfig.notice}
                </p>
              ) : null}
            </header>
            <div className="grid gap-3 md:grid-cols-2">
              {(sectionConfig.fields || []).map((fieldConfig) => {
                const fieldPath = detailFieldPath('finance', 0, fieldConfig.key)
                const value = structuredFinance[fieldConfig.key] ?? ''
                return renderDetailField({
                  fieldConfig,
                  value,
                  fieldPath,
                  className: fieldConfig.type === 'textarea' ? 'md:col-span-2' : '',
                  onChange: (nextValue) => updateFinanceField(fieldConfig.key, nextValue),
                  onBlur: () => markFieldTouched(fieldPath),
                })
              })}
            </div>
          </article>
        ))}
      </div>
    )
  }

  function renderNaturalPurchaseModeCard() {
    const modeError = fieldErrors.natural_person_purchase_mode
    const showModeError = Boolean(modeError && touchedFields.natural_person_purchase_mode)

    return (
      <section className="rounded-[18px] border border-[#e2eaf3] bg-white p-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)] md:rounded-[20px] md:p-4">
        <h4 className="text-base font-semibold tracking-normal text-[#142132] md:text-lg">
          Are you purchasing this unit alone or with a co-purchaser?
        </h4>
        <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
          This is used to prepare your sale agreement and matching compliance requirements.
        </p>
        <div className="mt-3 grid gap-2 md:mt-4 md:grid-cols-2 md:gap-3">
          {NATURAL_PURCHASER_MODE_OPTIONS.map((option) => {
            const active = naturalPersonPurchaseMode === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={`w-full rounded-[16px] border px-3 py-3 text-left transition duration-150 ease-out md:px-4 md:py-4 ${
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
                <span className="mt-1 block text-xs leading-5 text-[#6b7d93] md:text-sm md:leading-6">{option.description}</span>
              </button>
            )
          })}
        </div>
        {showModeError ? <p className="mt-3 text-xs font-medium text-[#d92d20]">{modeError}</p> : null}
      </section>
    )
  }

  function renderMobileDetailPane() {
    const pane = activeMobileDetailPane
    if (!pane) {
      return null
    }

    function renderPaneBody() {
      if (pane.type === 'purchase_mode') {
        return renderNaturalPurchaseModeCard()
      }

      if (pane.type === 'natural_section') {
        return (
          <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
            <header className="mb-5 border-b border-[#edf2f7] pb-4">
              <span className="inline-flex min-h-7 items-center rounded-full bg-[#eef5fb] px-3 text-xs font-semibold text-[#4b6077]">
                Purchaser {pane.purchaserIndex + 1}
              </span>
              <h4 className="mt-3 text-lg font-semibold tracking-normal text-[#142132]">{pane.title}</h4>
              {pane.description ? <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{pane.description}</p> : null}
            </header>
            <div className="grid gap-3">
              {(pane.fields || []).map((fieldConfig) => {
                const fieldPath = detailFieldPath('purchasers', pane.purchaserIndex, fieldConfig.key)
                const value = pane.purchaser?.[fieldConfig.key] ?? ''
                return renderDetailField({
                  fieldConfig,
                  value,
                  fieldPath,
                  onChange: (nextValue) => updatePurchaserField(pane.purchaserIndex, fieldConfig.key, nextValue),
                  onBlur: () => markFieldTouched(fieldPath),
                })
              })}
            </div>
            {pane.fields?.some((fieldConfig) => fieldConfig.key === 'ownership_share') &&
            fieldErrors['purchasers.ownership_share_total'] &&
            touchedFields['purchasers.ownership_share_total'] ? (
              <p className="mt-3 rounded-[12px] border border-[#f1c9c5] bg-[#fff5f4] px-3 py-2 text-xs font-medium text-[#d92d20]">
                {fieldErrors['purchasers.ownership_share_total']}
              </p>
            ) : null}
          </article>
        )
      }

      if (pane.type === 'entity_fields') {
        const updateEntityField = pane.entityKey === 'company' ? updateCompanyField : updateTrustField
        return (
          <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
            <header className="mb-5 border-b border-[#edf2f7] pb-4">
              <span className="inline-flex min-h-7 items-center rounded-full bg-[#eef5fb] px-3 text-xs font-semibold text-[#4b6077]">
                {pane.entityTitle}
              </span>
              <h4 className="mt-3 text-lg font-semibold tracking-normal text-[#142132]">{pane.title}</h4>
              {pane.description ? <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{pane.description}</p> : null}
            </header>
            <div className="grid gap-3">
              {(pane.fields || []).map((fieldConfig) => {
                const fieldPath = detailFieldPath(pane.entityKey, 0, fieldConfig.key)
                const value = pane.entityState?.[fieldConfig.key] ?? ''
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

      if (pane.type === 'associated_people') {
        return purchaserEntityType === 'company'
          ? renderRepeatablePeopleCard({
              title: 'Directors / Beneficial Owners',
              description:
                'Capture the directors or beneficial owners involved in the company. Mark the people with signing authority.',
              items: structuredCompany.directors || [],
              itemLabel: 'Director / Owner',
              addLabel: 'Add Director',
              collectionKey: 'company.directors',
              onAdd: addCompanyDirector,
              onRemove: removeCompanyDirector,
              onChange: updateCompanyDirectorField,
            })
          : renderRepeatablePeopleCard({
              title: 'Additional Trustees',
              description:
                'Add any other trustees involved in the trust. The primary trustee details are captured in the previous panes.',
              items: structuredTrust.trustees || [],
              itemLabel: 'Trustee',
              addLabel: 'Add Trustee',
              collectionKey: 'trust.trustees',
              onAdd: addTrustee,
              onRemove: removeTrustee,
              onChange: updateTrusteeField,
            })
      }

      if (pane.type === 'finance_section') {
        return (
          <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
            <header className="mb-5 border-b border-[#edf2f7] pb-4">
              <span className="inline-flex min-h-7 items-center rounded-full bg-[#eef5fb] px-3 text-xs font-semibold text-[#4b6077]">
                Finance
              </span>
              <h4 className="mt-3 text-lg font-semibold tracking-normal text-[#142132]">{pane.title}</h4>
              {pane.description ? <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{pane.description}</p> : null}
              {pane.notice ? (
                <p className="mt-3 rounded-[14px] border border-[#d7eadf] bg-[#f3fbf7] px-3 py-2 text-sm leading-6 text-[#1f6f46]">
                  {pane.notice}
                </p>
              ) : null}
            </header>
            <div className="grid gap-3">
              {(pane.fields || []).map((fieldConfig) => {
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

      return null
    }

    return (
      <div className="space-y-3">
        {renderPaneBody()}
      </div>
    )
  }

  function renderDetailsStep() {
    const isCoPurchasingSelected = naturalPersonPurchaseMode === 'co_purchasing'

    if (isNaturalPersonPurchase) {
      return (
        <>
          <div className="md:hidden">{renderMobileDetailPane()}</div>
          <div className="hidden md:block">
            <div className={DETAIL_FLOW_WRAP_CLASS}>
              {renderNaturalPurchaseModeCard()}

              {structuredPurchasers[0] ? <div>{renderNaturalPurchaserCard(structuredPurchasers[0], 0)}</div> : null}

              {isCoPurchasingSelected && structuredPurchasers[1] ? (
                <div>{renderNaturalPurchaserCard(structuredPurchasers[1], 1)}</div>
              ) : null}

              <div>{renderFinanceDetailsCard()}</div>
            </div>
          </div>
        </>
      )
    }

    return (
      <>
        <div className="md:hidden">{renderMobileDetailPane()}</div>
        <div className="hidden md:block">
          <div className={DETAIL_FLOW_WRAP_CLASS}>
            <div>{renderCompanyOrTrustDetailsCard()}</div>
            <div>{renderFinanceDetailsCard()}</div>
          </div>
        </div>
      </>
    )
  }

  function renderMobileFlowHeader() {
    return (
      <section className="md:hidden rounded-[20px] border border-[#dbe5ef] bg-white/95 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onboardingBrand.logoUrl ? (
              <span className="inline-flex h-11 min-w-11 max-w-[130px] shrink-0 items-center justify-center rounded-[14px] border border-[#dce6f0] bg-white px-2 py-1.5">
                <img
                  src={onboardingBrand.logoUrl}
                  alt={`${onboardingBrand.name || 'Agency'} logo`}
                  className="max-h-8 w-auto max-w-[112px] object-contain"
                />
              </span>
            ) : (
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#172334] text-xs font-semibold text-white">
                {onboardingBrand.initials}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[#52677e]">{onboardingBrand.name}</p>
              <p className="mt-0.5 truncate text-[0.7rem] font-medium text-[#7a8ca1]">Buyer onboarding</p>
            </div>
          </div>
          <span className="inline-flex h-9 shrink-0 items-center rounded-full bg-[#eef5fb] px-3 text-xs font-semibold text-[#4d637a]">
            {mobileQuestionPosition}/{mobileQuestionTotal}
          </span>
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7f96]">
            Question {mobileQuestionPosition} of {mobileQuestionTotal}
          </p>
          <h1 className="mt-1.5 text-xl font-semibold leading-tight tracking-normal text-[#142132]">
            {mobileQuestionTitle}
          </h1>
          {mobileQuestionDescription ? (
            <p className="mt-2 text-sm leading-6 text-[#637790]">{mobileQuestionDescription}</p>
          ) : null}
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eef3f8]" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#2f8f86_100%)] transition-[width] duration-300"
            style={{ width: `${mobileQuestionProgressPercent}%` }}
          />
        </div>

        {onboardingLocationLabel ? (
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#70849b]">{onboardingLocationLabel}</p>
        ) : null}
      </section>
    )
  }

  function renderReviewRows(rows = []) {
    return (
      <dl className="divide-y divide-[#edf2f7]">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 py-3 first:pt-0 last:pb-0 md:grid-cols-[180px_1fr] md:gap-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71869d]">{row.label}</dt>
            <dd className="text-sm font-semibold leading-6 text-[#142132]">{row.value}</dd>
          </div>
        ))}
      </dl>
    )
  }

  function renderReviewSection({ title, description, icon, editTarget, rows, children }) {
    return (
      <article className="rounded-[20px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)] md:p-5">
        <header className="mb-4 flex items-start justify-between gap-3 border-b border-[#edf2f7] pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[#dbe6f0] bg-[#f6f9fd] text-[#35546c]">
              {icon ? createElement(icon, { size: 19 }) : null}
            </span>
            <div className="min-w-0">
              <h4 className="text-base font-semibold tracking-normal text-[#142132] md:text-lg">{title}</h4>
              {description ? <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">{description}</p> : null}
            </div>
          </div>
          {editTarget ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleReviewEdit(editTarget)}
              className="min-h-[38px] shrink-0 px-3 text-xs md:text-sm"
            >
              Edit
            </Button>
          ) : null}
        </header>
        {rows?.length ? renderReviewRows(rows) : null}
        {children}
      </article>
    )
  }

  function renderReviewStep() {
    const primaryPurchaser = structuredPurchasers[0] || createEmptyPurchaser()
    const secondaryPurchaser = structuredPurchasers[1] || createEmptyPurchaser()
    const unitLabel = [unitDevelopment?.name, payload?.unit?.unit_number ? `Unit ${payload.unit.unit_number}` : '']
      .filter(Boolean)
      .join(' | ')
    const transactionReference =
      payload?.transaction?.transaction_reference ||
      payload?.transaction?.matter_number ||
      payload?.transaction?.id ||
      ''
    const sourceOfFundsField = visibleFinanceFields.find((fieldConfig) => fieldConfig.key === 'source_of_funds')
    const bondStatusField = visibleFinanceFields.find((fieldConfig) => fieldConfig.key === 'bond_current_status')
    const buyerRows = isNaturalPersonPurchase
      ? [
          { label: 'Buyer type', value: purchaserEntityLabel },
          { label: 'Purchase mode', value: naturalPurchaseModeLabel },
          { label: 'Primary buyer', value: getReviewPersonName(primaryPurchaser) },
          { label: 'Contact', value: `${formatReviewText(primaryPurchaser.email)} | ${formatReviewText(primaryPurchaser.phone)}` },
          { label: 'Residency', value: formatReviewOption(RESIDENCY_STATUS_OPTIONS, primaryPurchaser.residency_status) },
          { label: 'Marital status', value: formatReviewOption(MARITAL_STATUS_OPTIONS, primaryPurchaser.marital_status) },
          ...(naturalPersonPurchaseMode === 'co_purchasing'
            ? [
                { label: 'Co-purchaser', value: getReviewPersonName(secondaryPurchaser) },
                { label: 'Ownership split', value: `${formatReviewText(primaryPurchaser.ownership_share)}% / ${formatReviewText(secondaryPurchaser.ownership_share)}%` },
              ]
            : []),
        ]
      : purchaserEntityType === 'trust'
        ? [
            { label: 'Buyer type', value: purchaserEntityLabel },
            { label: 'Trust name', value: formatReviewText(structuredTrust.trust_name) },
            { label: 'Registration', value: formatReviewText(structuredTrust.trust_registration_number) },
            { label: 'Authorised trustee', value: formatReviewText(structuredTrust.authorised_trustee_name) },
            { label: 'Trustees', value: `${(structuredTrust.trustees || []).filter((item) => hasAssociatedPersonData(item, 'Trustee')).length} captured` },
          ]
        : [
            { label: 'Buyer type', value: purchaserEntityLabel },
            { label: 'Company name', value: formatReviewText(structuredCompany.company_name) },
            { label: 'Registration', value: formatReviewText(structuredCompany.company_registration_number) },
            { label: 'Authorised signatory', value: formatReviewText(structuredCompany.authorised_signatory_name) },
            { label: 'Directors / owners', value: `${(structuredCompany.directors || []).filter((item) => hasAssociatedPersonData(item, 'Director')).length} captured` },
          ]
    const financeRows = [
      { label: 'Finance type', value: financeTypeReviewLabel },
      { label: 'Purchase price', value: formatReviewCurrency(structuredFinance.purchase_price) },
      ...(normalizedFinanceType === 'cash' || normalizedFinanceType === 'combination'
        ? [
            { label: 'Cash amount', value: formatReviewCurrency(structuredFinance.cash_amount) },
            { label: 'Source of funds', value: formatReviewOption(sourceOfFundsField?.options, structuredFinance.source_of_funds) },
            { label: 'Proof of funds', value: formatReviewYesNo(structuredFinance.proof_of_funds_available) },
          ]
        : []),
      ...(normalizedFinanceType === 'bond' || normalizedFinanceType === 'combination'
        ? [
            { label: 'Bond amount', value: formatReviewCurrency(structuredFinance.bond_amount) },
            { label: 'Bond status', value: formatReviewOption(bondStatusField?.options, structuredFinance.bond_current_status) },
            { label: 'Originator help', value: formatReviewYesNo(structuredFinance.bond_help_requested) },
          ]
        : []),
    ]
    const documentRows = [
      {
        label: 'Required documents',
        value: requiredDocumentItems.length ? `${requiredDocumentItems.length} expected` : 'To be confirmed',
      },
      {
        label: 'Already received',
        value: requiredDocumentItems.length ? `${completedDocumentCount} uploaded` : 'No uploads expected yet',
      },
      {
        label: 'Outstanding',
        value: outstandingDocumentItems.length
          ? outstandingDocumentItems.map((item) => item.label || item.key).join(', ')
          : requiredDocumentItems.length
            ? 'None currently outstanding'
            : 'Your team will confirm the checklist',
      },
      {
        label: 'Next step',
        value: clientPortalPath ? 'Upload outstanding documents in your client portal' : 'Your team will share document instructions',
      },
    ]

    return (
      <div className="space-y-4">
        <section className="rounded-[20px] border border-[#d7eadf] bg-[#f4fbf7] p-4 md:p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#22824d] text-white">
              <CheckCircle2 size={20} />
            </span>
            <div>
              <h4 className="text-lg font-semibold tracking-normal text-[#142132]">You are almost ready to submit</h4>
              <p className="mt-2 text-sm leading-6 text-[#496176]">
                Confirm the details below before sending them to the transaction team.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {renderReviewSection({
            title: 'Buyer',
            description: 'Purchaser structure and primary details.',
            icon: UserRound,
            editTarget: { stepKey: 'details', paneKey: reviewBuyerDetailPaneKey },
            rows: buyerRows,
          })}

          {renderReviewSection({
            title: 'Property',
            description: 'Property context attached to this onboarding link.',
            icon: MapPin,
            rows: [
              { label: 'Address', value: formatReviewText(onboardingLocationLabel, 'Selected property') },
              { label: 'Development / unit', value: formatReviewText(unitLabel, 'Not specified') },
              { label: 'Reference', value: formatReviewText(transactionReference, 'Not specified') },
              { label: 'Agency', value: onboardingBrand.name },
            ],
          })}

          {renderReviewSection({
            title: 'Finance',
            description: 'Purchase funding and bond readiness summary.',
            icon: CreditCard,
            editTarget: { stepKey: reviewFinanceDetailPaneKey ? 'details' : 'finance_type', paneKey: reviewFinanceDetailPaneKey },
            rows: financeRows,
          })}

          {renderReviewSection({
            title: 'Document Next Steps',
            description: 'The upload checklist that follows this submission.',
            icon: FileText,
            rows: documentRows,
          })}
        </div>

        <section className="rounded-[20px] border border-[#dbe5ef] bg-[#fbfdff] p-4 md:p-5">
          <h4 className="text-base font-semibold tracking-normal text-[#142132]">Ready to send?</h4>
          <p className="mt-2 text-sm leading-6 text-[#5f738a]">
            Submitting notifies the transaction team and keeps the document checklist connected to your client portal.
          </p>
        </section>
      </div>
    )
  }

  function renderActiveStepBody() {
    if (!activeStep) {
      return null
    }

    if (activeStep.key === 'purchaser_entity') {
      return (
        <section className={INNER_PANEL_CLASS}>
          <p className={MUTED_TEXT_CLASS}>Choose the purchaser type first. We will only ask the questions relevant to that structure.</p>
          <div className="mt-4 grid gap-2 md:mt-5 md:grid-cols-2 md:gap-3">
            {PURCHASER_ENTITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={choiceCardClass(purchaserEntityType === option.value)}
                onClick={() => updatePurchaserEntityType(option.value)}
              >
                <strong className="block text-sm font-semibold md:text-base">{option.label}</strong>
                <span className={`mt-1.5 block text-xs leading-5 md:mt-3 md:text-sm md:leading-6 ${purchaserEntityType === option.value ? 'text-[#4e6278]' : 'text-[#6b7d93]'}`}>{option.caption}</span>
              </button>
            ))}
          </div>
        </section>
      )
    }

    if (activeStep.key === 'finance_type') {
      return (
        <section className={INNER_PANEL_CLASS}>
          <p className="mb-3 text-sm leading-6 text-[#6b7d93]">
            Select your finance structure so we can request the right supporting information.
          </p>
          <div className="grid gap-2 md:grid-cols-3 md:gap-3">
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
                <strong className="block text-sm font-semibold md:text-base">{option.label}</strong>
                <span className={`mt-1.5 block text-xs leading-5 md:mt-3 md:text-sm md:leading-6 ${normalizedFinanceType === option.value ? 'text-[#4e6278]' : 'text-[#6b7d93]'}`}>{option.caption}</span>
              </button>
            ))}
          </div>

          {['bond', 'combination'].includes(normalizedFinanceType) ? (
            <div className="mt-4 rounded-[18px] border border-[#dde4ee] bg-[#f8fbff] p-3 md:mt-5 md:rounded-[20px] md:p-5">
              <h5 className="text-base font-semibold text-[#142132]">What happens next</h5>
              <p className={`mt-2 ${MUTED_TEXT_CLASS}`}>
                In the next step we’ll ask for the bond bank, affordability confirmation, and originator assistance details if needed.
              </p>
            </div>
          ) : null}
        </section>
      )
    }

    if (activeStep.key === 'details') {
      return renderDetailsStep()
    }

    if (activeStep.key === 'review') {
      return renderReviewStep()
    }

    return null
  }

  if (onboardingRole === 'seller' && token) {
    return <Navigate to={`/client/${token}/selling/onboarding`} replace />
  }

  if (loading) {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f9fbfd_0%,#eef4fb_44%,#e7eef7_100%)] px-4 py-5">
        <div className={PAGE_CONTAINER_CLASS}>
          <p className="rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4 text-sm text-[#516277] shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            Loading onboarding form...
          </p>
        </div>
      </main>
    )
  }

  if (error && !payload) {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f9fbfd_0%,#eef4fb_44%,#e7eef7_100%)] px-4 py-5">
        <div className={`${PAGE_CONTAINER_CLASS} space-y-4`}>
          <section className="rounded-[20px] border border-[#d7e1ec] bg-white p-4 shadow-[0_16px_32px_rgba(15,23,42,0.08)]">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#142132]">Complete Your Onboarding</h1>
            <p className="mt-2 text-sm leading-6 text-[#516277]">This will take 3–5 minutes. You’ll be guided step-by-step.</p>
          </section>
          <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p>
        </div>
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f9fbfd_0%,#eef4fb_44%,#e7eef7_100%)] px-4 py-5">
        <div className={PAGE_CONTAINER_CLASS}>
          <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">
            Unable to load onboarding data.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className={`min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f9fbfd_0%,#eef4fb_44%,#e7eef7_100%)] px-3 py-3 ${!submissionComplete && !showLandingPage ? 'pb-40' : 'pb-24'} md:px-4 md:py-5 md:pb-12`}>
      <div className={`${PAGE_CONTAINER_CLASS} space-y-4 md:space-y-5`}>
        {showLandingPage ? (
          <BuyerOnboardingLanding
            brand={onboardingBrand}
            buyerName={buyerLandingName}
            propertyLabel={onboardingLocationLabel}
            isResume={isResumingOnboarding}
            onStart={() => setLandingDismissed(true)}
          />
        ) : submissionComplete ? (
          <section className="rounded-[28px] border border-[#dbe5ef] bg-white px-5 py-8 text-center shadow-[0_20px_44px_rgba(15,23,42,0.08)]">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#cfe8da] bg-[#effaf3] text-[#22824d]">
              <CheckCircle2 size={24} />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#142132]">Onboarding Submitted</h2>
            <p className="mt-3 text-sm leading-6 text-[#516277]">
              Thank you — your information has been received. The transaction team has been notified and will continue with the next step.
            </p>
            {clientPortalPath ? (
              <Button asChild className="mt-6 w-full min-h-[52px]">
                <Link to={clientPortalPath}>
                  Go to Client Portal <ChevronRight size={14} />
                </Link>
              </Button>
            ) : null}
          </section>
        ) : (
          <>
            {renderMobileFlowHeader()}

            <section className={`hidden md:block ${HERO_SECTION_CLASS}`}>
              <div className="grid gap-0 md:grid-cols-[1.25fr_0.95fr]">
                <div className="p-4 md:p-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7f96] md:text-xs md:tracking-[0.2em]">Buyer onboarding</p>
                  <h1 className="mt-3 max-w-2xl text-[1.75rem] font-semibold leading-[1.08] tracking-normal text-[#132033] md:mt-4 md:text-5xl">
                    Complete your buyer onboarding
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#556679] md:mt-4 md:text-[1.02rem] md:leading-7">
                    A calm guided flow for your identity, finance, and transaction details. We only ask for the information that matters to your purchase.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 md:mt-6 md:gap-3">
                    {[
                      'Guided questions',
                      'Save & continue later',
                      'Branch-aware questions',
                    ].map((chip) => (
                      <span
                        key={chip}
                        className="inline-flex min-h-[30px] items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-medium text-[#42566b] shadow-[0_8px_18px_rgba(15,23,42,0.04)] md:min-h-[38px] md:px-4 md:py-2 md:text-sm"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>

                <aside className={HERO_SUMMARY_CLASS}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7f96] md:text-xs md:tracking-[0.18em]">At a glance</p>
                  <div className="mt-3 grid gap-2 md:mt-4 md:block md:space-y-3">
                    {buyerFlowSummaryItems.map((item) => (
                      <div key={item.label} className="flex items-start justify-between gap-3 rounded-[14px] border border-[#e6edf5] bg-[#fbfdff] px-3 py-2.5 md:rounded-[18px] md:px-4 md:py-3">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2] md:text-xs md:tracking-[0.14em]">{item.label}</span>
                        <span className="max-w-[60%] text-right text-xs font-semibold leading-5 text-[#132033] md:text-sm md:leading-6">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {activeStep ? (
                    <div className="mt-3 rounded-[16px] bg-[#f6f9fd] p-3 md:mt-5 md:rounded-[22px] md:p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6a7f96]">Current focus</p>
                      <h2 className="mt-2 text-base font-semibold tracking-normal text-[#132033] md:text-lg">{activeStep.title}</h2>
                      <p className="mt-1.5 text-sm leading-6 text-[#556679] md:mt-2">{activeStep.description}</p>
                    </div>
                  ) : null}
                </aside>
              </div>
            </section>

            <section className="hidden rounded-[18px] border border-[#dbe5ef] bg-white/92 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur md:block md:rounded-[28px] md:p-5 md:shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7f96] md:text-xs md:tracking-[0.18em]">Progress</p>
                  <h2 className="mt-1 text-base font-semibold tracking-normal text-[#132033] md:text-lg">One guided flow</h2>
                  <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#5f738a] md:mt-2">
                    Each step reveals only the fields that apply to your purchase structure.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#d9e4ef] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#5f7590]">
                  {mobileStepLabel}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eef3f8] md:mt-4 md:h-2.5" aria-hidden="true">
                <span
                  className="block h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${mobileProgressPercent}%`, backgroundImage: 'linear-gradient(90deg,#35546c 0%,#2f8f86 100%)' }}
                />
              </div>
              <div className="mt-3 grid gap-2 md:mt-4 md:grid-cols-4 md:gap-3">
                {journeySteps.map((step, index) => {
                  const isActive = index === activeStepIndex
                  const isComplete = index < activeStepIndex
                  return (
                    <article
                      key={step.key}
                      className={`${STEP_OVERVIEW_CARD_CLASS} ${isActive ? STEP_OVERVIEW_ACTIVE_CLASS : STEP_OVERVIEW_INACTIVE_CLASS}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                          isActive
                            ? 'border-[#35546c] bg-[#35546c] text-white'
                            : isComplete
                              ? 'border-[#1f9d61] bg-[#edf9f1] text-[#1f9d61]'
                              : 'border-[#d5e0ec] bg-white text-[#6b7d93]'
                        }`}>
                          {String(index + 1).padStart(2, '0')}
                        </div>
                        {isActive ? (
                          <span className="inline-flex items-center rounded-full border border-[#cfe3d7] bg-[#eef8f1] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#2f7a51]">
                            Current
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold tracking-normal text-[#132033] md:mt-4 md:text-base">{step.shortLabel}</h3>
                      <p className="mt-1.5 text-xs leading-5 text-[#5f738a] md:mt-2 md:text-sm md:leading-6">{step.description}</p>
                    </article>
                  )
                })}
              </div>
            </section>

            {error ? <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p> : null}

            <section className={SECTION_CARD_CLASS}>
              {activeStep ? (
                <div className="mb-4 hidden space-y-1.5 md:block md:space-y-2">
                  <h3 className="text-lg font-semibold tracking-normal text-[#142132] md:text-xl">{activeStep.title}</h3>
                  <p className={MUTED_TEXT_CLASS}>{activeStep.description}</p>
                </div>
              ) : null}

              {renderActiveStepBody()}
            </section>
          </>
        )}
      </div>

      {!submissionComplete && !showLandingPage ? (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-[linear-gradient(180deg,rgba(249,251,253,0)_0%,rgba(255,255,255,0.92)_20%,rgba(255,255,255,0.98)_100%)] backdrop-blur-xl md:static md:mt-5 md:bg-transparent md:backdrop-blur-0">
          <div className={`${PAGE_CONTAINER_CLASS} px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] md:px-0 md:pt-0 md:pb-0`}>
            <div className="rounded-t-[20px] border border-[#dbe5ef] bg-white/95 px-3 py-2 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none">
              <div className="flex items-center justify-between gap-2 md:justify-start md:gap-3">
                <Button type="button" variant="ghost" onClick={() => void handleSaveDraft()} disabled={saving} className="min-h-[38px] md:min-h-[50px]">
                  Save Draft
                </Button>
                {shouldShowBackButton ? (
                  <Button type="button" variant="ghost" onClick={handleFooterBack} className="min-h-[38px] md:min-h-[50px]">
                    <ChevronLeft size={14} /> Back
                  </Button>
                ) : (
                  <span />
                )}
              </div>
              <Button
                type="button"
                onClick={handleFooterPrimaryAction}
                disabled={saving}
                className="mt-2 w-full min-h-[46px] md:mt-3 md:min-h-[54px] md:max-w-[320px]"
              >
                {primaryActionLabel}
                {primaryActionLabel === 'Submit Onboarding' ? null : <ChevronRight size={14} />}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default ClientOnboarding
