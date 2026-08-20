import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Download,
  EyeOff,
  FileText,
  FolderKanban,
  HandCoins,
  Home,
  ImagePlus,
  Mail,
  LandPlot,
  MapPin,
  MoreVertical,
  PencilLine,
  PieChart,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Upload,
  UserPlus,
  Users,
  WalletCards,
  Workflow,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import DevelopmentAttorneyCommercialSetup from '../components/DevelopmentAttorneyCommercialSetup'
import DevelopmentBondCommercialSetup from '../components/DevelopmentBondCommercialSetup'
import Button from '../components/ui/Button'
import Drawer from '../components/ui/Drawer'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { useWorkspace } from '../context/WorkspaceContext'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import {
  DEVELOPER_FUNNEL_STAGES,
  selectActiveTransactions,
  selectBottlenecks,
  selectDealBottleneckSummary,
  selectFinanceMix,
  selectDevelopmentPerformance,
  selectPortfolioMetrics,
  selectStageDistribution,
} from '../core/transactions/developerSelectors'
import { getReportNextAction } from '../core/transactions/reportNextAction'
import { resolveTransactionWorkspaceRoute } from '../core/transactions/transactionWorkspaceRouting'
import {
  deleteDevelopment,
  deleteDevelopmentDocument,
  fetchDevelopmentDetail,
  fetchDevelopmentDocumentRequirements,
  saveDevelopmentDetails,
  saveDevelopmentDocument,
  saveDevelopmentFinancials,
  saveDevelopmentUnit,
  uploadDevelopmentDocumentAsset,
  updateDevelopmentTransactionSalesPrice,
  updateTransactionLifecycleStage,
  updateDevelopmentSettings,
  upsertTransactionHandover,
} from '../lib/api'
import { fetchOrganisationSettings, listOrganisationUsers, normalizeOrganisationDeveloperProfile } from '../lib/settingsApi'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { listDeveloperLeadIntake } from '../services/developerLeadService'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const currencyWithCents = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const DEVELOPMENT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'units', label: 'Units' },
  { id: 'leads', label: 'Leads' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'performance', label: 'Performance' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'configuration', label: 'Configuration' },
]

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'logo', label: 'Development Logo' },
  { value: 'floorplan', label: 'Floorplan' },
  { value: 'video', label: 'Video' },
  { value: 'virtual_tour', label: 'Virtual Tour' },
  { value: 'pricing', label: 'Pricing / Sales' },
  { value: 'marketing', label: 'Marketing Asset' },
  { value: 'site_plan', label: 'Site Plan' },
  { value: 'legal', label: 'Development Legal / Compliance' },
  { value: 'specification', label: 'Specification / Finishes' },
  { value: 'other', label: 'Other' },
]

const DEFAULT_SELLER_DETAILS_FORM = {
  mode: 'custom',
  entityType: 'company',
  legalName: '',
  tradingName: '',
  registrationNumber: '',
  vatNumber: '',
  registeredAddress: '',
  postalAddress: '',
  email: '',
  phone: '',
  vatTreatment: '',
  notes: '',
  signatories: [
    {
      fullName: '',
      role: '',
      idNumber: '',
      email: '',
      phone: '',
      signingCapacity: '',
    },
  ],
}

const DEFAULT_DETAILS_FORM = {
  name: '',
  code: '',
  location: '',
  suburb: '',
  city: '',
  province: '',
  country: 'South Africa',
  address: '',
  status: 'active',
  developerCompany: '',
  totalUnitsExpected: 0,
  launchDate: '',
  expectedCompletionDate: '',
  description: '',
  marketing: {
    listingOverview: {
      listingTitle: '',
      listingHeading: '',
      ownershipType: 'sectional_title',
      locationLabel: '',
      address: '',
      suburb: '',
      city: '',
      province: '',
      priceRange: '',
      listingStatus: 'draft',
      listingDescription: '',
      developmentChecklist: false,
      fibreReady: false,
      borehole: false,
      backupBatteryInverter: false,
      gasGeyser: false,
      solarGeyser: false,
      solarPanels: false,
      waterTanks: false,
      petsAllowed: false,
      notes: '',
      seoTitle: '',
      seoMetaDescription: '',
    },
    floorplans: [],
    agencies: [],
    sellingPoints: {
      items: '',
    },
    keySellingPoints: {
      keyHighlights: '',
      lifestyleSellingPoints: '',
      buyerAppealNotes: '',
      nearbyAmenitiesSummary: '',
      securityEstateFeatures: '',
      whyThisDevelopment: '',
    },
    mediaLibrary: {
      heroImageUrl: '',
      galleryImageUrls: '',
      developmentLogoUrl: '',
      sitePlanUrl: '',
      masterplanUrl: '',
      floorplanUrls: '',
      videoUrl: '',
      virtualTourUrl: '',
    },
    downloads: {
      brochureUrl: '',
      pricingSheetUrl: '',
      specSheetUrl: '',
      salesPackUrl: '',
      investmentPackUrl: '',
      termsPdfUrl: '',
      applicationFormUrl: '',
    },
    externalLinks: {
      developmentLandingPageUrl: '',
      googleMapsUrl: '',
      externalWebsiteUrl: '',
      salesPortalUrl: '',
      whatsappEnquiryUrl: '',
      bookingViewingUrl: '',
    },
    listingConfiguration: {
      showOnListingWebsite: false,
      featuredDevelopment: false,
      displayOrder: '',
      listingSlug: '',
      ctaLabel: '',
      ctaUrl: '',
      marketingStatus: 'draft',
      publicVisibility: false,
    },
  },
  handoverEnabled: true,
  snagTrackingEnabled: true,
  alterationsEnabled: false,
  onboardingEnabled: true,
  sellerDetails: DEFAULT_SELLER_DETAILS_FORM,
}

const DEVELOPMENT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

const MARKETING_LISTING_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'coming_soon', label: 'Coming Soon' },
  { value: 'active', label: 'Active' },
  { value: 'sold_out', label: 'Sold Out' },
]

const MARKETING_OWNERSHIP_TYPE_OPTIONS = [
  { value: 'freehold', label: 'Freehold' },
  { value: 'sectional_title', label: 'Sectional Title' },
  { value: 'estate', label: 'Estate' },
]

const MARKETING_PUBLISH_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'live', label: 'Live' },
]

const MARKETING_UNIT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'media', label: 'Media' },
  { id: 'floorplans', label: 'Floorplans' },
  { id: 'documents', label: 'Documents' },
  { id: 'seo', label: 'SEO & Links' },
]

const RESERVATION_VAT_TREATMENT_OPTIONS = [
  { value: 'including_vat', label: 'Including VAT', summaryLabel: 'incl. VAT' },
  { value: 'excluding_vat', label: 'Excluding VAT', summaryLabel: 'excl. VAT' },
]

const RESERVATION_DUE_TRIGGER_OPTIONS = [
  { value: 'on_reservation', label: 'On reservation', summaryLabel: 'after reserving a unit' },
]

const DEFAULT_FINANCIALS_FORM = {
  landCost: '',
  buildCost: '',
  professionalFees: '',
  marketingCost: '',
  infrastructureCost: '',
  otherCosts: '',
  totalProjectedCost: '',
  projectedGrossSalesValue: '',
  projectedProfit: '',
  targetMargin: '',
  notes: '',
}

const DEFAULT_UNIT_FORM = {
  id: '',
  unitNumber: '',
  unitLabel: '',
  phase: '',
  block: '',
  unitType: '',
  bedrooms: '',
  bathrooms: '',
  parkingCount: '',
  sizeSqm: '',
  listPrice: '',
  currentPrice: '',
  status: 'Available',
  vatApplicable: '',
  floorplanId: '',
  notes: '',
}

const DEFAULT_BULK_UNIT_FORM = {
  step: 'breakdown',
  breakdownMode: 'individual',
  count: '',
  startNumber: '',
  prefix: '',
  padding: '0',
  individualUnitNumbers: '',
  blockCount: '1',
  unitsPerBlock: '',
  blockLabels: 'A',
  blockStartNumber: '1',
  blockPrefixMode: 'block',
  blockCustomPrefix: '',
  phaseMode: 'single',
  phaseNames: 'Phase 1',
  phase: '',
  block: '',
  unitType: '',
  listPrice: '',
  status: 'Available',
  vatApplicable: '',
  notes: '',
  unitOptions: {
    oneBed: { enabled: true, label: '1 Bed', unitType: '1 Bed', bedrooms: '1', listPrice: '' },
    twoBed: { enabled: true, label: '2 Bed', unitType: '2 Bed', bedrooms: '2', listPrice: '' },
    threeBed: { enabled: false, label: '3 Bed', unitType: '3 Bed', bedrooms: '3', listPrice: '' },
  },
  generatedRows: [],
}

const BULK_UNIT_STEPS = [
  { id: 'breakdown', label: 'Unit Breakdown' },
  { id: 'numbering', label: 'Unit Numbers' },
  { id: 'options', label: 'Unit Options' },
  { id: 'phases', label: 'Building Phases' },
  { id: 'review', label: 'Review & Edit' },
]

function splitBulkTextList(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getAlphabeticLabel(index) {
  let value = Math.max(0, Number(index) || 0)
  let label = ''
  do {
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26) - 1
  } while (value >= 0)
  return label
}

function getBulkBlockLabels(form = {}) {
  const blockCount = Math.max(1, Math.trunc(Number(form.blockCount || 1)))
  const providedLabels = splitBulkTextList(form.blockLabels)
  return Array.from({ length: blockCount }, (_, index) => providedLabels[index] || getAlphabeticLabel(index))
}

function getBulkUnitTemplates(form = {}) {
  const configuredOptions = form.unitOptions || DEFAULT_BULK_UNIT_FORM.unitOptions
  const templates = Object.values(configuredOptions)
    .filter((option) => option?.enabled)
    .map((option) => ({
      unitType: String(option.unitType || option.label || '').trim(),
      bedrooms: String(option.bedrooms || '').trim(),
      listPrice: option.listPrice === '' ? form.listPrice || '' : option.listPrice,
    }))

  if (templates.length) {
    return templates
  }

  return [
    {
      unitType: String(form.unitType || '').trim(),
      bedrooms: '',
      listPrice: form.listPrice || '',
    },
  ]
}

function getBulkPhaseNames(form = {}) {
  if (form.phaseMode !== 'staged') {
    return [String(form.phase || '').trim()].filter(Boolean)
  }
  return splitBulkTextList(form.phaseNames)
}

function resolveBulkPhaseForRow(form = {}, rowIndex = 0, totalRows = 0) {
  const phases = getBulkPhaseNames(form)
  if (!phases.length) return ''
  if (phases.length === 1) return phases[0]

  const rowsPerPhase = Math.max(1, Math.ceil(totalRows / phases.length))
  return phases[Math.min(phases.length - 1, Math.floor(rowIndex / rowsPerPhase))] || ''
}

function buildBulkUnitRows(form = {}) {
  const templates = getBulkUnitTemplates(form)
  const padding = Math.max(0, Math.trunc(Number(form.padding || 0)))
  const rows = []

  if (form.breakdownMode === 'blocks') {
    const labels = getBulkBlockLabels(form)
    const unitsPerBlock = Math.max(0, Math.trunc(Number(form.unitsPerBlock || 0)))
    const startNumber = Math.max(1, Math.trunc(Number(form.blockStartNumber || form.startNumber || 1)))
    let plainSequence = startNumber

    labels.forEach((blockLabel) => {
      for (let unitIndex = 0; unitIndex < unitsPerBlock; unitIndex += 1) {
        const sequenceNumber = form.blockPrefixMode === 'block' ? startNumber + unitIndex : plainSequence
        const padded = String(sequenceNumber).padStart(padding, '0')
        const unitNumber =
          form.blockPrefixMode === 'block'
            ? `${blockLabel}${padded}`
            : form.blockPrefixMode === 'custom'
              ? `${form.blockCustomPrefix || ''}${padded}`
              : padded
        const template = templates[rows.length % templates.length] || templates[0]
        rows.push({
          unitNumber,
          unitLabel: unitNumber,
          phase: '',
          block: blockLabel,
          unitType: template.unitType,
          bedrooms: template.bedrooms,
          listPrice: template.listPrice === '' ? 0 : template.listPrice,
          status: form.status || 'Available',
          vatApplicable: form.vatApplicable,
          notes: form.notes || '',
        })
        plainSequence += 1
      }
    })
  } else {
    const numbers = splitBulkTextList(form.individualUnitNumbers)
    numbers.forEach((unitNumber, index) => {
      const template = templates[index % templates.length] || templates[0]
      rows.push({
        unitNumber,
        unitLabel: unitNumber,
        phase: '',
        block: form.block || '',
        unitType: template.unitType,
        bedrooms: template.bedrooms,
        listPrice: template.listPrice === '' ? 0 : template.listPrice,
        status: form.status || 'Available',
        vatApplicable: form.vatApplicable,
        notes: form.notes || '',
      })
    })
  }

  return rows.map((row, index) => ({
    ...row,
    phase: resolveBulkPhaseForRow(form, index, rows.length) || row.phase,
  }))
}

const DEFAULT_DOCUMENT_FORM = {
  id: '',
  documentType: 'floorplan',
  title: '',
  description: '',
  fileUrl: '',
  linkedUnitId: '',
  linkedUnitType: '',
}

const DEFAULT_DOCUMENT_EMAIL_FORM = {
  recipientEmail: '',
  ccEmail: '',
  subject: '',
  message: '',
}

const DEFAULT_RESERVATION_SETTINGS_FORM = {
  enabledByDefault: false,
  defaultDepositAmount: '',
  amountType: 'fixed',
  vatTreatment: 'including_vat',
  dueTrigger: 'on_reservation',
  depositTreatment: 'credited_to_purchase_price',
  payableTo: 'developer',
  alterationChargeTreatment: 'included_in_purchase_price',
  defaultTransferAttorneySource: 'first_conveyancer',
  defaultBondOriginatorSource: 'first_bond_originator',
  buyerAppointedBondOriginatorAllowed: true,
  buyerAppointedBondOriginatorRequiresApproval: true,
  autoInviteSelectedBondOriginator: false,
  paymentReferenceFormat: '',
  accountHolderName: '',
  bankName: '',
  accountNumber: '',
  branchCode: '',
  accountType: '',
  paymentInstructions: '',
}

const DEFAULT_COMMERCIAL_DOCUMENT_FORM = {
  id: '',
  title: '',
  description: '',
  fileUrl: '',
}

const OVERVIEW_PROGRESS_TONE = {
  AVAIL: 'from-slate-400 to-slate-500',
  DEP: 'from-[#f59e0b] to-[#fbbf24]',
  OTP: 'from-[#f59e0b] to-[#f97316]',
  FIN: 'from-[#2f6fec] to-[#60a5fa]',
  ATTY: 'from-[#35546c] to-[#5c82a3]',
  XFER: 'from-[#0f766e] to-[#14b8a6]',
  REG: 'from-[#16a34a] to-[#22c55e]',
}

const TRANSACTION_MAIN_STAGE_ORDER = ['AVAIL', 'DEP', 'OTP', 'FIN', 'ATTY', 'XFER', 'REG']

const DEVELOPMENT_UNIT_STATUS_OPTIONS = [
  { value: 'Available', label: 'Available', mainStage: 'AVAIL', lifecycleStage: null },
  { value: 'Reserved', label: 'Reserved', mainStage: 'DEP', lifecycleStage: null },
  { value: 'OTP Signed', label: 'OTP', mainStage: 'OTP', lifecycleStage: 'otp' },
  { value: 'Finance Pending', label: 'Finance Pending', mainStage: 'FIN', lifecycleStage: 'finance' },
  { value: 'Proceed to Attorneys', label: 'Attorneys', mainStage: 'ATTY', lifecycleStage: 'transfer' },
  { value: 'Transfer in Progress', label: 'Transfer', mainStage: 'XFER', lifecycleStage: 'transfer' },
  { value: 'Sold', label: 'Sold', mainStage: 'OTP', lifecycleStage: 'otp' },
  { value: 'Registered', label: 'Registered', mainStage: 'REG', lifecycleStage: 'registration', completed: true },
  { value: 'Blocked', label: 'Blocked', mainStage: 'BLOCKED', lifecycleStage: null },
]

const DEVELOPMENT_UNIT_STATUS_LOOKUP = new Map(
  DEVELOPMENT_UNIT_STATUS_OPTIONS.flatMap((option) => [
    [normalizeUnitStatusKey(option.value), option],
    [normalizeUnitStatusKey(option.label), option],
  ]),
)

const DEVELOPMENT_LEAD_FUNNEL_STAGES = [
  { key: 'new', label: 'Captured', statuses: ['new', 'captured'] },
  { key: 'contacted', label: 'Contacted', statuses: ['contacted', 'qualified'] },
  { key: 'viewing', label: 'Viewing', statuses: ['viewing', 'reserved', 'onboarding_sent', 'onboarding_submitted'] },
  { key: 'otp', label: 'OTP', statuses: ['otp'] },
  { key: 'converted', label: 'Converted', statuses: ['converted'] },
]

const CARD_SHELL =
  'rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'
const READ_ONLY_FIELD_CLASS =
  'border-[#e3eaf3] bg-[#f8fafd] text-[#1f3347] shadow-none focus:border-[#e3eaf3] focus:ring-0'
const UNIT_QUICK_FIELD_CLASS =
  'h-10 w-full rounded-[10px] border border-transparent bg-transparent px-3 py-2 text-sm font-semibold text-[#142132] outline-none transition hover:border-[#dbe5ef] hover:bg-[#fbfcfe] focus:border-[#1f7a45] focus:bg-white focus:ring-2 focus:ring-[#dcefe4]'

function DetailField({ label, className = '', children }) {
  return (
    <label className={`grid gap-2 text-sm font-medium text-[#35546c] ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function ConfigurationCard({
  icon: Icon,
  title,
  description,
  summary = null,
  badge = null,
  expanded = false,
  editing = false,
  canEdit = false,
  onToggle,
  onEdit,
  children,
  className = '',
}) {
  const ChevronIcon = expanded ? ChevronUp : ChevronDown

  return (
    <section className={`${CARD_SHELL} ${className}`.trim()}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-4 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[#d7efdf] bg-[#edf9f1] text-[#1c7d45]">
            {Icon ? <Icon size={19} /> : null}
          </span>
          <span className="min-w-0">
            <span className="block text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">{title}</span>
            <span className="mt-1 block text-sm leading-6 text-[#6b7d93]">{description}</span>
          </span>
        </button>

        <div className="flex min-w-0 flex-col gap-3 lg:min-w-[360px] lg:items-end">
          {summary ? <div className="min-w-0 text-sm leading-6 text-[#526780] lg:text-right">{summary}</div> : null}
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            {canEdit && !editing ? (
              <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
                <PencilLine size={14} />
                Edit
              </Button>
            ) : null}
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#607891] transition hover:bg-[#f2f6fa] hover:text-[#142132]"
              onClick={onToggle}
              aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
            >
              <ChevronIcon size={17} />
            </button>
          </div>
        </div>
      </div>

      {expanded ? <div className="mt-5 border-t border-[#e6edf5] pt-5">{children}</div> : null}
    </section>
  )
}

function ConfigStatusPill({ tone = 'neutral', children }) {
  const toneClass =
    tone === 'success'
      ? 'border-[#cde8d8] bg-[#eef9f2] text-[#1c7d45]'
      : tone === 'danger'
        ? 'border-[#f2c9c3] bg-[#fff5f4] text-[#b42318]'
        : tone === 'warning'
          ? 'border-[#f5d7a8] bg-[#fff8eb] text-[#8a5a12]'
          : 'border-[#dbe7f3] bg-[#f8fbff] text-[#35546c]'

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  )
}

function normalizeDateInput(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function parseEmailRecipients(value) {
  return String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function getOptionSummaryLabel(options, value, fallback = 'Not set') {
  return options.find((item) => item.value === value)?.summaryLabel || options.find((item) => item.value === value)?.label || fallback
}

function getReservationDepositAmountValue(form = {}) {
  if (!form.enabledByDefault) return null
  const amount = Number(form.defaultDepositAmount)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function getReservationDepositSummary(form = {}) {
  if (!form.enabledByDefault) return 'No reservation deposit required'
  const amount = getReservationDepositAmountValue(form)
  const amountLabel = amount === null
    ? 'an amount still to be set'
    : form.amountType === 'percentage'
      ? `${amount}% of the purchase price`
      : currencyWithCents.format(amount)
  const vatLabel = getOptionSummaryLabel(RESERVATION_VAT_TREATMENT_OPTIONS, form.vatTreatment, 'incl. VAT')
  const dueLabel = getOptionSummaryLabel(RESERVATION_DUE_TRIGGER_OPTIONS, form.dueTrigger, 'after reserving a unit')
  return `Buyers will be required to pay ${amountLabel} ${vatLabel} ${dueLabel}.`
}

function validateGeneralDetailsForm(form = {}) {
  const errors = []
  if (!String(form.name || '').trim()) {
    errors.push('Development name is required.')
  }

  if (form.totalUnitsExpected !== '' && form.totalUnitsExpected !== null && form.totalUnitsExpected !== undefined) {
    const units = Number(form.totalUnitsExpected)
    if (!Number.isInteger(units) || units < 0) {
      errors.push('Expected units must be a valid whole number.')
    }
  }

  for (const [value, label] of [
    [form.launchDate, 'Launch date'],
    [form.expectedCompletionDate, 'Expected completion date'],
  ]) {
    if (value && Number.isNaN(new Date(value).getTime())) {
      errors.push(`${label} must be a valid date.`)
    }
  }

  return errors
}

function validateSellerDetailsForm(form = {}) {
  const seller = normalizeSellerDetailsForm(form)
  const signatory = seller.signatories[0] || {}
  const errors = []

  if (!String(seller.legalName || '').trim()) {
    errors.push('Seller legal name is required.')
  }

  if (['company', 'trust', 'close_corporation'].includes(seller.entityType) && !String(seller.registrationNumber || '').trim()) {
    errors.push('Registration / trust number is required for this entity type.')
  }

  if (!String(signatory.fullName || '').trim()) {
    errors.push('Authorised signatory full name is required.')
  }

  if (!String(signatory.signingCapacity || signatory.role || '').trim()) {
    errors.push('Authorised signatory capacity is required.')
  }

  if (seller.email && !isValidEmail(seller.email)) {
    errors.push('Seller email must be valid.')
  }

  if (signatory.email && !isValidEmail(signatory.email)) {
    errors.push('Authorised signatory email must be valid.')
  }

  return errors
}

function validateReservationSettingsForm(form = {}) {
  if (!form.enabledByDefault) return []

  const errors = []
  const amount = Number(form.defaultDepositAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push('Deposit amount must be greater than zero.')
  }
  if (!RESERVATION_VAT_TREATMENT_OPTIONS.some((item) => item.value === form.vatTreatment)) {
    errors.push('VAT treatment is required.')
  }
  if (!RESERVATION_DUE_TRIGGER_OPTIONS.some((item) => item.value === form.dueTrigger)) {
    errors.push('Deposit due trigger is required.')
  }
  return errors
}

function getStakeholderTeamsFromSettings(settings = {}) {
  return settings?.stakeholderTeams || settings?.stakeholder_teams || {}
}

function buildAgentAssignmentKey(member = {}) {
  const email = String(member?.email || member?.contactEmail || '')
    .trim()
    .toLowerCase()
  if (email) return `email:${email}`

  const id = String(
    member?.organisationUserId ||
      member?.organisation_user_id ||
      member?.userId ||
      member?.user_id ||
      member?.id ||
      '',
  ).trim()
  if (id) return `id:${id}`

  return `name:${String(member?.name || member?.contactName || '').trim().toLowerCase()}`
}

function normalizeDevelopmentAgentAssignment(member = {}) {
  const firstName = String(member?.firstName || member?.first_name || '').trim()
  const lastName = String(member?.lastName || member?.last_name || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const name = String(
    member?.name ||
      member?.contactName ||
      member?.fullName ||
      member?.full_name ||
      fullName ||
      member?.email ||
      member?.contactEmail ||
      '',
  ).trim()
  const email = String(member?.email || member?.contactEmail || '')
    .trim()
    .toLowerCase()
  const userId = String(member?.userId || member?.user_id || '').trim()
  const organisationUserId = String(
    member?.organisationUserId ||
      member?.organisation_user_id ||
      member?.organisationUserID ||
      member?.membershipId ||
      member?.id ||
      '',
  ).trim()

  if (!name && !email && !userId && !organisationUserId) {
    return null
  }

  return {
    id: organisationUserId || userId || email || name,
    organisationUserId,
    userId,
    name,
    contactName: name,
    email,
    contactEmail: email,
    company: String(member?.company || member?.agency || member?.organisationName || '').trim(),
    role: String(member?.role || member?.workspaceRole || member?.organisationRole || '').trim(),
    workspaceRole: String(member?.workspaceRole || member?.workspace_role || '').trim(),
    status: String(member?.status || member?.membershipStatus || member?.membership_status || 'active').trim(),
    source: String(member?.source || (organisationUserId || userId ? 'organisation_user' : 'manual')).trim(),
  }
}

function normalizeDevelopmentAgentAssignments(members = []) {
  const seen = new Set()
  const normalizedMembers = []

  for (const member of Array.isArray(members) ? members : []) {
    const normalized = normalizeDevelopmentAgentAssignment(member)
    if (!normalized) continue

    const key = buildAgentAssignmentKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    normalizedMembers.push(normalized)
  }

  return normalizedMembers
}

function getDevelopmentAgentAssignments(settings = {}) {
  return normalizeDevelopmentAgentAssignments(getStakeholderTeamsFromSettings(settings).agents)
}

function isAssignableDevelopmentAgent(user = {}) {
  const status = String(user?.status || user?.membershipStatus || user?.membership_status || 'active').toLowerCase()
  if (status && !['active', 'accepted', 'invited', 'pending'].includes(status)) {
    return false
  }

  const roleText = [
    user?.role,
    user?.workspaceRole,
    user?.workspace_role,
    user?.organisationRole,
    user?.organisation_role,
    user?.organizationRole,
    user?.organization_role,
    user?.jobTitle,
    user?.job_title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!roleText) return true

  return [
    'agent',
    'principal',
    'manager',
    'team lead',
    'team_lead',
    'branch manager',
    'branch_manager',
    'sales',
  ].some((token) => roleText.includes(token))
}

function buildDevelopmentAgentAssignmentFromUser(user = {}) {
  return normalizeDevelopmentAgentAssignment({
    ...user,
    id: user.id,
    organisationUserId: user.id,
    userId: user.userId || user.user_id,
    name: user.fullName || user.full_name || [user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(' '),
    email: user.email,
    role: user.role,
    workspaceRole: user.workspaceRole || user.workspace_role,
    organisationRole: user.organisationRole || user.organisation_role || user.organizationRole || user.organization_role,
    source: 'organisation_user',
  })
}

function getFileExtensionFromUrl(value) {
  const normalized = String(value || '').split('?')[0].split('#')[0]
  const lastSegment = normalized.split('/').pop() || ''
  const dotIndex = lastSegment.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) {
    return ''
  }
  return lastSegment.slice(dotIndex + 1).toLowerCase()
}

function buildDocumentDownloadName(item = {}) {
  const safeTitle = String(item?.title || 'development-document')
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
  const extension = getFileExtensionFromUrl(item?.fileUrl)
  return extension ? `${safeTitle}.${extension}` : safeTitle
}

function buildCsvDownloadName(value, fallback = 'development-financial-reconciliation') {
  const safeName = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()

  return `${safeName || fallback}.csv`
}

function escapeCsvCell(value) {
  const normalized = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`
  }

  return normalized
}

function buildCsvContent(rows = []) {
  return `${rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n')}\n`
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value)}%`
}

function formatNumber(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return '0'
  return new Intl.NumberFormat('en-ZA').format(parsed)
}

function formatCommissionAgreement(value, model = 'fixed_fee') {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return 'Not set'
  return model === 'percentage' ? `${parsed}% of bond value` : currency.format(parsed)
}

function normalizeMoneyInput(value) {
  if (value === '' || value === null || value === undefined) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : ''
}

function listToTextarea(values = []) {
  return (Array.isArray(values) ? values : []).filter(Boolean).join('\n')
}

function textareaToList(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function appendUniqueTextareaValues(value, additions = []) {
  const existing = textareaToList(value)
  const next = [...existing]
  additions
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .forEach((item) => {
      if (!next.includes(item)) {
        next.push(item)
      }
    })
  return next.join('\n')
}

function uniqueTruthyValues(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeMarketingUnitList(value) {
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function serializeMarketingUnitList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n')
}

function isLikelyImageUrl(value = '') {
  const normalized = String(value || '').split('?')[0].toLowerCase()
  return /\.(avif|gif|jpe?g|png|svg|webp)$/.test(normalized) || normalized.startsWith('data:image/')
}

function getAssetFileLabel(value = '', fallback = 'Uploaded file') {
  const normalized = String(value || '').trim()
  if (!normalized) return fallback
  const path = normalized.split('?')[0].split('#')[0]
  const filename = path.split('/').filter(Boolean).pop() || fallback
  try {
    return decodeURIComponent(filename)
  } catch {
    return filename
  }
}

function parseSellingPointEntries(value) {
  return textareaToList(value).map((line) => {
    const [title, ...rest] = String(line).split('::')
    return {
      title: String(title || '').trim(),
      note: String(rest.join('::') || '').trim(),
    }
  })
}

function serializeSellingPointEntries(entries = []) {
  return entries
    .map((entry) => {
      const title = String(entry?.title || '').trim()
      const note = String(entry?.note || '').trim()
      if (!title) return ''
      return note ? `${title}::${note}` : title
    })
    .filter(Boolean)
    .join('\n')
}

function normalizeMarketingBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false
  }

  return fallback
}

function firstDefinedMarketingValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function parseMarketingAmount(value) {
  if (value === null || value === undefined) return null
  const numeric = Number(String(value).replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function formatMarketingFloorplanPriceSummary(floorplan = {}) {
  const from = parseMarketingAmount(floorplan.priceFrom)
  const to = parseMarketingAmount(floorplan.priceTo)
  const single = parseMarketingAmount(floorplan.price)

  if (from && to) {
    return from === to ? currency.format(from) : `${currency.format(from)} - ${currency.format(to)}`
  }

  if (from) return `From ${currency.format(from)}`
  if (to) return `Up to ${currency.format(to)}`
  if (single) return currency.format(single)
  return ''
}

function getMarketingUnitStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['active', 'live', 'published'].includes(normalized)) return 'active'
  if (['sold_out', 'sold out'].includes(normalized)) return 'sold_out'
  if (['coming_soon', 'coming soon'].includes(normalized)) return 'coming_soon'
  return 'draft'
}

function getMarketingUnitStatusClassName(value) {
  const status = getMarketingUnitStatus(value)
  if (status === 'active') return 'border-[#bde7cd] bg-[#ecfdf3] text-[#166534]'
  if (status === 'sold_out') return 'border-[#f4c7c3] bg-[#fff1f0] text-[#b42318]'
  if (status === 'coming_soon') return 'border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]'
  return 'border-[#fde7bc] bg-[#fffbeb] text-[#92400e]'
}

function normalizeMarketingUnitKey(value) {
  return String(value || '').trim().toLowerCase()
}

function getMarketingFloorplanFeatureEntries(floorplan = {}) {
  const explicitFeatures = normalizeMarketingUnitList(floorplan.keyFeatures || floorplan.features)
  const generatedFeatures = [
    floorplan.bedrooms ? `${floorplan.bedrooms} Bedrooms` : '',
    floorplan.bathrooms ? `${floorplan.bathrooms} Bathrooms` : '',
    floorplan.garage ? `${floorplan.garage} Parking` : '',
    floorplan.floorSize ? `${floorplan.floorSize} Internal Size` : '',
    floorplan.pool ? 'Pool' : '',
  ].filter(Boolean)

  return [...new Set([...explicitFeatures, ...generatedFeatures])]
}

function getMarketingFloorplanHighlightEntries(floorplan = {}) {
  return normalizeMarketingUnitList(floorplan.marketingHighlights || floorplan.highlights)
}

function buildFloorplanDraftId() {
  return `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function buildMarketingAgencyDraftId() {
  return `agency-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function createDefaultMarketingFloorplan(index = 1) {
  return {
    id: buildFloorplanDraftId(),
    name: `Option ${index}`,
    erfSize: '',
    floorSize: '',
    bedrooms: '',
    bathrooms: '',
    garage: '',
    pool: '',
    price: '',
    priceFrom: '',
    priceTo: '',
    description: '',
    imageUrls: '',
    floorplanUrls: '',
    videoUrl: '',
    virtualTourUrl: '',
    documentUrls: '',
    keyFeatures: '',
    marketingHighlights: '',
    ctaLabel: 'Enquire Now',
    secondaryCtaLabel: '',
    ctaUrl: '',
    seoTitle: '',
    seoDescription: '',
    listingSlug: '',
    listingStatus: 'draft',
    ratesAndTaxes: '',
    levies: '',
    noTransferDuty: false,
    customisationOptions: false,
  }
}

function normalizeMarketingFloorplan(input = {}, index = 1) {
  const source = input && typeof input === 'object' ? input : {}
  const text = (...values) => String(firstDefinedMarketingValue(...values, '') ?? '')
  return {
    id: text(source.id, source.floorplanId, source.floorplan_id, source.unitTypeId, source.unit_type_id, buildFloorplanDraftId()),
    name: text(source.name, source.title, source.unitType, source.unit_type, `Option ${index}`),
    erfSize: text(source.erfSize, source.erf_size),
    floorSize: text(source.floorSize, source.floor_size),
    bedrooms: text(source.bedrooms),
    bathrooms: text(source.bathrooms),
    garage: text(source.garage, source.parking, source.parkingCount, source.parking_count),
    pool: text(source.pool),
    price: text(source.price),
    priceFrom: text(source.priceFrom, source.price_from, source.minPrice, source.min_price, source.price),
    priceTo: text(source.priceTo, source.price_to, source.maxPrice, source.max_price, source.price),
    description: text(source.description, source.notes),
    imageUrls: text(source.imageUrls, source.image_urls, source.imageUrl, source.image_url),
    floorplanUrls: text(source.floorplanUrls, source.floorplan_urls, source.floorplanUrl, source.floorplan_url, source.planUrl, source.plan_url),
    videoUrl: text(source.videoUrl, source.video_url),
    virtualTourUrl: text(source.virtualTourUrl, source.virtual_tour_url),
    documentUrls: text(source.documentUrls, source.document_urls, source.documentUrl, source.document_url),
    keyFeatures: text(source.keyFeatures, source.key_features, source.features),
    marketingHighlights: text(source.marketingHighlights, source.marketing_highlights, source.highlights),
    ctaLabel: text(source.ctaLabel, source.cta_label, 'Enquire Now'),
    secondaryCtaLabel: text(source.secondaryCtaLabel, source.secondary_cta_label),
    ctaUrl: text(source.ctaUrl, source.cta_url),
    seoTitle: text(source.seoTitle, source.seo_title),
    seoDescription: text(source.seoDescription, source.seo_description, source.seoMetaDescription, source.seo_meta_description),
    listingSlug: text(source.listingSlug, source.listing_slug),
    listingStatus: text(source.listingStatus, source.listing_status, source.status, 'draft'),
    ratesAndTaxes: text(source.ratesAndTaxes, source.rates_and_taxes),
    levies: text(source.levies),
    noTransferDuty: normalizeMarketingBoolean(firstDefinedMarketingValue(source.noTransferDuty, source.no_transfer_duty), false),
    customisationOptions: normalizeMarketingBoolean(firstDefinedMarketingValue(source.customisationOptions, source.customisation_options), false),
  }
}

function normalizeMarketingAgency(input = {}, index = 1) {
  const source = input && typeof input === 'object' ? input : {}
  const text = (value, fallback = '') => String(value ?? fallback ?? '')

  return {
    id: text(source.id, buildMarketingAgencyDraftId()),
    name: text(source.name, ''),
    contactName: text(source.contactName, ''),
    contactEmail: text(source.contactEmail, ''),
    contactPhone: text(source.contactPhone, ''),
    notes: text(source.notes, ''),
    isPreferred: normalizeMarketingBoolean(source.isPreferred, index === 1),
  }
}

function normalizeMarketingContentForm(input = null) {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : DEFAULT_DETAILS_FORM.marketing
  const defaults = DEFAULT_DETAILS_FORM.marketing
  const text = (value, fallback = '') => String(value ?? fallback ?? '')
  const bool = (value, fallback = false) => normalizeMarketingBoolean(value, fallback)
  const listingOverviewSource = source?.listingOverview || source?.listing_overview || {}
  const sellingPointsSource = source?.sellingPoints || source?.selling_points || {}
  const keySellingPointsSource = source?.keySellingPoints || source?.key_selling_points || {}
  const mediaLibrarySource = source?.mediaLibrary || source?.media_library || {}
  const downloadsSource = source?.downloads || {}
  const externalLinksSource = source?.externalLinks || source?.external_links || {}
  const listingConfigurationSource = source?.listingConfiguration || source?.listing_configuration || {}
  const floorplansSource = Array.isArray(source?.floorplans)
    ? source.floorplans
    : Array.isArray(source?.unitTypes)
      ? source.unitTypes
      : Array.isArray(source?.unit_types)
        ? source.unit_types
        : []

  return {
    listingOverview: {
      listingTitle: text(listingOverviewSource.listingTitle, defaults.listingOverview.listingTitle),
      listingHeading: text(
        listingOverviewSource.listingHeading,
        listingOverviewSource.shortTitle || defaults.listingOverview.listingHeading,
      ),
      ownershipType: text(listingOverviewSource.ownershipType, defaults.listingOverview.ownershipType),
      locationLabel: text(listingOverviewSource.locationLabel, defaults.listingOverview.locationLabel),
      address: text(listingOverviewSource.address, defaults.listingOverview.address),
      suburb: text(listingOverviewSource.suburb, defaults.listingOverview.suburb),
      city: text(listingOverviewSource.city, defaults.listingOverview.city),
      province: text(listingOverviewSource.province, defaults.listingOverview.province),
      priceRange: text(listingOverviewSource.priceRange, defaults.listingOverview.priceRange),
      listingStatus: text(listingOverviewSource.listingStatus, defaults.listingOverview.listingStatus || 'draft'),
      listingDescription: text(listingOverviewSource.listingDescription, defaults.listingOverview.listingDescription),
      developmentChecklist: bool(
        listingOverviewSource.developmentChecklist,
        defaults.listingOverview.developmentChecklist,
      ),
      fibreReady: bool(listingOverviewSource.fibreReady, defaults.listingOverview.fibreReady),
      borehole: bool(listingOverviewSource.borehole, defaults.listingOverview.borehole),
      backupBatteryInverter: bool(
        listingOverviewSource.backupBatteryInverter,
        defaults.listingOverview.backupBatteryInverter,
      ),
      gasGeyser: bool(listingOverviewSource.gasGeyser, defaults.listingOverview.gasGeyser),
      solarGeyser: bool(listingOverviewSource.solarGeyser, defaults.listingOverview.solarGeyser),
      solarPanels: bool(listingOverviewSource.solarPanels, defaults.listingOverview.solarPanels),
      waterTanks: bool(listingOverviewSource.waterTanks, defaults.listingOverview.waterTanks),
      petsAllowed: bool(listingOverviewSource.petsAllowed, defaults.listingOverview.petsAllowed),
      notes: text(
        listingOverviewSource.notes,
        listingOverviewSource.shortDescription || defaults.listingOverview.notes,
      ),
      seoTitle: text(listingOverviewSource.seoTitle, defaults.listingOverview.seoTitle),
      seoMetaDescription: text(
        listingOverviewSource.seoMetaDescription,
        defaults.listingOverview.seoMetaDescription,
      ),
    },
    floorplans: floorplansSource.map((item, index) => normalizeMarketingFloorplan(item, index + 1)),
    agencies: Array.isArray(source?.agencies)
      ? source.agencies.map((item, index) => normalizeMarketingAgency(item, index + 1))
      : Array.isArray(source?.agencyDirectory?.agencies)
        ? source.agencyDirectory.agencies.map((item, index) => normalizeMarketingAgency(item, index + 1))
        : [],
    sellingPoints: {
      items: text(
        sellingPointsSource.items,
        keySellingPointsSource.keyHighlights || defaults.sellingPoints.items,
      ),
    },
    keySellingPoints: {
      keyHighlights: text(keySellingPointsSource.keyHighlights, defaults.keySellingPoints.keyHighlights),
      lifestyleSellingPoints: text(
        keySellingPointsSource.lifestyleSellingPoints,
        defaults.keySellingPoints.lifestyleSellingPoints,
      ),
      buyerAppealNotes: text(keySellingPointsSource.buyerAppealNotes, defaults.keySellingPoints.buyerAppealNotes),
      nearbyAmenitiesSummary: text(
        keySellingPointsSource.nearbyAmenitiesSummary,
        defaults.keySellingPoints.nearbyAmenitiesSummary,
      ),
      securityEstateFeatures: text(
        keySellingPointsSource.securityEstateFeatures,
        defaults.keySellingPoints.securityEstateFeatures,
      ),
      whyThisDevelopment: text(
        keySellingPointsSource.whyThisDevelopment,
        defaults.keySellingPoints.whyThisDevelopment,
      ),
    },
    mediaLibrary: {
      heroImageUrl: text(mediaLibrarySource.heroImageUrl, mediaLibrarySource.hero_image_url || defaults.mediaLibrary.heroImageUrl),
      galleryImageUrls: text(mediaLibrarySource.galleryImageUrls, mediaLibrarySource.gallery_image_urls || defaults.mediaLibrary.galleryImageUrls),
      developmentLogoUrl: text(mediaLibrarySource.developmentLogoUrl, mediaLibrarySource.development_logo_url || defaults.mediaLibrary.developmentLogoUrl),
      sitePlanUrl: text(mediaLibrarySource.sitePlanUrl, mediaLibrarySource.site_plan_url || defaults.mediaLibrary.sitePlanUrl),
      masterplanUrl: text(mediaLibrarySource.masterplanUrl, mediaLibrarySource.masterplan_url || defaults.mediaLibrary.masterplanUrl),
      floorplanUrls: text(mediaLibrarySource.floorplanUrls, mediaLibrarySource.floorplan_urls || defaults.mediaLibrary.floorplanUrls),
      videoUrl: text(mediaLibrarySource.videoUrl, mediaLibrarySource.video_url || defaults.mediaLibrary.videoUrl),
      virtualTourUrl: text(mediaLibrarySource.virtualTourUrl, mediaLibrarySource.virtual_tour_url || defaults.mediaLibrary.virtualTourUrl),
    },
    downloads: {
      brochureUrl: text(downloadsSource.brochureUrl, defaults.downloads.brochureUrl),
      pricingSheetUrl: text(downloadsSource.pricingSheetUrl, defaults.downloads.pricingSheetUrl),
      specSheetUrl: text(downloadsSource.specSheetUrl, defaults.downloads.specSheetUrl),
      salesPackUrl: text(downloadsSource.salesPackUrl, defaults.downloads.salesPackUrl),
      investmentPackUrl: text(downloadsSource.investmentPackUrl, defaults.downloads.investmentPackUrl),
      termsPdfUrl: text(downloadsSource.termsPdfUrl, defaults.downloads.termsPdfUrl),
      applicationFormUrl: text(downloadsSource.applicationFormUrl, defaults.downloads.applicationFormUrl),
    },
    externalLinks: {
      developmentLandingPageUrl: text(
        externalLinksSource.developmentLandingPageUrl,
        defaults.externalLinks.developmentLandingPageUrl,
      ),
      googleMapsUrl: text(externalLinksSource.googleMapsUrl, defaults.externalLinks.googleMapsUrl),
      externalWebsiteUrl: text(externalLinksSource.externalWebsiteUrl, defaults.externalLinks.externalWebsiteUrl),
      salesPortalUrl: text(externalLinksSource.salesPortalUrl, defaults.externalLinks.salesPortalUrl),
      whatsappEnquiryUrl: text(externalLinksSource.whatsappEnquiryUrl, defaults.externalLinks.whatsappEnquiryUrl),
      bookingViewingUrl: text(externalLinksSource.bookingViewingUrl, defaults.externalLinks.bookingViewingUrl),
    },
    listingConfiguration: {
      showOnListingWebsite: bool(
        listingConfigurationSource.showOnListingWebsite,
        defaults.listingConfiguration.showOnListingWebsite,
      ),
      featuredDevelopment: bool(
        listingConfigurationSource.featuredDevelopment,
        defaults.listingConfiguration.featuredDevelopment,
      ),
      displayOrder: text(listingConfigurationSource.displayOrder, defaults.listingConfiguration.displayOrder),
      listingSlug: text(listingConfigurationSource.listingSlug, defaults.listingConfiguration.listingSlug),
      ctaLabel: text(listingConfigurationSource.ctaLabel, defaults.listingConfiguration.ctaLabel),
      ctaUrl: text(listingConfigurationSource.ctaUrl, defaults.listingConfiguration.ctaUrl),
      marketingStatus: text(listingConfigurationSource.marketingStatus, defaults.listingConfiguration.marketingStatus),
      publicVisibility: bool(
        listingConfigurationSource.publicVisibility,
        defaults.listingConfiguration.publicVisibility,
      ),
    },
  }
}

function buildMarketingForm(profile = {}, development = {}) {
  const base = normalizeMarketingContentForm(profile?.marketingContent)
  const normalized = { ...base }

  normalized.listingOverview = {
    ...base.listingOverview,
    listingTitle: base.listingOverview.listingTitle || development?.name || '',
    listingHeading: base.listingOverview.listingHeading || base.listingOverview.listingTitle || development?.name || '',
    locationLabel: base.listingOverview.locationLabel || profile?.location || development?.location || '',
    address: base.listingOverview.address || profile?.address || '',
    suburb: base.listingOverview.suburb || profile?.suburb || development?.suburb || '',
    city: base.listingOverview.city || profile?.city || development?.city || '',
    province: base.listingOverview.province || profile?.province || development?.province || '',
    listingDescription: base.listingOverview.listingDescription || profile?.description || development?.description || '',
    listingStatus: base.listingOverview.listingStatus || 'draft',
  }

  normalized.floorplans = Array.isArray(base.floorplans)
    ? base.floorplans.map((item, index) => normalizeMarketingFloorplan(item, index + 1))
    : []

  if (!normalized.floorplans.length) {
    normalized.floorplans = [createDefaultMarketingFloorplan(1)]
  }

  if (!normalized.sellingPoints?.items) {
    normalized.sellingPoints = {
      items: base.keySellingPoints.keyHighlights || '',
    }
  }

  if (!normalized.keySellingPoints.keyHighlights) {
    normalized.keySellingPoints = {
      ...normalized.keySellingPoints,
      keyHighlights: listToTextarea(profile?.plans),
    }
  }

  const imageLinks = Array.isArray(profile?.imageLinks) ? profile.imageLinks : []
  if (!normalized.mediaLibrary.heroImageUrl) {
    normalized.mediaLibrary = {
      ...normalized.mediaLibrary,
      heroImageUrl: imageLinks[0] || '',
      galleryImageUrls: normalized.mediaLibrary.galleryImageUrls || listToTextarea(imageLinks.slice(1)),
    }
  }

  const sitePlans = Array.isArray(profile?.sitePlans) ? profile.sitePlans : []
  if (!normalized.mediaLibrary.sitePlanUrl && sitePlans.length) {
    normalized.mediaLibrary = {
      ...normalized.mediaLibrary,
      sitePlanUrl: sitePlans[0] || '',
      masterplanUrl: sitePlans[1] || '',
      floorplanUrls: normalized.mediaLibrary.floorplanUrls || listToTextarea(sitePlans.slice(2)),
    }
  }

  const supportingDocuments = Array.isArray(profile?.supportingDocuments) ? profile.supportingDocuments : []
  if (!normalized.downloads.brochureUrl && supportingDocuments.length) {
    normalized.downloads = {
      ...normalized.downloads,
      brochureUrl: supportingDocuments[0] || '',
      pricingSheetUrl: supportingDocuments[1] || '',
      specSheetUrl: supportingDocuments[2] || '',
      salesPackUrl: supportingDocuments[3] || '',
      investmentPackUrl: supportingDocuments[4] || '',
      termsPdfUrl: supportingDocuments[5] || '',
      applicationFormUrl: supportingDocuments[6] || '',
    }

    normalized.externalLinks = {
      ...normalized.externalLinks,
      developmentLandingPageUrl: normalized.externalLinks.developmentLandingPageUrl || supportingDocuments[7] || '',
      googleMapsUrl: normalized.externalLinks.googleMapsUrl || supportingDocuments[8] || '',
      externalWebsiteUrl: normalized.externalLinks.externalWebsiteUrl || supportingDocuments[9] || '',
      salesPortalUrl: normalized.externalLinks.salesPortalUrl || supportingDocuments[10] || '',
      whatsappEnquiryUrl: normalized.externalLinks.whatsappEnquiryUrl || supportingDocuments[11] || '',
      bookingViewingUrl: normalized.externalLinks.bookingViewingUrl || supportingDocuments[12] || '',
    }
  }

  return normalized
}

function getMarketingLegacyPayload(marketingInput = null) {
  const marketing = normalizeMarketingContentForm(marketingInput)
  const dedupe = (values = []) => [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
  const imageLinks = dedupe([
    marketing.mediaLibrary.heroImageUrl,
    marketing.mediaLibrary.developmentLogoUrl,
    ...textareaToList(marketing.mediaLibrary.galleryImageUrls),
    ...marketing.floorplans.flatMap((item) => textareaToList(item.imageUrls)),
  ])

  const sitePlans = dedupe([
    marketing.mediaLibrary.sitePlanUrl,
    marketing.mediaLibrary.masterplanUrl,
    ...textareaToList(marketing.mediaLibrary.floorplanUrls),
    ...marketing.floorplans.flatMap((item) => textareaToList(item.floorplanUrls)),
  ])

  const plans = dedupe([
    ...textareaToList(marketing.sellingPoints.items),
    ...textareaToList(marketing.keySellingPoints.keyHighlights),
    ...textareaToList(marketing.keySellingPoints.lifestyleSellingPoints),
    ...textareaToList(marketing.keySellingPoints.buyerAppealNotes),
    ...textareaToList(marketing.keySellingPoints.nearbyAmenitiesSummary),
    ...textareaToList(marketing.keySellingPoints.securityEstateFeatures),
    ...textareaToList(marketing.keySellingPoints.whyThisDevelopment),
  ])

  const supportingDocuments = dedupe([
    marketing.downloads.brochureUrl,
    marketing.downloads.pricingSheetUrl,
    marketing.downloads.specSheetUrl,
    marketing.downloads.salesPackUrl,
    marketing.downloads.investmentPackUrl,
    marketing.downloads.termsPdfUrl,
    marketing.downloads.applicationFormUrl,
    marketing.mediaLibrary.videoUrl,
    marketing.mediaLibrary.virtualTourUrl,
    marketing.externalLinks.developmentLandingPageUrl,
    marketing.externalLinks.googleMapsUrl,
    marketing.externalLinks.externalWebsiteUrl,
    marketing.externalLinks.salesPortalUrl,
    marketing.externalLinks.whatsappEnquiryUrl,
    marketing.externalLinks.bookingViewingUrl,
    marketing.listingConfiguration.ctaUrl,
  ])

  const floorplanPrices = marketing.floorplans
    .flatMap((item) => [parseMarketingAmount(item?.priceFrom), parseMarketingAmount(item?.priceTo), parseMarketingAmount(item?.price)])
    .filter((value) => value !== null)
  let derivedPriceRange = ''
  if (floorplanPrices.length) {
    const low = Math.min(...floorplanPrices)
    const high = Math.max(...floorplanPrices)
    derivedPriceRange = low === high ? currency.format(low) : `${currency.format(low)} - ${currency.format(high)}`
  }

  const marketingContent = {
    ...marketing,
    listingOverview: {
      ...marketing.listingOverview,
      priceRange: derivedPriceRange,
    },
    keySellingPoints: {
      ...marketing.keySellingPoints,
      keyHighlights: marketing.keySellingPoints.keyHighlights || marketing.sellingPoints.items,
    },
  }

  return {
    description: marketing.listingOverview.listingDescription,
    plans,
    sitePlans,
    imageLinks,
    supportingDocuments,
    marketingContent,
  }
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function normalizeUnitStatusKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeDevelopmentLeadText(value) {
  return String(value || '').trim()
}

function normalizeDevelopmentLeadKey(value) {
  return normalizeDevelopmentLeadText(value).toLowerCase()
}

function normalizeDeveloperFinancialChoice(value, allowedValues, fallback) {
  const normalized = String(value || '').trim().toLowerCase()
  return allowedValues.includes(normalized) ? normalized : fallback
}

function normalizeReservationTreatment(value) {
  return normalizeDeveloperFinancialChoice(
    value,
    ['credited_to_purchase_price', 'separate_invoice', 'refundable_hold'],
    'credited_to_purchase_price',
  )
}

function normalizeAlterationChargeTreatment(value) {
  return normalizeDeveloperFinancialChoice(
    value,
    ['included_in_purchase_price', 'separate_invoice', 'no_charge'],
    'included_in_purchase_price',
  )
}

function getReservationTreatmentLabel(value) {
  const normalized = normalizeReservationTreatment(value)
  if (normalized === 'separate_invoice') return 'Separate invoice'
  if (normalized === 'refundable_hold') return 'Refundable hold'
  return 'Credited to purchase price'
}

function getAlterationChargeTreatmentLabel(value) {
  const normalized = normalizeAlterationChargeTreatment(value)
  if (normalized === 'separate_invoice') return 'Separate invoice'
  if (normalized === 'no_charge') return 'No charge'
  return 'Included in purchase price'
}

function buildTransactionReference(transactionId) {
  const normalized = String(transactionId || '').replaceAll('-', '').slice(0, 8).toUpperCase()
  return normalized ? `TRX-${normalized}` : 'Pending'
}

function getDevelopmentRecordTransactionId(record = {}) {
  return (
    record?.transactionId ||
    record?.currentTransactionId ||
    record?.transaction_id ||
    record?.transaction?.id ||
    null
  )
}

function getDocTypeLabel(value) {
  return DOCUMENT_TYPE_OPTIONS.find((item) => item.value === value)?.label || toTitleLabel(value || 'other')
}

function getRelativeUpdateLabel(value) {
  if (!value) return 'No recent updates'
  const delta = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 'Updated today'
  const days = Math.floor(delta / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated 1 day ago'
  if (days < 30) return `Updated ${days} days ago`
  const months = Math.floor(days / 30)
  if (months <= 1) return 'Updated 1 month ago'
  return `Updated ${months} months ago`
}

function resolveTransactionMainStage(row = {}) {
  const explicitMainStage = String(row?.transaction?.current_main_stage || row?.report?.currentMainStage || '')
    .trim()
    .toUpperCase()

  if (TRANSACTION_MAIN_STAGE_ORDER.includes(explicitMainStage)) {
    return explicitMainStage
  }

  const normalizedStage = String(row?.transaction?.stage || row?.stage || '')
    .trim()
    .toLowerCase()

  if (!normalizedStage || normalizedStage === 'available') return 'AVAIL'
  if (normalizedStage.includes('registered')) return 'REG'
  if (normalizedStage === 'reserved' || normalizedStage.includes('deposit')) return 'DEP'
  if (normalizedStage.includes('otp')) return 'OTP'
  if (normalizedStage.includes('finance') || normalizedStage.includes('bond')) return 'FIN'
  if (normalizedStage.includes('attorney') || normalizedStage.includes('transfer preparation') || normalizedStage.includes('proceed to attorneys')) return 'ATTY'
  if (normalizedStage.includes('transfer')) return 'XFER'
  return 'AVAIL'
}

function getDevelopmentUnitStatusOption(status) {
  const normalized = normalizeUnitStatusKey(status)
  return DEVELOPMENT_UNIT_STATUS_LOOKUP.get(normalized) || {
    value: String(status || 'Available').trim() || 'Available',
    label: toTitleLabel(status || 'Available'),
    mainStage: normalized === 'sold' ? 'OTP' : 'AVAIL',
    lifecycleStage: null,
  }
}

function resolveDevelopmentUnitStatusMainStage(status) {
  return getDevelopmentUnitStatusOption(status).mainStage || 'AVAIL'
}

function resolveDevelopmentTrackerMainStage(row = {}) {
  const unitStatus = row?.unit?.status ?? row?.status
  const unitMainStage = resolveDevelopmentUnitStatusMainStage(unitStatus)
  if (unitMainStage && unitMainStage !== 'AVAIL') {
    return unitMainStage
  }

  return resolveTransactionMainStage(row)
}

function isAvailableDevelopmentUnitStatus(status) {
  return resolveDevelopmentUnitStatusMainStage(status) === 'AVAIL'
}

function getDevelopmentTrackerProgressPercent(stageKey) {
  const stageIndex = TRANSACTION_MAIN_STAGE_ORDER.indexOf(stageKey)
  if (stageIndex <= 0) return 0
  return Math.round((stageIndex / (TRANSACTION_MAIN_STAGE_ORDER.length - 1)) * 100)
}

function getDevelopmentUnitStatusPillClassName(status) {
  const stageKey = resolveDevelopmentUnitStatusMainStage(status)

  if (stageKey === 'AVAIL') {
    return 'border-[#b7e4c7] bg-[#f1fbf4] text-[#166534]'
  }

  if (stageKey === 'DEP') {
    return 'border-[#f5d7a8] bg-[#fff8eb] text-[#8a5a12]'
  }

  if (['OTP', 'FIN', 'ATTY', 'XFER'].includes(stageKey)) {
    return 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]'
  }

  if (stageKey === 'REG') {
    return 'border-[#d8e3ef] bg-[#f8fafc] text-[#475569]'
  }

  return 'border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
}

function developmentLeadBelongsToDevelopment(lead = {}, developmentId = '') {
  const targetDevelopmentId = normalizeDevelopmentLeadText(developmentId)
  if (!targetDevelopmentId) return false
  if (normalizeDevelopmentLeadText(lead.primaryDevelopmentId) === targetDevelopmentId) return true
  if ((lead.interestedDevelopmentIds || []).some((item) => normalizeDevelopmentLeadText(item) === targetDevelopmentId)) return true
  return (lead.interests || []).some((interest) => normalizeDevelopmentLeadText(interest?.developmentId) === targetDevelopmentId)
}

function getDevelopmentLeadStagePresentation(status = 'new') {
  const normalized = normalizeDevelopmentLeadKey(status || 'new')
  if (normalized === 'converted') return { label: 'Converted', className: 'border-[#b7e4c7] bg-[#f1fbf4] text-[#166534]' }
  if (normalized === 'otp') return { label: 'OTP', className: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]' }
  if (['onboarding_sent', 'onboarding_submitted'].includes(normalized)) return { label: toTitleLabel(normalized), className: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]' }
  if (['viewing', 'reserved'].includes(normalized)) return { label: toTitleLabel(normalized), className: 'border-[#d7e5f5] bg-[#f8fbff] text-[#35546c]' }
  if (normalized === 'qualified') return { label: 'Qualified', className: 'border-[#b7e4c7] bg-[#f1fbf4] text-[#166534]' }
  if (normalized === 'contacted') return { label: 'Contacted', className: 'border-[#f5d7a8] bg-[#fff8eb] text-[#8a5a12]' }
  if (normalized === 'lost') return { label: 'Lost', className: 'border-[#f7d6d8] bg-[#fff5f5] text-[#b42318]' }
  return { label: 'Captured', className: 'border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]' }
}

function buildDevelopmentLeadAccessKeys(profile = {}, organisationUsers = []) {
  const keys = new Set([
    profile?.id,
    profile?.email,
  ].map(normalizeDevelopmentLeadKey).filter(Boolean))
  const profileEmail = normalizeDevelopmentLeadKey(profile?.email)
  const profileId = normalizeDevelopmentLeadKey(profile?.id)

  organisationUsers.forEach((user) => {
    const userKeys = [
      user?.id,
      user?.userId,
      user?.user_id,
      user?.email,
    ].map(normalizeDevelopmentLeadKey).filter(Boolean)
    if (userKeys.includes(profileEmail) || userKeys.includes(profileId)) {
      userKeys.forEach((key) => keys.add(key))
    }
  })

  return keys
}

function canOpenDevelopmentLead(lead = {}) {
  return Boolean(normalizeDevelopmentLeadText(lead.developerLeadId))
}

function canViewDevelopmentLeadPrivateDetails(lead = {}, accessKeys = new Set()) {
  const assignedKeys = [
    lead.assignedAgentId,
    lead.sourceAgentUserId,
    lead.assignedAgentEmail,
  ].map(normalizeDevelopmentLeadKey).filter(Boolean)
  return Boolean(assignedKeys.some((key) => accessKeys.has(key)))
}

function getDevelopmentLeadDisplayName(lead = {}, canViewDetails = false) {
  if (canViewDetails) {
    return normalizeDevelopmentLeadText(lead.buyerFullName) || normalizeDevelopmentLeadText(lead.protectedSummary) || 'Buyer lead'
  }
  return normalizeDevelopmentLeadText(lead.protectedSummary) || normalizeDevelopmentLeadText(lead.publicReference) || 'Protected buyer lead'
}

function getDevelopmentLeadContactLine(lead = {}, canViewDetails = false) {
  if (!canViewDetails) return 'Contact hidden'
  return normalizeDevelopmentLeadText(lead.buyerEmail || lead.buyerPhone) || 'No contact captured'
}

function formatDevelopmentLeadBudget(lead = {}) {
  const min = Number(lead.budgetMin || 0)
  const max = Number(lead.budgetMax || 0)
  if (min > 0 && max > 0) return `${currency.format(min)} - ${currency.format(max)}`
  if (max > 0) return `Up to ${currency.format(max)}`
  if (min > 0) return `From ${currency.format(min)}`
  return 'Budget pending'
}

function getDevelopmentLeadAssignedLabel(lead = {}, organisationUsers = []) {
  const assignedId = normalizeDevelopmentLeadKey(lead.assignedAgentId || lead.sourceAgentUserId)
  const assignedUser = organisationUsers.find((user) =>
    [
      user?.id,
      user?.userId,
      user?.user_id,
      user?.email,
    ].map(normalizeDevelopmentLeadKey).includes(assignedId),
  )
  if (assignedUser) {
    return normalizeDevelopmentLeadText(
      assignedUser.fullName ||
        [assignedUser.firstName, assignedUser.lastName].filter(Boolean).join(' ') ||
        assignedUser.email,
    ) || 'Assigned agent'
  }
  return normalizeDevelopmentLeadText(lead.assignedAgentEmail) || (assignedId ? 'Assigned agent' : 'Unassigned')
}

function getTransactionMonetaryValue(row = {}) {
  const numeric = Number(
    row?.transaction?.sales_price ??
      row?.transaction?.purchase_price ??
      row?.unit?.list_price ??
      row?.unit?.listPrice ??
      row?.unit?.price,
  )
  return Number.isFinite(numeric) ? numeric : 0
}

function getTransactionProgressPercent(row = {}) {
  const stageKey = resolveTransactionMainStage(row)
  const stageIndex = TRANSACTION_MAIN_STAGE_ORDER.indexOf(stageKey)
  if (stageIndex <= 0) return 0
  return Math.round((stageIndex / (TRANSACTION_MAIN_STAGE_ORDER.length - 1)) * 100)
}

function getTransactionProgressToneClass(stageKey) {
  if (stageKey === 'REG') {
    return 'bg-gradient-to-r from-[#16a34a] to-[#22c55e]'
  }

  if (['FIN', 'ATTY', 'XFER'].includes(stageKey)) {
    return 'bg-gradient-to-r from-[#f59e0b] to-[#fbbf24]'
  }

  return 'bg-gradient-to-r from-[#ef4444] to-[#f97316]'
}

function getTransactionStagePillClassName(stageKey) {
  if (stageKey === 'REG') {
    return 'border-[#b7e4c7] bg-[#f1fbf4] text-[#166534]'
  }

  if (['FIN', 'ATTY', 'XFER'].includes(stageKey)) {
    return 'border-[#f6dec7] bg-[#fff7ed] text-[#b45309]'
  }

  return 'border-[#f7d6d8] bg-[#fff5f5] text-[#b42318]'
}

function getHandoverPillClassName(status) {
  if (status === 'completed') {
    return 'border border-[#b7e4c7] bg-[#f1fbf4] text-[#166534]'
  }

  if (status === 'in_progress') {
    return 'border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]'
  }

  return 'border border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
}

function getSnagPillClassName(status) {
  if (status === 'open') {
    return 'border border-[#f5d7a8] bg-[#fff8eb] text-[#8a5a12]'
  }

  if (status === 'resolved') {
    return 'border border-[#b7e4c7] bg-[#f1fbf4] text-[#166534]'
  }

  return 'border border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
}

function getSnagSummaryLabel(snags = {}) {
  const totalCount = Number(snags.totalCount || 0)
  const openCount = Number(snags.openCount || 0)

  if (!totalCount) {
    return 'No snags'
  }

  if (!openCount) {
    return 'Resolved'
  }

  return `${openCount} open`
}

function normalizeSellerDetailsForm(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const signatories = Array.isArray(source.signatories) && source.signatories.length
    ? source.signatories
    : DEFAULT_SELLER_DETAILS_FORM.signatories

  return {
    ...DEFAULT_SELLER_DETAILS_FORM,
    mode: source.mode || DEFAULT_SELLER_DETAILS_FORM.mode,
    entityType: source.entityType || source.entity_type || DEFAULT_SELLER_DETAILS_FORM.entityType,
    legalName: source.legalName || source.legal_name || source.name || '',
    tradingName: source.tradingName || source.trading_name || '',
    registrationNumber: source.registrationNumber || source.registration_number || '',
    vatNumber: source.vatNumber || source.vat_number || '',
    registeredAddress: source.registeredAddress || source.registered_address || source.address || '',
    postalAddress: source.postalAddress || source.postal_address || '',
    email: source.email || '',
    phone: source.phone || source.mobile || '',
    vatTreatment: source.vatTreatment || source.vat_treatment || '',
    notes: source.notes || '',
    signatories: signatories.map((item = {}) => ({
      ...DEFAULT_SELLER_DETAILS_FORM.signatories[0],
      fullName: item.fullName || item.full_name || item.name || '',
      role: item.role || item.title || '',
      idNumber: item.idNumber || item.id_number || item.identityNumber || item.identity_number || '',
      email: item.email || '',
      phone: item.phone || item.mobile || '',
      signingCapacity: item.signingCapacity || item.signing_capacity || item.capacity || '',
    })),
  }
}

function buildDetailsForm(data) {
  const development = data?.development || {}
  const profile = data?.profile || {}
  const marketing = buildMarketingForm(profile, development)

  return {
    name: development.name || '',
    code: profile.code || development.code || '',
    location: profile.location || development.location || '',
    suburb: profile.suburb || development.suburb || '',
    city: profile.city || development.city || '',
    province: profile.province || development.province || '',
    country: profile.country || development.country || 'South Africa',
    address:
      profile.address ||
      profile.streetAddress ||
      profile.formattedAddress ||
      development.address ||
      development.street_address ||
      development.formatted_address ||
      '',
    status: profile.status || development.status || 'active',
    developerCompany: profile.developerCompany || development.developer_company || '',
    totalUnitsExpected:
      development.total_units_expected ?? development.planned_units ?? data?.stats?.totalUnits ?? 0,
    launchDate: normalizeDateInput(profile.launchDate || development.launch_date),
    expectedCompletionDate: normalizeDateInput(profile.expectedCompletionDate || development.expected_completion_date),
    description: marketing.listingOverview.listingDescription || profile.description || development.description || '',
    marketing,
    sellerDetails: normalizeSellerDetailsForm(profile.sellerDetails || profile.seller_details),
    handoverEnabled: development.handover_enabled ?? true,
    snagTrackingEnabled: development.snag_tracking_enabled ?? true,
    alterationsEnabled: development.alterations_enabled ?? false,
    onboardingEnabled: development.onboarding_enabled ?? true,
  }
}

function buildFinancialsForm(financials = {}) {
  return {
    landCost: normalizeMoneyInput(financials.landCost),
    buildCost: normalizeMoneyInput(financials.buildCost),
    professionalFees: normalizeMoneyInput(financials.professionalFees),
    marketingCost: normalizeMoneyInput(financials.marketingCost),
    infrastructureCost: normalizeMoneyInput(financials.infrastructureCost),
    otherCosts: normalizeMoneyInput(financials.otherCosts),
    totalProjectedCost: normalizeMoneyInput(financials.totalProjectedCost),
    projectedGrossSalesValue: normalizeMoneyInput(financials.projectedGrossSalesValue),
    projectedProfit: normalizeMoneyInput(financials.projectedProfit),
    targetMargin: normalizeMoneyInput(financials.targetMargin),
    notes: financials.notes || '',
  }
}

function buildReservationSettingsForm(settings = {}) {
  const paymentDetails =
    settings?.reservation_deposit_payment_details || settings?.reservationDepositPaymentDetails || {}
  const defaultAmount =
    settings?.reservation_deposit_amount ?? settings?.reservationDepositAmount ?? null
  const rolePlayerDefaults =
    settings?.rolePlayerDefaults ||
    settings?.role_player_defaults ||
    settings?.stakeholderTeams?.rolePlayerDefaults ||
    settings?.stakeholderTeams?.role_player_defaults ||
    settings?.stakeholder_teams?.rolePlayerDefaults ||
    settings?.stakeholder_teams?.role_player_defaults ||
    {}
  const buyerAppointedBondOriginatorAllowed = Boolean(
    rolePlayerDefaults?.buyerAppointedBondOriginatorAllowed ??
      rolePlayerDefaults?.buyer_appointed_bond_originator_allowed ??
      DEFAULT_RESERVATION_SETTINGS_FORM.buyerAppointedBondOriginatorAllowed,
  )

  return {
    enabledByDefault: Boolean(
      settings?.reservation_deposit_enabled_by_default ?? settings?.reservationDepositEnabledByDefault,
    ),
    defaultDepositAmount:
      defaultAmount === null || defaultAmount === undefined || defaultAmount === ''
        ? ''
        : String(defaultAmount),
    amountType:
      settings?.reservation_deposit_amount_type ||
      settings?.reservationDepositAmountType ||
      'fixed',
    vatTreatment:
      settings?.reservation_deposit_vat_treatment ||
      settings?.reservationDepositVatTreatment ||
      paymentDetails?.vat_treatment ||
      paymentDetails?.vatTreatment ||
      DEFAULT_RESERVATION_SETTINGS_FORM.vatTreatment,
    dueTrigger:
      settings?.reservation_deposit_due_trigger ||
      settings?.reservationDepositDueTrigger ||
      paymentDetails?.due_trigger ||
      paymentDetails?.dueTrigger ||
      DEFAULT_RESERVATION_SETTINGS_FORM.dueTrigger,
    depositTreatment:
      settings?.reservation_deposit_treatment ||
      settings?.reservationDepositTreatment ||
      'credited_to_purchase_price',
    payableTo:
      settings?.reservation_deposit_payable_to ||
      settings?.reservationDepositPayableTo ||
      'developer',
    alterationChargeTreatment:
      settings?.default_alteration_charge_treatment ||
      settings?.defaultAlterationChargeTreatment ||
      DEFAULT_RESERVATION_SETTINGS_FORM.alterationChargeTreatment,
    defaultTransferAttorneySource:
      rolePlayerDefaults?.defaultTransferAttorneySource ||
      rolePlayerDefaults?.default_transfer_attorney_source ||
      DEFAULT_RESERVATION_SETTINGS_FORM.defaultTransferAttorneySource,
    defaultBondOriginatorSource:
      rolePlayerDefaults?.defaultBondOriginatorSource ||
      rolePlayerDefaults?.default_bond_originator_source ||
      DEFAULT_RESERVATION_SETTINGS_FORM.defaultBondOriginatorSource,
    buyerAppointedBondOriginatorAllowed,
    buyerAppointedBondOriginatorRequiresApproval:
      buyerAppointedBondOriginatorAllowed &&
      Boolean(
        rolePlayerDefaults?.buyerAppointedBondOriginatorRequiresApproval ??
          rolePlayerDefaults?.buyer_appointed_bond_originator_requires_approval ??
          DEFAULT_RESERVATION_SETTINGS_FORM.buyerAppointedBondOriginatorRequiresApproval,
      ),
    autoInviteSelectedBondOriginator: Boolean(
      rolePlayerDefaults?.autoInviteSelectedBondOriginator ??
        rolePlayerDefaults?.auto_invite_selected_bond_originator ??
        DEFAULT_RESERVATION_SETTINGS_FORM.autoInviteSelectedBondOriginator,
    ),
    paymentReferenceFormat:
      paymentDetails?.payment_reference_format || paymentDetails?.paymentReferenceFormat || '',
    accountHolderName:
      paymentDetails?.account_holder_name || paymentDetails?.accountHolderName || '',
    bankName: paymentDetails?.bank_name || paymentDetails?.bankName || '',
    accountNumber: paymentDetails?.account_number || paymentDetails?.accountNumber || '',
    branchCode: paymentDetails?.branch_code || paymentDetails?.branchCode || '',
    accountType: paymentDetails?.account_type || paymentDetails?.accountType || '',
    paymentInstructions:
      paymentDetails?.payment_instructions || paymentDetails?.paymentInstructions || '',
  }
}

function buildUnitForm(unit = null) {
  if (!unit) return { ...DEFAULT_UNIT_FORM }
  return {
    id: unit.id || '',
    unitNumber: unit.unitNumber || '',
    unitLabel: unit.unitLabel || '',
    phase: unit.phase || '',
    block: unit.block || '',
    unitType: unit.unitType || '',
    bedrooms: unit.bedrooms ?? '',
    bathrooms: unit.bathrooms ?? '',
    parkingCount: unit.parkingCount ?? '',
    sizeSqm: unit.sizeSqm ?? '',
    listPrice: unit.listPrice ?? unit.price ?? '',
    currentPrice: unit.currentPrice ?? '',
    status: unit.status || 'Available',
    vatApplicable: unit.vatApplicable === null || unit.vatApplicable === undefined ? '' : String(Boolean(unit.vatApplicable)),
    floorplanId: unit.floorplanId || '',
    notes: unit.notes || '',
  }
}

function buildRecentActivity(rows = []) {
  return [...rows]
    .filter((row) => row?.transaction?.id)
    .sort((left, right) => new Date(right?.transaction?.updated_at || right?.transaction?.created_at || 0) - new Date(left?.transaction?.updated_at || left?.transaction?.created_at || 0))
    .slice(0, 5)
    .map((row) => ({
      id: row.transaction.id,
      reference: buildTransactionReference(row.transaction.id),
      unitNumber: row.unit?.unit_number || row.unit?.unitNumber || 'Unassigned',
      buyer: row.buyer?.name || 'No buyer assigned',
      stage: row.transaction?.stage || 'Available',
      updatedAt: row.transaction?.updated_at || row.transaction?.created_at,
      nextAction: getReportNextAction(row) || 'No next action captured',
    }))
}

function getBuyerAgeGroupLabel(buyer = {}) {
  const storedGroup = String(buyer?.age_group || '')
    .trim()
    .toLowerCase()
  if (storedGroup) {
    if (storedGroup.includes('18') || storedGroup.includes('24')) return '18-24'
    if (storedGroup.includes('25') || storedGroup.includes('34')) return '25-34'
    if (storedGroup.includes('35') || storedGroup.includes('44')) return '35-44'
    if (storedGroup.includes('45') || storedGroup.includes('54')) return '45-54'
    if (storedGroup.includes('55')) return '55+'
  }

  const dob = String(buyer?.date_of_birth || '').trim()
  if (!dob) return 'Unknown'

  const date = new Date(dob)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const monthDelta = now.getMonth() - date.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) {
    age -= 1
  }

  if (age >= 18 && age <= 24) return '18-24'
  if (age >= 25 && age <= 34) return '25-34'
  if (age >= 35 && age <= 44) return '35-44'
  if (age >= 45 && age <= 54) return '45-54'
  if (age >= 55) return '55+'
  return 'Unknown'
}

function normalizeBankLabel(value) {
  const normalized = String(value || '').trim()
  return normalized || 'Unknown'
}

function firstTextValue(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

function getAgencyInitials(name = '') {
  const initials = String(name || '')
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return initials || 'AG'
}

function resolveResponsibleAgency(row = {}, currentWorkspace = {}) {
  if (!row?.transaction?.id) {
    return null
  }

  const responsibleAgency = row?.responsibleAgency || row?.transaction?.responsibleAgency || {}
  const transactionOrganisationId = firstTextValue(
    row?.transaction?.organisation_id,
    row?.transaction?.organisationId,
  )
  const workspaceOrganisationId = firstTextValue(
    currentWorkspace?.id,
    currentWorkspace?.organisationId,
    currentWorkspace?.organisation_id,
    currentWorkspace?.raw?.organisation_id,
  )
  const canUseWorkspaceBranding = !transactionOrganisationId || transactionOrganisationId === workspaceOrganisationId
  const workspaceBranding = canUseWorkspaceBranding ? currentWorkspace : {}

  const name = firstTextValue(
    responsibleAgency?.displayName,
    responsibleAgency?.display_name,
    responsibleAgency?.name,
    row?.transaction?.organisationName,
    row?.transaction?.organisation_name,
    row?.transaction?.agencyName,
    row?.transaction?.agency_name,
    workspaceBranding?.displayName,
    workspaceBranding?.display_name,
    workspaceBranding?.name,
    workspaceBranding?.raw?.display_name,
    workspaceBranding?.raw?.name,
    'Responsible agency',
  )
  const logoUrl = firstTextValue(
    responsibleAgency?.logoUrl,
    responsibleAgency?.logo_url,
    responsibleAgency?.logoIconUrl,
    responsibleAgency?.logo_icon_url,
    row?.transaction?.organisationLogoUrl,
    row?.transaction?.organisation_logo_url,
    row?.transaction?.agencyLogoUrl,
    row?.transaction?.agency_logo_url,
    workspaceBranding?.logoUrl,
    workspaceBranding?.logo_url,
    workspaceBranding?.logoIconUrl,
    workspaceBranding?.logo_icon_url,
    workspaceBranding?.raw?.logo_url,
  )

  return {
    id: transactionOrganisationId || responsibleAgency?.id || workspaceOrganisationId || '',
    name,
    logoUrl,
  }
}

function ResponsibleAgencyBadge({ agency }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const name = firstTextValue(agency?.name, 'Responsible agency')
  const logoUrl = firstTextValue(agency?.logoUrl)

  if (!agency) {
    return (
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-[#d8e2ee] bg-[#f8fafc] text-xs font-semibold text-[#94a3b8]"
        title="No transaction agency yet"
      >
        -
      </span>
    )
  }

  return (
    <span
      className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[#dbe5ef] bg-white text-xs font-semibold text-[#24445f] shadow-sm"
      title={name}
    >
      {logoUrl && !logoFailed ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="h-full w-full object-contain p-1.5"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span>{getAgencyInitials(name)}</span>
      )}
    </span>
  )
}

function DevelopmentDetail() {
  const navigate = useNavigate()
  const { developmentId } = useParams()
  const { role, can, profile, currentWorkspace } = useWorkspace()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [marketingEditorSection, setMarketingEditorSection] = useState('overview')
  const [marketingUnitTab, setMarketingUnitTab] = useState('overview')
  const [marketingFeatureDraft, setMarketingFeatureDraft] = useState('')
  const [marketingHighlightDraft, setMarketingHighlightDraft] = useState('')
  const [selectedFloorplanId, setSelectedFloorplanId] = useState('')
  const [detailsForm, setDetailsForm] = useState(DEFAULT_DETAILS_FORM)
  const [developerProfileDefaults, setDeveloperProfileDefaults] = useState(() => normalizeOrganisationDeveloperProfile())
  const [organisationUsers, setOrganisationUsers] = useState([])
  const [organisationUsersLoading, setOrganisationUsersLoading] = useState(false)
  const [agentAssignments, setAgentAssignments] = useState([])
  const [selectedAgentUserId, setSelectedAgentUserId] = useState('')
  const [manualAgentDraft, setManualAgentDraft] = useState({ name: '', email: '' })
  const [developmentLeads, setDevelopmentLeads] = useState([])
  const [developmentLeadsLoading, setDevelopmentLeadsLoading] = useState(false)
  const [developmentLeadsError, setDevelopmentLeadsError] = useState('')
  const [financialsForm, setFinancialsForm] = useState(DEFAULT_FINANCIALS_FORM)
  const [reservationSettingsForm, setReservationSettingsForm] = useState(
    DEFAULT_RESERVATION_SETTINGS_FORM,
  )
  const [unitForm, setUnitForm] = useState(DEFAULT_UNIT_FORM)
  const [bulkUnitForm, setBulkUnitForm] = useState(DEFAULT_BULK_UNIT_FORM)
  const [documentForm, setDocumentForm] = useState(DEFAULT_DOCUMENT_FORM)
  const [developmentRequirements, setDevelopmentRequirements] = useState([])
  const [unitStatusFilter, setUnitStatusFilter] = useState('all')
  const [transactionSearch, setTransactionSearch] = useState('')
  const [transactionStageFilter, setTransactionStageFilter] = useState('all')
  const [commercialDocumentForms, setCommercialDocumentForms] = useState({
    conveyancing: { ...DEFAULT_COMMERCIAL_DOCUMENT_FORM },
    bond_originator: { ...DEFAULT_COMMERCIAL_DOCUMENT_FORM },
  })
  const [unitModalOpen, setUnitModalOpen] = useState(false)
  const [bulkUnitModalOpen, setBulkUnitModalOpen] = useState(false)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [agentAssignmentsSaving, setAgentAssignmentsSaving] = useState(false)
  const [financialsSaving, setFinancialsSaving] = useState(false)
  const [reservationSettingsSaving, setReservationSettingsSaving] = useState(false)
  const [isEditingFinancialsSection, setIsEditingFinancialsSection] = useState(false)
  const [unitSaving, setUnitSaving] = useState(false)
  const [unitStatusSavingId, setUnitStatusSavingId] = useState('')
  const [unitQuickSavingKey, setUnitQuickSavingKey] = useState('')
  const [bulkUnitSaving, setBulkUnitSaving] = useState(false)
  const [documentSaving, setDocumentSaving] = useState(false)
  const [documentDownloadingId, setDocumentDownloadingId] = useState('')
  const [marketingAssetUploading, setMarketingAssetUploading] = useState('')
  const [emailComposeOpen, setEmailComposeOpen] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [selectedDocumentForEmail, setSelectedDocumentForEmail] = useState(null)
  const [documentEmailForm, setDocumentEmailForm] = useState(DEFAULT_DOCUMENT_EMAIL_FORM)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [generalDetailsExpanded, setGeneralDetailsExpanded] = useState(false)
  const [sellerDetailsExpanded, setSellerDetailsExpanded] = useState(false)
  const [reservationSettingsExpanded, setReservationSettingsExpanded] = useState(true)
  const [isEditingGeneralDetails, setIsEditingGeneralDetails] = useState(false)
  const [isEditingSellerDetails, setIsEditingSellerDetails] = useState(false)
  const [isEditingReservationSettings, setIsEditingReservationSettings] = useState(false)
  const [externalAgentModalOpen, setExternalAgentModalOpen] = useState(false)

  const canManageDevelopment = can(PERMISSIONS.editDevelopments) || role === 'internal_admin'
  const canCreateTransactions = can(PERMISSIONS.manageDeveloperTransactions) || role === 'attorney'
  const canEditMarketing = canManageDevelopment || role === 'agent'
  const openDevelopmentTransactionWorkspace = useCallback(
    (record = {}) => {
      const transactionId = getDevelopmentRecordTransactionId(record)
      const route = resolveTransactionWorkspaceRoute({
        transactionId,
        developmentId:
          record?.developmentId ||
          record?.development?.id ||
          record?.unit?.development_id ||
          data?.development?.id,
        unitId: record?.unitId || record?.unit?.id,
        unitNumber: record?.unitNumber || record?.unit?.unit_number,
        transactionReference: record?.transactionReference || record?.reference || record?.transaction?.transaction_reference,
        title: record?.buyerName || record?.buyer?.name || record?.transaction?.transaction_reference || '',
      })

      if (route.kind === 'fallback') {
        setActiveTab('transactions')
        return
      }

      navigate(route.path, route.state ? { state: route.state } : undefined)
    },
    [data?.development?.id, navigate],
  )

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const [response, requirements] = await Promise.all([
        fetchDevelopmentDetail(developmentId),
        fetchDevelopmentDocumentRequirements(developmentId),
      ])
      setData(response)
      setDevelopmentRequirements(requirements)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [developmentId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    let active = true

    async function loadOrganisationUsers() {
      try {
        setOrganisationUsersLoading(true)
        const users = await listOrganisationUsers()
        if (active) {
          setOrganisationUsers(Array.isArray(users) ? users : [])
        }
      } catch {
        if (active) {
          setOrganisationUsers([])
        }
      } finally {
        if (active) {
          setOrganisationUsersLoading(false)
        }
      }
    }

    void loadOrganisationUsers()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadDeveloperProfileDefaults() {
      try {
        const response = await fetchOrganisationSettings()
        const profile = normalizeOrganisationDeveloperProfile(
          response?.organisation?.settingsJson?.developerProfile ||
            response?.organisationSettings?.developerProfile ||
            {},
        )
        if (active) {
          setDeveloperProfileDefaults(profile)
        }
      } catch {
        if (active) {
          setDeveloperProfileDefaults(normalizeOrganisationDeveloperProfile())
        }
      }
    }

    void loadDeveloperProfileDefaults()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadDevelopmentLeads() {
      const developmentOwnerOrgId = normalizeDevelopmentLeadText(
        data?.development?.organisation_id || data?.development?.organisationId,
      )
      const developerOrgId = developmentOwnerOrgId || normalizeDevelopmentLeadText(currentWorkspace?.id)
      if (!isSupabaseConfigured || !data?.development?.id || !developerOrgId || !developmentId) {
        setDevelopmentLeads([])
        setDevelopmentLeadsLoading(false)
        return
      }

      try {
        setDevelopmentLeadsLoading(true)
        setDevelopmentLeadsError('')
        const leadRows = await listDeveloperLeadIntake({ developerOrgId, status: 'all', source: 'all' })
        if (active) {
          setDevelopmentLeads((leadRows || []).filter((lead) => developmentLeadBelongsToDevelopment(lead, developmentId)))
        }
      } catch (leadError) {
        if (active) {
          setDevelopmentLeads([])
          setDevelopmentLeadsError(leadError?.message || 'Development leads could not be loaded.')
        }
      } finally {
        if (active) {
          setDevelopmentLeadsLoading(false)
        }
      }
    }

    void loadDevelopmentLeads()
    return () => {
      active = false
    }
  }, [currentWorkspace?.id, data?.development?.id, data?.development?.organisation_id, data?.development?.organisationId, developmentId])

  useEffect(() => {
    function refreshDevelopment() {
      void loadData()
    }

    window.addEventListener('itg:transaction-created', refreshDevelopment)
    window.addEventListener('itg:transaction-updated', refreshDevelopment)
    window.addEventListener('itg:document-requirements-changed', refreshDevelopment)
    window.addEventListener('itg:developments-changed', refreshDevelopment)
    return () => {
      window.removeEventListener('itg:transaction-created', refreshDevelopment)
      window.removeEventListener('itg:transaction-updated', refreshDevelopment)
      window.removeEventListener('itg:document-requirements-changed', refreshDevelopment)
      window.removeEventListener('itg:developments-changed', refreshDevelopment)
    }
  }, [loadData])

  useEffect(() => {
    if (!data) return
    setDetailsForm(buildDetailsForm(data))
    setFinancialsForm(buildFinancialsForm(data.financials))
    setReservationSettingsForm(buildReservationSettingsForm(data.settings))
    setAgentAssignments(getDevelopmentAgentAssignments(data.settings))
    setSelectedAgentUserId('')
    setManualAgentDraft({ name: '', email: '' })
    setIsEditingGeneralDetails(false)
    setIsEditingSellerDetails(false)
    setIsEditingReservationSettings(false)
    setIsEditingFinancialsSection(false)
    const nextReservationForm = buildReservationSettingsForm(data.settings)
    const reservationNeedsSetup =
      nextReservationForm.enabledByDefault && validateReservationSettingsForm(nextReservationForm).length > 0
    setReservationSettingsExpanded((previous) => previous || reservationNeedsSetup)
  }, [data])

  const rows = useMemo(() => data?.rows || [], [data?.rows])
  const documents = useMemo(() => data?.documents || [], [data?.documents])
  const alterations = useMemo(() => data?.alterations || [], [data?.alterations])
  const developmentLeadAccessKeys = useMemo(
    () => buildDevelopmentLeadAccessKeys(profile, organisationUsers),
    [organisationUsers, profile],
  )
  const developmentLeadRows = useMemo(
    () =>
      [...developmentLeads].sort(
        (left, right) => new Date(right?.updatedAt || right?.createdAt || 0) - new Date(left?.updatedAt || left?.createdAt || 0),
      ),
    [developmentLeads],
  )
  const developmentLeadFunnelItems = useMemo(() => {
    const counts = new Map(DEVELOPMENT_LEAD_FUNNEL_STAGES.map((stage) => [stage.key, 0]))
    let protectedCount = 0

    developmentLeadRows.forEach((lead) => {
      const status = normalizeDevelopmentLeadKey(lead?.leadStatus || 'new')
      const stage = DEVELOPMENT_LEAD_FUNNEL_STAGES.find((item) => item.statuses.includes(status)) || DEVELOPMENT_LEAD_FUNNEL_STAGES[0]
      counts.set(stage.key, Number(counts.get(stage.key) || 0) + 1)
      if (!canViewDevelopmentLeadPrivateDetails(lead, developmentLeadAccessKeys)) {
        protectedCount += 1
      }
    })

    return {
      total: developmentLeadRows.length,
      protectedCount,
      items: DEVELOPMENT_LEAD_FUNNEL_STAGES.map((stage) => ({
        ...stage,
        count: Number(counts.get(stage.key) || 0),
      })),
    }
  }, [developmentLeadAccessKeys, developmentLeadRows])
  const bondEligibleRows = useMemo(
    () => rows.filter((row) => ['bond', 'combination'].includes(String(row?.transaction?.finance_type || '').toLowerCase())),
    [rows],
  )
  const conveyancingDocuments = useMemo(
    () => documents.filter((item) => item.documentType === 'legal' && item.linkedUnitType === 'conveyancing'),
    [documents],
  )
  const bondOriginatorDocuments = useMemo(
    () => documents.filter((item) => item.documentType === 'legal' && item.linkedUnitType === 'bond_originator'),
    [documents],
  )

  const totalListedStockValue = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row?.unit?.list_price || row?.unit?.price || row?.unit?.listPrice || 0), 0),
    [rows],
  )

  const availableStockValue = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const hasTransaction = Boolean(row?.transaction?.id)
        const unitStatus = row?.unit?.status || 'Available'
        if (hasTransaction || !isAvailableDevelopmentUnitStatus(unitStatus)) {
          return sum
        }

        return sum + Number(row?.unit?.list_price || row?.unit?.price || row?.unit?.listPrice || 0)
      }, 0),
    [rows],
  )

  const summaryItems = useMemo(() => {
    const allUnitIds = new Set()
    const availableUnitIds = new Set()
    const inProgressUnitIds = new Set()
    const registeredUnitIds = new Set()
    let pipelineValue = 0
    let revenueSecuredValue = 0

    for (const row of rows) {
      const unitId = row?.unit?.id || row?.unit?.unit_number || null
      const unitIdKey = unitId ? String(unitId) : null
      const mainStageKey = resolveDevelopmentTrackerMainStage(row)

      if (unitIdKey) {
        allUnitIds.add(unitIdKey)
        if (mainStageKey === 'AVAIL') {
          availableUnitIds.add(unitIdKey)
        }
      }

      if (mainStageKey === 'AVAIL' || mainStageKey === 'BLOCKED') {
        continue
      }

      const dealValue = getTransactionMonetaryValue(row)

      if (mainStageKey === 'REG') {
        if (unitIdKey) {
          registeredUnitIds.add(unitIdKey)
        }
        revenueSecuredValue += dealValue
      } else {
        if (unitIdKey) {
          inProgressUnitIds.add(unitIdKey)
        }
        pipelineValue += dealValue
      }
    }

    const totalUnits = allUnitIds.size || Number(data?.stats?.totalUnits || 0)
    const soldThroughUnits = registeredUnitIds.size + inProgressUnitIds.size
    const soldPercent = totalUnits > 0 ? (soldThroughUnits / totalUnits) * 100 : 0

    return [
      {
        label: 'Available Units',
        value: formatNumber(availableUnitIds.size),
        meta: `of ${formatNumber(totalUnits)} total`,
        icon: Home,
      },
      {
        label: 'Active Transactions',
        value: formatNumber(inProgressUnitIds.size),
        meta: 'in progress',
        icon: Workflow,
      },
      {
        label: 'Revenue Secured',
        value: currency.format(revenueSecuredValue),
        meta: `from ${formatNumber(registeredUnitIds.size)} unit${registeredUnitIds.size === 1 ? '' : 's'}`,
        icon: CircleDollarSign,
      },
      {
        label: 'Pipeline Value',
        value: currency.format(pipelineValue),
        meta: 'potential revenue',
        icon: Receipt,
      },
      {
        label: 'Sell Through',
        value: formatPercent(soldPercent),
        meta: `${formatNumber(soldThroughUnits)} of ${formatNumber(totalUnits)} units`,
        icon: TrendingUp,
      },
    ]
  }, [data?.stats?.totalUnits, rows])

  const developmentMetrics = useMemo(() => selectPortfolioMetrics(rows, { totalDevelopmentsOverride: 1 }), [rows])
  const developmentStageDistribution = useMemo(() => selectStageDistribution(rows), [rows])
  const developmentBottleneckSummary = useMemo(() => selectDealBottleneckSummary(rows), [rows])
  const developmentPerformance = useMemo(() => selectDevelopmentPerformance(rows)[0] || null, [rows])
  const developmentTrackerStageCounts = useMemo(() => {
    const counts = { AVAIL: 0, DEP: 0, OTP: 0, FIN: 0, ATTY: 0, XFER: 0, REG: 0, BLOCKED: 0 }
    rows.forEach((row) => {
      const stageKey = resolveDevelopmentTrackerMainStage(row)
      counts[stageKey] = Number(counts[stageKey] || 0) + 1
    })
    return counts
  }, [rows])
  const developmentTrackerMetrics = useMemo(() => {
    const available = Number(developmentTrackerStageCounts.AVAIL || 0)
    const inProgress =
      Number(developmentTrackerStageCounts.DEP || 0) +
      Number(developmentTrackerStageCounts.OTP || 0) +
      Number(developmentTrackerStageCounts.FIN || 0) +
      Number(developmentTrackerStageCounts.ATTY || 0) +
      Number(developmentTrackerStageCounts.XFER || 0)
    const registered = Number(developmentTrackerStageCounts.REG || 0)
    const sold = inProgress + registered
    const totalUnits = rows.length || Number(developmentMetrics.totalUnits || 0)

    return {
      totalUnits,
      unitsAvailable: available,
      dealsInProgress: inProgress,
      unitsRegistered: registered,
      unitsSold: sold,
      sellThroughPercent: totalUnits > 0 ? (sold / totalUnits) * 100 : 0,
    }
  }, [developmentMetrics.totalUnits, developmentTrackerStageCounts, rows.length])
  const financeMix = useMemo(() => {
    const segments = selectFinanceMix(rows)
    const totalCount = segments.reduce((sum, item) => sum + item.count, 0)
    const colors = {
      cash: '#375c78',
      bond: '#22c55e',
      combination: '#2f6fec',
      unknown: '#cbd5e1',
    }

    let cursor = 0
    const gradientParts = segments
      .filter((item) => item.count > 0)
      .map((item) => {
        const percent = totalCount ? (item.count / totalCount) * 100 : 0
        const start = cursor
        const end = cursor + percent
        cursor = end
        return `${colors[item.key] || colors.unknown} ${start}% ${end}%`
      })

    return {
      segments,
      totalCount,
      gradient: gradientParts.length ? `conic-gradient(${gradientParts.join(', ')})` : 'conic-gradient(#e2e8f0 0% 100%)',
      colors,
      cashShare: totalCount ? Math.round(((segments.find((item) => item.key === 'cash')?.count || 0) / totalCount) * 100) : 0,
      bondShare: totalCount ? Math.round(((segments.find((item) => item.key === 'bond')?.count || 0) / totalCount) * 100) : 0,
      hybridDeals: segments.find((item) => item.key === 'combination')?.count || 0,
      averageDealValue: totalCount ? segments.reduce((sum, item) => sum + Number(item.value || 0), 0) / totalCount : 0,
    }
  }, [rows])

  const overviewSalesProgress = useMemo(() => {
    const baseTotal = Number(detailsForm.totalUnitsExpected || developmentTrackerMetrics.totalUnits || 0)
    const available = Number(developmentTrackerMetrics.unitsAvailable || 0)
    const inProgress = Number(developmentTrackerMetrics.dealsInProgress || 0)
    const completed = Number(developmentTrackerMetrics.unitsRegistered || 0)
    const calculatedTotal = available + inProgress + completed
    const totalUnits = Math.max(baseTotal, calculatedTotal)
    const sellThroughPercent = Number(developmentTrackerMetrics.sellThroughPercent || developmentPerformance?.sellThroughPercent || 0)
    const safeTotal = totalUnits > 0 ? totalUnits : 1

    return {
      totalUnits,
      available,
      inProgress,
      completed,
      sellThroughPercent,
      availableWidth: (available / safeTotal) * 100,
      inProgressWidth: (inProgress / safeTotal) * 100,
      completedWidth: (completed / safeTotal) * 100,
    }
  }, [
    developmentTrackerMetrics.dealsInProgress,
    developmentTrackerMetrics.sellThroughPercent,
    developmentTrackerMetrics.totalUnits,
    developmentTrackerMetrics.unitsAvailable,
    developmentTrackerMetrics.unitsRegistered,
    developmentPerformance?.sellThroughPercent,
    detailsForm.totalUnitsExpected,
  ])

  const buyerAgeInsights = useMemo(() => {
    const buckets = [
      { key: '18-24', label: '18-24', count: 0 },
      { key: '25-34', label: '25-34', count: 0 },
      { key: '35-44', label: '35-44', count: 0 },
      { key: '45-54', label: '45-54', count: 0 },
      { key: '55+', label: '55+', count: 0 },
      { key: 'Unknown', label: 'Unknown', count: 0 },
    ]
    const seenBuyerIds = new Set()

    rows.forEach((row) => {
      const buyerId = row?.buyer?.id || null
      if (buyerId && seenBuyerIds.has(buyerId)) {
        return
      }
      if (buyerId) {
        seenBuyerIds.add(buyerId)
      }

      const label = getBuyerAgeGroupLabel(row?.buyer || {})
      const bucket = buckets.find((item) => item.key === label) || buckets.find((item) => item.key === 'Unknown')
      if (bucket) {
        bucket.count += 1
      }
    })

    const total = buckets.reduce((sum, item) => sum + item.count, 0)
    const maxCount = buckets.reduce((max, item) => Math.max(max, item.count), 0) || 1

    return {
      total,
      items: buckets
        .filter((item) => item.count > 0 || item.key !== 'Unknown')
        .map((item) => ({
          ...item,
          width: (item.count / maxCount) * 100,
          share: total > 0 ? (item.count / total) * 100 : 0,
        })),
    }
  }, [rows])

  const cashBondInsights = useMemo(() => {
    let cash = 0
    let bond = 0
    let unknown = 0

    rows.forEach((row) => {
      if (!row?.transaction?.id) {
        return
      }

      const type = String(row?.transaction?.finance_type || '')
        .trim()
        .toLowerCase()

      if (type === 'cash') {
        cash += 1
      } else if (type === 'bond' || type === 'combination' || type === 'hybrid') {
        bond += 1
      } else {
        unknown += 1
      }
    })

    const total = cash + bond + unknown
    return {
      total,
      cash,
      bond,
      unknown,
      cashShare: total > 0 ? Math.round((cash / total) * 100) : 0,
      bondShare: total > 0 ? Math.round((bond / total) * 100) : 0,
    }
  }, [rows])

  const bondBankInsights = useMemo(() => {
    const bankMap = new Map()

    rows.forEach((row) => {
      if (!row?.transaction?.id) {
        return
      }

      const type = String(row?.transaction?.finance_type || '')
        .trim()
        .toLowerCase()

      if (!['bond', 'combination', 'hybrid'].includes(type)) {
        return
      }

      const bankLabel = normalizeBankLabel(row?.transaction?.bank)
      bankMap.set(bankLabel, (bankMap.get(bankLabel) || 0) + 1)
    })

    const items = [...bankMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    const total = items.reduce((sum, item) => sum + item.count, 0)
    const maxCount = items.reduce((max, item) => Math.max(max, item.count), 0) || 1

    return {
      total,
      items: items.map((item) => ({
        ...item,
        width: (item.count / maxCount) * 100,
        share: total > 0 ? (item.count / total) * 100 : 0,
      })),
    }
  }, [rows])

  const recentActivity = useMemo(() => buildRecentActivity(rows), [rows])
  const floorplanTitleByDocumentId = useMemo(() => {
    const map = new Map()
    ;(data?.documents || []).forEach((document) => {
      if (String(document?.documentType || '').toLowerCase() !== 'floorplan') {
        return
      }

      if (document?.id) {
        map.set(document.id, String(document.title || '').trim() || 'Floorplan')
      }
    })
    return map
  }, [data?.documents])

  const floorplanTitlesByUnitType = useMemo(() => {
    const map = new Map()
    ;(data?.documents || []).forEach((document) => {
      if (String(document?.documentType || '').toLowerCase() !== 'floorplan') {
        return
      }

      const unitTypeKey = String(document?.linkedUnitType || '')
        .trim()
        .toLowerCase()
      if (!unitTypeKey) {
        return
      }

      if (!map.has(unitTypeKey)) {
        map.set(unitTypeKey, [])
      }

      const title = String(document?.title || '').trim()
      if (title) {
        map.get(unitTypeKey).push(title)
      }
    })
    return map
  }, [data?.documents])

  const unitRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row.unit,
        currentTransactionId: row.transaction?.id || null,
        buyerName: row.buyer?.name || '',
        transactionStage: row.transaction?.stage || row.stage || 'Available',
        handover: row.handover || null,
        snagSummary: row.snagSummary || null,
        salesPrice:
          row?.transaction?.sales_price ??
          row?.transaction?.purchase_price ??
          row?.unit?.currentPrice ??
          null,
        floorplanName:
          (row?.unit?.floorplanId ? floorplanTitleByDocumentId.get(row.unit.floorplanId) : null) ||
          floorplanTitlesByUnitType.get(String(row?.unit?.unitType || '').trim().toLowerCase())?.[0] ||
          '',
        lastUpdated:
          row.transaction?.updated_at ||
          row.transaction?.created_at ||
          row.handover?.updatedAt ||
          row.handover?.createdAt ||
          row.snagSummary?.latestUpdatedAt ||
          null,
      })),
    [floorplanTitleByDocumentId, floorplanTitlesByUnitType, rows],
  )
  const unitStructureConfig = useMemo(() => {
    const hasPhase = unitRows.some((unit) => String(unit?.phase || '').trim().length > 0)
    const hasBlock = unitRows.some((unit) => String(unit?.block || '').trim().length > 0)

    if (hasPhase && hasBlock) {
      return { mode: 'phase_and_block', label: 'Phase / Block' }
    }

    if (hasPhase) {
      return { mode: 'phase', label: 'Phase' }
    }

    if (hasBlock) {
      return { mode: 'block', label: 'Block' }
    }

    return { mode: 'none', label: '' }
  }, [unitRows])
  const numericUnitNumbers = useMemo(
    () =>
      unitRows
        .map((unit) => Number.parseInt(String(unit?.unitNumber || unit?.unit_number || '').trim(), 10))
        .filter((value) => Number.isFinite(value)),
    [unitRows],
  )
  const suggestedBulkStartNumber = useMemo(() => (numericUnitNumbers.length ? Math.max(...numericUnitNumbers) + 1 : 1), [numericUnitNumbers])
  const expectedUnitCount = Number(detailsForm.totalUnitsExpected || 0)
  const remainingPlannedUnits = Math.max(expectedUnitCount - unitRows.length, 0)

  const filteredUnits = useMemo(() => {
    const selectedStatus = getDevelopmentUnitStatusOption(unitStatusFilter)
    const scopedUnits =
      unitStatusFilter === 'all'
        ? [...unitRows]
        : unitRows.filter((unit) => getDevelopmentUnitStatusOption(unit?.status).value === selectedStatus.value)

    return scopedUnits.sort((left, right) => {
      if (unitStructureConfig.mode === 'phase') {
        const leftPhase = String(left?.phase || '').toLowerCase()
        const rightPhase = String(right?.phase || '').toLowerCase()
        if (leftPhase !== rightPhase) {
          return leftPhase.localeCompare(rightPhase)
        }
      } else if (unitStructureConfig.mode === 'block') {
        const leftBlock = String(left?.block || '').toLowerCase()
        const rightBlock = String(right?.block || '').toLowerCase()
        if (leftBlock !== rightBlock) {
          return leftBlock.localeCompare(rightBlock)
        }
      } else if (unitStructureConfig.mode === 'phase_and_block') {
        const leftPhase = String(left?.phase || '').toLowerCase()
        const rightPhase = String(right?.phase || '').toLowerCase()
        if (leftPhase !== rightPhase) {
          return leftPhase.localeCompare(rightPhase)
        }

        const leftBlock = String(left?.block || '').toLowerCase()
        const rightBlock = String(right?.block || '').toLowerCase()
        if (leftBlock !== rightBlock) {
          return leftBlock.localeCompare(rightBlock)
        }
      }

      return String(left?.unitNumber || '').localeCompare(String(right?.unitNumber || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    })
  }, [unitRows, unitStatusFilter, unitStructureConfig.mode])

  const transactionRows = useMemo(() => {
    return rows
      .filter((row) => {
        if (!row?.unit?.id) {
          return false
        }

        const mainStageKey = resolveDevelopmentTrackerMainStage(row)
        if (!row?.transaction?.id && (mainStageKey === 'AVAIL' || mainStageKey === 'BLOCKED')) {
          return false
        }

        const stageLabel = row?.transaction?.stage || row?.unit?.status || ''
        const searchHaystack = `${row?.unit?.unit_number || ''} ${row?.buyer?.name || ''} ${row?.buyer?.email || ''} ${stageLabel}`.toLowerCase()
        const matchesSearch = !transactionSearch.trim() || searchHaystack.includes(transactionSearch.trim().toLowerCase())
        const matchesStage =
          transactionStageFilter === 'all' ||
          normalizeUnitStatusKey(stageLabel) === normalizeUnitStatusKey(transactionStageFilter)
        return matchesSearch && matchesStage
      })
      .map((row) => {
        const mainStageKey = resolveDevelopmentTrackerMainStage(row)
        const isManualUnitStatus = !row?.transaction?.id
        return {
          ...row,
          mainStageKey,
          isManualUnitStatus,
          responsibleAgency: resolveResponsibleAgency(row, currentWorkspace),
          progressPercent: isManualUnitStatus ? getDevelopmentTrackerProgressPercent(mainStageKey) : getTransactionProgressPercent(row),
          buyerDisplayName: row?.buyer?.name || (isManualUnitStatus ? 'External / direct sale' : 'No buyer assigned'),
          buyerEmail: row?.buyer?.email || (isManualUnitStatus ? 'Manual stock update' : 'No email'),
        }
      })
  }, [currentWorkspace, rows, transactionSearch, transactionStageFilter])
  const assignedAgentKeys = useMemo(
    () => new Set(agentAssignments.map((member) => buildAgentAssignmentKey(member))),
    [agentAssignments],
  )
  const assignableAgentOptions = useMemo(
    () =>
      organisationUsers
        .filter(isAssignableDevelopmentAgent)
        .map(buildDevelopmentAgentAssignmentFromUser)
        .filter(Boolean)
        .filter((member) => !assignedAgentKeys.has(buildAgentAssignmentKey(member)))
        .sort((left, right) => String(left.name || left.email).localeCompare(String(right.name || right.email))),
    [assignedAgentKeys, organisationUsers],
  )
  const bulkUnitStepIndex = useMemo(
    () => Math.max(0, BULK_UNIT_STEPS.findIndex((step) => step.id === bulkUnitForm.step)),
    [bulkUnitForm.step],
  )
  const bulkPreviewRows = useMemo(
    () => (bulkUnitForm.step === 'review' && bulkUnitForm.generatedRows.length
      ? bulkUnitForm.generatedRows
      : buildBulkUnitRows(bulkUnitForm)),
    [bulkUnitForm],
  )
  const selectedUnitRow = useMemo(
    () => unitRows.find((unit) => unit.id === unitForm.id) || null,
    [unitForm.id, unitRows],
  )
  const featuredActiveRows = useMemo(() => selectActiveTransactions(rows).slice(0, 8), [rows])
  const marketingForm = useMemo(() => normalizeMarketingContentForm(detailsForm.marketing), [detailsForm.marketing])
  const marketingFloorplanPriceRange = useMemo(() => {
    const values = marketingForm.floorplans
      .flatMap((item) => [
        parseMarketingAmount(item?.priceFrom),
        parseMarketingAmount(item?.priceTo),
        parseMarketingAmount(item?.price),
      ])
      .filter((value) => Number.isFinite(value) && value > 0)

    if (!values.length) {
      return ''
    }

    const low = Math.min(...values)
    const high = Math.max(...values)
    return low === high ? currency.format(low) : `${currency.format(low)} - ${currency.format(high)}`
  }, [marketingForm.floorplans])
  const selectedMarketingFloorplan = useMemo(() => {
    if (!marketingForm.floorplans.length) {
      return null
    }

    return (
      marketingForm.floorplans.find((item) => item.id === selectedFloorplanId) ||
      marketingForm.floorplans[0]
    )
  }, [marketingForm.floorplans, selectedFloorplanId])
  const marketingUnitTypeStats = useMemo(() => {
    const stats = new Map()
    marketingForm.floorplans.forEach((floorplan) => {
      stats.set(floorplan.id, {
        total: 0,
        available: 0,
        inProgress: 0,
      })
    })

    unitRows.forEach((unit) => {
      const matchedFloorplan = marketingForm.floorplans.find((floorplan) => {
        const floorplanNameKey = normalizeMarketingUnitKey(floorplan.name)
        return (
          normalizeMarketingUnitKey(unit.floorplanName) === floorplanNameKey ||
          normalizeMarketingUnitKey(unit.unitType) === floorplanNameKey ||
          normalizeMarketingUnitKey(unit.floorplanId) === normalizeMarketingUnitKey(floorplan.id)
        )
      })

      if (!matchedFloorplan) return
      const currentStats = stats.get(matchedFloorplan.id) || { total: 0, available: 0, inProgress: 0 }
      const available = !unit.currentTransactionId && isAvailableDevelopmentUnitStatus(unit.status)
      stats.set(matchedFloorplan.id, {
        total: currentStats.total + 1,
        available: currentStats.available + (available ? 1 : 0),
        inProgress: currentStats.inProgress + (available ? 0 : 1),
      })
    })

    return stats
  }, [marketingForm.floorplans, unitRows])
  const selectedMarketingUnitStats = useMemo(
    () =>
      selectedMarketingFloorplan
        ? marketingUnitTypeStats.get(selectedMarketingFloorplan.id) || { total: 0, available: 0, inProgress: 0 }
        : { total: 0, available: 0, inProgress: 0 },
    [marketingUnitTypeStats, selectedMarketingFloorplan],
  )
  const marketingAssetDocuments = useMemo(
    () =>
      documents
        .map((item) => ({
          id: item.id,
          type: String(item.documentType || 'other').toLowerCase(),
          typeLabel: getDocTypeLabel(item.documentType),
          title: item.title || 'Untitled asset',
          description: item.description || '',
          fileUrl: item.fileUrl || '',
          linkedUnitType: item.linkedUnitType || item.linked_unit_type || '',
        }))
        .filter((item) => item.fileUrl),
    [documents],
  )
  const selectedMarketingUnitAssets = useMemo(() => {
    if (!selectedMarketingFloorplan) return []
    const selectedKeys = new Set(
      [selectedMarketingFloorplan.id, selectedMarketingFloorplan.name]
        .map((value) => normalizeMarketingUnitKey(value))
        .filter(Boolean),
    )
    const knownUnitKeys = new Set(
      marketingForm.floorplans
        .flatMap((item) => [item.id, item.name])
        .map((value) => normalizeMarketingUnitKey(value))
        .filter(Boolean),
    )
    const shouldRecoverUnmatchedAssets = marketingForm.floorplans.length === 1

    return marketingAssetDocuments.filter((item) => {
      const linkedUnitKey = normalizeMarketingUnitKey(item.linkedUnitType)
      if (selectedKeys.has(linkedUnitKey)) return true
      return shouldRecoverUnmatchedAssets && (!linkedUnitKey || !knownUnitKeys.has(linkedUnitKey))
    })
  }, [marketingAssetDocuments, marketingForm.floorplans, selectedMarketingFloorplan])
  const selectedMarketingUnitImageDocuments = useMemo(
    () =>
      selectedMarketingUnitAssets.filter(
        (item) => ['marketing', 'logo'].includes(item.type) && isLikelyImageUrl(item.fileUrl),
      ),
    [selectedMarketingUnitAssets],
  )
  const selectedMarketingUnitFloorplanDocuments = useMemo(
    () => selectedMarketingUnitAssets.filter((item) => item.type === 'floorplan'),
    [selectedMarketingUnitAssets],
  )
  const selectedMarketingUnitDocumentAssets = useMemo(
    () =>
      selectedMarketingUnitAssets.filter((item) =>
        ['pricing', 'specification', 'legal', 'other', 'site_plan'].includes(item.type),
      ),
    [selectedMarketingUnitAssets],
  )
  const selectedMarketingUnitVideoDocuments = useMemo(
    () => selectedMarketingUnitAssets.filter((item) => item.type === 'video'),
    [selectedMarketingUnitAssets],
  )
  const selectedMarketingUnitVirtualTourDocuments = useMemo(
    () => selectedMarketingUnitAssets.filter((item) => item.type === 'virtual_tour'),
    [selectedMarketingUnitAssets],
  )
  const marketingLogoDocument = useMemo(
    () => marketingAssetDocuments.find((item) => item.type === 'logo') || null,
    [marketingAssetDocuments],
  )
  const marketingGalleryDocuments = useMemo(
    () => marketingAssetDocuments.filter((item) => ['marketing', 'logo'].includes(item.type)),
    [marketingAssetDocuments],
  )
  const marketingVideoDocuments = useMemo(
    () => marketingAssetDocuments.filter((item) => item.type === 'video'),
    [marketingAssetDocuments],
  )
  const marketingVirtualTourDocuments = useMemo(
    () => marketingAssetDocuments.filter((item) => item.type === 'virtual_tour'),
    [marketingAssetDocuments],
  )
  const marketingCoverImageUrl = useMemo(
    () =>
      marketingForm.mediaLibrary.heroImageUrl ||
      marketingGalleryDocuments.find((item) => item.type === 'marketing' && isLikelyImageUrl(item.fileUrl))?.fileUrl ||
      '',
    [marketingForm.mediaLibrary.heroImageUrl, marketingGalleryDocuments],
  )
  const developmentHeroImageUrl = useMemo(() => {
    const explicitDevelopmentCover =
      data?.development?.primary_image_url ||
      data?.development?.primaryImageUrl ||
      data?.development?.cover_image_url ||
      data?.development?.coverImageUrl ||
      data?.development?.hero_image_url ||
      data?.development?.heroImageUrl ||
      ''

    return String(explicitDevelopmentCover || marketingCoverImageUrl || '').trim()
  }, [
    data?.development?.coverImageUrl,
    data?.development?.cover_image_url,
    data?.development?.heroImageUrl,
    data?.development?.hero_image_url,
    data?.development?.primaryImageUrl,
    data?.development?.primary_image_url,
    marketingCoverImageUrl,
  ])
  const marketingLogoUrl = useMemo(
    () => marketingForm.mediaLibrary.developmentLogoUrl || marketingLogoDocument?.fileUrl || '',
    [marketingForm.mediaLibrary.developmentLogoUrl, marketingLogoDocument],
  )
  const floorplanDocumentOptions = useMemo(
    () => marketingAssetDocuments.filter((item) => item.type === 'floorplan'),
    [marketingAssetDocuments],
  )
  const marketingAssetGroups = useMemo(
    () => [
      {
        key: 'gallery',
        title: 'Gallery & Branding',
        items: marketingAssetDocuments.filter((item) => ['marketing', 'logo'].includes(item.type)),
      },
      {
        key: 'plans',
        title: 'Plans & Layouts',
        items: marketingAssetDocuments.filter((item) => ['floorplan', 'site_plan'].includes(item.type)),
      },
      {
        key: 'documents',
        title: 'Sales & Compliance Assets',
        items: marketingAssetDocuments.filter((item) =>
          ['pricing', 'specification', 'legal', 'other'].includes(item.type),
        ),
      },
    ],
    [marketingAssetDocuments],
  )
  const marketingReadinessSummary = useMemo(() => {
    const highlightsCount = parseSellingPointEntries(marketingForm.sellingPoints.items).length
    const descriptionStatus = String(marketingForm.listingOverview.listingDescription || '').trim()
      ? 'Written'
      : 'Not written'

    return {
      descriptionStatus,
      assetCount: marketingAssetDocuments.length,
      floorplanCount: marketingForm.floorplans.length,
      highlightsCount,
      listingStatus: marketingForm.listingOverview.listingStatus || 'draft',
    }
  }, [marketingAssetDocuments.length, marketingForm])
  const marketingSellingPointEntries = useMemo(
    () => parseSellingPointEntries(marketingForm.sellingPoints.items),
    [marketingForm.sellingPoints.items],
  )
  const marketingAgencyEntries = useMemo(
    () =>
      (Array.isArray(marketingForm.agencies) ? marketingForm.agencies : [])
        .map((item, index) => normalizeMarketingAgency(item, index + 1)),
    [marketingForm.agencies],
  )

  useEffect(() => {
    if (!marketingForm.floorplans.length) {
      if (selectedFloorplanId) {
        setSelectedFloorplanId('')
      }
      return
    }

    const selectedExists = marketingForm.floorplans.some((item) => item.id === selectedFloorplanId)
    if (!selectedExists) {
      setSelectedFloorplanId(marketingForm.floorplans[0].id)
    }
  }, [marketingForm.floorplans, selectedFloorplanId])

  useEffect(() => {
    if (activeTab !== 'marketing' && marketingEditorSection !== 'overview') {
      setMarketingEditorSection('overview')
    }
  }, [activeTab, marketingEditorSection])

  const locationLine = [detailsForm.location, detailsForm.suburb || detailsForm.city || detailsForm.province].filter(Boolean).join(' • ')
  const generalDetailsFieldClassName = isEditingGeneralDetails ? '' : READ_ONLY_FIELD_CLASS
  const sellerDetailsFieldClassName = isEditingSellerDetails ? '' : READ_ONLY_FIELD_CLASS
  const financialFieldClassName = isEditingFinancialsSection ? '' : READ_ONLY_FIELD_CLASS
  const sellerDetailsForm = normalizeSellerDetailsForm(detailsForm.sellerDetails)
  const primarySellerSignatory = sellerDetailsForm.signatories[0] || DEFAULT_SELLER_DETAILS_FORM.signatories[0]
  const sellerDetailsComplete = validateSellerDetailsForm(sellerDetailsForm).length === 0
  const reservationDepositAmount = getReservationDepositAmountValue(reservationSettingsForm)
  const reservationDepositSummary = getReservationDepositSummary(reservationSettingsForm)
  const reservationDepositConfigured =
    !reservationSettingsForm.enabledByDefault || validateReservationSettingsForm(reservationSettingsForm).length === 0
  const generalSummaryLocation = [detailsForm.name || data?.development?.name, detailsForm.suburb || detailsForm.location, detailsForm.city].filter(Boolean).join(' · ')
  const generalSummaryMeta = [
    `${formatNumber(detailsForm.totalUnitsExpected || developmentTrackerMetrics.totalUnits || 0)} Units`,
    toTitleLabel(detailsForm.status || 'active'),
    `Launch: ${detailsForm.launchDate ? formatDate(detailsForm.launchDate) : 'Not set'}`,
  ].join(' · ')
  const sellerSummaryName = sellerDetailsForm.legalName || sellerDetailsForm.tradingName || 'Seller entity not set'
  const sellerSummaryMeta = [
    toTitleLabel(sellerDetailsForm.entityType || 'company'),
    sellerDetailsForm.vatNumber || /vat/i.test(sellerDetailsForm.vatTreatment || '')
      ? 'VAT Registered'
      : 'VAT status not set',
  ].join(' · ')
  const developerProfileHasSellerDefaults = Boolean(
    developerProfileDefaults.legalName ||
      developerProfileDefaults.tradingName ||
      developerProfileDefaults.registeredAddress ||
      developerProfileDefaults.email ||
      developerProfileDefaults.defaultSignatory?.fullName,
  )

  function setSellerDetailsField(fieldKey, value) {
    setDetailsForm((previous) => ({
      ...previous,
      sellerDetails: {
        ...normalizeSellerDetailsForm(previous.sellerDetails),
        [fieldKey]: value,
      },
    }))
  }

  function setSellerSignatoryField(fieldKey, value, index = 0) {
    setDetailsForm((previous) => {
      const normalizedSellerDetails = normalizeSellerDetailsForm(previous.sellerDetails)
      const signatories = normalizedSellerDetails.signatories.length
        ? [...normalizedSellerDetails.signatories]
        : [{ ...DEFAULT_SELLER_DETAILS_FORM.signatories[0] }]
      signatories[index] = {
        ...(signatories[index] || DEFAULT_SELLER_DETAILS_FORM.signatories[0]),
        [fieldKey]: value,
      }

      return {
        ...previous,
        sellerDetails: {
          ...normalizedSellerDetails,
          signatories,
        },
      }
    })
  }

  function handleUseDeveloperCompanyAsSeller() {
    const fallbackName = detailsForm.developerCompany || detailsForm.name || data?.development?.name || ''
    const profile = normalizeOrganisationDeveloperProfile(developerProfileDefaults)
    setDetailsForm((previous) => {
      const normalizedSellerDetails = normalizeSellerDetailsForm(previous.sellerDetails)
      const existingSignatory = normalizedSellerDetails.signatories[0] || DEFAULT_SELLER_DETAILS_FORM.signatories[0]
      const profileSignatory = profile.defaultSignatory || {}
      return {
        ...previous,
        sellerDetails: {
          ...normalizedSellerDetails,
          mode: 'developer_profile',
          entityType: profile.entityType || normalizedSellerDetails.entityType,
          legalName: profile.legalName || normalizedSellerDetails.legalName || fallbackName,
          tradingName: profile.tradingName || normalizedSellerDetails.tradingName || previous.developerCompany || '',
          registrationNumber: profile.registrationNumber || normalizedSellerDetails.registrationNumber,
          vatNumber: profile.vatNumber || normalizedSellerDetails.vatNumber,
          vatTreatment: profile.vatTreatment || normalizedSellerDetails.vatTreatment,
          registeredAddress: profile.registeredAddress || normalizedSellerDetails.registeredAddress || previous.address || '',
          postalAddress: profile.postalAddress || normalizedSellerDetails.postalAddress,
          email: profile.email || normalizedSellerDetails.email || '',
          phone: profile.phone || normalizedSellerDetails.phone || '',
          notes: profile.notes || normalizedSellerDetails.notes,
          signatories: [
            {
              ...existingSignatory,
              fullName: profileSignatory.fullName || existingSignatory.fullName,
              role: profileSignatory.role || existingSignatory.role,
              idNumber: profileSignatory.idNumber || existingSignatory.idNumber,
              email: profileSignatory.email || existingSignatory.email,
              phone: profileSignatory.phone || existingSignatory.phone,
              signingCapacity: profileSignatory.signingCapacity || existingSignatory.signingCapacity,
            },
          ],
        },
      }
    })
  }

  async function handleCopyMarketingValue(value, label = 'Content') {
    const normalized = String(value || '').trim()
    if (!normalized) {
      setError(`${label} is not available to copy yet.`)
      return
    }

    try {
      await navigator.clipboard.writeText(normalized)
      setError('')
      setFeedback(`${label} copied.`)
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`)
    }
  }

  async function handleDownloadMarketingResource(item) {
    if (!item?.url) {
      setError(`${item?.label || 'This asset'} does not have a valid link yet.`)
      return
    }

    await handleDownloadDocument({
      id: `marketing-${item.key || Date.now()}`,
      title: item.label || 'Marketing asset',
      fileUrl: item.url,
    })
  }

  const derivedProjectedCost = useMemo(() => {
    return ['landCost', 'buildCost', 'professionalFees', 'marketingCost', 'infrastructureCost', 'otherCosts'].reduce(
      (sum, key) => sum + Number(financialsForm[key] || 0),
      0,
    )
  }, [financialsForm])

  const derivedProjectedProfit = useMemo(() => Number(financialsForm.projectedGrossSalesValue || 0) - derivedProjectedCost, [financialsForm.projectedGrossSalesValue, derivedProjectedCost])

  const derivedTargetMargin = useMemo(() => {
    const grossSalesValue = Number(financialsForm.projectedGrossSalesValue || 0)
    if (!grossSalesValue) return 0
    return (derivedProjectedProfit / grossSalesValue) * 100
  }, [derivedProjectedProfit, financialsForm.projectedGrossSalesValue])

  const effectiveProjectedRevenue = Number(financialsForm.projectedGrossSalesValue || totalListedStockValue || 0)
  const effectiveProjectedCost = Number(financialsForm.totalProjectedCost || derivedProjectedCost || 0)
  const effectiveProjectedProfit = Number(financialsForm.projectedProfit || (effectiveProjectedRevenue - effectiveProjectedCost) || 0)
  const effectiveTargetMargin = effectiveProjectedRevenue
    ? Number(financialsForm.targetMargin || ((effectiveProjectedProfit / effectiveProjectedRevenue) * 100) || 0)
    : 0
  const revenueSecured = Number(developmentPerformance?.revenueSecured || developmentMetrics.totalSalesValue || 0)
  const revenueAtRisk = Math.max(effectiveProjectedRevenue - revenueSecured, 0)
  const securedCoverage = effectiveProjectedRevenue > 0 ? (revenueSecured / effectiveProjectedRevenue) * 100 : 0
  const averageSecuredUnitValue = developmentTrackerMetrics.unitsRegistered > 0 ? revenueSecured / developmentTrackerMetrics.unitsRegistered : 0
  const averageListedUnitValue = rows.length > 0 ? totalListedStockValue / rows.length : 0

  const commercialKpis = useMemo(
    () => [
      {
        label: 'Projected Revenue',
        value: currency.format(effectiveProjectedRevenue || 0),
        meta: `${formatNumber(rows.length)} units in plan`,
        icon: TrendingUp,
      },
      {
        label: 'Projected Cost',
        value: currency.format(effectiveProjectedCost || 0),
        meta: 'Based on current development budget',
        icon: Receipt,
      },
      {
        label: 'Projected Profit',
        value: currency.format(effectiveProjectedProfit || 0),
        meta: `${effectiveTargetMargin.toFixed(1)}% target margin`,
        icon: HandCoins,
      },
      {
        label: 'Revenue Secured',
        value: currency.format(revenueSecured || 0),
        meta: `${securedCoverage.toFixed(1)}% of projected revenue`,
        icon: CircleDollarSign,
      },
      {
        label: 'Pipeline Value',
        value: currency.format(developmentMetrics.pipelineValue || 0),
        meta: `${formatNumber(developmentTrackerMetrics.dealsInProgress || 0)} units still in flight`,
        icon: Workflow,
      },
      {
        label: 'Revenue At Risk',
        value: currency.format(revenueAtRisk || 0),
        meta: `${formatNumber(developmentTrackerMetrics.unitsAvailable || 0)} units still to convert`,
        icon: AlertTriangle,
      },
    ],
    [
      developmentMetrics.pipelineValue,
      developmentTrackerMetrics.dealsInProgress,
      developmentTrackerMetrics.unitsAvailable,
      effectiveProjectedCost,
      effectiveProjectedProfit,
      effectiveProjectedRevenue,
      effectiveTargetMargin,
      revenueAtRisk,
      revenueSecured,
      rows.length,
      securedCoverage,
    ],
  )

  const costStructure = useMemo(() => {
    const items = [
      { key: 'landCost', label: 'Land', amount: Number(financialsForm.landCost || 0) },
      { key: 'buildCost', label: 'Build', amount: Number(financialsForm.buildCost || 0) },
      { key: 'professionalFees', label: 'Professional Fees', amount: Number(financialsForm.professionalFees || 0) },
      { key: 'marketingCost', label: 'Marketing / Commission', amount: Number(financialsForm.marketingCost || 0) },
      { key: 'infrastructureCost', label: 'Infrastructure', amount: Number(financialsForm.infrastructureCost || 0) },
      { key: 'otherCosts', label: 'Other', amount: Number(financialsForm.otherCosts || 0) },
    ]

    return items.map((item) => ({
      ...item,
      share: effectiveProjectedCost > 0 ? (item.amount / effectiveProjectedCost) * 100 : 0,
    }))
  }, [effectiveProjectedCost, financialsForm])

  const developerFinancialRollup = useMemo(() => {
    const transactionRows = rows.filter((row) => row?.transaction?.id)
    const reservation = transactionRows.reduce(
      (summary, row) => {
        const transaction = row.transaction || {}
        if (!transaction.reservation_required) {
          return summary
        }

        const amount = Number(transaction.reservation_amount || 0)
        const hasExplicitTreatment = String(transaction.reservation_treatment || '').trim().length > 0
        const hasPayableTo = String(transaction.reservation_payable_to || '').trim().length > 0
        const treatment = normalizeReservationTreatment(transaction.reservation_treatment)
        const status = String(transaction.reservation_status || '').trim().toLowerCase()

        summary.requiredCount += 1
        summary.totalAmount += Number.isFinite(amount) ? amount : 0
        summary.byTreatment[treatment] = (summary.byTreatment[treatment] || 0) + (Number.isFinite(amount) ? amount : 0)
        summary.statusCounts[status || 'unknown'] = (summary.statusCounts[status || 'unknown'] || 0) + 1

        if (!['paid', 'verified'].includes(status)) {
          summary.awaitingProofCount += 1
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          summary.missingAmountCount += 1
        }
        if (!hasExplicitTreatment) {
          summary.missingTreatmentCount += 1
        }
        if (!hasPayableTo) {
          summary.missingPayableToCount += 1
        }

        return summary
      },
      {
        requiredCount: 0,
        totalAmount: 0,
        awaitingProofCount: 0,
        missingAmountCount: 0,
        missingTreatmentCount: 0,
        missingPayableToCount: 0,
        byTreatment: {
          credited_to_purchase_price: 0,
          separate_invoice: 0,
          refundable_hold: 0,
        },
        statusCounts: {},
      },
    )

    const defaultAlterationTreatment = normalizeAlterationChargeTreatment(
      data?.settings?.default_alteration_charge_treatment || data?.settings?.defaultAlterationChargeTreatment,
    )
    const alteration = alterations.reduce(
      (summary, item) => {
        const hasExplicitTreatment = String(item?.charge_treatment || item?.chargeTreatment || '').trim().length > 0
        const treatment = normalizeAlterationChargeTreatment(item?.charge_treatment || item?.chargeTreatment || defaultAlterationTreatment)
        const amount = Number(item?.amount_inc_vat || 0)
        const status = String(item?.status || '').trim().toLowerCase()

        summary.totalCount += 1
        summary.totalAmount += Number.isFinite(amount) ? amount : 0
        summary.byTreatment[treatment] = (summary.byTreatment[treatment] || 0) + (Number.isFinite(amount) ? amount : 0)
        summary.statusCounts[status || 'unknown'] = (summary.statusCounts[status || 'unknown'] || 0) + 1

        if (!['approved', 'completed', 'paid', 'declined', 'rejected', 'cancelled'].includes(status)) {
          summary.awaitingActionCount += 1
        }
        if (!hasExplicitTreatment) {
          summary.missingTreatmentCount += 1
        }
        if (treatment !== 'no_charge' && (!Number.isFinite(amount) || amount <= 0)) {
          summary.missingAmountCount += 1
        }

        return summary
      },
      {
        totalCount: 0,
        totalAmount: 0,
        awaitingActionCount: 0,
        missingAmountCount: 0,
        missingTreatmentCount: 0,
        byTreatment: {
          included_in_purchase_price: 0,
          separate_invoice: 0,
          no_charge: 0,
        },
        statusCounts: {},
      },
    )

    const actionItems = [
      reservation.byTreatment.credited_to_purchase_price > 0
        ? `Deduct ${currency.format(reservation.byTreatment.credited_to_purchase_price)} reservation deposits from purchase prices.`
        : null,
      reservation.byTreatment.separate_invoice > 0
        ? `Keep ${currency.format(reservation.byTreatment.separate_invoice)} reservation deposits out of purchase price reconciliation.`
        : null,
      alteration.byTreatment.included_in_purchase_price > 0
        ? `Confirm ${currency.format(alteration.byTreatment.included_in_purchase_price)} alterations in OTP addenda or sale agreements.`
        : null,
      alteration.byTreatment.separate_invoice > 0
        ? `Track separate alteration invoices totalling ${currency.format(alteration.byTreatment.separate_invoice)}.`
        : null,
      reservation.awaitingProofCount > 0
        ? `${formatNumber(reservation.awaitingProofCount)} reservation deposit${reservation.awaitingProofCount === 1 ? '' : 's'} still need proof or verification.`
        : null,
      alteration.awaitingActionCount > 0
        ? `${formatNumber(alteration.awaitingActionCount)} alteration request${alteration.awaitingActionCount === 1 ? '' : 's'} still awaiting action.`
        : null,
    ].filter(Boolean)
    const controlItems = [
      reservation.missingAmountCount > 0
        ? {
            severity: 'critical',
            label: 'Reservation amount missing',
            detail: `${formatNumber(reservation.missingAmountCount)} reservation deposit${reservation.missingAmountCount === 1 ? '' : 's'} need an amount before handoff.`,
          }
        : null,
      reservation.missingTreatmentCount > 0
        ? {
            severity: 'critical',
            label: 'Reservation treatment missing',
            detail: `${formatNumber(reservation.missingTreatmentCount)} reservation deposit${reservation.missingTreatmentCount === 1 ? '' : 's'} need a purchase price or invoice treatment.`,
          }
        : null,
      reservation.missingPayableToCount > 0
        ? {
            severity: 'warning',
            label: 'Deposit recipient missing',
            detail: `${formatNumber(reservation.missingPayableToCount)} reservation deposit${reservation.missingPayableToCount === 1 ? '' : 's'} need payable-to allocation.`,
          }
        : null,
      reservation.awaitingProofCount > 0
        ? {
            severity: 'warning',
            label: 'Deposit proof outstanding',
            detail: `${formatNumber(reservation.awaitingProofCount)} reservation deposit${reservation.awaitingProofCount === 1 ? '' : 's'} still need proof or verification.`,
          }
        : null,
      alteration.missingAmountCount > 0
        ? {
            severity: 'critical',
            label: 'Alteration amount missing',
            detail: `${formatNumber(alteration.missingAmountCount)} billable alteration${alteration.missingAmountCount === 1 ? '' : 's'} need a cost before handoff.`,
          }
        : null,
      alteration.missingTreatmentCount > 0
        ? {
            severity: 'warning',
            label: 'Alteration treatment defaulted',
            detail: `${formatNumber(alteration.missingTreatmentCount)} alteration request${alteration.missingTreatmentCount === 1 ? '' : 's'} are using the development default treatment.`,
          }
        : null,
      alteration.awaitingActionCount > 0
        ? {
            severity: 'warning',
            label: 'Alteration decision pending',
            detail: `${formatNumber(alteration.awaitingActionCount)} alteration request${alteration.awaitingActionCount === 1 ? '' : 's'} still need an operational decision.`,
          }
        : null,
    ].filter(Boolean)
    const criticalControlCount = controlItems.filter((item) => item.severity === 'critical').length
    const warningControlCount = controlItems.filter((item) => item.severity === 'warning').length
    const controlStatus = criticalControlCount > 0
      ? 'Needs cleanup'
      : warningControlCount > 0
        ? 'Ready with follow-up'
        : 'Ready for handoff'

    return {
      reservation,
      alteration,
      defaultAlterationTreatment,
      actionItems,
      controlItems,
      controlStatus,
      criticalControlCount,
      warningControlCount,
    }
  }, [alterations, data?.settings, rows])

  function handleDownloadDeveloperFinancialReconciliation() {
    try {
      const developmentName = data?.development?.name || detailsForm.name || 'Development'
      const rowByTransactionId = new Map(rows.filter((row) => row?.transaction?.id).map((row) => [row.transaction.id, row]))
      const rowByUnitId = new Map(rows.filter((row) => row?.unit?.id).map((row) => [row.unit.id, row]))
      const formatCsvAmount = (value) => {
        const amount = Number(value || 0)
        return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
      }
      const getReservationAction = (treatment, amount) => {
        const normalized = normalizeReservationTreatment(treatment)
        if (normalized === 'separate_invoice') {
          return `Invoice separately and exclude ${currency.format(amount || 0)} from purchase price reconciliation`
        }
        if (normalized === 'refundable_hold') {
          return `Hold as refundable deposit and confirm release or deduction instruction for ${currency.format(amount || 0)}`
        }

        return `Deduct ${currency.format(amount || 0)} from the purchase price balance`
      }
      const getAlterationAction = (treatment, amount) => {
        const normalized = normalizeAlterationChargeTreatment(treatment)
        if (normalized === 'separate_invoice') {
          return `Raise or track separate alteration invoice for ${currency.format(amount || 0)}`
        }
        if (normalized === 'no_charge') {
          return 'No buyer charge; keep as approved non-billable alteration'
        }

        return `Include ${currency.format(amount || 0)} in purchase price, OTP addendum, or sale agreement reconciliation`
      }

      const csvRows = [
        ['Section', 'Development', 'Unit', 'Transaction', 'Buyer', 'Treatment', 'Status', 'Amount Inc VAT', 'Practical Action'],
        [
          'Summary',
          developmentName,
          '',
          '',
          '',
          'Reservation exposure',
          `${formatNumber(developerFinancialRollup.reservation.requiredCount)} transactions`,
          formatCsvAmount(developerFinancialRollup.reservation.totalAmount),
          'Confirm proof, allocation, and purchase price treatment',
        ],
        [
          'Summary',
          developmentName,
          '',
          '',
          '',
          getReservationTreatmentLabel('credited_to_purchase_price'),
          '',
          formatCsvAmount(developerFinancialRollup.reservation.byTreatment.credited_to_purchase_price),
          'Deduct credited deposits from buyer purchase price balances',
        ],
        [
          'Summary',
          developmentName,
          '',
          '',
          '',
          getAlterationChargeTreatmentLabel('included_in_purchase_price'),
          '',
          formatCsvAmount(developerFinancialRollup.alteration.byTreatment.included_in_purchase_price),
          'Confirm included alterations in sale documents',
        ],
        [
          'Summary',
          developmentName,
          '',
          '',
          '',
          getAlterationChargeTreatmentLabel('separate_invoice'),
          '',
          formatCsvAmount(developerFinancialRollup.alteration.byTreatment.separate_invoice),
          'Track invoices outside the purchase price balance',
        ],
      ]

      developerFinancialRollup.controlItems.forEach((item) => {
        csvRows.push([
          'Control Review',
          developmentName,
          '',
          '',
          '',
          item.label,
          item.severity === 'critical' ? 'Needs cleanup' : 'Follow-up',
          '',
          item.detail,
        ])
      })

      rows
        .filter((row) => row?.transaction?.id && row.transaction.reservation_required)
        .forEach((row) => {
          const transaction = row.transaction || {}
          const amount = Number(transaction.reservation_amount || 0)
          const treatment = normalizeReservationTreatment(transaction.reservation_treatment)
          csvRows.push([
            'Reservation Deposit',
            developmentName,
            row?.unit?.unit_number || row?.unit?.unitNumber || 'Unassigned',
            buildTransactionReference(transaction.id),
            row?.buyer?.name || 'No buyer assigned',
            getReservationTreatmentLabel(treatment),
            transaction.reservation_status || 'Not captured',
            formatCsvAmount(amount),
            getReservationAction(treatment, amount),
          ])
        })

      alterations.forEach((item) => {
        const linkedRow =
          (item?.transaction_id ? rowByTransactionId.get(item.transaction_id) : null) ||
          (item?.unit_id ? rowByUnitId.get(item.unit_id) : null) ||
          null
        const amount = Number(item?.amount_inc_vat || 0)
        const treatment = normalizeAlterationChargeTreatment(item?.charge_treatment || item?.chargeTreatment || developerFinancialRollup.defaultAlterationTreatment)
        csvRows.push([
          'Alteration',
          developmentName,
          linkedRow?.unit?.unit_number || linkedRow?.unit?.unitNumber || item?.unit_id || 'Unassigned',
          item?.transaction_id ? buildTransactionReference(item.transaction_id) : linkedRow?.transaction?.id ? buildTransactionReference(linkedRow.transaction.id) : 'Pending',
          linkedRow?.buyer?.name || item?.buyer_name || item?.buyerName || 'No buyer assigned',
          getAlterationChargeTreatmentLabel(treatment),
          item?.status || 'Not captured',
          formatCsvAmount(amount),
          getAlterationAction(treatment, amount),
        ])
      })

      const blob = new Blob([buildCsvContent(csvRows)], { type: 'text/csv;charset=utf-8' })
      const objectUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = buildCsvDownloadName(`${developmentName}-financial-reconciliation`)
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(objectUrl)
      setError('')
      setFeedback('Developer financial reconciliation exported.')
    } catch (downloadError) {
      setError(downloadError?.message || 'Unable to export developer financial reconciliation.')
    }
  }

  const expectedBondCommissionPool = useMemo(() => {
    const commissionValue = Number(data?.bondConfig?.defaultCommissionAmount || 0)
    if (!Number.isFinite(commissionValue) || commissionValue <= 0) {
      return 0
    }

    const isPercentage = (data?.bondConfig?.commissionModelType || 'fixed_fee') === 'percentage'

    return bondEligibleRows.reduce((sum, row) => {
      if (!isPercentage) {
        return sum + commissionValue
      }

      const baseValue = Number(
        row?.transaction?.sales_price ||
          row?.transaction?.purchase_price ||
          row?.unit?.list_price ||
          row?.unit?.listPrice ||
          row?.unit?.price ||
          0,
      )

      return sum + (Number.isFinite(baseValue) ? (baseValue * commissionValue) / 100 : 0)
    }, 0)
  }, [bondEligibleRows, data?.bondConfig?.commissionModelType, data?.bondConfig?.defaultCommissionAmount])

  const commercialHealthItems = useMemo(
    () => [
      {
        label: 'Sell-through',
        value: `${(developmentTrackerMetrics.sellThroughPercent || 0).toFixed(1)}%`,
        meta: `${formatNumber(developmentTrackerMetrics.unitsSold || 0)} sold or committed`,
      },
      {
        label: 'Available Stock Value',
        value: currency.format(availableStockValue || 0),
        meta: `${formatNumber(developmentTrackerMetrics.unitsAvailable || 0)} units still unsold`,
      },
      {
        label: 'Avg Secured Deal',
        value: currency.format(averageSecuredUnitValue || 0),
        meta: 'Based on sold and in-progress deals',
      },
      {
        label: 'Avg Listed Unit',
        value: currency.format(averageListedUnitValue || 0),
        meta: 'Across the current stock master',
      },
      {
        label: 'Transfer Fee Exposure',
        value: currency.format((Number(data?.attorneyConfig?.defaultFeeAmount || 0) || 0) * (developmentTrackerMetrics.unitsRegistered || 0)),
        meta: `${formatNumber(developmentTrackerMetrics.unitsRegistered || 0)} registered units`,
      },
      {
        label: 'Bond Commission Pool',
        value: currency.format(expectedBondCommissionPool || 0),
        meta: `${formatNumber(bondEligibleRows.length)} bond or hybrid deals`,
      },
    ],
    [
      availableStockValue,
      averageListedUnitValue,
      averageSecuredUnitValue,
      bondEligibleRows.length,
      data?.attorneyConfig?.defaultFeeAmount,
      developmentTrackerMetrics.sellThroughPercent,
      developmentTrackerMetrics.unitsAvailable,
      developmentTrackerMetrics.unitsRegistered,
      developmentTrackerMetrics.unitsSold,
      expectedBondCommissionPool,
    ],
  )

  const commercialAlerts = useMemo(() => {
    const items = []

    if (effectiveTargetMargin > 0 && effectiveTargetMargin < 18) {
      items.push({
        title: 'Margin below target comfort band',
        body: `Current plan margin is ${effectiveTargetMargin.toFixed(1)}%. Review pricing or cost assumptions before stock moves further.`,
        tone: 'warning',
      })
    }

    if (developmentBottleneckSummary.totalFlagged > 0) {
      items.push({
        title: 'Transactions need intervention',
        body: `${formatNumber(developmentBottleneckSummary.totalFlagged)} deals are flagged. Biggest pressure point: ${developmentBottleneckSummary.leadLabel}.`,
        tone: 'warning',
      })
    }

    if (!data?.attorneyConfig?.attorneyFirmName) {
      items.push({
        title: 'Conveyancing commercial setup is incomplete',
        body: 'Mandated attorney and fee assumptions are still missing, so transfer exposure is not fully controlled.',
        tone: 'critical',
      })
    }

    if (!data?.bondConfig?.bondOriginatorName && financeMix.bondShare > 0) {
      items.push({
        title: 'Bond originator setup missing',
        body: 'Bond-backed deals exist, but the default originator agreement is not configured yet.',
        tone: 'warning',
      })
    }

    if (developmentTrackerMetrics.totalUnits > 0 && (developmentTrackerMetrics.unitsAvailable / developmentTrackerMetrics.totalUnits) * 100 > 45) {
      items.push({
        title: 'Large unsold inventory remains',
        body: `${formatNumber(developmentTrackerMetrics.unitsAvailable)} of ${formatNumber(developmentTrackerMetrics.totalUnits)} units are still available. Check pricing, launch pacing, and broker focus.`,
        tone: 'normal',
      })
    }

    if (!items.length) {
      items.push({
        title: 'Commercial setup is healthy',
        body: 'No immediate margin, stock, or setup issues are being flagged from the current plan and live transaction data.',
        tone: 'positive',
      })
    }

    return items.slice(0, 4)
  }, [
    data?.attorneyConfig?.attorneyFirmName,
    data?.bondConfig?.bondOriginatorName,
    developmentBottleneckSummary.leadLabel,
    developmentBottleneckSummary.totalFlagged,
    developmentTrackerMetrics.totalUnits,
    developmentTrackerMetrics.unitsAvailable,
    effectiveTargetMargin,
    financeMix.bondShare,
  ])

  const overviewBottlenecks = useMemo(() => selectBottlenecks(rows).slice(0, 3), [rows])

  const transactionPipelineItems = useMemo(() => {
    const counts = developmentTrackerStageCounts || {}
    const reservedCount = Number(counts.DEP || 0)
    const offerCount = Number(counts.OTP || 0) + Number(counts.FIN || 0)
    const transferCount = Number(counts.ATTY || 0) + Number(counts.XFER || 0)
    const registeredCount = Number(counts.REG || 0)
    const availableCount = Number(counts.AVAIL || 0)
    const max = Math.max(availableCount, reservedCount, offerCount, transferCount, registeredCount, 1)

    return [
      { key: 'available', label: 'Available', count: availableCount, tone: 'bg-[#1fa463]' },
      { key: 'reserved', label: 'Reserved', count: reservedCount, tone: 'bg-[#eab308]' },
      { key: 'offer', label: 'Offer to Purchase', count: offerCount, tone: 'bg-[#1d7fc2]' },
      { key: 'transfer', label: 'Transfer', count: transferCount, tone: 'bg-[#8190a3]' },
      { key: 'registered', label: 'Registered', count: registeredCount, tone: 'bg-[#6b7280]' },
    ].map((item) => ({
      ...item,
      width: Math.max((item.count / max) * 100, item.count > 0 ? 8 : 3),
    }))
  }, [developmentTrackerStageCounts])

  const unitStatusItems = useMemo(() => {
    const counts = {
      available: 0,
      reserved: 0,
      sold: 0,
      transferred: 0,
      registered: 0,
      blocked: 0,
    }

    rows.forEach((row) => {
      const stageKey = resolveDevelopmentTrackerMainStage(row)
      if (stageKey === 'REG') {
        counts.registered += 1
      } else if (stageKey === 'XFER') {
        counts.transferred += 1
      } else if (['OTP', 'FIN', 'ATTY'].includes(stageKey)) {
        counts.sold += 1
      } else if (stageKey === 'DEP') {
        counts.reserved += 1
      } else if (stageKey === 'BLOCKED') {
        counts.blocked += 1
      } else {
        counts.available += 1
      }
    })

    const total = rows.length || 0
    const colors = {
      available: '#22c55e',
      reserved: '#eab308',
      sold: '#1d7fc2',
      transferred: '#7c3aed',
      registered: '#9ca3af',
      blocked: '#64748b',
    }
    let cursor = 0
    const gradientParts = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => {
        const start = cursor
        const end = cursor + (total ? (count / total) * 100 : 0)
        cursor = end
        return `${colors[key]} ${start}% ${end}%`
      })

    return {
      total,
      gradient: gradientParts.length ? `conic-gradient(${gradientParts.join(', ')})` : 'conic-gradient(#e2e8f0 0% 100%)',
      items: [
        { key: 'available', label: 'Available', color: colors.available },
        { key: 'reserved', label: 'Reserved', color: colors.reserved },
        { key: 'sold', label: 'Sold', color: colors.sold },
        { key: 'transferred', label: 'Transferred', color: colors.transferred },
        { key: 'registered', label: 'Registered', color: colors.registered },
        { key: 'blocked', label: 'Blocked', color: colors.blocked },
      ].map((item) => ({
        ...item,
        count: counts[item.key],
        share: total ? (counts[item.key] / total) * 100 : 0,
      })),
    }
  }, [rows])

  const developmentHealthItems = useMemo(() => {
    const unitsConfigured = unitRows.length > 0 && remainingPlannedUnits === 0
    const hasLocation = Boolean(locationLine || detailsForm.address)
    const attorneyConnected = Boolean(
      data?.attorneyConfig?.attorneyFirmName ||
        rows.some((row) => String(row?.transaction?.attorney || '').trim()),
    )
    const bondOriginatorConnected = Boolean(
      data?.bondConfig?.bondOriginatorName ||
        rows.some((row) => String(row?.transaction?.bond_originator || '').trim()),
    )
    const defaultsConfigured =
      reservationSettingsForm.defaultTransferAttorneySource !== 'none' &&
      reservationSettingsForm.defaultBondOriginatorSource !== 'none'
    const sellerDetails = normalizeSellerDetailsForm(detailsForm.sellerDetails)
    const primarySellerSignatory = sellerDetails.signatories[0] || {}
    const sellerDetailsConfigured = Boolean(
      String(sellerDetails.legalName || '').trim() &&
        String(primarySellerSignatory.fullName || '').trim() &&
        String(primarySellerSignatory.signingCapacity || primarySellerSignatory.role || '').trim(),
    )
    const onboardingAttentionCount = rows.filter((row) => {
      if (!row?.transaction?.id) return false
      const status = String(row?.transaction?.onboarding_status || row?.onboarding?.status || '')
        .trim()
        .toLowerCase()
      return status && !['complete', 'completed', 'submitted', 'client_onboarding_complete'].includes(status)
    }).length

    return [
      {
        label: 'Units configured',
        detail: unitsConfigured
          ? `All ${formatNumber(unitRows.length)} units are configured`
          : unitRows.length
            ? `${formatNumber(remainingPlannedUnits)} planned units still need stock rows`
            : 'No units configured yet',
        tone: unitsConfigured ? 'success' : unitRows.length ? 'warning' : 'danger',
      },
      {
        label: 'Transaction defaults',
        detail: defaultsConfigured ? 'Default partner routing is set' : 'Partner routing needs confirmation',
        tone: defaultsConfigured ? 'success' : 'warning',
      },
      {
        label: 'Seller details configured',
        detail: sellerDetailsConfigured
          ? `${sellerDetails.legalName} is ready for OTP and mandate documents`
          : 'Seller legal entity and signatory details are required',
        tone: sellerDetailsConfigured ? 'success' : 'danger',
      },
      {
        label: 'Buyer onboarding',
        detail: onboardingAttentionCount
          ? `${formatNumber(onboardingAttentionCount)} onboarding ${onboardingAttentionCount === 1 ? 'item needs' : 'items need'} attention`
          : 'No onboarding blockers flagged',
        tone: onboardingAttentionCount ? 'warning' : 'success',
      },
      {
        label: 'Attorneys connected',
        detail: attorneyConnected ? 'Transfer and conveyancing setup is connected' : 'Attorney setup is not connected yet',
        tone: attorneyConnected ? 'success' : 'danger',
      },
      {
        label: 'Bond originator connected',
        detail: bondOriginatorConnected ? 'Bond originator setup is connected' : 'No bond originator connected yet',
        tone: bondOriginatorConnected ? 'success' : 'warning',
      },
      {
        label: 'Location configured',
        detail: hasLocation ? locationLine || detailsForm.address : 'Development location not set',
        tone: hasLocation ? 'success' : 'danger',
      },
    ]
  }, [
    data?.attorneyConfig?.attorneyFirmName,
    data?.bondConfig?.bondOriginatorName,
    detailsForm.address,
    detailsForm.sellerDetails,
    locationLine,
    remainingPlannedUnits,
    reservationSettingsForm.defaultBondOriginatorSource,
    reservationSettingsForm.defaultTransferAttorneySource,
    rows,
    unitRows.length,
  ])

  function setMarketingField(sectionKey, fieldKey, value) {
    setDetailsForm((previous) => {
      const normalizedMarketing = normalizeMarketingContentForm(previous.marketing)
      return {
        ...previous,
        marketing: {
          ...normalizedMarketing,
          [sectionKey]: {
            ...normalizedMarketing[sectionKey],
            [fieldKey]: value,
          },
        },
      }
    })
  }

  function setMarketingFloorplans(updater) {
    setDetailsForm((previous) => {
      const normalizedMarketing = normalizeMarketingContentForm(previous.marketing)
      const nextFloorplans =
        typeof updater === 'function'
          ? updater(normalizedMarketing.floorplans)
          : Array.isArray(updater)
            ? updater
            : normalizedMarketing.floorplans

      return {
        ...previous,
        marketing: {
          ...normalizedMarketing,
          floorplans: nextFloorplans.map((item, index) => normalizeMarketingFloorplan(item, index + 1)),
        },
      }
    })
  }

  function addMarketingFloorplan() {
    setMarketingFloorplans((previous) => [...previous, createDefaultMarketingFloorplan(previous.length + 1)])
  }

  function removeMarketingFloorplan(id) {
    setMarketingFloorplans((previous) => {
      const filtered = previous.filter((item) => item.id !== id)
      return filtered.length ? filtered : [createDefaultMarketingFloorplan(1)]
    })
  }

  function setMarketingFloorplanField(id, fieldKey, value) {
    setMarketingFloorplans((previous) =>
      previous.map((item) => (item.id === id ? { ...item, [fieldKey]: value } : item)),
    )
  }

  function setSelectedMarketingFloorplanField(fieldKey, value) {
    if (!selectedMarketingFloorplan?.id) return
    setMarketingFloorplanField(selectedMarketingFloorplan.id, fieldKey, value)
  }

  function addSelectedMarketingListItem(fieldKey, draftValue, setDraftValue) {
    if (!selectedMarketingFloorplan?.id) return
    const normalizedValue = String(draftValue || '').trim()
    if (!normalizedValue) return

    const nextItems = [
      ...normalizeMarketingUnitList(selectedMarketingFloorplan[fieldKey]),
      normalizedValue,
    ]
    setMarketingFloorplanField(selectedMarketingFloorplan.id, fieldKey, serializeMarketingUnitList([...new Set(nextItems)]))
    setDraftValue('')
  }

  function removeSelectedMarketingListItem(fieldKey, value) {
    if (!selectedMarketingFloorplan?.id) return
    const nextItems = normalizeMarketingUnitList(selectedMarketingFloorplan[fieldKey]).filter((item) => item !== value)
    setMarketingFloorplanField(selectedMarketingFloorplan.id, fieldKey, serializeMarketingUnitList(nextItems))
  }

  function handlePreviewPublicListing() {
    const previewUrl =
      selectedMarketingFloorplan?.ctaUrl ||
      marketingForm.listingConfiguration.ctaUrl ||
      marketingForm.externalLinks.developmentLandingPageUrl ||
      marketingForm.externalLinks.externalWebsiteUrl

    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer')
      return
    }

    setMarketingUnitTab('seo')
    setFeedback('Add a public listing URL or CTA link before previewing the listing.')
  }

  async function handlePublishDevelopmentMarketing() {
    const normalizedMarketing = normalizeMarketingContentForm(detailsForm.marketing)
    const nextDetailsForm = {
      ...detailsForm,
      marketing: {
        ...normalizedMarketing,
        listingOverview: {
          ...normalizedMarketing.listingOverview,
          listingStatus: 'active',
        },
        listingConfiguration: {
          ...normalizedMarketing.listingConfiguration,
          showOnListingWebsite: true,
          publicVisibility: true,
          marketingStatus: 'live',
        },
        floorplans: normalizedMarketing.floorplans.map((item) =>
          selectedMarketingFloorplan?.id && item.id === selectedMarketingFloorplan.id
            ? { ...item, listingStatus: 'active' }
            : item,
        ),
      },
    }

    try {
      setDetailsSaving(true)
      setFeedback('')
      setError('')
      setDetailsForm(nextDetailsForm)
      await saveDevelopmentDetails(data.development.id, buildDevelopmentDetailsPayload(nextDetailsForm))
      setFeedback('Development marketing published.')
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setDetailsSaving(false)
    }
  }

  function setMarketingSellingPointEntries(updater) {
    const current = parseSellingPointEntries(marketingForm.sellingPoints.items)
    const nextEntries = typeof updater === 'function' ? updater(current) : Array.isArray(updater) ? updater : current
    setMarketingField('sellingPoints', 'items', serializeSellingPointEntries(nextEntries))
  }

  function addMarketingSellingPointEntry() {
    setMarketingSellingPointEntries((previous) => [...previous, { title: '', note: '' }])
  }

  function updateMarketingSellingPointEntry(index, fieldKey, value) {
    setMarketingSellingPointEntries((previous) =>
      previous.map((entry, currentIndex) =>
        currentIndex === index ? { ...entry, [fieldKey]: value } : entry,
      ),
    )
  }

  function removeMarketingSellingPointEntry(index) {
    setMarketingSellingPointEntries((previous) => previous.filter((_, currentIndex) => currentIndex !== index))
  }

  function buildDevelopmentDetailsPayload(sourceDetailsForm = detailsForm) {
    const marketingLegacyPayload = getMarketingLegacyPayload(sourceDetailsForm.marketing)
    const marketingOverview = marketingLegacyPayload.marketingContent.listingOverview

    return {
      ...sourceDetailsForm,
      location: marketingOverview.locationLabel || sourceDetailsForm.location,
      address: marketingOverview.address || sourceDetailsForm.address,
      suburb: marketingOverview.suburb || sourceDetailsForm.suburb,
      city: marketingOverview.city || sourceDetailsForm.city,
      province: marketingOverview.province || sourceDetailsForm.province,
      description: marketingLegacyPayload.description || sourceDetailsForm.description,
      plans: marketingLegacyPayload.plans,
      sitePlans: marketingLegacyPayload.sitePlans,
      imageLinks: marketingLegacyPayload.imageLinks,
      supportingDocuments: marketingLegacyPayload.supportingDocuments,
      marketingContent: marketingLegacyPayload.marketingContent,
      sellerDetails: normalizeSellerDetailsForm(sourceDetailsForm.sellerDetails),
    }
  }

  function buildDetailsFormWithUploadedMarketingAssets(uploadedRows = [], documentType = 'marketing', options = {}) {
    const urls = uploadedRows.map((item) => item?.fileUrl).filter(Boolean)
    const normalizedMarketing = normalizeMarketingContentForm(detailsForm.marketing)
    const nextMediaLibrary = { ...normalizedMarketing.mediaLibrary }

    if (documentType === 'logo') {
      nextMediaLibrary.developmentLogoUrl = urls[0] || nextMediaLibrary.developmentLogoUrl
    } else if (documentType === 'floorplan') {
      nextMediaLibrary.floorplanUrls = appendUniqueTextareaValues(nextMediaLibrary.floorplanUrls, urls)
      if (selectedMarketingFloorplan?.id) {
        normalizedMarketing.floorplans = normalizedMarketing.floorplans.map((item) =>
          item.id === selectedMarketingFloorplan.id
            ? {
                ...item,
                floorplanUrls: appendUniqueTextareaValues(item.floorplanUrls, urls),
              }
            : item,
        )
      }
    } else if (documentType === 'site_plan') {
      nextMediaLibrary.sitePlanUrl = urls[0] || nextMediaLibrary.sitePlanUrl
    } else if (documentType === 'video') {
      nextMediaLibrary.videoUrl = urls[0] || nextMediaLibrary.videoUrl
      if (selectedMarketingFloorplan?.id) {
        normalizedMarketing.floorplans = normalizedMarketing.floorplans.map((item) =>
          item.id === selectedMarketingFloorplan.id
            ? {
                ...item,
                videoUrl: urls[0] || item.videoUrl,
              }
            : item,
        )
      }
    } else if (documentType === 'virtual_tour') {
      nextMediaLibrary.virtualTourUrl = urls[0] || nextMediaLibrary.virtualTourUrl
      if (selectedMarketingFloorplan?.id) {
        normalizedMarketing.floorplans = normalizedMarketing.floorplans.map((item) =>
          item.id === selectedMarketingFloorplan.id
            ? {
                ...item,
                virtualTourUrl: urls[0] || item.virtualTourUrl,
              }
            : item,
        )
      }
    } else {
      nextMediaLibrary.galleryImageUrls = appendUniqueTextareaValues(nextMediaLibrary.galleryImageUrls, urls)
      if ((options.setAsHero || !nextMediaLibrary.heroImageUrl) && urls[0]) {
        nextMediaLibrary.heroImageUrl = urls[0]
      }
      if (selectedMarketingFloorplan?.id) {
        normalizedMarketing.floorplans = normalizedMarketing.floorplans.map((item) =>
          item.id === selectedMarketingFloorplan.id
            ? {
                ...item,
                imageUrls: appendUniqueTextareaValues(item.imageUrls, urls),
              }
            : item,
        )
      }
    }

    return {
      ...detailsForm,
      marketing: {
        ...normalizedMarketing,
        mediaLibrary: nextMediaLibrary,
      },
    }
  }

  async function handleMarketingAssetFileUpload(event, documentType, options = {}) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const uploadKey = options.uploadKey || documentType
    try {
      setMarketingAssetUploading(uploadKey)
      setError('')
      setFeedback('')
      const uploadedRows = []
      for (const file of files) {
        uploadedRows.push(
          await uploadDevelopmentDocumentAsset({
            developmentId: data.development.id,
            file,
            documentType,
            title: options.title || file.name,
            description: options.description || '',
            linkedUnitType: options.linkedUnitType || selectedMarketingFloorplan?.id || '',
          }),
        )
      }

      const nextDetailsForm = buildDetailsFormWithUploadedMarketingAssets(uploadedRows, documentType, options)
      setDetailsForm(nextDetailsForm)
      await saveDevelopmentDetails(data.development.id, buildDevelopmentDetailsPayload(nextDetailsForm))
      setFeedback(options.successMessage || 'Marketing assets uploaded.')
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setMarketingAssetUploading('')
      event.target.value = ''
    }
  }

  function getCurrentDetailsBaseline() {
    return data ? buildDetailsForm(data) : detailsForm
  }

  function buildGeneralDetailsSavePayload() {
    const baseline = getCurrentDetailsBaseline()
    return {
      ...baseline,
      name: detailsForm.name,
      code: detailsForm.code,
      location: detailsForm.location,
      suburb: detailsForm.suburb,
      city: detailsForm.city,
      province: detailsForm.province,
      country: detailsForm.country,
      address: detailsForm.address,
      status: detailsForm.status,
      developerCompany: detailsForm.developerCompany,
      totalUnitsExpected: detailsForm.totalUnitsExpected,
      launchDate: detailsForm.launchDate,
      expectedCompletionDate: detailsForm.expectedCompletionDate,
      description: detailsForm.description,
      handoverEnabled: detailsForm.handoverEnabled,
      snagTrackingEnabled: detailsForm.snagTrackingEnabled,
      alterationsEnabled: detailsForm.alterationsEnabled,
      onboardingEnabled: detailsForm.onboardingEnabled,
    }
  }

  function buildSellerDetailsSavePayload() {
    return {
      ...getCurrentDetailsBaseline(),
      sellerDetails: normalizeSellerDetailsForm(detailsForm.sellerDetails),
    }
  }

  function handleStartGeneralDetailsEdit() {
    if (data) setDetailsForm(buildDetailsForm(data))
    setSellerDetailsExpanded(false)
    setIsEditingSellerDetails(false)
    setGeneralDetailsExpanded(true)
    setIsEditingGeneralDetails(true)
  }

  function handleStartSellerDetailsEdit() {
    if (data) setDetailsForm(buildDetailsForm(data))
    setGeneralDetailsExpanded(false)
    setIsEditingGeneralDetails(false)
    setSellerDetailsExpanded(true)
    setIsEditingSellerDetails(true)
  }

  async function handleGeneralDetailsSave(event) {
    event.preventDefault()
    if (!isEditingGeneralDetails) {
      return
    }

    const validationErrors = validateGeneralDetailsForm(detailsForm)
    if (validationErrors.length) {
      setError(validationErrors.join(' '))
      return
    }

    try {
      setDetailsSaving(true)
      setFeedback('')
      setError('')
      await saveDevelopmentDetails(data.development.id, buildDevelopmentDetailsPayload(buildGeneralDetailsSavePayload()))
      setFeedback('General details updated.')
      setIsEditingGeneralDetails(false)
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setDetailsSaving(false)
    }
  }

  async function handleSellerDetailsSave(event) {
    event.preventDefault()
    if (!isEditingSellerDetails) {
      return
    }

    const validationErrors = validateSellerDetailsForm(detailsForm.sellerDetails)
    if (validationErrors.length) {
      setError(validationErrors.join(' '))
      return
    }

    try {
      setDetailsSaving(true)
      setFeedback('')
      setError('')
      await saveDevelopmentDetails(data.development.id, buildDevelopmentDetailsPayload(buildSellerDetailsSavePayload()))
      setFeedback('Seller / developer entity updated.')
      setIsEditingSellerDetails(false)
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setDetailsSaving(false)
    }
  }

  async function handleMarketingSave(event) {
    event.preventDefault()
    try {
      setDetailsSaving(true)
      setFeedback('')
      await saveDevelopmentDetails(data.development.id, buildDevelopmentDetailsPayload())
      setFeedback('Marketing content updated.')
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setDetailsSaving(false)
    }
  }

  async function handleFinancialsSave(event) {
    event.preventDefault()
    if (!isEditingFinancialsSection) {
      return
    }
    try {
      setFinancialsSaving(true)
      setFeedback('')
      await saveDevelopmentFinancials(data.development.id, {
        ...financialsForm,
        totalProjectedCost: financialsForm.totalProjectedCost || derivedProjectedCost,
        projectedProfit: financialsForm.projectedProfit || derivedProjectedProfit,
        targetMargin: financialsForm.targetMargin || Number(derivedTargetMargin.toFixed(2)),
      })
      setFeedback('Development financials updated.')
      setIsEditingFinancialsSection(false)
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setFinancialsSaving(false)
    }
  }

  function handleAddSelectedAgentAssignment() {
    if (!selectedAgentUserId) {
      return
    }

    const selectedAgent = assignableAgentOptions.find(
      (member) => buildAgentAssignmentKey(member) === selectedAgentUserId,
    )
    if (!selectedAgent) {
      return
    }

    setAgentAssignments((previous) =>
      normalizeDevelopmentAgentAssignments([...previous, selectedAgent]),
    )
    setSelectedAgentUserId('')
  }

  function handleAddManualAgentAssignment() {
    const name = String(manualAgentDraft.name || '').trim()
    const email = String(manualAgentDraft.email || '').trim().toLowerCase()

    if (!name && !email) {
      setError('Add an agent name or email address before assigning them.')
      return
    }

    if (email && !isValidEmail(email)) {
      setError('Use a valid email address for the assigned agent.')
      return
    }

    setError('')
    setAgentAssignments((previous) =>
      normalizeDevelopmentAgentAssignments([
        ...previous,
        {
          name: name || email,
          contactName: name || email,
          email,
          contactEmail: email,
          role: 'agent',
          source: 'manual',
          status: 'active',
        },
      ]),
    )
    setManualAgentDraft({ name: '', email: '' })
    setExternalAgentModalOpen(false)
  }

  function handleRemoveAgentAssignment(member) {
    const removeKey = buildAgentAssignmentKey(member)
    setAgentAssignments((previous) =>
      previous.filter((item) => buildAgentAssignmentKey(item) !== removeKey),
    )
  }

  async function handleAgentAssignmentsSave(event) {
    event.preventDefault()
    if (!canManageDevelopment) {
      return
    }

    try {
      setAgentAssignmentsSaving(true)
      setFeedback('')
      setError('')

      const currentSettings = data?.settings || {}
      const existingStakeholderTeams = getStakeholderTeamsFromSettings(currentSettings)
      const normalizedAgents = normalizeDevelopmentAgentAssignments(agentAssignments)

      await updateDevelopmentSettings(data.development.id, {
        ...currentSettings,
        stakeholderTeams: {
          ...existingStakeholderTeams,
          agents: normalizedAgents,
        },
      })

      setAgentAssignments(normalizedAgents)
      setFeedback('Development agent assignments updated.')
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setAgentAssignmentsSaving(false)
    }
  }

  async function handleReservationSettingsSave(event) {
    event.preventDefault()
    if (!canManageDevelopment || !isEditingReservationSettings) {
      return
    }

    const validationErrors = validateReservationSettingsForm(reservationSettingsForm)
    if (validationErrors.length) {
      setError(validationErrors.join(' '))
      return
    }

    try {
      setReservationSettingsSaving(true)
      setFeedback('')
      setError('')

      const currentSettings = data?.settings || {}
      const normalizedPaymentReferenceFormat = String(
        reservationSettingsForm.paymentReferenceFormat || '',
      )
        .replaceAll('{UNIT}', '{unit}')
        .replaceAll('{BUYER}', '{buyer}')
        .replaceAll('{TXN}', '{txn}')
      const existingStakeholderTeams =
        currentSettings.stakeholderTeams || currentSettings.stakeholder_teams || {}
      const rolePlayerDefaults = {
        defaultTransferAttorneySource: reservationSettingsForm.defaultTransferAttorneySource,
        defaultBondOriginatorSource: reservationSettingsForm.defaultBondOriginatorSource,
        buyerAppointedBondOriginatorAllowed: Boolean(
          reservationSettingsForm.buyerAppointedBondOriginatorAllowed,
        ),
        buyerAppointedBondOriginatorRequiresApproval:
          Boolean(reservationSettingsForm.buyerAppointedBondOriginatorAllowed) &&
          Boolean(reservationSettingsForm.buyerAppointedBondOriginatorRequiresApproval),
        autoInviteSelectedBondOriginator: Boolean(
          reservationSettingsForm.autoInviteSelectedBondOriginator,
        ),
      }

      await updateDevelopmentSettings(data.development.id, {
        ...currentSettings,
        reservation_deposit_enabled_by_default: Boolean(
          reservationSettingsForm.enabledByDefault,
        ),
        reservation_deposit_amount:
          reservationSettingsForm.defaultDepositAmount === ''
            ? null
            : reservationSettingsForm.defaultDepositAmount,
        reservation_deposit_amount_type: reservationSettingsForm.amountType || 'fixed',
        reservation_deposit_vat_treatment: reservationSettingsForm.vatTreatment,
        reservation_deposit_due_trigger: reservationSettingsForm.dueTrigger,
        reservation_deposit_treatment: reservationSettingsForm.depositTreatment,
        reservation_deposit_payable_to: reservationSettingsForm.payableTo,
        default_alteration_charge_treatment: reservationSettingsForm.alterationChargeTreatment,
        rolePlayerDefaults,
        stakeholderTeams: {
          ...existingStakeholderTeams,
          rolePlayerDefaults,
        },
        reservation_deposit_payment_details: {
          ...(currentSettings.reservation_deposit_payment_details ||
            currentSettings.reservationDepositPaymentDetails ||
            {}),
          account_holder_name: reservationSettingsForm.accountHolderName,
          bank_name: reservationSettingsForm.bankName,
          account_number: reservationSettingsForm.accountNumber,
          branch_code: reservationSettingsForm.branchCode,
          account_type: reservationSettingsForm.accountType,
          payment_reference_format: normalizedPaymentReferenceFormat,
          payment_instructions: reservationSettingsForm.paymentInstructions,
          vat_treatment: reservationSettingsForm.vatTreatment,
          due_trigger: reservationSettingsForm.dueTrigger,
        },
      })

      setFeedback('Reservation & deposit settings updated.')
      setIsEditingReservationSettings(false)
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setReservationSettingsSaving(false)
    }
  }

  function handleCancelGeneralDetailsEdit() {
    if (data) {
      setDetailsForm(buildDetailsForm(data))
    }
    setIsEditingGeneralDetails(false)
  }

  function handleCancelSellerDetailsEdit() {
    if (data) {
      setDetailsForm(buildDetailsForm(data))
    }
    setIsEditingSellerDetails(false)
  }

  function handleCancelReservationSettingsEdit() {
    if (data) {
      setReservationSettingsForm(buildReservationSettingsForm(data.settings))
    }
    setIsEditingReservationSettings(false)
  }

  function handleReservationDepositRequiredChange(event) {
    const enabledByDefault = event.target.checked
    setIsEditingReservationSettings(true)
    setReservationSettingsExpanded(true)
    setReservationSettingsForm((previous) => ({ ...previous, enabledByDefault }))

    if (!enabledByDefault) return

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById('reservation-deposit-configuration-fields')
          ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      })
    })
  }

  function handleCancelFinancialsEdit() {
    if (data) {
      setFinancialsForm(buildFinancialsForm(data.financials))
    }
    setIsEditingFinancialsSection(false)
  }

  async function handleUnitSave(event) {
    event.preventDefault()
    try {
      setUnitSaving(true)
      setFeedback('')
      await saveDevelopmentUnit({
        ...unitForm,
        developmentId: data.development.id,
        listPrice: unitForm.listPrice === '' ? 0 : unitForm.listPrice,
        currentPrice: unitForm.currentPrice === '' ? null : unitForm.currentPrice,
        bedrooms: unitForm.bedrooms === '' ? null : unitForm.bedrooms,
        bathrooms: unitForm.bathrooms === '' ? null : unitForm.bathrooms,
        parkingCount: unitForm.parkingCount === '' ? null : unitForm.parkingCount,
        sizeSqm: unitForm.sizeSqm === '' ? null : unitForm.sizeSqm,
        vatApplicable: unitForm.vatApplicable === '' ? null : unitForm.vatApplicable === 'true',
        floorplanId: unitForm.floorplanId || null,
      })
      setFeedback(unitForm.id ? 'Unit updated.' : 'Unit added to development.')
      setUnitForm(DEFAULT_UNIT_FORM)
      setUnitModalOpen(false)
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setUnitSaving(false)
    }
  }

  async function handleDocumentSave(event) {
    event.preventDefault()
    try {
      setDocumentSaving(true)
      setFeedback('')
      await saveDevelopmentDocument({
        developmentId: data.development.id,
        documentId: documentForm.id || null,
        documentType: documentForm.documentType,
        title: documentForm.title,
        description: documentForm.description,
        fileUrl: documentForm.fileUrl,
        linkedUnitId: documentForm.linkedUnitId || null,
        linkedUnitType: documentForm.linkedUnitType,
      })
      setFeedback(documentForm.id ? 'Document updated.' : 'Development asset added.')
      setDocumentForm(DEFAULT_DOCUMENT_FORM)
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setDocumentSaving(false)
    }
  }

  async function handleDeleteDocument(documentId) {
    try {
      setDocumentSaving(true)
      setFeedback('')
      await deleteDevelopmentDocument(documentId)
      setFeedback('Development document removed.')
      await loadData()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDocumentSaving(false)
    }
  }

  async function handleDownloadDocument(item) {
    if (!item?.fileUrl) {
      setError('This document does not have a file URL to download.')
      return
    }

    try {
      setDocumentDownloadingId(item.id)
      setError('')
      const response = await fetch(item.fileUrl)
      if (!response.ok) {
        throw new Error('Download failed.')
      }

      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = buildDocumentDownloadName(item)
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(objectUrl)
      setFeedback(`${item.title || 'Document'} downloaded.`)
    } catch {
      window.open(item.fileUrl, '_blank', 'noopener,noreferrer')
      setFeedback(`Opened ${item.title || 'document'} in a new tab.`)
    } finally {
      setDocumentDownloadingId('')
    }
  }

  function openDocumentEmailComposer(item) {
    const developmentName = data?.development?.name || detailsForm.name || 'Development'
    const docTypeLabel = getDocTypeLabel(item?.documentType)
    const subject = `${developmentName} • ${item?.title || 'Document'}`
    const message = [
      'Hi,',
      '',
      `Please find the ${docTypeLabel.toLowerCase()} for ${developmentName}.`,
      '',
      `Document: ${item?.title || 'Untitled document'}`,
      `Type: ${docTypeLabel}`,
      item?.fileUrl ? `Link: ${item.fileUrl}` : 'Link: (not available)',
      '',
      'Sent via Arch9.',
    ].join('\n')

    setSelectedDocumentForEmail(item)
    setDocumentEmailForm({
      ...DEFAULT_DOCUMENT_EMAIL_FORM,
      subject,
      message,
    })
    setEmailComposeOpen(true)
  }

  function closeDocumentEmailComposer() {
    setEmailComposeOpen(false)
    setEmailSending(false)
    setSelectedDocumentForEmail(null)
    setDocumentEmailForm(DEFAULT_DOCUMENT_EMAIL_FORM)
  }

  function buildMailtoLink({ recipientEmail, ccEmail, subject, message }) {
    const params = new URLSearchParams()
    if (ccEmail) {
      params.set('cc', ccEmail)
    }
    if (subject) {
      params.set('subject', subject)
    }
    if (message) {
      params.set('body', message)
    }

    const query = params.toString()
    return query ? `mailto:${recipientEmail}?${query}` : `mailto:${recipientEmail}`
  }

  async function handleSendDocumentEmail(event) {
    event.preventDefault()
    const recipientList = parseEmailRecipients(documentEmailForm.recipientEmail)
    const ccList = parseEmailRecipients(documentEmailForm.ccEmail)

    if (!recipientList.length) {
      setError('Recipient email is required.')
      return
    }

    if (![...recipientList, ...ccList].every((email) => isValidEmail(email))) {
      setError('Please provide valid email addresses.')
      return
    }

    if (!selectedDocumentForEmail?.fileUrl) {
      setError('Selected document does not have a file link to send.')
      return
    }

    try {
      setEmailSending(true)
      setError('')
      const mailtoUrl = buildMailtoLink({
        recipientEmail: recipientList.join(','),
        ccEmail: ccList.join(','),
        subject: documentEmailForm.subject.trim(),
        message: documentEmailForm.message.trim(),
      })
      window.location.href = mailtoUrl
      setFeedback(`Email draft opened for ${selectedDocumentForEmail.title || 'document'}.`)
      closeDocumentEmailComposer()
    } catch (sendError) {
      setError(sendError?.message || 'Unable to open email composer.')
    } finally {
      setEmailSending(false)
    }
  }

  function buildUnitQuickSavePayload(unit, patch = {}) {
    const merged = { ...buildUnitForm(unit), ...patch }
    return {
      ...merged,
      id: unit.id,
      developmentId: data.development.id,
      unitNumber: merged.unitNumber,
      unitLabel: merged.unitLabel || '',
      block: merged.block || '',
      unitType: merged.unitType || '',
      bedrooms: merged.bedrooms === '' ? null : merged.bedrooms ?? null,
      bathrooms: merged.bathrooms === '' ? null : merged.bathrooms ?? null,
      parkingCount: merged.parkingCount === '' ? null : merged.parkingCount ?? null,
      sizeSqm: merged.sizeSqm === '' ? null : merged.sizeSqm ?? null,
      floorplanId: merged.floorplanId || null,
      notes: merged.notes || '',
      phase: merged.phase ?? '',
      status: merged.status || 'Available',
      listPrice: merged.listPrice === '' ? 0 : merged.listPrice ?? unit.price ?? 0,
      currentPrice: merged.currentPrice === '' ? null : merged.currentPrice ?? unit.salesPrice ?? null,
      vatApplicable: merged.vatApplicable === '' ? null : merged.vatApplicable ?? null,
    }
  }

  async function handleUnitQuickSave(unit, patch, { field = 'unit', feedbackLabel = 'Unit updated.' } = {}) {
    const saveKey = `${unit.id}:${field}`
    const nextUnitNumber = Object.prototype.hasOwnProperty.call(patch, 'unitNumber')
      ? String(patch.unitNumber || '').trim()
      : String(unit.unitNumber || '').trim()

    if (!nextUnitNumber) {
      setError('Unit number is required.')
      return
    }

    const duplicateUnitNumber = unitRows.some(
      (candidate) =>
        candidate.id !== unit.id &&
        String(candidate.unitNumber || '').trim().toLowerCase() === nextUnitNumber.toLowerCase(),
    )
    if (duplicateUnitNumber) {
      setError(`Unit ${nextUnitNumber} already exists in this development.`)
      return
    }

    try {
      setUnitSaving(true)
      setUnitQuickSavingKey(saveKey)
      setFeedback('')
      setError('')

      const unitPatch = { ...patch }
      if (Object.prototype.hasOwnProperty.call(unitPatch, 'salesPrice')) {
        const parsedSalesPrice = Number(unitPatch.salesPrice)
        const nextSalesPrice = unitPatch.salesPrice === '' || !Number.isFinite(parsedSalesPrice) ? null : parsedSalesPrice
        unitPatch.listPrice = nextSalesPrice ?? 0
        unitPatch.currentPrice = nextSalesPrice
        delete unitPatch.salesPrice
        if (unit.currentTransactionId) {
          await updateDevelopmentTransactionSalesPrice(unit.currentTransactionId, nextSalesPrice)
        }
      }

      const nextStatusValue = Object.prototype.hasOwnProperty.call(unitPatch, 'status')
        ? getDevelopmentUnitStatusOption(unitPatch.status).value || 'Available'
        : unit.status || 'Available'
      unitPatch.status = nextStatusValue

      await saveDevelopmentUnit(buildUnitQuickSavePayload(unit, unitPatch))

      const statusOption = getDevelopmentUnitStatusOption(nextStatusValue)
      if (
        Object.prototype.hasOwnProperty.call(patch, 'status') &&
        unit.currentTransactionId &&
        statusOption.lifecycleStage
      ) {
        await updateTransactionLifecycleStage(unit.currentTransactionId, statusOption.lifecycleStage, {
          completed: Boolean(statusOption.completed),
          status: statusOption.completed ? 'completed' : 'active',
          source: 'development_unit_status_quick_update',
          note: `Unit ${unit.unitNumber} marked ${nextStatusValue} from the development stock table.`,
        })
      }

      setFeedback(feedbackLabel)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setUnitSaving(false)
      setUnitQuickSavingKey('')
    }
  }

  async function handleUnitHandoverDateQuickChange(unit, nextDate) {
    if (!unit.currentTransactionId) {
      setError('Handover dates can only be set after a transaction is linked to the unit.')
      return
    }

    const saveKey = `${unit.id}:handoverDate`
    try {
      setUnitSaving(true)
      setUnitQuickSavingKey(saveKey)
      setFeedback('')
      setError('')
      await upsertTransactionHandover({
        transactionId: unit.currentTransactionId,
        handover: {
          ...(unit.handover || {}),
          handoverDate: nextDate || '',
          status: unit.handover?.status || 'in_progress',
        },
      })
      setFeedback(`Unit ${unit.unitNumber} handover date updated.`)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setUnitSaving(false)
      setUnitQuickSavingKey('')
    }
  }

  async function handleUnitStatusQuickChange(unit, nextStatus) {
    const statusOption = getDevelopmentUnitStatusOption(nextStatus)
    const nextStatusValue = statusOption.value || 'Available'

    try {
      setUnitSaving(true)
      setUnitStatusSavingId(unit.id)
      setUnitQuickSavingKey(`${unit.id}:status`)
      setFeedback('')
      setError('')
      await saveDevelopmentUnit(buildUnitQuickSavePayload(unit, { status: nextStatusValue }))

      if (unit.currentTransactionId && statusOption.lifecycleStage) {
        await updateTransactionLifecycleStage(unit.currentTransactionId, statusOption.lifecycleStage, {
          completed: Boolean(statusOption.completed),
          status: statusOption.completed ? 'completed' : 'active',
          source: 'development_unit_status_quick_update',
          note: `Unit ${unit.unitNumber} marked ${nextStatusValue} from the development stock table.`,
        })
      }

      setFeedback(`Unit ${unit.unitNumber} marked ${nextStatusValue}.`)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setUnitSaving(false)
      setUnitStatusSavingId('')
      setUnitQuickSavingKey('')
    }
  }

  function openUnitModal(unit = null) {
    setUnitForm(buildUnitForm(unit))
    setUnitModalOpen(true)
  }

  function openDevelopmentTransactionWizard(initial = {}) {
    window.dispatchEvent(
      new CustomEvent('itg:open-new-transaction', {
        detail: {
          initialDevelopmentId: data?.development?.id || developmentId,
          initialUnitId: initial?.unitId || initial?.unit?.id || '',
          initialPropertyMode: 'development',
        },
      }),
    )
  }

  function openBulkUnitModal() {
    const suggestedCount = remainingPlannedUnits > 0 ? remainingPlannedUnits : 10
    const suggestedNumbers = Array.from(
      { length: Math.min(suggestedCount, 80) },
      (_, index) => String(suggestedBulkStartNumber + index),
    ).join('\n')
    setBulkUnitForm({
      ...DEFAULT_BULK_UNIT_FORM,
      step: 'breakdown',
      count: remainingPlannedUnits > 0 ? String(remainingPlannedUnits) : '',
      startNumber: String(suggestedBulkStartNumber),
      individualUnitNumbers: suggestedNumbers,
      unitsPerBlock: remainingPlannedUnits > 0 ? String(remainingPlannedUnits) : '',
      blockStartNumber: '1',
      phase: unitForm.phase || '',
      block: unitForm.block || '',
      unitType: unitForm.unitType || '',
      listPrice: '',
      status: 'Available',
      vatApplicable: '',
      notes: '',
    })
    setBulkUnitModalOpen(true)
  }

  function validateBulkUnitStep(step = bulkUnitForm.step) {
    if (step === 'breakdown' && bulkUnitForm.breakdownMode === 'blocks') {
      const blockCount = Math.trunc(Number(bulkUnitForm.blockCount || 0))
      const unitsPerBlock = Math.trunc(Number(bulkUnitForm.unitsPerBlock || 0))
      if (!blockCount || blockCount < 1) return 'Enter how many blocks this development has.'
      if (!unitsPerBlock || unitsPerBlock < 1) return 'Enter how many units are in each block.'
    }

    if (step === 'numbering') {
      if (bulkUnitForm.breakdownMode === 'individual' && !splitBulkTextList(bulkUnitForm.individualUnitNumbers).length) {
        return 'Enter the unit numbers, one per line or separated by commas.'
      }
      if (bulkUnitForm.breakdownMode === 'blocks') {
        const startNumber = Math.trunc(Number(bulkUnitForm.blockStartNumber || 0))
        if (!startNumber || startNumber < 1) return 'Enter a valid starting unit number for each block.'
        if (bulkUnitForm.blockPrefixMode === 'custom' && !String(bulkUnitForm.blockCustomPrefix || '').trim()) {
          return 'Enter the custom prefix, or choose block prefix / plain numbering.'
        }
      }
    }

    if (step === 'options' && !getBulkUnitTemplates(bulkUnitForm).some((template) => template.unitType || template.bedrooms || template.listPrice !== '')) {
      return 'Select at least one unit option before reviewing the units.'
    }

    if (step === 'phases' && bulkUnitForm.phaseMode === 'staged' && !getBulkPhaseNames(bulkUnitForm).length) {
      return 'Add at least one phase name, or choose that all units are built together.'
    }

    return ''
  }

  function handleBulkUnitNext() {
    const currentStepIndex = BULK_UNIT_STEPS.findIndex((step) => step.id === bulkUnitForm.step)
    const currentStep = BULK_UNIT_STEPS[currentStepIndex] || BULK_UNIT_STEPS[0]
    const validationMessage = validateBulkUnitStep(currentStep.id)
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setError('')
    const nextStep = BULK_UNIT_STEPS[Math.min(BULK_UNIT_STEPS.length - 1, currentStepIndex + 1)] || BULK_UNIT_STEPS.at(-1)
    setBulkUnitForm((previous) => ({
      ...previous,
      step: nextStep.id,
      generatedRows: nextStep.id === 'review' ? buildBulkUnitRows(previous) : previous.generatedRows,
    }))
  }

  function handleBulkUnitBack() {
    const currentStepIndex = BULK_UNIT_STEPS.findIndex((step) => step.id === bulkUnitForm.step)
    const previousStep = BULK_UNIT_STEPS[Math.max(0, currentStepIndex - 1)] || BULK_UNIT_STEPS[0]
    setError('')
    setBulkUnitForm((previous) => ({ ...previous, step: previousStep.id }))
  }

  function updateBulkUnitOption(optionKey, patch) {
    setBulkUnitForm((previous) => ({
      ...previous,
      unitOptions: {
        ...previous.unitOptions,
        [optionKey]: {
          ...(previous.unitOptions?.[optionKey] || DEFAULT_BULK_UNIT_FORM.unitOptions[optionKey]),
          ...patch,
        },
      },
    }))
  }

  function updateBulkGeneratedRow(rowIndex, patch) {
    setBulkUnitForm((previous) => ({
      ...previous,
      generatedRows: previous.generatedRows.map((row, index) =>
        index === rowIndex ? { ...row, ...patch } : row,
      ),
    }))
  }

  async function handleBulkUnitSave(event) {
    event.preventDefault()

    if (bulkUnitForm.step !== 'review') {
      handleBulkUnitNext()
      return
    }

    const generatedRows = bulkUnitForm.generatedRows.length
      ? bulkUnitForm.generatedRows
      : buildBulkUnitRows(bulkUnitForm)

    if (!generatedRows.length) {
      setError('Generate at least one unit before creating units.')
      return
    }

    const missingNumber = generatedRows.find((row) => !String(row.unitNumber || '').trim())
    if (missingNumber) {
      setError('Every generated row needs a unit number before creating units.')
      return
    }

    const generatedNumbers = generatedRows.map((row) => String(row.unitNumber || '').trim())
    const existingNumbers = new Set(
      unitRows.map((unit) => String(unit?.unitNumber || unit?.unit_number || '').trim().toLowerCase()).filter(Boolean),
    )
    const duplicateGenerated = generatedNumbers.find((value, index) =>
      generatedNumbers.findIndex((item) => item.toLowerCase() === value.toLowerCase()) !== index,
    )
    if (duplicateGenerated) {
      setError(`Bulk creation produced duplicate unit numbers (${duplicateGenerated}).`)
      return
    }

    const collision = generatedNumbers.find((value) => existingNumbers.has(String(value).trim().toLowerCase()))
    if (collision) {
      setError(`Unit ${collision} already exists in this development.`)
      return
    }

    try {
      setBulkUnitSaving(true)
      setFeedback('')
      setError('')

      await Promise.all(
        generatedRows.map((row) =>
          saveDevelopmentUnit({
            developmentId: data.development.id,
            unitNumber: row.unitNumber,
            unitLabel: row.unitLabel || row.unitNumber,
            phase: row.phase,
            block: row.block,
            unitType: row.unitType,
            bedrooms: row.bedrooms === '' ? null : row.bedrooms,
            listPrice: row.listPrice === '' ? 0 : row.listPrice,
            currentPrice: null,
            status: row.status || 'Available',
            vatApplicable: row.vatApplicable === '' ? null : row.vatApplicable === 'true',
            notes: row.notes,
          }),
        ),
      )

      setFeedback(`${formatNumber(generatedRows.length)} units added to development.`)
      setBulkUnitForm(DEFAULT_BULK_UNIT_FORM)
      setBulkUnitModalOpen(false)
      window.dispatchEvent(new Event('itg:developments-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setBulkUnitSaving(false)
    }
  }

  async function handleCommercialDocumentSave(scope, event) {
    event.preventDefault()
    const form = commercialDocumentForms[scope]

    try {
      setDocumentSaving(true)
      setFeedback('')
      await saveDevelopmentDocument({
        developmentId: data.development.id,
        documentId: form.id || null,
        documentType: 'legal',
        title: form.title,
        description: form.description,
        fileUrl: form.fileUrl,
        linkedUnitType: scope,
      })
      setCommercialDocumentForms((previous) => ({
        ...previous,
        [scope]: { ...DEFAULT_COMMERCIAL_DOCUMENT_FORM },
      }))
      setFeedback(scope === 'conveyancing' ? 'Conveyancing document saved.' : 'Bond originator document saved.')
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setDocumentSaving(false)
    }
  }

  async function handleDeleteDevelopment() {
    try {
      setDeleteSaving(true)
      setError('')
      setFeedback('')
      await deleteDevelopment(data.development.id)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      window.dispatchEvent(new Event('itg:developments-changed'))
      navigate('/developments')
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDeleteSaving(false)
      setDeleteConfirmOpen(false)
    }
  }

  function renderEditableMarketingContent() {
    const selectedUnitStatus = getMarketingUnitStatus(selectedMarketingFloorplan?.listingStatus)
    const selectedFeatureEntries = selectedMarketingFloorplan
      ? normalizeMarketingUnitList(selectedMarketingFloorplan.keyFeatures)
      : []
    const generatedFeatureEntries = selectedMarketingFloorplan
      ? getMarketingFloorplanFeatureEntries(selectedMarketingFloorplan).filter(
          (item) => !selectedFeatureEntries.includes(item),
        )
      : []
    const selectedHighlightEntries = selectedMarketingFloorplan
      ? getMarketingFloorplanHighlightEntries(selectedMarketingFloorplan)
      : []
    const availabilityPercent = selectedMarketingUnitStats.total
      ? Math.round((selectedMarketingUnitStats.available / selectedMarketingUnitStats.total) * 100)
      : 0
    const selectedUnitImages = uniqueTruthyValues([
      ...textareaToList(selectedMarketingFloorplan?.imageUrls),
      ...selectedMarketingUnitImageDocuments.map((item) => item.fileUrl),
    ])
    const selectedUnitFloorplans = uniqueTruthyValues([
      ...textareaToList(selectedMarketingFloorplan?.floorplanUrls),
      ...selectedMarketingUnitFloorplanDocuments.map((item) => item.fileUrl),
    ])
    const selectedUnitDocuments = uniqueTruthyValues([
      ...textareaToList(selectedMarketingFloorplan?.documentUrls),
      ...selectedMarketingUnitDocumentAssets.map((item) => item.fileUrl),
    ])
    const selectedUnitVideos = uniqueTruthyValues([
      ...[selectedMarketingFloorplan?.videoUrl].filter(Boolean),
      ...selectedMarketingUnitVideoDocuments.map((item) => item.fileUrl),
    ])
    const selectedUnitVirtualTours = uniqueTruthyValues([
      ...[selectedMarketingFloorplan?.virtualTourUrl].filter(Boolean),
      ...selectedMarketingUnitVirtualTourDocuments.map((item) => item.fileUrl),
    ])

    return (
      <>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#1f7a45]">
              <span>Developments</span>
              <span className="text-[#9aa9ba]">/</span>
              <span className="text-[#4c6076]">{data.development.name || 'Development'}</span>
              <span className="text-[#9aa9ba]">/</span>
              <span className="text-[#142132]">Marketing</span>
            </div>
            <h3 className="mt-2 text-[1.45rem] font-semibold tracking-[-0.035em] text-[#142132]">Marketing</h3>
            <p className="mt-1 text-sm leading-6 text-[#60758c]">
              Manage the public listing content, pricing, media and documents by unit type.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handlePreviewPublicListing}>
              <ArrowUpRight size={15} />
              Preview Public Listing
            </Button>
            <Button type="button" onClick={() => void handlePublishDevelopmentMarketing()} disabled={detailsSaving}>
              <ArrowUpRight size={15} />
              Publish Development
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMarketingUnitTab('global')}>
              <ShieldCheck size={15} />
              Global Brand Settings
            </Button>
          </div>
        </div>

        <section className="grid overflow-hidden rounded-[18px] border border-[#dfe8f2] bg-white sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Unit Types', marketingForm.floorplans.length ? `${marketingForm.floorplans.length}` : '0', 'Active'],
            ['Assets', `${marketingAssetDocuments.length}`, 'Total'],
            ['Floorplans', `${floorplanDocumentOptions.length}`, 'Uploaded'],
            [
              'Listing Status',
              toTitleLabel(marketingReadinessSummary.listingStatus),
              marketingForm.listingConfiguration.publicVisibility ? 'Visible' : 'Not published',
            ],
          ].map(([label, value, sublabel]) => (
            <article key={label} className="border-b border-[#edf2f7] px-4 py-4 sm:border-r xl:border-b-0">
              <span className="block text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#7c8da3]">{label}</span>
              <div className="mt-2 flex items-center gap-2">
                <strong className="text-lg font-semibold text-[#142132]">{value}</strong>
                <span className="text-sm font-medium text-[#70839a]">{sublabel}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[18px] border border-[#dfe8f2] bg-[#fbfcfe] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-[#142132]">Unit Types</h4>
                <p className="mt-1 text-xs leading-5 text-[#60758c]">
                  Select a unit type to manage its marketing content.
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addMarketingFloorplan}>
                <Plus size={14} />
                Add
              </Button>
            </div>

            <div className="grid gap-2">
              {marketingForm.floorplans.map((item, index) => {
                const stats = marketingUnitTypeStats.get(item.id) || { total: 0, available: 0 }
                const status = getMarketingUnitStatus(item.listingStatus)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedFloorplanId(item.id)
                      setMarketingUnitTab('overview')
                    }}
                    className={`rounded-[14px] border px-3.5 py-3 text-left transition ${
                      selectedMarketingFloorplan?.id === item.id && marketingUnitTab !== 'global'
                        ? 'border-[#25a45a] bg-[#edf9f1] shadow-[0_10px_20px_rgba(31,122,69,0.08)]'
                        : 'border-[#e1e9f2] bg-white hover:border-[#c9d8e7]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-sm font-semibold text-[#142132]">{item.name || `Unit Type ${index + 1}`}</strong>
                      <span className={`rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${getMarketingUnitStatusClassName(status)}`}>
                        {toTitleLabel(status)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#60758c]">
                      <span>{stats.total ? `${stats.available} of ${stats.total} available` : 'No units matched'}</span>
                      <span>{formatMarketingFloorplanPriceSummary(item) || 'Price not set'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="rounded-[18px] border border-[#dfe8f2] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
            {marketingUnitTab === 'global' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8eef5] pb-4">
                  <div>
                    <h4 className="text-lg font-semibold tracking-[-0.025em] text-[#142132]">Global Brand Settings</h4>
                    <p className="mt-1 text-sm text-[#60758c]">Shared development-level listing identity and publishing controls.</p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setMarketingUnitTab('overview')}>
                    Back to Unit Type
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailField label="Listing Title">
                    <Field value={marketingForm.listingOverview.listingTitle} onChange={(event) => setMarketingField('listingOverview', 'listingTitle', event.target.value)} />
                  </DetailField>
                  <DetailField label="Listing Heading">
                    <Field value={marketingForm.listingOverview.listingHeading} onChange={(event) => setMarketingField('listingOverview', 'listingHeading', event.target.value)} />
                  </DetailField>
                  <DetailField label="Cover Image">
                    <label className="flex min-h-[84px] cursor-pointer flex-col justify-center rounded-[14px] border border-dashed border-[#cad9e9] bg-white px-4 py-3 text-sm font-semibold text-[#20364c] hover:border-[#9fb8d0] hover:bg-[#f7fbff]">
                      <span className="inline-flex items-center gap-2">
                        <ImagePlus size={15} />
                        {marketingAssetUploading === 'cover-image' ? 'Uploading...' : 'Upload Cover Image'}
                      </span>
                      <span className="mt-1 text-xs font-medium text-[#6b7d93]">{marketingForm.mediaLibrary.heroImageUrl ? getAssetFileLabel(marketingForm.mediaLibrary.heroImageUrl, 'Cover image') : 'No cover image uploaded'}</span>
                      <input type="file" accept="image/*" className="hidden" disabled={Boolean(marketingAssetUploading)} onChange={(event) => void handleMarketingAssetFileUpload(event, 'marketing', { uploadKey: 'cover-image', setAsHero: true, successMessage: 'Cover image uploaded.' })} />
                    </label>
                  </DetailField>
                  <DetailField label="Development Logo">
                    <label className="flex min-h-[84px] cursor-pointer flex-col justify-center rounded-[14px] border border-dashed border-[#cad9e9] bg-white px-4 py-3 text-sm font-semibold text-[#20364c] hover:border-[#9fb8d0] hover:bg-[#f7fbff]">
                      <span className="inline-flex items-center gap-2">
                        <ImagePlus size={15} />
                        {marketingAssetUploading === 'development-logo' ? 'Uploading...' : 'Upload Logo'}
                      </span>
                      <span className="mt-1 text-xs font-medium text-[#6b7d93]">{marketingForm.mediaLibrary.developmentLogoUrl ? getAssetFileLabel(marketingForm.mediaLibrary.developmentLogoUrl, 'Logo') : 'No logo uploaded'}</span>
                      <input type="file" accept="image/*" className="hidden" disabled={Boolean(marketingAssetUploading)} onChange={(event) => void handleMarketingAssetFileUpload(event, 'logo', { uploadKey: 'development-logo', successMessage: 'Development logo uploaded.' })} />
                    </label>
                  </DetailField>
                  <DetailField label="Public Listing URL">
                    <Field value={marketingForm.externalLinks.developmentLandingPageUrl} onChange={(event) => setMarketingField('externalLinks', 'developmentLandingPageUrl', event.target.value)} />
                  </DetailField>
                  <DetailField label="Marketing Status">
                    <Field as="select" value={marketingForm.listingConfiguration.marketingStatus} onChange={(event) => setMarketingField('listingConfiguration', 'marketingStatus', event.target.value)}>
                      {MARKETING_PUBLISH_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Field>
                  </DetailField>
                  <DetailField label="SEO Title">
                    <Field value={marketingForm.listingOverview.seoTitle} onChange={(event) => setMarketingField('listingOverview', 'seoTitle', event.target.value)} />
                  </DetailField>
                  <DetailField label="SEO Meta Description">
                    <Field value={marketingForm.listingOverview.seoMetaDescription} onChange={(event) => setMarketingField('listingOverview', 'seoMetaDescription', event.target.value)} />
                  </DetailField>
                </div>
              </div>
            ) : selectedMarketingFloorplan ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8eef5] pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-semibold tracking-[-0.025em] text-[#142132]">
                        {selectedMarketingFloorplan.name || 'Untitled Unit Type'}
                      </h4>
                      <span className={`rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getMarketingUnitStatusClassName(selectedUnitStatus)}`}>
                        {toTitleLabel(selectedUnitStatus)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#60758c]">
                      {selectedMarketingUnitStats.total
                        ? `${selectedMarketingUnitStats.available} of ${selectedMarketingUnitStats.total} units available`
                        : 'No inventory currently matched to this unit type'}
                    </p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => removeMarketingFloorplan(selectedMarketingFloorplan.id)}>
                    <Trash2 size={15} />
                    Remove Unit Type
                  </Button>
                </div>

                <div className="flex gap-2 overflow-x-auto border-b border-[#e8eef5] pb-2">
                  {MARKETING_UNIT_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMarketingUnitTab(tab.id)}
                      className={`min-h-10 rounded-[10px] px-4 text-sm font-semibold transition ${
                        marketingUnitTab === tab.id
                          ? 'bg-[#1f7a45] text-white shadow-[0_8px_16px_rgba(31,122,69,0.16)]'
                          : 'bg-[#f7f9fc] text-[#526980] hover:bg-[#eef4fa]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {marketingUnitTab === 'overview' ? (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-5">
                      <section className="rounded-[16px] border border-[#e2eaf3] bg-[#fbfcfe] p-4">
                        <div className="mb-3">
                          <h5 className="text-sm font-semibold text-[#142132]">Description</h5>
                          <p className="mt-1 text-xs text-[#60758c]">This description appears on the public listing for this unit type.</p>
                        </div>
                        <Field as="textarea" rows={7} value={selectedMarketingFloorplan.description} onChange={(event) => setSelectedMarketingFloorplanField('description', event.target.value)} />
                      </section>

                      <section className="rounded-[16px] border border-[#e2eaf3] bg-white p-4">
                        <h5 className="text-sm font-semibold text-[#142132]">Key Features</h5>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedFeatureEntries.map((feature) => (
                            <button key={feature} type="button" onClick={() => removeSelectedMarketingListItem('keyFeatures', feature)} className="rounded-full border border-[#d9e5f0] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#38526b] hover:border-[#f4c7c3] hover:bg-[#fff1f0]">
                              {feature} x
                            </button>
                          ))}
                          {generatedFeatureEntries.map((feature) => (
                            <span key={feature} className="rounded-full border border-[#d9e5f0] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#38526b]">{feature}</span>
                          ))}
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <Field value={marketingFeatureDraft} onChange={(event) => setMarketingFeatureDraft(event.target.value)} placeholder="Add a feature..." />
                          <Button type="button" variant="secondary" onClick={() => addSelectedMarketingListItem('keyFeatures', marketingFeatureDraft, setMarketingFeatureDraft)}>
                            <Plus size={14} />
                            Add Feature
                          </Button>
                        </div>
                      </section>

                      <section className="rounded-[16px] border border-[#e2eaf3] bg-white p-4">
                        <h5 className="text-sm font-semibold text-[#142132]">Marketing Highlights</h5>
                        <div className="mt-3 grid gap-2">
                          {selectedHighlightEntries.map((highlight) => (
                            <button key={highlight} type="button" onClick={() => removeSelectedMarketingListItem('marketingHighlights', highlight)} className="flex items-center gap-2 rounded-[12px] border border-[#e3ebf4] bg-[#fbfcfe] px-3 py-2 text-left text-sm text-[#31475c] hover:border-[#f4c7c3] hover:bg-[#fff7f7]">
                              <CheckCircle2 size={15} className="text-[#1f7a45]" />
                              <span className="min-w-0 flex-1">{highlight}</span>
                              <span className="text-[#9aa9ba]">x</span>
                            </button>
                          ))}
                          {!selectedHighlightEntries.length ? (
                            <p className="rounded-[12px] border border-dashed border-[#d8e3ef] px-3 py-4 text-sm text-[#60758c]">No highlights added yet.</p>
                          ) : null}
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <Field value={marketingHighlightDraft} onChange={(event) => setMarketingHighlightDraft(event.target.value)} placeholder="Add a highlight..." />
                          <Button type="button" variant="secondary" onClick={() => addSelectedMarketingListItem('marketingHighlights', marketingHighlightDraft, setMarketingHighlightDraft)}>
                            <Plus size={14} />
                            Add Highlight
                          </Button>
                        </div>
                      </section>
                    </div>

                    <div className="space-y-5">
                      <section className="rounded-[16px] border border-[#e2eaf3] bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h5 className="text-sm font-semibold text-[#142132]">Quick Details</h5>
                          <PencilLine size={15} className="text-[#60758c]" />
                        </div>
                        <div className="grid gap-3">
                          {[
                            ['Internal Size', 'floorSize'],
                            ['Erf / Balcony Size', 'erfSize'],
                            ['Bedrooms', 'bedrooms'],
                            ['Bathrooms', 'bathrooms'],
                            ['Parking', 'garage'],
                          ].map(([label, key]) => (
                            <DetailField key={key} label={label}>
                              <Field value={selectedMarketingFloorplan[key]} onChange={(event) => setSelectedMarketingFloorplanField(key, event.target.value)} />
                            </DetailField>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-[16px] border border-[#e2eaf3] bg-white p-4">
                        <h5 className="text-sm font-semibold text-[#142132]">Availability</h5>
                        <div className="mt-3 flex items-center justify-between text-sm text-[#60758c]">
                          <span>{selectedMarketingUnitStats.available} of {selectedMarketingUnitStats.total} units available</span>
                          <strong className="text-[#142132]">{availabilityPercent}%</strong>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-[#e8eef5]">
                          <span className="block h-full rounded-full bg-[#1f7a45]" style={{ width: `${availabilityPercent}%` }} />
                        </div>
                      </section>

                      <section className="rounded-[16px] border border-[#e2eaf3] bg-white p-4">
                        <h5 className="text-sm font-semibold text-[#142132]">Call To Action</h5>
                        <div className="mt-3 grid gap-3">
                          <DetailField label="Primary action">
                            <Field value={selectedMarketingFloorplan.ctaLabel} onChange={(event) => setSelectedMarketingFloorplanField('ctaLabel', event.target.value)} />
                          </DetailField>
                          <DetailField label="Secondary action">
                            <Field value={selectedMarketingFloorplan.secondaryCtaLabel} onChange={(event) => setSelectedMarketingFloorplanField('secondaryCtaLabel', event.target.value)} />
                          </DetailField>
                        </div>
                      </section>

                      <section className="rounded-[16px] border border-[#e2eaf3] bg-white p-4">
                        <h5 className="text-sm font-semibold text-[#142132]">Status</h5>
                        <Field as="select" className="mt-3" value={selectedUnitStatus} onChange={(event) => setSelectedMarketingFloorplanField('listingStatus', event.target.value)}>
                          {MARKETING_LISTING_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </Field>
                      </section>
                    </div>
                  </div>
                ) : null}

                {marketingUnitTab === 'pricing' ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      ['Unit Type Name', 'name'],
                      ['Price From', 'priceFrom'],
                      ['Price To', 'priceTo'],
                      ['Levies', 'levies'],
                      ['Rates & Taxes', 'ratesAndTaxes'],
                    ].map(([label, key]) => (
                      <DetailField key={key} label={label}>
                        <Field value={selectedMarketingFloorplan[key]} onChange={(event) => setSelectedMarketingFloorplanField(key, event.target.value)} />
                      </DetailField>
                    ))}
                    <DetailField label="No Transfer Duty">
                      <Field as="select" value={selectedMarketingFloorplan.noTransferDuty ? 'yes' : 'no'} onChange={(event) => setSelectedMarketingFloorplanField('noTransferDuty', event.target.value === 'yes')}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Field>
                    </DetailField>
                    <DetailField label="Customisation Options">
                      <Field as="select" value={selectedMarketingFloorplan.customisationOptions ? 'yes' : 'no'} onChange={(event) => setSelectedMarketingFloorplanField('customisationOptions', event.target.value === 'yes')}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Field>
                    </DetailField>
                  </div>
                ) : null}

                {marketingUnitTab === 'media' ? (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <section className="rounded-[16px] border border-[#e2eaf3] bg-[#fbfcfe] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h5 className="text-sm font-semibold text-[#142132]">Images</h5>
                        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#20364c] hover:bg-[#f8fbff]">
                          <ImagePlus size={13} />
                          {marketingAssetUploading === `unit-images-${selectedMarketingFloorplan.id}` ? 'Uploading...' : 'Upload Images'}
                          <input type="file" accept="image/*" multiple className="hidden" disabled={Boolean(marketingAssetUploading)} onChange={(event) => void handleMarketingAssetFileUpload(event, 'marketing', { uploadKey: `unit-images-${selectedMarketingFloorplan.id}`, linkedUnitType: selectedMarketingFloorplan.id, successMessage: 'Unit type images uploaded.' })} />
                        </label>
                      </div>
                      {selectedUnitImages.length ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {selectedUnitImages.slice(0, 6).map((url) => (
                            <article key={url} className="overflow-hidden rounded-[14px] border border-[#e2eaf3] bg-white">
                              {isLikelyImageUrl(url) ? <img src={url} alt="Unit type marketing" className="h-36 w-full object-cover" /> : <div className="flex h-36 items-center justify-center bg-[#edf3f8] text-sm text-[#60758c]">Media file</div>}
                              <div className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="min-w-0 truncate text-xs font-semibold text-[#526980]">{getAssetFileLabel(url, 'Image')}</span>
                                <Button type="button" size="sm" variant="secondary" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>View</Button>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-[14px] border border-dashed border-[#d8e3ef] bg-white px-4 py-8 text-center text-sm text-[#60758c]">No images uploaded for this unit type.</p>
                      )}
                    </section>
                    <section className="rounded-[16px] border border-[#e2eaf3] bg-white p-4">
                      <div className="mb-3">
                        <h5 className="text-sm font-semibold text-[#142132]">Video & Tour</h5>
                      </div>
                      <div className="grid gap-3">
                        <label className="flex min-h-[88px] cursor-pointer flex-col justify-center rounded-[14px] border border-dashed border-[#cad9e9] bg-[#fbfdff] px-4 py-3 text-sm font-semibold text-[#20364c] hover:border-[#9fb8d0] hover:bg-[#f7fbff]">
                          <span className="inline-flex items-center gap-2">
                            <Upload size={15} />
                            {marketingAssetUploading === `unit-video-${selectedMarketingFloorplan.id}` ? 'Uploading video...' : 'Upload Video'}
                          </span>
                          <span className="mt-1 text-xs font-medium text-[#6b7d93]">{selectedUnitVideos.length ? `${selectedUnitVideos.length} uploaded` : 'No video uploaded'}</span>
                          <input type="file" accept="video/*" className="hidden" disabled={Boolean(marketingAssetUploading)} onChange={(event) => void handleMarketingAssetFileUpload(event, 'video', { uploadKey: `unit-video-${selectedMarketingFloorplan.id}`, linkedUnitType: selectedMarketingFloorplan.id, successMessage: 'Unit type video uploaded.' })} />
                        </label>
                        {selectedUnitVideos.map((url) => (
                          <article key={url} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e2eaf3] bg-[#fbfcfe] px-3 py-2.5">
                            <span className="min-w-0 truncate text-sm font-medium text-[#31475c]">{getAssetFileLabel(url, 'Video')}</span>
                            <Button type="button" size="sm" variant="secondary" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>View</Button>
                          </article>
                        ))}
                        <label className="flex min-h-[88px] cursor-pointer flex-col justify-center rounded-[14px] border border-dashed border-[#cad9e9] bg-[#fbfdff] px-4 py-3 text-sm font-semibold text-[#20364c] hover:border-[#9fb8d0] hover:bg-[#f7fbff]">
                          <span className="inline-flex items-center gap-2">
                            <Upload size={15} />
                            {marketingAssetUploading === `unit-tour-${selectedMarketingFloorplan.id}` ? 'Uploading tour...' : 'Upload Virtual Tour'}
                          </span>
                          <span className="mt-1 text-xs font-medium text-[#6b7d93]">{selectedUnitVirtualTours.length ? `${selectedUnitVirtualTours.length} uploaded` : 'No tour uploaded'}</span>
                          <input type="file" accept="video/*,.zip,.html" className="hidden" disabled={Boolean(marketingAssetUploading)} onChange={(event) => void handleMarketingAssetFileUpload(event, 'virtual_tour', { uploadKey: `unit-tour-${selectedMarketingFloorplan.id}`, linkedUnitType: selectedMarketingFloorplan.id, successMessage: 'Unit type virtual tour uploaded.' })} />
                        </label>
                        {selectedUnitVirtualTours.map((url) => (
                          <article key={url} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e2eaf3] bg-[#fbfcfe] px-3 py-2.5">
                            <span className="min-w-0 truncate text-sm font-medium text-[#31475c]">{getAssetFileLabel(url, 'Virtual tour')}</span>
                            <Button type="button" size="sm" variant="secondary" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>View</Button>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : null}

                {marketingUnitTab === 'floorplans' ? (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <section className="rounded-[16px] border border-[#e2eaf3] bg-[#fbfcfe] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h5 className="text-sm font-semibold text-[#142132]">Uploaded Floorplans</h5>
                        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#20364c] hover:bg-[#f8fbff]">
                          <Upload size={13} />
                          Upload
                          <input type="file" accept=".pdf,image/*" multiple className="hidden" disabled={Boolean(marketingAssetUploading)} onChange={(event) => void handleMarketingAssetFileUpload(event, 'floorplan', { uploadKey: `unit-floorplans-${selectedMarketingFloorplan.id}`, linkedUnitType: selectedMarketingFloorplan.id, successMessage: 'Unit type floorplans uploaded.' })} />
                        </label>
                      </div>
                      <div className="grid gap-2">
                        {selectedUnitFloorplans.map((url) => (
                          <article key={url} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e2eaf3] bg-white px-3 py-2.5">
                            <span className="min-w-0 truncate text-sm font-medium text-[#31475c]">{getAssetFileLabel(url, 'Floorplan')}</span>
                            <Button type="button" size="sm" variant="secondary" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>View</Button>
                          </article>
                        ))}
                        {!selectedUnitFloorplans.length ? <p className="rounded-[14px] border border-dashed border-[#d8e3ef] bg-white px-4 py-8 text-center text-sm text-[#60758c]">No floorplans uploaded for this unit type.</p> : null}
                      </div>
                    </section>
                    <section className="rounded-[16px] border border-[#e2eaf3] bg-white p-4">
                      <h5 className="text-sm font-semibold text-[#142132]">Floorplan Uploads</h5>
                      <p className="mt-3 rounded-[14px] border border-dashed border-[#d8e3ef] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#60758c]">
                        {selectedUnitFloorplans.length ? `${selectedUnitFloorplans.length} floorplan file${selectedUnitFloorplans.length === 1 ? '' : 's'} linked to this unit type.` : 'No floorplans uploaded yet.'}
                      </p>
                    </section>
                  </div>
                ) : null}

                {marketingUnitTab === 'documents' ? (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <section className="rounded-[16px] border border-[#e2eaf3] bg-[#fbfcfe] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h5 className="text-sm font-semibold text-[#142132]">Documents</h5>
                        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#20364c] hover:bg-[#f8fbff]">
                          <Upload size={13} />
                          Upload
                          <input type="file" multiple className="hidden" disabled={Boolean(marketingAssetUploading)} onChange={(event) => void handleMarketingAssetFileUpload(event, 'other', { uploadKey: `unit-documents-${selectedMarketingFloorplan.id}`, linkedUnitType: selectedMarketingFloorplan.id, successMessage: 'Unit type documents uploaded.' })} />
                        </label>
                      </div>
                      <div className="grid gap-2">
                        {selectedUnitDocuments.map((url) => (
                          <article key={url} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e2eaf3] bg-white px-3 py-2.5">
                            <span className="min-w-0 truncate text-sm font-medium text-[#31475c]">{getAssetFileLabel(url, 'Document')}</span>
                            <Button type="button" size="sm" variant="secondary" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>View</Button>
                          </article>
                        ))}
                        {!selectedUnitDocuments.length ? <p className="rounded-[14px] border border-dashed border-[#d8e3ef] bg-white px-4 py-8 text-center text-sm text-[#60758c]">No documents linked to this unit type.</p> : null}
                      </div>
                    </section>
                    <section className="rounded-[16px] border border-[#e2eaf3] bg-white p-4">
                      <h5 className="text-sm font-semibold text-[#142132]">Document Uploads</h5>
                      <p className="mt-3 rounded-[14px] border border-dashed border-[#d8e3ef] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#60758c]">
                        {selectedUnitDocuments.length ? `${selectedUnitDocuments.length} document file${selectedUnitDocuments.length === 1 ? '' : 's'} linked to this unit type.` : 'No documents uploaded yet.'}
                      </p>
                    </section>
                  </div>
                ) : null}

                {marketingUnitTab === 'seo' ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailField label="SEO Title">
                      <Field value={selectedMarketingFloorplan.seoTitle} onChange={(event) => setSelectedMarketingFloorplanField('seoTitle', event.target.value)} />
                    </DetailField>
                    <DetailField label="Listing Slug">
                      <Field value={selectedMarketingFloorplan.listingSlug} onChange={(event) => setSelectedMarketingFloorplanField('listingSlug', event.target.value)} />
                    </DetailField>
                    <DetailField label="CTA URL">
                      <Field value={selectedMarketingFloorplan.ctaUrl} onChange={(event) => setSelectedMarketingFloorplanField('ctaUrl', event.target.value)} />
                    </DetailField>
                    <DetailField label="SEO Meta Description" className="md:col-span-2">
                      <Field as="textarea" rows={5} value={selectedMarketingFloorplan.seoDescription} onChange={(event) => setSelectedMarketingFloorplanField('seoDescription', event.target.value)} />
                    </DetailField>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#d8e3ef] bg-[#fbfdff] px-4 py-10 text-center text-sm text-[#60758c]">
                Add a unit type to start configuring marketing content.
              </div>
            )}
          </section>
        </section>

        <div className="flex items-center justify-end border-t border-[#e6edf5] pt-4">
          <Button type="submit" disabled={detailsSaving}>
            {detailsSaving ? 'Saving...' : 'Save Marketing Content'}
          </Button>
        </div>
      </>
    )
  }

  if (!isSupabaseConfigured) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">Supabase is not configured for this workspace.</p>
  }

  if (loading) {
    return <p className="rounded-[16px] border border-[#dde4ee] bg-white px-5 py-4 text-sm text-[#6b7d93]">Loading development...</p>
  }

  if (!data) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">Development not found.</p>
  }

  return (
    <section className="min-w-0 max-w-full overflow-x-hidden">
      <div className="flex min-w-0 flex-col">
      {error ? <p className="mt-4 rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p> : null}
      {feedback ? <p className="mt-4 rounded-[16px] border border-[#d6ece0] bg-[#edfdf3] px-5 py-4 text-sm text-[#1c7d45]">{feedback}</p> : null}

      <section className="mt-6">
        <div className="relative min-h-[360px] overflow-hidden rounded-[28px] border border-[#203c35]/40 bg-[#0b211d] shadow-[0_28px_70px_rgba(15,23,42,0.22)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(40,134,86,0.45),transparent_34%),linear-gradient(135deg,#0b211d_0%,#142f32_52%,#071316_100%)]" aria-hidden />
          {developmentHeroImageUrl ? (
            <img
              src={developmentHeroImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              onError={(event) => {
                event.currentTarget.style.display = 'none'
              }}
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,18,15,0.78)_0%,rgba(4,18,15,0.50)_54%,rgba(4,18,15,0.34)_100%)]" aria-hidden />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(4,18,15,0.62)_0%,rgba(4,18,15,0.28)_46%,rgba(4,18,15,0.08)_100%)]" aria-hidden />

          <div className="relative z-10 flex min-h-[360px] flex-col justify-between gap-8 p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <Button
                variant="secondary"
                onClick={() => navigate('/developments')}
                className="border-white/20 bg-black/25 text-white shadow-[0_12px_28px_rgba(0,0,0,0.18)] backdrop-blur-md hover:border-white/35 hover:bg-black/35"
              >
                <ArrowLeft size={14} />
                Back to developments
              </Button>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                {canManageDevelopment ? (
                  <Button
                    variant="secondary"
                    onClick={() => setActiveTab('configuration')}
                    className="border-white/85 bg-white text-[#142132] shadow-[0_14px_30px_rgba(0,0,0,0.18)] hover:bg-[#f8fafc]"
                  >
                    <PencilLine size={15} />
                    Edit Development
                  </Button>
                ) : null}
                {canCreateTransactions ? (
                  <Button
                    onClick={openDevelopmentTransactionWizard}
                    className="bg-[#17764f] text-white shadow-[0_16px_34px_rgba(14,103,68,0.35)] hover:bg-[#0f6c43]"
                  >
                    <Plus size={15} />
                    Add Transaction
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => setActiveTab('marketing')}
                  className="border-white/85 bg-white text-[#142132] shadow-[0_14px_30px_rgba(0,0,0,0.18)] hover:bg-[#f8fafc]"
                >
                  <Upload size={15} />
                  Upload Asset
                </Button>
              </div>
            </div>

            <div className="mb-10 min-w-0 lg:mb-12">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="max-w-[920px] text-[2.55rem] font-semibold leading-[1.04] tracking-[-0.035em] text-white drop-shadow-[0_8px_22px_rgba(0,0,0,0.35)] sm:text-[2.9rem] lg:text-[3.15rem]">
                  {data.development.name}
                </h1>
                <span className="inline-flex rounded-full border border-[#b8f1cd]/40 bg-[#17764f]/80 px-3 py-1 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur">
                  {toTitleLabel(detailsForm.status || 'active')} Development
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-white">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <MapPin size={16} className="shrink-0 text-white" />
                  <span className="truncate">{locationLine || 'Location pending'}</span>
                </span>
                <span className="hidden h-1 w-1 rounded-full bg-white/45 sm:inline-flex" aria-hidden />
                <span>{formatNumber(overviewSalesProgress.totalUnits)} Units</span>
                <span className="hidden h-1 w-1 rounded-full bg-white/45 sm:inline-flex" aria-hidden />
                <span>{formatPercent(overviewSalesProgress.sellThroughPercent)} Sold Through</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 -mt-12 px-0 sm:px-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {summaryItems.map((item) => {
            const Icon = item.icon
            return (
              <article
                key={item.label}
                className="rounded-[20px] border border-[#dde4ee] bg-white px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.12)]"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  {Icon ? (
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7efdf] bg-[#eaf7ef] text-[#159447]">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                  ) : null}
                  <span className="sr-only">{item.label}</span>
                </div>
                <span className="block text-sm font-medium tracking-[-0.01em] text-[#61738a]">{item.label}</span>
                <strong className="block text-[1.7rem] font-semibold leading-none tracking-[-0.035em] text-[#142132]">
                  {item.value}
                </strong>
                <span className="mt-3 block text-sm font-medium text-[#6b7d93]">{item.meta}</span>
              </article>
            )
          })}
        </div>
      </section>

      <section className="mt-4 rounded-[24px] border border-[#dde4ee] bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7" role="tablist" aria-label="Development workspace tabs">
          {DEVELOPMENT_TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'inline-flex min-h-[48px] items-center justify-center rounded-[16px] border px-4 py-3 text-sm font-semibold transition duration-150 ease-out',
                  isActive
                    ? 'border-[#cfe1f7] bg-[#35546c] text-white shadow-[0_10px_24px_rgba(15,23,42,0.1)]'
                    : 'border-transparent bg-[#f8fafc] text-[#4f647a] hover:border-[#dde4ee] hover:bg-white',
                ].join(' ')}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </section>

      {activeTab === 'overview' ? (
        <section className="mt-5 grid gap-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
            <article className="rounded-[18px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Development Health</h3>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('configuration')}>
                  View all
                </Button>
              </div>
              {developmentHealthItems.length ? (
                <ul className="grid gap-3">
                  {developmentHealthItems.map((item) => {
                    const isSuccess = item.tone === 'success'
                    const isDanger = item.tone === 'danger'
                    const StatusIcon = isSuccess ? CheckCircle2 : isDanger ? XCircle : AlertTriangle
                    return (
                      <li key={item.label} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                        <StatusIcon
                          size={18}
                          className={isSuccess ? 'text-[#16a34a]' : isDanger ? 'text-[#ef4444]' : 'text-[#d99a12]'}
                        />
                        <div className="min-w-0">
                          <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
                          <span className="mt-0.5 block text-sm leading-5 text-[#61738a]">{item.detail}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">
                  Complete the setup to start tracking development health.
                </p>
              )}
            </article>

            <article className="rounded-[18px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Transaction Pipeline</h3>
                <span className="text-xs font-semibold text-[#6b7d93]">{formatNumber(developmentTrackerMetrics.totalUnits || 0)} units</span>
              </div>
              <div className="grid gap-4">
                {transactionPipelineItems.map((item) => (
                  <div key={item.key} className="grid grid-cols-[minmax(110px,0.8fr)_minmax(90px,1fr)_36px] items-center gap-3">
                    <span className="text-sm font-semibold text-[#1f3145]">{item.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-[#edf2f7]" aria-hidden="true">
                      <span className={`block h-full rounded-full ${item.tone}`} style={{ width: `${item.width}%` }} />
                    </span>
                    <strong className="text-right text-sm font-semibold text-[#142132]">{formatNumber(item.count)}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-[16px] border border-[#e3ebf4] bg-[#f8fafc] px-4 py-3">
                <p className="text-sm font-semibold text-[#142132]">
                  {formatNumber(developmentTrackerMetrics.dealsInProgress || 0)} {developmentTrackerMetrics.dealsInProgress === 1 ? 'unit is' : 'units are'} in active transactions
                </p>
                <Button variant="ghost" className="mt-2 w-full justify-between px-0" onClick={() => setActiveTab('transactions')}>
                  View all transactions
                  <ArrowUpRight size={14} />
                </Button>
              </div>
            </article>

            <article className="rounded-[18px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Transactions Requiring Attention</h3>
                <span
                  className={[
                    'inline-flex min-w-7 items-center justify-center rounded-full px-2 py-1 text-xs font-semibold',
                    overviewBottlenecks.length ? 'bg-[#fee2e2] text-[#dc2626]' : 'bg-[#edf9f1] text-[#09833d]',
                  ].join(' ')}
                >
                  {formatNumber(overviewBottlenecks.length)}
                </span>
              </div>
              {overviewBottlenecks.length ? (
                <div className="grid gap-3">
                  {overviewBottlenecks.map((item) => (
                    <article key={`${item.transactionId || item.unitId}-${item.stageKey}`} className="rounded-[16px] border border-[#f3d2cc] bg-[#fff8f7] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <strong className="block text-sm font-semibold text-[#142132]">Unit {item.unitNumber || '-'}</strong>
                          <span className="mt-1 block text-sm text-[#61738a]">{item.nextAction}</span>
                          <span className="mt-1 block text-xs font-medium text-[#b42318]">
                            {formatNumber(item.daysInStage)} days in {item.stageLabel}
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openDevelopmentTransactionWorkspace(item)}
                        >
                          View
                          <ArrowUpRight size={13} />
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-8 text-sm text-[#6b7d93]">
                  No transactions need attention right now.
                </p>
              )}
              <Button variant="ghost" className="mt-4 w-full justify-between px-0" onClick={() => setActiveTab('transactions')}>
                View all transactions
                <ArrowUpRight size={14} />
              </Button>
            </article>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <article className="rounded-[18px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
              <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Unit Status</h3>
              {unitStatusItems.total ? (
                <div className="mt-5 grid gap-5 md:grid-cols-[160px_minmax(0,1fr)] md:items-center">
                  <div className="mx-auto h-[150px] w-[150px] rounded-full p-[18px]" style={{ background: unitStatusItems.gradient }} aria-hidden="true">
                    <div className="h-full w-full rounded-full bg-white" />
                  </div>
                  <div className="grid gap-3">
                    {unitStatusItems.items.map((item) => (
                      <div key={item.key} className="grid grid-cols-[auto_minmax(0,1fr)_48px_52px] items-center gap-3 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                        <span className="font-medium text-[#52687f]">{item.label}</span>
                        <strong className="text-right font-semibold text-[#142132]">{formatNumber(item.count)}</strong>
                        <span className="text-right font-medium text-[#6b7d93]">{formatPercent(item.share)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-5 rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-8 text-sm text-[#6b7d93]">
                  No units configured yet.
                </p>
              )}
              <Button variant="ghost" className="mt-5 w-full justify-between border-t border-[#e6edf5] px-0 pt-4" onClick={() => setActiveTab('units')}>
                View units
                <ArrowUpRight size={14} />
              </Button>
            </article>

            <article className="rounded-[18px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
              <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#142132]">Recent Activity</h3>
              {recentActivity.length ? (
                <ul className="mt-5 grid gap-4">
                  {recentActivity.slice(0, 4).map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <strong className="block text-sm font-semibold text-[#142132]">Unit {item.unitNumber} {toTitleLabel(item.stage)}</strong>
                        <span className="mt-1 block text-sm text-[#61738a]">{item.buyer}</span>
                      </div>
                      <span className="shrink-0 text-right text-xs font-semibold text-[#6b7d93]">{getRelativeUpdateLabel(item.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-8 text-sm text-[#6b7d93]">
                  No recent activity yet.
                </p>
              )}
              <Button variant="ghost" className="mt-5 w-full justify-between border-t border-[#e6edf5] px-0 pt-4" onClick={() => setActiveTab('transactions')}>
                View full activity feed
                <ArrowUpRight size={14} />
              </Button>
            </article>
          </div>
        </section>
      ) : null}

      {activeTab === 'performance' ? (
        <>

          <section className={`${CARD_SHELL} mt-4 p-4`}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[1.05rem] font-semibold tracking-[-0.025em] text-[#142132]">Active Transactions</h3>
                <p className="mt-1 text-sm text-[#6b7d93]">Scrollable row of live matters linked to this development.</p>
              </div>
              <Button variant="secondary" onClick={() => setActiveTab('units')}>
                View All Units
              </Button>
            </div>

            {featuredActiveRows.length ? (
              <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
                {featuredActiveRows.map((row) => (
                  (() => {
                    const stagePosition = DEVELOPER_FUNNEL_STAGES.findIndex((item) => item.key === row.stageKey)
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => openDevelopmentTransactionWorkspace(row)}
                        className="min-w-[280px] snap-start rounded-[18px] border border-[#dde4ee] bg-[#fbfcfe] p-4 text-left shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[#cfd9e6] hover:bg-white"
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#8aa0b8]">
                              {buildTransactionReference(row.transactionId)}
                            </span>
                            <strong className="mt-1 block text-base font-semibold tracking-[-0.025em] text-[#142132]">
                              {row.buyerName || 'No purchaser assigned'}
                            </strong>
                          </div>
                          <span className="rounded-full border border-[#d7e5f5] bg-white px-2.5 py-1 text-xs font-semibold text-[#5b7895]">
                            Unit {row.unitNumber || '—'}
                          </span>
                        </div>
                        <div className="mb-4">
                          <div className="mb-2 flex items-center justify-between gap-3 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#8aa0b8]">
                            <span>Progress</span>
                            <span>{row.stageLabel}</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-[#e7eef6]" aria-hidden>
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${OVERVIEW_PROGRESS_TONE[row.stageKey] || OVERVIEW_PROGRESS_TONE.AVAIL}`}
                              style={{ width: `${Math.max(row.progressPercent || 0, 8)}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-[#6b7d93]">
                            <span>
                              Step {(stagePosition >= 0 ? stagePosition : 0) + 1} of {DEVELOPER_FUNNEL_STAGES.length}
                            </span>
                            <span>{row.progressPercent}%</span>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#8aa0b8]">Stage</span>
                            <span className="mt-1 block text-sm font-medium text-[#22384c]">
                              {row.stageLabel || 'Available'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#8aa0b8]">Finance</span>
                            <span className="mt-1 block text-sm font-medium text-[#22384c]">
                              {toTitleLabel(row.financeType || 'unknown')}
                            </span>
                          </div>
                        </div>
                        <div className="mt-4 border-t border-[#e5edf5] pt-3">
                          <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#8aa0b8]">Next Step</span>
                          <p className="mt-1 text-sm leading-6 text-[#44576d]">{row.nextAction || 'No next action captured'}</p>
                        </div>
                      </button>
                    )
                  })()
                ))}
              </div>
            ) : (
              <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                No active transactions linked to this development yet.
              </p>
            )}
          </section>

          <section className="mt-4 grid gap-4">
            <section className="grid items-stretch gap-4 xl:grid-cols-2">
              <article className="flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Transaction Funnel</h3>
                    <p className="mt-2 text-[0.96rem] leading-7 text-[#6b7d93]">High-level stage distribution and movement conversion inside this development.</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                    <TrendingUp size={12} />
                    {rows.length} tracked units
                  </span>
                </div>

                <div className="flex flex-1 flex-col divide-y divide-[#edf2f7]">
                  {developmentStageDistribution.map((item) => (
                    <div key={item.key} className="grid gap-3 py-4 md:grid-cols-[160px_220px_96px] md:items-center">
                      <div className="text-[0.98rem] font-medium tracking-[-0.02em] text-[#23384d]">{item.label}</div>
                      <div className="h-3 w-[220px] rounded-full bg-[#e7eef6]" aria-hidden>
                        <span className="block h-full rounded-full bg-[#5c82a3]" style={{ width: `${item.width}%` }} />
                      </div>
                      <div className="flex flex-col items-end text-right">
                        <div className="flex items-baseline gap-2 leading-none">
                          <strong className="text-[0.98rem] font-semibold text-[#142132]">{item.count}</strong>
                          <em className="text-[0.78rem] not-italic font-medium text-[#6b7d93]">{formatPercent(item.share)}</em>
                        </div>
                        <small className="mt-1 text-[0.74rem] leading-none text-[#8da0b5]">
                          {item.conversion !== null ? `${formatPercent(item.conversion)} prev` : '-'}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Cash vs Bond</h3>
                    <p className="mt-1.5 text-[0.88rem] leading-5 text-[#6b7d93]">Buyer financing split across transactions and value.</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-2.5 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                    <PieChart size={12} />
                    {financeMix.totalCount} active deals
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-[152px_minmax(0,1fr)] lg:items-center">
                  <div className="mx-auto h-[152px] w-[152px] rounded-full" style={{ background: financeMix.gradient }} aria-hidden="true">
                    <div className="mx-auto mt-[30px] h-[92px] w-[92px] rounded-full bg-white" />
                  </div>

                  <ul className="grid gap-2">
                    {financeMix.segments.map((item) => (
                      <li key={item.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-3.5 py-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: financeMix.colors[item.key] || financeMix.colors.unknown }} />
                        <div className="min-w-0">
                          <strong className="block text-[0.9rem] font-semibold text-[#142132]">{item.label}</strong>
                          <small className="block text-[0.78rem] text-[#7c8ea4]">{currency.format(item.value || 0)}</small>
                        </div>
                        <em className="text-[0.94rem] not-italic font-semibold text-[#35546c]">{item.count}</em>
                      </li>
                    ))}
                  </ul>
                </div>

                <section className="mt-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-3.5">
                  <div className="mb-2.5">
                    <strong className="block text-[0.92rem] font-semibold text-[#142132]">Finance Snapshot</strong>
                    <span className="text-[0.78rem] text-[#7c8ea4]">Current funding mix at a glance</span>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                      <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Cash Share</span>
                      <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{financeMix.cashShare}%</strong>
                    </article>
                    <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                      <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Bond Share</span>
                      <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{financeMix.bondShare}%</strong>
                    </article>
                    <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                      <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Hybrid Deals</span>
                      <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{financeMix.hybridDeals}</strong>
                    </article>
                    <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                      <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Avg Deal Value</span>
                      <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{currency.format(financeMix.averageDealValue || 0)}</strong>
                    </article>
                  </div>
                </section>
              </article>
            </section>

            <section className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Where Deals Are Stuck</h3>
                  <p className="mt-2 text-[0.96rem] leading-7 text-[#6b7d93]">Focus here to move transactions forward inside this development.</p>
                </div>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${
                  developmentBottleneckSummary.totalFlagged
                    ? 'border-[#f6d6d2] bg-[#fff3f2] text-[#b42318]'
                    : 'border-[#dde4ee] bg-[#f7f9fc] text-[#66758b]'
                }`}>
                  <AlertTriangle size={12} />
                  {developmentBottleneckSummary.totalFlagged} flagged
                </span>
              </div>

              <div className="grid gap-3">
                {developmentBottleneckSummary.items.map((item) => (
                  <article key={item.key} className="grid gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_60px] md:items-center">
                    <div className="min-w-0">
                      <strong className="block text-[0.96rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.label}</strong>
                      <small className="mt-1 block text-[0.82rem] text-[#7b8ca2]">{formatPercent(item.share)} of flagged issues</small>
                    </div>
                    <div className="h-3 rounded-full bg-[#e7eef6]" aria-hidden>
                      <span
                        className={`block h-full rounded-full ${
                          item.severity === 'high' ? 'bg-[#d76b5a]' : item.severity === 'medium' ? 'bg-[#d7a24e]' : 'bg-[#5c82a3]'
                        }`}
                        style={{ width: `${item.width}%` }}
                      />
                    </div>
                    <div className="text-right">
                      <strong className="text-[1rem] font-semibold text-[#142132]">{item.count}</strong>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3">
                <strong className="block text-[0.86rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Current pressure point</strong>
                <span className="mt-1 block text-[0.96rem] font-medium text-[#142132]">{developmentBottleneckSummary.leadLabel}</span>
              </div>
            </section>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="mb-5">
                <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Recent Activity</h3>
                <p className="mt-2 text-[0.96rem] leading-7 text-[#6b7d93]">Most recent movement across units and deals in this development.</p>
              </div>

              {recentActivity.length ? (
                <ul className="grid gap-3">
                  {recentActivity.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                      <div className="min-w-0">
                        <strong className="block text-[0.96rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.reference}</strong>
                        <span className="mt-1 block text-[0.88rem] text-[#6b7d93]">{item.buyer} • Unit {item.unitNumber}</span>
                      </div>
                      <div className="text-right">
                        <em className="inline-flex rounded-full border border-[#dde4ee] bg-white px-2.5 py-1 text-[0.76rem] not-italic font-semibold text-[#66758b]">{item.stage}</em>
                        <small className="mt-2 block text-[0.78rem] text-[#7b8ca2]">{getRelativeUpdateLabel(item.updatedAt)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">No transaction activity yet.</p>
              )}
            </article>

            <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="mb-5">
                <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Quick Links</h3>
                <p className="mt-2 text-[0.96rem] leading-7 text-[#6b7d93]">Jump into the main development work surfaces.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="ghost" onClick={() => setActiveTab('marketing')}>
                  <TrendingUp size={15} />
                  Marketing
                </Button>
                <Button variant="ghost" onClick={() => setActiveTab('units')}>
                  <Building2 size={15} />
                  Stock Master
                </Button>
                <Button variant="ghost" onClick={() => setActiveTab('transactions')}>
                  <Workflow size={15} />
                  Live Transactions
                </Button>
                <Button variant="ghost" onClick={() => setActiveTab('marketing')}>
                  <FolderKanban size={15} />
                  Floorplans & Assets
                </Button>
                <Button variant="ghost" onClick={() => setActiveTab('conveyancing')}>
                  <ShieldCheck size={15} />
                  Conveyancing
                </Button>
                <Button variant="ghost" onClick={() => setActiveTab('bond_originators')}>
                  <CircleDollarSign size={15} />
                  Bond Originators
                </Button>
                <Button variant="ghost" onClick={() => navigate('/reports')}>
                  <Receipt size={15} />
                  Reports
                </Button>
              </div>
            </article>
          </section>
        </>
      ) : null}

      {['configuration', 'performance'].includes(activeTab) ? (
        <section className="mt-4 grid gap-4">
          <div className={`grid gap-4 ${activeTab === 'performance' && canManageDevelopment ? 'xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]' : ''}`}>
            {activeTab === 'configuration' ? (
              <div className="grid gap-4">
                <div className="flex flex-col gap-3 rounded-[22px] border border-[#dde4ee] bg-white px-5 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f7a45]">Configuration</p>
                    <h3 className="mt-1 text-[1.18rem] font-semibold tracking-[-0.03em] text-[#142132]">Project settings</h3>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Manage development-wide details, deposit rules, and team access.</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => setActiveTab('transactions')}>
                    <Workflow size={14} />
                    Preview Buyer Journey
                  </Button>
                </div>

                <ConfigurationCard
                  icon={Building2}
                  title="General Details"
                  description="Basic development information and key dates."
                  expanded={generalDetailsExpanded}
                  editing={isEditingGeneralDetails}
                  canEdit={canManageDevelopment}
                  onToggle={() => setGeneralDetailsExpanded((previous) => !previous)}
                  onEdit={handleStartGeneralDetailsEdit}
                  summary={(
                    <div className="grid gap-1">
                      <strong className="truncate font-semibold text-[#142132]">{generalSummaryLocation || 'Development details not set'}</strong>
                      <span>{generalSummaryMeta}</span>
                    </div>
                  )}
                  badge={<ConfigStatusPill tone="success">{toTitleLabel(detailsForm.status || 'active')}</ConfigStatusPill>}
                >
                  <form className="grid gap-5" onSubmit={handleGeneralDetailsSave}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailField label="Development Name">
                        <Field value={detailsForm.name} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, name: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Development Code">
                        <Field value={detailsForm.code} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, code: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Location">
                        <Field value={detailsForm.location} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, location: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Suburb">
                        <Field value={detailsForm.suburb} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, suburb: event.target.value }))} />
                      </DetailField>
                      <DetailField label="City">
                        <Field value={detailsForm.city} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, city: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Province">
                        <Field value={detailsForm.province} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, province: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Country">
                        <Field value={detailsForm.country} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, country: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Developer Company">
                        <Field value={detailsForm.developerCompany} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, developerCompany: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Status">
                        <Field as="select" value={detailsForm.status} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, status: event.target.value }))}>
                          {DEVELOPMENT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </Field>
                      </DetailField>
                      <DetailField label="Expected Units">
                        <Field type="number" min="0" value={detailsForm.totalUnitsExpected} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, totalUnitsExpected: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Launch Date">
                        <Field type="date" value={detailsForm.launchDate} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, launchDate: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Expected Completion">
                        <Field type="date" value={detailsForm.expectedCompletionDate} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, expectedCompletionDate: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Address" className="md:col-span-2">
                        <Field value={detailsForm.address} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, address: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Description" className="md:col-span-2">
                        <Field as="textarea" rows={4} value={detailsForm.description} disabled={!isEditingGeneralDetails} className={generalDetailsFieldClassName} onChange={(event) => setDetailsForm((previous) => ({ ...previous, description: event.target.value }))} />
                      </DetailField>
                    </div>

                    {canManageDevelopment ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          ['Handover Enabled', 'Enable unit handover after registration.', detailsForm.handoverEnabled, 'handoverEnabled'],
                          ['Snag Tracking', 'Allow snag logging and post-handover support.', detailsForm.snagTrackingEnabled, 'snagTrackingEnabled'],
                          ['Alterations', 'Enable owner alteration requests for this project.', detailsForm.alterationsEnabled, 'alterationsEnabled'],
                          ['Client Onboarding', 'Enable transaction onboarding by default.', detailsForm.onboardingEnabled, 'onboardingEnabled'],
                        ].map(([title, copy, checked, key]) => (
                          <label key={key} className="flex items-start justify-between gap-4 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                            <span className="min-w-0">
                              <strong className="block text-sm font-semibold text-[#142132]">{title}</strong>
                              <span className="mt-1 block text-xs leading-5 text-[#6b7d93]">{copy}</span>
                            </span>
                            {isEditingGeneralDetails ? (
                              <input type="checkbox" className="mt-1 h-4 w-4 rounded border-[#c7d6e5] text-[#35546c] focus:ring-[#35546c]" checked={Boolean(checked)} onChange={(event) => setDetailsForm((previous) => ({ ...previous, [key]: event.target.checked }))} />
                            ) : (
                              <ConfigStatusPill tone={checked ? 'success' : 'neutral'}>{checked ? 'Enabled' : 'Disabled'}</ConfigStatusPill>
                            )}
                          </label>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3 border-t border-[#e6edf5] pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs font-medium text-[#7b8ca2]">{isEditingGeneralDetails ? 'Save updates only this section.' : 'Viewing mode. Use Edit to change this section.'}</span>
                      {isEditingGeneralDetails ? (
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={handleCancelGeneralDetailsEdit}>Cancel</Button>
                          <Button type="submit" size="sm" disabled={detailsSaving}>{detailsSaving ? 'Saving...' : 'Save Changes'}</Button>
                        </div>
                      ) : null}
                    </div>
                  </form>
                </ConfigurationCard>

                <ConfigurationCard
                  icon={UserPlus}
                  title="Seller / Developer Entity"
                  description="Legal entity and authorised signatory details."
                  expanded={sellerDetailsExpanded}
                  editing={isEditingSellerDetails}
                  canEdit={canManageDevelopment}
                  onToggle={() => setSellerDetailsExpanded((previous) => !previous)}
                  onEdit={handleStartSellerDetailsEdit}
                  summary={(
                    <div className="grid gap-1">
                      <strong className="truncate font-semibold text-[#142132]">{sellerSummaryName}</strong>
                      <span>{sellerSummaryMeta}</span>
                    </div>
                  )}
                  badge={<ConfigStatusPill tone={sellerDetailsComplete ? 'success' : 'danger'}>{sellerDetailsComplete ? 'All details complete' : 'Missing Details'}</ConfigStatusPill>}
                >
                  <form className="grid gap-5" onSubmit={handleSellerDetailsSave}>
                    {isEditingSellerDetails ? (
                      <div className="flex flex-col gap-2 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-medium text-[#7b8ca2]">{developerProfileHasSellerDefaults ? 'Organisation defaults are available from Settings.' : 'Add Developer Profile defaults in Settings to prefill this faster.'}</p>
                        <Button type="button" variant="secondary" size="sm" onClick={handleUseDeveloperCompanyAsSeller}>Use Developer Profile</Button>
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailField label="Seller Entity Type">
                        <Field as="select" value={sellerDetailsForm.entityType} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('entityType', event.target.value)}>
                          <option value="company">Company</option>
                          <option value="individual">Individual</option>
                          <option value="trust">Trust</option>
                          <option value="close_corporation">Close Corporation</option>
                          <option value="other">Other</option>
                        </Field>
                      </DetailField>
                      <DetailField label="Seller Legal Name"><Field value={sellerDetailsForm.legalName} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('legalName', event.target.value)} placeholder="e.g. Junoah Estate (Pty) Ltd" /></DetailField>
                      <DetailField label="Trading Name"><Field value={sellerDetailsForm.tradingName} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('tradingName', event.target.value)} /></DetailField>
                      <DetailField label="Registration / Trust Number"><Field value={sellerDetailsForm.registrationNumber} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('registrationNumber', event.target.value)} /></DetailField>
                      <DetailField label="VAT Number"><Field value={sellerDetailsForm.vatNumber} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('vatNumber', event.target.value)} /></DetailField>
                      <DetailField label="VAT Treatment"><Field value={sellerDetailsForm.vatTreatment} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('vatTreatment', event.target.value)} placeholder="e.g. VAT inclusive" /></DetailField>
                      <DetailField label="Registered Address" className="md:col-span-2"><Field value={sellerDetailsForm.registeredAddress} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('registeredAddress', event.target.value)} /></DetailField>
                      <DetailField label="Postal Address" className="md:col-span-2"><Field value={sellerDetailsForm.postalAddress} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('postalAddress', event.target.value)} /></DetailField>
                      <DetailField label="Seller Email"><Field type="email" value={sellerDetailsForm.email} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('email', event.target.value)} /></DetailField>
                      <DetailField label="Seller Phone"><Field value={sellerDetailsForm.phone} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('phone', event.target.value)} /></DetailField>
                    </div>

                    <div className="rounded-[18px] border border-[#dde4ee] bg-white p-4">
                      <h5 className="text-sm font-semibold text-[#142132]">Authorised Signatory</h5>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <DetailField label="Full Name"><Field value={primarySellerSignatory.fullName} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerSignatoryField('fullName', event.target.value)} /></DetailField>
                        <DetailField label="Capacity / Role"><Field value={primarySellerSignatory.signingCapacity} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerSignatoryField('signingCapacity', event.target.value)} placeholder="e.g. Director" /></DetailField>
                        <DetailField label="ID Number"><Field value={primarySellerSignatory.idNumber} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerSignatoryField('idNumber', event.target.value)} /></DetailField>
                        <DetailField label="Email"><Field type="email" value={primarySellerSignatory.email} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerSignatoryField('email', event.target.value)} /></DetailField>
                        <DetailField label="Phone"><Field value={primarySellerSignatory.phone} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerSignatoryField('phone', event.target.value)} /></DetailField>
                        <DetailField label="Internal Notes"><Field value={sellerDetailsForm.notes} disabled={!isEditingSellerDetails} className={sellerDetailsFieldClassName} onChange={(event) => setSellerDetailsField('notes', event.target.value)} /></DetailField>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-[#e6edf5] pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs font-medium text-[#7b8ca2]">{isEditingSellerDetails ? 'Save updates only the legal entity details.' : 'Viewing mode. Use Edit to change this section.'}</span>
                      {isEditingSellerDetails ? (
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={handleCancelSellerDetailsEdit}>Cancel</Button>
                          <Button type="submit" size="sm" disabled={detailsSaving}>{detailsSaving ? 'Saving...' : 'Save Changes'}</Button>
                        </div>
                      ) : null}
                    </div>
                  </form>
                </ConfigurationCard>

                <ConfigurationCard
                  icon={WalletCards}
                  title="Reservation & Deposit"
                  description="Configure reservation deposit requirements for buyers in this development."
                  expanded={reservationSettingsExpanded}
                  editing={isEditingReservationSettings}
                  canEdit={canManageDevelopment}
                  onToggle={() => setReservationSettingsExpanded((previous) => !previous)}
                  onEdit={() => {
                    setReservationSettingsExpanded(true)
                    setIsEditingReservationSettings(true)
                  }}
                  summary={(
                    <div className="grid gap-1">
                      <strong className="font-semibold text-[#142132]">{reservationDepositSummary}</strong>
                      <span>{reservationSettingsForm.enabledByDefault ? `${getOptionSummaryLabel(RESERVATION_VAT_TREATMENT_OPTIONS, reservationSettingsForm.vatTreatment)} • ${getOptionSummaryLabel(RESERVATION_DUE_TRIGGER_OPTIONS, reservationSettingsForm.dueTrigger)}` : 'No active deposit milestone'}</span>
                    </div>
                  )}
                  badge={<ConfigStatusPill tone={reservationSettingsForm.enabledByDefault ? (reservationDepositConfigured ? 'success' : 'warning') : 'neutral'}>{reservationSettingsForm.enabledByDefault ? (reservationDepositConfigured ? 'Deposit Required' : 'Incomplete') : 'No Deposit'}</ConfigStatusPill>}
                >
                  <form className="grid gap-5" onSubmit={handleReservationSettingsSave}>
                    <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                      <label className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          <span className="block text-sm font-semibold text-[#142132]">Reservation deposit required?</span>
                          <span className="mt-1 block text-xs leading-5 text-[#6b7d93]">Controls whether the buyer journey includes an active Reservation Deposit milestone.</span>
                        </span>
                        <span className="inline-flex items-center gap-3 text-sm font-semibold text-[#142132]">
                          <input type="checkbox" className="sr-only" checked={Boolean(reservationSettingsForm.enabledByDefault)} disabled={!canManageDevelopment || reservationSettingsSaving} onChange={handleReservationDepositRequiredChange} />
                          <span className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${reservationSettingsForm.enabledByDefault ? 'bg-[#1f7a43]' : 'bg-[#cbd7e4]'}`} aria-hidden>
                            <span className={`h-5 w-5 rounded-full bg-white shadow transition ${reservationSettingsForm.enabledByDefault ? 'translate-x-5' : 'translate-x-0'}`} />
                          </span>
                          {reservationSettingsForm.enabledByDefault ? 'Yes' : 'No'}
                        </span>
                      </label>
                    </div>

                    {!reservationSettingsForm.enabledByDefault ? (
                      <div className="rounded-[16px] border border-[#e4ebf3] bg-[#f8fafc] px-4 py-4 text-sm font-medium text-[#6b7d93]">No reservation deposit required.</div>
                    ) : (
                      <>
                        <div id="reservation-deposit-configuration-fields" className="scroll-mt-28 grid gap-4 md:grid-cols-4">
                          <DetailField label="Deposit Amount">
                            <Field type="number" min="0" step="0.01" value={reservationSettingsForm.defaultDepositAmount} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, defaultDepositAmount: event.target.value }))} placeholder="10000.00" />
                            {reservationDepositAmount > 0 ? (
                              <span className="mt-1 block text-xs text-[#7b8ca2]">
                                {reservationSettingsForm.amountType === 'percentage' ? `${reservationDepositAmount}%` : currencyWithCents.format(reservationDepositAmount)}
                              </span>
                            ) : null}
                          </DetailField>
                          <DetailField label="Deposit Amount Type">
                            <Field as="select" value={reservationSettingsForm.amountType} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, amountType: event.target.value }))}>
                              <option value="fixed">Fixed rand amount</option>
                              <option value="percentage">Percentage of purchase price</option>
                            </Field>
                          </DetailField>
                          <DetailField label="VAT Treatment">
                            <Field as="select" value={reservationSettingsForm.vatTreatment} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, vatTreatment: event.target.value }))}>
                              {RESERVATION_VAT_TREATMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </Field>
                          </DetailField>
                          <DetailField label="When is the deposit due?">
                            <Field as="select" value={reservationSettingsForm.dueTrigger} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, dueTrigger: event.target.value }))}>
                              {RESERVATION_DUE_TRIGGER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </Field>
                          </DetailField>
                        </div>

                        <div className="rounded-[14px] border border-[#cfe8d8] bg-[#edf9f1] px-4 py-3 text-sm font-semibold text-[#1f7a43]">
                          {reservationDepositSummary}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <DetailField label="Deposit Treatment">
                            <Field as="select" value={reservationSettingsForm.depositTreatment} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, depositTreatment: event.target.value }))}>
                              <option value="credited_to_purchase_price">Deduct from purchase price</option>
                              <option value="separate_invoice">Invoice separately</option>
                              <option value="refundable_hold">Refundable holding deposit</option>
                            </Field>
                          </DetailField>
                          <DetailField label="Payable To">
                            <Field as="select" value={reservationSettingsForm.payableTo} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, payableTo: event.target.value }))}>
                              <option value="developer">Developer</option>
                              <option value="agency_trust">Agency trust account</option>
                              <option value="attorney_trust">Attorney trust account</option>
                            </Field>
                          </DetailField>
                          <DetailField label="Payment Reference Format" className="md:col-span-2">
                            <Field value={reservationSettingsForm.paymentReferenceFormat} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, paymentReferenceFormat: event.target.value }))} placeholder="RES-{UNIT}-{TXN}" />
                          </DetailField>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <DetailField label="Account Holder Name"><Field value={reservationSettingsForm.accountHolderName} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, accountHolderName: event.target.value }))} /></DetailField>
                          <DetailField label="Bank Name"><Field value={reservationSettingsForm.bankName} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, bankName: event.target.value }))} /></DetailField>
                          <DetailField label="Account Number"><Field value={reservationSettingsForm.accountNumber} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, accountNumber: event.target.value }))} /></DetailField>
                          <DetailField label="Branch Code"><Field value={reservationSettingsForm.branchCode} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, branchCode: event.target.value }))} /></DetailField>
                          <DetailField label="Account Type" className="md:col-span-2"><Field value={reservationSettingsForm.accountType} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, accountType: event.target.value }))} placeholder="Savings / Current" /></DetailField>
                          <DetailField label="Additional Payment Instructions" className="md:col-span-2"><Field as="textarea" rows={3} value={reservationSettingsForm.paymentInstructions} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, paymentInstructions: event.target.value }))} /></DetailField>
                        </div>
                      </>
                    )}

                    <section className="rounded-[18px] border border-[#dde4ee] bg-white p-4">
                      <h4 className="text-sm font-semibold text-[#142132]">Transaction Defaults</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Defaults proposed when a new development transaction starts.</p>
                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <DetailField label="Alteration Cost Treatment">
                          <Field as="select" value={reservationSettingsForm.alterationChargeTreatment} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, alterationChargeTreatment: event.target.value }))}>
                            <option value="included_in_purchase_price">Include in purchase price</option>
                            <option value="separate_invoice">Invoice separately</option>
                            <option value="no_charge">No charge by default</option>
                          </Field>
                        </DetailField>
                        <DetailField label="Default Transfer Attorney">
                          <Field as="select" value={reservationSettingsForm.defaultTransferAttorneySource} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, defaultTransferAttorneySource: event.target.value }))}>
                            <option value="first_conveyancer">Use first conveyancer in team</option>
                            <option value="none">Do not auto-assign</option>
                          </Field>
                        </DetailField>
                        <DetailField label="Default Bond Originator">
                          <Field as="select" value={reservationSettingsForm.defaultBondOriginatorSource} disabled={!isEditingReservationSettings || reservationSettingsSaving} className={!isEditingReservationSettings ? READ_ONLY_FIELD_CLASS : ''} onChange={(event) => setReservationSettingsForm((previous) => ({ ...previous, defaultBondOriginatorSource: event.target.value }))}>
                            <option value="first_bond_originator">Use first bond originator in team</option>
                            <option value="none">Do not auto-assign</option>
                          </Field>
                        </DetailField>
                      </div>
                      <h5 className="mt-5 text-sm font-semibold text-[#142132]">Role Player Assignment Defaults</h5>
                      <div className="mt-3 grid gap-3 lg:grid-cols-3">
                        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[14px] border border-[#dbe4ef] bg-[#fbfcfe] p-4 text-sm">
                          <span>
                            <strong className="block font-semibold text-[#142132]">Buyer may use own bond originator</strong>
                            <span className="mt-1.5 block leading-5 text-[#6b7d93]">Allow buyers to nominate an originator during onboarding.</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={Boolean(reservationSettingsForm.buyerAppointedBondOriginatorAllowed)}
                            disabled={!isEditingReservationSettings || reservationSettingsSaving}
                            onChange={(event) =>
                              setReservationSettingsForm((previous) => ({
                                ...previous,
                                buyerAppointedBondOriginatorAllowed: event.target.checked,
                                buyerAppointedBondOriginatorRequiresApproval:
                                  event.target.checked && previous.buyerAppointedBondOriginatorRequiresApproval,
                              }))
                            }
                          />
                        </label>
                        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[14px] border border-[#dbe4ef] bg-[#fbfcfe] p-4 text-sm">
                          <span>
                            <strong className="block font-semibold text-[#142132]">Approve buyer-appointed originators</strong>
                            <span className="mt-1.5 block leading-5 text-[#6b7d93]">Keep buyer nominations pending until the agent or developer approves.</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={Boolean(reservationSettingsForm.buyerAppointedBondOriginatorRequiresApproval)}
                            disabled={
                              !isEditingReservationSettings ||
                              reservationSettingsSaving ||
                              !reservationSettingsForm.buyerAppointedBondOriginatorAllowed
                            }
                            onChange={(event) =>
                              setReservationSettingsForm((previous) => ({
                                ...previous,
                                buyerAppointedBondOriginatorRequiresApproval: event.target.checked,
                              }))
                            }
                          />
                        </label>
                        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[14px] border border-[#dbe4ef] bg-[#fbfcfe] p-4 text-sm">
                          <span>
                            <strong className="block font-semibold text-[#142132]">Auto-invite selected bond originator</strong>
                            <span className="mt-1.5 block leading-5 text-[#6b7d93]">Send an invite once a transaction has a selected originator.</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={Boolean(reservationSettingsForm.autoInviteSelectedBondOriginator)}
                            disabled={!isEditingReservationSettings || reservationSettingsSaving}
                            onChange={(event) =>
                              setReservationSettingsForm((previous) => ({
                                ...previous,
                                autoInviteSelectedBondOriginator: event.target.checked,
                              }))
                            }
                          />
                        </label>
                      </div>
                    </section>

                    <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-3 border-t border-[#e6edf5] bg-white/95 px-1 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs font-medium text-[#7b8ca2]">{isEditingReservationSettings ? 'Save updates only reservation and transaction defaults.' : 'Viewing mode. Use Edit to change this section.'}</span>
                      {isEditingReservationSettings ? (
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={handleCancelReservationSettingsEdit}>Cancel</Button>
                          <Button type="submit" size="sm" disabled={!canManageDevelopment || reservationSettingsSaving}>{reservationSettingsSaving ? 'Saving...' : 'Save Changes'}</Button>
                        </div>
                      ) : null}
                    </div>
                  </form>
                </ConfigurationCard>

                <form className={CARD_SHELL} onSubmit={handleAgentAssignmentsSave}>
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-start gap-4">
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[#d7efdf] bg-[#edf9f1] text-[#1c7d45]"><Users size={19} /></span>
                        <div>
                          <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Development Team Access</h3>
                          <p className="mt-1.5 max-w-[760px] text-sm leading-6 text-[#6b7d93]">Choose which agents can access and work on this development.</p>
                        </div>
                      </div>
                    </div>
                    <ConfigStatusPill tone="success">{agentAssignments.length} team member{agentAssignments.length === 1 ? '' : 's'}</ConfigStatusPill>
                  </div>

                  {!canManageDevelopment ? (
                    <div className="mb-4 rounded-[14px] border border-[#e4ebf3] bg-[#f8fafc] px-4 py-3 text-sm text-[#6b7d93]">You can view the assigned agents for this development, but you need development management access to change them.</div>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
                    <section className="rounded-[18px] border border-[#dde6f1] bg-[#fbfcfe] p-4">
                      <h4 className="text-sm font-semibold text-[#142132]">Add team member</h4>
                      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="relative">
                          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b6]" />
                          <Field as="select" className="pl-9" value={selectedAgentUserId} disabled={!canManageDevelopment || organisationUsersLoading || agentAssignmentsSaving} onChange={(event) => setSelectedAgentUserId(event.target.value)}>
                            <option value="">{organisationUsersLoading ? 'Loading organisation users...' : 'Search organisation users...'}</option>
                            {assignableAgentOptions.map((member) => {
                              const optionKey = buildAgentAssignmentKey(member)
                              return <option key={optionKey} value={optionKey}>{member.name || member.email}{member.email ? ` - ${member.email}` : ''}</option>
                            })}
                          </Field>
                        </div>
                        <Button type="button" variant="secondary" disabled={!canManageDevelopment || !selectedAgentUserId || agentAssignmentsSaving} onClick={handleAddSelectedAgentAssignment}>
                          <Plus size={15} />
                          Add
                        </Button>
                      </div>
                      <Button type="button" variant="ghost" className="mt-4 w-fit" disabled={!canManageDevelopment || agentAssignmentsSaving} onClick={() => setExternalAgentModalOpen(true)}>
                        <UserPlus size={15} />
                        Add external agent
                      </Button>
                    </section>

                    <section className="rounded-[18px] border border-[#dde6f1] bg-white p-4">
                      <h4 className="text-sm font-semibold text-[#142132]">Assigned Team</h4>
                      <div className="mt-3 grid gap-2">
                        {agentAssignments.length ? (
                          agentAssignments.map((member) => {
                            const memberName = member.name || member.email || 'Assigned team member'
                            const memberEmail = member.email || 'No email captured'
                            const initials = String(memberName).split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'A'
                            return (
                              <article key={buildAgentAssignmentKey(member)} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e3ebf4] bg-[#fbfcfe] px-3 py-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0f1b2d] text-sm font-semibold text-white">{initials}</span>
                                  <span className="min-w-0">
                                    <strong className="block truncate text-sm font-semibold text-[#142132]">{memberName}</strong>
                                    <span className="mt-1 block truncate text-xs text-[#6b7d93]">{memberEmail}</span>
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <ConfigStatusPill tone="success">{toTitleLabel(member.role || 'Agent')}</ConfigStatusPill>
                                  {member.source === 'manual' ? <ConfigStatusPill>External</ConfigStatusPill> : null}
                                  {canManageDevelopment ? (
                                    <Button type="button" variant="ghost" size="sm" className="px-2" disabled={agentAssignmentsSaving} onClick={() => handleRemoveAgentAssignment(member)} title="Remove from development">
                                      <MoreVertical size={15} />
                                    </Button>
                                  ) : null}
                                </div>
                              </article>
                            )
                          })
                        ) : (
                          <div className="rounded-[14px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">No team members have been assigned to this development yet.</div>
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 border-t border-[#e6edf5] pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-[760px] text-xs leading-5 text-[#7b8ca2]">Saving updates the development team and syncs the matching participant records used by workspace access and development transactions.</p>
                    <Button type="submit" disabled={!canManageDevelopment || agentAssignmentsSaving}>{agentAssignmentsSaving ? 'Saving...' : 'Save Team Access'}</Button>
                  </div>
                </form>

                <section className="rounded-[22px] border border-[#f3cbc6] bg-[#fffafa] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-[#ffd6d1] bg-[#fff2f1] text-[#b42318]"><Trash2 size={18} /></span>
                      <div>
                        <h3 className="text-[1.05rem] font-semibold tracking-[-0.025em] text-[#142132]">Danger Zone</h3>
                        <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Irreversible actions for this development.</p>
                      </div>
                    </div>
                    {canManageDevelopment ? (
                      <Button type="button" variant="secondary" className="border-[#f3b8b0] bg-white text-[#b42318] hover:bg-[#fff4f2]" onClick={() => setDeleteConfirmOpen(true)}>
                        <Trash2 size={15} />
                        Delete Development
                      </Button>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === 'performance' && canManageDevelopment ? (
            <form className={CARD_SHELL} onSubmit={handleFinancialsSave}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Commercial / Financial Details</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">High-level commercial position plus editable budget assumptions for this development.</p>
                </div>
                {!isEditingFinancialsSection ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEditingFinancialsSection(true)}
                    className="shrink-0"
                  >
                    <PencilLine size={14} />
                    Edit Section
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={handleCancelFinancialsEdit}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={financialsSaving}>
                      {financialsSaving ? 'Saving…' : 'Save Changes'}
                    </Button>
                  </div>
                )}
              </div>

              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                {[
                  ['Projected Revenue', currency.format(effectiveProjectedRevenue || 0)],
                  ['Revenue Secured', currency.format(revenueSecured || 0)],
                  ['Pipeline Value', currency.format(developmentMetrics.pipelineValue || 0)],
                  ['Available Stock Value', currency.format(availableStockValue || 0)],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3.5">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-1.5 block text-base font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DetailField label="Land Cost"><Field type="number" min="0" value={financialsForm.landCost} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, landCost: event.target.value }))} /></DetailField>
                <DetailField label="Build Cost"><Field type="number" min="0" value={financialsForm.buildCost} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, buildCost: event.target.value }))} /></DetailField>
                <DetailField label="Professional Fees"><Field type="number" min="0" value={financialsForm.professionalFees} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, professionalFees: event.target.value }))} /></DetailField>
                <DetailField label="Marketing Cost / Commission"><Field type="number" min="0" value={financialsForm.marketingCost} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, marketingCost: event.target.value }))} /></DetailField>
                <DetailField label="Infrastructure Cost"><Field type="number" min="0" value={financialsForm.infrastructureCost} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, infrastructureCost: event.target.value }))} /></DetailField>
                <DetailField label="Other Costs"><Field type="number" min="0" value={financialsForm.otherCosts} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, otherCosts: event.target.value }))} /></DetailField>
                <DetailField label="Total Projected Cost"><Field type="number" min="0" value={financialsForm.totalProjectedCost} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, totalProjectedCost: event.target.value }))} placeholder={String(derivedProjectedCost || 0)} /></DetailField>
                <DetailField label="Projected Gross Sales Value"><Field type="number" min="0" value={financialsForm.projectedGrossSalesValue} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, projectedGrossSalesValue: event.target.value }))} /></DetailField>
                <DetailField label="Projected Profit"><Field type="number" value={financialsForm.projectedProfit} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, projectedProfit: event.target.value }))} placeholder={String(derivedProjectedProfit || 0)} /></DetailField>
                <DetailField label="Target Margin (%)"><Field type="number" step="0.01" value={financialsForm.targetMargin} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, targetMargin: event.target.value }))} placeholder={derivedTargetMargin.toFixed(2)} /></DetailField>
                <DetailField label="Financial Notes" className="md:col-span-2">
                  <Field as="textarea" rows={4} value={financialsForm.notes} disabled={!isEditingFinancialsSection} className={financialFieldClassName} onChange={(event) => setFinancialsForm((previous) => ({ ...previous, notes: event.target.value }))} />
                </DetailField>
              </div>

              {!isEditingFinancialsSection ? (
                <div className="mt-5 border-t border-[#e6edf5] pt-4 text-xs font-medium text-[#7b8ca2]">
                  Viewing mode. Use the pencil icon to edit this section.
                </div>
              ) : null}
            </form>
            ) : null}
          </div>

          {activeTab === 'performance' && canManageDevelopment ? (
          <section className={CARD_SHELL}>
            <div className="mb-5">
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Commercial Dashboard</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Read the live commercial position here without repeating the same values inside the input form.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {commercialKpis.map((item) => {
                const Icon = item.icon
                return (
                  <article key={item.label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-[0.74rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{item.label}</span>
                        <strong className="mt-2 block text-[1.18rem] font-semibold tracking-[-0.03em] text-[#142132]">{item.value}</strong>
                        <span className="mt-1.5 block text-xs leading-5 text-[#6b7d93]">{item.meta}</span>
                      </div>
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#5b7895] shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                        <Icon size={16} />
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>

            <section className="mt-5 rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
              <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Developer Transaction Financial Roll-up</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Development-wide reservation deposits and alteration costing across active transactions.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]">
                    Default alterations: {getAlterationChargeTreatmentLabel(developerFinancialRollup.defaultAlterationTreatment)}
                  </span>
                  <Button type="button" variant="secondary" size="sm" onClick={handleDownloadDeveloperFinancialReconciliation}>
                    <Download size={15} />
                    Download reconciliation
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: 'Reservation exposure',
                    value: currency.format(developerFinancialRollup.reservation.totalAmount || 0),
                    meta: `${formatNumber(developerFinancialRollup.reservation.requiredCount)} transactions require deposits`,
                  },
                  {
                    label: getReservationTreatmentLabel('credited_to_purchase_price'),
                    value: currency.format(developerFinancialRollup.reservation.byTreatment.credited_to_purchase_price || 0),
                    meta: 'Deduct from purchase price',
                  },
                  {
                    label: getAlterationChargeTreatmentLabel('included_in_purchase_price'),
                    value: currency.format(developerFinancialRollup.alteration.byTreatment.included_in_purchase_price || 0),
                    meta: `${formatNumber(developerFinancialRollup.alteration.totalCount)} alteration requests logged`,
                  },
                  {
                    label: getAlterationChargeTreatmentLabel('separate_invoice'),
                    value: currency.format(developerFinancialRollup.alteration.byTreatment.separate_invoice || 0),
                    meta: `${formatNumber(developerFinancialRollup.alteration.awaitingActionCount)} awaiting action`,
                  },
                ].map((item) => (
                  <article key={item.label} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{item.label}</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{item.value}</strong>
                    <span className="mt-1.5 block text-xs leading-5 text-[#6b7d93]">{item.meta}</span>
                  </article>
                ))}
              </div>

              <article className="mt-4 rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h5 className="text-sm font-semibold text-[#142132]">Handoff Readiness</h5>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                      Checks whether reservation deposits and alteration costs are clean enough for accounts, conveyancers, and the developer team.
                    </p>
                  </div>
                  <span
                    className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[0.76rem] font-semibold ${
                      developerFinancialRollup.criticalControlCount > 0
                        ? 'border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]'
                        : developerFinancialRollup.warningControlCount > 0
                          ? 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]'
                          : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
                    }`}
                  >
                    {developerFinancialRollup.controlStatus}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {[
                    ['Critical gaps', formatNumber(developerFinancialRollup.criticalControlCount)],
                    ['Follow-ups', formatNumber(developerFinancialRollup.warningControlCount)],
                    ['Control checks', formatNumber(developerFinancialRollup.controlItems.length)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[12px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2">
                      <span className="block text-[0.7rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                      <strong className="mt-1 block text-sm font-semibold text-[#1f3448]">{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2">
                  {developerFinancialRollup.controlItems.length ? (
                    developerFinancialRollup.controlItems.slice(0, 4).map((item) => (
                      <p key={item.label} className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-2 text-sm leading-5 text-[#35546c]">
                        <strong className="font-semibold text-[#1f3448]">{item.label}:</strong> {item.detail}
                      </p>
                    ))
                  ) : (
                    <p className="rounded-[12px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-3 py-2 text-sm leading-5 text-[#6b7d93]">
                      No reconciliation gaps detected from the current reservation and alteration data.
                    </p>
                  )}
                </div>
              </article>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
                <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                  <h5 className="text-sm font-semibold text-[#142132]">Outstanding Controls</h5>
                  <dl className="mt-3 grid gap-2 text-sm text-[#4f647a]">
                    {[
                      ['Reservation proof / review', formatNumber(developerFinancialRollup.reservation.awaitingProofCount)],
                      ['Alteration action', formatNumber(developerFinancialRollup.alteration.awaitingActionCount)],
                      ['Refundable holds', currency.format(developerFinancialRollup.reservation.byTreatment.refundable_hold || 0)],
                      ['No-charge alterations', currency.format(developerFinancialRollup.alteration.byTreatment.no_charge || 0)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-3 border-b border-[#edf2f7] pb-2 last:border-b-0 last:pb-0">
                        <dt>{label}</dt>
                        <dd className="text-right font-semibold text-[#1f3448]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>

                <article className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                  <h5 className="text-sm font-semibold text-[#142132]">Operator Actions</h5>
                  <div className="mt-3 grid gap-2">
                    {developerFinancialRollup.actionItems.length ? (
                      developerFinancialRollup.actionItems.map((item) => (
                        <p key={item} className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-2 text-sm leading-5 text-[#35546c]">
                          {item}
                        </p>
                      ))
                    ) : (
                      <p className="rounded-[12px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-3 py-2 text-sm leading-5 text-[#6b7d93]">
                        No reservation or alteration finance actions are currently flagged for this development.
                      </p>
                    )}
                  </div>
                </article>
              </div>
            </section>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <section className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Cost Structure</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">See where the development budget is weighted before you update the plan.</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]">
                    Planned cost {currency.format(effectiveProjectedCost || 0)}
                  </span>
                </div>

                <div className="grid gap-3">
                  {costStructure.map((item) => (
                    <article key={item.key} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
                          <span className="mt-1 block text-xs leading-5 text-[#6b7d93]">{item.share.toFixed(1)}% of planned cost base</span>
                        </div>
                        <strong className="text-sm font-semibold text-[#35546c]">{currency.format(item.amount || 0)}</strong>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-[#edf2f7]" aria-hidden="true">
                        <span className="block h-full rounded-full bg-[#5c82a3]" style={{ width: `${Math.min(item.share, 100)}%` }} />
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="grid gap-4">
                <article className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Commercial Health</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Connect the plan to what the stock and live transactions are actually doing.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {commercialHealthItems.map((item) => (
                      <article key={item.label} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{item.label}</span>
                        <strong className="mt-2 block text-base font-semibold text-[#142132]">{item.value}</strong>
                        <span className="mt-1.5 block text-xs leading-5 text-[#6b7d93]">{item.meta}</span>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Attention Required</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">These are the commercial issues most likely to block margin, cashflow, or closing velocity.</p>
                  </div>
                  <div className="grid gap-3">
                    {commercialAlerts.map((item) => (
                      <article
                        key={item.title}
                        className={[
                          'rounded-[16px] border px-4 py-3.5',
                          item.tone === 'critical'
                            ? 'border-[#f1d3cf] bg-[#fff6f5]'
                            : item.tone === 'warning'
                              ? 'border-[#f3e1ba] bg-[#fffaf0]'
                              : item.tone === 'positive'
                                ? 'border-[#cfe8da] bg-[#f1fbf5]'
                                : 'border-[#e3ebf4] bg-white',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={[
                              'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                              item.tone === 'critical'
                                ? 'bg-[#fde9e7] text-[#b42318]'
                                : item.tone === 'warning'
                                  ? 'bg-[#fff1d6] text-[#b7791f]'
                                  : item.tone === 'positive'
                                    ? 'bg-[#dcf5e5] text-[#22824d]'
                                    : 'bg-[#edf4fb] text-[#56748f]',
                            ].join(' ')}
                          >
                            <AlertTriangle size={15} />
                          </span>
                          <div className="min-w-0">
                            <strong className="block text-sm font-semibold text-[#142132]">{item.title}</strong>
                            <p className="mt-1 text-xs leading-5 text-[#6b7d93]">{item.body}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-[#e6edf5] pt-4">
              {[
                ['Units', formatNumber(unitRows.length)],
                ['Stock Value', currency.format(totalListedStockValue || 0)],
                ['Derived Margin', `${derivedTargetMargin.toFixed(1)}%`],
              ].map(([label, value]) => (
                <span key={label} className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]">
                  {label}: {value}
                </span>
              ))}
            </div>
          </section>
          ) : null}

          {activeTab === 'performance' ? (
          <section className={CARD_SHELL}>
            <div className="mb-5">
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Development Progress Insights</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Buyer mix and funding profile signals based on live transaction and onboarding data.</p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <article className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Buyer Demographic / Age Group</h4>
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]">
                    {buyerAgeInsights.total} buyers
                  </span>
                </div>
                {buyerAgeInsights.total ? (
                  <div className="grid gap-2.5">
                    {buyerAgeInsights.items.map((item) => (
                      <article key={item.key} className="rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                        <div className="mb-2 flex items-center justify-between gap-3 text-[0.82rem]">
                          <strong className="text-[#23384d]">{item.label}</strong>
                          <span className="font-semibold text-[#66758b]">
                            {item.count} ({formatPercent(item.share)})
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[#e7eef6]" aria-hidden="true">
                          <span className="block h-full rounded-full bg-[#5c82a3]" style={{ width: `${item.width}%` }} />
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                    Buyer age data will appear once onboarding captures date of birth or age profile.
                  </p>
                )}
              </article>

              <article className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Cash vs Bond Clients</h4>
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]">
                    {cashBondInsights.total} deals
                  </span>
                </div>
                {cashBondInsights.total ? (
                  <>
                    <div className="h-3 overflow-hidden rounded-full bg-[#e7eef6]" aria-hidden="true">
                      <div className="flex h-full w-full">
                        <span className="h-full bg-[#375c78]" style={{ width: `${cashBondInsights.cashShare}%` }} />
                        <span className="h-full bg-[#22c55e]" style={{ width: `${cashBondInsights.bondShare}%` }} />
                        <span
                          className="h-full bg-[#cbd5e1]"
                          style={{ width: `${Math.max(0, 100 - cashBondInsights.cashShare - cashBondInsights.bondShare)}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <div className="flex items-center justify-between rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-2.5 text-sm">
                        <span className="inline-flex items-center gap-2 text-[#22384c]"><span className="h-2.5 w-2.5 rounded-full bg-[#375c78]" />Cash</span>
                        <strong className="text-[#142132]">{cashBondInsights.cash}</strong>
                      </div>
                      <div className="flex items-center justify-between rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-2.5 text-sm">
                        <span className="inline-flex items-center gap-2 text-[#22384c]"><span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />Bond</span>
                        <strong className="text-[#142132]">{cashBondInsights.bond}</strong>
                      </div>
                      {cashBondInsights.unknown ? (
                        <div className="flex items-center justify-between rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-2.5 text-sm">
                          <span className="inline-flex items-center gap-2 text-[#22384c]"><span className="h-2.5 w-2.5 rounded-full bg-[#cbd5e1]" />Unknown</span>
                          <strong className="text-[#142132]">{cashBondInsights.unknown}</strong>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                    Finance mix will appear once transactions are active in this development.
                  </p>
                )}
              </article>

              <article className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Bond Bank Split</h4>
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]">
                    {bondBankInsights.total} bond deals
                  </span>
                </div>
                {bondBankInsights.total ? (
                  <div className="grid gap-2.5">
                    {bondBankInsights.items.slice(0, 6).map((item) => (
                      <article key={item.label} className="rounded-[14px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                        <div className="mb-2 flex items-center justify-between gap-3 text-[0.82rem]">
                          <strong className="text-[#23384d]">{item.label}</strong>
                          <span className="font-semibold text-[#66758b]">
                            {item.count} ({formatPercent(item.share)})
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[#e7eef6]" aria-hidden="true">
                          <span className="block h-full rounded-full bg-[#22c55e]" style={{ width: `${item.width}%` }} />
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                    Bond bank distribution will appear once bank data is captured on bond-funded transactions.
                  </p>
                )}
              </article>
            </div>
          </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'marketing' ? (
        <section className="mt-4">
          {!canEditMarketing ? (
            <section className={`${CARD_SHELL} space-y-5`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Development Listing Content</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                    Read-only inherited listing content from the owner workspace (developer / agent). This view reflects owner updates automatically.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#d8e3ef] bg-[#f7fafd] px-3 py-1 text-[0.76rem] font-semibold text-[#5b7288]">
                  Read-only inherited view
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Price Range', marketingFloorplanPriceRange || marketingForm.listingOverview.priceRange || 'Not set'],
                  ['Floorplans', `${marketingReadinessSummary.floorplanCount}`],
                  ['Local Assets', `${marketingReadinessSummary.assetCount}`],
                  ['Listing Status', toTitleLabel(marketingReadinessSummary.listingStatus)],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-sm font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'overview', label: 'Listing Overview' },
                  { id: 'floorplans', label: 'Floorplans & Options' },
                  { id: 'media', label: 'Media & Assets' },
                  { id: 'seo', label: 'SEO' },
                  { id: 'agencies', label: 'Agencies' },
                  { id: 'selling_points', label: 'Selling Points' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMarketingEditorSection(item.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      marketingEditorSection === item.id
                        ? 'border-[#2f6fec] bg-[#e9f0ff] text-[#1d4db3]'
                        : 'border-[#dbe5ef] bg-white text-[#5c7289] hover:border-[#c6d5e5]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {marketingEditorSection === 'overview' ? (
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[#142132]">Listing Overview</h4>
                      <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                        Shared listing identity and development-level positioning configured by the owner module.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void handleCopyMarketingValue(marketingForm.listingOverview.listingDescription, 'Listing description')
                      }
                    >
                      <Copy size={14} />
                      Copy Description
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      ['Listing Title', marketingForm.listingOverview.listingTitle],
                      ['Listing Heading', marketingForm.listingOverview.listingHeading],
                      ['Ownership Type', toTitleLabel(marketingForm.listingOverview.ownershipType)],
                      ['Location Label', marketingForm.listingOverview.locationLabel],
                      ['Address', marketingForm.listingOverview.address],
                      ['Listing Status', toTitleLabel(marketingForm.listingOverview.listingStatus)],
                    ].map(([label, value]) => (
                      <article key={label} className="rounded-[12px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                        <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</span>
                        <strong className="mt-1.5 block text-sm font-medium text-[#1f344a]">{String(value || '').trim() || 'Not set'}</strong>
                      </article>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3">
                    <article className="rounded-[12px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Listing Description</span>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#30485f]">
                        {marketingForm.listingOverview.listingDescription || 'No listing description added yet.'}
                      </p>
                    </article>
                    <article className="rounded-[12px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Notes</span>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#30485f]">
                        {marketingForm.listingOverview.notes || 'No notes added yet.'}
                      </p>
                    </article>
                  </div>

                  <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ['Internet Access (Fibre Ready)', marketingForm.listingOverview.fibreReady],
                      ['Borehole', marketingForm.listingOverview.borehole],
                      ['Backup Battery / Inverter', marketingForm.listingOverview.backupBatteryInverter],
                      ['Gas Geyser', marketingForm.listingOverview.gasGeyser],
                      ['Solar Geyser', marketingForm.listingOverview.solarGeyser],
                      ['Solar Panels', marketingForm.listingOverview.solarPanels],
                      ['Water Tanks', marketingForm.listingOverview.waterTanks],
                      ['Pets Allowed', marketingForm.listingOverview.petsAllowed],
                    ].map(([label, value]) => (
                      <article key={label} className="rounded-[11px] border border-[#e3ebf4] bg-white px-3 py-2.5">
                        <span className="block text-xs text-[#5f7288]">{label}</span>
                        <strong className={`mt-1 block text-sm ${value ? 'text-[#1f7a45]' : 'text-[#7b8ca2]'}`}>
                          {value ? 'Yes' : 'No'}
                        </strong>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {marketingEditorSection === 'floorplans' ? (
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">Floorplans &amp; Options</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Read-only option set inherited from the owner workspace.
                    </p>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                    <aside className="rounded-[14px] border border-[#e3ebf4] bg-white p-2">
                      <div className="grid gap-1.5">
                        {marketingForm.floorplans.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedFloorplanId(item.id)}
                            className={`rounded-[10px] border px-3 py-2 text-left ${
                              selectedMarketingFloorplan?.id === item.id
                                ? 'border-[#2f6fec] bg-[#e9f0ff]'
                                : 'border-transparent hover:border-[#d7e4f2] hover:bg-[#f8fbff]'
                            }`}
                          >
                            <strong className="block text-sm text-[#142132]">{item.name || 'Untitled option'}</strong>
                            <span className="mt-1 block text-xs text-[#6b7d93]">
                              {formatMarketingFloorplanPriceSummary(item) || 'No price'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </aside>

                    {selectedMarketingFloorplan ? (
                      <div className="rounded-[14px] border border-[#e3ebf4] bg-white p-4">
                        <h5 className="text-sm font-semibold text-[#142132]">Floorplan Details</h5>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {[
                            ['Erf Size', selectedMarketingFloorplan.erfSize],
                            ['Floor Size', selectedMarketingFloorplan.floorSize],
                            ['Bedrooms', selectedMarketingFloorplan.bedrooms],
                            ['Bathrooms', selectedMarketingFloorplan.bathrooms],
                            ['Garage', selectedMarketingFloorplan.garage],
                            ['Pool', selectedMarketingFloorplan.pool],
                            ['Price', formatMarketingFloorplanPriceSummary(selectedMarketingFloorplan) || 'Not set'],
                            ['Rates & Taxes', selectedMarketingFloorplan.ratesAndTaxes],
                            ['Levies', selectedMarketingFloorplan.levies],
                            ['No Transfer Duty', selectedMarketingFloorplan.noTransferDuty ? 'Yes' : 'No'],
                            ['Customisation Options', selectedMarketingFloorplan.customisationOptions ? 'Yes' : 'No'],
                          ].map(([label, value]) => (
                            <article key={label} className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfcfe] px-3.5 py-3">
                              <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</span>
                              <strong className="mt-1.5 block text-sm font-medium text-[#1f344a]">{String(value || '').trim() || 'Not set'}</strong>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {marketingEditorSection === 'media' ? (
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">Media &amp; Assets</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Local files inherited from owner-side listing content. Download and view are enabled.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {marketingAssetGroups.map((group) => (
                      <section key={group.key} className="rounded-[14px] border border-[#e3ebf4] bg-white p-3.5">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <strong className="text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-[#5c7289]">{group.title}</strong>
                          <span className="text-[0.74rem] font-semibold text-[#7b8ca2]">{group.items.length} assets</span>
                        </div>

                        {group.items.length ? (
                          <div className="grid gap-2.5 md:grid-cols-2">
                            {group.items.map((item) => (
                              <article key={item.id} className="rounded-[12px] border border-[#e8eef6] bg-[#fbfcff] px-3 py-2.5">
                                <span className="inline-flex rounded-full border border-[#dbe7f5] bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#607a95]">
                                  {item.typeLabel}
                                </span>
                                <strong className="mt-2 block text-sm font-semibold text-[#1f344a]">{item.title}</strong>
                                <p className="mt-1 line-clamp-2 text-xs text-[#6b7d93]">{item.description || 'No description'}</p>
                                <div className="mt-2 flex items-center gap-2">
                                  <Button type="button" size="sm" variant="secondary" onClick={() => window.open(item.fileUrl, '_blank', 'noopener,noreferrer')}>
                                    View
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => void handleDownloadMarketingResource({ key: item.id, label: item.title, url: item.fileUrl })}
                                  >
                                    <Download size={13} />
                                    Download
                                  </Button>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-[12px] border border-dashed border-[#d8e3ef] bg-[#fbfdff] px-3 py-5 text-sm text-[#6b7d93]">
                            No local assets mapped yet.
                          </p>
                        )}
                      </section>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {[
                      {
                        key: 'video',
                        title: 'Video',
                        count: marketingVideoDocuments.length,
                        uploadKey: 'development-video',
                        accept: 'video/*',
                        message: 'Development video uploaded.',
                      },
                      {
                        key: 'virtual_tour',
                        title: 'Virtual Tour',
                        count: marketingVirtualTourDocuments.length,
                        uploadKey: 'development-tour',
                        accept: 'video/*,.zip,.html',
                        message: 'Development virtual tour uploaded.',
                      },
                    ].map((item) => (
                      <label key={item.key} className="flex min-h-[92px] cursor-pointer flex-col justify-center rounded-[14px] border border-dashed border-[#cad9e9] bg-white px-4 py-3 text-sm font-semibold text-[#20364c] hover:border-[#9fb8d0] hover:bg-[#f7fbff]">
                        <span className="inline-flex items-center gap-2">
                          <Upload size={15} />
                          {marketingAssetUploading === item.uploadKey ? 'Uploading...' : `Upload ${item.title}`}
                        </span>
                        <span className="mt-1 text-xs font-medium text-[#6b7d93]">{item.count ? `${item.count} uploaded` : 'No file uploaded'}</span>
                        <input
                          type="file"
                          accept={item.accept}
                          className="hidden"
                          disabled={Boolean(marketingAssetUploading)}
                          onChange={(event) =>
                            void handleMarketingAssetFileUpload(event, item.key, {
                              uploadKey: item.uploadKey,
                              successMessage: item.message,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ) : null}

              {marketingEditorSection === 'seo' ? (
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">SEO</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Read-only SEO details from owner listing configuration.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <article className="rounded-[12px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">SEO Title</span>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#30485f]">
                        {marketingForm.listingOverview.seoTitle || 'Not set'}
                      </p>
                    </article>
                    <article className="rounded-[12px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">SEO Meta Description</span>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#30485f]">
                        {marketingForm.listingOverview.seoMetaDescription || 'Not set'}
                      </p>
                    </article>
                  </div>
                </section>
              ) : null}

              {marketingEditorSection === 'agencies' ? (
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">Assigned Agencies</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Agency partners configured by the owner module for this development.
                    </p>
                  </div>

                  {marketingAgencyEntries.length ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {marketingAgencyEntries.map((agency) => (
                        <article key={`readonly-agency-${agency.id}`} className="rounded-[12px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <strong className="block text-sm font-semibold text-[#1f344a]">
                                {agency.name || 'Unnamed agency'}
                              </strong>
                              <p className="mt-1 text-xs text-[#5f7288]">
                                {agency.contactName || 'No contact assigned'}
                              </p>
                            </div>
                            {agency.isPreferred ? (
                              <span className="inline-flex rounded-full border border-[#d5e7dc] bg-[#f2faf5] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#1f7a45]">
                                Preferred
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-[#5f7288]">
                            <p>Email: {agency.contactEmail || 'Not set'}</p>
                            <p>Phone: {agency.contactPhone || 'Not set'}</p>
                            <p className="line-clamp-2">Notes: {agency.notes || 'No notes added'}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-[12px] border border-dashed border-[#d8e3ef] bg-[#fbfdff] px-3 py-5 text-sm text-[#6b7d93]">
                      No agencies assigned to this development yet.
                    </p>
                  )}
                </section>
              ) : null}

              {marketingEditorSection === 'selling_points' ? (
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[#142132]">Key Selling Points</h4>
                      <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                        Read-only highlights configured by the owner listing team.
                      </p>
                    </div>
                    {marketingSellingPointEntries.length ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void handleCopyMarketingValue(
                            marketingSellingPointEntries
                              .map((item) => (item.note ? `${item.title}: ${item.note}` : item.title))
                              .join('\n'),
                            'Selling points',
                          )
                        }
                      >
                        <Copy size={13} />
                        Copy All
                      </Button>
                    ) : null}
                  </div>

                  {marketingSellingPointEntries.length ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {marketingSellingPointEntries.map((entry, index) => (
                        <article key={`selling-point-readonly-${index}`} className="rounded-[12px] border border-[#e3ebf4] bg-white p-3.5">
                          <span className="inline-flex rounded-full border border-[#d8e4f2] bg-[#f8fbff] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#627d98]">
                            Point {index + 1}
                          </span>
                          <strong className="mt-2 block text-sm font-semibold text-[#142132]">{entry.title || 'Untitled point'}</strong>
                          {entry.note ? <p className="mt-1.5 text-sm leading-6 text-[#30485f]">{entry.note}</p> : null}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-[12px] border border-dashed border-[#d8e3ef] bg-white px-4 py-6 text-sm text-[#6b7d93]">
                      No selling points added yet.
                    </p>
                  )}
                </section>
              ) : null}
            </section>
          ) : (
            <>
              <form className={`${CARD_SHELL} space-y-5`} onSubmit={handleMarketingSave}>
                {renderEditableMarketingContent()}
              </form>
              {false ? (
          <form className={`${CARD_SHELL} space-y-5`} onSubmit={handleMarketingSave}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Marketing</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                  Manage the public listing content by unit type, with clear pricing, descriptions, images, and floorplans.
                </p>
              </div>
              <label className={`inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition ${
                marketingAssetUploading
                  ? 'border-[#dbe6f2] bg-[#f5f8fb] text-[#9aa9ba]'
                  : 'border-[#dbe6f2] bg-white text-[#20364c] shadow-[0_8px_16px_rgba(21,38,59,0.06)] hover:border-[#b9cadb] hover:bg-[#f8fbff]'
              }`}>
                <Upload size={15} />
                Upload Images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={Boolean(marketingAssetUploading)}
                  onChange={(event) =>
                    void handleMarketingAssetFileUpload(event, 'marketing', {
                      uploadKey: 'gallery',
                      successMessage: 'Marketing images uploaded.',
                    })
                  }
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Price Range', marketingFloorplanPriceRange || 'Not set'],
                ['Unit Types', `${marketingReadinessSummary.floorplanCount}`],
                ['Assets', `${marketingReadinessSummary.assetCount}`],
                ['Listing Status', toTitleLabel(marketingReadinessSummary.listingStatus)],
              ].map(([label, value]) => (
                <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                  <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                  <strong className="mt-2 block text-sm font-semibold text-[#142132]">{value}</strong>
                </article>
              ))}
            </div>

            <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-[#142132]">Unit Types</h4>
                  <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                    Select a unit type to edit its description, price range, images, and floorplans.
                  </p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addMarketingFloorplan}>
                  <Plus size={14} />
                  Add Unit Type
                </Button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {marketingForm.floorplans.map((item, index) => {
                  const priceSummary = formatMarketingFloorplanPriceSummary(item)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedFloorplanId(item.id)}
                      className={`min-w-[180px] rounded-[14px] border px-4 py-3 text-left transition ${
                        selectedMarketingFloorplan?.id === item.id
                          ? 'border-[#1f7a45] bg-[#edf9f1] text-[#123322]'
                          : 'border-[#dbe5ef] bg-white text-[#31475c] hover:border-[#bcd0e4]'
                      }`}
                    >
                      <strong className="block text-sm font-semibold">
                        {item.name || `Unit Type ${index + 1}`}
                      </strong>
                      <span className="mt-1 block text-xs text-[#64788f]">
                        {priceSummary || 'Price not set'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-[#142132]">Listing Description</h4>
                <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                  This is the shared development copy that appears above the selected unit types.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <DetailField label="Listing Title">
                  <Field
                    value={marketingForm.listingOverview.listingTitle}
                    onChange={(event) => setMarketingField('listingOverview', 'listingTitle', event.target.value)}
                    placeholder="Amari Residence"
                  />
                </DetailField>
                <DetailField label="Listing Heading">
                  <Field
                    value={marketingForm.listingOverview.listingHeading}
                    onChange={(event) => setMarketingField('listingOverview', 'listingHeading', event.target.value)}
                    placeholder="Modern apartments in Pomona"
                  />
                </DetailField>
                <DetailField label="Ownership Type">
                  <Field
                    as="select"
                    value={marketingForm.listingOverview.ownershipType}
                    onChange={(event) => setMarketingField('listingOverview', 'ownershipType', event.target.value)}
                  >
                    {MARKETING_OWNERSHIP_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </DetailField>
                <DetailField label="Listing Status">
                  <Field
                    as="select"
                    value={marketingForm.listingOverview.listingStatus}
                    onChange={(event) => setMarketingField('listingOverview', 'listingStatus', event.target.value)}
                  >
                    {MARKETING_LISTING_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </DetailField>
                <DetailField label="Description" className="md:col-span-2">
                  <Field
                    as="textarea"
                    rows={6}
                    value={marketingForm.listingOverview.listingDescription}
                    onChange={(event) => setMarketingField('listingOverview', 'listingDescription', event.target.value)}
                    placeholder="Describe the development, location, buyer appeal, and main lifestyle benefits."
                  />
                </DetailField>
                <DetailField label="Location Label">
                  <Field
                    value={marketingForm.listingOverview.locationLabel}
                    onChange={(event) => setMarketingField('listingOverview', 'locationLabel', event.target.value)}
                    placeholder="Pomona, Kempton Park"
                  />
                </DetailField>
                <DetailField label="Address">
                  <Field
                    value={marketingForm.listingOverview.address}
                    onChange={(event) => setMarketingField('listingOverview', 'address', event.target.value)}
                    placeholder="254 Outeniqua Street"
                  />
                </DetailField>
              </div>
            </section>

            <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-[#142132]">Listing Media</h4>
                  <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                    Upload images, floorplans, video links, tour links, and the development logo from this tab.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-3 text-xs font-semibold transition ${
                    marketingAssetUploading
                      ? 'border-[#dbe6f2] bg-[#f5f8fb] text-[#9aa9ba]'
                      : 'border-[#1f7a45] bg-[#1f7a45] text-white shadow-[0_8px_14px_rgba(31,122,69,0.16)] hover:bg-[#176339]'
                  }`}>
                    <ImagePlus size={14} />
                    Upload Images
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={Boolean(marketingAssetUploading)}
                      onChange={(event) =>
                        void handleMarketingAssetFileUpload(event, 'marketing', {
                          uploadKey: 'gallery',
                          successMessage: 'Marketing images uploaded.',
                        })
                      }
                    />
                  </label>
                  <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-3 text-xs font-semibold transition ${
                    marketingAssetUploading
                      ? 'border-[#dbe6f2] bg-[#f5f8fb] text-[#9aa9ba]'
                      : 'border-[#dbe6f2] bg-white text-[#20364c] hover:border-[#b9cadb] hover:bg-[#f8fbff]'
                  }`}>
                    <FileText size={14} />
                    Upload Floorplans
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      multiple
                      className="hidden"
                      disabled={Boolean(marketingAssetUploading)}
                      onChange={(event) =>
                        void handleMarketingAssetFileUpload(event, 'floorplan', {
                          uploadKey: 'floorplan',
                          successMessage: 'Floorplans uploaded.',
                        })
                      }
                    />
                  </label>
                  <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-3 text-xs font-semibold transition ${
                    marketingAssetUploading
                      ? 'border-[#dbe6f2] bg-[#f5f8fb] text-[#9aa9ba]'
                      : 'border-[#dbe6f2] bg-white text-[#20364c] hover:border-[#b9cadb] hover:bg-[#f8fbff]'
                  }`}>
                    <Upload size={14} />
                    Upload Logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      disabled={Boolean(marketingAssetUploading)}
                      onChange={(event) =>
                        void handleMarketingAssetFileUpload(event, 'logo', {
                          uploadKey: 'logo',
                          title: `${data.development.name || 'Development'} logo`,
                          successMessage: 'Development logo uploaded.',
                        })
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="grid gap-4">
                  <article className="rounded-[16px] border border-[#dbe6f2] bg-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h5 className="text-sm font-semibold text-[#20364c]">Main Cover Image</h5>
                      {marketingCoverImageUrl ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => window.open(marketingCoverImageUrl, '_blank', 'noopener,noreferrer')}
                        >
                          View
                        </Button>
                      ) : null}
                    </div>
                    {marketingCoverImageUrl && isLikelyImageUrl(marketingCoverImageUrl) ? (
                      <img
                        src={marketingCoverImageUrl}
                        alt={`${data.development.name || 'Development'} cover`}
                        className="h-[220px] w-full rounded-[14px] object-cover"
                      />
                    ) : (
                      <label className="flex h-[220px] cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed border-[#cbd9e8] bg-[#f8fbff] text-center text-sm font-semibold text-[#587089]">
                        <ImagePlus size={24} className="mb-2" />
                        Add cover image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={Boolean(marketingAssetUploading)}
                          onChange={(event) =>
                            void handleMarketingAssetFileUpload(event, 'marketing', {
                              uploadKey: 'cover',
                              successMessage: 'Cover image uploaded.',
                            })
                          }
                        />
                      </label>
                    )}
                  </article>

                  <article className="rounded-[16px] border border-[#dbe6f2] bg-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h5 className="text-sm font-semibold text-[#20364c]">Development Logo</h5>
                      <span className="text-xs font-semibold text-[#7b8ca2]">
                        {marketingLogoUrl ? 'Saved' : 'Not uploaded'}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[170px_minmax(0,1fr)] sm:items-center">
                      <div className="flex h-24 items-center justify-center rounded-[14px] border border-dashed border-[#cbd9e8] bg-[#f8fbff] p-3">
                        {marketingLogoUrl ? (
                          <img src={marketingLogoUrl} alt={`${data.development.name || 'Development'} logo`} className="max-h-full max-w-full object-contain" />
                        ) : (
                          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Logo</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm leading-6 text-[#5c7289]">
                          Store the development logo for listing artwork and future marketing collateral.
                        </p>
                        <label className="mt-3 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#20364c] hover:border-[#b9cadb] hover:bg-[#f8fbff]">
                          <Upload size={13} />
                          {marketingLogoUrl ? 'Replace Logo' : 'Upload Logo'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            className="hidden"
                            disabled={Boolean(marketingAssetUploading)}
                            onChange={(event) =>
                              void handleMarketingAssetFileUpload(event, 'logo', {
                                uploadKey: 'logo',
                                title: `${data.development.name || 'Development'} logo`,
                                successMessage: 'Development logo uploaded.',
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </article>
                </div>

                <div className="grid gap-4">
                  <article className="rounded-[16px] border border-[#dbe6f2] bg-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h5 className="text-sm font-semibold text-[#20364c]">Gallery Images ({marketingGalleryDocuments.filter((item) => item.type === 'marketing').length})</h5>
                      <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-[#dbe6f2] bg-white px-2.5 text-xs font-semibold text-[#20364c] hover:border-[#b9cadb] hover:bg-[#f8fbff]">
                        <ImagePlus size={13} />
                        Add More
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={Boolean(marketingAssetUploading)}
                          onChange={(event) =>
                            void handleMarketingAssetFileUpload(event, 'marketing', {
                              uploadKey: 'gallery',
                              successMessage: 'Marketing images uploaded.',
                            })
                          }
                        />
                      </label>
                    </div>
                    {marketingGalleryDocuments.filter((item) => item.type === 'marketing').length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {marketingGalleryDocuments
                          .filter((item) => item.type === 'marketing')
                          .slice(0, 4)
                          .map((item) => (
                            <article key={item.id} className="overflow-hidden rounded-[14px] border border-[#e3ebf4] bg-[#fbfcfe]">
                              {isLikelyImageUrl(item.fileUrl) ? (
                                <img src={item.fileUrl} alt={item.title} className="h-28 w-full object-cover" />
                              ) : (
                                <div className="flex h-28 items-center justify-center bg-[#eef4fa] text-xs font-semibold text-[#6b7d93]">
                                  Media file
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="min-w-0 truncate text-xs font-semibold text-[#20364c]">{item.title}</span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => window.open(item.fileUrl, '_blank', 'noopener,noreferrer')}
                                >
                                  View
                                </Button>
                              </div>
                            </article>
                          ))}
                      </div>
                    ) : (
                      <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed border-[#cbd9e8] bg-[#f8fbff] text-center text-sm font-semibold text-[#587089]">
                        <ImagePlus size={24} className="mb-2" />
                        Add gallery images
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={Boolean(marketingAssetUploading)}
                          onChange={(event) =>
                            void handleMarketingAssetFileUpload(event, 'marketing', {
                              uploadKey: 'gallery',
                              successMessage: 'Marketing images uploaded.',
                            })
                          }
                        />
                      </label>
                    )}
                  </article>

                  <article className="rounded-[16px] border border-[#dbe6f2] bg-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h5 className="text-sm font-semibold text-[#20364c]">Floorplans ({floorplanDocumentOptions.length})</h5>
                      <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-[#dbe6f2] bg-white px-2.5 text-xs font-semibold text-[#20364c] hover:border-[#b9cadb] hover:bg-[#f8fbff]">
                        <FileText size={13} />
                        Upload Floorplan
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          multiple
                          className="hidden"
                          disabled={Boolean(marketingAssetUploading)}
                          onChange={(event) =>
                            void handleMarketingAssetFileUpload(event, 'floorplan', {
                              uploadKey: 'floorplan',
                              successMessage: 'Floorplans uploaded.',
                            })
                          }
                        />
                      </label>
                    </div>
                    {floorplanDocumentOptions.length ? (
                      <div className="grid gap-2">
                        {floorplanDocumentOptions.slice(0, 4).map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e3ebf4] bg-[#fbfcfe] px-3 py-2.5">
                            <div className="min-w-0">
                              <strong className="block truncate text-sm text-[#20364c]">{item.title}</strong>
                              <span className="block truncate text-xs text-[#6b7d93]">{item.description || 'Floorplan asset'}</span>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => window.open(item.fileUrl, '_blank', 'noopener,noreferrer')}
                            >
                              View
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[12px] border border-dashed border-[#cbd9e8] bg-[#f8fbff] px-4 py-5 text-sm text-[#6b7d93]">
                        No floorplans uploaded yet.
                      </div>
                    )}
                  </article>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  {
                    key: 'video',
                    title: 'Video',
                    count: marketingVideoDocuments.length,
                    uploadKey: 'development-video',
                    accept: 'video/*',
                    message: 'Development video uploaded.',
                  },
                  {
                    key: 'virtual_tour',
                    title: 'Virtual Tour',
                    count: marketingVirtualTourDocuments.length,
                    uploadKey: 'development-tour',
                    accept: 'video/*,.zip,.html',
                    message: 'Development virtual tour uploaded.',
                  },
                ].map((item) => (
                  <label key={item.key} className="flex min-h-[92px] cursor-pointer flex-col justify-center rounded-[14px] border border-dashed border-[#cad9e9] bg-white px-4 py-3 text-sm font-semibold text-[#20364c] hover:border-[#9fb8d0] hover:bg-[#f7fbff]">
                    <span className="inline-flex items-center gap-2">
                      <Upload size={15} />
                      {marketingAssetUploading === item.uploadKey ? 'Uploading...' : `Upload ${item.title}`}
                    </span>
                    <span className="mt-1 text-xs font-medium text-[#6b7d93]">{item.count ? `${item.count} uploaded` : 'No file uploaded'}</span>
                    <input
                      type="file"
                      accept={item.accept}
                      className="hidden"
                      disabled={Boolean(marketingAssetUploading)}
                      onChange={(event) =>
                        void handleMarketingAssetFileUpload(event, item.key, {
                          uploadKey: item.uploadKey,
                          successMessage: item.message,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </section>

            {selectedMarketingFloorplan ? (
              <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
                <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[#142132]">Unit Type Details</h4>
                      <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                        Keep the selling copy and price range specific to this unit type.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-[#b42318] hover:bg-[#fff1f1]"
                      onClick={() => removeMarketingFloorplan(selectedMarketingFloorplan.id)}
                    >
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Unit Type Name" className="md:col-span-2">
                      <Field
                        value={selectedMarketingFloorplan.name}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'name', event.target.value)
                        }
                        placeholder="2 Bedroom Apartment"
                      />
                    </DetailField>
                    <DetailField label="Description" className="md:col-span-2">
                      <Field
                        as="textarea"
                        rows={5}
                        value={selectedMarketingFloorplan.description}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'description', event.target.value)
                        }
                        placeholder="Describe this specific unit type, layout, finishes, and buyer appeal."
                      />
                    </DetailField>
                    <DetailField label="Price From">
                      <Field
                        inputMode="numeric"
                        value={selectedMarketingFloorplan.priceFrom}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'priceFrom', event.target.value)
                        }
                        placeholder="950000"
                      />
                    </DetailField>
                    <DetailField label="Price To">
                      <Field
                        inputMode="numeric"
                        value={selectedMarketingFloorplan.priceTo}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'priceTo', event.target.value)
                        }
                        placeholder="1250000"
                      />
                    </DetailField>
                    <DetailField label="Bedrooms">
                      <Field
                        value={selectedMarketingFloorplan.bedrooms}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'bedrooms', event.target.value)
                        }
                      />
                    </DetailField>
                    <DetailField label="Bathrooms">
                      <Field
                        value={selectedMarketingFloorplan.bathrooms}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'bathrooms', event.target.value)
                        }
                      />
                    </DetailField>
                    <DetailField label="Parking">
                      <Field
                        value={selectedMarketingFloorplan.garage}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'garage', event.target.value)
                        }
                      />
                    </DetailField>
                    <DetailField label="Floor Size">
                      <Field
                        value={selectedMarketingFloorplan.floorSize}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'floorSize', event.target.value)
                        }
                        placeholder="74 sqm"
                      />
                    </DetailField>
                    <DetailField label="Levies">
                      <Field
                        value={selectedMarketingFloorplan.levies}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'levies', event.target.value)
                        }
                        placeholder="1450"
                      />
                    </DetailField>
                    <DetailField label="Rates & Taxes">
                      <Field
                        value={selectedMarketingFloorplan.ratesAndTaxes}
                        onChange={(event) =>
                          setMarketingFloorplanField(selectedMarketingFloorplan.id, 'ratesAndTaxes', event.target.value)
                        }
                        placeholder="850"
                      />
                    </DetailField>
                    <DetailField label="No Transfer Duty">
                      <Field
                        as="select"
                        value={selectedMarketingFloorplan.noTransferDuty ? 'yes' : 'no'}
                        onChange={(event) =>
                          setMarketingFloorplanField(
                            selectedMarketingFloorplan.id,
                            'noTransferDuty',
                            event.target.value === 'yes',
                          )
                        }
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Field>
                    </DetailField>
                    <DetailField label="Customisation Options">
                      <Field
                        as="select"
                        value={selectedMarketingFloorplan.customisationOptions ? 'yes' : 'no'}
                        onChange={(event) =>
                          setMarketingFloorplanField(
                            selectedMarketingFloorplan.id,
                            'customisationOptions',
                            event.target.value === 'yes',
                          )
                        }
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Field>
                    </DetailField>
                  </div>
                </div>

                <div className="grid gap-5">
                  <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[#142132]">Upload Images</h4>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                          {selectedMarketingUnitImageDocuments.length ? `${selectedMarketingUnitImageDocuments.length} image file${selectedMarketingUnitImageDocuments.length === 1 ? '' : 's'} uploaded.` : 'No images uploaded yet.'}
                        </p>
                      </div>
                      <Upload size={16} className="text-[#607891]" />
                    </div>
                    <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff]">
                      <Upload size={13} />
                      {marketingAssetUploading === `unit-images-${selectedMarketingFloorplan.id}` ? 'Uploading...' : 'Upload Images'}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={Boolean(marketingAssetUploading)}
                        onChange={(event) =>
                          void handleMarketingAssetFileUpload(event, 'marketing', {
                            uploadKey: `unit-images-${selectedMarketingFloorplan.id}`,
                            linkedUnitType: selectedMarketingFloorplan.id,
                            successMessage: 'Unit type images uploaded.',
                          })
                        }
                      />
                    </label>
                  </section>

                  <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[#142132]">Upload Floorplans</h4>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                          {selectedMarketingUnitFloorplanDocuments.length ? `${selectedMarketingUnitFloorplanDocuments.length} floorplan file${selectedMarketingUnitFloorplanDocuments.length === 1 ? '' : 's'} uploaded.` : 'No floorplans uploaded yet.'}
                        </p>
                      </div>
                      <Upload size={16} className="text-[#607891]" />
                    </div>
                    <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:border-[#b7c8db] hover:bg-[#f7fbff]">
                      <Upload size={13} />
                      {marketingAssetUploading === `unit-floorplans-${selectedMarketingFloorplan.id}` ? 'Uploading...' : 'Upload Floorplans'}
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        multiple
                        className="hidden"
                        disabled={Boolean(marketingAssetUploading)}
                        onChange={(event) =>
                          void handleMarketingAssetFileUpload(event, 'floorplan', {
                            uploadKey: `unit-floorplans-${selectedMarketingFloorplan.id}`,
                            linkedUnitType: selectedMarketingFloorplan.id,
                            successMessage: 'Unit type floorplans uploaded.',
                          })
                        }
                      />
                    </label>
                  </section>
                </div>
              </section>
            ) : (
              <section className="rounded-[18px] border border-dashed border-[#d8e3ef] bg-[#fbfdff] px-4 py-6 text-sm text-[#6b7d93]">
                Add a unit type to start configuring marketing content.
              </section>
            )}

            <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-[#142132]">Selling Points</h4>
                  <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                    Add the short highlights agents need for this development listing.
                  </p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addMarketingSellingPointEntry}>
                  <Plus size={14} />
                  Add Point
                </Button>
              </div>

              <div className="grid gap-3">
                {marketingSellingPointEntries.map((entry, index) => (
                  <article key={`selling-point-${index}`} className="rounded-[14px] border border-[#e3ebf4] bg-white p-3.5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="inline-flex rounded-full border border-[#d8e4f2] bg-[#f8fbff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#627d98]">
                        Point {index + 1}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-[#b42318] hover:bg-[#fff1f1]"
                        onClick={() => removeMarketingSellingPointEntry(index)}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
                      <DetailField label="Headline">
                        <Field
                          value={entry.title}
                          onChange={(event) => updateMarketingSellingPointEntry(index, 'title', event.target.value)}
                          placeholder="Secure estate access"
                        />
                      </DetailField>
                      <DetailField label="Supporting Text">
                        <Field
                          value={entry.note}
                          onChange={(event) => updateMarketingSellingPointEntry(index, 'note', event.target.value)}
                          placeholder="24/7 access control with patrol response."
                        />
                      </DetailField>
                    </div>
                  </article>
                ))}
              </div>

              {!marketingSellingPointEntries.length ? (
                <p className="rounded-[12px] border border-dashed border-[#d8e3ef] bg-white px-4 py-6 text-sm text-[#6b7d93]">
                  No selling points added yet.
                </p>
              ) : null}
            </section>

            <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-[#142132]">Publishing</h4>
                <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                  Keep the listing visibility and search copy close to the marketing content.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <DetailField label="Marketing Status">
                  <Field
                    as="select"
                    value={marketingForm.listingConfiguration.marketingStatus}
                    onChange={(event) => setMarketingField('listingConfiguration', 'marketingStatus', event.target.value)}
                  >
                    {MARKETING_PUBLISH_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </DetailField>
                <DetailField label="Public Visibility">
                  <Field
                    as="select"
                    value={marketingForm.listingConfiguration.publicVisibility ? 'visible' : 'hidden'}
                    onChange={(event) =>
                      setMarketingField('listingConfiguration', 'publicVisibility', event.target.value === 'visible')
                    }
                  >
                    <option value="visible">Visible</option>
                    <option value="hidden">Hidden</option>
                  </Field>
                </DetailField>
                <DetailField label="SEO Title">
                  <Field
                    value={marketingForm.listingOverview.seoTitle}
                    onChange={(event) => setMarketingField('listingOverview', 'seoTitle', event.target.value)}
                    placeholder="Amari Residence | Apartments in Pomona"
                  />
                </DetailField>
                <DetailField label="SEO Meta Description">
                  <Field
                    value={marketingForm.listingOverview.seoMetaDescription}
                    onChange={(event) =>
                      setMarketingField('listingOverview', 'seoMetaDescription', event.target.value)
                    }
                    placeholder="Short search description for the public listing page."
                  />
                </DetailField>
              </div>
            </section>

            <div className="flex items-center justify-end border-t border-[#e6edf5] pt-4">
              <Button type="submit" disabled={detailsSaving}>
                {detailsSaving ? 'Saving…' : 'Save Marketing Content'}
              </Button>
            </div>
          </form>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {activeTab === 'units' ? (
        <section className="mt-4">
          <section className={CARD_SHELL}>
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Development Stock Master</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Maintain the unit master for this development here. Transactions, handover, and snag tracking read from these records, while the portfolio units screen stays operational.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Field as="select" className="min-w-[180px]" value={unitStatusFilter} onChange={(event) => setUnitStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  {DEVELOPMENT_UNIT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Field>
                <Button variant="secondary" className="whitespace-nowrap" onClick={openBulkUnitModal}>
                  <Plus size={15} />
                  Add Bulk
                </Button>
                <Button className="whitespace-nowrap" onClick={() => openUnitModal()}>
                  <Plus size={15} />
                  Add Unit
                </Button>
              </div>
            </div>

            {remainingPlannedUnits > 0 ? (
              <div className="mb-5 flex flex-col gap-3 rounded-[18px] border border-[#dbe7f3] bg-[#f8fbff] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <strong className="block text-sm font-semibold text-[#142132]">Populate planned stock faster</strong>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    This development is set to {formatNumber(expectedUnitCount)} expected units and currently has {formatNumber(unitRows.length)} in the stock master.
                    {` ${formatNumber(remainingPlannedUnits)} still need to be created.`}
                  </p>
                </div>
                <Button variant="secondary" className="whitespace-nowrap" onClick={openBulkUnitModal}>
                  <Plus size={15} />
                  Populate Remaining Units
                </Button>
              </div>
            ) : null}

            {filteredUnits.length ? (
              <div className="overflow-hidden rounded-[18px] border border-[#e3ebf4]">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#e8eef5]">
                    <thead className="bg-[#f8fafc]">
                      <tr>
                        {[
                          'Block',
                          'Unit Number',
                          'Purchaser',
                          'Status',
                          'Sales Price',
                          'Handover Date',
                          'Floorplan',
                        ].map((heading) => (
                          <th key={heading} className="px-5 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2f7] bg-white">
                      {filteredUnits.map((unit) => (
                        <tr key={unit.id} className="transition hover:bg-[#f8fbff]">
                          <td className="px-5 py-4 align-middle">
                            <input
                              className={`${UNIT_QUICK_FIELD_CLASS} max-w-[120px]`}
                              defaultValue={unit.block || ''}
                              placeholder="Block"
                              disabled={unitQuickSavingKey === `${unit.id}:block`}
                              aria-label={`Update block for unit ${unit.unitNumber}`}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={(event) => {
                                const nextBlock = event.target.value.trim()
                                if (nextBlock === String(unit.block || '').trim()) return
                                void handleUnitQuickSave(unit, { block: nextBlock }, {
                                  field: 'block',
                                  feedbackLabel: `Unit ${unit.unitNumber} block updated.`,
                                })
                              }}
                            />
                          </td>
                          <td className="px-5 py-4 align-middle">
                            <input
                              className={`${UNIT_QUICK_FIELD_CLASS} max-w-[150px]`}
                              defaultValue={unit.unitNumber || ''}
                              placeholder="Unit number"
                              disabled={unitQuickSavingKey === `${unit.id}:unitNumber`}
                              aria-label={`Update unit number for ${unit.unitNumber || 'unit'}`}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={(event) => {
                                const nextUnitNumber = event.target.value.trim()
                                if (nextUnitNumber === String(unit.unitNumber || '').trim()) return
                                void handleUnitQuickSave(unit, { unitNumber: nextUnitNumber, unitLabel: nextUnitNumber }, {
                                  field: 'unitNumber',
                                  feedbackLabel: `Unit ${unit.unitNumber} number updated.`,
                                })
                              }}
                            />
                          </td>
                          <td className="px-5 py-4 text-sm text-[#44576d]">
                            {unit.currentTransactionId ? (
                              <button
                                type="button"
                                className="max-w-[220px] truncate text-left text-sm font-semibold text-[#1f4f76] hover:text-[#0f6c43]"
                                title={unit.buyerName || 'Open linked transaction'}
                                onClick={() => openDevelopmentTransactionWorkspace({
                                  transactionId: unit.currentTransactionId,
                                  unitId: unit.id,
                                  unitNumber: unit.unitNumber,
                                  title: unit.buyerName || `Unit ${unit.unitNumber}`,
                                })}
                              >
                                {unit.buyerName || 'Open linked transaction'}
                              </button>
                            ) : (
                              <span>No purchaser assigned</span>
                            )}
                          </td>
                          <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                            <div className="grid min-w-[180px] gap-1.5">
                              <Field
                                as="select"
                                className={`h-10 rounded-full border px-3 py-1 text-xs font-semibold ${getDevelopmentUnitStatusPillClassName(unit.status)}`}
                                value={getDevelopmentUnitStatusOption(unit.status).value}
                                disabled={unitStatusSavingId === unit.id}
                                aria-label={`Update status for unit ${unit.unitNumber}`}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                  event.stopPropagation()
                                  void handleUnitStatusQuickChange(unit, event.target.value)
                                }}
                              >
                                {DEVELOPMENT_UNIT_STATUS_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </Field>
                              {!unit.currentTransactionId && !isAvailableDevelopmentUnitStatus(unit.status) ? (
                                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Manual / external</span>
                              ) : unit.currentTransactionId ? (
                                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#1f7a43]">Transaction linked</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-5 py-4 align-middle">
                            <input
                              className={`${UNIT_QUICK_FIELD_CLASS} max-w-[150px] font-medium text-[#44576d]`}
                              type="number"
                              min="0"
                              step="1"
                              defaultValue={Number.isFinite(Number(unit.salesPrice)) ? Number(unit.salesPrice) : ''}
                              placeholder="0"
                              disabled={unitQuickSavingKey === `${unit.id}:salesPrice`}
                              aria-label={`Update sales price for unit ${unit.unitNumber}`}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={(event) => {
                                const nextValue = event.target.value
                                const currentValue = Number.isFinite(Number(unit.salesPrice)) ? String(Number(unit.salesPrice)) : ''
                                if (String(nextValue || '') === currentValue) return
                                void handleUnitQuickSave(unit, { salesPrice: nextValue }, {
                                  field: 'salesPrice',
                                  feedbackLabel: `Unit ${unit.unitNumber} sales price updated.`,
                                })
                              }}
                            />
                          </td>
                          <td className="px-5 py-4 align-middle">
                            <input
                              className={`${UNIT_QUICK_FIELD_CLASS} max-w-[160px] font-medium text-[#44576d]`}
                              type="date"
                              defaultValue={normalizeDateInput(unit.handover?.handoverDate || '')}
                              disabled={!unit.currentTransactionId || unitQuickSavingKey === `${unit.id}:handoverDate`}
                              aria-label={`Update handover date for unit ${unit.unitNumber}`}
                              title={unit.currentTransactionId ? 'Update handover date' : 'Handover date is available once a transaction is linked'}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                void handleUnitHandoverDateQuickChange(unit, event.target.value)
                              }}
                            />
                          </td>
                          <td className="px-5 py-4 align-middle">
                            <Field
                              as="select"
                              className="h-10 min-w-[190px] rounded-[10px] border border-transparent bg-transparent px-3 py-2 text-sm font-medium text-[#44576d] hover:border-[#dbe5ef] hover:bg-[#fbfcfe] focus:border-[#1f7a45] focus:bg-white"
                              value={unit.floorplanId || ''}
                              disabled={unitQuickSavingKey === `${unit.id}:floorplanId`}
                              aria-label={`Update floorplan for unit ${unit.unitNumber}`}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                void handleUnitQuickSave(unit, { floorplanId: event.target.value || null }, {
                                  field: 'floorplanId',
                                  feedbackLabel: `Unit ${unit.unitNumber} floorplan updated.`,
                                })
                              }}
                            >
                              <option value="">No floorplan assigned</option>
                              {floorplanDocumentOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.title}
                                </option>
                              ))}
                            </Field>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-8 text-center">
                <p className="text-sm text-[#6b7d93]">No units added yet.</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <Button variant="secondary" className="whitespace-nowrap" onClick={openBulkUnitModal}>Add Bulk</Button>
                  <Button variant="secondary" className="whitespace-nowrap" onClick={() => openUnitModal()}>Add Unit</Button>
                </div>
              </div>
            )}
          </section>
        </section>
      ) : null}

      {activeTab === 'leads' ? (
        <section className="mt-4">
          <section className={CARD_SHELL}>
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Development Leads</h3>
                <p className="mt-1.5 max-w-[760px] text-sm leading-6 text-[#6b7d93]">
                  Buyer leads allocated to this development. Contact details and buyer lead access are only available to the receiving agent.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                  <Users size={13} />
                  {formatNumber(developmentLeadFunnelItems.total)} leads
                </span>
                {developmentLeadFunnelItems.protectedCount ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                    <EyeOff size={13} />
                    {formatNumber(developmentLeadFunnelItems.protectedCount)} protected
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              {developmentLeadFunnelItems.items.map((stage) => (
                <article key={stage.key} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                  <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                    {stage.label}
                  </span>
                  <strong className="mt-2 block text-2xl font-semibold tracking-[-0.03em] text-[#142132]">
                    {formatNumber(stage.count)}
                  </strong>
                </article>
              ))}
            </div>

            {developmentLeadsLoading ? (
              <div className="mt-5 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-5 py-8 text-center">
                <p className="text-sm text-[#6b7d93]">Loading development leads...</p>
              </div>
            ) : null}

            {developmentLeadsError ? (
              <p className="mt-5 rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
                {developmentLeadsError}
              </p>
            ) : null}

            {!developmentLeadsLoading && !developmentLeadRows.length ? (
              <div className="mt-5 rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-8 text-center">
                <p className="text-sm text-[#6b7d93]">No buyer leads allocated to this development yet.</p>
              </div>
            ) : null}

            {developmentLeadRows.length ? (
              <div className="mt-5 overflow-hidden rounded-[18px] border border-[#e3ebf4] bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#e8eef5]">
                    <thead className="bg-[#f8fafc]">
                      <tr>
                        {['Lead', 'Interest', 'Assigned To', 'Stage', 'Last Activity', 'Access'].map((heading) => (
                          <th key={heading} className="px-5 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2f7] bg-white">
                      {developmentLeadRows.map((lead) => {
                        const sourceLeadId = normalizeDevelopmentLeadText(lead.sourceLeadId)
                        const canOpenLead = canOpenDevelopmentLead(lead, developmentLeadAccessKeys)
                        const stage = getDevelopmentLeadStagePresentation(lead.leadStatus)
                        const displayName = getDevelopmentLeadDisplayName(lead, canOpenLead)
                        const contactLine = getDevelopmentLeadContactLine(lead, canOpenLead)
                        const assignedLabel = getDevelopmentLeadAssignedLabel(lead, organisationUsers)
                        return (
                          <tr
                            key={lead.developerLeadId || lead.sourceLeadId || `${displayName}-${lead.createdAt}`}
                            className={`transition ${canOpenLead ? 'cursor-pointer hover:bg-[#f8fbff]' : 'bg-white'}`}
                            onClick={() => {
                              if (!canOpenLead || !lead.developerLeadId) return
                              navigate(`/developer/leads/${encodeURIComponent(lead.developerLeadId)}`)
                            }}
                          >
                            <td className="px-5 py-4 align-top">
                              <strong className="block text-sm font-semibold text-[#142132]">{displayName}</strong>
                              <span className="mt-1 block text-xs text-[#6b7d93]">{contactLine}</span>
                            </td>
                            <td className="px-5 py-4 align-top">
                              <span className="block text-sm font-semibold text-[#30485f]">{formatDevelopmentLeadBudget(lead)}</span>
                              <span className="mt-1 block text-xs text-[#6b7d93]">
                                {normalizeDevelopmentLeadText(lead.unitTypeInterest) || 'Unit interest pending'}
                              </span>
                            </td>
                            <td className="px-5 py-4 align-top text-sm text-[#44576d]">{assignedLabel}</td>
                            <td className="px-5 py-4 align-top">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${stage.className}`}>
                                {stage.label}
                              </span>
                            </td>
                            <td className="px-5 py-4 align-top text-sm text-[#44576d]">
                              {formatDate(lead.updatedAt || lead.createdAt)}
                            </td>
                            <td className="px-5 py-4 align-top">
                              {canOpenLead ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe8d8] bg-[#edf9f1] px-3 py-1 text-xs font-semibold text-[#1f7a43]">
                                  Open developer lead
                                  <ArrowUpRight size={12} />
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#64748b]">
                                  <EyeOff size={12} />
                                  {sourceLeadId ? 'Protected' : 'No developer lead link'}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeTab === 'transactions' ? (
        <section className="mt-4">
          <section className={CARD_SHELL}>
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Transactions In This Development</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Create and manage the deal pipeline for this development here. New transactions can only be opened against units still marked as available.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Field type="search" className="min-w-[260px]" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder="Search buyer, unit, or email" />
                <Field as="select" className="min-w-[180px]" value={transactionStageFilter} onChange={(event) => setTransactionStageFilter(event.target.value)}>
                  <option value="all">All stages</option>
                  {Array.from(new Set([
                    ...rows.map((row) => String(row?.transaction?.stage || '').trim()).filter(Boolean),
                    ...DEVELOPMENT_UNIT_STATUS_OPTIONS.map((option) => option.value),
                  ])).map((stage) => (
                    <option key={stage} value={stage}>{toTitleLabel(stage)}</option>
                  ))}
                </Field>
                <Button className="whitespace-nowrap" onClick={openDevelopmentTransactionWizard}>
                  <Plus size={15} />
                  Add Transaction
                </Button>
              </div>
            </div>

            {transactionRows.length ? (
              <div className="overflow-hidden rounded-[18px] border border-[#e3ebf4] bg-white">
                <div className="h-[520px] overflow-y-auto overflow-x-hidden">
                  <table className="w-full table-fixed divide-y divide-[#e8eef5]">
                    <colgroup>
                      <col className="w-[15%]" />
                      <col className="w-[9%]" />
                      <col className="w-[22%]" />
                      <col className="w-[22%]" />
                      <col className="w-[22%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead className="bg-[#f8fafc]">
                      <tr>
                        {['Unit', 'Agency', 'Progress', 'Buyer Name', 'Email', 'Stage'].map((heading) => (
                          <th key={heading} className="sticky top-0 z-10 bg-[#f8fafc] px-4 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2f7] bg-white">
                      {transactionRows.map((row) => {
                        const canOpenTransaction = Boolean(getDevelopmentRecordTransactionId(row) || row.unit?.id)

                        return (
                          <tr
                            key={row.transaction?.id || row.unit?.id}
                            className={`h-[64px] align-middle ${canOpenTransaction ? 'cursor-pointer hover:bg-[#f8fbff]' : ''}`}
                            onClick={() => {
                              if (canOpenTransaction) {
                                openDevelopmentTransactionWorkspace(row)
                              }
                            }}
                          >
                            <td className="px-4 py-3 align-middle">
                              <strong className="block w-full truncate whitespace-nowrap text-left text-sm font-semibold leading-6 text-[#22384c]" title={`Unit ${row.unit?.unit_number || '—'}`}>
                                {`Unit ${row.unit?.unit_number || '—'}`}
                              </strong>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <ResponsibleAgencyBadge agency={row.responsibleAgency} />
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <div className="flex items-center gap-2.5 whitespace-nowrap">
                                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e7edf5]">
                                  <span
                                    className={`block h-full rounded-full ${getTransactionProgressToneClass(row.mainStageKey)}`}
                                    style={{ width: `${Math.max(0, row.progressPercent || 0)}%` }}
                                  />
                                </div>
                                <span className="w-10 text-right text-xs font-semibold text-[#5f748c]">{row.progressPercent}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <strong className="block truncate whitespace-nowrap text-sm font-semibold leading-6 text-[#1f3145]" title={row.buyerDisplayName}>
                                {row.buyerDisplayName}
                              </strong>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <span className="block truncate whitespace-nowrap text-sm leading-6 text-[#556a80]" title={row.buyerEmail}>
                                {row.buyerEmail}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <span
                                className={`inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${getTransactionStagePillClassName(row.mainStageKey)}`}
                                title={row.transaction?.stage || row.unit?.status || 'Available'}
                              >
                                {toTitleLabel(row.transaction?.stage || row.unit?.status || 'available')}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-8 text-center">
                <p className="text-sm text-[#6b7d93]">No transactions for this development yet.</p>
                <div className="mt-4">
                  <Button onClick={openDevelopmentTransactionWizard}>Add Transaction</Button>
                </div>
              </div>
            )}
          </section>
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <form className={CARD_SHELL} onSubmit={handleDocumentSave}>
            <div className="mb-5">
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Development Assets</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Store floorplans, pricing sheets, site plans, marketing assets, and development-wide legal or compliance files.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DetailField label="Document Type">
                <Field as="select" value={documentForm.documentType} onChange={(event) => setDocumentForm((previous) => ({ ...previous, documentType: event.target.value }))}>
                  {DOCUMENT_TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </Field>
              </DetailField>
              <DetailField label="Title">
                <Field value={documentForm.title} onChange={(event) => setDocumentForm((previous) => ({ ...previous, title: event.target.value }))} />
              </DetailField>
              <DetailField label="Description" className="md:col-span-2">
                <Field as="textarea" rows={3} value={documentForm.description} onChange={(event) => setDocumentForm((previous) => ({ ...previous, description: event.target.value }))} />
              </DetailField>
              <DetailField label="File URL / Reference" className="md:col-span-2">
                <Field value={documentForm.fileUrl} onChange={(event) => setDocumentForm((previous) => ({ ...previous, fileUrl: event.target.value }))} placeholder="https://... or internal file reference" />
              </DetailField>
              <DetailField label="Linked Unit">
                <Field as="select" value={documentForm.linkedUnitId} onChange={(event) => setDocumentForm((previous) => ({ ...previous, linkedUnitId: event.target.value }))}>
                  <option value="">No linked unit</option>
                  {unitRows.map((unit) => (
                    <option key={unit.id} value={unit.id}>Unit {unit.unitNumber}</option>
                  ))}
                </Field>
              </DetailField>
              <DetailField label="Linked Unit Type">
                <Field value={documentForm.linkedUnitType} onChange={(event) => setDocumentForm((previous) => ({ ...previous, linkedUnitType: event.target.value }))} />
              </DetailField>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-[#e6edf5] pt-4">
              {documentForm.id ? (
                <Button variant="ghost" onClick={() => setDocumentForm(DEFAULT_DOCUMENT_FORM)} disabled={documentSaving}>
                  Cancel Edit
                </Button>
              ) : null}
              <Button type="submit" disabled={documentSaving}>
                {documentSaving ? 'Saving…' : documentForm.id ? 'Save Asset' : 'Add Asset'}
              </Button>
            </div>
          </form>

          <section className={CARD_SHELL}>
            <div className="mb-5">
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Document Library</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">High-level development documents, floorplans, and shared assets in one place.</p>
            </div>

            {documents.length ? (
              <div className="grid gap-3">
                {documents.map((item) => (
                  <article key={item.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="inline-flex rounded-full border border-[#d7e5f5] bg-white px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#5b7895]">
                          {getDocTypeLabel(item.documentType)}
                        </span>
                        <strong className="mt-2 block text-base font-semibold tracking-[-0.02em] text-[#142132]">{item.title}</strong>
                        <p className="mt-1 text-sm text-[#6b7d93]">{item.description || 'No description added.'}</p>
                      </div>
                      <div className="text-right text-xs text-[#8aa0b8]">
                        {item.linkedUnitId ? `Unit linked` : 'Development file'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.fileUrl ? (
                        <Button variant="secondary" onClick={() => window.open(item.fileUrl, '_blank', 'noopener,noreferrer')}>
                          View
                        </Button>
                      ) : null}
                      <Button
                        variant="secondary"
                        onClick={() => void handleDownloadDocument(item)}
                        disabled={!item.fileUrl || documentDownloadingId === item.id}
                      >
                        <Download size={14} />
                        {documentDownloadingId === item.id ? 'Downloading…' : 'Download'}
                      </Button>
                      <Button variant="secondary" onClick={() => openDocumentEmailComposer(item)} disabled={!item.fileUrl}>
                        <Mail size={14} />
                        Send via Email
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setDocumentForm({
                            id: item.id,
                            documentType: item.documentType,
                            title: item.title,
                            description: item.description || '',
                            fileUrl: item.fileUrl || '',
                            linkedUnitId: item.linkedUnitId || '',
                            linkedUnitType: item.linkedUnitType || '',
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" className="text-[#b42318] hover:bg-[#fff1f1]" onClick={() => void handleDeleteDocument(item.id)} disabled={documentSaving}>
                        Remove
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-8 text-center">
                <p className="text-sm text-[#6b7d93]">No development documents uploaded yet.</p>
              </div>
            )}
          </section>
        </section>
      ) : null}

      {activeTab === 'conveyancing' ? (
        <section className="mt-4 grid gap-4">
          <DevelopmentAttorneyCommercialSetup
            developmentId={data.development.id}
            developmentName={data?.development?.name || ''}
            onSaved={() => {
              void loadData()
            }}
          />
        </section>
      ) : null}

      {activeTab === 'bond_originators' ? (
        <section className="mt-4 grid gap-4">
          {canManageDevelopment ? (
            <DevelopmentBondCommercialSetup
              developmentId={data.development.id}
              onSaved={() => {
                void loadData()
              }}
            />
          ) : (
            <section className={CARD_SHELL}>
              <div className="mb-5">
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Bond Originator Contact</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                  Assigned bond originator and contact details for this development.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Bond Originator', data?.bondConfig?.bondOriginatorName || 'Not assigned'],
                  ['Primary Contact', data?.bondConfig?.primaryContactName || 'Not set'],
                  ['Contact Email', data?.bondConfig?.primaryContactEmail || 'Not set'],
                  ['Contact Phone', data?.bondConfig?.primaryContactPhone || 'Not set'],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-sm font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      ) : null}

      <Modal
        open={emailComposeOpen}
        onClose={emailSending ? undefined : closeDocumentEmailComposer}
        title="Send Document via Email"
        subtitle="Compose an email for the selected development document. Arch9 will prefill the document context and file link."
        className="max-w-[640px]"
      >
        <form className="space-y-4" onSubmit={handleSendDocumentEmail}>
          <div className="rounded-[16px] border border-[#dbe7f3] bg-[#f8fbff] px-4 py-3">
            <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Selected Document</span>
            <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">
              {selectedDocumentForEmail?.title || 'Untitled document'}
            </strong>
            <span className="mt-1 block text-xs text-[#6b7d93]">
              {selectedDocumentForEmail ? getDocTypeLabel(selectedDocumentForEmail.documentType) : 'Document'}
              {selectedDocumentForEmail?.fileUrl ? ` • ${selectedDocumentForEmail.fileUrl}` : ' • No file link set'}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Recipient Email(s)">
              <Field
                value={documentEmailForm.recipientEmail}
                onChange={(event) =>
                  setDocumentEmailForm((previous) => ({ ...previous, recipientEmail: event.target.value }))
                }
                placeholder="name@example.com"
              />
            </DetailField>
            <DetailField label="CC (optional)">
              <Field
                value={documentEmailForm.ccEmail}
                onChange={(event) => setDocumentEmailForm((previous) => ({ ...previous, ccEmail: event.target.value }))}
                placeholder="name@example.com"
              />
            </DetailField>
            <DetailField label="Subject" className="md:col-span-2">
              <Field
                value={documentEmailForm.subject}
                onChange={(event) => setDocumentEmailForm((previous) => ({ ...previous, subject: event.target.value }))}
              />
            </DetailField>
            <DetailField label="Message" className="md:col-span-2">
              <Field
                as="textarea"
                rows={6}
                value={documentEmailForm.message}
                onChange={(event) => setDocumentEmailForm((previous) => ({ ...previous, message: event.target.value }))}
              />
            </DetailField>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#e6edf5] pt-4">
            <Button type="button" variant="ghost" onClick={closeDocumentEmailComposer} disabled={emailSending}>
              Cancel
            </Button>
            <Button type="submit" disabled={emailSending || !selectedDocumentForEmail?.fileUrl}>
              {emailSending ? 'Opening email…' : 'Send via Email'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={externalAgentModalOpen}
        onClose={agentAssignmentsSaving ? undefined : () => setExternalAgentModalOpen(false)}
        title="Add External Agent"
        subtitle="Add a manual team member when they are not an organisation user yet."
        className="max-w-[520px]"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            handleAddManualAgentAssignment()
          }}
        >
          <DetailField label="Name">
            <Field
              value={manualAgentDraft.name}
              disabled={!canManageDevelopment || agentAssignmentsSaving}
              onChange={(event) =>
                setManualAgentDraft((previous) => ({ ...previous, name: event.target.value }))
              }
              placeholder="Agent name"
            />
          </DetailField>
          <DetailField label="Email">
            <Field
              type="email"
              value={manualAgentDraft.email}
              disabled={!canManageDevelopment || agentAssignmentsSaving}
              onChange={(event) =>
                setManualAgentDraft((previous) => ({ ...previous, email: event.target.value }))
              }
              placeholder="agent@email.co.za"
            />
          </DetailField>
          <div className="flex flex-col-reverse gap-3 border-t border-[#e6edf5] pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setExternalAgentModalOpen(false)}
              disabled={agentAssignmentsSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !canManageDevelopment ||
                agentAssignmentsSaving ||
                (!manualAgentDraft.name.trim() && !manualAgentDraft.email.trim())
              }
            >
              Add external agent
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteConfirmOpen}
        onClose={deleteSaving ? undefined : () => setDeleteConfirmOpen(false)}
        title="Delete Development"
        subtitle="This permanently removes the development, its units, and every linked transaction record."
        className="max-w-[520px]"
      >
        <div className="space-y-5">
          <div className="rounded-[18px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm leading-6 text-[#b42318]">
            This will permanently delete <strong>{data.development.name}</strong>, all units, and all linked transactions. This action cannot be undone.
          </div>
          <p className="text-sm leading-6 text-[#6b7d93]">
            Linked workflow, onboarding, document, and discussion records tied to those transactions will be cleaned up as part of deletion.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)} disabled={deleteSaving}>
              Cancel
            </Button>
            <Button onClick={() => void handleDeleteDevelopment()} disabled={deleteSaving} className="bg-[#b42318] text-white hover:bg-[#912018]">
              {deleteSaving ? 'Deleting…' : 'Delete Development'}
            </Button>
          </div>
        </div>
      </Modal>

      {unitModalOpen ? (
        <Drawer
          open={unitModalOpen}
          onClose={() => setUnitModalOpen(false)}
          title={unitForm.id ? `Unit ${unitForm.unitNumber || ''}`.trim() : 'Add Unit'}
          subtitle="Manage stock master details on the right while keeping the units table in context."
          widthClassName="max-w-[680px]"
        >
          <form className="stack-form" onSubmit={handleUnitSave}>
            {selectedUnitRow ? (
              <section className="mb-5 rounded-[18px] border border-[#e3ebf4] bg-[#f8fbff] px-4 py-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <article className="rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-3">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Current Stage</span>
                    <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{selectedUnitRow.transactionStage || selectedUnitRow.status || 'Available'}</strong>
                  </article>
                  <article className="rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-3">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Handover</span>
                    <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{toTitleLabel(selectedUnitRow.handover?.status || 'not_started')}</strong>
                  </article>
                  <article className="rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-3">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Snags</span>
                    <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{getSnagSummaryLabel(selectedUnitRow.snagSummary)}</strong>
                  </article>
                  <article className="rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-3">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Last Updated</span>
                    <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{formatDate(selectedUnitRow.lastUpdated)}</strong>
                  </article>
                </div>
              </section>
            ) : null}

            <div className="wizard-form-grid">
              <label>
                Unit Number
                <Field value={unitForm.unitNumber} onChange={(event) => setUnitForm((previous) => ({ ...previous, unitNumber: event.target.value }))} />
              </label>
              <label>
                Unit Label
                <Field value={unitForm.unitLabel} onChange={(event) => setUnitForm((previous) => ({ ...previous, unitLabel: event.target.value }))} />
              </label>
              <label>
                Phase
                <Field value={unitForm.phase} onChange={(event) => setUnitForm((previous) => ({ ...previous, phase: event.target.value }))} />
              </label>
              <label>
                Block
                <Field value={unitForm.block} onChange={(event) => setUnitForm((previous) => ({ ...previous, block: event.target.value }))} />
              </label>
              <label>
                Unit Type
                <Field value={unitForm.unitType} onChange={(event) => setUnitForm((previous) => ({ ...previous, unitType: event.target.value }))} />
              </label>
              <label>
                Size (sqm)
                <Field type="number" min="0" value={unitForm.sizeSqm} onChange={(event) => setUnitForm((previous) => ({ ...previous, sizeSqm: event.target.value }))} />
              </label>
              <label>
                Bedrooms
                <Field type="number" min="0" value={unitForm.bedrooms} onChange={(event) => setUnitForm((previous) => ({ ...previous, bedrooms: event.target.value }))} />
              </label>
              <label>
                Bathrooms
                <Field type="number" min="0" value={unitForm.bathrooms} onChange={(event) => setUnitForm((previous) => ({ ...previous, bathrooms: event.target.value }))} />
              </label>
              <label>
                Parking
                <Field type="number" min="0" value={unitForm.parkingCount} onChange={(event) => setUnitForm((previous) => ({ ...previous, parkingCount: event.target.value }))} />
              </label>
              <label>
                List Price
                <Field type="number" min="0" value={unitForm.listPrice} onChange={(event) => setUnitForm((previous) => ({ ...previous, listPrice: event.target.value }))} />
              </label>
              <label>
                Sold Price
                <Field type="number" min="0" value={unitForm.currentPrice} onChange={(event) => setUnitForm((previous) => ({ ...previous, currentPrice: event.target.value }))} />
              </label>
              <label>
                Status
                <Field as="select" value={unitForm.status} onChange={(event) => setUnitForm((previous) => ({ ...previous, status: event.target.value }))}>
                  {DEVELOPMENT_UNIT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Field>
              </label>
              <label>
                VAT Applicable
                <Field as="select" value={unitForm.vatApplicable} onChange={(event) => setUnitForm((previous) => ({ ...previous, vatApplicable: event.target.value }))}>
                  <option value="">Not set</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </Field>
              </label>
              <label>
                Linked Floorplan ID
                <Field value={unitForm.floorplanId} onChange={(event) => setUnitForm((previous) => ({ ...previous, floorplanId: event.target.value }))} />
              </label>
              <label className="full-width">
                Notes
                <Field as="textarea" rows={3} value={unitForm.notes} onChange={(event) => setUnitForm((previous) => ({ ...previous, notes: event.target.value }))} />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-bridge-border pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setUnitForm(DEFAULT_UNIT_FORM)
                  setUnitModalOpen(false)
                }}
                disabled={unitSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={unitSaving}>
                {unitSaving ? 'Saving…' : unitForm.id ? 'Save Unit' : 'Add Unit'}
              </Button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {bulkUnitModalOpen ? (
        <Modal
          open={bulkUnitModalOpen}
          onClose={() => setBulkUnitModalOpen(false)}
          title="Add Units In Bulk"
          subtitle="Generate multiple stock master rows in one action. Use the planned-unit gap to populate the development faster."
          className="development-unit-modal max-w-5xl"
        >
          <form className="grid gap-5" onSubmit={handleBulkUnitSave}>
            <section className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
              <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <strong className="block text-[1rem] font-semibold text-[#142132]">Guided stock setup</strong>
                  <p className="mt-1 text-sm leading-6 text-[#5c7289]">
                    Expected units: {formatNumber(expectedUnitCount)}. Current stock rows: {formatNumber(unitRows.length)}. Suggested bulk add: {formatNumber(remainingPlannedUnits || 0)}.
                  </p>
                </div>
                <span className="rounded-full border border-[#d7e5f5] bg-white px-3 py-1 text-xs font-semibold text-[#35546c]">
                  Step {bulkUnitStepIndex + 1} of {BULK_UNIT_STEPS.length}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                {BULK_UNIT_STEPS.map((step, index) => (
                  <div
                    key={step.id}
                    className={`rounded-[14px] border px-3 py-2 text-xs font-semibold ${
                      index === bulkUnitStepIndex
                        ? 'border-[#17764f] bg-[#eaf8f1] text-[#126341]'
                        : index < bulkUnitStepIndex
                          ? 'border-[#cfe8d8] bg-white text-[#1f7a43]'
                          : 'border-[#dbe4ef] bg-white text-[#6b7d93]'
                    }`}
                  >
                    <span className="block text-[0.68rem] uppercase tracking-[0.1em]">Step {index + 1}</span>
                    {step.label}
                  </div>
                ))}
              </div>
            </section>

            {bulkUnitForm.step === 'breakdown' ? (
              <section className="grid gap-4 lg:grid-cols-2">
                {[
                  ['individual', 'Individual Units', 'Paste or type the exact unit numbers. Best when the numbering is already known.'],
                  ['blocks', 'Units In Blocks', 'Use block counts, block labels, and automatic numbering for apartment blocks.'],
                ].map(([value, title, copy]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-[20px] border p-5 text-left transition ${
                      bulkUnitForm.breakdownMode === value
                        ? 'border-[#17764f] bg-[#eef9f3] shadow-[0_12px_26px_rgba(23,118,79,0.12)]'
                        : 'border-[#e3ebf4] bg-white hover:border-[#b9ccdf]'
                    }`}
                    onClick={() => setBulkUnitForm((previous) => ({ ...previous, breakdownMode: value }))}
                  >
                    <strong className="block text-lg font-semibold tracking-[-0.025em] text-[#142132]">{title}</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">{copy}</span>
                  </button>
                ))}
                {bulkUnitForm.breakdownMode === 'blocks' ? (
                  <div className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4 lg:col-span-2">
                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailField label="How Many Blocks?">
                        <Field type="number" min="1" value={bulkUnitForm.blockCount} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, blockCount: event.target.value }))} />
                      </DetailField>
                      <DetailField label="Units Per Block">
                        <Field type="number" min="1" value={bulkUnitForm.unitsPerBlock} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, unitsPerBlock: event.target.value }))} />
                      </DetailField>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {bulkUnitForm.step === 'numbering' ? (
              <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  {bulkUnitForm.breakdownMode === 'blocks' ? (
                    <div className="grid gap-4">
                      <div>
                        <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Block Numbering</h4>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Choose whether unit numbers should include the block letter or run as a plain sequence.</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <DetailField label="Block Labels">
                          <Field value={bulkUnitForm.blockLabels} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, blockLabels: event.target.value }))} placeholder="A, B, C" />
                        </DetailField>
                        <DetailField label="Starting Number">
                          <Field type="number" min="1" value={bulkUnitForm.blockStartNumber} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, blockStartNumber: event.target.value }))} />
                        </DetailField>
                        <DetailField label="Number Style">
                          <Field as="select" value={bulkUnitForm.blockPrefixMode} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, blockPrefixMode: event.target.value }))}>
                            <option value="block">Use block prefix, e.g. A1</option>
                            <option value="none">Plain unit numbers, e.g. 1</option>
                            <option value="custom">Custom prefix</option>
                          </Field>
                        </DetailField>
                        <DetailField label="Zero Padding">
                          <Field as="select" value={bulkUnitForm.padding} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, padding: event.target.value }))}>
                            <option value="0">None</option>
                            <option value="2">2 digits</option>
                            <option value="3">3 digits</option>
                            <option value="4">4 digits</option>
                          </Field>
                        </DetailField>
                        {bulkUnitForm.blockPrefixMode === 'custom' ? (
                          <DetailField label="Custom Prefix" className="md:col-span-2">
                            <Field value={bulkUnitForm.blockCustomPrefix} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, blockCustomPrefix: event.target.value }))} placeholder="BLK-" />
                          </DetailField>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div>
                        <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Individual Unit Numbers</h4>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Enter one unit per line, or separate units with commas.</p>
                      </div>
                      <Field
                        as="textarea"
                        rows={10}
                        value={bulkUnitForm.individualUnitNumbers}
                        onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, individualUnitNumbers: event.target.value }))}
                        placeholder="101&#10;102&#10;103"
                      />
                    </div>
                  )}
                </div>

                <aside className="rounded-[20px] border border-[#e3ebf4] bg-white p-4">
                  <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Number Preview</h4>
                  <div className="mt-3 grid gap-2">
                    {(bulkPreviewRows.length ? bulkPreviewRows.slice(0, 6) : [{ unitNumber: 'Add numbering details' }]).map((row, index) => (
                      <div key={`${row.unitNumber}-${index}`} className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfcfe] px-3 py-2 text-sm font-semibold text-[#142132]">
                        {row.unitNumber}
                      </div>
                    ))}
                    {bulkPreviewRows.length > 6 ? (
                      <div className="rounded-[14px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-3 py-2 text-xs font-semibold text-[#7b8ca2]">
                        + {formatNumber(bulkPreviewRows.length - 6)} more
                      </div>
                    ) : null}
                  </div>
                </aside>
              </section>
            ) : null}

            {bulkUnitForm.step === 'options' ? (
              <section className="grid gap-5">
                <div className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Unit Options</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Select the bedroom types in this development and add a starting price for each.</p>
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {Object.entries(bulkUnitForm.unitOptions || DEFAULT_BULK_UNIT_FORM.unitOptions).map(([optionKey, option]) => (
                      <article key={optionKey} className="rounded-[18px] border border-[#dbe4ef] bg-white p-4">
                        <label className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold text-[#142132]">
                          <span>{option.label}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(option.enabled)}
                            onChange={(event) => updateBulkUnitOption(optionKey, { enabled: event.target.checked })}
                          />
                        </label>
                        <div className="grid gap-3">
                          <Field value={option.unitType} onChange={(event) => updateBulkUnitOption(optionKey, { unitType: event.target.value })} placeholder="Unit type" />
                          <Field type="number" min="0" value={option.listPrice} onChange={(event) => updateBulkUnitOption(optionKey, { listPrice: event.target.value })} placeholder="Starting price" />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailField label="Default Status">
                    <Field as="select" value={bulkUnitForm.status} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, status: event.target.value }))}>
                      {DEVELOPMENT_UNIT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Field>
                  </DetailField>
                  <DetailField label="VAT Applicable">
                    <Field as="select" value={bulkUnitForm.vatApplicable} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, vatApplicable: event.target.value }))}>
                      <option value="">Not set</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </Field>
                  </DetailField>
                </div>
              </section>
            ) : null}

            {bulkUnitForm.step === 'phases' ? (
              <section className="grid gap-5">
                <div className="grid gap-4 lg:grid-cols-2">
                  {[
                    ['single', 'Built Together', 'All generated units share the same phase or no phase.'],
                    ['staged', 'Built In Phases', 'Split generated units across named building phases.'],
                  ].map(([value, title, copy]) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-[20px] border p-5 text-left transition ${
                        bulkUnitForm.phaseMode === value
                          ? 'border-[#17764f] bg-[#eef9f3]'
                          : 'border-[#e3ebf4] bg-white hover:border-[#b9ccdf]'
                      }`}
                      onClick={() => setBulkUnitForm((previous) => ({ ...previous, phaseMode: value }))}
                    >
                      <strong className="block text-lg font-semibold tracking-[-0.025em] text-[#142132]">{title}</strong>
                      <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">{copy}</span>
                    </button>
                  ))}
                </div>
                {bulkUnitForm.phaseMode === 'staged' ? (
                  <DetailField label="Phase Names">
                    <Field as="textarea" rows={4} value={bulkUnitForm.phaseNames} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, phaseNames: event.target.value }))} placeholder="Phase 1&#10;Phase 2" />
                  </DetailField>
                ) : (
                  <DetailField label="Phase Name">
                    <Field value={bulkUnitForm.phase} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, phase: event.target.value }))} placeholder="Optional" />
                  </DetailField>
                )}
              </section>
            ) : null}

            {bulkUnitForm.step === 'review' ? (
              <section className="grid gap-4">
                <div className="rounded-[18px] border border-[#dbe7f3] bg-[#f8fbff] px-4 py-3">
                  <strong className="text-sm font-semibold text-[#142132]">{formatNumber(bulkUnitForm.generatedRows.length)} units ready</strong>
                  <p className="mt-1 text-sm text-[#6b7d93]">Quick edit unit type and price before creating stock rows.</p>
                </div>
                <div className="max-h-[420px] overflow-auto rounded-[20px] border border-[#e3ebf4]">
                  <table className="min-w-full divide-y divide-[#e6edf5] text-sm">
                    <thead className="sticky top-0 bg-[#f8fbff] text-left text-xs uppercase tracking-[0.1em] text-[#6b7d93]">
                      <tr>
                        <th className="px-3 py-3">Unit</th>
                        <th className="px-3 py-3">Block</th>
                        <th className="px-3 py-3">Phase</th>
                        <th className="px-3 py-3">Unit Type</th>
                        <th className="px-3 py-3">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef2f7] bg-white">
                      {bulkUnitForm.generatedRows.map((row, index) => (
                        <tr key={`${row.unitNumber}-${index}`}>
                          <td className="px-3 py-2 font-semibold text-[#142132]">{row.unitNumber}</td>
                          <td className="px-3 py-2 text-[#5d7086]">{row.block || '-'}</td>
                          <td className="px-3 py-2 text-[#5d7086]">{row.phase || '-'}</td>
                          <td className="px-3 py-2">
                            <Field value={row.unitType} onChange={(event) => updateBulkGeneratedRow(index, { unitType: event.target.value })} />
                          </td>
                          <td className="px-3 py-2">
                            <Field type="number" min="0" value={row.listPrice} onChange={(event) => updateBulkGeneratedRow(index, { listPrice: event.target.value })} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <div className="flex items-center justify-end gap-3 border-t border-bridge-border pt-4">
              {bulkUnitStepIndex > 0 ? (
                <Button type="button" variant="secondary" onClick={handleBulkUnitBack} disabled={bulkUnitSaving}>
                  Back
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBulkUnitForm(DEFAULT_BULK_UNIT_FORM)
                  setBulkUnitModalOpen(false)
                }}
                disabled={bulkUnitSaving}
              >
                Cancel
              </Button>
              {bulkUnitForm.step === 'review' ? (
                <Button type="submit" disabled={bulkUnitSaving || !bulkUnitForm.generatedRows.length}>
                  {bulkUnitSaving ? 'Creating…' : 'Create Units'}
                </Button>
              ) : (
                <Button type="button" onClick={handleBulkUnitNext} disabled={bulkUnitSaving}>
                  Next
                </Button>
              )}
            </div>
          </form>
        </Modal>
      ) : null}
      </div>
    </section>
  )
}

export default DevelopmentDetail
