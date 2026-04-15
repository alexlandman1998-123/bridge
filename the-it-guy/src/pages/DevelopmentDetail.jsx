import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Download,
  FolderKanban,
  HandCoins,
  Mail,
  LandPlot,
  MapPin,
  PencilLine,
  PieChart,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Upload,
  Workflow,
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
import {
  DEVELOPER_FUNNEL_STAGES,
  selectActiveTransactions,
  selectDealBottleneckSummary,
  selectFinanceMix,
  selectDevelopmentPerformance,
  selectPortfolioMetrics,
  selectStageDistribution,
} from '../core/transactions/developerSelectors'
import {
  deleteDevelopment,
  deleteDevelopmentDocument,
  fetchDevelopmentDetail,
  fetchDevelopmentDocumentRequirements,
  saveDevelopmentDetails,
  saveDevelopmentDocument,
  saveDevelopmentFinancials,
  saveDevelopmentUnit,
} from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const DEVELOPMENT_TABS = [
  { id: 'details', label: 'Details' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'units', label: 'Units' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'documents', label: 'Documents' },
  { id: 'conveyancing', label: 'Conveyancing' },
  { id: 'bond_originators', label: 'Bond Originators' },
]

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'floorplan', label: 'Floorplan' },
  { value: 'pricing', label: 'Pricing / Sales' },
  { value: 'marketing', label: 'Marketing Asset' },
  { value: 'site_plan', label: 'Site Plan' },
  { value: 'legal', label: 'Development Legal / Compliance' },
  { value: 'specification', label: 'Specification / Finishes' },
  { value: 'other', label: 'Other' },
]

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
      shortTitle: '',
      locationLabel: '',
      address: '',
      suburb: '',
      city: '',
      province: '',
      listingStatus: 'draft',
      listingDescription: '',
      shortDescription: '',
      seoTitle: '',
      seoMetaDescription: '',
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

const MARKETING_PUBLISH_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'live', label: 'Live' },
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
  count: '',
  startNumber: '',
  prefix: '',
  padding: '0',
  phase: '',
  block: '',
  unitType: '',
  listPrice: '',
  status: 'Available',
  vatApplicable: '',
  notes: '',
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

const CARD_SHELL =
  'rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'
const READ_ONLY_FIELD_CLASS =
  'border-[#e3eaf3] bg-[#f8fafd] text-[#1f3347] shadow-none focus:border-[#e3eaf3] focus:ring-0'

