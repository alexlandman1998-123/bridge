import {
  Bell,
  AlertTriangle,
  CalendarDays,
  Download,
  FileSignature,
  FileText,
  KeyRound,
  LayoutDashboard,
  Settings,
  Star,
  User,
  Users,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import '../App.css'
import { normalizePortalWorkspaceCategory, resolvePortalDocumentMetadata } from '../core/documents/portalDocumentMetadata'
import { normalizeFinanceType } from '../core/transactions/financeType'
import ClientJourneySection from '../components/client-portal/ClientJourneySection'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import {
  buildClientJourney,
  buildClientNextActionModel,
  deriveClientJourneyStatusFlag,
  resolveClientJourneyFinanceType,
  resolveClientJourneyPropertyType,
} from '../core/clientJourney/clientJourney.utils'
import {
  fetchClientPortalByToken,
  saveClientPortalOnboardingDraft,
  saveClientHandoverDraft,
  submitClientPortalComment,
  uploadClientPortalDocument,
  saveTrustInvestmentFormDraft,
  submitAlterationRequest,
  submitClientHandover,
  submitClientIssue,
  submitServiceReview,
  submitTrustInvestmentForm,
} from '../lib/api'
import {
  MAIN_PROCESS_STAGES,
  MAIN_STAGE_LABELS,
  getMainStageFromDetailedStage,
  getMainStageIndex,
} from '../lib/stages'

const ISSUE_CATEGORIES = [
  'Paint / Finishes',
  'Plumbing',
  'Electrical',
  'Doors / Windows',
  'Flooring',
  'Kitchen / Cupboards',
  'Bathroom',
  'Other',
]

const HANDOVER_PHOTO_FIELDS = [
  { key: 'electricity', label: 'Electricity meter photo', category: 'Handover / Electricity Meter' },
  { key: 'water', label: 'Water meter photo', category: 'Handover / Water Meter' },
  { key: 'gas', label: 'Gas meter photo', category: 'Handover / Gas Meter' },
]

function formatPortalStepStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'in_progress') return 'In Progress'
  if (normalized === 'blocked') return 'Blocked'
  return 'Pending'
}

function formatPortalStepDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString()
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatOnboardingFieldValue(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => formatOnboardingFieldValue(entry))
      .filter(Boolean)
      .join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entryValue]) => `${toTitleLabel(key)}: ${formatOnboardingFieldValue(entryValue)}`)
      .join(' | ')
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

function isOnboardingMetaKey(key) {
  return String(key || '').startsWith('__bridge_')
}

function getOnboardingFieldGroupLabel(key) {
  const normalized = String(key || '').toLowerCase()

  if (
    normalized.includes('finance') ||
    normalized.includes('bond') ||
    normalized.includes('deposit') ||
    normalized.includes('fund') ||
    normalized.includes('bank') ||
    normalized.includes('loan') ||
    normalized.includes('reservation')
  ) {
    return 'Finance'
  }

  if (
    normalized.includes('employment') ||
    normalized.includes('employer') ||
    normalized.includes('income') ||
    normalized.includes('occupation') ||
    normalized.includes('salary') ||
    normalized.includes('commission') ||
    normalized.includes('retire') ||
    normalized.includes('contract')
  ) {
    return 'Employment & Income'
  }

  if (
    normalized.includes('spouse') ||
    normalized.includes('marriage') ||
    normalized.includes('marital') ||
    normalized.includes('trust') ||
    normalized.includes('trustee') ||
    normalized.includes('director') ||
    normalized.includes('company') ||
    normalized.includes('representative') ||
    normalized.includes('signatory')
  ) {
    return 'Purchasing Structure'
  }

  if (
    normalized.includes('address') ||
    normalized.includes('postal') ||
    normalized.includes('city') ||
    normalized.includes('province') ||
    normalized.includes('nationality') ||
    normalized.includes('residency') ||
    normalized.includes('tax') ||
    normalized.includes('identity') ||
    normalized.includes('passport')
  ) {
    return 'Identity & Address'
  }

  return 'Buyer Details'
}

function groupOnboardingFieldEntries(entries = []) {
  return entries.reduce((groups, entry) => {
    const [key] = entry
    const group = getOnboardingFieldGroupLabel(key)
    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(entry)
    return groups
  }, {})
}

function getDocumentSearchBlob(document = {}) {
  return `${document.group || ''} ${document.label || ''} ${document.description || ''} ${document.key || ''} ${document.category || ''} ${document.name || ''}`
    .toLowerCase()
    .trim()
}

function normalizeDocumentKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isInformationSheetDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return source.includes('information sheet') || source.includes('information_sheet')
}

function isReservationDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return source.includes('reservation') || source.includes('deposit proof') || source.includes('reservation_deposit_proof')
}

function isOtpDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return source.includes('otp') || source.includes('offer to purchase') || source.includes('signed_otp')
}

function isPropertyDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return (
    source.includes('title deed') ||
    source.includes('transfer') ||
    source.includes('warranty') ||
    source.includes('certificate') ||
    source.includes('compliance') ||
    source.includes('coc') ||
    source.includes('handover')
  )
}

function isBondDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return (
    source.includes('bond') ||
    source.includes('lender') ||
    source.includes('bank offer') ||
    source.includes('bond offer') ||
    source.includes('grant') ||
    source.includes('approval') ||
    source.includes('payslip') ||
    source.includes('income') ||
    source.includes('salary') ||
    source.includes('statement') ||
    source.includes('credit') ||
    source.includes('tax')
  )
}

function isFicaDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return (
    source.includes('fica') ||
    source.includes('identity') ||
    source.includes('passport') ||
    source.includes('address') ||
    source.includes('marriage') ||
    source.includes('anc') ||
    source.includes('spouse') ||
    source.includes('company registration') ||
    source.includes('cipc') ||
    source.includes('director identity') ||
    source.includes('authority resolution') ||
    source.includes('trust deed') ||
    source.includes('trustee') ||
    source.includes('trust resolution') ||
    source.includes('letter of authority') ||
    source.includes('letters_of_authority')
  )
}

function isSalesDocument(document = {}) {
  const source = getDocumentSearchBlob(document)
  return (
    isReservationDocument(document) ||
    isOtpDocument(document) ||
    source.includes('sale') ||
    source.includes('mandate') ||
    source.includes('instruction')
  )
}

function getClientPortalDocumentGroup(document = {}) {
  const explicitCategory = normalizePortalWorkspaceCategory(
    document?.portalWorkspaceCategory || document?.portal_workspace_category,
  )
  if (explicitCategory) {
    return explicitCategory
  }

  const metadataCategory = resolvePortalDocumentMetadata(document).portalWorkspaceCategory
  if (metadataCategory && metadataCategory !== 'additional') {
    return metadataCategory
  }

  if (isInformationSheetDocument(document)) {
    return 'additional'
  }
  if (isPropertyDocument(document)) {
    return 'property'
  }
  if (isBondDocument(document)) {
    return 'bond'
  }
  if (isSalesDocument(document)) {
    return 'sales'
  }
  if (isFicaDocument(document)) {
    return 'fica'
  }

  return metadataCategory || 'additional'
}

function groupPortalRequiredDocuments(items = []) {
  return items.reduce(
    (groups, item) => {
      const bucket = getClientPortalDocumentGroup(item)
      if (!groups[bucket]) {
        groups[bucket] = []
      }
      groups[bucket].push(item)
      return groups
    },
    { sales: [], fica: [], bond: [], additional: [], property: [] },
  )
}

function escapePortalHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildOnboardingDocumentMarkup({
  portal,
  groupedOnboardingFields,
  purchasePriceLabel,
  onboardingStatus,
}) {
  const generatedAt = new Date().toLocaleString()
  const sectionMarkup = Object.entries(groupedOnboardingFields)
    .map(
      ([sectionLabel, entries]) => `
        <section class="section-card">
          <div class="section-head">
            <h3>${escapePortalHtml(sectionLabel)}</h3>
            <span>${entries.length} fields</span>
          </div>
          <div class="field-grid">
            ${entries
              .map(
                ([key, value]) => `
                  <article class="field-card">
                    <span>${escapePortalHtml(toTitleLabel(key))}</span>
                    <strong>${escapePortalHtml(formatOnboardingFieldValue(value))}</strong>
                  </article>
                `,
              )
              .join('')}
          </div>
        </section>
      `,
    )
    .join('')

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Bridge Onboarding Information</title>
      <style>
        :root {
          color-scheme: light;
          --ink: #142132;
          --muted: #6b7d93;
          --line: #dbe5ef;
          --soft: #f6f9fc;
          --panel: #fbfdff;
          --brand: #35546c;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #eef3f9;
          color: var(--ink);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: white;
          padding: 18mm 16mm;
        }
        .brand {
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #6f8298;
          font-weight: 700;
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
        }
        h1 {
          margin: 10px 0 6px;
          font-size: 32px;
          line-height: 1.05;
          letter-spacing: -0.04em;
        }
        .subtext {
          margin: 0;
          font-size: 15px;
          line-height: 1.6;
          color: var(--muted);
        }
        .meta {
          text-align: right;
          min-width: 180px;
        }
        .meta span {
          display: block;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #7b8ca2;
          font-weight: 700;
        }
        .meta strong {
          display: block;
          margin-top: 8px;
          font-size: 18px;
          line-height: 1.4;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 24px;
        }
        .summary-card,
        .field-card,
        .section-card {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: var(--panel);
        }
        .summary-card {
          padding: 14px 16px;
        }
        .summary-card span,
        .field-card span {
          display: block;
          font-size: 11px;
          line-height: 1.4;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #7b8ca2;
          font-weight: 700;
        }
        .summary-card strong {
          display: block;
          margin-top: 10px;
          font-size: 22px;
          line-height: 1.2;
          letter-spacing: -0.03em;
        }
        .content {
          display: grid;
          gap: 16px;
          margin-top: 18px;
        }
        .section-card {
          padding: 16px;
        }
        .section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .section-head h3 {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
          letter-spacing: -0.03em;
        }
        .section-head span {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 12px;
          color: var(--muted);
          background: white;
          font-weight: 600;
        }
        .field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .field-card {
          padding: 14px 16px;
          background: white;
        }
        .field-card strong {
          display: block;
          margin-top: 8px;
          font-size: 14px;
          line-height: 1.7;
          word-break: break-word;
        }
        @media print {
          body { background: white; }
          .page { margin: 0; width: auto; min-height: auto; padding: 14mm 12mm; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <header class="topbar">
          <div>
            <p class="brand">Bridge</p>
            <h1>Onboarding Information</h1>
            <p class="subtext">${escapePortalHtml(portal?.unit?.development?.name || 'Development')} • Unit ${escapePortalHtml(
              portal?.unit?.unit_number || '—',
            )}</p>
            <p class="subtext">${escapePortalHtml(portal?.buyer?.name || 'Client')} • ${escapePortalHtml(onboardingStatus)}</p>
          </div>
          <div class="meta">
            <span>Generated</span>
            <strong>${escapePortalHtml(generatedAt)}</strong>
          </div>
        </header>
        <section class="summary-grid">
          <article class="summary-card">
            <span>Purchaser</span>
            <strong>${escapePortalHtml(portal?.buyer?.name || 'Client')}</strong>
          </article>
          <article class="summary-card">
            <span>Purchaser Type</span>
            <strong>${escapePortalHtml(
              toTitleLabel(portal?.transaction?.purchaser_type || portal?.onboardingFormData?.purchaserType || '—'),
            )}</strong>
          </article>
          <article class="summary-card">
            <span>Finance Type</span>
            <strong>${escapePortalHtml(
              toTitleLabel(portal?.transaction?.finance_type || portal?.onboardingFormData?.formData?.purchase_finance_type || '—'),
            )}</strong>
          </article>
          <article class="summary-card">
            <span>Purchase Price</span>
            <strong>${escapePortalHtml(purchasePriceLabel)}</strong>
          </article>
        </section>
        <section class="content">
          ${sectionMarkup || '<section class="section-card"><div class="field-card"><strong>No onboarding information has been submitted yet.</strong></div></section>'}
        </section>
      </main>
    </body>
  </html>`
}

const CLIENT_PORTAL_MENU = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'details', label: 'My Details', icon: User },
  { key: 'bond_application', label: 'Bond Application', icon: FileSignature },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'handover', label: 'Handover', icon: KeyRound },
  { key: 'snags', label: 'Snags', icon: Wrench },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'team', label: 'Team', icon: Users },
]

const BOND_APPLICATION_TABS = [
  { key: 'application', label: 'Application' },
  { key: 'offers', label: 'Offers' },
  { key: 'grant', label: 'Grant' },
]

const BOND_APPLICATION_SECTION_TABS = [
  { key: 'summary', label: 'Application Summary' },
  { key: 'personal_details', label: 'Personal Details' },
  { key: 'contact_address', label: 'Contact & Address' },
  { key: 'employment', label: 'Employment' },
  { key: 'credit_history', label: 'Credit History' },
  { key: 'loan_details', label: 'Loan Details' },
  { key: 'income_deductions_expenses', label: 'Income, Deductions & Expenses' },
  { key: 'banking_liabilities', label: 'Bank Accounts & Existing Debt' },
  { key: 'assets_liabilities', label: 'Assets & Liabilities' },
  { key: 'declarations_consents', label: 'Declarations & Consents' },
  { key: 'documents', label: 'Documents' },
]

const BOND_APPLICATION_BANK_OPTIONS = ['ABSA', 'FNB', 'Standard Bank', 'Nedbank', 'Other']

const BOND_YES_NO_OPTIONS = [
  { value: '', label: 'Select option' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

const BOND_TITLE_OPTIONS = [
  { value: '', label: 'Select title' },
  { value: 'mr', label: 'Mr' },
  { value: 'mrs', label: 'Mrs' },
  { value: 'ms', label: 'Ms' },
  { value: 'dr', label: 'Dr' },
  { value: 'prof', label: 'Prof' },
]

const BOND_GENDER_OPTIONS = [
  { value: '', label: 'Select gender' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

const BOND_ID_TYPE_OPTIONS = [
  { value: '', label: 'Select ID type' },
  { value: 'sa_id', label: 'SA ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'refugee_id', label: 'Refugee ID Card' },
]

const BOND_MARITAL_STATUS_OPTIONS = [
  { value: '', label: 'Select marital status' },
  { value: 'single', label: 'Single' },
  { value: 'married_anc', label: 'Married ANC' },
  { value: 'married_icop', label: 'Married in community of property' },
  { value: 'married_oocop', label: 'Married out of community of property' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
]

const BOND_OCCUPATION_STATUS_OPTIONS = [
  { value: '', label: 'Select occupation status' },
  { value: 'full_time_employed', label: 'Full-time employed' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'home_executive', label: 'Home executive' },
  { value: 'pensioner', label: 'Pensioner' },
  { value: 'part_time_employed', label: 'Part-time employed' },
  { value: 'temporary_employed', label: 'Temporary employed' },
  { value: 'unemployed', label: 'Unemployed' },
]

const BOND_OCCUPATIONAL_LEVEL_OPTIONS = [
  { value: '', label: 'Select occupational level' },
  { value: 'senior_management', label: 'Senior management' },
  { value: 'management', label: 'Management' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'skilled_worker', label: 'Skilled worker' },
  { value: 'semi_skilled', label: 'Semi-skilled' },
  { value: 'unskilled', label: 'Unskilled' },
  { value: 'junior_position', label: 'Junior position' },
]

const BOND_ACCOUNT_TYPE_OPTIONS = [
  { value: '', label: 'Select account type' },
  { value: 'current', label: 'Current/Cheque' },
  { value: 'savings', label: 'Savings' },
  { value: 'transmission', label: 'Transmission' },
  { value: 'bond', label: 'Bond' },
]

const BOND_LEGAL_NOTICE_OPTIONS = [
  { value: '', label: 'Select delivery method' },
  { value: 'hand_delivered', label: 'Hand delivered' },
  { value: 'registered_mail', label: 'Registered mail' },
]

const BOND_APPLICATION_STATUS_OPTIONS = [
  'Not Started',
  'In Progress',
  'Submitted',
  'Under Review',
  'Approved',
  'Declined',
]

const BOND_APPLICATION_BANK_MATCHERS = [
  'ABSA',
  'FNB',
  'Nedbank',
  'Standard Bank',
  'Capitec',
  'Investec',
  'SA Home Loans',
]

function extractBondBankName(value) {
  const source = String(value || '')
  const uppercaseSource = source.toUpperCase()
  const match = BOND_APPLICATION_BANK_MATCHERS.find((bankName) => uppercaseSource.includes(bankName.toUpperCase()))
  return match || 'Other'
}

function resolveBondApplicationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  const matched = BOND_APPLICATION_STATUS_OPTIONS.find((status) => status.toLowerCase() === normalized)
  return matched || 'Not Started'
}

function normalizeBondOfferDecisionState(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized === 'accepted' || normalized === 'declined' ? normalized : ''
}

function getBondApplicationApplicantDefault(roleKey, source = {}) {
  const buyerName = String(source?.buyer?.name || '').trim()
  const [firstName = '', ...surnameParts] = buyerName.split(/\s+/)
  const surnameFromBuyer = surnameParts.join(' ')
  const formData = source?.onboardingFormData?.formData || {}

  if (roleKey === 'co_applicant') {
    return {
      key: 'co_applicant',
      label: 'Co-applicant',
      title: '',
      gender: '',
      first_name: formData.spouse_full_name || '',
      last_name: '',
      date_of_birth: '',
      id_type: '',
      id_number: formData.spouse_identity_number || '',
      passport_number: '',
      passport_country_of_issue: '',
      refugee_id_card_number: '',
      sa_citizen: '',
      nationality: '',
      city_of_birth: '',
      country_of_birth: '',
      sa_permanent_resident: '',
      temporary_sa_resident: '',
      permit_type: '',
      permit_number: '',
      permit_expiry_date: '',
      marital_status: formData.marital_status || '',
      married_anc_register_both_names: '',
      country_of_marriage: '',
      number_of_dependants: '',
      ethnic_group: '',
      sa_tax_number: '',
      tax_number_unavailable_reason: '',
      tax_returns_outside_sa: '',
      foreign_tax_country: '',
      foreign_tax_number: '',
      current_residential_status: '',
      first_time_home_buyer: '',
      main_residence: '',
      highest_level_of_education: '',
      smoking_tobacco_ecig_declaration: '',
      email: formData.spouse_email || '',
      phone: formData.spouse_phone || '',
    }
  }

  return {
    key: 'primary',
    label: 'Primary applicant',
    title: '',
    gender: '',
    first_name: formData.first_name || firstName,
    last_name: formData.last_name || surnameFromBuyer,
    date_of_birth: formData.date_of_birth || '',
    id_type: formData.identity_number ? 'sa_id' : formData.passport_number ? 'passport' : '',
    id_number: formData.identity_number || '',
    passport_number: formData.passport_number || '',
    passport_country_of_issue: '',
    refugee_id_card_number: '',
    sa_citizen: formData.nationality ? 'yes' : '',
    nationality: formData.nationality || '',
    city_of_birth: '',
    country_of_birth: '',
    sa_permanent_resident: '',
    temporary_sa_resident: '',
    permit_type: '',
    permit_number: '',
    permit_expiry_date: '',
    married_anc_register_both_names: '',
    country_of_marriage: '',
    number_of_dependants: formData.number_of_dependants || '',
    ethnic_group: '',
    sa_tax_number: formData.tax_number || '',
    tax_number_unavailable_reason: '',
    tax_returns_outside_sa: '',
    foreign_tax_country: '',
    foreign_tax_number: '',
    current_residential_status: formData.residency_status || '',
    first_time_home_buyer: formData.first_time_buyer || '',
    main_residence: formData.primary_residence || '',
    highest_level_of_education: '',
    smoking_tobacco_ecig_declaration: '',
    email: formData.email || source?.buyer?.email || '',
    phone: formData.phone || source?.buyer?.phone || '',
    marital_status: formData.marital_status || '',
  }
}

function buildBondApplicationDraft(portal) {
  const formData = portal?.onboardingFormData?.formData || {}
  const existing = formData.bond_application && typeof formData.bond_application === 'object' ? formData.bond_application : {}
  const primaryDefault = getBondApplicationApplicantDefault('primary', portal)
  const coApplicantDefault = getBondApplicationApplicantDefault('co_applicant', portal)
  const purchasePrice =
    Number(formData.purchase_price || portal?.transaction?.purchase_price || portal?.transaction?.sales_price || portal?.unit?.price || 0) || 0
  const financeType = normalizeFinanceType(
    formData.purchase_finance_type || portal?.transaction?.finance_type || 'bond',
    { allowUnknown: true },
  )

  const existingApplicants = Array.isArray(existing.applicants) ? existing.applicants : []
  const primaryApplicant = existingApplicants.find((item) => String(item?.key || '').toLowerCase() === 'primary') || {}
  const coApplicant = existingApplicants.find((item) => String(item?.key || '').toLowerCase() === 'co_applicant') || {}

  const defaultSummary = {
    applicant_name: `${formData.first_name || ''} ${formData.last_name || ''}`.trim() || portal?.buyer?.name || '',
    has_co_applicant: formData.spouse_full_name || formData.spouse_email || formData.spouse_identity_number ? 'yes' : '',
    has_surety: '',
    property_reference: `${portal?.unit?.development?.name || 'Development'} ${portal?.unit?.unit_number ? `• Unit ${portal.unit.unit_number}` : ''}`.trim(),
    development_name: portal?.unit?.development?.name || '',
    unit_reference: portal?.unit?.unit_number ? `Unit ${portal.unit.unit_number}` : '',
    purchase_price: purchasePrice > 0 ? String(purchasePrice) : '',
    deposit_contribution:
      formData.deposit_amount ||
      formData.cash_amount ||
      (portal?.transaction?.deposit_amount !== null && portal?.transaction?.deposit_amount !== undefined
        ? String(portal.transaction.deposit_amount)
        : ''),
    finance_type: financeType,
    marital_status: formData.marital_status || '',
    main_residence: formData.primary_residence || '',
    first_time_home_buyer: formData.first_time_buyer || '',
  }

  return {
    status: resolveBondApplicationStatus(existing.status),
    submitted_at: existing.submitted_at || '',
    selected_banks: Array.isArray(existing.selected_banks)
      ? existing.selected_banks.filter(Boolean)
      : Array.isArray(existing.selectedBanks)
        ? existing.selectedBanks.filter(Boolean)
        : [],
    applicants: [
      { ...primaryDefault, ...primaryApplicant, key: 'primary', label: 'Primary applicant' },
      { ...coApplicantDefault, ...coApplicant, key: 'co_applicant', label: 'Co-applicant' },
    ],
    summary: {
      ...defaultSummary,
      ...(existing.summary || {}),
    },
    contact_address: {
      home_number: existing?.contact_address?.home_number || '',
      cellphone_number: existing?.contact_address?.cellphone_number || formData.phone || portal?.buyer?.phone || '',
      work_number: existing?.contact_address?.work_number || '',
      email_address: existing?.contact_address?.email_address || formData.email || portal?.buyer?.email || '',
      fax_number: existing?.contact_address?.fax_number || '',
      home_language: existing?.contact_address?.home_language || '',
      correspondence_language: existing?.contact_address?.correspondence_language || '',
      residential_address_street: existing?.contact_address?.residential_address_street || formData.street_address || '',
      residential_address_suburb: existing?.contact_address?.residential_address_suburb || formData.suburb || '',
      residential_address_city: existing?.contact_address?.residential_address_city || formData.city || '',
      residential_address_country: existing?.contact_address?.residential_address_country || 'South Africa',
      residential_address_postal_code: existing?.contact_address?.residential_address_postal_code || formData.postal_code || '',
      residential_years: existing?.contact_address?.residential_years || '',
      residential_months: existing?.contact_address?.residential_months || '',
      postal_same_as_residential: existing?.contact_address?.postal_same_as_residential || 'yes',
      postal_address_street: existing?.contact_address?.postal_address_street || '',
      postal_address_suburb: existing?.contact_address?.postal_address_suburb || '',
      postal_address_city: existing?.contact_address?.postal_address_city || '',
      postal_address_country: existing?.contact_address?.postal_address_country || 'South Africa',
      postal_address_postal_code: existing?.contact_address?.postal_address_postal_code || '',
      legal_notice_delivery_method: existing?.contact_address?.legal_notice_delivery_method || '',
      future_legal_correspondence_same_as_postal: existing?.contact_address?.future_legal_correspondence_same_as_postal || 'yes',
      future_legal_address_street: existing?.contact_address?.future_legal_address_street || '',
      future_legal_address_suburb: existing?.contact_address?.future_legal_address_suburb || '',
      future_legal_address_city: existing?.contact_address?.future_legal_address_city || '',
      future_legal_address_country: existing?.contact_address?.future_legal_address_country || 'South Africa',
      future_legal_address_postal_code: existing?.contact_address?.future_legal_address_postal_code || '',
      is_public_official: existing?.contact_address?.is_public_official || '',
      associated_with_public_official: existing?.contact_address?.associated_with_public_official || '',
      public_official_relationship_nature: existing?.contact_address?.public_official_relationship_nature || '',
      public_official_name: existing?.contact_address?.public_official_name || '',
    },
    employment: {
      primary: {
        occupation_status: existing?.employment?.primary?.occupation_status || existing?.employment?.employment_status || '',
        occupational_level: existing?.employment?.primary?.occupational_level || '',
        nature_of_occupation: existing?.employment?.primary?.nature_of_occupation || existing?.employment?.occupation || '',
        employer_name: existing?.employment?.primary?.employer_name || existing?.employment?.employer_name || formData.employer_name || '',
        company_registration_number: existing?.employment?.primary?.company_registration_number || '',
        employee_number: existing?.employment?.primary?.employee_number || '',
        employment_years: existing?.employment?.primary?.employment_years || '',
        employment_months: existing?.employment?.primary?.employment_months || '',
        works_in_south_africa: existing?.employment?.primary?.works_in_south_africa || '',
        employer_address_street: existing?.employment?.primary?.employer_address_street || '',
        employer_address_suburb: existing?.employment?.primary?.employer_address_suburb || '',
        employer_address_city: existing?.employment?.primary?.employer_address_city || '',
        employer_address_country: existing?.employment?.primary?.employer_address_country || 'South Africa',
        employer_address_postal_code: existing?.employment?.primary?.employer_address_postal_code || '',
        purchase_coincides_job_change: existing?.employment?.primary?.purchase_coincides_job_change || '',
        previously_employed: existing?.employment?.primary?.previously_employed || '',
        own_business_income_percent: existing?.employment?.primary?.own_business_income_percent || '',
        shareholder_in_employer_business: existing?.employment?.primary?.shareholder_in_employer_business || '',
        shareholding_percent: existing?.employment?.primary?.shareholding_percent || '',
        previous_employer_1_name: existing?.employment?.primary?.previous_employer_1_name || '',
        previous_employer_1_duration: existing?.employment?.primary?.previous_employer_1_duration || '',
        previous_employer_2_name: existing?.employment?.primary?.previous_employer_2_name || '',
        previous_employer_2_duration: existing?.employment?.primary?.previous_employer_2_duration || '',
      },
      co_applicant: {
        occupation_status: existing?.employment?.co_applicant?.occupation_status || '',
        occupational_level: existing?.employment?.co_applicant?.occupational_level || '',
        nature_of_occupation: existing?.employment?.co_applicant?.nature_of_occupation || '',
        employer_name: existing?.employment?.co_applicant?.employer_name || '',
        company_registration_number: existing?.employment?.co_applicant?.company_registration_number || '',
        employee_number: existing?.employment?.co_applicant?.employee_number || '',
        employment_years: existing?.employment?.co_applicant?.employment_years || '',
        employment_months: existing?.employment?.co_applicant?.employment_months || '',
        works_in_south_africa: existing?.employment?.co_applicant?.works_in_south_africa || '',
        employer_address_street: existing?.employment?.co_applicant?.employer_address_street || '',
        employer_address_suburb: existing?.employment?.co_applicant?.employer_address_suburb || '',
        employer_address_city: existing?.employment?.co_applicant?.employer_address_city || '',
        employer_address_country: existing?.employment?.co_applicant?.employer_address_country || 'South Africa',
        employer_address_postal_code: existing?.employment?.co_applicant?.employer_address_postal_code || '',
        purchase_coincides_job_change: existing?.employment?.co_applicant?.purchase_coincides_job_change || '',
        previously_employed: existing?.employment?.co_applicant?.previously_employed || '',
        own_business_income_percent: existing?.employment?.co_applicant?.own_business_income_percent || '',
        shareholder_in_employer_business: existing?.employment?.co_applicant?.shareholder_in_employer_business || '',
        shareholding_percent: existing?.employment?.co_applicant?.shareholding_percent || '',
        previous_employer_1_name: existing?.employment?.co_applicant?.previous_employer_1_name || '',
        previous_employer_1_duration: existing?.employment?.co_applicant?.previous_employer_1_duration || '',
        previous_employer_2_name: existing?.employment?.co_applicant?.previous_employer_2_name || '',
        previous_employer_2_duration: existing?.employment?.co_applicant?.previous_employer_2_duration || '',
      },
    },
    credit_history: {
      currently_under_administration: String(existing?.credit_history?.currently_under_administration || ''),
      ever_under_administration: String(existing?.credit_history?.ever_under_administration || ''),
      judgments_taken: String(existing?.credit_history?.judgments_taken || existing?.credit_history?.judgments || ''),
      currently_under_debt_review: String(existing?.credit_history?.currently_under_debt_review || existing?.credit_history?.under_debt_review || ''),
      debt_counsellor_name: existing?.credit_history?.debt_counsellor_name || '',
      debt_counsellor_phone: existing?.credit_history?.debt_counsellor_phone || '',
      under_debt_rearrangement: String(existing?.credit_history?.under_debt_rearrangement || ''),
      ever_declared_insolvent: String(existing?.credit_history?.ever_declared_insolvent || existing?.credit_history?.insolvent || ''),
      insolvency_date: existing?.credit_history?.insolvency_date || '',
      rehabilitation_date: existing?.credit_history?.rehabilitation_date || '',
      adverse_credit_listings: String(existing?.credit_history?.adverse_credit_listings || ''),
      adverse_credit_listing_details: existing?.credit_history?.adverse_credit_listing_details || '',
      credit_bureau_dispute: String(existing?.credit_history?.credit_bureau_dispute || existing?.credit_history?.disputes || ''),
      bound_by_surety_agreements: String(existing?.credit_history?.bound_by_surety_agreements || ''),
      surety_amount: existing?.credit_history?.surety_amount || '',
      currently_paying_surety_account: String(existing?.credit_history?.currently_paying_surety_account || ''),
      surety_monthly_instalment: existing?.credit_history?.surety_monthly_instalment || '',
      surety_details: existing?.credit_history?.surety_details || '',
      settling_surety_account: String(existing?.credit_history?.settling_surety_account || ''),
      surety_new_instalment_if_reduced: existing?.credit_history?.surety_new_instalment_if_reduced || '',
      surety_in_favour_of: existing?.credit_history?.surety_in_favour_of || '',
    },
    loan_details: {
      erf_or_section_number: existing?.loan_details?.erf_or_section_number || portal?.unit?.unit_number || '',
      street_or_complex: existing?.loan_details?.street_or_complex || portal?.transaction?.property_address_line_1 || formData.street_address || '',
      suburb: existing?.loan_details?.suburb || portal?.transaction?.suburb || formData.suburb || '',
      amount_to_be_registered:
        existing?.loan_details?.amount_to_be_registered ||
        formData.bond_amount ||
        (portal?.transaction?.bond_amount !== null && portal?.transaction?.bond_amount !== undefined
          ? String(portal.transaction.bond_amount)
          : ''),
      additional_amount_for_solar_energy: existing?.loan_details?.additional_amount_for_solar_energy || '',
      solar_energy_loan_amount: existing?.loan_details?.solar_energy_loan_amount || '',
      solar_loan_term: existing?.loan_details?.solar_loan_term || '',
      solar_panels_included: existing?.loan_details?.solar_panels_included || '',
      debit_order_bank_name: existing?.loan_details?.debit_order_bank_name || '',
      debit_order_account_number: existing?.loan_details?.debit_order_account_number || '',
      preferred_debit_order_date: existing?.loan_details?.preferred_debit_order_date || '',
    },
    income_deductions_expenses: {
      primary: {
        gross_salary: existing?.income_deductions_expenses?.primary?.gross_salary || existing?.income?.salary || formData.gross_monthly_income || '',
        average_commission: existing?.income_deductions_expenses?.primary?.average_commission || existing?.income?.commission || '',
        investment_income: existing?.income_deductions_expenses?.primary?.investment_income || '',
        rental_income: existing?.income_deductions_expenses?.primary?.rental_income || existing?.income?.rental_income || '',
        car_allowance: existing?.income_deductions_expenses?.primary?.car_allowance || '',
        travel_allowance: existing?.income_deductions_expenses?.primary?.travel_allowance || '',
        entertainment_allowance: existing?.income_deductions_expenses?.primary?.entertainment_allowance || '',
        income_from_sureties: existing?.income_deductions_expenses?.primary?.income_from_sureties || '',
        housing_subsidy: existing?.income_deductions_expenses?.primary?.housing_subsidy || '',
        maintenance_or_alimony_income: existing?.income_deductions_expenses?.primary?.maintenance_or_alimony_income || '',
        average_overtime: existing?.income_deductions_expenses?.primary?.average_overtime || '',
        other_income_description: existing?.income_deductions_expenses?.primary?.other_income_description || '',
        other_income_value: existing?.income_deductions_expenses?.primary?.other_income_value || existing?.income?.other_income || '',
        tax_paye: existing?.income_deductions_expenses?.primary?.tax_paye || '',
        pension: existing?.income_deductions_expenses?.primary?.pension || '',
        uif: existing?.income_deductions_expenses?.primary?.uif || '',
        medical_aid: existing?.income_deductions_expenses?.primary?.medical_aid || '',
        other_deductions_description: existing?.income_deductions_expenses?.primary?.other_deductions_description || '',
        other_deductions_value: existing?.income_deductions_expenses?.primary?.other_deductions_value || '',
        rental_expense: existing?.income_deductions_expenses?.primary?.rental_expense || existing?.expenses?.housing || '',
        maintenance_or_alimony_expense: existing?.income_deductions_expenses?.primary?.maintenance_or_alimony_expense || '',
        rates_taxes_levies: existing?.income_deductions_expenses?.primary?.rates_taxes_levies || '',
        water_electricity: existing?.income_deductions_expenses?.primary?.water_electricity || existing?.expenses?.utilities || '',
        assurance_insurance_funeral_ra: existing?.income_deductions_expenses?.primary?.assurance_insurance_funeral_ra || existing?.expenses?.insurance || '',
        groceries: existing?.income_deductions_expenses?.primary?.groceries || existing?.expenses?.groceries || '',
        transport: existing?.income_deductions_expenses?.primary?.transport || existing?.expenses?.transport || '',
        security: existing?.income_deductions_expenses?.primary?.security || '',
        education: existing?.income_deductions_expenses?.primary?.education || '',
        medical_excluding_payroll: existing?.income_deductions_expenses?.primary?.medical_excluding_payroll || '',
        cellphone_internet: existing?.income_deductions_expenses?.primary?.cellphone_internet || '',
        dstv_tv: existing?.income_deductions_expenses?.primary?.dstv_tv || '',
        other_expenses_description: existing?.income_deductions_expenses?.primary?.other_expenses_description || '',
        other_expenses_value: existing?.income_deductions_expenses?.primary?.other_expenses_value || existing?.expenses?.other_expenses || '',
      },
      co_applicant: {
        gross_salary: existing?.income_deductions_expenses?.co_applicant?.gross_salary || '',
        average_commission: existing?.income_deductions_expenses?.co_applicant?.average_commission || '',
        investment_income: existing?.income_deductions_expenses?.co_applicant?.investment_income || '',
        rental_income: existing?.income_deductions_expenses?.co_applicant?.rental_income || '',
        car_allowance: existing?.income_deductions_expenses?.co_applicant?.car_allowance || '',
        travel_allowance: existing?.income_deductions_expenses?.co_applicant?.travel_allowance || '',
        entertainment_allowance: existing?.income_deductions_expenses?.co_applicant?.entertainment_allowance || '',
        income_from_sureties: existing?.income_deductions_expenses?.co_applicant?.income_from_sureties || '',
        housing_subsidy: existing?.income_deductions_expenses?.co_applicant?.housing_subsidy || '',
        maintenance_or_alimony_income: existing?.income_deductions_expenses?.co_applicant?.maintenance_or_alimony_income || '',
        average_overtime: existing?.income_deductions_expenses?.co_applicant?.average_overtime || '',
        other_income_description: existing?.income_deductions_expenses?.co_applicant?.other_income_description || '',
        other_income_value: existing?.income_deductions_expenses?.co_applicant?.other_income_value || '',
        tax_paye: existing?.income_deductions_expenses?.co_applicant?.tax_paye || '',
        pension: existing?.income_deductions_expenses?.co_applicant?.pension || '',
        uif: existing?.income_deductions_expenses?.co_applicant?.uif || '',
        medical_aid: existing?.income_deductions_expenses?.co_applicant?.medical_aid || '',
        other_deductions_description: existing?.income_deductions_expenses?.co_applicant?.other_deductions_description || '',
        other_deductions_value: existing?.income_deductions_expenses?.co_applicant?.other_deductions_value || '',
        rental_expense: existing?.income_deductions_expenses?.co_applicant?.rental_expense || '',
        maintenance_or_alimony_expense: existing?.income_deductions_expenses?.co_applicant?.maintenance_or_alimony_expense || '',
        rates_taxes_levies: existing?.income_deductions_expenses?.co_applicant?.rates_taxes_levies || '',
        water_electricity: existing?.income_deductions_expenses?.co_applicant?.water_electricity || '',
        assurance_insurance_funeral_ra: existing?.income_deductions_expenses?.co_applicant?.assurance_insurance_funeral_ra || '',
        groceries: existing?.income_deductions_expenses?.co_applicant?.groceries || '',
        transport: existing?.income_deductions_expenses?.co_applicant?.transport || '',
        security: existing?.income_deductions_expenses?.co_applicant?.security || '',
        education: existing?.income_deductions_expenses?.co_applicant?.education || '',
        medical_excluding_payroll: existing?.income_deductions_expenses?.co_applicant?.medical_excluding_payroll || '',
        cellphone_internet: existing?.income_deductions_expenses?.co_applicant?.cellphone_internet || '',
        dstv_tv: existing?.income_deductions_expenses?.co_applicant?.dstv_tv || '',
        other_expenses_description: existing?.income_deductions_expenses?.co_applicant?.other_expenses_description || '',
        other_expenses_value: existing?.income_deductions_expenses?.co_applicant?.other_expenses_value || '',
      },
    },
    banking_liabilities: {
      primary_bank_name: existing?.banking_liabilities?.primary_bank_name || '',
      primary_account_type: existing?.banking_liabilities?.primary_account_type || '',
      primary_account_holder_name: existing?.banking_liabilities?.primary_account_holder_name || '',
      legal_entity_account_name_match: existing?.banking_liabilities?.legal_entity_account_name_match || '',
      business_bank_account: existing?.banking_liabilities?.business_bank_account || '',
      primary_account_number: existing?.banking_liabilities?.primary_account_number || '',
      primary_balance_debit_credit: existing?.banking_liabilities?.primary_balance_debit_credit || '',
      primary_bank_first_consideration_consent: existing?.banking_liabilities?.primary_bank_first_consideration_consent || '',
      home_loan_1_bank: existing?.banking_liabilities?.home_loan_1_bank || '',
      home_loan_1_account_holder_name: existing?.banking_liabilities?.home_loan_1_account_holder_name || '',
      home_loan_1_account_number: existing?.banking_liabilities?.home_loan_1_account_number || '',
      home_loan_1_outstanding_balance: existing?.banking_liabilities?.home_loan_1_outstanding_balance || '',
      home_loan_1_monthly_instalment: existing?.banking_liabilities?.home_loan_1_monthly_instalment || '',
      home_loan_1_selling_property: existing?.banking_liabilities?.home_loan_1_selling_property || '',
      home_loan_1_new_instalment_if_reduced: existing?.banking_liabilities?.home_loan_1_new_instalment_if_reduced || '',
      other_finance_1_bank: existing?.banking_liabilities?.other_finance_1_bank || '',
      other_finance_1_account_type: existing?.banking_liabilities?.other_finance_1_account_type || '',
      other_finance_1_current_balance: existing?.banking_liabilities?.other_finance_1_current_balance || '',
      other_finance_1_monthly_payment: existing?.banking_liabilities?.other_finance_1_monthly_payment || '',
      other_finance_1_settled: existing?.banking_liabilities?.other_finance_1_settled || '',
      other_finance_1_business_account: existing?.banking_liabilities?.other_finance_1_business_account || '',
      other_finance_1_legal_entity_account: existing?.banking_liabilities?.other_finance_1_legal_entity_account || '',
      retail_account_name: existing?.banking_liabilities?.retail_account_name || '',
      retail_current_balance: existing?.banking_liabilities?.retail_current_balance || '',
      retail_monthly_payment: existing?.banking_liabilities?.retail_monthly_payment || '',
      retail_settled: existing?.banking_liabilities?.retail_settled || '',
    },
    assets_liabilities: {
      fixed_property: existing?.assets_liabilities?.fixed_property || existing?.assets?.property_owned || '',
      vehicles: existing?.assets_liabilities?.vehicles || '',
      investments: existing?.assets_liabilities?.investments || existing?.assets?.investments || '',
      furniture_and_fittings: existing?.assets_liabilities?.furniture_and_fittings || '',
      other_assets_description: existing?.assets_liabilities?.other_assets_description || '',
      other_assets_value: existing?.assets_liabilities?.other_assets_value || '',
      liabilities_total: existing?.assets_liabilities?.liabilities_total || '',
      other_liabilities_description: existing?.assets_liabilities?.other_liabilities_description || '',
      other_liabilities_value: existing?.assets_liabilities?.other_liabilities_value || '',
      total_assets: existing?.assets_liabilities?.total_assets || '',
      total_liabilities: existing?.assets_liabilities?.total_liabilities || '',
      net_asset_value: existing?.assets_liabilities?.net_asset_value || existing?.assets?.net_worth || '',
    },
    declarations_consents: {
      loan_processing_consent: Boolean(existing?.declarations_consents?.loan_processing_consent || existing?.consent?.credit_check_consent),
      credit_bureau_fraud_bank_data_consent: Boolean(existing?.declarations_consents?.credit_bureau_fraud_bank_data_consent || existing?.consent?.credit_check_consent),
      insurance_third_party_communication_consent: Boolean(existing?.declarations_consents?.insurance_third_party_communication_consent),
      nhfc_first_home_finance_consent: Boolean(existing?.declarations_consents?.nhfc_first_home_finance_consent),
      marketing_privacy_preference: existing?.declarations_consents?.marketing_privacy_preference || '',
      declaration_accepted: Boolean(existing?.declarations_consents?.declaration_accepted || existing?.consent?.declaration_accepted),
      digital_signature_name: existing?.declarations_consents?.digital_signature_name || `${formData.first_name || ''} ${formData.last_name || ''}`.trim(),
      digital_signature_date: existing?.declarations_consents?.digital_signature_date || '',
    },
    consent: {
      credit_check_consent: Boolean(
        existing?.consent?.credit_check_consent ||
        existing?.declarations_consents?.loan_processing_consent ||
        existing?.declarations_consents?.credit_bureau_fraud_bank_data_consent,
      ),
      declaration_accepted: Boolean(
        existing?.consent?.declaration_accepted ||
        existing?.declarations_consents?.declaration_accepted,
      ),
    },
    offers: {
      accepted_offer_document_id:
        existing?.offers?.accepted_offer_document_id || existing?.offers?.acceptedOfferDocumentId || '',
      accepted_bank: existing?.offers?.accepted_bank || existing?.offers?.acceptedBank || '',
      accepted_at: existing?.offers?.accepted_at || existing?.offers?.acceptedAt || '',
      decision_state:
        normalizeBondOfferDecisionState(existing?.offers?.decision_state || existing?.offers?.decisionState) ||
        (existing?.offers?.accepted_offer_document_id || existing?.offers?.acceptedOfferDocumentId ? 'accepted' : ''),
      decision_offer_document_id:
        existing?.offers?.decision_offer_document_id ||
        existing?.offers?.decisionOfferDocumentId ||
        existing?.offers?.accepted_offer_document_id ||
        existing?.offers?.acceptedOfferDocumentId ||
        '',
      decision_at:
        existing?.offers?.decision_at ||
        existing?.offers?.decisionAt ||
        existing?.offers?.accepted_at ||
        existing?.offers?.acceptedAt ||
        '',
      declined_offer_document_ids: Array.isArray(existing?.offers?.declined_offer_document_ids)
        ? existing.offers.declined_offer_document_ids.map((value) => String(value)).filter(Boolean)
        : Array.isArray(existing?.offers?.declinedOfferDocumentIds)
          ? existing.offers.declinedOfferDocumentIds.map((value) => String(value)).filter(Boolean)
          : [],
      signed_offer_document_id:
        existing?.offers?.signed_offer_document_id || existing?.offers?.signedOfferDocumentId || '',
      signed_offer_uploaded_at:
        existing?.offers?.signed_offer_uploaded_at || existing?.offers?.signedOfferUploadedAt || '',
    },
    // Legacy keys kept for backward compatibility with existing reads.
    income: existing?.income || {},
    expenses: existing?.expenses || {},
    assets: existing?.assets || {},
  }
}

const MY_DETAILS_SELECT_OPTION_GROUPS = {
  purchaseType: [
    { value: '', label: 'Select purchase type' },
    { value: 'individual', label: 'Individual' },
    { value: 'joint', label: 'Joint Purchase' },
    { value: 'company', label: 'Company' },
    { value: 'trust', label: 'Trust' },
  ],
  entityType: [
    { value: '', label: 'Select entity type' },
    { value: 'individual', label: 'Individual' },
    { value: 'company', label: 'Company' },
    { value: 'trust', label: 'Trust' },
    { value: 'foreign_purchaser', label: 'Foreign Purchaser' },
  ],
  naturalMode: [
    { value: '', label: 'Select purchase mode' },
    { value: 'individual', label: 'Individual Purchaser' },
    { value: 'co_purchasing', label: 'Co-Purchasing' },
  ],
  yesNo: [
    { value: '', label: 'Select option' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ],
  financeType: [
    { value: '', label: 'Select finance type' },
    { value: 'cash', label: 'Cash' },
    { value: 'bond', label: 'Bond' },
    { value: 'combination', label: 'Hybrid' },
  ],
  maritalStatus: [
    { value: '', label: 'Select marital status' },
    { value: 'single', label: 'Single' },
    { value: 'married', label: 'Married' },
    { value: 'divorced', label: 'Divorced' },
    { value: 'widowed', label: 'Widowed' },
  ],
  maritalRegime: [
    { value: '', label: 'Select marital regime' },
    { value: 'not_applicable', label: 'Not applicable' },
    { value: 'in_community', label: 'In community of property' },
    { value: 'out_of_community', label: 'Out of community of property' },
    { value: 'out_of_community_with_accrual', label: 'Out of community with accrual' },
  ],
  bondStatus: [
    { value: '', label: 'Select bond status' },
    { value: 'not_started', label: 'Not started' },
    { value: 'pre_approval_only', label: 'Pre-approval only' },
    { value: 'application_in_progress', label: 'Application in progress' },
    { value: 'submitted_to_banks', label: 'Submitted to banks' },
    { value: 'bond_approved', label: 'Bond approved' },
  ],
}

const MY_DETAILS_PURCHASER_FIELDS = new Set([
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
])

const MY_DETAILS_FINANCE_FIELDS = new Set([
  'purchase_finance_type',
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
  'deposit_required',
  'deposit_amount',
  'deposit_source',
  'deposit_already_paid',
  'deposit_holder',
  'reservation_required',
  'reservation_amount',
  'reservation_status',
  'reservation_paid_date',
])

const MY_DETAILS_COMPANY_FIELDS = new Set([
  'company_name',
  'company_registration_number',
  'vat_number',
  'authorised_signatory_name',
  'authorised_signatory_identity_number',
  'authorised_signatory_email',
  'authorised_signatory_phone',
])

const MY_DETAILS_TRUST_FIELDS = new Set([
  'trust_name',
  'trust_registration_number',
  'authorised_trustee_name',
  'authorised_trustee_identity_number',
  'authorised_trustee_email',
  'authorised_trustee_phone',
  'trust_resolution_available',
])

const MY_DETAILS_SECTIONS = [
  {
    key: 'buyer_structure',
    title: 'Buyer Structure',
    description: 'How this purchase is structured and captured for your transaction.',
    fields: [
      { key: 'purchaser_type', label: 'Purchase Type', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.purchaseType, required: true },
      { key: 'purchaser_entity_type', label: 'Buyer Entity Type', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.entityType, required: true },
      { key: 'natural_person_purchase_mode', label: 'Natural Person Purchase Mode', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.naturalMode, required: false },
      { key: 'first_time_buyer', label: 'First-time Buyer', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
      { key: 'primary_residence', label: 'Primary Residence', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
      { key: 'investment_purchase', label: 'Investment Purchase', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
    ],
  },
  {
    key: 'personal_details',
    title: 'Personal Details',
    description: 'Identity and legal profile details used for buyer and compliance records.',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true },
      { key: 'last_name', label: 'Surname', type: 'text', required: true },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
      { key: 'identity_number', label: 'ID Number', type: 'text', required: false },
      { key: 'passport_number', label: 'Passport Number', type: 'text', required: false },
      { key: 'nationality', label: 'Nationality', type: 'text', required: false },
      { key: 'marital_status', label: 'Marital Status', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.maritalStatus, required: false },
      { key: 'marital_regime', label: 'Marital Regime', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.maritalRegime, required: false },
    ],
  },
  {
    key: 'contact_details',
    title: 'Contact Details',
    description: 'How your team can reach you and where formal records are linked.',
    fields: [
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone Number', type: 'tel', required: true },
      { key: 'street_address', label: 'Street Address', type: 'text', required: false },
      { key: 'suburb', label: 'Suburb', type: 'text', required: false },
      { key: 'city', label: 'City', type: 'text', required: false },
      { key: 'postal_code', label: 'Postal Code', type: 'text', required: false },
    ],
  },
  {
    key: 'purchase_details',
    title: 'Purchase Details',
    description: 'Core transaction details and payment setup captured during onboarding.',
    fields: [
      { key: 'purchase_price', label: 'Purchase Price', type: 'number', required: true, currency: true },
      { key: 'deposit_required', label: 'Deposit Required', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
      { key: 'deposit_amount', label: 'Deposit Amount', type: 'number', required: false, currency: true },
      { key: 'deposit_source', label: 'Deposit Source', type: 'text', required: false },
      { key: 'deposit_already_paid', label: 'Deposit Already Paid', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.yesNo, required: false },
      { key: 'reservation_amount', label: 'Reservation Amount', type: 'number', required: false, currency: true },
    ],
  },
  {
    key: 'finance_summary',
    title: 'Finance Summary',
    description: 'Funding profile used by bond and legal teams for this transaction.',
    fields: [
      { key: 'purchase_finance_type', label: 'Finance Type', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.financeType, required: true },
      { key: 'cash_amount', label: 'Cash Amount', type: 'number', required: false, currency: true },
      { key: 'bond_amount', label: 'Bond Amount', type: 'number', required: false, currency: true },
      { key: 'bond_bank_name', label: 'Bond Bank Name', type: 'text', required: false },
      { key: 'bond_current_status', label: 'Bond Status', type: 'select', options: MY_DETAILS_SELECT_OPTION_GROUPS.bondStatus, required: false },
      { key: 'source_of_funds', label: 'Source of Funds', type: 'text', required: false },
    ],
  },
  {
    key: 'legal_entity_details',
    title: 'Legal / Entity Details',
    description: 'Entity-specific details for trust or company purchase structures.',
    fields: [
      { key: 'company_name', label: 'Company Name', type: 'text', required: false },
      { key: 'company_registration_number', label: 'Company Registration Number', type: 'text', required: false },
      { key: 'authorised_signatory_name', label: 'Authorised Signatory Name', type: 'text', required: false },
      { key: 'trust_name', label: 'Trust Name', type: 'text', required: false },
      { key: 'trust_registration_number', label: 'Trust Registration Number', type: 'text', required: false },
      { key: 'authorised_trustee_name', label: 'Authorised Trustee Name', type: 'text', required: false },
    ],
  },
]

const CLIENT_DOCUMENT_TABS = [
  { key: 'sales', label: 'Sales Documents' },
  { key: 'fica', label: 'FICA Documents' },
  { key: 'bond', label: 'Bond' },
  { key: 'additional', label: 'Additional Requests' },
  { key: 'property', label: 'Property Documents' },
]

const FICA_REQUIREMENT_CONFIG = {
  base: [
    { key: 'buyer_identity_document', label: 'Identity document', description: 'Valid ID or passport copy.', required: true },
    { key: 'buyer_proof_of_address', label: 'Proof of address', description: 'Recent proof of residential address.', required: true },
  ],
  byPurchaserType: {
    individual: [],
    company: [
      { key: 'company_registration_documents', label: 'Company registration documents', description: 'CIPC registration documents for the purchasing company.', required: true },
      { key: 'director_identity_documents', label: 'Director identity documents', description: 'ID copies for authorised directors/signatories.', required: true },
      { key: 'company_authority_resolution', label: 'Company authority resolution', description: 'Signed authority resolution permitting the transaction.', required: true },
    ],
    trust: [
      { key: 'trust_deed', label: 'Trust deed', description: 'Signed trust deed and supporting registration details.', required: true },
      { key: 'letters_of_authority', label: 'Letters of authority', description: 'Master-issued letters of authority for the trust.', required: true },
      { key: 'trustee_identity_documents', label: 'Trustee identity documents', description: 'ID copies for authorised trustees.', required: true },
      { key: 'trust_resolution', label: 'Trust resolution', description: 'Signed trustee resolution authorising the purchase.', required: true },
    ],
  },
  byMaritalRegime: {
    cop: [
      { key: 'spouse_identity_document', label: 'Spouse identity document', description: 'ID copy for spouse in community of property.', required: true },
      { key: 'marriage_certificate', label: 'Marriage certificate', description: 'Marriage certificate for compliance records.', required: true },
    ],
    anc: [
      { key: 'marriage_certificate', label: 'Marriage certificate', description: 'Marriage certificate for legal verification.', required: true },
      { key: 'anc_contract', label: 'ANC contract', description: 'Ante-nuptial contract where applicable.', required: false },
    ],
    married: [
      { key: 'marriage_certificate', label: 'Marriage certificate', description: 'Marriage certificate for legal verification.', required: true },
    ],
  },
  byTransactionType: {
    private_property: [
      { key: 'seller_legal_pack_confirmation', label: 'Private property legal pack confirmation', description: 'Additional legal confirmation may be required for private property transactions.', required: false },
    ],
    developer_sale: [],
  },
}

function getClientPortalPath(token, sectionKey) {
  if (sectionKey === 'overview') return `/client/${token}`
  if (sectionKey === 'bond_application') return `/client/${token}/bond-application`
  return `/client/${token}/${sectionKey}`
}

const ZAR_CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function cloneMyDetailsFormData(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value || {})
  }

  try {
    return JSON.parse(JSON.stringify(value || {}))
  } catch (_error) {
    return { ...(value || {}) }
  }
}

function getNestedPortalValue(source, path = []) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return current[key]
  }, source)
}

function setNestedPortalValue(source, path = [], value) {
  if (!path.length) return source
  const [head, ...tail] = path
  const current = source && typeof source === 'object' ? source : {}
  const nextNode = current[head]

  return {
    ...current,
    [head]: tail.length ? setNestedPortalValue(nextNode, tail, value) : value,
  }
}

function isMyDetailsValueFilled(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function resolveMyDetailsFieldValue(formData = {}, fieldKey) {
  const topLevelValue = formData?.[fieldKey]
  if (isMyDetailsValueFilled(topLevelValue)) {
    return topLevelValue
  }

  if (MY_DETAILS_PURCHASER_FIELDS.has(fieldKey)) {
    const nestedValue = getNestedPortalValue(formData, ['purchaser', fieldKey])
    if (isMyDetailsValueFilled(nestedValue)) return nestedValue
  }

  if (MY_DETAILS_FINANCE_FIELDS.has(fieldKey)) {
    const nestedValue = getNestedPortalValue(formData, ['finance', fieldKey])
    if (isMyDetailsValueFilled(nestedValue)) return nestedValue
  }

  if (MY_DETAILS_COMPANY_FIELDS.has(fieldKey)) {
    const nestedValue = getNestedPortalValue(formData, ['company', fieldKey])
    if (isMyDetailsValueFilled(nestedValue)) return nestedValue
  }

  if (MY_DETAILS_TRUST_FIELDS.has(fieldKey)) {
    const nestedValue = getNestedPortalValue(formData, ['trust', fieldKey])
    if (isMyDetailsValueFilled(nestedValue)) return nestedValue
  }

  return topLevelValue ?? ''
}

function updateMyDetailsDraftField(formData = {}, fieldKey, nextValue) {
  let nextDraft = {
    ...(formData || {}),
    [fieldKey]: nextValue,
  }

  if (MY_DETAILS_PURCHASER_FIELDS.has(fieldKey)) {
    nextDraft = setNestedPortalValue(nextDraft, ['purchaser', fieldKey], nextValue)
  }

  if (MY_DETAILS_FINANCE_FIELDS.has(fieldKey)) {
    nextDraft = setNestedPortalValue(nextDraft, ['finance', fieldKey], nextValue)
  }

  if (MY_DETAILS_COMPANY_FIELDS.has(fieldKey)) {
    nextDraft = setNestedPortalValue(nextDraft, ['company', fieldKey], nextValue)
  }

  if (MY_DETAILS_TRUST_FIELDS.has(fieldKey)) {
    nextDraft = setNestedPortalValue(nextDraft, ['trust', fieldKey], nextValue)
  }

  return nextDraft
}

function formatMyDetailsFieldDisplayValue(field, value) {
  if (!isMyDetailsValueFilled(value)) return '—'

  if (field?.type === 'date') {
    return formatShortPortalDate(value, '—')
  }

  if (field?.currency) {
    const numericValue = Number(value)
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return ZAR_CURRENCY.format(numericValue)
    }
  }

  if (field?.type === 'select' && Array.isArray(field.options)) {
    const option = field.options.find((item) => String(item.value) === String(value))
    if (option?.label) return option.label
  }

  return formatOnboardingFieldValue(value)
}

function getRequestedByLabel(role) {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'attorney') return 'Conveyancer'
  if (normalized === 'bond_originator') return 'Bond Originator'
  if (normalized === 'developer') return 'Developer Team'
  if (normalized === 'agent') return 'Agent'
  if (!normalized) return 'Team'
  return toTitleLabel(normalized)
}

function getPortalDocumentWorkspaceCategory(document = {}) {
  const explicitCategory = normalizePortalWorkspaceCategory(
    document?.portalWorkspaceCategory || document?.portal_workspace_category,
  )
  if (explicitCategory) {
    return explicitCategory
  }

  const metadataCategory = resolvePortalDocumentMetadata(document).portalWorkspaceCategory
  if (metadataCategory && metadataCategory !== 'additional') {
    return metadataCategory
  }

  if (isPropertyDocument(document)) {
    return 'property'
  }
  if (isBondDocument(document)) {
    return 'bond'
  }
  if (isSalesDocument(document)) {
    return 'sales'
  }
  if (isFicaDocument(document)) {
    return 'fica'
  }

  return metadataCategory || 'additional'
}

function resolveClientMaritalRegime(formData = {}) {
  const maritalStatus = normalizePortalStatus(formData?.marital_status || formData?.purchaser?.marital_status)
  const maritalRegime = normalizePortalStatus(formData?.marital_regime || formData?.purchaser?.marital_regime)

  if (maritalRegime.includes('cop') || maritalRegime.includes('community')) return 'cop'
  if (maritalRegime.includes('anc') || maritalRegime.includes('ante')) return 'anc'
  if (maritalStatus === 'married') return 'married'
  return 'single'
}

function resolvePurchaserTypeForDocuments(portal) {
  const formData = portal?.onboardingFormData?.formData || {}
  return normalizePortalStatus(
    formData?.purchaser_entity_type ||
      formData?.purchaser_type ||
      portal?.purchaserType ||
      portal?.transaction?.purchaser_type ||
      'individual',
  )
}

function resolveTransactionTypeForDocuments(portal) {
  return normalizePortalStatus(portal?.transaction?.transaction_type || 'developer_sale')
}

function getFicaRequirementTemplate({ transactionType, purchaserType, maritalRegime }) {
  return [
    ...FICA_REQUIREMENT_CONFIG.base,
    ...(FICA_REQUIREMENT_CONFIG.byPurchaserType[purchaserType] || []),
    ...(FICA_REQUIREMENT_CONFIG.byMaritalRegime[maritalRegime] || []),
    ...(FICA_REQUIREMENT_CONFIG.byTransactionType[transactionType] || []),
  ]
}

function resolveFicaRequirementStatus(requirement, requirementDocs = [], uploadedDocsById = new Map()) {
  const keyNeedle = String(requirement.key || '').toLowerCase()
  const labelNeedle = String(requirement.label || '').toLowerCase()
  const matchedRequirementDoc = requirementDocs.find((doc) => {
    const keyHaystack = String(doc.key || '').toLowerCase()
    const labelHaystack = String(doc.label || '').toLowerCase()
    return keyHaystack.includes(keyNeedle) || keyNeedle.includes(keyHaystack) || labelHaystack.includes(labelNeedle)
  }) || null

  const uploadedDocument =
    matchedRequirementDoc?.uploadedDocumentId ? uploadedDocsById.get(String(matchedRequirementDoc.uploadedDocumentId)) : null

  const isUploaded = Boolean(matchedRequirementDoc?.complete || matchedRequirementDoc?.isUploaded || uploadedDocument?.url)
  return {
    matchedRequirementDoc,
    uploadedDocument,
    statusLabel: requirement.required ? (isUploaded ? 'Uploaded' : 'Missing') : (isUploaded ? 'Uploaded' : 'Not Required'),
    isUploaded,
  }
}

function formatClientPortalDate(value, fallback = 'Not set') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString()
}

function normalizePortalStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function getDaysInStageLabel(value) {
  if (!value) return 'In progress'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'In progress'
  const elapsedDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)))
  if (elapsedDays === 0) return 'Today'
  if (elapsedDays === 1) return '1 day'
  return `${elapsedDays} days`
}

function getDaysElapsed(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)))
}

function formatShortPortalDate(value, fallback = 'Recently') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatClientNotificationTime(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleString()
}

const CLIENT_ONBOARDING_COMPLETED_STATUSES = new Set([
  'submitted',
  'reviewed',
  'approved',
  'complete',
  'completed',
  'client_onboarding_complete',
])

function isClientOnboardingComplete(status) {
  return CLIENT_ONBOARDING_COMPLETED_STATUSES.has(normalizePortalStatus(status))
}

function resolveClientNextStepState({
  missingRequired,
  otpSignaturePending,
  onboardingStatus,
  occupationalRent,
  occupationalRentProofDocument,
  reservationRequired = false,
  reservationStatus = '',
  handoverStatus,
  mainStage,
  nextStage,
}) {
  const normalizedMainStage = String(mainStage || '').toUpperCase()
  const normalizedHandoverStatus = normalizePortalStatus(handoverStatus)
  const normalizedReservationStatus = normalizePortalStatus(reservationStatus)
  const onboardingComplete = isClientOnboardingComplete(onboardingStatus)
  const occupationalRentProofPending =
    occupationalRent?.enabled &&
    occupationalRent?.status &&
    normalizePortalStatus(occupationalRent.status) !== 'settled' &&
    !occupationalRentProofDocument
  const documentUploadPending = missingRequired > 0 || occupationalRentProofPending
  const handoverPending =
    ['REG', 'XFER'].includes(normalizedMainStage) &&
    !['completed', 'closed'].includes(normalizedHandoverStatus)

  // 1. Awaiting Signature / Approval
  if (otpSignaturePending) {
    return {
      type: 'awaiting_signature_approval',
      label: 'Next Step',
      title: 'Signature or approval required',
      description: 'Please review and sign the pending document so your transaction can keep moving.',
      helperText: 'Your team is waiting for your sign-off before the next milestone can proceed.',
      ctaLabel: 'Review Document',
      ctaTo: 'documents',
      tone: 'action',
      requiresAction: true,
      clientActionCount: 1,
    }
  }

  // 2. Reservation Deposit
  if (
    reservationRequired &&
    !['paid', 'verified'].includes(normalizedReservationStatus) &&
    ['AVAIL', 'DEP', 'OTP'].includes(normalizedMainStage)
  ) {
    return {
      type: 'reservation_deposit_required',
      label: 'Next Step',
      title: 'Pay reservation deposit',
      description: 'Please pay the reservation deposit and upload proof of payment so your team can verify it.',
      helperText: 'Your transaction cannot move past the reservation stage until this is verified.',
      ctaLabel: 'Open Documents',
      ctaTo: 'documents',
      tone: 'action',
      requiresAction: true,
      clientActionCount: 1,
    }
  }

  // 2. Upload Documents
  if (missingRequired > 0) {
    return {
      type: 'upload_documents',
      label: 'Next Step',
      title: 'Upload required documents',
      description: `You still have ${missingRequired} required document${missingRequired === 1 ? '' : 's'} outstanding before the next stage can proceed.`,
      helperText: 'Please upload the outstanding items listed in your Documents section.',
      ctaLabel: 'Open Documents',
      ctaTo: 'documents',
      tone: 'action',
      requiresAction: true,
      clientActionCount: missingRequired,
    }
  }

  if (occupationalRentProofPending) {
    return {
      type: 'upload_documents',
      label: 'Next Step',
      title: 'Upload required documents',
      description: occupationalRent.nextDueDate
        ? `Please upload your latest occupational rent proof by ${formatClientPortalDate(occupationalRent.nextDueDate)}.`
        : 'Please upload your latest occupational rent proof so your team can continue.',
      helperText: 'We are waiting for your upload before moving this part of the transaction forward.',
      ctaLabel: 'Upload Proof',
      ctaTo: 'documents',
      tone: 'action',
      requiresAction: true,
      clientActionCount: 1,
    }
  }

  // 3. Complete Information / Onboarding
  if (!onboardingComplete) {
    return {
      type: 'complete_information',
      label: 'Next Step',
      title: 'Complete your information',
      description: 'We still need a few onboarding details from you before the team can continue.',
      helperText: 'Please complete your information sheet so the transaction can move to the next stage.',
      ctaLabel: 'Continue Information Sheet',
      ctaTo: 'details',
      tone: 'action',
      requiresAction: true,
      clientActionCount: 1,
    }
  }

  // 4. Book / Confirm Handover
  if (handoverPending) {
    return {
      type: 'book_confirm_handover',
      label: 'Next Step',
      title: 'Prepare for handover',
      description: 'Your transaction is nearing completion. Please review handover details and confirm readiness.',
      helperText: 'Your team will finalize key timing and handover coordination with you here.',
      ctaLabel: 'View Handover',
      ctaTo: 'handover',
      tone: 'action',
      requiresAction: true,
      clientActionCount: 1,
    }
  }

  // 5. Awaiting Finance Outcome
  if (normalizedMainStage === 'FIN') {
    return {
      type: 'awaiting_finance_outcome',
      label: 'Next Step',
      title: 'Your finance application is in progress',
      description: 'The finance team is currently progressing your application and lender workflow.',
      helperText: 'No immediate action is required unless your team contacts you for a specific item.',
      ctaLabel: 'View Progress',
      ctaTo: 'overview',
      tone: 'in_progress',
      requiresAction: false,
      clientActionCount: 0,
    }
  }

  // 6. Awaiting Transfer / Legal Progress
  if (['ATTY', 'XFER', 'REG'].includes(normalizedMainStage)) {
    return {
      type: 'awaiting_transfer_legal_progress',
      label: 'Next Step',
      title: 'Your transfer is currently in progress',
      description: 'Your legal team is actively progressing the transfer process on your behalf.',
      helperText: 'No client action is required right now. We will let you know as soon as anything is needed.',
      ctaLabel: 'View Workflow',
      ctaTo: 'overview',
      tone: 'in_progress',
      requiresAction: false,
      clientActionCount: 0,
    }
  }

  // 7. No Action Required (fallback)
  return {
    type: 'no_action_required',
    label: 'Next Step',
    title: 'No action required from you right now',
    description: 'Your team is currently progressing the next steps in your transaction.',
    helperText: `Everything is on track. Next milestone: ${nextStage}.`,
    ctaLabel: 'View Progress',
    ctaTo: 'overview',
    tone: 'calm',
    requiresAction: false,
    clientActionCount: 0,
  }
}

function resolveChecklistProgressState({ complete = false, inProgress = false }) {
  if (complete) return 'complete'
  if (inProgress) return 'in_progress'
  return 'not_started'
}

function getChecklistProgressMeta(status) {
  if (status === 'complete') {
    return {
      label: 'Complete',
      className: 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]',
    }
  }
  if (status === 'in_progress') {
    return {
      label: 'In progress',
      className: 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]',
    }
  }
  return {
    label: 'Not started',
    className: 'border-[#dde7f1] bg-white text-[#64748b]',
  }
}

function normalizeHumanUpdateSummary(value) {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) {
    return 'Your team posted a progress update.'
  }

  const firstSentence = compact.match(/^[^.?!]+[.?!]?/)
  const trimmed = String(firstSentence?.[0] || compact).trim()
  return trimmed.length > 170 ? `${trimmed.slice(0, 167).trimEnd()}...` : trimmed
}

function buildClientFacingUpdate(item) {
  const rawBody = String(item?.commentBody || item?.commentText || '')
    .replace(/\s+/g, ' ')
    .trim()
  const actorName = item?.authorName || 'Bridge Team'
  const actorRole = item?.authorRoleLabel || 'Bridge Team'
  const createdLabel = item?.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently'
  const contextLabel = `Updated by ${actorName} • ${actorRole} • ${createdLabel}`

  const stagePair = rawBody.match(/transaction stage updated:\s*(.+?)\s*changed to\s*(.+?)(?: by | at |$)/i)
  if (stagePair) {
    return {
      title: `Your transaction moved to ${stagePair[2]}`,
      summary: `Your team has completed ${stagePair[1]} and moved your purchase into the next milestone.`,
      contextLabel,
    }
  }

  const financeChange = rawBody.match(/finance workflow updated:\s*(.+?)(?: by | at |$)/i)
  if (financeChange) {
    return {
      title: 'Finance progress updated',
      summary: normalizeHumanUpdateSummary(financeChange[1]),
      contextLabel,
    }
  }

  const attorneyChange = rawBody.match(/attorney workflow updated:\s*(.+?)(?: by | at |$)/i)
  if (attorneyChange) {
    return {
      title: 'Transfer progress updated',
      summary: normalizeHumanUpdateSummary(attorneyChange[1]),
      contextLabel,
    }
  }

  if (String(item?.discussionType || '').toLowerCase() === 'system') {
    return {
      title: 'System progress update',
      summary: normalizeHumanUpdateSummary(rawBody),
      contextLabel,
    }
  }

  return {
    title: 'Update from your team',
    summary: normalizeHumanUpdateSummary(rawBody),
    contextLabel,
  }
}

function buildClientJourneyFeedItem(item, index = 0) {
  const authoredAt = item?.createdAt || item?.created_at || ''
  const timestampLabel = authoredAt ? new Date(authoredAt).toLocaleString() : 'Recently'
  const authorName = item?.authorName || item?.author_name || 'Bridge Team'
  const authorRole = item?.authorRoleLabel || toTitleLabel(item?.authorRole || item?.author_role || 'Bridge Team')
  const formatted = buildClientFacingUpdate(item)

  return {
    id: item?.id || `update_${index}`,
    authorName,
    authorRole,
    message: formatted?.summary || 'Your team posted a progress update.',
    timestampLabel,
  }
}

function buildClientWhatsHappeningSummary({
  mainStage,
  nextStage,
  latestJourneyUpdates = [],
  nextStepState,
}) {
  const normalizedMainStage = String(mainStage || '').toUpperCase()

  const stageSummaryMap = {
    AVAIL: 'Your transaction is currently in the early sales preparation stage.',
    DEP: 'Your reservation and deposit phase is currently active.',
    OTP: 'Your transaction has moved into the offer-to-purchase stage.',
    FIN: 'Your file is currently moving through finance progression.',
    ATTY: 'Your file is now in legal transfer preparation.',
    XFER: 'Your transfer is actively progressing toward registration.',
    REG: 'Your transaction has reached registration and close-out progression.',
  }

  const teamFocusMap = {
    AVAIL: 'Your team is aligning the initial transaction setup so the process can move smoothly.',
    DEP: 'Your team is confirming reservation records and preparing the next deal milestones.',
    OTP: 'Your team is finalising signed deal records and preparing finance and legal handover.',
    FIN: 'The finance team is handling lender-side workflow and approvals.',
    ATTY: 'The legal team is preparing transfer documents and required legal milestones.',
    XFER: 'The attorney and transfer teams are coordinating final legal progression and registration readiness.',
    REG: 'Your team is finalising registration confirmations and close-out tasks.',
  }

  const latestSummary = latestJourneyUpdates[0]?.summary || null
  const fallbackSummary = nextStepState?.requiresAction
    ? `Once your current step is completed, your transaction can move to ${nextStage}.`
    : 'No immediate action is required from you right now. Your team is progressing the next steps.'

  return [
    stageSummaryMap[normalizedMainStage] || 'Your transaction is progressing through the current stage.',
    teamFocusMap[normalizedMainStage] || 'Your team is actively progressing this part of your transaction.',
    latestSummary ? `Latest update: ${latestSummary}` : fallbackSummary,
  ]
}

function ClientPortal() {
  const { token = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [portal, setPortal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState('')
  const [activeDocumentsTab, setActiveDocumentsTab] = useState('sales')
  const [activeBondApplicationTab, setActiveBondApplicationTab] = useState('application')
  const [activeBondApplicationSectionTab, setActiveBondApplicationSectionTab] = useState('summary')
  const [activeBondApplicantKey, setActiveBondApplicantKey] = useState('primary')
  const [bondApplicationDraft, setBondApplicationDraft] = useState(null)
  const [bondApplicationDirty, setBondApplicationDirty] = useState(false)
  const [bondApplicationSaving, setBondApplicationSaving] = useState(false)
  const [documentPanel, setDocumentPanel] = useState({ open: false, item: null })
  const [expandedJourneyStepId, setExpandedJourneyStepId] = useState(null)
  const [myDetailsDraft, setMyDetailsDraft] = useState({})
  const [myDetailsEditingSection, setMyDetailsEditingSection] = useState('')
  const [myDetailsSavingSection, setMyDetailsSavingSection] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsSeenAt, setNotificationsSeenAt] = useState('')
  const notificationsRef = useRef(null)

  const [issueForm, setIssueForm] = useState({
    category: ISSUE_CATEGORIES[0],
    description: '',
    location: '',
    priority: '',
  })
  const [alterationForm, setAlterationForm] = useState({
    title: '',
    category: '',
    description: '',
    budgetRange: '',
    preferredTiming: '',
  })
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    reviewText: '',
    positives: '',
    improvements: '',
    allowMarketingUse: false,
  })
  const [trustForm, setTrustForm] = useState({
    attorneyFirmName: '',
    purchaserFullName: '',
    purchaserIdentityOrRegistrationNumber: '',
    fullName: '',
    identityOrRegistrationNumber: '',
    incomeTaxNumber: '',
    southAfricanResident: null,
    physicalAddress: '',
    postalAddress: '',
    telephoneNumber: '',
    faxNumber: '',
    balanceTo: '',
    bankName: '',
    accountNumber: '',
    branchNumber: '',
    sourceOfFunds: '',
    declarationAccepted: false,
    signatureName: '',
    signedDate: '',
  })
  const [handoverForm, setHandoverForm] = useState({
    handoverDate: '',
    electricityMeterReading: '',
    waterMeterReading: '',
    gasMeterReading: '',
    inspectionCompleted: false,
    keysHandedOver: false,
    remoteHandedOver: false,
    manualsHandedOver: false,
    notes: '',
    signatureName: '',
  })
  const [handoverPhotoFiles, setHandoverPhotoFiles] = useState({
    electricity: null,
    water: null,
    gas: null,
  })

  const requestedSection = useMemo(() => {
    if (location.pathname.endsWith('/progress')) return 'progress'
    if (location.pathname.endsWith('/bond-application')) return 'bond_application'
    if (location.pathname.endsWith('/documents') || location.pathname.endsWith('/forms/trust-investment')) return 'documents'
    if (location.pathname.endsWith('/details') || location.pathname.endsWith('/onboarding')) return 'details'
    if (location.pathname.endsWith('/handover')) return 'handover'
    if (location.pathname.endsWith('/homeowner')) return 'handover'
    if (location.pathname.endsWith('/snags') || location.pathname.endsWith('/issues')) return 'snags'
    if (location.pathname.endsWith('/settings')) return 'settings'
    if (location.pathname.endsWith('/team')) return 'team'
    if (location.pathname.endsWith('/alterations')) return 'alterations'
    if (location.pathname.endsWith('/review')) return 'review'
    return 'overview'
  }, [location.pathname])

  const loadPortal = useCallback(async () => {
    if (!token) {
      setError('Missing client portal token.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = await fetchClientPortalByToken(token)
      setPortal(data)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadPortal()
  }, [loadPortal])

  useEffect(() => {
    if (!portal) {
      setMyDetailsDraft({})
      setBondApplicationDraft(null)
      return
    }
    setMyDetailsDraft(cloneMyDetailsFormData(portal?.onboardingFormData?.formData || {}))
    setMyDetailsEditingSection('')
    setMyDetailsSavingSection('')
    setBondApplicationDraft(buildBondApplicationDraft(portal))
    setBondApplicationDirty(false)
    setActiveBondApplicantKey('primary')
  }, [portal])

  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setNotificationsOpen(false)
  }, [location.pathname])

  function handleMyDetailsFieldChange(fieldKey, nextValue) {
    setMyDetailsDraft((previous) => updateMyDetailsDraftField(previous, fieldKey, nextValue))
  }

  function handleCancelMyDetailsEdit() {
    setMyDetailsDraft(cloneMyDetailsFormData(portal?.onboardingFormData?.formData || {}))
    setMyDetailsEditingSection('')
  }

  async function handleSaveMyDetailsSection(sectionKey) {
    try {
      setMyDetailsSavingSection(sectionKey)
      setError('')
      await saveClientPortalOnboardingDraft({
        token,
        formData: myDetailsDraft,
      })
      await loadPortal()
      setMyDetailsEditingSection('')
    } catch (saveError) {
      setError(saveError.message || 'Unable to save your details right now.')
    } finally {
      setMyDetailsSavingSection('')
    }
  }

  function updateBondApplicationField(path, value) {
    setBondApplicationDraft((previous) => {
      if (!previous) return previous
      return setNestedPortalValue(previous, path, value)
    })
    setBondApplicationDirty(true)
  }

  function updateBondApplicationApplicantField(applicantKey, fieldKey, value) {
    setBondApplicationDraft((previous) => {
      if (!previous) return previous
      const nextApplicants = Array.isArray(previous.applicants)
        ? previous.applicants.map((applicant) =>
            applicant.key === applicantKey ? { ...applicant, [fieldKey]: value } : applicant,
          )
        : []
      return {
        ...previous,
        applicants: nextApplicants,
      }
    })
    setBondApplicationDirty(true)
  }

  function toggleBondApplicationBank(bankName) {
    setBondApplicationDraft((previous) => {
      if (!previous) return previous
      const selectedBanks = Array.isArray(previous.selected_banks) ? previous.selected_banks : []
      const isSelected = selectedBanks.includes(bankName)
      return {
        ...previous,
        selected_banks: isSelected
          ? selectedBanks.filter((item) => item !== bankName)
          : [...selectedBanks, bankName],
      }
    })
    setBondApplicationDirty(true)
  }

  async function persistBondApplicationDraft(nextDraft = bondApplicationDraft, { submitted = false } = {}) {
    if (!nextDraft) return

    try {
      setBondApplicationSaving(true)
      setError('')

      const timestamp = new Date().toISOString()
      const nextStatus = submitted
        ? 'Submitted'
        : nextDraft.status === 'Not Started' || !nextDraft.status
          ? 'In Progress'
          : nextDraft.status

      const draftToPersist = {
        ...nextDraft,
        status: nextStatus,
        submitted_at: submitted ? timestamp : nextDraft.submitted_at || '',
      }

      const nextFormData = cloneMyDetailsFormData(portal?.onboardingFormData?.formData || {})
      nextFormData.bond_application = draftToPersist

      await saveClientPortalOnboardingDraft({
        token,
        formData: nextFormData,
      })

      setBondApplicationDraft(draftToPersist)
      setBondApplicationDirty(false)
      await loadPortal()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save bond application details right now.')
      throw saveError
    } finally {
      setBondApplicationSaving(false)
    }
  }

  async function handleBondApplicationSectionChange(nextSectionKey) {
    if (nextSectionKey === activeBondApplicationSectionTab) return
    if (bondApplicationDirty) {
      await persistBondApplicationDraft()
    }
    setActiveBondApplicationSectionTab(nextSectionKey)
  }

  async function handleBondApplicationTabChange(nextTabKey) {
    if (nextTabKey === activeBondApplicationTab) return
    if (bondApplicationDirty && activeBondApplicationTab === 'application') {
      await persistBondApplicationDraft()
    }
    setActiveBondApplicationTab(nextTabKey)
  }

  async function handleBondApplicationSubmit() {
    if (!bondApplicationDraft) return

    const hasConsent = Boolean(
      bondApplicationDraft?.declarations_consents?.loan_processing_consent &&
      bondApplicationDraft?.declarations_consents?.credit_bureau_fraud_bank_data_consent &&
      bondApplicationDraft?.declarations_consents?.declaration_accepted &&
      String(bondApplicationDraft?.declarations_consents?.digital_signature_name || '').trim() &&
      String(bondApplicationDraft?.declarations_consents?.digital_signature_date || '').trim(),
    )
    if (!hasConsent) {
      setError('Please complete the declarations, consents, and digital signature before submitting your bond application.')
      return
    }

    if (!Array.isArray(bondApplicationDraft.selected_banks) || bondApplicationDraft.selected_banks.length === 0) {
      setError('Select at least one bank before submitting your bond application.')
      return
    }

    await persistBondApplicationDraft(
      {
        ...bondApplicationDraft,
        status: 'Submitted',
      },
      { submitted: true },
    )
  }

  async function handleAcceptBondOffer(offer) {
    if (!offer?.id || !bondApplicationDraft) return

    const offerId = String(offer.id)
    const existingDeclinedIds = Array.isArray(bondApplicationDraft?.offers?.declined_offer_document_ids)
      ? bondApplicationDraft.offers.declined_offer_document_ids.map((value) => String(value)).filter(Boolean)
      : []
    const timestamp = new Date().toISOString()

    const nextDraft = {
      ...bondApplicationDraft,
      status: ['Not Started', 'Declined'].includes(bondApplicationDraft.status) ? 'In Progress' : bondApplicationDraft.status,
      offers: {
        ...(bondApplicationDraft.offers || {}),
        accepted_offer_document_id: offerId,
        accepted_bank: offer.bankName || 'Other',
        accepted_at: timestamp,
        decision_state: 'accepted',
        decision_offer_document_id: offerId,
        decision_at: timestamp,
        declined_offer_document_ids: existingDeclinedIds.filter((value) => value !== offerId),
      },
    }

    await persistBondApplicationDraft(nextDraft)
  }

  async function handleDeclineBondOffer(offer) {
    if (!offer?.id || !bondApplicationDraft) return

    const offerId = String(offer.id)
    const existingOffers = bondApplicationDraft?.offers || {}
    const existingDeclinedIds = Array.isArray(existingOffers.declined_offer_document_ids)
      ? existingOffers.declined_offer_document_ids.map((value) => String(value)).filter(Boolean)
      : []
    const declinedOfferDocumentIds = [...new Set([...existingDeclinedIds, offerId])]
    const currentAcceptedId = String(existingOffers.accepted_offer_document_id || '')
    const hasDifferentAcceptedOffer = Boolean(currentAcceptedId && currentAcceptedId !== offerId)
    const timestamp = new Date().toISOString()

    const nextOffers = {
      ...existingOffers,
      decision_state: hasDifferentAcceptedOffer ? 'accepted' : 'declined',
      decision_offer_document_id: hasDifferentAcceptedOffer ? currentAcceptedId : offerId,
      decision_at: timestamp,
      declined_offer_document_ids: declinedOfferDocumentIds,
    }

    if (currentAcceptedId === offerId) {
      nextOffers.accepted_offer_document_id = ''
      nextOffers.accepted_bank = ''
      nextOffers.accepted_at = ''
      nextOffers.signed_offer_document_id = ''
      nextOffers.signed_offer_uploaded_at = ''
    }

    const nextDraft = {
      ...bondApplicationDraft,
      status: hasDifferentAcceptedOffer ? bondApplicationDraft.status : 'Declined',
      offers: nextOffers,
    }

    await persistBondApplicationDraft(nextDraft)
  }

  async function handleUploadSignedBondOffer(file, offer) {
    if (!file || !bondApplicationDraft) return

    try {
      setBondApplicationSaving(true)
      setError('')
      const uploaded = await uploadClientPortalDocument({
        token,
        file,
        category: offer?.bankName ? `Bond Offer Signed - ${offer.bankName}` : 'Bond Offer Signed',
      })

      const nextDraft = {
        ...bondApplicationDraft,
        offers: {
          ...(bondApplicationDraft.offers || {}),
          accepted_offer_document_id:
            bondApplicationDraft?.offers?.accepted_offer_document_id || String(offer?.id || ''),
          accepted_bank: bondApplicationDraft?.offers?.accepted_bank || offer?.bankName || 'Other',
          accepted_at: bondApplicationDraft?.offers?.accepted_at || new Date().toISOString(),
          decision_state: 'accepted',
          decision_offer_document_id:
            bondApplicationDraft?.offers?.accepted_offer_document_id || String(offer?.id || ''),
          decision_at: new Date().toISOString(),
          declined_offer_document_ids: Array.isArray(bondApplicationDraft?.offers?.declined_offer_document_ids)
            ? bondApplicationDraft.offers.declined_offer_document_ids
                .map((value) => String(value))
                .filter((value) => value && value !== String(offer?.id || ''))
            : [],
          signed_offer_document_id: uploaded?.id ? String(uploaded.id) : bondApplicationDraft?.offers?.signed_offer_document_id || '',
          signed_offer_uploaded_at: new Date().toISOString(),
        },
      }

      const nextFormData = cloneMyDetailsFormData(portal?.onboardingFormData?.formData || {})
      nextFormData.bond_application = nextDraft
      await saveClientPortalOnboardingDraft({
        token,
        formData: nextFormData,
      })

      setBondApplicationDraft(nextDraft)
      setBondApplicationDirty(false)
      await loadPortal()
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload your signed offer right now.')
    } finally {
      setBondApplicationSaving(false)
    }
  }

  function handleDownloadOnboardingSummary() {
    try {
      setError('')
      const markup = buildOnboardingDocumentMarkup({
        portal,
        groupedOnboardingFields,
        purchasePriceLabel,
        onboardingStatus,
      })
      const blob = new Blob([markup], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const printWindow = window.open(url, '_blank', 'noopener,noreferrer')

      if (!printWindow) {
        setError('Unable to open the onboarding document. Please allow pop-ups and try again.')
        URL.revokeObjectURL(url)
        return
      }

      const cleanup = () => {
        window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      }

      printWindow.addEventListener?.('load', () => {
        printWindow.focus()
        cleanup()
      })
    } catch (downloadError) {
      setError(downloadError.message || 'Unable to download onboarding information right now.')
    }
  }

  async function handleSubmitIssue(event) {
    event.preventDefault()
    const file = event.currentTarget.photo?.files?.[0] || null

    try {
      setSaving(true)
      setError('')
      await submitClientIssue({ token, ...issueForm, photoFile: file })
      setIssueForm({ category: ISSUE_CATEGORIES[0], description: '', location: '', priority: '' })
      event.currentTarget.reset()
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitAlteration(event) {
    event.preventDefault()
    const file = event.currentTarget.referenceImage?.files?.[0] || null

    try {
      setSaving(true)
      setError('')
      await submitAlterationRequest({ token, ...alterationForm, referenceImageFile: file })
      setAlterationForm({ title: '', category: '', description: '', budgetRange: '', preferredTiming: '' })
      event.currentTarget.reset()
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitReview(event) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      await submitServiceReview({ token, ...reviewForm })
      setReviewForm({
        rating: 5,
        reviewText: '',
        positives: '',
        improvements: '',
        allowMarketingUse: false,
      })
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitPortalComment(event) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      await submitClientPortalComment({
        token,
        commentText: commentDraft,
      })
      setCommentDraft('')
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadRequiredDocument(documentKey, file) {
    if (!file) {
      return
    }

    try {
      setUploadingDocumentKey(documentKey)
      setError('')
      await uploadClientPortalDocument({
        token,
        requiredDocumentKey: documentKey,
        category: 'Required Document',
        file,
      })
      await loadPortal()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setUploadingDocumentKey('')
    }
  }

  async function handleUploadReservationDepositProof(file) {
    if (!file) {
      return
    }

    const uploadStateKey = reservationProofRequirement?.key || 'reservation_deposit_proof'

    try {
      setUploadingDocumentKey(uploadStateKey)
      setError('')
      await uploadClientPortalDocument({
        token,
        requiredDocumentKey: reservationProofRequirement?.key || null,
        category: 'Reservation Deposit / Proof of Payment',
        file,
      })
      await loadPortal()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setUploadingDocumentKey('')
    }
  }

  async function handleUploadOccupationalRentProof(file) {
    if (!file) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await uploadClientPortalDocument({
        token,
        file,
        category: 'Occupational Rent / Proof of Payment',
      })
      await submitClientPortalComment({
        token,
        commentText: 'Uploaded occupational rent proof of payment.',
      })
      await loadPortal()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!portal?.trustInvestmentForm) {
      return
    }

    setTrustForm({
      attorneyFirmName: portal.trustInvestmentForm.attorneyFirmName || '',
      purchaserFullName: portal.trustInvestmentForm.purchaserFullName || portal.buyer?.name || '',
      purchaserIdentityOrRegistrationNumber: portal.trustInvestmentForm.purchaserIdentityOrRegistrationNumber || '',
      fullName: portal.trustInvestmentForm.fullName || portal.buyer?.name || '',
      identityOrRegistrationNumber: portal.trustInvestmentForm.identityOrRegistrationNumber || '',
      incomeTaxNumber: portal.trustInvestmentForm.incomeTaxNumber || '',
      southAfricanResident:
        portal.trustInvestmentForm.southAfricanResident === true || portal.trustInvestmentForm.southAfricanResident === false
          ? portal.trustInvestmentForm.southAfricanResident
          : null,
      physicalAddress: portal.trustInvestmentForm.physicalAddress || '',
      postalAddress: portal.trustInvestmentForm.postalAddress || '',
      telephoneNumber: portal.trustInvestmentForm.telephoneNumber || portal.buyer?.phone || '',
      faxNumber: portal.trustInvestmentForm.faxNumber || '',
      balanceTo: portal.trustInvestmentForm.balanceTo || '',
      bankName: portal.trustInvestmentForm.bankName || '',
      accountNumber: portal.trustInvestmentForm.accountNumber || '',
      branchNumber: portal.trustInvestmentForm.branchNumber || '',
      sourceOfFunds: portal.trustInvestmentForm.sourceOfFunds || '',
      declarationAccepted: Boolean(portal.trustInvestmentForm.declarationAccepted),
      signatureName: portal.trustInvestmentForm.signatureName || portal.buyer?.name || '',
      signedDate: portal.trustInvestmentForm.signedDate || '',
    })
  }, [portal])

  useEffect(() => {
    if (!portal?.handover) {
      return
    }

    setHandoverForm({
      handoverDate: portal.handover.handoverDate || '',
      electricityMeterReading: portal.handover.electricityMeterReading || '',
      waterMeterReading: portal.handover.waterMeterReading || '',
      gasMeterReading: portal.handover.gasMeterReading || '',
      inspectionCompleted: Boolean(portal.handover.inspectionCompleted),
      keysHandedOver: Boolean(portal.handover.keysHandedOver),
      remoteHandedOver: Boolean(portal.handover.remoteHandedOver),
      manualsHandedOver: Boolean(portal.handover.manualsHandedOver),
      notes: portal.handover.notes || '',
      signatureName: portal.handover.signatureName || portal.buyer?.name || '',
    })
  }, [portal])

  function updateTrustField(field, value) {
    setTrustForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleTrustFormSave() {
    try {
      setSaving(true)
      setError('')
      await saveTrustInvestmentFormDraft({
        token,
        form: trustForm,
      })
      await loadPortal()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTrustFormSubmit() {
    try {
      setSaving(true)
      setError('')
      await submitTrustInvestmentForm({
        token,
        form: trustForm,
      })
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  function updateHandoverField(field, value) {
    setHandoverForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleHandoverSave() {
    try {
      setSaving(true)
      setError('')
      await saveClientHandoverDraft({
        token,
        handover: handoverForm,
      })
      for (const field of HANDOVER_PHOTO_FIELDS) {
        const file = handoverPhotoFiles[field.key]
        if (!file) continue
        await uploadClientPortalDocument({
          token,
          file,
          category: field.category,
        })
      }
      setHandoverPhotoFiles({
        electricity: null,
        water: null,
        gas: null,
      })
      await loadPortal()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleHandoverComplete() {
    try {
      setSaving(true)
      setError('')
      await submitClientHandover({
        token,
        handover: handoverForm,
      })
      for (const field of HANDOVER_PHOTO_FIELDS) {
        const file = handoverPhotoFiles[field.key]
        if (!file) continue
        await uploadClientPortalDocument({
          token,
          file,
          category: field.category,
        })
      }
      setHandoverPhotoFiles({
        electricity: null,
        water: null,
        gas: null,
      })
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  const financeTypeForPortal = normalizeFinanceType(
    portal?.onboardingFormData?.formData?.purchase_finance_type || portal?.transaction?.finance_type,
    { allowUnknown: true },
  )
  const isBondOrHybridTransaction =
    financeTypeForPortal === 'bond' || financeTypeForPortal === 'combination' || financeTypeForPortal === 'hybrid'

  const sectionEnabled = {
    overview: true,
    progress: false,
    details: true,
    bond_application: isBondOrHybridTransaction,
    documents: true,
    handover: true,
    snags: Boolean(portal?.settings?.snag_reporting_enabled),
    settings: true,
    team: true,
    alterations: Boolean(portal?.settings?.alteration_requests_enabled),
    review: Boolean(portal?.settings?.service_reviews_enabled),
  }

  const activeSection = sectionEnabled[requestedSection] ? requestedSection : 'overview'

  useEffect(() => {
    if (portal && requestedSection !== activeSection) {
      navigate(`/client/${token}`, { replace: true })
    }
  }, [activeSection, navigate, portal, requestedSection, token])

  if (loading) {
    return <p className="status-message portal-shell">Loading client portal...</p>
  }

  if (error || !portal) {
    return (
      <main className="client-portal-shell">
        <section className="client-portal-card">
          <h1>Client Property Portal</h1>
          <p className="status-message error">{error || 'Unable to load portal data.'}</p>
        </section>
      </main>
    )
  }

  const mainStage = portal.mainStage || getMainStageFromDetailedStage(portal.stage)
  const stageIndex = getMainStageIndex(mainStage)
  const progressPercent = Math.round(((stageIndex + 1) / MAIN_PROCESS_STAGES.length) * 100)
  const nextStageKey = stageIndex < MAIN_PROCESS_STAGES.length - 1 ? MAIN_PROCESS_STAGES[stageIndex + 1] : 'Completed'
  const nextStage = nextStageKey === 'Completed' ? 'Completed' : MAIN_STAGE_LABELS[nextStageKey]
  const missingRequired = Math.max(
    Number(portal.requiredDocumentSummary?.totalRequired || 0) - Number(portal.requiredDocumentSummary?.uploadedCount || 0),
    0,
  )
  const financeProcess = portal?.subprocesses?.find((item) => item.process_type === 'finance') || null
  const attorneyProcess = portal?.subprocesses?.find((item) => item.process_type === 'attorney') || null

  const isOverview = activeSection === 'overview'
  const isDetails = activeSection === 'details'
  const isBondApplication = activeSection === 'bond_application'
  const isDocuments = activeSection === 'documents'
  const isHandover = activeSection === 'handover'
  const isSnags = activeSection === 'snags'
  const isSettings = activeSection === 'settings'
  const isTeam = activeSection === 'team'
  const isAlterations = activeSection === 'alterations'
  const isReview = activeSection === 'review'

  const trustFormStatus = portal?.trustInvestmentForm?.status || 'Not Started'
  const trustFormSubmittedAt = portal?.trustInvestmentForm?.submittedAt || null
  const trustFormActionLabel =
    trustFormStatus === 'Not Started'
      ? 'Complete Form'
      : trustFormStatus === 'In Progress'
        ? 'Continue Form'
        : 'View Submitted Form'
  const trustFormLocked = trustFormStatus === 'Approved'
  const handoverStatus = portal?.handover?.status || 'not_started'
  const handoverCompleted = handoverStatus === 'completed'
  const onboardingFieldEntries = Object.entries(portal?.onboardingFormData?.formData || {})
    .filter(([key]) => !isOnboardingMetaKey(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
  const groupedOnboardingFields = groupOnboardingFieldEntries(onboardingFieldEntries)
  const onboardingStatus = portal?.onboardingFormData?.status || 'In Progress'
  const purchasePriceValue = Number(portal?.transaction?.purchase_price || portal?.transaction?.sales_price || portal?.unit?.price || 0)
  const purchasePriceLabel = purchasePriceValue
    ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(purchasePriceValue)
    : '—'
  const myDetailsFallbackValues = {
    purchaser_type: portal?.transaction?.purchaser_type || portal?.onboardingFormData?.purchaserType || '',
    purchaser_entity_type: portal?.onboardingFormData?.formData?.purchaser_entity_type || '',
    purchase_finance_type: portal?.transaction?.finance_type || '',
    purchase_price: purchasePriceValue > 0 ? String(purchasePriceValue) : '',
  }
  const myDetailsSections = (() => {
    const purchaserEntityType = String(
      resolveMyDetailsFieldValue(myDetailsDraft, 'purchaser_entity_type') || myDetailsFallbackValues.purchaser_entity_type || '',
    )
      .trim()
      .toLowerCase()

    return MY_DETAILS_SECTIONS.map((section) => {
      let sectionFieldConfig = section.fields
      if (section.key === 'legal_entity_details') {
        if (purchaserEntityType === 'company') {
          sectionFieldConfig = section.fields.filter((field) => MY_DETAILS_COMPANY_FIELDS.has(field.key))
        } else if (purchaserEntityType === 'trust') {
          sectionFieldConfig = section.fields.filter((field) => MY_DETAILS_TRUST_FIELDS.has(field.key))
        } else {
          sectionFieldConfig = section.fields.filter((field) =>
            isMyDetailsValueFilled(resolveMyDetailsFieldValue(myDetailsDraft, field.key)),
          )
        }
      }

      if (!sectionFieldConfig.length) {
        return null
      }

      const fields = sectionFieldConfig.map((field) => {
        const initialValue = resolveMyDetailsFieldValue(myDetailsDraft, field.key)
        const value = isMyDetailsValueFilled(initialValue) ? initialValue : myDetailsFallbackValues[field.key] || ''
        const baseOptions = Array.isArray(field.options) ? [...field.options] : null
        if (baseOptions && isMyDetailsValueFilled(value) && !baseOptions.some((item) => String(item.value) === String(value))) {
          baseOptions.push({ value: String(value), label: toTitleLabel(String(value)) })
        }
        return {
          ...field,
          value,
          options: baseOptions,
        }
      })

      const requiredFields = fields.filter((field) => field.required)
      const requiredCompleteCount = requiredFields.filter((field) => isMyDetailsValueFilled(field.value)).length
      const requiredTotalCount = requiredFields.length
      const capturedCount = fields.filter((field) => isMyDetailsValueFilled(field.value)).length
      const complete = requiredTotalCount === 0 ? capturedCount > 0 : requiredCompleteCount === requiredTotalCount
      const inProgress = !complete && capturedCount > 0

      return {
        ...section,
        fields,
        capturedCount,
        requiredCompleteCount,
        requiredTotalCount,
        complete,
        inProgress,
      }
    }).filter(Boolean)
  })()
  const myDetailsRequiredTotal = myDetailsSections.reduce((sum, section) => sum + section.requiredTotalCount, 0)
  const myDetailsRequiredCompleted = myDetailsSections.reduce((sum, section) => sum + section.requiredCompleteCount, 0)
  const myDetailsCompletionPercent = myDetailsRequiredTotal > 0
    ? Math.round((myDetailsRequiredCompleted / myDetailsRequiredTotal) * 100)
    : 0
  const myDetailsCapturedFields = myDetailsSections.reduce((sum, section) => sum + section.capturedCount, 0)
  const myDetailsFieldCount = myDetailsSections.reduce((sum, section) => sum + section.fields.length, 0)
  const portalRequiredDocuments = portal?.requiredDocuments || []
  const visiblePortalRequiredDocuments = portalRequiredDocuments.filter((document) => !isInformationSheetDocument(document))
  const reservationRequiredForClient = Boolean(portal?.transaction?.reservation_required)
  const reservationPaymentDetails =
    portal?.transaction?.reservation_payment_details &&
    typeof portal.transaction.reservation_payment_details === 'object'
      ? portal.transaction.reservation_payment_details
      : {}
  const reservationPaymentInstructions = reservationPaymentDetails?.payment_instructions || ''
  const reservationAmountLabel =
    portal?.transaction?.reservation_amount === null || portal?.transaction?.reservation_amount === undefined
      ? 'Amount pending'
      : ZAR_CURRENCY.format(Number(portal.transaction.reservation_amount) || 0)
  const reservationStatus = normalizePortalStatus(portal?.transaction?.reservation_status || '')
  const reservationStatusLabel =
    reservationStatus === 'verified'
      ? 'Verified'
      : reservationStatus === 'paid'
        ? 'Proof Uploaded'
        : reservationStatus === 'rejected'
          ? 'Rejected - Please reupload'
        : reservationStatus === 'pending'
          ? 'Awaiting Payment'
          : 'Not Required'
  const groupedPortalRequiredDocuments = groupPortalRequiredDocuments(visiblePortalRequiredDocuments)
  const sharedPortalDocuments = (portal?.documents || []).filter((document) => String(document.uploaded_by_role || '').toLowerCase() !== 'client')
  const portalDocumentsById = new Map((portal?.documents || []).map((document) => [String(document.id), document]))
  const documentPurchaserType = resolvePurchaserTypeForDocuments(portal)
  const documentTransactionType = resolveTransactionTypeForDocuments(portal)
  const documentMaritalRegime = resolveClientMaritalRegime(portal?.onboardingFormData?.formData || {})
  const ficaRequirementsTemplate = getFicaRequirementTemplate({
    transactionType: documentTransactionType,
    purchaserType: documentPurchaserType,
    maritalRegime: documentMaritalRegime,
  })
  const salesRequiredDocuments = groupedPortalRequiredDocuments.sales
  const ficaRequiredDocuments = groupedPortalRequiredDocuments.fica
  const bondRequiredDocuments = groupedPortalRequiredDocuments.bond
  const additionalRequestDocuments = groupedPortalRequiredDocuments.additional
  const salesSharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'sales')
  const bondSharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'bond')
  const additionalSharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'additional')
  const propertySharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'property')
  const reservationProofRequirement =
    salesRequiredDocuments.find((item) => normalizeDocumentKey(item?.key) === 'reservation_deposit_proof') ||
    salesRequiredDocuments.find((item) => isReservationDocument(item) && /proof|payment/.test(getDocumentSearchBlob(item))) ||
    salesRequiredDocuments.find((item) => isReservationDocument(item)) ||
    null
  const reservationProofUploadedDocument = reservationProofRequirement?.uploadedDocumentId
    ? portalDocumentsById.get(String(reservationProofRequirement.uploadedDocumentId))
    : null
  const reservationProofFallbackUploadedDocument =
    reservationProofUploadedDocument ||
    (portal?.documents || []).find(
      (document) =>
        String(document?.uploaded_by_role || '').toLowerCase() === 'client' &&
        isReservationDocument(document),
    ) ||
    null
  const reservationStatusIndicatesRequirement = ['pending', 'paid', 'verified', 'rejected'].includes(reservationStatus)
  const reservationAmountExists =
    Number.isFinite(Number(portal?.transaction?.reservation_amount)) &&
    Number(portal?.transaction?.reservation_amount) > 0
  const reservationPaymentDetailsConfigured = Object.values(reservationPaymentDetails || {}).some(
    (value) => String(value || '').trim().length > 0,
  )
  const showReservationDepositPopCard =
    reservationRequiredForClient ||
    Boolean(reservationProofRequirement) ||
    reservationStatusIndicatesRequirement ||
    reservationAmountExists ||
    reservationPaymentDetailsConfigured
  const reservationProofUploadStateKey = reservationProofRequirement?.key || 'reservation_deposit_proof'
  const reservationProofStatusLabel =
    reservationStatus === 'verified'
      ? 'Verified'
      : reservationStatus === 'rejected'
        ? 'Rejected'
        : reservationProofRequirement?.complete || reservationProofFallbackUploadedDocument?.url || reservationStatus === 'paid'
          ? 'Uploaded'
          : 'Not uploaded'
  const reservationRejectedNote = reservationStatus === 'rejected'
    ? String(
      portal?.transaction?.reservation_review_notes ||
      portal?.transaction?.reservation_review_note ||
      '',
    ).trim()
    : ''
  const bondApplicationData = bondApplicationDraft || buildBondApplicationDraft(portal)
  const bondApplicationStatus = resolveBondApplicationStatus(bondApplicationData?.status)
  const bondApplicationStatusClasses =
    bondApplicationStatus === 'Submitted' || bondApplicationStatus === 'Under Review'
      ? 'border-[#d8e4ef] bg-[#f4f8fc] text-[#35546c]'
      : bondApplicationStatus === 'Approved'
        ? 'border-[#cfe3d7] bg-[#eef8f1] text-[#2f7a51]'
        : bondApplicationStatus === 'Declined'
          ? 'border-[#f1d8d0] bg-[#fff5f2] text-[#b5472d]'
          : 'border-[#e1e9f2] bg-[#fbfdff] text-[#64748b]'
  const bondApplicants = Array.isArray(bondApplicationData?.applicants) ? bondApplicationData.applicants : []
  const bondOfferDocuments = bondSharedDocuments
    .filter((document) => {
      const source = `${document?.category || ''} ${document?.name || ''}`.toLowerCase()
      return /bond/.test(source) && /offer|approval/.test(source) && !/signed/.test(source)
    })
    .map((document) => ({
      id: String(document.id),
      name: document.name || 'Bond offer',
      category: document.category || 'Bond Offer',
      bankName: extractBondBankName(`${document.category || ''} ${document.name || ''}`),
      uploadedAt: document.created_at || '',
      status: 'Uploaded',
      downloadUrl: document.url || '',
    }))
  const bondOfferDecisionState = normalizeBondOfferDecisionState(
    bondApplicationData?.offers?.decision_state || bondApplicationData?.offers?.decisionState,
  )
  const bondOfferDecisionDocumentId = String(
    bondApplicationData?.offers?.decision_offer_document_id ||
      bondApplicationData?.offers?.decisionOfferDocumentId ||
      '',
  )
  const persistedAcceptedBondOfferId = String(bondApplicationData?.offers?.accepted_offer_document_id || '')
  const acceptedBondOfferId =
    bondOfferDecisionState === 'declined' && bondOfferDecisionDocumentId === persistedAcceptedBondOfferId
      ? ''
      : persistedAcceptedBondOfferId
  const declinedBondOfferIds = new Set(
    [
      ...(Array.isArray(bondApplicationData?.offers?.declined_offer_document_ids)
        ? bondApplicationData.offers.declined_offer_document_ids
        : []),
      ...(bondOfferDecisionState === 'declined' && bondOfferDecisionDocumentId ? [bondOfferDecisionDocumentId] : []),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )
  const acceptedBondOffer = acceptedBondOfferId
    ? bondOfferDocuments.find((offer) => String(offer.id) === acceptedBondOfferId) || null
    : null
  const signedBondOfferDocuments = (portal?.documents || []).filter((document) => {
    const source = `${document?.category || ''} ${document?.name || ''}`.toLowerCase()
    return /bond/.test(source) && /offer/.test(source) && /signed|accept/.test(source)
  })
  const signedAcceptedOfferDocument =
    signedBondOfferDocuments.find((document) => String(document.id) === String(bondApplicationData?.offers?.signed_offer_document_id || '')) ||
    signedBondOfferDocuments[0] ||
    null
  const bondGrantDocuments = bondSharedDocuments.filter((document) => {
    const source = `${document?.category || ''} ${document?.name || ''}`.toLowerCase()
    return /bond/.test(source) && /grant|final approval|instruction/.test(source)
  })
  const bondOfferIds = new Set(bondOfferDocuments.map((item) => String(item.id)))
  const bondGrantIds = new Set(bondGrantDocuments.map((item) => String(item.id)))
  const bondSupportingSharedDocuments = bondSharedDocuments.filter((document) => {
    const documentId = String(document?.id || '')
    if (bondOfferIds.has(documentId) || bondGrantIds.has(documentId)) {
      return false
    }
    return true
  })
  const salesOtpRequiredDocuments = salesRequiredDocuments.filter((document) => isOtpDocument(document))
  const salesOtherRequiredDocuments = salesRequiredDocuments.filter((document) => !isOtpDocument(document) && !isReservationDocument(document))
  const otpPrimaryRequirement =
    salesOtpRequiredDocuments.find((document) => /sign|signed|signature/.test(getDocumentSearchBlob(document))) ||
    salesOtpRequiredDocuments[0] ||
    null
  const otpSharedDocuments = salesSharedDocuments.filter((document) => isOtpDocument(document))
  const otpPrimarySharedDocument = otpSharedDocuments[0] || null
  const otpUploadedDocument = otpPrimaryRequirement?.uploadedDocumentId
    ? portalDocumentsById.get(String(otpPrimaryRequirement.uploadedDocumentId))
    : null
  const otpRejected = salesOtpRequiredDocuments.some((document) => {
    const status = normalizePortalStatus(document?.requiredDocumentStatus || document?.status || '')
    return status.includes('reject')
  })
  const otpApprovedFromShared = otpSharedDocuments.some((document) =>
    /approved|final|signed/i.test(`${document?.category || ''} ${document?.name || ''}`),
  )
  const otpApprovedFromStage = normalizePortalStatus(portal?.transaction?.stage || '').includes('otp_signed')
  const otpStatusLabel =
    !otpPrimaryRequirement && !otpPrimarySharedDocument
      ? 'Not available'
      : otpRejected
        ? 'Rejected'
        : otpApprovedFromShared || otpApprovedFromStage
          ? 'Approved'
          : otpPrimaryRequirement?.complete || otpUploadedDocument?.url
            ? 'Uploaded'
            : 'Awaiting signature'
  const salesOtherSharedDocuments = salesSharedDocuments.filter((document) => !isOtpDocument(document) && !isReservationDocument(document))
  const bondApplicationHeaderApplicants = bondApplicants
    .map((applicant) => `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim())
    .filter(Boolean)
  const bondApplicationApplicantHeader =
    bondApplicationHeaderApplicants.length > 0 ? bondApplicationHeaderApplicants.join(' & ') : portal?.buyer?.name || 'Client'
  const bondApplicationRequiredDocuments = visiblePortalRequiredDocuments.filter((document) => {
    const source = `${document.key || ''} ${document.label || ''} ${document.description || ''}`.toLowerCase()
    return /bond|bank|payslip|income|statement|id|address|fica|credit/.test(source)
  })
  const resolvedFicaRequirements = ficaRequirementsTemplate.map((requirement) => ({
    ...requirement,
    ...resolveFicaRequirementStatus(requirement, ficaRequiredDocuments, portalDocumentsById),
  }))
  const documentTabCountByKey = {
    sales: (showReservationDepositPopCard ? 1 : 0) + 1 + salesOtherRequiredDocuments.length + salesOtherSharedDocuments.length,
    fica: resolvedFicaRequirements.length,
    bond: bondRequiredDocuments.length + bondSupportingSharedDocuments.length + bondOfferDocuments.length + bondGrantDocuments.length,
    additional: additionalRequestDocuments.length + additionalSharedDocuments.length,
    property: propertySharedDocuments.length,
  }
  const documentTabs = CLIENT_DOCUMENT_TABS
    .filter((tab) => tab.key !== 'bond' || isBondOrHybridTransaction)
    .map((tab) => ({ ...tab, count: Number(documentTabCountByKey[tab.key] || 0) }))
  const hasDocumentsTab = documentTabs.some((tab) => tab.key === activeDocumentsTab)
  const activeDocumentsTabKey = hasDocumentsTab ? activeDocumentsTab : (documentTabs[0]?.key || 'sales')
  const handoverMeterDocuments = HANDOVER_PHOTO_FIELDS.map((field) => ({
    ...field,
    document:
      (portal?.documents || []).find((item) => String(item.category || '').toLowerCase() === field.category.toLowerCase()) || null,
  }))
  const occupationalRent = portal?.occupationalRent || null
  const occupationalRentProofDocument =
    (portal?.documents || []).find((item) =>
      /occupational rent|occupation rent/i.test(`${item?.category || ''} ${item?.name || ''}`) &&
      /proof of payment/i.test(`${item?.category || ''} ${item?.name || ''}`),
    ) || null
  const snagOpenCount = (portal?.issues || []).filter((item) => !['resolved', 'closed', 'completed'].includes(String(item.status || '').toLowerCase()))
    .length
  const snagResolvedCount = Math.max((portal?.issues || []).length - snagOpenCount, 0)
  const activeDocumentPanel = documentPanel.item
  const latestUpdates = (portal?.discussion || []).slice(0, 5)
  const latestJourneyUpdates = latestUpdates.map((item) => buildClientFacingUpdate(item))
  const latestJourneyFeedItems = latestUpdates.map((item, index) => buildClientJourneyFeedItem(item, index))
  const otpSignaturePending = portalRequiredDocuments.some((item) => {
    if (item.complete) return false
    const haystack = `${item.key || ''} ${item.label || ''} ${item.description || ''}`.toLowerCase()
    return /otp|offer to purchase/.test(haystack) && /sign|signature|signed/.test(haystack)
  })
  const totalRequiredDocuments = Number(portal.requiredDocumentSummary?.totalRequired || 0)
  const uploadedRequiredDocuments = Number(portal.requiredDocumentSummary?.uploadedCount || 0)
  const onboardingComplete = isClientOnboardingComplete(onboardingStatus)
  const occupationalRentProofPending =
    occupationalRent?.enabled &&
    occupationalRent?.status &&
    normalizePortalStatus(occupationalRent.status) !== 'settled' &&
    !occupationalRentProofDocument
  const financeSteps = financeProcess?.steps || []
  const attorneySteps = attorneyProcess?.steps || []
  const hasStepWithStatus = (steps = [], matcher, allowedStatuses = []) =>
    steps.some((step) => {
      const label = `${step?.step_label || ''} ${step?.step_key || ''}`
      if (!matcher.test(label)) return false
      const status = normalizePortalStatus(step?.status)
      return allowedStatuses.includes(status)
    })
  const hasStartedStep = (steps = [], matcher) =>
    steps.some((step) => {
      const label = `${step?.step_label || ''} ${step?.step_key || ''}`
      if (!matcher.test(label)) return false
      const status = normalizePortalStatus(step?.status)
      return !['', 'pending', 'not_started'].includes(status)
    })
  const atOrBeyondFinance = stageIndex > getMainStageIndex('FIN')
  const atOrBeyondTransfer = stageIndex >= getMainStageIndex('ATTY')
  const atOrBeyondRegistration = stageIndex >= getMainStageIndex('REG')
  const hasComplianceCertificates = propertySharedDocuments.some((document) =>
    /certificate|coc|compliance|warranty|title deed/i.test(`${document?.category || ''} ${document?.name || ''}`),
  )
  const hasWelcomePack = propertySharedDocuments.some((document) =>
    /welcome pack|handover pack|manual/i.test(`${document?.category || ''} ${document?.name || ''}`),
  )
  const handoverScheduled = Boolean(handoverForm.handoverDate || portal?.handover?.handoverDate)
  const clientChecklistItems = [
    {
      key: 'upload_documents',
      title: 'Upload outstanding documents',
      description:
        missingRequired > 0
          ? `${missingRequired} required document${missingRequired === 1 ? '' : 's'} still need to be uploaded.`
          : 'All required documents have been uploaded.',
      status: resolveChecklistProgressState({
        complete: missingRequired === 0 && !occupationalRentProofPending,
        inProgress: uploadedRequiredDocuments > 0 || Boolean(occupationalRentProofDocument),
      }),
      responsible: 'You',
      actionTo: 'documents',
      actionLabel: 'Open Documents',
    },
    {
      key: 'sign_agreements',
      title: 'Sign agreements',
      description: otpSignaturePending
        ? 'One or more agreement signatures are still outstanding.'
        : 'All required signatures currently on record.',
      status: resolveChecklistProgressState({
        complete: !otpSignaturePending,
        inProgress: portalRequiredDocuments.some((item) => /otp|agreement|signature/i.test(`${item?.key || ''} ${item?.label || ''}`)),
      }),
      responsible: 'You',
      actionTo: 'documents',
      actionLabel: 'Review Documents',
    },
    {
      key: 'confirm_personal_details',
      title: 'Confirm personal details',
      description: onboardingComplete
        ? 'Your onboarding information has been completed.'
        : 'Complete your personal and transaction information sheet.',
      status: resolveChecklistProgressState({
        complete: onboardingComplete,
        inProgress: onboardingFieldEntries.length > 0,
      }),
      responsible: 'You',
      actionTo: 'details',
      actionLabel: 'Update My Details',
    },
  ]
  const financialChecklistItems = [
    {
      key: 'bond_approved',
      title: 'Bond approved',
      description: 'Finance approval from the lending side is required before handover.',
      status: resolveChecklistProgressState({
        complete: atOrBeyondFinance || hasStepWithStatus(financeSteps, /approval|approved|bond/i, ['completed', 'approved']),
        inProgress: mainStage === 'FIN' || hasStartedStep(financeSteps, /approval|bond/i),
      }),
      responsible: 'Agent',
    },
    {
      key: 'guarantees_issued',
      title: 'Guarantees issued',
      description: 'Guarantees must be in place to progress legal transfer confidently.',
      status: resolveChecklistProgressState({
        complete:
          atOrBeyondTransfer ||
          hasStepWithStatus(financeSteps, /guarantee/i, ['completed']) ||
          hasStepWithStatus(attorneySteps, /guarantee/i, ['completed']),
        inProgress: hasStartedStep(financeSteps, /guarantee/i) || hasStartedStep(attorneySteps, /guarantee/i),
      }),
      responsible: 'Agent',
    },
    {
      key: 'final_payments',
      title: 'Final payments settled',
      description: occupationalRent?.enabled
        ? 'Occupational rent or final settlement proof needs to be on file.'
        : 'Final payment clearances are being tracked by your team.',
      status: resolveChecklistProgressState({
        complete: !occupationalRent?.enabled || normalizePortalStatus(occupationalRent?.status) === 'settled',
        inProgress: Boolean(occupationalRentProofDocument) || normalizePortalStatus(occupationalRent?.status) === 'in_progress',
      }),
      responsible: 'You',
      actionTo: occupationalRent?.enabled ? 'documents' : null,
      actionLabel: occupationalRent?.enabled ? 'Upload Proof' : null,
      dueDate: occupationalRent?.nextDueDate ? formatClientPortalDate(occupationalRent.nextDueDate) : null,
    },
  ]
  const legalChecklistItems = [
    {
      key: 'transfer_documents_prepared',
      title: 'Transfer documents prepared',
      description: 'Attorney transfer packs and legal records must be prepared.',
      status: resolveChecklistProgressState({
        complete:
          atOrBeyondTransfer ||
          hasStepWithStatus(attorneySteps, /draft|transfer preparation|documents prepared/i, ['completed']),
        inProgress: hasStartedStep(attorneySteps, /draft|transfer preparation|document/i),
      }),
      responsible: 'Attorney',
    },
    {
      key: 'lodgement_complete',
      title: 'Lodgement complete',
      description: 'The transfer must move through lodgement before final registration.',
      status: resolveChecklistProgressState({
        complete: atOrBeyondRegistration || hasStepWithStatus(attorneySteps, /lodg/i, ['completed']),
        inProgress: hasStartedStep(attorneySteps, /lodg/i),
      }),
      responsible: 'Attorney',
    },
    {
      key: 'registration_confirmed',
      title: 'Registration confirmed',
      description: 'Registration confirmation marks legal completion of transfer.',
      status: resolveChecklistProgressState({
        complete: atOrBeyondRegistration || normalizePortalStatus(portal?.transaction?.status).includes('registered'),
        inProgress: hasStartedStep(attorneySteps, /register/i),
      }),
      responsible: 'Attorney',
    },
  ]
  const propertyChecklistItems = [
    {
      key: 'snag_list_complete',
      title: 'Snag list complete',
      description: portal?.settings?.snag_reporting_enabled
        ? snagOpenCount === 0
          ? 'No open snag items are currently blocking handover.'
          : `${snagOpenCount} snag item${snagOpenCount === 1 ? '' : 's'} still open.`
        : 'Snag reporting is not required for this transaction.',
      status: resolveChecklistProgressState({
        complete: !portal?.settings?.snag_reporting_enabled || snagOpenCount === 0,
        inProgress: portal?.settings?.snag_reporting_enabled && portal?.issues?.length > 0 && snagOpenCount > 0,
      }),
      responsible: 'Developer',
      actionTo: portal?.settings?.snag_reporting_enabled ? 'snags' : null,
      actionLabel: portal?.settings?.snag_reporting_enabled ? 'View Snags' : null,
    },
    {
      key: 'final_inspection_done',
      title: 'Final inspection done',
      description: 'The final property walk-through must be completed before key release.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.inspectionCompleted),
        inProgress: handoverScheduled,
      }),
      responsible: 'Developer',
    },
    {
      key: 'utilities_connected',
      title: 'Utilities connected and recorded',
      description: 'Electricity and water readings should be captured for handover records.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.electricityMeterReading) && Boolean(handoverForm.waterMeterReading),
        inProgress: Boolean(handoverForm.electricityMeterReading) || Boolean(handoverForm.waterMeterReading),
      }),
      responsible: 'Developer',
    },
    {
      key: 'certificates_issued',
      title: 'Certificates issued',
      description: 'Compliance and warranty certificates should be available for reference.',
      status: resolveChecklistProgressState({
        complete: hasComplianceCertificates,
        inProgress: propertySharedDocuments.length > 0,
      }),
      responsible: 'Developer',
      actionTo: 'documents',
      actionLabel: 'View Property Docs',
    },
  ]
  const handoverPreparationItems = [
    {
      key: 'handover_scheduled',
      title: 'Handover date scheduled',
      description: handoverScheduled
        ? `Handover is currently scheduled for ${formatClientPortalDate(handoverForm.handoverDate || portal?.handover?.handoverDate)}.`
        : 'A confirmed handover date is still pending.',
      status: resolveChecklistProgressState({
        complete: handoverScheduled,
        inProgress: normalizePortalStatus(handoverStatus) === 'in_progress',
      }),
      responsible: 'Agent',
    },
    {
      key: 'key_collection_arranged',
      title: 'Key collection arranged',
      description: 'Key collection details should be confirmed before handover day.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.keysHandedOver) || normalizePortalStatus(handoverStatus) === 'completed',
        inProgress: handoverScheduled,
      }),
      responsible: 'Agent',
    },
    {
      key: 'welcome_pack_ready',
      title: 'Welcome pack ready',
      description: 'Final manuals and welcome pack should be prepared for handover.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.manualsHandedOver) || hasWelcomePack,
        inProgress: Boolean(handoverForm.remoteHandedOver),
      }),
      responsible: 'Developer',
    },
  ]
  const handoverChecklistSections = [
    {
      key: 'client_requirements',
      title: 'Client requirements',
      description: 'Items you need to complete before handover can be finalized.',
      items: clientChecklistItems,
    },
    {
      key: 'financial_completion',
      title: 'Financial completion',
      description: 'Finance-side conditions that need to be cleared before possession.',
      items: financialChecklistItems,
    },
    {
      key: 'legal_transfer',
      title: 'Legal & transfer',
      description: 'Attorney-led milestones that drive legal readiness.',
      items: legalChecklistItems,
    },
    {
      key: 'property_readiness',
      title: 'Property readiness',
      description: 'Physical unit readiness and supporting certification.',
      items: propertyChecklistItems,
    },
    {
      key: 'handover_preparation',
      title: 'Handover preparation',
      description: 'Final readiness checks before key collection.',
      items: handoverPreparationItems,
    },
  ].map((section) => {
    const completedCount = section.items.filter((item) => item.status === 'complete').length
    return {
      ...section,
      completedCount,
      totalCount: section.items.length,
    }
  })
  const handoverChecklistTotalCount = handoverChecklistSections.reduce((total, section) => total + section.totalCount, 0)
  const handoverChecklistCompletedCount = handoverChecklistSections.reduce((total, section) => total + section.completedCount, 0)
  const handoverChecklistProgressPercent = handoverChecklistTotalCount
    ? Math.round((handoverChecklistCompletedCount / handoverChecklistTotalCount) * 100)
    : 0
  const clientRequirementsSection = handoverChecklistSections.find((section) => section.key === 'client_requirements')
  const clientRequirementsComplete = clientRequirementsSection
    ? clientRequirementsSection.completedCount === clientRequirementsSection.totalCount
    : true
  const handoverReadinessStatus = handoverCompleted
    ? 'Completed'
    : handoverChecklistCompletedCount === handoverChecklistTotalCount && handoverChecklistTotalCount > 0
      ? 'Ready'
      : clientRequirementsComplete && handoverChecklistProgressPercent >= 70
        ? 'Ready'
        : handoverChecklistCompletedCount > 0
          ? 'In Progress'
          : 'Not Ready'
  const handoverReadinessStatusClasses =
    handoverReadinessStatus === 'Completed' || handoverReadinessStatus === 'Ready'
      ? 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]'
      : handoverReadinessStatus === 'In Progress'
        ? 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
        : 'border-[#f1ddd0] bg-[#fff6f0] text-[#a15b31]'
  const handoverReadinessSummary =
    handoverReadinessStatus === 'Completed'
      ? 'Your handover is complete and all readiness items are closed.'
      : handoverReadinessStatus === 'Ready'
        ? 'Your file is close to handover completion. Final scheduling and key collection can proceed.'
        : handoverReadinessStatus === 'In Progress'
          ? 'Handover preparation is underway. Complete the remaining items to stay on track.'
          : 'Handover is not ready yet. Start with your client requirements to move forward.'
  const stageUpdatedAt = portal?.transaction?.stage_updated_at || portal?.lastUpdated || portal?.transaction?.updated_at || null
  const stageAgeDays = getDaysElapsed(stageUpdatedAt)
  const timeInStageLabel = getDaysInStageLabel(stageUpdatedAt)
  const stageUpdatedDateLabel = formatShortPortalDate(stageUpdatedAt)
  const transactionCompleted =
    ['completed', 'registered', 'closed'].includes(normalizePortalStatus(portal?.transaction?.status || '')) &&
    mainStage === 'REG'
  const nextStepState = resolveClientNextStepState({
    missingRequired,
    otpSignaturePending,
    onboardingStatus,
    occupationalRent,
    occupationalRentProofDocument,
    reservationRequired: reservationRequiredForClient,
    reservationStatus: reservationStatus,
    handoverStatus,
    mainStage,
    nextStage,
  })
  const journeyPropertyType = resolveClientJourneyPropertyType(portal?.transaction || {})
  const journeyFinanceType = resolveClientJourneyFinanceType(financeTypeForPortal)
  const { steps: clientJourneySteps, currentStepId } = buildClientJourney({
    propertyType: journeyPropertyType,
    financeType: journeyFinanceType,
    mainStage,
    nextStepState,
    reservationRequired: reservationRequiredForClient,
    reservationStatus,
    otpSignaturePending,
    isCompleted: transactionCompleted,
    financeProcess,
    attorneyProcess,
  })
  const journeyStatusFlag = deriveClientJourneyStatusFlag({
    nextStepState,
    stageAgeDays,
  })
  const nextActionModel = buildClientNextActionModel(nextStepState, {
    isCompleted: transactionCompleted,
  })
  const resolvedExpandedJourneyStepId =
    expandedJourneyStepId && clientJourneySteps.some((step) => step.id === expandedJourneyStepId)
      ? expandedJourneyStepId
      : currentStepId || clientJourneySteps[0]?.id || null

  const whatsHappeningSummary = buildClientWhatsHappeningSummary({
    mainStage,
    nextStage,
    latestJourneyUpdates,
    nextStepState,
  })
  const outstandingActionCount = Number(nextStepState?.clientActionCount || 0)
  const notificationItems = (() => {
    const items = []

    if (nextStepState.requiresAction) {
      items.push({
        id: 'action_required',
        title: 'Action required',
        message: nextStepState.title || 'You have a required action pending on your transaction.',
        createdAt: stageUpdatedAt || portal?.lastUpdated || '',
        to: nextStepState.ctaTo || 'documents',
        tone: 'action',
      })
    }

    latestUpdates.slice(0, 6).forEach((item, index) => {
      const formatted = buildClientFacingUpdate(item)
      items.push({
        id: item?.id || `update_${index}`,
        title: formatted.title || 'Update from your team',
        message: formatted.summary || 'Your team posted a progress update.',
        createdAt: item?.createdAt || item?.created_at || portal?.lastUpdated || '',
        to: 'progress',
        tone: 'info',
      })
    })

    return items.sort((a, b) => {
      const aTime = Date.parse(a.createdAt || '')
      const bTime = Date.parse(b.createdAt || '')
      const safeA = Number.isNaN(aTime) ? 0 : aTime
      const safeB = Number.isNaN(bTime) ? 0 : bTime
      return safeB - safeA
    })
  })()
  const unreadNotificationCount = (() => {
    if (!notificationItems.length) return 0
    if (!notificationsSeenAt) return notificationItems.length

    const seenAtMs = Date.parse(notificationsSeenAt)
    if (Number.isNaN(seenAtMs)) return notificationItems.length

    return notificationItems.reduce((count, item) => {
      const itemMs = Date.parse(item.createdAt || '')
      if (Number.isNaN(itemMs)) return count
      return itemMs > seenAtMs ? count + 1 : count
    }, 0)
  })()
  const teamMembers = [
    {
      title: 'Sales Team',
      name: portal?.transaction?.assigned_agent || portal?.unit?.development?.developer_company || 'Bridge Sales',
      detail: portal?.transaction?.assigned_agent_email || 'Handles deal updates and coordination.',
    },
    {
      title: 'Attorney / Conveyancer',
      name: portal?.transaction?.attorney || 'Attorney / Conveyancer',
      detail: portal?.transaction?.assigned_attorney_email || 'Manages transfer preparation and lodgement.',
    },
    {
      title: 'Bond Originator',
      name: portal?.transaction?.bond_originator || 'Bond Originator',
      detail: portal?.transaction?.assigned_bond_originator_email || 'Supports finance approvals and lender feedback.',
    },
    {
      title: 'Bridge Support',
      name: portal?.unit?.development?.developer_company || 'Bridge Operations',
      detail: 'Keeps the transaction workspace, documents, and handover records aligned.',
    },
  ]
  const visibleMenuItems = CLIENT_PORTAL_MENU.filter((item) => {
    if (item.key === 'snags' && !portal?.settings?.snag_reporting_enabled) return false
    if (item.key === 'bond_application' && !isBondOrHybridTransaction) return false
    return true
  })
  const sidebarStatusByKey = {
    documents: missingRequired > 0 ? `${missingRequired} required` : 'Ready',
    snags: portal?.settings?.snag_reporting_enabled ? `${snagOpenCount} open` : null,
  }
  const activeMenuItem = visibleMenuItems.find((item) => item.key === activeSection) || CLIENT_PORTAL_MENU[0]
  const activeSectionLabel =
    activeSection === 'alterations'
      ? 'Alterations'
      : activeSection === 'review'
        ? 'Review'
        : activeMenuItem.label
  const developmentName = portal?.unit?.development?.name || 'Development'
  const unitLabel = portal?.unit?.unit_number ? `Unit ${portal.unit.unit_number}` : 'Unit'
  const buyerName = portal?.buyer?.name || 'Client'
  const buyerInitial = String(buyerName || 'C').trim().charAt(0).toUpperCase() || 'C'
  const overviewStatusLabel = ['REGISTERED', 'REG'].includes(mainStage) ? 'Registered' : 'In Progress'
  const workspaceHeaderStatusLabel = isHandover ? (handoverCompleted ? 'Handover Completed' : 'Preparing for Handover') : overviewStatusLabel
  const hasCoApplicantProfile =
    normalizePortalStatus(bondApplicationData?.summary?.has_co_applicant) === 'yes' ||
    Boolean(bondApplicationData?.applicants?.find((applicant) => applicant?.key === 'co_applicant')?.first_name)

  const bondValuePresent = (value) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value)
    if (Array.isArray(value)) return value.length > 0
    return String(value || '').trim().length > 0
  }

  const primaryApplicant = bondApplicationData?.applicants?.find((applicant) => applicant?.key === 'primary') || {}
  const coApplicant = bondApplicationData?.applicants?.find((applicant) => applicant?.key === 'co_applicant') || {}
  const personalApplicantChecks = (applicant) => {
    const checks = [
      bondValuePresent(applicant?.first_name),
      bondValuePresent(applicant?.last_name),
      bondValuePresent(applicant?.date_of_birth),
      bondValuePresent(applicant?.id_type),
      bondValuePresent(applicant?.marital_status),
      bondValuePresent(applicant?.sa_tax_number) || bondValuePresent(applicant?.tax_number_unavailable_reason),
    ]
    if (normalizePortalStatus(applicant?.id_type) === 'passport') {
      checks.push(bondValuePresent(applicant?.passport_number))
      checks.push(bondValuePresent(applicant?.passport_country_of_issue))
    } else if (normalizePortalStatus(applicant?.id_type) === 'refugee_id') {
      checks.push(bondValuePresent(applicant?.refugee_id_card_number))
    } else {
      checks.push(bondValuePresent(applicant?.id_number))
    }
    if (normalizePortalStatus(applicant?.temporary_sa_resident) === 'yes') {
      checks.push(bondValuePresent(applicant?.permit_type))
      checks.push(bondValuePresent(applicant?.permit_number))
      checks.push(bondValuePresent(applicant?.permit_expiry_date))
    }
    return checks
  }

  const sectionCheckMap = {
    summary: [
      bondValuePresent(bondApplicationData?.summary?.applicant_name),
      bondValuePresent(bondApplicationData?.summary?.property_reference),
      bondValuePresent(bondApplicationData?.summary?.purchase_price),
      bondValuePresent(bondApplicationData?.summary?.finance_type),
      bondValuePresent(bondApplicationData?.summary?.marital_status),
      bondValuePresent(bondApplicationData?.summary?.main_residence),
      bondValuePresent(bondApplicationData?.summary?.first_time_home_buyer),
    ],
    personal_details: [
      ...personalApplicantChecks(primaryApplicant),
      ...(hasCoApplicantProfile ? personalApplicantChecks(coApplicant) : []),
    ],
    contact_address: [
      bondValuePresent(bondApplicationData?.contact_address?.cellphone_number),
      bondValuePresent(bondApplicationData?.contact_address?.email_address),
      bondValuePresent(bondApplicationData?.contact_address?.residential_address_street),
      bondValuePresent(bondApplicationData?.contact_address?.residential_address_city),
      bondValuePresent(bondApplicationData?.contact_address?.residential_address_postal_code),
      bondValuePresent(bondApplicationData?.contact_address?.legal_notice_delivery_method),
    ],
    employment: [
      bondValuePresent(bondApplicationData?.employment?.primary?.occupation_status),
      bondValuePresent(bondApplicationData?.employment?.primary?.occupational_level),
      bondValuePresent(bondApplicationData?.employment?.primary?.nature_of_occupation),
      bondValuePresent(bondApplicationData?.employment?.primary?.employment_years) ||
        bondValuePresent(bondApplicationData?.employment?.primary?.employment_months),
      ...(hasCoApplicantProfile
        ? [
            bondValuePresent(bondApplicationData?.employment?.co_applicant?.occupation_status),
            bondValuePresent(bondApplicationData?.employment?.co_applicant?.occupational_level),
          ]
        : []),
    ],
    credit_history: [
      bondValuePresent(bondApplicationData?.credit_history?.currently_under_administration),
      bondValuePresent(bondApplicationData?.credit_history?.currently_under_debt_review),
      bondValuePresent(bondApplicationData?.credit_history?.ever_declared_insolvent),
      bondValuePresent(bondApplicationData?.credit_history?.bound_by_surety_agreements),
    ],
    loan_details: [
      bondValuePresent(bondApplicationData?.loan_details?.street_or_complex),
      bondValuePresent(bondApplicationData?.loan_details?.suburb),
      bondValuePresent(bondApplicationData?.loan_details?.amount_to_be_registered),
      bondValuePresent(bondApplicationData?.loan_details?.debit_order_bank_name),
      bondValuePresent(bondApplicationData?.loan_details?.debit_order_account_number),
      bondValuePresent(bondApplicationData?.loan_details?.preferred_debit_order_date),
    ],
    income_deductions_expenses: [
      bondValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.gross_salary),
      bondValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.tax_paye),
      bondValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.groceries),
      bondValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.transport),
      ...(hasCoApplicantProfile
        ? [bondValuePresent(bondApplicationData?.income_deductions_expenses?.co_applicant?.gross_salary)]
        : []),
    ],
    banking_liabilities: [
      bondValuePresent(bondApplicationData?.banking_liabilities?.primary_bank_name),
      bondValuePresent(bondApplicationData?.banking_liabilities?.primary_account_type),
      bondValuePresent(bondApplicationData?.banking_liabilities?.primary_account_number),
      bondValuePresent(bondApplicationData?.banking_liabilities?.other_finance_1_account_type),
    ],
    assets_liabilities: [
      bondValuePresent(bondApplicationData?.assets_liabilities?.fixed_property),
      bondValuePresent(bondApplicationData?.assets_liabilities?.vehicles),
      bondValuePresent(bondApplicationData?.assets_liabilities?.total_assets),
      bondValuePresent(bondApplicationData?.assets_liabilities?.total_liabilities),
      bondValuePresent(bondApplicationData?.assets_liabilities?.net_asset_value),
    ],
    declarations_consents: [
      Boolean(bondApplicationData?.declarations_consents?.loan_processing_consent),
      Boolean(bondApplicationData?.declarations_consents?.credit_bureau_fraud_bank_data_consent),
      Boolean(bondApplicationData?.declarations_consents?.declaration_accepted),
      bondValuePresent(bondApplicationData?.declarations_consents?.digital_signature_name),
      bondValuePresent(bondApplicationData?.declarations_consents?.digital_signature_date),
    ],
    documents: [
      !bondApplicationRequiredDocuments.length ||
        bondApplicationRequiredDocuments.some((document) => Boolean(document?.complete || document?.uploadedDocumentId)),
    ],
  }

  const bondApplicationSectionStatusByKey = Object.fromEntries(
    BOND_APPLICATION_SECTION_TABS.map((section) => {
      const checks = sectionCheckMap[section.key] || []
      const total = checks.length
      const complete = checks.filter(Boolean).length
      return [
        section.key,
        {
          total,
          complete,
          isComplete: total > 0 && complete === total,
          hasMissing: total > 0 && complete < total,
          completionPercent: total > 0 ? Math.round((complete / total) * 100) : 0,
        },
      ]
    }),
  )
  const bondApplicationProgressSections = BOND_APPLICATION_SECTION_TABS.filter((section) => section.key !== 'documents')
  const bondApplicationCompletedCount = bondApplicationProgressSections.filter(
    (section) => bondApplicationSectionStatusByKey[section.key]?.isComplete,
  ).length
  const missingBondApplicationSectionLabels = bondApplicationProgressSections
    .filter((section) => bondApplicationSectionStatusByKey[section.key]?.hasMissing)
    .map((section) => section.label)
  const bondApplicationProgressPercent = bondApplicationProgressSections.length
    ? Math.round((bondApplicationCompletedCount / bondApplicationProgressSections.length) * 100)
    : 0
  const nextStepToneClasses =
    nextStepState.tone === 'action'
      ? {
          container: 'border-[#eed8b5] bg-[linear-gradient(180deg,#fffaf2_0%,#fffdf8_100%)]',
        }
      : nextStepState.tone === 'in_progress'
        ? {
          container: 'border-[#dbe5ef] bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)]',
        }
        : {
            container: 'border-[#d4e8dc] bg-[linear-gradient(180deg,#f6fcf8_0%,#ffffff_100%)]',
          }
  const primaryOverviewAction = {
    to: nextStepState.ctaTo || 'documents',
    label: nextStepState.ctaLabel || 'Open Documents',
  }
  const secondaryOverviewActions = [
    { to: 'handover', label: 'Handover', icon: KeyRound },
    { to: 'team', label: 'Team Contacts', icon: Users },
    { to: 'documents', label: 'Documents', icon: FileText },
  ]
    .filter((action) => action.to !== primaryOverviewAction.to)
    .slice(0, 2)
  const primaryOverviewActionClasses =
    nextStepState.tone === 'action'
      ? 'bg-[#d97706] text-white hover:bg-[#b15f07]'
      : 'bg-[#35546c] text-white hover:bg-[#2d475d]'
  const heroStatusBadge = nextStepState.requiresAction
    ? {
        label: 'Action Required',
        className: 'border-[#f0d8ae] bg-[#fff6e7] text-[#9a5b0f]',
      }
    : stageAgeDays !== null && stageAgeDays >= 21
      ? {
          label: 'At Risk',
          className: 'border-[#f3d6ce] bg-[#fff5f2] text-[#b5472d]',
        }
      : ['awaiting_finance_outcome', 'awaiting_transfer_legal_progress'].includes(nextStepState.type)
        ? {
            label: 'Awaiting Team',
            className: 'border-[#d6e3f1] bg-[#eef5fb] text-[#35546c]',
          }
        : {
            label: 'On Track',
            className: 'border-[#cfe4d8] bg-[#eef9f2] text-[#2f7a51]',
          }
  const heroProgressSummary = `${progressPercent}% complete • ${MAIN_STAGE_LABELS[mainStage]} stage${
    outstandingActionCount > 0 ? ` • ${outstandingActionCount} required item${outstandingActionCount === 1 ? '' : 's'}` : ''
  }`
  const heroActionHeading = nextStepState.requiresAction ? 'Action required' : 'Next step'
  const journeyProgressGradient = 'linear-gradient(90deg,#3f78b1_0%,#2f8a64_100%)'
  const openRequiredDocumentPanel = (document, section, statusLabel = 'Required') => {
    if (!document) return
    const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
    setDocumentPanel({
      open: true,
      item: {
        kind: 'required',
        documentKey: document.key,
        title: document.label || 'Requested document',
        section,
        description: document.description || 'Upload the requested supporting document.',
        statusLabel,
        uploadLabel: 'Upload document',
        uploadedDocument,
        downloadUrl: uploadedDocument?.url || '',
        downloadLabel: uploadedDocument?.url ? 'View latest upload' : null,
      },
    })
  }
  const getStatusToneClasses = (statusLabel) => {
    const normalizedStatus = normalizePortalStatus(statusLabel)
    if (
      normalizedStatus === 'missing' ||
      normalizedStatus === 'pending' ||
      normalizedStatus === 'awaiting_signature' ||
      normalizedStatus === 'not_uploaded' ||
      normalizedStatus === 'not_available' ||
      normalizedStatus === 'rejected'
    ) {
      return 'border-[#f3d6ce] bg-[#fff5f2] text-[#b5472d]'
    }
    if (
      normalizedStatus === 'uploaded' ||
      normalizedStatus === 'awaiting_review' ||
      normalizedStatus === 'proof_uploaded' ||
      normalizedStatus === 'awaiting_payment'
    ) {
      return 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
    }
    if (
      normalizedStatus === 'completed' ||
      normalizedStatus === 'submitted' ||
      normalizedStatus === 'approved' ||
      normalizedStatus === 'verified' ||
      normalizedStatus === 'accepted'
    ) {
      return 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]'
    }
    return 'border-[#dde7f1] bg-white text-[#64748b]'
  }

  const activeBondApplicationSectionIndex = Math.max(
    0,
    BOND_APPLICATION_SECTION_TABS.findIndex((section) => section.key === activeBondApplicationSectionTab),
  )
  const activeBondApplicationSectionMeta =
    BOND_APPLICATION_SECTION_TABS[activeBondApplicationSectionIndex] || BOND_APPLICATION_SECTION_TABS[0]
  const previousBondApplicationSectionMeta =
    activeBondApplicationSectionIndex > 0 ? BOND_APPLICATION_SECTION_TABS[activeBondApplicationSectionIndex - 1] : null
  const nextBondApplicationSectionMeta =
    activeBondApplicationSectionIndex < BOND_APPLICATION_SECTION_TABS.length - 1
      ? BOND_APPLICATION_SECTION_TABS[activeBondApplicationSectionIndex + 1]
      : null

  const readBondField = (path, fallback = '') => {
    const value = getNestedPortalValue(bondApplicationData, path.split('.'))
    return value === null || value === undefined ? fallback : value
  }
  const updateBondField = (path, value) => {
    updateBondApplicationField(path.split('.'), value)
  }

  const renderBondInputField = ({
    path,
    label,
    type = 'text',
    options = null,
    required = false,
    helperText = '',
    placeholder = '',
    rows = 3,
    readOnly = false,
    hidden = false,
    inputMode = undefined,
  }) => {
    if (hidden) return null
    const fieldId = `bond-${path.replaceAll('.', '-')}`
    const value = readBondField(path, type === 'checkbox' ? false : '')

    return (
      <label key={path} htmlFor={fieldId} className="rounded-[14px] border border-[#e3ebf4] bg-white px-3 py-2.5">
        <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
          {label}{required ? ' *' : ''}
        </span>
        {helperText ? <span className="mt-1 block text-xs leading-5 text-[#7b8ca2]">{helperText}</span> : null}
        {type === 'select' ? (
          <select
            id={fieldId}
            value={String(value || '')}
            onChange={(event) => updateBondField(path, event.target.value)}
            className="mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
          >
            {(options || []).map((option) => (
              <option key={`${path}-${option.value || 'empty'}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        {type === 'textarea' ? (
          <textarea
            id={fieldId}
            rows={rows}
            value={String(value || '')}
            placeholder={placeholder}
            onChange={(event) => updateBondField(path, event.target.value)}
            className="mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
          />
        ) : null}
        {type === 'checkbox' ? (
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updateBondField(path, event.target.checked)}
            className="mt-2 h-4 w-4 rounded border-[#c7d4e3]"
          />
        ) : null}
        {!['select', 'textarea', 'checkbox'].includes(type) ? (
          <input
            id={fieldId}
            type={type}
            value={String(value || '')}
            placeholder={placeholder}
            readOnly={readOnly}
            inputMode={inputMode}
            onChange={(event) => updateBondField(path, event.target.value)}
            className={`mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12 ${
              readOnly ? 'cursor-not-allowed bg-[#f8fbff] text-[#6b7d93]' : ''
            }`}
          />
        ) : null}
      </label>
    )
  }

  const renderBondApplicantSection = (applicantKey, heading, helperText = '') => {
    const applicant =
      bondApplicants.find((item) => item.key === applicantKey) ||
      getBondApplicationApplicantDefault(applicantKey === 'co_applicant' ? 'co_applicant' : 'primary', portal)
    const idType = normalizePortalStatus(applicant?.id_type)
    const isTemporaryResident = normalizePortalStatus(applicant?.temporary_sa_resident) === 'yes'
    const isMarried = normalizePortalStatus(applicant?.marital_status).startsWith('married')
    const isMarriedAnc = normalizePortalStatus(applicant?.marital_status) === 'married_anc'

    const applicantField = ({ key, label, type = 'text', options = null, required = false, helper = '', hidden = false }) => (
      <label key={`${applicantKey}-${key}`} className="rounded-[14px] border border-[#e3ebf4] bg-white px-3 py-2.5">
        <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
          {label}{required ? ' *' : ''}
        </span>
        {helper ? <span className="mt-1 block text-xs leading-5 text-[#7b8ca2]">{helper}</span> : null}
        {hidden ? null : type === 'select' ? (
          <select
            value={String(applicant?.[key] || '')}
            onChange={(event) => updateBondApplicationApplicantField(applicantKey, key, event.target.value)}
            className="mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
          >
            {(options || []).map((option) => (
              <option key={`${applicantKey}-${key}-${option.value || 'empty'}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={String(applicant?.[key] || '')}
            onChange={(event) => updateBondApplicationApplicantField(applicantKey, key, event.target.value)}
            className="mt-2 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
          />
        )}
      </label>
    )

    return (
      <article className="space-y-4 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
        <div>
          <h5 className="text-sm font-semibold text-[#142132]">{heading}</h5>
          {helperText ? <p className="mt-1 text-xs leading-5 text-[#6b7d93]">{helperText}</p> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {applicantField({ key: 'title', label: 'Title', type: 'select', options: BOND_TITLE_OPTIONS, required: true })}
          {applicantField({ key: 'gender', label: 'Gender', type: 'select', options: BOND_GENDER_OPTIONS, required: true })}
          {applicantField({ key: 'first_name', label: 'First names', required: true })}
          {applicantField({ key: 'last_name', label: 'Surname', required: true })}
          {applicantField({ key: 'date_of_birth', label: 'Date of birth', type: 'date', required: true })}
          {applicantField({ key: 'id_type', label: 'ID type', type: 'select', options: BOND_ID_TYPE_OPTIONS, required: true })}
          {applicantField({ key: 'id_number', label: 'ID number', required: idType === 'sa_id', hidden: idType !== 'sa_id' })}
          {applicantField({ key: 'passport_number', label: 'Passport number', required: idType === 'passport', hidden: idType !== 'passport' })}
          {applicantField({ key: 'passport_country_of_issue', label: 'Passport country of issue', required: idType === 'passport', hidden: idType !== 'passport' })}
          {applicantField({ key: 'refugee_id_card_number', label: 'Refugee ID card number', required: idType === 'refugee_id', hidden: idType !== 'refugee_id' })}
          {applicantField({ key: 'sa_citizen', label: 'SA citizen', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'nationality', label: 'Nationality' })}
          {applicantField({ key: 'city_of_birth', label: 'City of birth' })}
          {applicantField({ key: 'country_of_birth', label: 'Country of birth' })}
          {applicantField({ key: 'sa_permanent_resident', label: 'SA permanent resident', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'temporary_sa_resident', label: 'Temporary resident in SA', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'permit_type', label: 'Permit type', hidden: !isTemporaryResident })}
          {applicantField({ key: 'permit_number', label: 'Permit number', hidden: !isTemporaryResident })}
          {applicantField({ key: 'permit_expiry_date', label: 'Permit expiry date', type: 'date', hidden: !isTemporaryResident })}
          {applicantField({ key: 'marital_status', label: 'Marital status', type: 'select', options: BOND_MARITAL_STATUS_OPTIONS, required: true })}
          {applicantField({ key: 'married_anc_register_both_names', label: 'Register in both names', type: 'select', options: BOND_YES_NO_OPTIONS, hidden: !isMarriedAnc })}
          {applicantField({ key: 'country_of_marriage', label: 'Country of marriage', hidden: !isMarried })}
          {applicantField({ key: 'number_of_dependants', label: 'Number of dependants', type: 'number' })}
          {applicantField({ key: 'ethnic_group', label: 'Ethnic group' })}
          {applicantField({ key: 'sa_tax_number', label: 'SA tax number' })}
          {applicantField({ key: 'tax_number_unavailable_reason', label: 'Tax number unavailable reason' })}
          {applicantField({ key: 'tax_returns_outside_sa', label: 'Tax returns outside SA', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'foreign_tax_country', label: 'Foreign tax country' })}
          {applicantField({ key: 'foreign_tax_number', label: 'Foreign tax number' })}
          {applicantField({ key: 'current_residential_status', label: 'Current residential status' })}
          {applicantField({ key: 'first_time_home_buyer', label: 'First-time home buyer', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'main_residence', label: 'Main residence', type: 'select', options: BOND_YES_NO_OPTIONS })}
          {applicantField({ key: 'highest_level_of_education', label: 'Highest level of education' })}
          {applicantField({ key: 'smoking_tobacco_ecig_declaration', label: 'Smoking / tobacco / e-cig declaration', type: 'select', options: BOND_YES_NO_OPTIONS })}
        </div>
      </article>
    )
  }

  const bondIncomeSectionFields = (prefix) => ([
    { path: `${prefix}.gross_salary`, label: 'Gross salary', inputMode: 'decimal' },
    { path: `${prefix}.average_commission`, label: 'Average commission', inputMode: 'decimal' },
    { path: `${prefix}.investment_income`, label: 'Investment income', inputMode: 'decimal' },
    { path: `${prefix}.rental_income`, label: 'Rental income', inputMode: 'decimal' },
    { path: `${prefix}.car_allowance`, label: 'Car allowance', inputMode: 'decimal' },
    { path: `${prefix}.travel_allowance`, label: 'Travel allowance', inputMode: 'decimal' },
    { path: `${prefix}.entertainment_allowance`, label: 'Entertainment allowance', inputMode: 'decimal' },
    { path: `${prefix}.income_from_sureties`, label: 'Income from sureties', inputMode: 'decimal' },
    { path: `${prefix}.housing_subsidy`, label: 'Housing subsidy', inputMode: 'decimal' },
    { path: `${prefix}.maintenance_or_alimony_income`, label: 'Maintenance / alimony income', inputMode: 'decimal' },
    { path: `${prefix}.average_overtime`, label: 'Average overtime (6 months)', inputMode: 'decimal' },
    { path: `${prefix}.other_income_description`, label: 'Other income description' },
    { path: `${prefix}.other_income_value`, label: 'Other income value', inputMode: 'decimal' },
    { path: `${prefix}.tax_paye`, label: 'Tax (PAYE / SITE)', inputMode: 'decimal' },
    { path: `${prefix}.pension`, label: 'Pension', inputMode: 'decimal' },
    { path: `${prefix}.uif`, label: 'UIF', inputMode: 'decimal' },
    { path: `${prefix}.medical_aid`, label: 'Medical aid', inputMode: 'decimal' },
    { path: `${prefix}.other_deductions_description`, label: 'Other deductions description' },
    { path: `${prefix}.other_deductions_value`, label: 'Other deductions value', inputMode: 'decimal' },
    { path: `${prefix}.rental_expense`, label: 'Rental expense', inputMode: 'decimal' },
    { path: `${prefix}.maintenance_or_alimony_expense`, label: 'Maintenance / alimony expense', inputMode: 'decimal' },
    { path: `${prefix}.rates_taxes_levies`, label: 'Rates, taxes & levies', inputMode: 'decimal' },
    { path: `${prefix}.water_electricity`, label: 'Water & electricity', inputMode: 'decimal' },
    { path: `${prefix}.assurance_insurance_funeral_ra`, label: 'Assurance / insurance / RA', inputMode: 'decimal' },
    { path: `${prefix}.groceries`, label: 'Groceries', inputMode: 'decimal' },
    { path: `${prefix}.transport`, label: 'Transport / petrol / maintenance', inputMode: 'decimal' },
    { path: `${prefix}.security`, label: 'Security', inputMode: 'decimal' },
    { path: `${prefix}.education`, label: 'Education', inputMode: 'decimal' },
    { path: `${prefix}.medical_excluding_payroll`, label: 'Medical (excluding payroll)', inputMode: 'decimal' },
    { path: `${prefix}.cellphone_internet`, label: 'Cellphone / internet', inputMode: 'decimal' },
    { path: `${prefix}.dstv_tv`, label: 'M-Net / DSTV / TV', inputMode: 'decimal' },
    { path: `${prefix}.other_expenses_description`, label: 'Other expenses description' },
    { path: `${prefix}.other_expenses_value`, label: 'Other expenses value', inputMode: 'decimal' },
  ])

  const sumBondNumericFields = (paths = []) =>
    paths.reduce((total, path) => total + (Number(readBondField(path, 0)) || 0), 0)

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-[#142132]">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col overflow-y-auto bg-[#152432] px-5 py-4 text-slate-100 [background-image:radial-gradient(circle_at_18%_-6%,rgba(108,152,193,0.18)_0%,transparent_34%),linear-gradient(180deg,#243c4f_0%,#152432_100%)] lg:flex">
          <div className="border-b border-white/10 pb-3 pt-[1.2rem]">
            <h1 className="text-[3rem] font-bold leading-none tracking-[-0.05em] text-[#f8fbff]">bridge.</h1>
            <p className="mt-2.5 text-[0.82rem] tracking-[0.02em] text-[#c8d5e3]">Client Transaction Workspace</p>
          </div>

          <nav className="mt-4 grid gap-1 pb-4">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.key
              const navStatus = sidebarStatusByKey[item.key]

              return (
                <Link
                  key={item.key}
                  to={getClientPortalPath(token, item.key)}
                  className={[
                    'relative flex min-h-[46px] items-center gap-3 rounded-[14px] border px-3 py-2 text-[0.92rem] font-medium transition duration-150 ease-out',
                    isActive
                      ? 'border-[rgba(52,211,153,0.42)] bg-[rgba(2,6,23,0.25)] text-white shadow-[inset_3px_0_0_#2fd18a]'
                      : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
                  ].join(' ')}
                >
                  <Icon size={16} />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-normal [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {item.label}
                  </span>
                  {navStatus ? (
                    <span
                      className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${
                        isActive
                          ? 'border-white/40 bg-white/15 text-white'
                          : 'border-white/15 bg-[rgba(2,6,23,0.24)] text-[#c0cfde]'
                      }`}
                    >
                      {navStatus}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 lg:pl-[280px]">
          <div className="border-b border-[#dbe5ef] bg-white/80 px-5 py-4 backdrop-blur lg:hidden">
            <div className="overflow-x-auto">
              <nav className="flex min-w-[760px] items-center gap-2 rounded-[22px] border border-[#e2eaf3] bg-[#f8fbff] p-2">
                {visibleMenuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeSection === item.key
                  return (
                    <Link
                      key={item.key}
                      to={getClientPortalPath(token, item.key)}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold transition ${
                        isActive
                          ? 'bg-[#35546c] text-white shadow-[0_12px_24px_rgba(53,84,108,0.18)]'
                          : 'text-[#5f7086] hover:bg-white hover:text-[#142132]'
                      }`}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>

          <div className="space-y-6 px-5 py-5 md:px-8 md:py-8 xl:px-10">
            <section className="rounded-[28px] border border-[#dbe5ef] bg-white px-6 py-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
              {isOverview ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                        Transaction Overview
                      </span>
                      <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-[-0.05em] text-[#142132] sm:text-[2.3rem]">
                        {developmentName}
                      </h1>
                      <p className="mt-1.5 text-[1.02rem] font-semibold text-[#35546c]">{unitLabel}</p>
                      <p className="mt-1 text-sm text-[#6b7d93]">{buyerName}</p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="relative" ref={notificationsRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setNotificationsOpen((previous) => {
                              const nextOpen = !previous
                              if (nextOpen) {
                                setNotificationsSeenAt(new Date().toISOString())
                              }
                              return nextOpen
                            })
                          }}
                          className="relative inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white text-[#4f647b] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                          aria-label="Notifications"
                        >
                          <Bell size={16} />
                          {unreadNotificationCount > 0 ? (
                            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#d97706] px-1.5 text-[0.64rem] font-semibold text-white">
                              {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                            </span>
                          ) : null}
                        </button>

                        {notificationsOpen ? (
                          <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[min(92vw,360px)] rounded-[16px] border border-[#dbe5ef] bg-white p-3 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
                            <div className="mb-2 flex items-center justify-between gap-2 px-1">
                              <strong className="text-sm font-semibold text-[#142132]">Notifications</strong>
                              <span className="text-xs font-medium text-[#7b8ca2]">
                                {notificationItems.length ? `${notificationItems.length} items` : 'No updates'}
                              </span>
                            </div>
                            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                              {notificationItems.length ? (
                                notificationItems.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                      setNotificationsOpen(false)
                                      navigate(getClientPortalPath(token, item.to || 'overview'))
                                    }}
                                    className={`w-full rounded-[12px] border px-3 py-2.5 text-left transition ${
                                      item.tone === 'action'
                                        ? 'border-[#f0d8ae] bg-[#fff7eb] hover:border-[#e4c994]'
                                        : 'border-[#e3ebf4] bg-[#fbfdff] hover:border-[#cfdceb] hover:bg-white'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <strong className="text-sm font-semibold text-[#142132]">{item.title}</strong>
                                      <time className="shrink-0 text-[0.68rem] font-medium text-[#7b8ca2]">
                                        {formatClientNotificationTime(item.createdAt)}
                                      </time>
                                    </div>
                                    <p className="mt-1.5 text-sm leading-6 text-[#51657b]">{item.message}</p>
                                  </button>
                                ))
                              ) : (
                                <div className="rounded-[12px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-3 py-3 text-sm text-[#6b7d93]">
                                  No notifications yet. New updates from your team will appear here.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <Link
                        to={getClientPortalPath(token, 'settings')}
                        className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-3 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#eef4fb] text-[0.68rem] font-semibold text-[#35546c]">
                          {buyerInitial}
                        </span>
                        <Settings size={14} />
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
                    <div className="space-y-4">
                      <div className={`rounded-[20px] border p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)] ${nextStepToneClasses.container}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#6b7d93]">
                              {nextStepState.tone === 'action' ? <AlertTriangle size={13} /> : nextStepState.tone === 'in_progress' ? <CalendarDays size={13} /> : <Star size={13} />}
                              {heroActionHeading}
                            </span>
                            <h2 className="mt-2 text-[1.22rem] font-semibold tracking-[-0.03em] text-[#142132]">{nextStepState.title}</h2>
                            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#566b82]">{nextStepState.description}</p>
                          </div>
                          <Link
                            to={getClientPortalPath(token, primaryOverviewAction.to)}
                            className={`inline-flex min-h-[44px] items-center justify-center rounded-[14px] px-4 py-2 text-sm font-semibold transition ${primaryOverviewActionClasses}`}
                          >
                            {primaryOverviewAction.label}
                          </Link>
                        </div>
                      </div>

                      <article className="rounded-[18px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${heroStatusBadge.className}`}>
                            {heroStatusBadge.label}
                          </span>
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">
                            {heroProgressSummary}
                          </span>
                        </div>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e6edf4]">
                          <div
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progressPercent}%`, backgroundImage: journeyProgressGradient }}
                          />
                        </div>
                      </article>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <article className="rounded-[16px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-3.5">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Current stage</span>
                        <strong className="mt-1.5 block text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">{MAIN_STAGE_LABELS[mainStage]}</strong>
                      </article>
                      <article className="rounded-[16px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-3.5">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Purchase price</span>
                        <strong className="mt-1.5 block text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">{purchasePriceLabel}</strong>
                      </article>
                      <article className="rounded-[16px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-3.5">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Transaction age</span>
                        <strong className="mt-1.5 block text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">{timeInStageLabel} active</strong>
                        <span className="mt-1 block text-xs font-medium text-[#6b7d93]">Updated {stageUpdatedDateLabel}</span>
                      </article>
                      <article className="rounded-[16px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-3.5">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Next step</span>
                        <strong className="mt-1.5 block text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">{nextStage}</strong>
                      </article>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {secondaryOverviewActions.map((action) => {
                      const Icon = action.icon
                      return (
                        <Link
                          key={action.to}
                          to={getClientPortalPath(token, action.to)}
                          className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8d8e7]"
                        >
                          <Icon size={15} />
                          {action.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ) : isDocuments || isHandover || isBondApplication ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#4a5f77]">
                      {isBondApplication ? `Application status: ${bondApplicationStatus}` : workspaceHeaderStatusLabel}
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      <Link
                        to={getClientPortalPath(token, 'documents')}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                      >
                        <FileText size={15} />
                        Documents
                      </Link>
                      {isHandover || isBondApplication ? (
                        <Link
                          to={getClientPortalPath(token, 'overview')}
                          className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                        >
                          <LayoutDashboard size={15} />
                          Overview
                        </Link>
                      ) : (
                        <Link
                          to={getClientPortalPath(token, 'handover')}
                          className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                        >
                          <KeyRound size={15} />
                          Handover
                        </Link>
                      )}
                      <Link
                        to={getClientPortalPath(token, 'team')}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] bg-[#2f5478] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#254664]"
                      >
                        <Users size={15} />
                        Team Contacts
                      </Link>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h1 className="flex flex-wrap items-center gap-3 text-[2.1rem] font-semibold leading-tight tracking-[-0.05em] text-[#142132] sm:text-[2.25rem]">
                      <span>{developmentName}</span>
                      <span className="hidden text-[#90a2b6] sm:inline">|</span>
                      <span className="inline-flex items-center rounded-full border border-[#d1deeb] bg-[#f4f8fc] px-4 py-2 text-[1.25rem] tracking-[-0.03em] text-[#35546c]">
                        {unitLabel}
                      </span>
                    </h1>
                    <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">{buyerName}</p>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                    {activeSectionLabel}
                  </span>
                  <h1 className="mt-3 text-[1.75rem] font-semibold tracking-[-0.04em] text-[#142132]">{developmentName} | {unitLabel}</h1>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                    {buyerName} • Last updated {new Date(portal.lastUpdated).toLocaleString()}
                  </p>
                </div>
              )}
            </section>

            {error ? <p className="rounded-[18px] border border-[#f1cbc7] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}

            {isOverview ? (
              <>
                {reservationRequiredForClient ? (
                  <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-[1.14rem] font-semibold tracking-[-0.03em] text-[#142132]">Reservation Deposit Required</h3>
                        <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                          Please pay the reservation deposit and upload proof of payment so your team can verify and continue.
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(reservationProofStatusLabel)}`}>
                        {reservationProofStatusLabel}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Amount due</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{reservationAmountLabel}</strong>
                      </article>
                      <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Current status</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{reservationStatusLabel}</strong>
                      </article>
                      <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Proof of payment</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">
                          {reservationProofRequirement?.complete ? 'Uploaded' : 'Pending upload'}
                        </strong>
                      </article>
                    </div>

                    {reservationPaymentInstructions ? (
                      <p className="mt-3 text-sm leading-6 text-[#566b82]">
                        {reservationPaymentInstructions}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {reservationProofRequirement ? (
                        <button
                          type="button"
                          onClick={() => openRequiredDocumentPanel(reservationProofRequirement, 'Sales Documents', reservationProofStatusLabel)}
                          className="inline-flex min-h-[42px] items-center rounded-[12px] bg-[#35546c] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d]"
                        >
                          Upload proof of payment
                        </button>
                      ) : (
                        <Link
                          to={getClientPortalPath(token, 'documents')}
                          className="inline-flex min-h-[42px] items-center rounded-[12px] bg-[#35546c] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d]"
                        >
                          Open documents
                        </Link>
                      )}
                    </div>
                  </section>
                ) : null}

                <ClientJourneySection
                  token={token}
                  progressPercent={progressPercent}
                  currentStageLabel={MAIN_STAGE_LABELS[mainStage]}
                  nextStageLabel={nextStage}
                  journeyStatus={journeyStatusFlag}
                  nextAction={nextActionModel}
                  steps={clientJourneySteps}
                  expandedStepId={resolvedExpandedJourneyStepId}
                  onToggleStep={(stepId) =>
                    setExpandedJourneyStepId((previous) => (previous === stepId ? null : stepId))
                  }
                  updates={latestJourneyFeedItems}
                  commentDraft={commentDraft}
                  saving={saving}
                  onCommentDraftChange={setCommentDraft}
                  onCommentSubmit={handleSubmitPortalComment}
                  getClientPortalPath={getClientPortalPath}
                />

                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                  <div className="grid gap-5">
                    <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">What&apos;s happening</h3>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                            A clear summary of what your team is working on right now.
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                          Live summary
                        </span>
                      </div>
                      <div className="mt-5 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                        <ul className="space-y-3 text-sm leading-6 text-[#324559]">
                          {whatsHappeningSummary.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ba0b8]" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>

                    <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Quick links</h3>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Jump to the areas you are most likely to use next.</p>
                        </div>
                      </div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {[
                          { label: 'Upload documents', to: `/client/${token}/documents`, copy: 'Open the document workspace and upload what is still required.' },
                          { label: 'View progress', to: `/client/${token}`, copy: 'See the main timeline and current workflow progress on Overview.' },
                          { label: 'Handover status', to: `/client/${token}/handover`, copy: 'Check key collection, handover readiness, and meter readings.' },
                          portal?.settings?.snag_reporting_enabled
                            ? { label: 'Snag register', to: `/client/${token}/snags`, copy: 'Log defects and track progress on any open snag items.' }
                            : null,
                        ]
                          .filter(Boolean)
                          .map((item) => (
                          <Link key={item.label} to={item.to} className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4 transition hover:border-[#cad8e7] hover:bg-white">
                            <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
                            <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{item.copy}</p>
                          </Link>
                          ))}
                      </div>
                    </article>
                  </div>

                  <div className="grid gap-5">
                    <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                      <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Handover status</h3>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                          <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Estimated handover</span>
                          <strong className="mt-3 block text-sm font-semibold text-[#142132]">
                            {formatClientPortalDate(portal?.handover?.handoverDate, 'Awaiting schedule')}
                          </strong>
                        </article>
                        <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                          <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Status</span>
                          <strong className="mt-3 block text-sm font-semibold text-[#142132]">{toTitleLabel(handoverStatus)}</strong>
                        </article>
                      </div>
                    </article>

                    {portal?.settings?.snag_reporting_enabled ? (
                      <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                        <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Snag summary</h3>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                            <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Open snags</span>
                            <strong className="mt-3 block text-sm font-semibold text-[#142132]">{snagOpenCount}</strong>
                          </article>
                          <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                            <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Resolved</span>
                            <strong className="mt-3 block text-sm font-semibold text-[#142132]">{snagResolvedCount}</strong>
                          </article>
                        </div>
                      </article>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}

            {isDetails ? (
              <section className="space-y-5">
                <header className="rounded-[26px] border border-[#dbe5ef] bg-white px-6 py-6 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
                  <h3 className="text-[1.36rem] font-semibold tracking-[-0.03em] text-[#142132]">My Details</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Review and update your information for this purchase.</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6edf5] pt-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-[#5f7288]">
                      <span className="font-medium text-[#274055]">{myDetailsRequiredCompleted}/{myDetailsRequiredTotal || 0} required fields complete</span>
                      <span className="hidden text-[#a2b2c4] sm:inline">•</span>
                      <span>{myDetailsCompletionPercent}% completion</span>
                      <span className="hidden text-[#a2b2c4] sm:inline">•</span>
                      <span>{myDetailsCapturedFields}/{myDetailsFieldCount || 0} fields captured</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadOnboardingSummary}
                      className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white"
                    >
                      <Download size={14} />
                      Download Summary
                    </button>
                  </div>
                </header>

                {myDetailsSections.map((section) => {
                  const isEditingSection = myDetailsEditingSection === section.key
                  const isSavingSection = myDetailsSavingSection === section.key
                  const editingLocked = Boolean(myDetailsEditingSection) && !isEditingSection
                  const sectionStatusLabel = section.complete ? 'Complete' : section.inProgress ? 'In progress' : 'Incomplete'
                  const sectionStatusToneClasses = section.complete
                    ? 'bg-[#35a26b]'
                    : section.inProgress
                      ? 'bg-[#dd9d2f]'
                      : 'bg-[#b8c7d8]'
                  const isPurchaseDetailsSection = section.key === 'purchase_details'
                  const detailsCardClassName = isPurchaseDetailsSection
                    ? 'border-[#cfdfee] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]'
                    : 'border-[#dbe5ef] bg-white'

                  return (
                    <article
                      key={section.key}
                      className={`rounded-[24px] border p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition duration-200 ${detailsCardClassName} ${
                        isEditingSection ? 'shadow-[0_18px_32px_rgba(15,23,42,0.07)]' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{section.title}</h4>
                          <div className="mt-1.5 inline-flex items-center gap-2 text-xs font-medium text-[#6b7d93]">
                            <span className={`inline-flex h-2 w-2 rounded-full ${sectionStatusToneClasses}`} />
                            <span>{sectionStatusLabel}</span>
                            <span>•</span>
                            <span>
                              {section.requiredTotalCount > 0
                                ? `${section.requiredCompleteCount}/${section.requiredTotalCount} required`
                                : `${section.capturedCount}/${section.fields.length} captured`}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">{section.description}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isEditingSection ? (
                            <>
                              <button
                                type="button"
                                disabled={isSavingSection}
                                onClick={handleCancelMyDetailsEdit}
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#3f566e] transition hover:border-[#c8d8e9] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={isSavingSection}
                                onClick={() => handleSaveMyDetailsSection(section.key)}
                                className="inline-flex items-center rounded-full bg-[#2f5478] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#244463] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSavingSection ? 'Saving...' : 'Save section'}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={editingLocked}
                              onClick={() => setMyDetailsEditingSection(section.key)}
                              className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Edit section
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {section.fields.map((field) => {
                          const fieldId = `my-details-${section.key}-${field.key}`
                          const displayValue = formatMyDetailsFieldDisplayValue(field, field.value)

                          if (isEditingSection) {
                            return (
                              <label key={field.key} htmlFor={fieldId} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                                <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">
                                  {field.label}{field.required ? ' *' : ''}
                                </span>
                                {field.type === 'select' ? (
                                  <select
                                    id={fieldId}
                                    value={field.value ?? ''}
                                    onChange={(event) => handleMyDetailsFieldChange(field.key, event.target.value)}
                                    className="mt-2 w-full rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2.5 text-sm text-[#162334] outline-none transition focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                                  >
                                    {(field.options || [{ value: '', label: 'Select option' }]).map((option) => (
                                      <option key={`${field.key}-${option.value || 'empty'}`} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    id={fieldId}
                                    type={field.type || 'text'}
                                    inputMode={field.type === 'number' ? 'decimal' : undefined}
                                    value={field.value ?? ''}
                                    onChange={(event) => handleMyDetailsFieldChange(field.key, event.target.value)}
                                    className="mt-2 w-full rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2.5 text-sm text-[#162334] outline-none transition placeholder:text-[#8aa0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                                  />
                                )}
                              </label>
                            )
                          }

                          return (
                            <article key={field.key} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                              <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{field.label}</span>
                              <strong className="mt-1.5 block text-sm font-semibold leading-7 text-[#142132]">{displayValue}</strong>
                            </article>
                          )
                        })}
                      </div>
                    </article>
                  )
                })}
              </section>
            ) : null}

            {isBondApplication ? (
              <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
                <header className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Bond Application</span>
                      <h3 className="mt-2 text-[1.26rem] font-semibold tracking-[-0.03em] text-[#142132]">{bondApplicationApplicantHeader}</h3>
                      <p className="mt-1 text-sm text-[#6b7d93]">
                        {unitLabel} • {developmentName}
                      </p>
                      <p className="mt-2 text-sm text-[#5f7288]">
                        Purchase price <strong className="text-[#142132]">{purchasePriceLabel}</strong>
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${bondApplicationStatusClasses}`}>
                      {bondApplicationStatus}
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                      <span>Application completion</span>
                      <span>{bondApplicationProgressPercent}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[#e4ebf3]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#3f78b1_0%,#2f8a64_100%)] transition-all duration-300"
                        style={{ width: `${bondApplicationProgressPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <Link
                      to={getClientPortalPath(token, 'overview')}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border border-[#d1deeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                    >
                      <LayoutDashboard size={13} />
                      Overview
                    </Link>
                    <Link
                      to={getClientPortalPath(token, 'documents')}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border border-[#d1deeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                    >
                      <FileText size={13} />
                      Documents
                    </Link>
                    <Link
                      to={getClientPortalPath(token, 'team')}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] bg-[#2f5478] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#254664]"
                    >
                      <Users size={13} />
                      Team Contacts
                    </Link>
                  </div>
                </header>

                <div className="overflow-x-auto">
                  <nav className="inline-flex min-w-full gap-2 rounded-[18px] border border-[#e2eaf3] bg-[#f8fbff] p-2">
                    {BOND_APPLICATION_TABS.map((tab) => {
                      const isActive = activeBondApplicationTab === tab.key
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => {
                            void handleBondApplicationTabChange(tab.key)
                          }}
                          className={`inline-flex min-h-[44px] min-w-[150px] items-center justify-center rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                            isActive
                              ? 'border border-[#d1deeb] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                              : 'border border-transparent text-[#5f7086] hover:border-[#d8e4ef] hover:bg-white hover:text-[#142132]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </nav>
                </div>

                {activeBondApplicationTab === 'application' ? (
                  <section className="space-y-5 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Application</h4>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                          Structured around the OOBA interview flow. Prefilled values come from onboarding and My Details.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void persistBondApplicationDraft()
                        }}
                        disabled={bondApplicationSaving || !bondApplicationDirty}
                        className="inline-flex min-h-[40px] items-center rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                      >
                        {bondApplicationSaving ? 'Saving...' : 'Save Progress'}
                      </button>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                      <aside className="rounded-[16px] border border-[#e3ebf4] bg-white p-3 lg:sticky lg:top-6 lg:h-fit">
                        <nav className="space-y-1.5">
                          {BOND_APPLICATION_SECTION_TABS.map((section) => {
                            const isActive = section.key === activeBondApplicationSectionTab
                            const status = bondApplicationSectionStatusByKey[section.key]
                            const statusLabel = status?.isComplete ? 'Complete' : status?.hasMissing ? `${status.complete}/${status.total}` : 'Pending'
                            return (
                              <button
                                key={section.key}
                                type="button"
                                onClick={() => {
                                  void handleBondApplicationSectionChange(section.key)
                                }}
                                className={`flex w-full items-center justify-between rounded-[12px] border px-3 py-2 text-left transition ${
                                  isActive
                                    ? 'border-[#b9ccdf] bg-[#eef4fb] text-[#1f3449]'
                                    : status?.isComplete
                                      ? 'border-[#d4e8dc] bg-[#f5fbf7] text-[#2f7a51] hover:border-[#c8dfd2]'
                                      : status?.hasMissing
                                        ? 'border-[#ead9c6] bg-[#fffaf3] text-[#8a5a22] hover:border-[#e2c9ab]'
                                        : 'border-[#e3ebf4] bg-white text-[#5f7086] hover:border-[#d3e0ed]'
                                }`}
                              >
                                <span className="pr-3 text-sm font-semibold">{section.label}</span>
                                <span className="text-[0.66rem] font-semibold uppercase tracking-[0.08em]">{statusLabel}</span>
                              </button>
                            )
                          })}
                        </nav>
                      </aside>

                      <div className="space-y-4 rounded-[18px] border border-[#e3ebf4] bg-white p-4">
                        <div className="border-b border-[#e6edf5] pb-3">
                          <h5 className="text-[1.05rem] font-semibold text-[#142132]">{activeBondApplicationSectionMeta?.label}</h5>
                        </div>

                        {activeBondApplicationSectionTab === 'summary' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {renderBondInputField({ path: 'summary.applicant_name', label: 'Applicant name', required: true, helperText: 'Pre-filled from onboarding.' })}
                              {renderBondInputField({ path: 'summary.has_co_applicant', label: 'Co-applicant present', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'summary.has_surety', label: 'Surety present', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'summary.property_reference', label: 'Property reference', required: true })}
                              {renderBondInputField({ path: 'summary.development_name', label: 'Development' })}
                              {renderBondInputField({ path: 'summary.unit_reference', label: 'Unit reference' })}
                              {renderBondInputField({ path: 'summary.purchase_price', label: 'Purchase price', required: true, inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'summary.deposit_contribution', label: 'Deposit / contribution', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'summary.finance_type', label: 'Finance type', required: true })}
                              {renderBondInputField({ path: 'summary.marital_status', label: 'Marital status', required: true, type: 'select', options: BOND_MARITAL_STATUS_OPTIONS })}
                              {renderBondInputField({ path: 'summary.main_residence', label: 'Main residence', required: true, type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'summary.first_time_home_buyer', label: 'First-time home buyer', required: true, type: 'select', options: BOND_YES_NO_OPTIONS })}
                            </div>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                              <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Missing required sections</span>
                              <p className="mt-1 text-sm text-[#324559]">
                                {missingBondApplicationSectionLabels.length ? missingBondApplicationSectionLabels.join(', ') : 'All required sections complete.'}
                              </p>
                            </article>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'personal_details' ? (
                          <div className="space-y-4">
                            {renderBondApplicantSection('primary', 'Primary Applicant', 'Required personal data based on OOBA Section A.')}
                            {hasCoApplicantProfile ? renderBondApplicantSection('co_applicant', 'Co-applicant / Surety') : null}
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'contact_address' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: 'contact_address.home_number', label: 'Home number' })}
                              {renderBondInputField({ path: 'contact_address.cellphone_number', label: 'Cellphone number', required: true })}
                              {renderBondInputField({ path: 'contact_address.work_number', label: 'Work number' })}
                              {renderBondInputField({ path: 'contact_address.email_address', label: 'Email address', required: true, type: 'email' })}
                              {renderBondInputField({ path: 'contact_address.fax_number', label: 'Fax number' })}
                              {renderBondInputField({ path: 'contact_address.home_language', label: 'Home language' })}
                              {renderBondInputField({ path: 'contact_address.correspondence_language', label: 'Language for correspondence' })}
                              {renderBondInputField({ path: 'contact_address.legal_notice_delivery_method', label: 'Legal notice delivery method', type: 'select', options: BOND_LEGAL_NOTICE_OPTIONS, required: true })}
                            </div>
                            <div className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Residential address</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'contact_address.residential_address_street', label: 'Street', required: true })}
                                {renderBondInputField({ path: 'contact_address.residential_address_suburb', label: 'Suburb' })}
                                {renderBondInputField({ path: 'contact_address.residential_address_city', label: 'City', required: true })}
                                {renderBondInputField({ path: 'contact_address.residential_address_country', label: 'Country' })}
                                {renderBondInputField({ path: 'contact_address.residential_address_postal_code', label: 'Postal code', required: true })}
                                {renderBondInputField({ path: 'contact_address.residential_years', label: 'Length at address (years)', inputMode: 'numeric' })}
                                {renderBondInputField({ path: 'contact_address.residential_months', label: 'Length at address (months)', inputMode: 'numeric' })}
                              </div>
                            </div>
                            <div className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Postal / legal correspondence</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'contact_address.postal_same_as_residential', label: 'Postal same as residential', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'contact_address.future_legal_correspondence_same_as_postal', label: 'Future legal correspondence same as postal', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              </div>
                              {normalizePortalStatus(readBondField('contact_address.postal_same_as_residential')) === 'no' ? (
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  {renderBondInputField({ path: 'contact_address.postal_address_street', label: 'Postal street / PO Box' })}
                                  {renderBondInputField({ path: 'contact_address.postal_address_suburb', label: 'Postal suburb' })}
                                  {renderBondInputField({ path: 'contact_address.postal_address_city', label: 'Postal city' })}
                                  {renderBondInputField({ path: 'contact_address.postal_address_country', label: 'Postal country' })}
                                  {renderBondInputField({ path: 'contact_address.postal_address_postal_code', label: 'Postal code' })}
                                </div>
                              ) : null}
                              {normalizePortalStatus(readBondField('contact_address.future_legal_correspondence_same_as_postal')) === 'no' ? (
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_street', label: 'Future legal street / PO Box' })}
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_suburb', label: 'Future legal suburb' })}
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_city', label: 'Future legal city' })}
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_country', label: 'Future legal country' })}
                                  {renderBondInputField({ path: 'contact_address.future_legal_address_postal_code', label: 'Future legal postal code' })}
                                </div>
                              ) : null}
                            </div>
                            <div className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Public official / politically exposed</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'contact_address.is_public_official', label: 'Public official in position of authority', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'contact_address.associated_with_public_official', label: 'Associated with public official', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'contact_address.public_official_relationship_nature', label: 'Nature of relationship / association' })}
                                {renderBondInputField({ path: 'contact_address.public_official_name', label: 'Public official full name' })}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'employment' ? (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-2.5">
                              {[
                                { key: 'primary', label: 'Primary Applicant' },
                                ...(hasCoApplicantProfile ? [{ key: 'co_applicant', label: 'Co-applicant' }] : []),
                              ].map((item) => (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => setActiveBondApplicantKey(item.key)}
                                  className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] ${
                                    activeBondApplicantKey === item.key
                                      ? 'border-[#b8cadc] bg-[#eef4fb] text-[#274055]'
                                      : 'border-[#dde7f1] bg-white text-[#6d7f93] hover:border-[#cad8e7]'
                                  }`}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.occupation_status`, label: 'Occupation status', type: 'select', options: BOND_OCCUPATION_STATUS_OPTIONS, required: true })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.occupational_level`, label: 'Occupational level', type: 'select', options: BOND_OCCUPATIONAL_LEVEL_OPTIONS, required: true })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.nature_of_occupation`, label: 'Nature of occupation', required: true })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.company_registration_number`, label: 'Company registration number' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employee_number`, label: 'Employee number' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employment_years`, label: 'Employment years', inputMode: 'numeric' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employment_months`, label: 'Employment months', inputMode: 'numeric' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.works_in_south_africa`, label: 'Works in South Africa', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_street`, label: 'Employer street' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_suburb`, label: 'Employer suburb' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_city`, label: 'Employer city' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_country`, label: 'Employer country' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.employer_address_postal_code`, label: 'Employer postal code' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.purchase_coincides_job_change`, label: 'Purchase coincides with job change', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previously_employed`, label: 'Previously employed', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.own_business_income_percent`, label: '% income from own business', inputMode: 'decimal' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.shareholder_in_employer_business`, label: 'Shareholder in employer business', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.shareholding_percent`, label: '% shareholding', inputMode: 'decimal' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previous_employer_1_name`, label: 'Previous employer 1' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previous_employer_1_duration`, label: 'Previous employer 1 duration' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previous_employer_2_name`, label: 'Previous employer 2' })}
                              {renderBondInputField({ path: `employment.${activeBondApplicantKey}.previous_employer_2_duration`, label: 'Previous employer 2 duration' })}
                            </div>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'credit_history' ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            {renderBondInputField({ path: 'credit_history.currently_under_administration', label: 'Currently under administration', type: 'select', options: BOND_YES_NO_OPTIONS, required: true })}
                            {renderBondInputField({ path: 'credit_history.ever_under_administration', label: 'Ever under administration', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.judgments_taken', label: 'Judgement taken against you', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.currently_under_debt_review', label: 'Currently under debt review', type: 'select', options: BOND_YES_NO_OPTIONS, required: true })}
                            {renderBondInputField({ path: 'credit_history.debt_counsellor_name', label: 'Debt counsellor name' })}
                            {renderBondInputField({ path: 'credit_history.debt_counsellor_phone', label: 'Debt counsellor phone' })}
                            {renderBondInputField({ path: 'credit_history.under_debt_rearrangement', label: 'Under debt re-arrangement', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.ever_declared_insolvent', label: 'Ever declared insolvent', type: 'select', options: BOND_YES_NO_OPTIONS, required: true })}
                            {renderBondInputField({ path: 'credit_history.insolvency_date', label: 'Date of insolvency', type: 'date' })}
                            {renderBondInputField({ path: 'credit_history.rehabilitation_date', label: 'Rehabilitation date', type: 'date' })}
                            {renderBondInputField({ path: 'credit_history.adverse_credit_listings', label: 'Aware of adverse credit listings', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.adverse_credit_listing_details', label: 'Adverse listing details', type: 'textarea' })}
                            {renderBondInputField({ path: 'credit_history.credit_bureau_dispute', label: 'In a credit bureau dispute', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.bound_by_surety_agreements', label: 'Bound by surety agreements', type: 'select', options: BOND_YES_NO_OPTIONS, required: true })}
                            {renderBondInputField({ path: 'credit_history.surety_amount', label: 'Surety amount', inputMode: 'decimal' })}
                            {renderBondInputField({ path: 'credit_history.currently_paying_surety_account', label: 'Currently paying this account', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.surety_monthly_instalment', label: 'Monthly instalment', inputMode: 'decimal' })}
                            {renderBondInputField({ path: 'credit_history.surety_details', label: 'Suretyship details', type: 'textarea' })}
                            {renderBondInputField({ path: 'credit_history.settling_surety_account', label: 'Will settle this account', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            {renderBondInputField({ path: 'credit_history.surety_new_instalment_if_reduced', label: 'New instalment if reduced', inputMode: 'decimal' })}
                            {renderBondInputField({ path: 'credit_history.surety_in_favour_of', label: 'Surety in favour of' })}
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'loan_details' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: 'loan_details.erf_or_section_number', label: 'Erf / section number' })}
                              {renderBondInputField({ path: 'loan_details.street_or_complex', label: 'Street / complex', required: true })}
                              {renderBondInputField({ path: 'loan_details.suburb', label: 'Suburb', required: true })}
                              {renderBondInputField({ path: 'loan_details.amount_to_be_registered', label: 'Amount to be registered', required: true, inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'loan_details.additional_amount_for_solar_energy', label: 'Additional amount for solar energy', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'loan_details.solar_energy_loan_amount', label: 'Solar energy loan amount', inputMode: 'decimal', hidden: normalizePortalStatus(readBondField('loan_details.additional_amount_for_solar_energy')) !== 'yes' })}
                              {renderBondInputField({ path: 'loan_details.solar_loan_term', label: 'Solar loan term', hidden: normalizePortalStatus(readBondField('loan_details.additional_amount_for_solar_energy')) !== 'yes' })}
                              {renderBondInputField({ path: 'loan_details.solar_panels_included', label: 'Solar panels included', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'loan_details.debit_order_bank_name', label: 'Debit order bank name', required: true })}
                              {renderBondInputField({ path: 'loan_details.debit_order_account_number', label: 'Debit order account number', required: true })}
                              {renderBondInputField({ path: 'loan_details.preferred_debit_order_date', label: 'Preferred debit order date', required: true, type: 'date' })}
                            </div>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Preferred lenders</h6>
                              <p className="mt-1 text-xs text-[#6b7d93]">Choose lenders you want this application submitted to.</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {BOND_APPLICATION_BANK_OPTIONS.map((bankName) => {
                                  const selected = bondApplicationData?.selected_banks?.includes(bankName)
                                  return (
                                    <button
                                      key={bankName}
                                      type="button"
                                      onClick={() => toggleBondApplicationBank(bankName)}
                                      className={`inline-flex min-h-[40px] items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                        selected
                                          ? 'border-[#b8cadc] bg-[#eef4fb] text-[#274055]'
                                          : 'border-[#dde7f1] bg-white text-[#5f7288] hover:border-[#cbd9e8]'
                                      }`}
                                    >
                                      {bankName}
                                    </button>
                                  )
                                })}
                              </div>
                            </article>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'income_deductions_expenses' ? (
                          <div className="space-y-4">
                            {[
                              { key: 'primary', label: 'Primary Applicant' },
                              ...(hasCoApplicantProfile ? [{ key: 'co_applicant', label: 'Co-applicant' }] : []),
                            ].map((applicantSection) => {
                              const incomePaths = [
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.gross_salary`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.average_commission`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.investment_income`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.rental_income`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.car_allowance`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.travel_allowance`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.entertainment_allowance`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.income_from_sureties`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.housing_subsidy`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.maintenance_or_alimony_income`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.average_overtime`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.other_income_value`,
                              ]
                              const deductionPaths = [
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.tax_paye`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.pension`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.uif`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.medical_aid`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.other_deductions_value`,
                              ]
                              const expensePaths = [
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.rental_expense`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.maintenance_or_alimony_expense`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.rates_taxes_levies`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.water_electricity`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.assurance_insurance_funeral_ra`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.groceries`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.transport`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.security`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.education`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.medical_excluding_payroll`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.cellphone_internet`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.dstv_tv`,
                                `${applicantSection.key === 'primary' ? 'income_deductions_expenses.primary' : 'income_deductions_expenses.co_applicant'}.other_expenses_value`,
                              ]
                              const prefix = applicantSection.key === 'primary'
                                ? 'income_deductions_expenses.primary'
                                : 'income_deductions_expenses.co_applicant'
                              const incomeTotal = sumBondNumericFields(incomePaths)
                              const deductionsTotal = sumBondNumericFields(deductionPaths)
                              const expensesTotal = sumBondNumericFields(expensePaths)
                              const netAfterDeductions = incomeTotal - deductionsTotal
                              const netSurplus = netAfterDeductions - expensesTotal

                              return (
                                <article key={applicantSection.key} className="space-y-4 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                                  <h6 className="text-sm font-semibold text-[#142132]">{applicantSection.label}</h6>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    {bondIncomeSectionFields(prefix).map((field) => renderBondInputField({
                                      path: field.path,
                                      label: field.label,
                                      inputMode: field.inputMode,
                                    }))}
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <article className="rounded-[12px] border border-[#dde7f1] bg-white px-3 py-2.5">
                                      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Total income</span>
                                      <strong className="mt-1 block text-sm text-[#142132]">{ZAR_CURRENCY.format(incomeTotal)}</strong>
                                    </article>
                                    <article className="rounded-[12px] border border-[#dde7f1] bg-white px-3 py-2.5">
                                      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Total deductions</span>
                                      <strong className="mt-1 block text-sm text-[#142132]">{ZAR_CURRENCY.format(deductionsTotal)}</strong>
                                    </article>
                                    <article className="rounded-[12px] border border-[#dde7f1] bg-white px-3 py-2.5">
                                      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Income after deductions</span>
                                      <strong className="mt-1 block text-sm text-[#142132]">{ZAR_CURRENCY.format(netAfterDeductions)}</strong>
                                    </article>
                                    <article className="rounded-[12px] border border-[#dde7f1] bg-white px-3 py-2.5">
                                      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Net surplus / deficit</span>
                                      <strong className={`mt-1 block text-sm ${netSurplus >= 0 ? 'text-[#2f7a51]' : 'text-[#b5472d]'}`}>
                                        {ZAR_CURRENCY.format(netSurplus)}
                                      </strong>
                                    </article>
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'banking_liabilities' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: 'banking_liabilities.primary_bank_name', label: 'Primary bank / institution', required: true })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_account_type', label: 'Primary account type', type: 'select', options: BOND_ACCOUNT_TYPE_OPTIONS, required: true })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_account_holder_name', label: 'Account holder name' })}
                              {renderBondInputField({ path: 'banking_liabilities.legal_entity_account_name_match', label: 'Account in legal entity name', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'banking_liabilities.business_bank_account', label: 'Business bank account', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_account_number', label: 'Account number', required: true })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_balance_debit_credit', label: 'Balance debit / credit' })}
                              {renderBondInputField({ path: 'banking_liabilities.primary_bank_first_consideration_consent', label: 'Primary bank first consideration consent', type: 'select', options: BOND_YES_NO_OPTIONS })}
                            </div>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Existing home loan</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_bank', label: 'Bank / institution' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_account_holder_name', label: 'Account holder name' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_account_number', label: 'Account number' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_outstanding_balance', label: 'Outstanding balance', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_monthly_instalment', label: 'Monthly instalment', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_selling_property', label: 'Selling existing property', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'banking_liabilities.home_loan_1_new_instalment_if_reduced', label: 'New instalment if reduced', inputMode: 'decimal' })}
                              </div>
                            </article>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Other bank / finance account</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_bank', label: 'Bank / institution' })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_account_type', label: 'Account type', type: 'select', options: BOND_ACCOUNT_TYPE_OPTIONS, required: true })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_current_balance', label: 'Current balance', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_monthly_payment', label: 'Monthly payment', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_settled', label: 'Will this account be settled?', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_business_account', label: 'Business account?', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'banking_liabilities.other_finance_1_legal_entity_account', label: 'Legal entity account?', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              </div>
                            </article>
                            <article className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Retail accounts</h6>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'banking_liabilities.retail_account_name', label: 'Retail store name' })}
                                {renderBondInputField({ path: 'banking_liabilities.retail_current_balance', label: 'Current balance', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.retail_monthly_payment', label: 'Monthly payment', inputMode: 'decimal' })}
                                {renderBondInputField({ path: 'banking_liabilities.retail_settled', label: 'Will this account be settled?', type: 'select', options: BOND_YES_NO_OPTIONS })}
                              </div>
                            </article>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'assets_liabilities' ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              {renderBondInputField({ path: 'assets_liabilities.fixed_property', label: 'Fixed property', inputMode: 'decimal', required: true })}
                              {renderBondInputField({ path: 'assets_liabilities.vehicles', label: 'Vehicles', inputMode: 'decimal', required: true })}
                              {renderBondInputField({ path: 'assets_liabilities.investments', label: 'Investments', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'assets_liabilities.furniture_and_fittings', label: 'Furniture & fittings', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'assets_liabilities.other_assets_description', label: 'Other assets description' })}
                              {renderBondInputField({ path: 'assets_liabilities.other_assets_value', label: 'Other assets market value', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'assets_liabilities.other_liabilities_description', label: 'Other liabilities description' })}
                              {renderBondInputField({ path: 'assets_liabilities.other_liabilities_value', label: 'Other liabilities value', inputMode: 'decimal' })}
                              {renderBondInputField({ path: 'assets_liabilities.total_assets', label: 'Total assets', inputMode: 'decimal', required: true })}
                              {renderBondInputField({ path: 'assets_liabilities.total_liabilities', label: 'Total liabilities', inputMode: 'decimal', required: true })}
                              {renderBondInputField({ path: 'assets_liabilities.net_asset_value', label: 'Net asset value', inputMode: 'decimal', required: true })}
                            </div>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'declarations_consents' ? (
                          <div className="space-y-4">
                            <article className="space-y-3 rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                              <h6 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Declarations & privacy</h6>
                              {[
                                ['declarations_consents.loan_processing_consent', 'I consent to loan processing and affordability assessment.'],
                                ['declarations_consents.credit_bureau_fraud_bank_data_consent', 'I consent to credit bureau, fraud, and bank data retrieval checks.'],
                                ['declarations_consents.insurance_third_party_communication_consent', 'I consent to related insurance and third-party communication where required.'],
                                ['declarations_consents.nhfc_first_home_finance_consent', 'I consent to First Home Finance / NHFC processing where applicable.'],
                                ['declarations_consents.declaration_accepted', 'I confirm that all information submitted is true and complete.'],
                              ].map(([path, copy]) => (
                                <label key={path} className="flex items-start gap-3 rounded-[12px] border border-[#e3ebf4] bg-white px-3 py-3">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(readBondField(path))}
                                    onChange={(event) => updateBondField(path, event.target.checked)}
                                    className="mt-1 h-4 w-4 rounded border-[#c7d4e3]"
                                  />
                                  <span className="text-sm leading-6 text-[#324559]">{copy}</span>
                                </label>
                              ))}
                              <div className="grid gap-3 md:grid-cols-2">
                                {renderBondInputField({ path: 'declarations_consents.marketing_privacy_preference', label: 'Marketing / privacy preference', type: 'select', options: BOND_YES_NO_OPTIONS })}
                                {renderBondInputField({ path: 'declarations_consents.digital_signature_name', label: 'Digital signature name', required: true })}
                                {renderBondInputField({ path: 'declarations_consents.digital_signature_date', label: 'Digital signature date', type: 'date', required: true })}
                              </div>
                            </article>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6edf5] pt-3">
                              <span className="text-xs font-medium text-[#6b7d93]">
                                {bondApplicationData?.submitted_at
                                  ? `Submitted ${formatClientPortalDate(bondApplicationData.submitted_at)}`
                                  : 'Submit when all sections are complete.'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleBondApplicationSubmit()
                                }}
                                disabled={bondApplicationSaving || bondApplicationStatus === 'Submitted' || bondApplicationStatus === 'Approved'}
                                className="inline-flex min-h-[42px] items-center rounded-[12px] bg-[#2f5478] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#244463] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                              >
                                {bondApplicationSaving ? 'Submitting...' : bondApplicationStatus === 'Submitted' ? 'Submitted' : 'Submit Application'}
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {activeBondApplicationSectionTab === 'documents' ? (
                          <div className="space-y-3">
                            <p className="text-sm text-[#5f7288]">
                              Bond supporting documents are linked here by type. You can also manage all uploads in{' '}
                              <Link to={getClientPortalPath(token, 'documents')} className="font-semibold text-[#2f5478] underline underline-offset-2">
                                Documents
                              </Link>.
                            </p>
                            <div className="space-y-3">
                              {bondApplicationRequiredDocuments.length ? (
                                bondApplicationRequiredDocuments.map((document) => {
                                  const uploadedDocument = document.uploadedDocumentId
                                    ? portalDocumentsById.get(String(document.uploadedDocumentId))
                                    : null
                                  const source = `${document?.key || ''} ${document?.label || ''}`.toLowerCase()
                                  const documentTypeLabel = source.includes('passport') || source.includes('identity')
                                    ? 'ID / Passport'
                                    : source.includes('income') || source.includes('payslip')
                                      ? 'Proof of income'
                                      : source.includes('address')
                                        ? 'Proof of address'
                                        : source.includes('marriage') || source.includes('anc')
                                          ? 'Marriage docs'
                                          : source.includes('tax')
                                            ? 'Tax docs'
                                            : source.includes('company') || source.includes('trust')
                                              ? 'Company / Trust docs'
                                              : 'Additional supporting docs'
                                  return (
                                    <article key={document.key} className="rounded-[14px] border border-[#e3ebf4] bg-white px-4 py-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <strong className="text-sm font-semibold text-[#142132]">{document.label}</strong>
                                          <p className="text-xs text-[#6b7d93]">{document.description || 'Supporting bond application document.'}</p>
                                          <span className="mt-2 inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-2.5 py-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-[#5f7288]">
                                            {documentTypeLabel}
                                          </span>
                                        </div>
                                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                          document.complete ? 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]' : 'border-[#f1ddd0] bg-[#fff6f0] text-[#a15b31]'
                                        }`}>
                                          {document.complete ? 'Uploaded' : 'Missing'}
                                        </span>
                                      </div>
                                      <div className="mt-3 flex flex-wrap items-center gap-3">
                                        {uploadedDocument?.url ? (
                                          <a
                                            href={uploadedDocument.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                                          >
                                            <Download size={13} />
                                            View latest
                                          </a>
                                        ) : null}
                                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c] hover:border-[#c6d7e7]">
                                          Upload
                                          <input
                                            type="file"
                                            className="hidden"
                                            disabled={uploadingDocumentKey === document.key}
                                            onChange={(event) => {
                                              const file = event.target.files?.[0]
                                              if (file) {
                                                void handleUploadRequiredDocument(document.key, file)
                                              }
                                              event.target.value = ''
                                            }}
                                          />
                                        </label>
                                      </div>
                                    </article>
                                  )
                                })
                              ) : (
                                <article className="rounded-[14px] border border-dashed border-[#d8e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
                                  No bond-specific required documents are configured yet.
                                </article>
                              )}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6edf5] pt-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (previousBondApplicationSectionMeta) {
                                void handleBondApplicationSectionChange(previousBondApplicationSectionMeta.key)
                              }
                            }}
                            disabled={!previousBondApplicationSectionMeta}
                            className="inline-flex min-h-[40px] items-center rounded-[10px] border border-[#d1deeb] bg-white px-3 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Previous section
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void persistBondApplicationDraft()
                              }}
                              disabled={bondApplicationSaving || !bondApplicationDirty}
                              className="inline-flex min-h-[40px] items-center rounded-[10px] border border-[#d1deeb] bg-white px-3 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (nextBondApplicationSectionMeta) {
                                  void handleBondApplicationSectionChange(nextBondApplicationSectionMeta.key)
                                }
                              }}
                              disabled={!nextBondApplicationSectionMeta}
                              className="inline-flex min-h-[40px] items-center rounded-[10px] bg-[#35546c] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                            >
                              Next section
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {activeBondApplicationTab === 'offers' ? (
                  <section className="space-y-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Offers</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                        Your bond originator will upload lender offers here. Select one offer to proceed and upload your signed copy.
                      </p>
                    </div>
                    {bondOfferDocuments.length ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {bondOfferDocuments.map((offer) => {
                          const isAccepted = acceptedBondOfferId && String(offer.id) === acceptedBondOfferId
                          const isDeclined = declinedBondOfferIds.has(String(offer.id))
                          return (
                            <article key={offer.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{offer.bankName}</span>
                                  <strong className="mt-1 block text-sm font-semibold text-[#142132]">{offer.name}</strong>
                                  <p className="mt-1 text-xs text-[#6b7d93]">Uploaded {formatClientPortalDate(offer.uploadedAt, 'Recently')}</p>
                                </div>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em] ${
                                  isAccepted
                                    ? 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]'
                                    : isDeclined
                                      ? 'border-[#f1d8d0] bg-[#fff5f2] text-[#b5472d]'
                                      : 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
                                }`}>
                                  {isAccepted ? 'Accepted' : isDeclined ? 'Declined' : 'Uploaded'}
                                </span>
                              </div>
                              <div className="mt-4 flex flex-wrap items-center gap-2">
                                {offer.downloadUrl ? (
                                  <a
                                    href={offer.downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                                  >
                                    <Download size={13} />
                                    Download
                                  </a>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleAcceptBondOffer(offer)
                                  }}
                                  disabled={bondApplicationSaving || isAccepted}
                                  className="inline-flex items-center rounded-full bg-[#35546c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                                >
                                  {isAccepted ? 'Accepted' : 'Accept offer'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleDeclineBondOffer(offer)
                                  }}
                                  disabled={bondApplicationSaving || isDeclined}
                                  className="inline-flex items-center rounded-full border border-[#f1d8d0] bg-white px-3 py-1.5 text-xs font-semibold text-[#b5472d] transition hover:bg-[#fff5f2] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isDeclined ? 'Declined' : 'Decline offer'}
                                </button>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    ) : (
                      <article className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                        No lender offers uploaded yet. Your bond originator will add offers as they are received.
                      </article>
                    )}

                    <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <h5 className="text-sm font-semibold text-[#142132]">Upload signed accepted offer</h5>
                      <p className="mt-1 text-sm text-[#6b7d93]">
                        {acceptedBondOffer
                          ? `Accepted offer: ${acceptedBondOffer.bankName}. Upload your signed copy once complete.`
                          : 'Accept an offer first, then upload your signed copy here.'}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c] hover:border-[#c6d7e7]">
                          Upload signed offer
                          <input
                            type="file"
                            className="hidden"
                            disabled={!acceptedBondOffer || bondApplicationSaving}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file && acceptedBondOffer) {
                                void handleUploadSignedBondOffer(file, acceptedBondOffer)
                              }
                              event.target.value = ''
                            }}
                          />
                        </label>
                        {signedAcceptedOfferDocument?.url ? (
                          <a
                            href={signedAcceptedOfferDocument.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                          >
                            <Download size={13} />
                            View signed upload
                          </a>
                        ) : null}
                      </div>
                    </article>
                  </section>
                ) : null}

                {activeBondApplicationTab === 'grant' ? (
                  <section className="space-y-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Grant</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                        Final bond grant and instruction documents uploaded by your finance team will appear here.
                      </p>
                    </div>
                    {bondGrantDocuments.length ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {bondGrantDocuments.map((document) => (
                          <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                            <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{extractBondBankName(`${document.category || ''} ${document.name || ''}`)}</span>
                            <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{document.name || 'Bond grant document'}</strong>
                            <p className="mt-1 text-xs text-[#6b7d93]">Uploaded {formatClientPortalDate(document.created_at, 'Recently')}</p>
                            {document.url ? (
                              <a
                                href={document.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                              >
                                <Download size={13} />
                                Download
                              </a>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <article className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                        Grant documents are not uploaded yet.
                      </article>
                    )}
                  </section>
                ) : null}
              </section>
            ) : null}

      {isDocuments ? (
        <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <nav className="inline-flex min-w-full gap-2 rounded-[18px] border border-[#e2eaf3] bg-[#f8fbff] p-2">
              {documentTabs.map((tab) => {
                const isActive = activeDocumentsTabKey === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveDocumentsTab(tab.key)}
                    className={`inline-flex min-h-[44px] min-w-[170px] items-center justify-center rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'border border-[#d1deeb] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                        : 'border border-transparent text-[#5f7086] hover:border-[#d8e4ef] hover:bg-white hover:text-[#142132]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full border border-[#dce6f0] bg-white px-1.5 py-0.5 text-[0.68rem] font-semibold text-[#5f7086]">
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>

          {activeDocumentsTabKey === 'sales' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Sales documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Core sale-stage documents. Complete actions directly on each card.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.sales} items
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {showReservationDepositPopCard ? (
                  <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">Reservation Deposit Proof of Payment</strong>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                          Upload your proof of payment for the reservation deposit so your team can verify it.
                        </p>
                        {reservationPaymentInstructions ? (
                          <p className="mt-2 text-xs leading-5 text-[#6b7d93]">{reservationPaymentInstructions}</p>
                        ) : null}
                        <p className="mt-2 text-xs font-medium text-[#7b8ca2]">Deposit amount: {reservationAmountLabel}</p>
                        {reservationRejectedNote ? (
                          <p className="mt-2 text-xs font-medium text-[#b5472d]">Review note: {reservationRejectedNote}</p>
                        ) : null}
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(reservationProofStatusLabel)}`}>
                        {reservationProofStatusLabel}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                        <FileSignature size={14} />
                        {reservationProofFallbackUploadedDocument?.url ? 'Replace upload' : 'Upload proof'}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingDocumentKey === reservationProofUploadStateKey}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) {
                              if (reservationProofRequirement?.key) {
                                void handleUploadRequiredDocument(reservationProofRequirement.key, file)
                              } else {
                                void handleUploadReservationDepositProof(file)
                              }
                            }
                            event.target.value = ''
                          }}
                        />
                      </label>
                      {reservationProofFallbackUploadedDocument?.url ? (
                        <a
                          href={reservationProofFallbackUploadedDocument.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                        >
                          <Download size={14} />
                          View upload
                        </a>
                      ) : null}
                    </div>
                  </article>
                ) : null}

                <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <strong className="block text-sm font-semibold text-[#142132]">Offer to Purchase (OTP)</strong>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                        Review the latest OTP, then upload your signed copy on this card.
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(otpStatusLabel)}`}>
                      {otpStatusLabel}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {otpPrimarySharedDocument?.url ? (
                      <a
                        href={otpPrimarySharedDocument.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                      >
                        <Download size={14} />
                        Download OTP
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#8ba0b8]"
                      >
                        <Download size={14} />
                        OTP not available
                      </button>
                    )}
                    {otpPrimaryRequirement?.key ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                        <FileSignature size={14} />
                        {otpUploadedDocument?.url ? 'Replace signed OTP' : 'Upload Signed OTP'}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingDocumentKey === otpPrimaryRequirement.key}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) {
                              void handleUploadRequiredDocument(otpPrimaryRequirement.key, file)
                            }
                            event.target.value = ''
                          }}
                        />
                      </label>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#8ba0b8]"
                      >
                        <FileSignature size={14} />
                        Awaiting signature request
                      </button>
                    )}
                    {otpUploadedDocument?.url ? (
                      <a
                        href={otpUploadedDocument.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                      >
                        <Download size={14} />
                        View signed upload
                      </a>
                    ) : null}
                  </div>
                </article>

                {salesOtherRequiredDocuments.map((document) => {
                  const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
                  const statusLabel = document.complete ? 'Uploaded' : 'Not uploaded'
                  return (
                    <article key={document.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{document.label || 'Sales document'}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Complete this document to proceed with the transaction.'}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                          <FileSignature size={14} />
                          {uploadedDocument?.url ? 'Replace upload' : 'Upload'}
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploadingDocumentKey === document.key}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file) {
                                void handleUploadRequiredDocument(document.key, file)
                              }
                              event.target.value = ''
                            }}
                          />
                        </label>
                        {uploadedDocument?.url ? (
                          <a
                            href={uploadedDocument.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          >
                            <Download size={14} />
                            View upload
                          </a>
                        ) : null}
                      </div>
                    </article>
                  )
                })}

                {salesOtherSharedDocuments.map((document) => (
                  <article
                    key={document.id}
                    className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Shared sales document'}</strong>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Shared by your deal team.'}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses('Uploaded')}`}>
                        Uploaded
                      </span>
                    </div>
                    {document.url ? (
                      <div className="mt-4">
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                        >
                          <Download size={14} />
                          Download
                        </a>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              {!showReservationDepositPopCard && !otpPrimaryRequirement && !otpPrimarySharedDocument && !salesOtherRequiredDocuments.length && !salesOtherSharedDocuments.length ? (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No sales documents are available yet.
                </div>
              ) : null}
            </section>
          ) : null}

          {activeDocumentsTabKey === 'fica' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">FICA documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Required documents are generated from your purchaser profile and transaction setup.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.fica} requirements
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {resolvedFicaRequirements.map((requirement) => {
                  const statusLabel = requirement.statusLabel || 'Missing'
                  const uploadDocument = requirement.matchedRequirementDoc || null
                  return (
                    <article
                      key={requirement.key}
                      className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{requirement.label}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{requirement.description}</p>
                          <span className="mt-2 inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#6d8197]">
                            {requirement.required ? 'Required' : 'Optional'}
                          </span>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {uploadDocument?.key ? (
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                            <FileSignature size={14} />
                            {requirement.uploadedDocument?.url ? 'Replace upload' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocumentKey === uploadDocument.key}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) {
                                  void handleUploadRequiredDocument(uploadDocument.key, file)
                                }
                                event.target.value = ''
                              }}
                            />
                          </label>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#8ba0b8]"
                          >
                            <FileSignature size={14} />
                            Awaiting request
                          </button>
                        )}
                        {requirement.uploadedDocument?.url ? (
                          <a
                            href={requirement.uploadedDocument.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          >
                            <Download size={14} />
                            View upload
                          </a>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {activeDocumentsTabKey === 'bond' ? (
            <section className="space-y-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Bond documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Bond-related supporting documents and lender offers for this transaction.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.bond} items
                </span>
              </div>

              <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h5 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6d8197]">Supporting Documentation</h5>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.68rem] font-semibold text-[#6d8197]">
                    {bondRequiredDocuments.length + bondSupportingSharedDocuments.length}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {bondRequiredDocuments.map((document) => {
                    const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
                    const statusLabel = document.complete ? 'Uploaded' : 'Pending'
                    const requestedByLabel = getRequestedByLabel(
                      document.requested_by_role || document.requestedByRole || document.assigned_to_role || 'bond_originator',
                    )
                    return (
                      <article key={document.key} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{document.label || 'Bond supporting document'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Supporting document for bond processing.'}</p>
                            <p className="mt-2 text-xs font-medium text-[#7b8ca2]">Requested by: {document.requested_by_name || requestedByLabel}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7]">
                            <FileSignature size={13} />
                            {uploadedDocument?.url ? 'Replace upload' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocumentKey === document.key}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) {
                                  void handleUploadRequiredDocument(document.key, file)
                                }
                                event.target.value = ''
                              }}
                            />
                          </label>
                          {uploadedDocument?.url ? (
                            <a
                              href={uploadedDocument.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                            >
                              <Download size={13} />
                              View upload
                            </a>
                          ) : null}
                        </div>
                      </article>
                    )
                  })}

                  {bondSupportingSharedDocuments.map((document) => (
                    <article key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Supporting document'}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Uploaded by your finance team.'}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses('Uploaded')}`}>
                          Uploaded
                        </span>
                      </div>
                      {document.url ? (
                        <div className="mt-3">
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                          >
                            <Download size={13} />
                            Download
                          </a>
                        </div>
                      ) : null}
                    </article>
                  ))}

                  {!bondRequiredDocuments.length && !bondSupportingSharedDocuments.length ? (
                    <article className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-4 text-sm text-[#6b7d93]">
                      No bond supporting documents are active right now.
                    </article>
                  ) : null}
                </div>
              </article>

              <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h5 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6d8197]">Bond Offers</h5>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.68rem] font-semibold text-[#6d8197]">
                    {bondOfferDocuments.length + bondGrantDocuments.length}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {bondOfferDocuments.map((offer) => {
                    const isAccepted = acceptedBondOfferId && String(offer.id) === acceptedBondOfferId
                    const isDeclined = declinedBondOfferIds.has(String(offer.id))
                    return (
                      <article key={offer.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <span className="text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{offer.bankName}</span>
                            <strong className="mt-1 block text-sm font-semibold text-[#142132]">{offer.name}</strong>
                            <p className="mt-1 text-xs text-[#6b7d93]">Uploaded {formatClientPortalDate(offer.uploadedAt, 'Recently')}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(
                            isAccepted ? 'Approved' : isDeclined ? 'Rejected' : 'Uploaded',
                          )}`}>
                            {isAccepted ? 'Accepted' : isDeclined ? 'Declined' : 'Uploaded'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {offer.downloadUrl ? (
                            <a
                              href={offer.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                            >
                              <Download size={13} />
                              View offer
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              void handleAcceptBondOffer(offer)
                            }}
                            disabled={bondApplicationSaving || isAccepted}
                            className="inline-flex items-center rounded-full bg-[#35546c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                          >
                            {isAccepted ? 'Accepted' : 'Accept offer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleDeclineBondOffer(offer)
                            }}
                            disabled={bondApplicationSaving || isDeclined}
                            className="inline-flex items-center rounded-full border border-[#f1d8d0] bg-white px-3 py-1.5 text-xs font-semibold text-[#b5472d] transition hover:bg-[#fff5f2] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isDeclined ? 'Declined' : 'Decline offer'}
                          </button>
                        </div>
                      </article>
                    )
                  })}

                  <article className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                    <strong className="block text-sm font-semibold text-[#142132]">Signed accepted offer</strong>
                    <p className="mt-1 text-sm text-[#6b7d93]">
                      {acceptedBondOffer
                        ? `Accepted offer: ${acceptedBondOffer.bankName}. Upload your signed copy once complete.`
                        : 'Accept an offer first, then upload your signed copy here.'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                        Upload signed offer
                        <input
                          type="file"
                          className="hidden"
                          disabled={!acceptedBondOffer || bondApplicationSaving}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file && acceptedBondOffer) {
                              void handleUploadSignedBondOffer(file, acceptedBondOffer)
                            }
                            event.target.value = ''
                          }}
                        />
                      </label>
                      {signedAcceptedOfferDocument?.url ? (
                        <a
                          href={signedAcceptedOfferDocument.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                        >
                          <Download size={13} />
                          View signed upload
                        </a>
                      ) : null}
                    </div>
                  </article>

                  {bondGrantDocuments.map((document) => (
                    <article key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                      <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Bond grant document'}</strong>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Final approval document shared by your finance team.'}</p>
                      {document.url ? (
                        <div className="mt-3">
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                          >
                            <Download size={13} />
                            Download
                          </a>
                        </div>
                      ) : null}
                    </article>
                  ))}

                  {!bondOfferDocuments.length && !bondGrantDocuments.length ? (
                    <article className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-4 text-sm text-[#6b7d93]">
                      No bond offers have been shared yet.
                    </article>
                  ) : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeDocumentsTabKey === 'additional' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Additional requests</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Ad hoc documents requested by attorneys, bond originators, or your team.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.additional} items
                </span>
              </div>
              {additionalRequestDocuments.length || additionalSharedDocuments.length ? (
                <div className="mt-4 space-y-3">
                  {additionalRequestDocuments.map((document) => {
                    const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
                    const statusLabel = document.complete ? 'Uploaded' : 'Pending'
                    const requestedByLabel = getRequestedByLabel(
                      document.requested_by_role || document.requestedByRole || document.assigned_to_role,
                    )
                    return (
                      <article key={document.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{document.label || 'Additional request'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Your team requested an additional supporting document.'}</p>
                            <p className="mt-2 text-xs font-medium text-[#7b8ca2]">Requested by: {document.requested_by_name || requestedByLabel}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
                            <FileSignature size={14} />
                            {uploadedDocument?.url ? 'Replace upload' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocumentKey === document.key}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) {
                                  void handleUploadRequiredDocument(document.key, file)
                                }
                                event.target.value = ''
                              }}
                            />
                          </label>
                          {uploadedDocument?.url ? (
                            <a
                              href={uploadedDocument.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              View upload
                            </a>
                          ) : null}
                        </div>
                      </article>
                    )
                  })}
                  {additionalSharedDocuments.map((document) => (
                    <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Additional request document'}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Shared by your transaction team.'}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses('Uploaded')}`}>
                          Uploaded
                        </span>
                      </div>
                      {document.url ? (
                        <div className="mt-4">
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          >
                            <Download size={14} />
                            Download
                          </a>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No additional document requests are active right now.
                </div>
              )}
            </section>
          ) : null}

          {activeDocumentsTabKey === 'property' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Property documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Reference documents for the property and supporting transfer records.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {documentTabCountByKey.property} documents
                </span>
              </div>
              {propertySharedDocuments.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {propertySharedDocuments.map((document) => (
                    <article
                      key={document.id}
                      className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4"
                    >
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{document.category || 'Property'}</span>
                      <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{document.name || 'Property document'}</strong>
                      {document.url ? (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                        >
                          <Download size={14} />
                          View / Download
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No property documents have been shared yet.
                </div>
              )}
            </section>
          ) : null}
        </section>
      ) : null}

      <Sheet open={documentPanel.open} onOpenChange={(open) => setDocumentPanel((previous) => ({ ...previous, open, item: open ? previous.item : null }))}>
        <SheetContent side="right" className="overflow-y-auto border-[#dbe5ef] bg-white p-0">
          {activeDocumentPanel ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-[#e5edf5] px-6 pb-4 pt-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                    {activeDocumentPanel.section}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                    {activeDocumentPanel.statusLabel}
                  </span>
                </div>
                <SheetTitle className="text-[1.5rem] tracking-[-0.04em] text-[#142132]">{activeDocumentPanel.title}</SheetTitle>
                <SheetDescription className="text-sm leading-7 text-[#6b7d93]">{activeDocumentPanel.description}</SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-5 px-6 py-6">
                {activeDocumentPanel.dateLabel ? (
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Uploaded</span>
                    <strong className="mt-2 block text-sm font-semibold text-[#142132]">{activeDocumentPanel.dateLabel}</strong>
                  </div>
                ) : null}

                {activeDocumentPanel.downloadUrl ? (
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Download</span>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Open or download the latest document shared on this transaction.</p>
                    <a
                      href={activeDocumentPanel.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                    >
                      <Download size={14} />
                      {activeDocumentPanel.downloadLabel || 'Download document'}
                    </a>
                  </div>
                ) : null}

                {activeDocumentPanel.kind === 'required' ? (
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Upload</span>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Upload the latest version of this requested document for your team to review.</p>
                    {activeDocumentPanel.uploadedDocument?.url ? (
                      <a
                        href={activeDocumentPanel.uploadedDocument.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                      >
                        <Download size={14} />
                        View latest upload
                      </a>
                    ) : null}
                    <label className="mt-4 block">
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">{activeDocumentPanel.uploadLabel || 'Upload document'}</span>
                      <input
                        type="file"
                        disabled={saving || uploadingDocumentKey === activeDocumentPanel.documentKey}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file && activeDocumentPanel.documentKey) {
                            void handleUploadRequiredDocument(activeDocumentPanel.documentKey, file)
                          }
                          event.target.value = ''
                        }}
                        className="mt-2 block w-full text-sm text-[#64748b] file:mr-3 file:rounded-full file:border-0 file:bg-[#e9f1f8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#35546c]"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {isHandover ? (
        <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <article className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">About handover</span>
            <h3 className="mt-3 text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Final readiness before key collection</h3>
            <p className="mt-2 text-sm leading-7 text-[#5f7288]">
              Handover is the final step where the property is officially ready for you to take possession. This checklist shows
              what still needs to be completed, who is responsible, and how close your file is to completion.
            </p>
          </article>

          <article className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Handover status</span>
                <strong className="mt-3 block text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{handoverReadinessStatus}</strong>
                <p className="mt-2 text-sm leading-7 text-[#5f7288]">{handoverReadinessSummary}</p>
              </div>
              <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold ${handoverReadinessStatusClasses}`}>
                {handoverReadinessStatus}
              </span>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#e6edf4]">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${handoverChecklistProgressPercent}%`, backgroundImage: 'linear-gradient(90deg,#3d78b0_0%,#2f8a64_100%)' }}
              />
            </div>
            <p className="mt-3 text-sm font-medium text-[#5f7288]">
              {handoverChecklistCompletedCount} of {handoverChecklistTotalCount} items completed
            </p>
          </article>

          <div className="space-y-4">
            {handoverChecklistSections.map((section) => (
              <section key={section.key} className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{section.title}</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{section.description}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                    {section.completedCount} / {section.totalCount} complete
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf3f8]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#3d78b0_0%,#2f8a64_100%)]"
                    style={{ width: `${section.totalCount ? Math.round((section.completedCount / section.totalCount) * 100) : 0}%` }}
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {section.items.map((item) => {
                    const statusMeta = getChecklistProgressMeta(item.status)
                    return (
                      <article key={item.key} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{item.title}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item.description}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                            Responsible: {item.responsible}
                          </span>
                          {item.dueDate ? (
                            <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                              Due: {item.dueDate}
                            </span>
                          ) : null}
                          <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                            Updated {stageUpdatedDateLabel}
                          </span>
                        </div>
                        {item.actionTo && item.status !== 'complete' ? (
                          <div className="mt-4">
                            <Link
                              to={getClientPortalPath(token, item.actionTo)}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              {item.actionLabel || 'Open'}
                            </Link>
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {isSnags ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Snags</h3>
              <p>Log practical completion items, attach supporting photos, and track how your team is progressing each fix.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Logged snags', portal.issues.length],
              ['Open items', snagOpenCount],
              ['Resolved', snagResolvedCount],
            ].map(([label, value]) => (
              <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                <span className="block text-[0.74rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Log a new snag</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Add the room, explain the issue clearly, and upload a supporting image if you have one.</p>
                </div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#dde7f1] bg-[#f8fbff] text-[#35546c]">
                  <AlertTriangle size={18} />
                </span>
              </div>

              <form className="mt-5 space-y-4" onSubmit={handleSubmitIssue}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="block text-sm font-semibold text-[#142132]">Category</span>
                    <select
                      value={issueForm.category}
                      onChange={(event) => setIssueForm((prev) => ({ ...prev, category: event.target.value }))}
                      className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                    >
                      {ISSUE_CATEGORIES.map((category) => (
                        <option value={category} key={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-sm font-semibold text-[#142132]">Priority</span>
                    <select
                      value={issueForm.priority}
                      onChange={(event) => setIssueForm((prev) => ({ ...prev, priority: event.target.value }))}
                      className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                    >
                      <option value="">Select priority</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="block text-sm font-semibold text-[#142132]">Location / Area</span>
                  <input
                    type="text"
                    value={issueForm.location}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, location: event.target.value }))}
                    placeholder="Kitchen, Bedroom 2, Balcony..."
                    className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-semibold text-[#142132]">Description</span>
                  <textarea
                    value={issueForm.description}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Describe the issue clearly"
                    required
                    rows={5}
                    className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm leading-7 text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                  />
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">Upload photo (optional)</span>
                  <input
                    type="file"
                    name="photo"
                    accept="image/*"
                    className="mt-2 block w-full text-sm text-[#64748b] file:mr-3 file:rounded-full file:border-0 file:bg-[#e9f1f8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#35546c]"
                  />
                </label>

                <div className="flex justify-end">
                  <button type="submit" disabled={saving || !issueForm.description.trim()}>
                    Submit Snag
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Snag register</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Every snag raised on this unit, with the latest internal status against each item.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {portal.issues.length} items
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {portal.issues.map((item) => (
                  <article key={item.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-base font-semibold text-[#142132]">{item.category}</strong>
                          <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                            {item.priority || 'Normal priority'}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-[#324559]">{item.description}</p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                        {toTitleLabel(item.status || 'Open')}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Location</span>
                        <strong className="mt-2 block text-sm font-semibold text-[#142132]">{item.location || 'Location not provided'}</strong>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Logged</span>
                        <strong className="mt-2 block text-sm font-semibold text-[#142132]">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recently'}
                        </strong>
                      </div>
                    </div>

                    {item.photo_url ? (
                      <a
                        href={item.photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                      >
                        <Download size={14} />
                        View uploaded photo
                      </a>
                    ) : null}
                  </article>
                ))}

                {!portal.issues.length ? (
                  <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">
                    No snags have been submitted yet.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {isSettings ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-[1.3rem] font-semibold tracking-[-0.03em] text-[#142132]">Settings</h3>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                The client workspace stays intentionally light. These settings show which support features are active on your transaction and how the team will communicate with you.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dde7f1] bg-[#fbfdff] px-4 py-2 text-sm font-semibold text-[#64748b]">
              <Settings size={16} />
              Client preferences
            </span>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Workspace configuration</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Snag reporting', portal?.settings?.snag_reporting_enabled ? 'Enabled' : 'Not active'],
                  ['Alteration requests', portal?.settings?.alteration_requests_enabled ? 'Enabled' : 'Not active'],
                  ['Service reviews', portal?.settings?.service_reviews_enabled ? 'Enabled' : 'Not active'],
                  ['Document uploads', 'Always available when requested'],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-3 block text-sm font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Support notes</h4>
              <div className="mt-4 space-y-3">
                {[
                  'Use Comments & Updates on the progress page when you want your team to respond inside the shared transaction record.',
                  'Document upload requests will appear automatically in your document workspace as different role players ask for additional items.',
                  'Handover scheduling and warranty information will only appear once your transaction is close enough to occupation or transfer.',
                ].map((note) => (
                  <article key={note} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4 text-sm leading-6 text-[#5a6b80]">
                    {note}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {isTeam ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-[1.3rem] font-semibold tracking-[-0.03em] text-[#142132]">Team</h3>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                The people and firms currently supporting your transaction across sales, legal transfer, finance, and operational coordination.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dde7f1] bg-[#fbfdff] px-4 py-2 text-sm font-semibold text-[#64748b]">
              <Users size={16} />
              {teamMembers.length} team contacts
            </span>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {teamMembers.map((member) => (
              <article key={member.title} className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">{member.title}</span>
                    <h4 className="mt-3 text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">{member.name}</h4>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{member.detail}</p>
                  </div>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dde7f1] bg-white text-[#35546c]">
                    <Users size={18} />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isAlterations ? (
        <section className="client-portal-card">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Alteration Requests</h3>
              <p>Submit controlled changes for developer review and formal response.</p>
            </div>
          </div>

          <form className="stack-form client-form" onSubmit={handleSubmitAlteration}>
            <label>
              Request Title
              <input
                type="text"
                value={alterationForm.title}
                onChange={(event) => setAlterationForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>

            <label>
              Category
              <input
                type="text"
                value={alterationForm.category}
                onChange={(event) => setAlterationForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Kitchen, Lighting, Flooring..."
              />
            </label>

            <label>
              Description
              <textarea
                value={alterationForm.description}
                onChange={(event) => setAlterationForm((prev) => ({ ...prev, description: event.target.value }))}
                required
              />
            </label>

            <div className="client-two-col">
              <label>
                Budget Range (optional)
                <input
                  type="text"
                  value={alterationForm.budgetRange}
                  onChange={(event) => setAlterationForm((prev) => ({ ...prev, budgetRange: event.target.value }))}
                  placeholder="R 10,000 - R 15,000"
                />
              </label>

              <label>
                Preferred Timing (optional)
                <input
                  type="text"
                  value={alterationForm.preferredTiming}
                  onChange={(event) => setAlterationForm((prev) => ({ ...prev, preferredTiming: event.target.value }))}
                  placeholder="Before occupancy"
                />
              </label>
            </div>

            <label>
              Reference image (optional)
              <input type="file" name="referenceImage" accept="image/*" />
            </label>

            <button className="client-primary-btn" type="submit" disabled={saving || !alterationForm.title.trim() || !alterationForm.description.trim()}>
              Submit Request
            </button>
          </form>

          <ul className="request-list">
            {portal.alterations.map((item) => (
              <li key={item.id} className="request-row">
                <div className="request-main">
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <span>
                    {item.category || 'General'} • {item.budget_range || 'No budget supplied'} •{' '}
                    {item.preferred_timing || 'No timing supplied'}
                  </span>
                  {item.reference_image_url ? (
                    <a href={item.reference_image_url} target="_blank" rel="noreferrer" className="inline-link">
                      View reference image
                    </a>
                  ) : null}
                </div>
                <span className="status-pill">{item.status}</span>
              </li>
            ))}
            {!portal.alterations.length ? <li className="empty-text">No alteration requests submitted yet.</li> : null}
          </ul>
        </section>
      ) : null}

      {isReview ? (
        <section className="client-portal-card">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Service Review</h3>
              <p>Share your experience once your transaction reaches final completion stages.</p>
            </div>
          </div>

          {portal.featureAvailability.review ? (
            <form className="stack-form client-form" onSubmit={handleSubmitReview}>
              <label>
                Rating
                <select value={reviewForm.rating} onChange={(event) => setReviewForm((prev) => ({ ...prev, rating: Number(event.target.value) }))}>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option value={rating} key={rating}>
                      {rating} Star{rating > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Review
                <textarea
                  value={reviewForm.reviewText}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, reviewText: event.target.value }))}
                  placeholder="How was your overall experience?"
                />
              </label>

              <label>
                What went well
                <textarea
                  value={reviewForm.positives}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, positives: event.target.value }))}
                />
              </label>

              <label>
                What could be improved
                <textarea
                  value={reviewForm.improvements}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, improvements: event.target.value }))}
                />
              </label>

              <label className="upload-client-visible-toggle">
                <input
                  type="checkbox"
                  checked={reviewForm.allowMarketingUse}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, allowMarketingUse: event.target.checked }))}
                />
                Allow testimonial/marketing use of this review
              </label>

              <button className="client-primary-btn" type="submit" disabled={saving}>
                Submit Review
              </button>
            </form>
          ) : (
            <p className="status-message">Reviews open once your transaction reaches registration/handover stage.</p>
          )}

          <ul className="request-list">
            {portal.reviews.map((item) => (
              <li key={item.id} className="review-row">
                <div className="review-rating">{'★'.repeat(item.rating)}{'☆'.repeat(Math.max(0, 5 - item.rating))}</div>
                <p>{item.review_text || 'No review text submitted.'}</p>
                <span>
                  Positives: {item.positives || '-'}
                  <br />
                  Improvements: {item.improvements || '-'}
                </span>
                <small>{new Date(item.created_at).toLocaleDateString()}</small>
              </li>
            ))}
            {!portal.reviews.length ? <li className="empty-text">No reviews submitted yet.</li> : null}
          </ul>
        </section>
      ) : null}

          </div>

        </div>
      </div>
    </main>
  )
}

export default ClientPortal