function DetailField({ label, className = '', children }) {
  return (
    <label className={`grid gap-2 text-sm font-medium text-[#35546c] ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </label>
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

function normalizeMarketingContentForm(input = null) {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : DEFAULT_DETAILS_FORM.marketing
  const defaults = DEFAULT_DETAILS_FORM.marketing
  const text = (value, fallback = '') => String(value ?? fallback ?? '')
  const bool = (value, fallback = false) => normalizeMarketingBoolean(value, fallback)

  return {
    listingOverview: {
      listingTitle: text(source?.listingOverview?.listingTitle, defaults.listingOverview.listingTitle),
      shortTitle: text(source?.listingOverview?.shortTitle, defaults.listingOverview.shortTitle),
      locationLabel: text(source?.listingOverview?.locationLabel, defaults.listingOverview.locationLabel),
      address: text(source?.listingOverview?.address, defaults.listingOverview.address),
      suburb: text(source?.listingOverview?.suburb, defaults.listingOverview.suburb),
      city: text(source?.listingOverview?.city, defaults.listingOverview.city),
      province: text(source?.listingOverview?.province, defaults.listingOverview.province),
      listingStatus: text(source?.listingOverview?.listingStatus, defaults.listingOverview.listingStatus || 'draft'),
      listingDescription: text(source?.listingOverview?.listingDescription, defaults.listingOverview.listingDescription),
      shortDescription: text(source?.listingOverview?.shortDescription, defaults.listingOverview.shortDescription),
      seoTitle: text(source?.listingOverview?.seoTitle, defaults.listingOverview.seoTitle),
      seoMetaDescription: text(
        source?.listingOverview?.seoMetaDescription,
        defaults.listingOverview.seoMetaDescription,
      ),
    },
    keySellingPoints: {
      keyHighlights: text(source?.keySellingPoints?.keyHighlights, defaults.keySellingPoints.keyHighlights),
      lifestyleSellingPoints: text(
        source?.keySellingPoints?.lifestyleSellingPoints,
        defaults.keySellingPoints.lifestyleSellingPoints,
      ),
      buyerAppealNotes: text(source?.keySellingPoints?.buyerAppealNotes, defaults.keySellingPoints.buyerAppealNotes),
      nearbyAmenitiesSummary: text(
        source?.keySellingPoints?.nearbyAmenitiesSummary,
        defaults.keySellingPoints.nearbyAmenitiesSummary,
      ),
      securityEstateFeatures: text(
        source?.keySellingPoints?.securityEstateFeatures,
        defaults.keySellingPoints.securityEstateFeatures,
      ),
      whyThisDevelopment: text(
        source?.keySellingPoints?.whyThisDevelopment,
        defaults.keySellingPoints.whyThisDevelopment,
      ),
    },
    mediaLibrary: {
      heroImageUrl: text(source?.mediaLibrary?.heroImageUrl, defaults.mediaLibrary.heroImageUrl),
      galleryImageUrls: text(source?.mediaLibrary?.galleryImageUrls, defaults.mediaLibrary.galleryImageUrls),
      developmentLogoUrl: text(source?.mediaLibrary?.developmentLogoUrl, defaults.mediaLibrary.developmentLogoUrl),
      sitePlanUrl: text(source?.mediaLibrary?.sitePlanUrl, defaults.mediaLibrary.sitePlanUrl),
      masterplanUrl: text(source?.mediaLibrary?.masterplanUrl, defaults.mediaLibrary.masterplanUrl),
      floorplanUrls: text(source?.mediaLibrary?.floorplanUrls, defaults.mediaLibrary.floorplanUrls),
      videoUrl: text(source?.mediaLibrary?.videoUrl, defaults.mediaLibrary.videoUrl),
      virtualTourUrl: text(source?.mediaLibrary?.virtualTourUrl, defaults.mediaLibrary.virtualTourUrl),
    },
    downloads: {
      brochureUrl: text(source?.downloads?.brochureUrl, defaults.downloads.brochureUrl),
      pricingSheetUrl: text(source?.downloads?.pricingSheetUrl, defaults.downloads.pricingSheetUrl),
      specSheetUrl: text(source?.downloads?.specSheetUrl, defaults.downloads.specSheetUrl),
      salesPackUrl: text(source?.downloads?.salesPackUrl, defaults.downloads.salesPackUrl),
      investmentPackUrl: text(source?.downloads?.investmentPackUrl, defaults.downloads.investmentPackUrl),
      termsPdfUrl: text(source?.downloads?.termsPdfUrl, defaults.downloads.termsPdfUrl),
      applicationFormUrl: text(source?.downloads?.applicationFormUrl, defaults.downloads.applicationFormUrl),
    },
    externalLinks: {
      developmentLandingPageUrl: text(
        source?.externalLinks?.developmentLandingPageUrl,
        defaults.externalLinks.developmentLandingPageUrl,
      ),
      googleMapsUrl: text(source?.externalLinks?.googleMapsUrl, defaults.externalLinks.googleMapsUrl),
      externalWebsiteUrl: text(source?.externalLinks?.externalWebsiteUrl, defaults.externalLinks.externalWebsiteUrl),
      salesPortalUrl: text(source?.externalLinks?.salesPortalUrl, defaults.externalLinks.salesPortalUrl),
      whatsappEnquiryUrl: text(source?.externalLinks?.whatsappEnquiryUrl, defaults.externalLinks.whatsappEnquiryUrl),
      bookingViewingUrl: text(source?.externalLinks?.bookingViewingUrl, defaults.externalLinks.bookingViewingUrl),
    },
    listingConfiguration: {
      showOnListingWebsite: bool(
        source?.listingConfiguration?.showOnListingWebsite,
        defaults.listingConfiguration.showOnListingWebsite,
      ),
      featuredDevelopment: bool(
        source?.listingConfiguration?.featuredDevelopment,
        defaults.listingConfiguration.featuredDevelopment,
      ),
      displayOrder: text(source?.listingConfiguration?.displayOrder, defaults.listingConfiguration.displayOrder),
      listingSlug: text(source?.listingConfiguration?.listingSlug, defaults.listingConfiguration.listingSlug),
      ctaLabel: text(source?.listingConfiguration?.ctaLabel, defaults.listingConfiguration.ctaLabel),
      ctaUrl: text(source?.listingConfiguration?.ctaUrl, defaults.listingConfiguration.ctaUrl),
      marketingStatus: text(source?.listingConfiguration?.marketingStatus, defaults.listingConfiguration.marketingStatus),
      publicVisibility: bool(
        source?.listingConfiguration?.publicVisibility,
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
    locationLabel: base.listingOverview.locationLabel || profile?.location || development?.location || '',
    address: base.listingOverview.address || profile?.address || '',
    suburb: base.listingOverview.suburb || profile?.suburb || development?.suburb || '',
    city: base.listingOverview.city || profile?.city || development?.city || '',
    province: base.listingOverview.province || profile?.province || development?.province || '',
    listingDescription: base.listingOverview.listingDescription || profile?.description || development?.description || '',
    listingStatus: base.listingOverview.listingStatus || 'draft',
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
  ])

  const sitePlans = dedupe([
    marketing.mediaLibrary.sitePlanUrl,
    marketing.mediaLibrary.masterplanUrl,
    ...textareaToList(marketing.mediaLibrary.floorplanUrls),
  ])

  const plans = dedupe([
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

  return {
    description: marketing.listingOverview.listingDescription,
    plans,
    sitePlans,
    imageLinks,
    supportingDocuments,
    marketingContent: marketing,
  }
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function buildTransactionReference(transactionId) {
  const normalized = String(transactionId || '').replaceAll('-', '').slice(0, 8).toUpperCase()
  return normalized ? `TRX-${normalized}` : 'Pending'
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

function getPhasePillClassName(phase) {
  return phase
    ? 'border border-[#dbe7f3] bg-[#f8fbff] text-[#35546c]'
    : 'border border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
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

function resolveUnitStructureLabel(unit = {}, structureMode = 'none') {
  const phase = String(unit?.phase || '').trim()
  const block = String(unit?.block || '').trim()

  if (structureMode === 'phase_and_block') {
    return [phase, block].filter(Boolean).join(' / ') || 'Not set'
  }

  if (structureMode === 'phase') {
    return phase || 'Not set'
  }

  if (structureMode === 'block') {
    return block || 'Not set'
  }

  return ''
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
    address: profile.address || '',
    status: profile.status || development.status || 'active',
    developerCompany: profile.developerCompany || development.developer_company || '',
    totalUnitsExpected:
      development.total_units_expected ?? development.planned_units ?? data?.stats?.totalUnits ?? 0,
    launchDate: normalizeDateInput(profile.launchDate || development.launch_date),
    expectedCompletionDate: normalizeDateInput(profile.expectedCompletionDate || development.expected_completion_date),
    description: marketing.listingOverview.listingDescription || profile.description || development.description || '',
    marketing,
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
      nextAction: row.report?.nextStep || row.transaction?.next_action || 'No next action captured',
    }))
}

function DevelopmentDetail() {
  const navigate = useNavigate()
  const { developmentId } = useParams()
  const { role } = useWorkspace()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('details')
  const [detailsForm, setDetailsForm] = useState(DEFAULT_DETAILS_FORM)
  const [financialsForm, setFinancialsForm] = useState(DEFAULT_FINANCIALS_FORM)
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
  const [unitDrafts, setUnitDrafts] = useState({})
  const [unitModalOpen, setUnitModalOpen] = useState(false)
  const [bulkUnitModalOpen, setBulkUnitModalOpen] = useState(false)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [financialsSaving, setFinancialsSaving] = useState(false)
  const [isEditingDetailsSection, setIsEditingDetailsSection] = useState(false)
  const [isEditingFinancialsSection, setIsEditingFinancialsSection] = useState(false)
  const [unitSaving, setUnitSaving] = useState(false)
  const [bulkUnitSaving, setBulkUnitSaving] = useState(false)
  const [documentSaving, setDocumentSaving] = useState(false)
  const [documentDownloadingId, setDocumentDownloadingId] = useState('')
  const [emailComposeOpen, setEmailComposeOpen] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [selectedDocumentForEmail, setSelectedDocumentForEmail] = useState(null)
  const [documentEmailForm, setDocumentEmailForm] = useState(DEFAULT_DOCUMENT_EMAIL_FORM)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  const canManageDevelopment = role === 'developer' || role === 'internal_admin'
  const canCreateTransactions = canManageDevelopment || role === 'attorney'

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
    setIsEditingDetailsSection(false)
    setIsEditingFinancialsSection(false)
  }, [data])

  const rows = useMemo(() => data?.rows || [], [data?.rows])
  const documents = useMemo(() => data?.documents || [], [data?.documents])
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

  useEffect(() => {
    setUnitDrafts(
      Object.fromEntries(
        rows.map((row) => [
          row?.unit?.id,
          {
            listPrice: row?.unit?.listPrice ?? row?.unit?.price ?? '',
            currentPrice: row?.unit?.currentPrice ?? '',
            status: row?.unit?.status || 'Available',
            phase: row?.unit?.phase || '',
          },
        ]),
      ),
    )
  }, [rows])
  const totalListedStockValue = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row?.unit?.list_price || row?.unit?.price || row?.unit?.listPrice || 0), 0),
    [rows],
  )

  const availableStockValue = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const hasTransaction = Boolean(row?.transaction?.id)
        const unitStatus = String(row?.unit?.status || '').toLowerCase()
        if (hasTransaction || (unitStatus && unitStatus !== 'available')) {
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
      const unitStatus = String(row?.unit?.status || '')
        .trim()
        .toLowerCase()

      if (unitIdKey) {
        allUnitIds.add(unitIdKey)
        if (unitStatus === 'available') {
          availableUnitIds.add(unitIdKey)
        }
      }

      const transaction = row?.transaction
      if (!transaction) {
        continue
      }

      const mainStageKey = resolveTransactionMainStage(row)
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
    const soldPercent = totalUnits > 0 ? (registeredUnitIds.size / totalUnits) * 100 : 0

    return [
      { label: 'Available', value: formatNumber(availableUnitIds.size), icon: LandPlot },
      { label: 'In Progress', value: formatNumber(inProgressUnitIds.size), icon: Workflow },
      { label: 'Pipeline', value: currency.format(pipelineValue), icon: Receipt },
      { label: 'Revenue Secured', value: currency.format(revenueSecuredValue), icon: CircleDollarSign },
      { label: '% Sold', value: formatPercent(soldPercent), icon: TrendingUp },
    ]
  }, [data?.stats?.totalUnits, rows])

  const developmentMetrics = useMemo(() => selectPortfolioMetrics(rows, { totalDevelopmentsOverride: 1 }), [rows])
  const developmentStageDistribution = useMemo(() => selectStageDistribution(rows), [rows])
  const developmentBottleneckSummary = useMemo(() => selectDealBottleneckSummary(rows), [rows])
  const developmentPerformance = useMemo(() => selectDevelopmentPerformance(rows)[0] || null, [rows])
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
    const scopedUnits =
      unitStatusFilter === 'all'
        ? [...unitRows]
        : unitRows.filter((unit) => String(unit?.status || '').toLowerCase() === unitStatusFilter)

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
        if (!row?.transaction?.id || !row?.unit?.id) {
          return false
        }

        const searchHaystack = `${row?.unit?.unit_number || ''} ${row?.buyer?.name || ''} ${row?.buyer?.email || ''}`.toLowerCase()
        const matchesSearch = !transactionSearch.trim() || searchHaystack.includes(transactionSearch.trim().toLowerCase())
        const matchesStage = transactionStageFilter === 'all' || String(row?.transaction?.stage || '').toLowerCase() === transactionStageFilter
        return matchesSearch && matchesStage
      })
      .map((row) => {
        const mainStageKey = resolveTransactionMainStage(row)
        return {
          ...row,
          mainStageKey,
          progressPercent: getTransactionProgressPercent(row),
          buyerDisplayName: row?.buyer?.name || 'No buyer assigned',
          buyerEmail: row?.buyer?.email || 'No email',
        }
      })
  }, [rows, transactionSearch, transactionStageFilter])
  const selectedUnitRow = useMemo(
    () => unitRows.find((unit) => unit.id === unitForm.id) || null,
    [unitForm.id, unitRows],
  )
  const featuredActiveRows = useMemo(() => selectActiveTransactions(rows).slice(0, 8), [rows])
  const marketingForm = useMemo(() => normalizeMarketingContentForm(detailsForm.marketing), [detailsForm.marketing])
  const marketingReadinessSummary = useMemo(() => {
    const galleryImagesCount =
      textareaToList(marketingForm.mediaLibrary.galleryImageUrls).length + (marketingForm.mediaLibrary.heroImageUrl ? 1 : 0)
    const highlightsCount =
      textareaToList(marketingForm.keySellingPoints.keyHighlights).length +
      textareaToList(marketingForm.keySellingPoints.lifestyleSellingPoints).length +
      textareaToList(marketingForm.keySellingPoints.buyerAppealNotes).length +
      textareaToList(marketingForm.keySellingPoints.nearbyAmenitiesSummary).length +
      textareaToList(marketingForm.keySellingPoints.securityEstateFeatures).length +
      textareaToList(marketingForm.keySellingPoints.whyThisDevelopment).length
    const downloadsCount = [
      marketingForm.downloads.brochureUrl,
      marketingForm.downloads.pricingSheetUrl,
      marketingForm.downloads.specSheetUrl,
      marketingForm.downloads.salesPackUrl,
      marketingForm.downloads.investmentPackUrl,
      marketingForm.downloads.termsPdfUrl,
      marketingForm.downloads.applicationFormUrl,
    ].filter(Boolean).length
    const descriptionStatus = String(marketingForm.listingOverview.listingDescription || '').trim()
      ? 'Written'
      : 'Not written'

    return {
      descriptionStatus,
      galleryImagesCount,
      highlightsCount,
      downloadsCount,
      listingStatus: marketingForm.listingConfiguration.marketingStatus || 'draft',
    }
  }, [marketingForm])

  const locationLine = [detailsForm.location, detailsForm.suburb || detailsForm.city || detailsForm.province].filter(Boolean).join(' • ')
  const detailsFieldClassName = isEditingDetailsSection ? '' : READ_ONLY_FIELD_CLASS
  const financialFieldClassName = isEditingFinancialsSection ? '' : READ_ONLY_FIELD_CLASS

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
  const averageSecuredUnitValue = developmentMetrics.unitsRegistered > 0 ? revenueSecured / developmentMetrics.unitsRegistered : 0
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
        meta: `${formatNumber(developmentMetrics.dealsInProgress || 0)} deals still in flight`,
        icon: Workflow,
      },
      {
        label: 'Revenue At Risk',
        value: currency.format(revenueAtRisk || 0),
        meta: `${formatNumber(developmentMetrics.unitsAvailable || 0)} units still to convert`,
        icon: AlertTriangle,
      },
    ],
    [
      developmentMetrics.dealsInProgress,
      developmentMetrics.pipelineValue,
      developmentMetrics.unitsAvailable,
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
        value: `${(developmentPerformance?.sellThroughPercent || 0).toFixed(1)}%`,
        meta: `${formatNumber(developmentMetrics.unitsSold || 0)} sold or committed`,
      },
      {
        label: 'Available Stock Value',
        value: currency.format(availableStockValue || 0),
        meta: `${formatNumber(developmentMetrics.unitsAvailable || 0)} units still unsold`,
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
        value: currency.format((Number(data?.attorneyConfig?.defaultFeeAmount || 0) || 0) * (developmentMetrics.unitsRegistered || 0)),
        meta: `${formatNumber(developmentMetrics.unitsRegistered || 0)} registered transactions`,
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
      developmentMetrics.unitsAvailable,
      developmentMetrics.unitsRegistered,
      developmentMetrics.unitsSold,
      developmentPerformance?.sellThroughPercent,
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

    if (developmentMetrics.totalUnits > 0 && (developmentMetrics.unitsAvailable / developmentMetrics.totalUnits) * 100 > 45) {
      items.push({
        title: 'Large unsold inventory remains',
        body: `${formatNumber(developmentMetrics.unitsAvailable)} of ${formatNumber(developmentMetrics.totalUnits)} units are still available. Check pricing, launch pacing, and broker focus.`,
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
    developmentMetrics.totalUnits,
    developmentMetrics.unitsAvailable,
    effectiveTargetMargin,
    financeMix.bondShare,
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

  function buildDevelopmentDetailsPayload() {
    const marketingLegacyPayload = getMarketingLegacyPayload(detailsForm.marketing)
    const marketingOverview = marketingLegacyPayload.marketingContent.listingOverview

    return {
      ...detailsForm,
      location: marketingOverview.locationLabel || detailsForm.location,
      address: marketingOverview.address || detailsForm.address,
      suburb: marketingOverview.suburb || detailsForm.suburb,
      city: marketingOverview.city || detailsForm.city,
      province: marketingOverview.province || detailsForm.province,
      description: marketingLegacyPayload.description || detailsForm.description,
      plans: marketingLegacyPayload.plans,
      sitePlans: marketingLegacyPayload.sitePlans,
      imageLinks: marketingLegacyPayload.imageLinks,
      supportingDocuments: marketingLegacyPayload.supportingDocuments,
      marketingContent: marketingLegacyPayload.marketingContent,
    }
  }

  async function handleDetailsSave(event) {
    event.preventDefault()
    if (!isEditingDetailsSection) {
      return
    }
    try {
      setDetailsSaving(true)
      setFeedback('')
      await saveDevelopmentDetails(data.development.id, buildDevelopmentDetailsPayload())
      setFeedback('Development details updated.')
      setIsEditingDetailsSection(false)
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

  function handleCancelDetailsEdit() {
    if (data) {
      setDetailsForm(buildDetailsForm(data))
    }
    setIsEditingDetailsSection(false)
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
      'Sent via Bridge.',
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

  async function handleUnitRowSave(unit) {
    const draft = unitDrafts[unit.id] || {}

    try {
      setUnitSaving(true)
      setFeedback('')
      await saveDevelopmentUnit({
        ...buildUnitForm(unit),
        id: unit.id,
        developmentId: data.development.id,
        unitNumber: unit.unitNumber,
        unitLabel: unit.unitLabel || '',
        block: unit.block || '',
        unitType: unit.unitType || '',
        bedrooms: unit.bedrooms ?? null,
        bathrooms: unit.bathrooms ?? null,
        parkingCount: unit.parkingCount ?? null,
        sizeSqm: unit.sizeSqm ?? null,
        floorplanId: unit.floorplanId || null,
        notes: unit.notes || '',
        phase: draft.phase ?? unit.phase ?? '',
        status: draft.status ?? unit.status ?? 'Available',
        listPrice: draft.listPrice === '' ? 0 : draft.listPrice,
        currentPrice: draft.currentPrice === '' ? null : draft.currentPrice,
        vatApplicable: unit.vatApplicable ?? null,
      })
      setFeedback(`Unit ${unit.unitNumber} pricing updated.`)
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setUnitSaving(false)
    }
  }

  function openUnitModal(unit = null) {
    setUnitForm(buildUnitForm(unit))
    setUnitModalOpen(true)
  }

  function openDevelopmentTransactionWizard() {
    window.dispatchEvent(
      new CustomEvent('itg:open-new-transaction', {
        detail: { initialDevelopmentId: data?.development?.id || developmentId },
      }),
    )
  }

  function openBulkUnitModal() {
    setBulkUnitForm({
      ...DEFAULT_BULK_UNIT_FORM,
      count: remainingPlannedUnits > 0 ? String(remainingPlannedUnits) : '',
      startNumber: String(suggestedBulkStartNumber),
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

  async function handleBulkUnitSave(event) {
    event.preventDefault()

    const count = Math.trunc(Number(bulkUnitForm.count || 0))
    const startNumber = Math.trunc(Number(bulkUnitForm.startNumber || 0))
    const padding = Math.max(0, Math.trunc(Number(bulkUnitForm.padding || 0)))
    const prefix = String(bulkUnitForm.prefix || '')

    if (!count || count < 1) {
      setError('Enter how many units to create.')
      return
    }

    if (!startNumber || startNumber < 1) {
      setError('Enter a valid starting unit number.')
      return
    }

    const generatedNumbers = Array.from({ length: count }, (_, index) => `${prefix}${String(startNumber + index).padStart(padding, '0')}`)
    const existingNumbers = new Set(
      unitRows.map((unit) => String(unit?.unitNumber || unit?.unit_number || '').trim().toLowerCase()).filter(Boolean),
    )
    const duplicateGenerated = generatedNumbers.find((value, index) => generatedNumbers.indexOf(value) !== index)
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
        generatedNumbers.map((unitNumber) =>
          saveDevelopmentUnit({
            developmentId: data.development.id,
            unitNumber,
            unitLabel: unitNumber,
            phase: bulkUnitForm.phase,
            block: bulkUnitForm.block,
            unitType: bulkUnitForm.unitType,
            listPrice: bulkUnitForm.listPrice === '' ? 0 : bulkUnitForm.listPrice,
            currentPrice: null,
            status: bulkUnitForm.status || 'Available',
            vatApplicable: bulkUnitForm.vatApplicable === '' ? null : bulkUnitForm.vatApplicable === 'true',
            notes: bulkUnitForm.notes,
          }),
        ),
      )

      setFeedback(`${formatNumber(count)} units added to development.`)
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
      <section className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} />
          Refresh
        </Button>
        <Button onClick={() => navigate('/developments')}>
          <ArrowLeft size={14} />
          Back to developments
        </Button>
      </section>

      {error ? <p className="mt-4 rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p> : null}
      {feedback ? <p className="mt-4 rounded-[16px] border border-[#d6ece0] bg-[#edfdf3] px-5 py-4 text-sm text-[#1c7d45]">{feedback}</p> : null}

      <section className="mt-5 rounded-[24px] border border-[#dde4ee] bg-white p-5 sm:p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="min-w-0">
              <h1 className="text-[2.25rem] font-semibold tracking-[-0.04em] text-[#142132]">{data.development.name}</h1>
              <p className="mt-4 text-[1rem] text-[#6b7d93]">
                {locationLine || 'Location pending'}
                {detailsForm.address ? ` • ${detailsForm.address}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end xl:justify-end">
              <Button asChild variant="secondary">
                <Link to={`/m/developments/${developmentId}`}>
                  <ArrowUpRight size={15} />
                  Mobile Executive View
                </Link>
              </Button>
              {canCreateTransactions ? (
                <Button onClick={openDevelopmentTransactionWizard}>
                  <HandCoins size={15} />
                  Add Transaction
                </Button>
              ) : null}
              <Button onClick={() => setActiveTab('documents')}>
                <Upload size={15} />
                Upload Asset
              </Button>
            </div>
          </div>

          {canManageDevelopment ? (
            <div className="border-t border-[#e6edf5] pt-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" className="px-4" onClick={() => setActiveTab('details')}>
                    <PencilLine size={15} />
                    Edit Development
                  </Button>
                  <Button variant="ghost" className="px-4" onClick={() => setActiveTab('units')}>
                    <Plus size={15} />
                    Add Unit
                  </Button>
                </div>
                <div className="flex justify-start sm:justify-end">
                  <Button variant="ghost" className="px-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setDeleteConfirmOpen(true)}>
                    Delete Development
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-4 rounded-[24px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="grid gap-3 lg:grid-cols-5">
          {summaryItems.map((item) => {
            const Icon = item.icon
            return (
              <article
                key={item.label}
                className="rounded-[18px] border border-[#dde4ee] bg-white px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
              >
                <div className="mb-2.5 flex items-start justify-between gap-3">
                  <span className="text-[0.95rem] font-medium tracking-[-0.01em] text-[#3b4f65]">{item.label}</span>
                  {Icon ? <Icon size={18} className="text-[#94a3b8]" aria-hidden="true" /> : null}
                </div>
                <strong className="block text-[1.7rem] font-semibold leading-none tracking-[-0.035em] text-[#142132]">
                  {item.value}
                </strong>
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
                        onClick={() =>
                          navigate(`/units/${row.unitId}`, {
                            state: { headerTitle: `Unit ${row.unitNumber || 'Workspace'}` },
                          })
                        }
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
                <Button variant="ghost" onClick={() => setActiveTab('documents')}>
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

      {activeTab === 'details' ? (
        <section className="mt-4 grid gap-4">
          <div className={`grid gap-4 ${canManageDevelopment ? 'xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]' : ''}`}>
            <form className={CARD_SHELL} onSubmit={handleDetailsSave}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">General Details</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Master development information inherited by downstream units and transactions.</p>
                </div>
                {!isEditingDetailsSection ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEditingDetailsSection(true)}
                    className="shrink-0"
                  >
                    <PencilLine size={14} />
                    Edit Section
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={handleCancelDetailsEdit}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={detailsSaving}>
                      {detailsSaving ? 'Saving…' : 'Save Changes'}
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DetailField label="Development Name">
                  <Field
                    value={detailsForm.name}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, name: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Development Code">
                  <Field
                    value={detailsForm.code}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, code: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Location">
                  <Field
                    value={detailsForm.location}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, location: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Suburb">
                  <Field
                    value={detailsForm.suburb}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, suburb: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="City">
                  <Field
                    value={detailsForm.city}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, city: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Province">
                  <Field
                    value={detailsForm.province}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, province: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Country">
                  <Field
                    value={detailsForm.country}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, country: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Developer Company">
                  <Field
                    value={detailsForm.developerCompany}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, developerCompany: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Status">
                  <Field
                    as="select"
                    value={detailsForm.status}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, status: event.target.value }))}
                  >
                    {DEVELOPMENT_STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Field>
                </DetailField>
                <DetailField label="Expected Units">
                  <Field
                    type="number"
                    min="0"
                    value={detailsForm.totalUnitsExpected}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, totalUnitsExpected: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Launch Date">
                  <Field
                    type="date"
                    value={detailsForm.launchDate}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, launchDate: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Expected Completion">
                  <Field
                    type="date"
                    value={detailsForm.expectedCompletionDate}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, expectedCompletionDate: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Address" className="md:col-span-2">
                  <Field
                    value={detailsForm.address}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, address: event.target.value }))}
                  />
                </DetailField>
                <DetailField label="Description" className="md:col-span-2">
                  <Field
                    as="textarea"
                    rows={4}
                    value={detailsForm.description}
                    disabled={!isEditingDetailsSection}
                    className={detailsFieldClassName}
                    onChange={(event) => setDetailsForm((previous) => ({ ...previous, description: event.target.value }))}
                  />
                </DetailField>
              </div>

              {canManageDevelopment ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ['Handover Enabled', 'Enable unit handover after registration.', detailsForm.handoverEnabled, 'handoverEnabled'],
                    ['Snag Tracking', 'Allow snag logging and post-handover support.', detailsForm.snagTrackingEnabled, 'snagTrackingEnabled'],
                    ['Alterations', 'Enable owner alteration requests for this project.', detailsForm.alterationsEnabled, 'alterationsEnabled'],
                    ['Client Onboarding', 'Enable transaction onboarding by default.', detailsForm.onboardingEnabled, 'onboardingEnabled'],
                  ].map(([title, copy, checked, key]) => (
                    <label key={key} className="flex items-start justify-between gap-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                      <div className="min-w-0">
                        <strong className="block text-sm font-semibold text-[#142132]">{title}</strong>
                        <span className="mt-1 block text-xs leading-5 text-[#6b7d93]">{copy}</span>
                      </div>
                      {isEditingDetailsSection ? (
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-[#c7d6e5] text-[#35546c] focus:ring-[#35546c]"
                          checked={Boolean(checked)}
                          onChange={(event) => setDetailsForm((previous) => ({ ...previous, [key]: event.target.checked }))}
                        />
                      ) : (
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                            checked
                              ? 'border-[#cde8d8] bg-[#eef9f2] text-[#1c7d45]'
                              : 'border-[#dce5ef] bg-[#f7f9fc] text-[#6b7d93]'
                          }`}
                        >
                          {checked ? 'Enabled' : 'Disabled'}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              ) : null}

              {!isEditingDetailsSection ? (
                <div className="mt-5 border-t border-[#e6edf5] pt-4 text-xs font-medium text-[#7b8ca2]">
                  Viewing mode. Use the pencil icon to edit this section.
                </div>
              ) : null}
            </form>

            {canManageDevelopment ? (
            <form className={CARD_SHELL} onSubmit={handleFinancialsSave}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Commercial / Financial Details</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Set the budget assumptions here. The live commercial read sits underneath, so this form stays focused on inputs only.</p>
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

          {canManageDevelopment ? (
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
        </section>
      ) : null}

      {activeTab === 'marketing' ? (
        <section className="mt-4">
          <form className={`${CARD_SHELL} space-y-5`} onSubmit={handleMarketingSave}>
            <div>
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Development Marketing CMS</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                Capture listing content, media, assets, and publishing controls in one place so this development is ready for the public listings platform.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ['Listing Description', marketingReadinessSummary.descriptionStatus],
                ['Gallery Images', `${marketingReadinessSummary.galleryImagesCount} saved`],
                ['Highlights', `${marketingReadinessSummary.highlightsCount} saved`],
                ['Downloads', `${marketingReadinessSummary.downloadsCount} saved`],
                ['Listing Status', toTitleLabel(marketingReadinessSummary.listingStatus)],
              ].map(([label, value]) => (
                <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                  <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                  <strong className="mt-2 block text-sm font-semibold text-[#142132]">{value}</strong>
                </article>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
              <div className="grid gap-4">
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">Listing Overview</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Core listing identity, location, and long-form marketing copy for the public listing page.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Listing Title">
                      <Field
                        value={marketingForm.listingOverview.listingTitle}
                        onChange={(event) => setMarketingField('listingOverview', 'listingTitle', event.target.value)}
                        placeholder="Junoah Estate"
                      />
                    </DetailField>
                    <DetailField label="Short Title / Display Name">
                      <Field
                        value={marketingForm.listingOverview.shortTitle}
                        onChange={(event) => setMarketingField('listingOverview', 'shortTitle', event.target.value)}
                        placeholder="Junoah"
                      />
                    </DetailField>
                    <DetailField label="Location Label">
                      <Field
                        value={marketingForm.listingOverview.locationLabel}
                        onChange={(event) => setMarketingField('listingOverview', 'locationLabel', event.target.value)}
                        placeholder="Bartlett, Boksburg"
                      />
                    </DetailField>
                    <DetailField label="Address">
                      <Field
                        value={marketingForm.listingOverview.address}
                        onChange={(event) => setMarketingField('listingOverview', 'address', event.target.value)}
                        placeholder="123 Example Street"
                      />
                    </DetailField>
                    <DetailField label="Suburb">
                      <Field
                        value={marketingForm.listingOverview.suburb}
                        onChange={(event) => setMarketingField('listingOverview', 'suburb', event.target.value)}
                        placeholder="Bartlett"
                      />
                    </DetailField>
                    <DetailField label="City">
                      <Field
                        value={marketingForm.listingOverview.city}
                        onChange={(event) => setMarketingField('listingOverview', 'city', event.target.value)}
                        placeholder="Boksburg"
                      />
                    </DetailField>
                    <DetailField label="Province">
                      <Field
                        value={marketingForm.listingOverview.province}
                        onChange={(event) => setMarketingField('listingOverview', 'province', event.target.value)}
                        placeholder="Gauteng"
                      />
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
                    <DetailField label="Listing Description" className="md:col-span-2">
                      <Field
                        as="textarea"
                        rows={7}
                        value={marketingForm.listingOverview.listingDescription}
                        onChange={(event) =>
                          setMarketingField('listingOverview', 'listingDescription', event.target.value)
                        }
                        placeholder="Describe positioning, buyer appeal, and the value proposition of the development."
                      />
                    </DetailField>
                    <DetailField label="Short Description / Summary" className="md:col-span-2">
                      <Field
                        as="textarea"
                        rows={3}
                        value={marketingForm.listingOverview.shortDescription}
                        onChange={(event) =>
                          setMarketingField('listingOverview', 'shortDescription', event.target.value)
                        }
                        placeholder="One short paragraph for listing cards and quick summaries."
                      />
                    </DetailField>
                    <DetailField label="SEO Title">
                      <Field
                        value={marketingForm.listingOverview.seoTitle}
                        onChange={(event) => setMarketingField('listingOverview', 'seoTitle', event.target.value)}
                        placeholder="Junoah Estate | Modern Secure Living"
                      />
                    </DetailField>
                    <DetailField label="SEO Meta Description">
                      <Field
                        as="textarea"
                        rows={3}
                        value={marketingForm.listingOverview.seoMetaDescription}
                        onChange={(event) =>
                          setMarketingField('listingOverview', 'seoMetaDescription', event.target.value)
                        }
                        placeholder="Search snippet description for the public listing page."
                      />
                    </DetailField>
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">Key Selling Points</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Capture marketing hooks and buyer-focused talking points. Use one bullet per line where relevant.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Key Highlights">
                      <Field
                        as="textarea"
                        rows={5}
                        value={marketingForm.keySellingPoints.keyHighlights}
                        onChange={(event) => setMarketingField('keySellingPoints', 'keyHighlights', event.target.value)}
                        placeholder={'Secure estate access\nLow levies\nHigh rental demand'}
                      />
                    </DetailField>
                    <DetailField label="Lifestyle Selling Points">
                      <Field
                        as="textarea"
                        rows={5}
                        value={marketingForm.keySellingPoints.lifestyleSellingPoints}
                        onChange={(event) =>
                          setMarketingField('keySellingPoints', 'lifestyleSellingPoints', event.target.value)
                        }
                        placeholder={'Family friendly environment\nOutdoor spaces\nConvenient access routes'}
                      />
                    </DetailField>
                    <DetailField label="Buyer Appeal / Ideal Buyer Notes">
                      <Field
                        as="textarea"
                        rows={4}
                        value={marketingForm.keySellingPoints.buyerAppealNotes}
                        onChange={(event) =>
                          setMarketingField('keySellingPoints', 'buyerAppealNotes', event.target.value)
                        }
                        placeholder="Who this development is best suited for."
                      />
                    </DetailField>
                    <DetailField label="Nearby Amenities Summary">
                      <Field
                        as="textarea"
                        rows={4}
                        value={marketingForm.keySellingPoints.nearbyAmenitiesSummary}
                        onChange={(event) =>
                          setMarketingField('keySellingPoints', 'nearbyAmenitiesSummary', event.target.value)
                        }
                        placeholder="Schools, retail, medical facilities, and transport access."
                      />
                    </DetailField>
                    <DetailField label="Security / Estate Features">
                      <Field
                        as="textarea"
                        rows={4}
                        value={marketingForm.keySellingPoints.securityEstateFeatures}
                        onChange={(event) =>
                          setMarketingField('keySellingPoints', 'securityEstateFeatures', event.target.value)
                        }
                        placeholder="Guardhouse, access control, CCTV, perimeter features."
                      />
                    </DetailField>
                    <DetailField label="Why This Development">
                      <Field
                        as="textarea"
                        rows={4}
                        value={marketingForm.keySellingPoints.whyThisDevelopment}
                        onChange={(event) =>
                          setMarketingField('keySellingPoints', 'whyThisDevelopment', event.target.value)
                        }
                        placeholder="Optional summary paragraph for sales and listing page use."
                      />
                    </DetailField>
                  </div>
                </section>
              </div>

              <div className="grid gap-4">
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">Media Library</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Structured media fields for listing cards, gallery modules, plans, and interactive media.
                    </p>
                  </div>
                  <div className="grid gap-4">
                    <DetailField label="Hero Image URL">
                      <Field
                        value={marketingForm.mediaLibrary.heroImageUrl}
                        onChange={(event) => setMarketingField('mediaLibrary', 'heroImageUrl', event.target.value)}
                        placeholder="https://.../hero.jpg"
                      />
                    </DetailField>
                    <DetailField label="Gallery Image URLs (one per line)">
                      <Field
                        as="textarea"
                        rows={4}
                        value={marketingForm.mediaLibrary.galleryImageUrls}
                        onChange={(event) => setMarketingField('mediaLibrary', 'galleryImageUrls', event.target.value)}
                        placeholder={'https://.../gallery-01.jpg\nhttps://.../gallery-02.jpg'}
                      />
                    </DetailField>
                    <DetailField label="Development Logo URL">
                      <Field
                        value={marketingForm.mediaLibrary.developmentLogoUrl}
                        onChange={(event) => setMarketingField('mediaLibrary', 'developmentLogoUrl', event.target.value)}
                        placeholder="https://.../logo.png"
                      />
                    </DetailField>
                    <DetailField label="Site Plan URL">
                      <Field
                        value={marketingForm.mediaLibrary.sitePlanUrl}
                        onChange={(event) => setMarketingField('mediaLibrary', 'sitePlanUrl', event.target.value)}
                        placeholder="https://.../site-plan.pdf"
                      />
                    </DetailField>
                    <DetailField label="Masterplan URL">
                      <Field
                        value={marketingForm.mediaLibrary.masterplanUrl}
                        onChange={(event) => setMarketingField('mediaLibrary', 'masterplanUrl', event.target.value)}
                        placeholder="https://.../masterplan.jpg"
                      />
                    </DetailField>
                    <DetailField label="Floorplan URLs (one per line)">
                      <Field
                        as="textarea"
                        rows={3}
                        value={marketingForm.mediaLibrary.floorplanUrls}
                        onChange={(event) => setMarketingField('mediaLibrary', 'floorplanUrls', event.target.value)}
                        placeholder={'https://.../type-a.pdf\nhttps://.../type-b.pdf'}
                      />
                    </DetailField>
                    <DetailField label="Video URL">
                      <Field
                        value={marketingForm.mediaLibrary.videoUrl}
                        onChange={(event) => setMarketingField('mediaLibrary', 'videoUrl', event.target.value)}
                        placeholder="https://.../promo-video"
                      />
                    </DetailField>
                    <DetailField label="Virtual Tour URL">
                      <Field
                        value={marketingForm.mediaLibrary.virtualTourUrl}
                        onChange={(event) => setMarketingField('mediaLibrary', 'virtualTourUrl', event.target.value)}
                        placeholder="https://.../virtual-tour"
                      />
                    </DetailField>
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">Downloads &amp; Sales Assets</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Sales and investment collateral used by agents, buyers, and listing pages.
                    </p>
                  </div>
                  <div className="grid gap-4">
                    <DetailField label="Brochure URL">
                      <Field
                        value={marketingForm.downloads.brochureUrl}
                        onChange={(event) => setMarketingField('downloads', 'brochureUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="Pricing Sheet URL">
                      <Field
                        value={marketingForm.downloads.pricingSheetUrl}
                        onChange={(event) => setMarketingField('downloads', 'pricingSheetUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="Spec Sheet URL">
                      <Field
                        value={marketingForm.downloads.specSheetUrl}
                        onChange={(event) => setMarketingField('downloads', 'specSheetUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="Sales Pack URL">
                      <Field
                        value={marketingForm.downloads.salesPackUrl}
                        onChange={(event) => setMarketingField('downloads', 'salesPackUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="Investment Pack URL">
                      <Field
                        value={marketingForm.downloads.investmentPackUrl}
                        onChange={(event) => setMarketingField('downloads', 'investmentPackUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="Terms / PDF URL">
                      <Field
                        value={marketingForm.downloads.termsPdfUrl}
                        onChange={(event) => setMarketingField('downloads', 'termsPdfUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="Application Form URL">
                      <Field
                        value={marketingForm.downloads.applicationFormUrl}
                        onChange={(event) => setMarketingField('downloads', 'applicationFormUrl', event.target.value)}
                      />
                    </DetailField>
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">External &amp; Support Links</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Operational links for support, enquiries, and external marketing destinations.
                    </p>
                  </div>
                  <div className="grid gap-4">
                    <DetailField label="Development Landing Page URL">
                      <Field
                        value={marketingForm.externalLinks.developmentLandingPageUrl}
                        onChange={(event) =>
                          setMarketingField('externalLinks', 'developmentLandingPageUrl', event.target.value)
                        }
                      />
                    </DetailField>
                    <DetailField label="Google Maps URL">
                      <Field
                        value={marketingForm.externalLinks.googleMapsUrl}
                        onChange={(event) => setMarketingField('externalLinks', 'googleMapsUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="External Website URL">
                      <Field
                        value={marketingForm.externalLinks.externalWebsiteUrl}
                        onChange={(event) => setMarketingField('externalLinks', 'externalWebsiteUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="Sales Portal URL">
                      <Field
                        value={marketingForm.externalLinks.salesPortalUrl}
                        onChange={(event) => setMarketingField('externalLinks', 'salesPortalUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="WhatsApp Enquiry URL">
                      <Field
                        value={marketingForm.externalLinks.whatsappEnquiryUrl}
                        onChange={(event) => setMarketingField('externalLinks', 'whatsappEnquiryUrl', event.target.value)}
                      />
                    </DetailField>
                    <DetailField label="Booking / Viewing URL">
                      <Field
                        value={marketingForm.externalLinks.bookingViewingUrl}
                        onChange={(event) => setMarketingField('externalLinks', 'bookingViewingUrl', event.target.value)}
                      />
                    </DetailField>
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-[#142132]">Listing Configuration</h4>
                    <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                      Publishing controls and CTA settings for listing website readiness.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Show on Listing Website">
                      <Field
                        as="select"
                        value={marketingForm.listingConfiguration.showOnListingWebsite ? 'yes' : 'no'}
                        onChange={(event) =>
                          setMarketingField(
                            'listingConfiguration',
                            'showOnListingWebsite',
                            event.target.value === 'yes',
                          )
                        }
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Field>
                    </DetailField>
                    <DetailField label="Featured Development">
                      <Field
                        as="select"
                        value={marketingForm.listingConfiguration.featuredDevelopment ? 'yes' : 'no'}
                        onChange={(event) =>
                          setMarketingField(
                            'listingConfiguration',
                            'featuredDevelopment',
                            event.target.value === 'yes',
                          )
                        }
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Field>
                    </DetailField>
                    <DetailField label="Display Order">
                      <Field
                        type="number"
                        min="0"
                        value={marketingForm.listingConfiguration.displayOrder}
                        onChange={(event) =>
                          setMarketingField('listingConfiguration', 'displayOrder', event.target.value)
                        }
                      />
                    </DetailField>
                    <DetailField label="Listing Slug">
                      <Field
                        value={marketingForm.listingConfiguration.listingSlug}
                        onChange={(event) =>
                          setMarketingField('listingConfiguration', 'listingSlug', event.target.value)
                        }
                        placeholder="junoah-estate"
                      />
                    </DetailField>
                    <DetailField label="CTA Label">
                      <Field
                        value={marketingForm.listingConfiguration.ctaLabel}
                        onChange={(event) => setMarketingField('listingConfiguration', 'ctaLabel', event.target.value)}
                        placeholder="Book a Viewing"
                      />
                    </DetailField>
                    <DetailField label="CTA URL">
                      <Field
                        value={marketingForm.listingConfiguration.ctaUrl}
                        onChange={(event) => setMarketingField('listingConfiguration', 'ctaUrl', event.target.value)}
                        placeholder="https://..."
                      />
                    </DetailField>
                    <DetailField label="Marketing Status">
                      <Field
                        as="select"
                        value={marketingForm.listingConfiguration.marketingStatus}
                        onChange={(event) =>
                          setMarketingField('listingConfiguration', 'marketingStatus', event.target.value)
                        }
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
                          setMarketingField(
                            'listingConfiguration',
                            'publicVisibility',
                            event.target.value === 'visible',
                          )
                        }
                      >
                        <option value="visible">Visible</option>
                        <option value="hidden">Hidden</option>
                      </Field>
                    </DetailField>
                  </div>
                </section>
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-[#e6edf5] pt-4">
              <Button type="submit" disabled={detailsSaving}>
                {detailsSaving ? 'Saving…' : 'Save Marketing Content'}
              </Button>
            </div>
          </form>
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
                  <option value="available">Available</option>
                  <option value="reserved">Reserved</option>
                  <option value="sold">Sold</option>
                  <option value="registered">Registered</option>
                  <option value="blocked">Blocked</option>
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
                          'Unit Number',
                          ...(unitStructureConfig.mode === 'none' ? [] : [unitStructureConfig.label]),
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
                        <tr key={unit.id} className="cursor-pointer transition hover:bg-[#f8fbff]" onClick={() => openUnitModal(unit)}>
                          <td className="px-5 py-4 text-sm font-semibold text-[#142132]">{unit.unitNumber}</td>
                          {unitStructureConfig.mode !== 'none' ? (
                            <td className="px-5 py-4">
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPhasePillClassName(resolveUnitStructureLabel(unit, unitStructureConfig.mode))}`}>
                                {resolveUnitStructureLabel(unit, unitStructureConfig.mode)}
                              </span>
                            </td>
                          ) : null}
                          <td className="px-5 py-4 text-sm text-[#44576d]">{unit.buyerName || 'No purchaser assigned'}</td>
                          <td className="px-5 py-4">
                            <span className="inline-flex rounded-full border border-[#d7e5f5] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#5b7895]">
                              {unit.status || 'Available'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-[#44576d]">
                            {Number.isFinite(Number(unit.salesPrice)) ? currency.format(Number(unit.salesPrice)) : 'Not set'}
                          </td>
                          <td className="px-5 py-4 text-sm text-[#44576d]">{formatDate(unit.handover?.handoverDate || null)}</td>
                          <td className="px-5 py-4 text-sm text-[#44576d]">{unit.floorplanName || 'No floorplan assigned'}</td>
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
                  {Array.from(new Set(rows.map((row) => String(row?.transaction?.stage || '').toLowerCase()).filter(Boolean))).map((stage) => (
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
                      <col className="w-[18%]" />
                      <col className="w-[24%]" />
                      <col className="w-[22%]" />
                      <col className="w-[22%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead className="bg-[#f8fafc]">
                      <tr>
                        {['Unit', 'Progress', 'Buyer Name', 'Email', 'Stage'].map((heading) => (
                          <th key={heading} className="sticky top-0 z-10 bg-[#f8fafc] px-4 py-3 text-left text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2f7] bg-white">
                      {transactionRows.map((row) => (
                        <tr
                          key={row.transaction?.id || row.unit?.id}
                          className="h-[64px] cursor-pointer align-middle hover:bg-[#f8fbff]"
                          onClick={() => {
                            if (!row?.unit?.id) return
                            navigate(`/units/${row.unit.id}`, {
                              state: { headerTitle: `Unit ${row.unit?.unit_number || 'Workspace'}` },
                            })
                          }}
                        >
                          <td className="px-4 py-3 align-middle">
                            <strong className="block w-full truncate whitespace-nowrap text-left text-sm font-semibold leading-6 text-[#22384c]" title={`Unit ${row.unit?.unit_number || '—'}`}>
                              {`Unit ${row.unit?.unit_number || '—'}`}
                            </strong>
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
                              title={row.transaction?.stage || 'Available'}
                            >
                              {toTitleLabel(row.transaction?.stage || 'available')}
                            </span>
                          </td>
                        </tr>
                      ))}
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
          <DevelopmentBondCommercialSetup
            developmentId={data.development.id}
            onSaved={() => {
              void loadData()
            }}
          />
        </section>
      ) : null}

      <Modal
        open={emailComposeOpen}
        onClose={emailSending ? undefined : closeDocumentEmailComposer}
        title="Send Document via Email"
        subtitle="Compose an email for the selected development document. Bridge will prefill the document context and file link."
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
                  <option value="Available">Available</option>
                  <option value="Reserved">Reserved</option>
                  <option value="Sold">Sold</option>
                  <option value="Registered">Registered</option>
                  <option value="Blocked">Blocked</option>
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
            <section className="rounded-[20px] border border-[#dbe7f3] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f7fc_100%)] p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div>
                  <strong className="block text-[1rem] font-semibold text-[#142132]">Planned stock setup</strong>
                  <p className="mt-1 text-sm leading-6 text-[#5c7289]">
                    Expected units: {formatNumber(expectedUnitCount)}. Current stock rows: {formatNumber(unitRows.length)}. Suggested bulk add: {formatNumber(remainingPlannedUnits || 0)}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    remainingPlannedUnits > 0 ? String(remainingPlannedUnits) : null,
                    '5',
                    '10',
                    '20',
                  ]
                    .filter(Boolean)
                    .map((value) => (
                      <Button
                        key={value}
                        variant={String(bulkUnitForm.count || '') === value ? 'primary' : 'secondary'}
                        className="min-w-[72px]"
                        onClick={() => setBulkUnitForm((previous) => ({ ...previous, count: value }))}
                      >
                        {value} units
                      </Button>
                    ))}
                </div>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="grid gap-5">
                <section className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Unit numbering</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Start with the sequence. Everything else below applies as defaults to all generated units.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Number of Units</span>
                      <Field type="number" min="1" value={bulkUnitForm.count} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, count: event.target.value }))} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Starting Number</span>
                      <Field type="number" min="1" value={bulkUnitForm.startNumber} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, startNumber: event.target.value }))} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Prefix</span>
                      <Field value={bulkUnitForm.prefix} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, prefix: event.target.value }))} placeholder="Optional, e.g. A-" />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Zero Padding</span>
                      <Field as="select" value={bulkUnitForm.padding} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, padding: event.target.value }))}>
                        <option value="0">None</option>
                        <option value="2">2 digits</option>
                        <option value="3">3 digits</option>
                        <option value="4">4 digits</option>
                      </Field>
                    </label>
                  </div>
                </section>

                <section className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-4">
                    <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Shared defaults</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">These values are copied to every new unit so the stock master is usable immediately.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Phase</span>
                      <Field value={bulkUnitForm.phase} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, phase: event.target.value }))} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Block</span>
                      <Field value={bulkUnitForm.block} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, block: event.target.value }))} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Unit Type</span>
                      <Field value={bulkUnitForm.unitType} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, unitType: event.target.value }))} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Default List Price</span>
                      <Field type="number" min="0" value={bulkUnitForm.listPrice} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, listPrice: event.target.value }))} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Default Status</span>
                      <Field as="select" value={bulkUnitForm.status} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, status: event.target.value }))}>
                        <option value="Available">Available</option>
                        <option value="Reserved">Reserved</option>
                        <option value="Sold">Sold</option>
                        <option value="Registered">Registered</option>
                        <option value="Blocked">Blocked</option>
                      </Field>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>VAT Applicable</span>
                      <Field as="select" value={bulkUnitForm.vatApplicable} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, vatApplicable: event.target.value }))}>
                        <option value="">Not set</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </Field>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#35546c] md:col-span-2">
                      <span>Notes</span>
                      <Field as="textarea" rows={3} value={bulkUnitForm.notes} onChange={(event) => setBulkUnitForm((previous) => ({ ...previous, notes: event.target.value }))} />
                    </label>
                  </div>
                </section>
              </div>

              <aside className="grid gap-4">
                <section className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <div className="mb-3">
                    <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">Preview</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">This is what the first few generated unit numbers will look like.</p>
                  </div>
                  <div className="grid gap-2">
                    {Array.from({ length: Math.min(4, Math.max(1, Number(bulkUnitForm.count || 0) || 1)) }, (_, index) => {
                      const nextNumber = Number(bulkUnitForm.startNumber || 0) + index
                      const padded = String(nextNumber).padStart(Math.max(0, Number(bulkUnitForm.padding || 0)), '0')
                      const unitNumber = `${bulkUnitForm.prefix || ''}${Number.isFinite(nextNumber) && nextNumber > 0 ? padded : ''}`
                      return (
                        <div key={`${unitNumber || 'preview'}-${index}`} className="flex items-center justify-between rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                          <span className="text-sm font-semibold text-[#142132]">{unitNumber || 'Enter numbering details'}</span>
                          <span className="text-xs font-medium text-[#7b8ca2]">{bulkUnitForm.status || 'Available'}</span>
                        </div>
                      )
                    })}
                    {Number(bulkUnitForm.count || 0) > 4 ? (
                      <div className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-3.5 py-3 text-xs font-medium text-[#7b8ca2]">
                        + {formatNumber(Number(bulkUnitForm.count || 0) - 4)} more units
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <h4 className="text-[1rem] font-semibold tracking-[-0.025em] text-[#142132]">What gets created</h4>
                  <div className="mt-3 grid gap-3">
                    {[
                      ['Unit label', 'Matches the generated unit number'],
                      ['Price', bulkUnitForm.listPrice ? currency.format(Number(bulkUnitForm.listPrice || 0)) : 'Defaults to R0 until priced'],
                      ['Status', bulkUnitForm.status || 'Available'],
                      ['Phase / Block', [bulkUnitForm.phase, bulkUnitForm.block].filter(Boolean).join(' • ') || 'Left blank if not set'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                        <strong className="mt-1.5 block text-sm font-semibold text-[#142132]">{value}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-bridge-border pt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setBulkUnitForm(DEFAULT_BULK_UNIT_FORM)
                  setBulkUnitModalOpen(false)
                }}
                disabled={bulkUnitSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={bulkUnitSaving}>
                {bulkUnitSaving ? 'Creating…' : 'Create Units'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
      </div>
    </section>
  )
}

export default DevelopmentDetail
