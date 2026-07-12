import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  GitBranch,
  Globe2,
  HelpCircle,
  Mail,
  MapPin,
  Monitor,
  Palette,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Type,
  UploadCloud,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import Field from '../../components/ui/Field'
import { useOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { upsertAreaFromAddress } from '../../lib/location/upsertArea'
import {
  saveAgencyOnboardingDraft,
  updateOrganisationSettings,
  uploadOrganisationBrandingAsset,
} from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsLoadingState,
  SettingsStickySaveBar,
  settingsPageClass,
} from './settingsUi'

const WORKSPACE_TYPE_COPY_KEYS = {
  agency: 'agency',
  bond_originator: 'bond',
}

const PERMISSION_SCOPE_OPTIONS = [
  { value: 'all', label: 'All Organisation Data' },
  { value: 'branch', label: 'Branch Scoped' },
  { value: 'own', label: 'Own Records Only' },
]

const CRM_VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private by Default' },
  { value: 'branch', label: 'Visible to Branch' },
  { value: 'organisation', label: 'Visible to Organisation' },
]

const BOND_ORIGINATOR_TYPE_OPTIONS = [
  { value: 'independent', label: 'Independent originator' },
  { value: 'regional', label: 'Regional bond originator' },
  { value: 'national', label: 'National originator network' },
]

const BOND_BUSINESS_FOCUS_OPTIONS = [
  { value: 'bond_applications', label: 'Bond applications' },
  { value: 'prequalification', label: 'Pre-qualification' },
  { value: 'full_service', label: 'Full finance support' },
]

const AGENCY_TYPE_OPTIONS = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed', label: 'Residential & Commercial' },
]

const AGENCY_BUSINESS_FOCUS_OPTIONS = [
  { value: 'sales', label: 'Sales' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'sales_rentals', label: 'Sales & Rentals' },
]

const ORGANISATION_DEFAULTS = {
  timezone: 'Africa/Johannesburg',
  country: 'South Africa',
  currency: 'ZAR',
  dateFormat: 'DD MMM YYYY',
  language: 'English (South Africa)',
  defaultMatterVisibility: 'branch',
}

const ORGANISATION_SUCCESS_MESSAGE = 'Organisation settings updated successfully.'
const BRANDING_SUCCESS_MESSAGE = 'Branding updated successfully.'
const ORGANISATION_UNSAVED_PROMPT = 'You have unsaved organisation changes. Leave without saving?'
const BRANDING_UNSAVED_PROMPT = "You have unsaved branding changes. Leave without saving?"
const BRAND_ASSET_MAX_BYTES = 10 * 1024 * 1024
const BRAND_ASSET_ALLOWED_EXTENSIONS = new Set(['png', 'svg', 'jpg', 'jpeg', 'webp'])
const BRAND_ASSET_ALLOWED_TYPES = new Set(['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'])
const CARD_CLASS = 'rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)] sm:p-6'
const INPUT_CLASS = 'h-11 rounded-[12px] border-[#d8e3ee] bg-white text-sm text-[#17233a] shadow-[0_1px_0_rgba(15,23,42,0.02)] placeholder:text-[#9aa8b8] focus:border-[#0f7f4f] focus:ring-[#dff2e8]'
const LABEL_CLASS = 'text-[0.78rem] font-semibold text-[#43566d]'
const FIELD_CLASS = 'grid gap-1.5'

const BRAND_ASSET_TARGETS = {
  logoLight: {
    variant: 'primary',
    bucketField: 'logoLightBucket',
    pathField: 'logoLightPath',
    title: 'Primary Logo',
    formats: 'PNG • SVG',
    dimensions: 'Recommended 640 x 240 px, transparent background',
  },
  logoDark: {
    variant: 'dark',
    bucketField: 'logoDarkBucket',
    pathField: 'logoDarkPath',
    title: 'Dark Logo',
    formats: 'PNG • SVG',
    dimensions: 'Recommended 640 x 240 px, light artwork',
  },
  logoIcon: {
    variant: 'icon',
    bucketField: 'logoIconBucket',
    pathField: 'logoIconPath',
    title: 'Icon Logo',
    formats: 'PNG • SVG',
    dimensions: 'Recommended 512 x 512 px',
  },
  favicon: {
    variant: 'favicon',
    bucketField: 'faviconBucket',
    pathField: 'faviconPath',
    title: 'Favicon',
    formats: 'PNG • SVG',
    dimensions: 'Recommended 64 x 64 px',
  },
  portalIcon: {
    variant: 'portal-icon',
    bucketField: 'portalIconBucket',
    pathField: 'portalIconPath',
    title: 'Portal Icon',
    formats: 'PNG • SVG',
    dimensions: 'Recommended 256 x 256 px',
  },
  mobileIcon: {
    variant: 'mobile-icon',
    bucketField: 'mobileIconBucket',
    pathField: 'mobileIconPath',
    title: 'Mobile Icon',
    formats: 'PNG • WebP',
    dimensions: 'Recommended 512 x 512 px',
  },
  browserTile: {
    variant: 'browser-tile',
    bucketField: 'browserTileBucket',
    pathField: 'browserTilePath',
    title: 'Browser Tile',
    formats: 'PNG • WebP',
    dimensions: 'Recommended 512 x 512 px',
  },
}

const BRAND_COLOUR_CONTROLS = [
  { key: 'primary', label: 'Primary', fallback: '#274C69' },
  { key: 'secondary', label: 'Secondary', fallback: '#10273A' },
  { key: 'accent', label: 'Accent', fallback: '#F7CF22' },
  { key: 'neutral', label: 'Neutral', fallback: '#F7F8FA' },
]

const ONBOARDING_LANDING_COLOUR_CONTROLS = [
  { key: 'primary', label: 'Landing Primary', fallback: '#001A3D' },
  { key: 'secondary', label: 'Landing Secondary', fallback: '#001B44' },
  { key: 'accent', label: 'Landing Accent', fallback: '#F7CF22' },
]

const ONBOARDING_LANDING_COPY = {
  buyer: {
    label: 'Buyer onboarding',
    headline: 'Let’s get your property purchase started.',
    cta: 'Start buyer onboarding',
  },
  seller: {
    label: 'Seller onboarding',
    headline: 'Let’s get your property sale started.',
    cta: 'Start seller onboarding',
  },
}

const BRAND_TYPOGRAPHY_DEFAULTS = {
  primaryFont: 'Inter',
  weight: 'Medium',
  buttonStyle: 'Rounded',
  borderRadius: '12px',
}

const BOND_SETTINGS_COPY = {
  unavailable: 'Bond originator organisation settings are unavailable right now. Please retry from the dashboard setup guide.',
  readOnly: 'Read-only for your role. Only HQ administrators can edit bond originator organisation settings.',
  organisationNameLabel: 'Bond originator company name',
  agencyTypeLabel: 'Originator operating model',
  businessFocusLabel: 'Origination focus',
  principalTitle: 'Executive Administrator',
  principalDescription: 'Primary HQ administrator identity used for admin control and reporting lineage.',
  principalNameLabel: 'HQ administrator full name',
  principalEmailLabel: 'HQ administrator email',
  complianceNumberLabel: 'NCR / FSP / compliance number',
  branchLabel: 'Regions & Branches',
  branchCopy: 'Regional and branch entities drive manager scope, reporting visibility, and operational ownership.',
  branchCountLabel: 'Regions',
  agentScopeLabel: 'Consultant Scope',
  leadVisibilityLabel: 'Application Visibility',
  sharingLabel: 'Allow cross-branch application collaboration',
  queueLabel: 'Allow shared application queues',
  listingsLabel: 'Allow shared developer/development access',
  branchesHref: '/bond/organisation',
}

const AGENCY_SETTINGS_COPY = {
  unavailable: 'Organisation settings are unavailable right now. Please retry from the dashboard setup guide.',
  readOnly: 'Read-only for your role. Only Principal-level administrators can edit organisation settings.',
  organisationNameLabel: 'Agency Name',
  agencyTypeLabel: 'Agency Type',
  businessFocusLabel: 'Business Focus',
  principalTitle: 'Principal Information',
  principalDescription: 'Owner profile and operational contact identity.',
  principalNameLabel: 'Name',
  principalEmailLabel: 'Email',
  complianceNumberLabel: 'EAAB / PPRA Number',
  branchLabel: 'Branches',
  branchCopy: 'Branch entities drive manager scope, reporting visibility, and operational ownership.',
  branchCountLabel: 'Branches',
  agentScopeLabel: 'Agent Scope',
  leadVisibilityLabel: 'Lead Visibility',
  sharingLabel: 'Allow Cross Branch Sharing',
  queueLabel: 'Allow shared lead pools',
  listingsLabel: 'Allow shared listings',
  branchesHref: '/agency/branches',
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function titleize(value = '') {
  return normalizeText(value)
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getInitials(value = '') {
  return normalizeText(value || 'Organisation')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'O'
}

function buildOrganisationAddressValue(organisation = {}, onboarding = {}) {
  const agencyInfo = onboarding?.agencyInformation || {}
  const formattedAddress = normalizeText(
    organisation?.formattedAddress ||
      agencyInfo.formattedAddress ||
      [organisation?.addressLine1 || agencyInfo.physicalAddress, organisation?.suburb, organisation?.city, organisation?.province || agencyInfo.province].filter(Boolean).join(', '),
  )

  if (!formattedAddress) return null

  return {
    formattedAddress,
    streetAddress: normalizeText(organisation?.addressLine1 || agencyInfo.physicalAddress),
    suburb: normalizeText(organisation?.suburb),
    city: normalizeText(organisation?.city),
    province: normalizeText(organisation?.province || agencyInfo.province),
    country: normalizeText(organisation?.country || agencyInfo.country || 'South Africa'),
    postalCode: normalizeText(organisation?.postalCode),
    latitude: typeof organisation?.latitude === 'number' ? organisation.latitude : Number(organisation?.latitude) || undefined,
    longitude: typeof organisation?.longitude === 'number' ? organisation.longitude : Number(organisation?.longitude) || undefined,
    placeId: normalizeText(organisation?.googlePlaceId),
  }
}

function getLogoPreviewLabel(sourceUrl, fallbackLabel = 'Uploaded logo') {
  const value = normalizeText(sourceUrl)
  if (!value) return ''
  if (value.startsWith('data:image/')) return fallbackLabel
  const clean = value.split('?')[0]
  const lastSegment = clean.split('/').filter(Boolean).pop() || ''
  return lastSegment ? decodeURIComponent(lastSegment) : fallbackLabel
}

function getOrganisationDefaults(organisation = {}) {
  const defaults = organisation?.settingsJson?.organisationDefaults
  return {
    ...ORGANISATION_DEFAULTS,
    ...(defaults && typeof defaults === 'object' ? defaults : {}),
    country: normalizeText(defaults?.country || organisation?.country) || ORGANISATION_DEFAULTS.country,
  }
}

function getBranchRows(onboarding = {}) {
  const rows = onboarding?.branchStructure?.branches
  return Array.isArray(rows) ? rows : []
}

function getBranchUserCount(branches = []) {
  const total = branches.reduce((sum, branch) => {
    const parsed = Number.parseInt(String(branch?.numberOfAgents || ''), 10)
    return Number.isFinite(parsed) ? sum + parsed : sum
  }, 0)
  return total > 0 ? total + 1 : Math.max(branches.length, 1)
}

function getManagerCount(branches = []) {
  return branches.filter((branch) => normalizeText(branch?.branchManager)).length
}

function getOrganisationDisplayName(form = {}, onboarding = {}) {
  return (
    normalizeText(onboarding?.agencyInformation?.agencyName) ||
    normalizeText(form?.displayName) ||
    normalizeText(form?.name) ||
    'Kingstons Real Estate'
  )
}

function getOrganisationTypeLabel(onboarding = {}) {
  const type = onboarding?.agencyInformation?.agencyType
  if (type === 'mixed') return 'Residential • Commercial'
  return titleize(type || 'Residential')
}

function getPrimaryLogo(form = {}, onboarding = {}) {
  return normalizeText(onboarding?.branding?.logoLight || form?.logoUrl)
}

function getBrandAssetFileExtension(fileName = '', sourceUrl = '') {
  const source = normalizeText(fileName) || normalizeText(sourceUrl).split('?')[0]
  const extension = source.includes('.') ? source.split('.').pop() : ''
  return normalizeText(extension).toLowerCase()
}

function getBrandAssetFormatLabel(fileName = '', sourceUrl = '', fallback = 'PNG • SVG') {
  const extension = getBrandAssetFileExtension(fileName, sourceUrl)
  if (!extension) return fallback
  if (extension === 'jpeg') return 'JPG'
  return extension.toUpperCase()
}

function validateBrandAssetFile(file) {
  if (!file) return 'Select a brand asset before uploading.'
  const extension = getBrandAssetFileExtension(file.name)
  const mimeType = normalizeText(file.type).toLowerCase()
  if (!BRAND_ASSET_ALLOWED_EXTENSIONS.has(extension) && !BRAND_ASSET_ALLOWED_TYPES.has(mimeType)) {
    return 'Upload a PNG, SVG, JPG, or WebP brand asset.'
  }
  if (Number(file.size || 0) > BRAND_ASSET_MAX_BYTES) {
    return 'Brand asset is too large. Please upload a file smaller than 10 MB.'
  }
  return ''
}

function getBrandColourValue(brandColours = {}, key = '', fallback = '#274C69') {
  const value = normalizeText(brandColours?.[key])
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

function hexToRgb(hex = '#000000') {
  const safeHex = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex.slice(1) : '000000'
  const value = Number.parseInt(safeHex, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function hexToRgba(hex = '#000000', alpha = 1) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getContrastTextColour(hex = '#F7CF22', darkText = '#001B44') {
  const { r, g, b } = hexToRgb(hex)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? darkText : '#ffffff'
}

function getOnboardingLandingColours(brandColours = {}) {
  return ONBOARDING_LANDING_COLOUR_CONTROLS.reduce((accumulator, control) => ({
    ...accumulator,
    [control.key]: getBrandColourValue(brandColours, control.key, control.fallback),
  }), {})
}

function getBrandTypography(branding = {}) {
  return {
    ...BRAND_TYPOGRAPHY_DEFAULTS,
    ...(branding?.typography && typeof branding.typography === 'object' ? branding.typography : {}),
  }
}

function getPublicBranding(form = {}, agencyInfo = {}, branding = {}) {
  const publicIdentity = branding?.publicIdentity && typeof branding.publicIdentity === 'object' ? branding.publicIdentity : {}
  return {
    website: normalizeText(publicIdentity.website || agencyInfo.website || form.website),
    facebook: normalizeText(publicIdentity.facebook),
    linkedIn: normalizeText(publicIdentity.linkedIn),
    instagram: normalizeText(publicIdentity.instagram),
    supportEmail: normalizeText(publicIdentity.supportEmail || form.supportEmail || form.companyEmail || agencyInfo.mainEmailAddress),
  }
}

function getBrandAssetHistory(branding = {}, targetKey = '') {
  const history = branding?.assetHistory?.[targetKey]
  return Array.isArray(history) ? history.filter((entry) => normalizeText(entry?.url)).slice(0, 3) : []
}

function getConfiguredBrandAssetCount(branding = {}) {
  return Object.keys(BRAND_ASSET_TARGETS).filter((targetKey) => normalizeText(branding?.[targetKey])).length
}

function getBrandHealthScore({ branding = {}, brandColours = {}, publicBranding = {} } = {}) {
  const checks = [
    normalizeText(branding.logoLight),
    normalizeText(branding.logoDark),
    normalizeText(branding.logoIcon),
    getBrandColourValue(brandColours, 'primary', ''),
    getBrandColourValue(brandColours, 'secondary', ''),
    getBrandColourValue(brandColours, 'accent', ''),
    getBrandColourValue(brandColours, 'neutral', ''),
    normalizeText(publicBranding.website),
    normalizeText(publicBranding.supportEmail),
  ]
  const completed = checks.filter(Boolean).length
  return Math.round((completed / checks.length) * 100)
}

function getBrandLastUpdatedLabel(value = '') {
  const timestamp = normalizeText(value)
  if (!timestamp) return 'Not saved yet'
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return 'Not saved yet'
  const diffMs = Date.now() - parsed.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 30) return `${diffDays} days ago`
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function VerificationBadge({ children, verified = false }) {
  const Icon = verified ? CheckCircle2 : Circle
  return (
    <span className={verified ? 'inline-flex items-center gap-1 rounded-full border border-[#cfe8dc] bg-[#edf8f2] px-2.5 py-1 text-xs font-semibold text-[#0f7f4f]' : 'inline-flex items-center gap-1 rounded-full border border-[#e0e8f1] bg-[#f8fbfe] px-2.5 py-1 text-xs font-semibold text-[#60758d]'}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {children}
    </span>
  )
}

function OrganisationPageHeader({ sectionTitle = 'Organisation', description = 'Manage your agency information, branding, permissions and operational defaults.' }) {
  return (
    <header className="pb-1">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold leading-tight text-[#17233a]">
        <span className="text-[#6b7d93]">Settings</span>
        <ChevronRight className="h-4 w-4 text-[#9aa8b8]" strokeWidth={2} />
        <span>{sectionTitle}</span>
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p>
    </header>
  )
}

function OrganisationCard({ title, description, actions, children }) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[1.05rem] font-semibold text-[#17233a]">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-[#60758d]">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function OrganisationField({ label, id, badge, className = '', children }) {
  return (
    <label className={`${FIELD_CLASS} ${className}`.trim()} htmlFor={id}>
      <span className="flex flex-wrap items-center gap-2">
        <span className={LABEL_CLASS}>{label}</span>
        {badge}
      </span>
      {children}
    </label>
  )
}

function OrganisationSwitch({ checked = false, disabled = false, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      className={[
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition focus:outline-none focus:ring-4 focus:ring-[#dff2e8]',
        checked ? 'bg-[#0f7f4f]' : 'bg-[#cbd6e2]',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-[0_0_0_4px_rgba(15,127,79,0.08)]',
      ].join(' ')}
      onClick={() => {
        if (!disabled) onChange?.(!checked)
      }}
    >
      <span className={['inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.24)] transition-transform', checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function StatTile({ label, value, children }) {
  return (
    <div className="rounded-[16px] border border-[#e0e9f2] bg-[#f8fbfa] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">
        {children}
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold text-[#17233a]">{value}</p>
    </div>
  )
}

function LogoMark({ logoUrl, name }) {
  return (
    <span className="inline-flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-[#d7e2ef] bg-[#f1f6f9] text-2xl font-semibold text-[#244e70] shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
      {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain p-3" /> : getInitials(name)}
    </span>
  )
}

function BrandUploadTile({ title, description, previewUrl, previewTone = 'light', fileName, fallback, uploading = false, canEdit = false, onFile }) {
  return (
    <article
      className="grid gap-4 rounded-[18px] border border-[#dfe8f1] bg-[#fbfdff] p-4"
      onDragOver={(event) => {
        if (canEdit) event.preventDefault()
      }}
      onDrop={(event) => {
        if (!canEdit) return
        event.preventDefault()
        const file = event.dataTransfer.files?.[0]
        if (file) void onFile?.(file)
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#17233a]">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#60758d]">{description}</p>
        </div>
        {canEdit ? (
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:bg-[#f7fafc]">
            <UploadCloud className="h-4 w-4" strokeWidth={2} />
            {uploading ? 'Uploading...' : previewUrl ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void onFile?.(file)
                event.target.value = ''
              }}
            />
          </label>
        ) : null}
      </div>
      <div className={previewTone === 'dark' ? 'flex min-h-[132px] items-center justify-center rounded-[16px] border border-[#153b5a] bg-[#10273a] p-4 text-sm font-semibold text-white/70' : 'flex min-h-[132px] items-center justify-center rounded-[16px] border border-[#e2ebf3] bg-white p-4 text-sm font-semibold text-[#8091a7]'}>
        {previewUrl ? <img className="h-full max-h-[98px] w-full object-contain" src={previewUrl} alt={`${title} preview`} /> : fallback}
      </div>
      <div className="text-xs leading-5 text-[#60758d]">
        <p className="truncate font-medium text-[#40566d]">{fileName || (previewUrl ? getLogoPreviewLabel(previewUrl, title) : 'Drop PNG, SVG or JPG here, or browse files.')}</p>
        <p>Supported: PNG, SVG, JPG, WebP. Recommended max size: 10MB.</p>
      </div>
    </article>
  )
}

function ColourControl({ label, value, disabled = false, onChange }) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#274C69'
  return (
    <div className="rounded-[18px] border border-[#dfe8f1] bg-[#fbfdff] p-4">
      <div className="flex items-center gap-3">
        <input
          type="color"
          className="h-11 w-11 cursor-pointer rounded-[12px] border border-[#d8e3ee] bg-white p-1"
          value={safeValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} colour picker`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#17233a]">{label}</p>
          <Field className={`${INPUT_CLASS} mt-2`} value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        </div>
      </div>
    </div>
  )
}

function BrandHero({
  organisationName,
  primaryLogo,
  configuredAssetCount,
  brandHealth,
  lastUpdatedLabel,
  canEdit,
  uploading = false,
  onPreview,
  onUpload,
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[#dfe8f1] bg-white shadow-[0_18px_46px_rgba(15,23,42,0.06)]">
      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-center">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
          <LogoMark logoUrl={primaryLogo} name={organisationName} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0f7f4f]">Brand Assets</p>
            <h2 className="mt-2 text-[1.5rem] font-semibold leading-tight text-[#17233a]">{organisationName}</h2>
            <div className="mt-4 grid gap-3 text-sm text-[#60758d] sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8fa5]">Last Updated</p>
                <p className="mt-1 font-semibold text-[#24364b]">{lastUpdatedLabel}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8fa5]">Assets Configured</p>
                <p className="mt-1 font-semibold text-[#24364b]">{configuredAssetCount} Assets Configured</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8fa5]">Brand Health</p>
                <p className="mt-1 font-semibold text-[#24364b]">{brandHealth}%</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:bg-[#f7fafc]"
                onClick={onPreview}
              >
                <Eye className="h-4 w-4" strokeWidth={2} />
                Preview Brand
              </button>
              {canEdit ? (
                <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#0f7f4f] bg-[#0f7f4f] px-4 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(15,127,79,0.18)] transition hover:bg-[#0d6f45]">
                  <UploadCloud className="h-4 w-4" strokeWidth={2} />
                  {uploading ? 'Uploading...' : 'Upload Assets'}
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void onUpload?.(file)
                      event.target.value = ''
                    }}
                  />
                </label>
              ) : null}
            </div>
          </div>
        </div>
        <div className="rounded-[20px] border border-[#dfe8f1] bg-[#f8fbfa] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#17233a]">Brand Health</p>
              <p className="mt-1 text-sm text-[#60758d]">Core assets, colours and public identity.</p>
            </div>
            <span className="text-3xl font-semibold text-[#0f7f4f]">{brandHealth}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#dce8f1]">
            <span className="block h-full rounded-full bg-[#0f7f4f]" style={{ width: `${brandHealth}%` }} />
          </div>
        </div>
      </div>
    </section>
  )
}

function BrandAssetTile({
  title,
  description,
  previewUrl,
  previewTone = 'light',
  fileName,
  formats = 'PNG • SVG',
  dimensions = 'Recommended 640 x 240 px',
  canEdit = false,
  uploading = false,
  fallback = 'No asset uploaded',
  history = [],
  generatedFrom = '',
  onFile,
  onDelete,
  onRollback,
}) {
  const formatLabel = getBrandAssetFormatLabel(fileName, previewUrl, formats)
  return (
    <article className="grid min-h-[360px] gap-4 rounded-[18px] border border-[#dfe8f1] bg-[#fbfdff] p-4">
      <div
        className={[
          'flex min-h-[142px] items-center justify-center rounded-[16px] border p-4 text-sm font-semibold',
          previewTone === 'dark'
            ? 'border-[#153b5a] bg-[#10273a] text-white/70'
            : 'border-[#e2ebf3] bg-white text-[#8091a7]',
        ].join(' ')}
        onDragOver={(event) => {
          if (canEdit) event.preventDefault()
        }}
        onDrop={(event) => {
          if (!canEdit) return
          event.preventDefault()
          const file = event.dataTransfer.files?.[0]
          if (file) void onFile?.(file)
        }}
      >
        {previewUrl ? <img className="h-full max-h-[104px] w-full object-contain" src={previewUrl} alt={`${title} preview`} /> : fallback}
      </div>
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#17233a]">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-[#60758d]">{description}</p>
          </div>
          {previewUrl ? <span className="rounded-full border border-[#cfe8dc] bg-[#edf8f2] px-2 py-1 text-xs font-semibold text-[#0f7f4f]">Current</span> : null}
        </div>
        <div className="mt-3 grid gap-1 text-xs leading-5 text-[#60758d]">
          <p><span className="font-semibold text-[#40566d]">{formatLabel}</span> accepted formats: {formats}</p>
          <p>{dimensions}</p>
          <p>Maximum 10MB. Transparency recommended where possible.</p>
          {generatedFrom ? <p className="font-medium text-[#0f7f4f]">{generatedFrom}</p> : null}
        </div>
      </div>
      {uploading ? (
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-[#60758d]">
            <span>Upload progress</span>
            <span>Uploading...</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dce8f1]">
            <span className="block h-full w-2/3 rounded-full bg-[#0f7f4f]" />
          </div>
        </div>
      ) : null}
      {canEdit ? (
        <div className="mt-auto flex flex-wrap gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#0f7f4f] bg-[#0f7f4f] px-3 text-sm font-semibold text-white transition hover:bg-[#0d6f45]">
            <UploadCloud className="h-4 w-4" strokeWidth={2} />
            {previewUrl ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void onFile?.(file)
                event.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!previewUrl}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            Delete
          </button>
          {history[0] ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
              onClick={() => onRollback?.(history[0])}
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} />
              Rollback
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function BrandColourRow({ label, value, disabled = false, onChange, onCopy }) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#274C69'
  return (
    <div className="grid gap-3 border-t border-[#e5edf4] py-4 first:border-t-0 first:pt-0 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-center">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 rounded-[12px] border border-[#d8e3ee]" style={{ backgroundColor: safeValue }} />
        <div>
          <p className="text-sm font-semibold text-[#17233a]">{label}</p>
          <p className="text-xs text-[#60758d]">Live preview colour</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Field className={INPUT_CLASS} value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={`${label} hex value`} />
        <input
          type="color"
          className="h-11 w-full cursor-pointer rounded-[12px] border border-[#d8e3ee] bg-white p-1 sm:w-14"
          value={safeValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} colour picker`}
        />
      </div>
      <button
        type="button"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
        onClick={onCopy}
      >
        <Copy className="h-4 w-4" strokeWidth={2} />
        Copy HEX
      </button>
    </div>
  )
}

function PreviewTabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      className={[
        'inline-flex h-10 items-center justify-center gap-2 rounded-[12px] px-3 text-sm font-semibold transition',
        active ? 'bg-[#0f7f4f] text-white' : 'border border-[#d9e3ef] bg-white text-[#24364b] hover:bg-[#f7fafc]',
      ].join(' ')}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function BrandPreviewSurface({ activeTab, organisationName, logoUrl, iconUrl, colours, typography }) {
  const primary = colours.primary
  const secondary = colours.secondary
  const accent = colours.accent
  const neutral = colours.neutral
  if (activeTab === 'email') {
    return (
      <div className="overflow-hidden rounded-[18px] border border-[#dfe8f1] bg-white">
        <div className="p-4 text-white" style={{ backgroundColor: secondary }}>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/15">
              {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-contain p-2" /> : getInitials(organisationName)}
            </span>
            <span className="text-sm font-semibold">{organisationName}</span>
          </div>
        </div>
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#60758d]">Buyer Invitation</p>
          <h3 className="mt-2 text-lg font-semibold text-[#17233a]">Welcome to your secure workspace.</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">Your logo, header and CTA colours update as brand settings change.</p>
          <span className="mt-4 inline-flex h-10 items-center rounded-[12px] px-4 text-sm font-semibold text-white" style={{ backgroundColor: primary, borderRadius: typography.borderRadius }}>
            Review invitation
          </span>
        </div>
      </div>
    )
  }

  if (activeTab === 'pdf') {
    return (
      <div className="rounded-[18px] border border-[#dfe8f1] bg-white p-5">
        <div className="flex items-center justify-between border-b border-[#e5edf4] pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#60758d]">PDF Preview</p>
            <p className="mt-1 text-sm font-semibold text-[#17233a]">{organisationName}</p>
          </div>
          {logoUrl ? <img src={logoUrl} alt="" className="h-10 max-w-[160px] object-contain" /> : null}
        </div>
        <div className="mt-5 grid gap-3">
          <span className="h-3 rounded-full" style={{ backgroundColor: primary }} />
          <span className="h-3 w-4/5 rounded-full bg-[#dfe8f1]" />
          <span className="h-3 w-2/3 rounded-full bg-[#dfe8f1]" />
          <span className="mt-2 h-20 rounded-[14px]" style={{ backgroundColor: neutral }} />
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#dfe8f1] bg-white">
      <div className="p-4 text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/15 text-sm font-semibold">
              {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-contain p-2" /> : getInitials(organisationName)}
            </span>
            <div>
              <p className="text-sm font-semibold">{organisationName}</p>
              <p className="text-xs text-white/75">Kingstons Portal</p>
            </div>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Portal</span>
        </div>
      </div>
      <div className="grid gap-4 p-5" style={{ backgroundColor: neutral }}>
        <div className="rounded-[16px] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
          <p className="text-sm font-semibold text-[#17233a]">Client workspace</p>
          <p className="mt-1 text-sm text-[#60758d]">Buttons, cards and highlights inherit your brand colours.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex h-10 items-center rounded-[12px] px-4 text-sm font-semibold text-white" style={{ backgroundColor: primary, borderRadius: typography.borderRadius }}>Primary action</span>
            <span className="inline-flex h-10 items-center rounded-[12px] border px-4 text-sm font-semibold" style={{ borderColor: accent, color: primary, borderRadius: typography.borderRadius }}>Secondary</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function BrandPreviewWorkspace({ activeTab, setActiveTab, organisationName, logoUrl, iconUrl, colours, typography }) {
  return (
    <OrganisationCard title="Email & Portal Preview" description="Preview how brand assets appear in portals, emails and PDFs before saving.">
      <div className="flex flex-wrap gap-2">
        <PreviewTabButton active={activeTab === 'portal'} onClick={() => setActiveTab('portal')}>
          <Monitor className="h-4 w-4" strokeWidth={2} />
          Portal
        </PreviewTabButton>
        <PreviewTabButton active={activeTab === 'email'} onClick={() => setActiveTab('email')}>
          <Mail className="h-4 w-4" strokeWidth={2} />
          Email
        </PreviewTabButton>
        <PreviewTabButton active={activeTab === 'pdf'} onClick={() => setActiveTab('pdf')}>
          <FileText className="h-4 w-4" strokeWidth={2} />
          PDF
        </PreviewTabButton>
      </div>
      <div className="mt-5">
        <BrandPreviewSurface activeTab={activeTab} organisationName={organisationName} logoUrl={logoUrl} iconUrl={iconUrl} colours={colours} typography={typography} />
      </div>
    </OrganisationCard>
  )
}

function BrandPreviewPanel({ organisationName, logoUrl, iconUrl, colours, typography, brandHealth, configuredAssetCount }) {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-4 space-y-4 rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)]">
        <div>
          <h2 className="text-base font-semibold text-[#17233a]">Brand Preview</h2>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">Live portal and email signals.</p>
        </div>
        <BrandPreviewSurface activeTab="portal" organisationName={organisationName} logoUrl={logoUrl} iconUrl={iconUrl} colours={colours} typography={typography} />
        <div className="space-y-3 border-y border-[#e5edf4] py-4">
          <OverviewRow label="Brand Health" value={`${brandHealth}%`} verified={brandHealth >= 80} />
          <OverviewRow label="Assets" value={configuredAssetCount} verified={configuredAssetCount >= 3} />
          <OverviewRow label="Colours" value="Configured" verified />
        </div>
        <div className="rounded-[16px] bg-[#f8fbfa] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#17233a]">
            <HelpCircle className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} />
            Need Help?
          </div>
          <Link
            to="/settings/help"
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
          >
            Brand Guidelines
          </Link>
        </div>
      </div>
    </aside>
  )
}

function OnboardingLandingLogoRow({ title, description, previewUrl, previewTone = 'light', canEdit = false, uploading = false, onFile }) {
  return (
    <article className="grid gap-3 rounded-[16px] border border-[#e1eaf3] bg-[#fbfdff] p-3">
      <div className="flex items-center gap-3">
        <span
          className={[
            'inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border p-2 text-xs font-semibold',
            previewTone === 'dark'
              ? 'border-[#17324d] bg-[#10273a] text-white/70'
              : 'border-[#d9e3ef] bg-white text-[#60758d]',
          ].join(' ')}
        >
          {previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-contain" /> : 'Logo'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#17233a]">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-[#60758d]">{description}</span>
        </span>
      </div>
      {canEdit ? (
        <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]">
          <UploadCloud className="h-4 w-4" strokeWidth={2} />
          {uploading ? 'Uploading...' : previewUrl ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onFile?.(file)
              event.target.value = ''
            }}
          />
        </label>
      ) : null}
    </article>
  )
}

function OnboardingLandingPreviewSurface({ portalType = 'buyer', organisationName, logoUrl, iconUrl, colours }) {
  const copy = ONBOARDING_LANDING_COPY[portalType] || ONBOARDING_LANDING_COPY.buyer
  const primary = colours.primary
  const secondary = colours.secondary
  const accent = colours.accent
  const accentText = getContrastTextColour(accent, secondary)
  const overlay = `linear-gradient(120deg, ${hexToRgba(primary, 0.98)} 0%, ${hexToRgba(secondary, 0.92)} 48%, ${hexToRgba(secondary, 0.72)} 100%)`

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#dfe8f1] bg-[#0b1728] shadow-[0_16px_34px_rgba(15,23,42,0.12)]">
      <div className="p-4 text-white sm:p-5" style={{ background: overlay }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/15 bg-white/10 p-2 text-sm font-semibold text-white">
              {logoUrl || iconUrl ? <img src={logoUrl || iconUrl} alt="" className="h-full w-full object-contain" /> : getInitials(organisationName)}
            </span>
            <span className="truncate text-sm font-semibold">{organisationName}</span>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase text-white/75">
            Secure intake
          </span>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_190px] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>{copy.label}</p>
            <h3 className="mt-3 max-w-[440px] text-2xl font-semibold leading-tight text-white sm:text-3xl">
              {copy.headline}
            </h3>
            <p className="mt-3 max-w-[390px] text-sm leading-6 text-white/75">
              A standard first screen for buyer and seller intake links.
            </p>
            <span
              className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] px-4 text-sm font-semibold"
              style={{ backgroundColor: accent, color: accentText, boxShadow: `0 14px 28px ${hexToRgba(accent, 0.24)}` }}
            >
              {copy.cta}
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </span>
          </div>
          <div className="grid gap-2 rounded-[16px] border border-white/15 bg-white/10 p-3 backdrop-blur">
            <span className="text-[11px] font-semibold uppercase text-white/55">Before you start</span>
            <span className="rounded-[12px] bg-white/10 px-3 py-2 text-xs font-semibold text-white/80">Property details</span>
            <span className="rounded-[12px] bg-white/10 px-3 py-2 text-xs font-semibold text-white/80">Secure profile</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function OnboardingLandingBrandingCard({
  organisationName,
  logoUrl,
  darkLogoUrl,
  iconUrl,
  colours,
  activePortalType,
  setActivePortalType,
  canEdit,
  uploadingLogoTarget,
  onUploadLogo,
  onColourChange,
}) {
  const previewLogoUrl = darkLogoUrl || logoUrl || iconUrl
  const logoRows = [
    {
      key: 'logoLight',
      title: 'Primary Logo',
      description: 'Used when the landing header sits on lighter brand surfaces.',
      previewUrl: logoUrl,
    },
    {
      key: 'logoDark',
      title: 'Dark Logo',
      description: 'Used first on the buyer and seller onboarding landing.',
      previewUrl: darkLogoUrl,
      previewTone: 'dark',
    },
    {
      key: 'logoIcon',
      title: 'Icon Logo',
      description: 'Fallback mark for compact and mobile landing headers.',
      previewUrl: iconUrl,
    },
  ]

  return (
    <OrganisationCard title="Buyer / Seller Onboarding Landing" description="Standard landing page for buyer and seller intake links. Copy and layout stay locked; logos and colours come from branding settings.">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <PreviewTabButton active={activePortalType === 'buyer'} onClick={() => setActivePortalType('buyer')}>
              Buyer
            </PreviewTabButton>
            <PreviewTabButton active={activePortalType === 'seller'} onClick={() => setActivePortalType('seller')}>
              Seller
            </PreviewTabButton>
          </div>
          <OnboardingLandingPreviewSurface
            portalType={activePortalType}
            organisationName={organisationName}
            logoUrl={previewLogoUrl}
            iconUrl={iconUrl}
            colours={colours}
          />
        </div>

        <div className="space-y-4">
          <div className="grid gap-3">
            {logoRows.map((row) => (
              <OnboardingLandingLogoRow
                key={row.key}
                title={row.title}
                description={row.description}
                previewUrl={row.previewUrl}
                previewTone={row.previewTone}
                canEdit={canEdit}
                uploading={uploadingLogoTarget === row.key}
                onFile={(file) => onUploadLogo?.(file, row.key)}
              />
            ))}
          </div>
          <div className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-3">
            <div className="grid gap-3">
              {ONBOARDING_LANDING_COLOUR_CONTROLS.map((control) => (
                <ColourControl
                  key={control.key}
                  label={control.label}
                  value={colours[control.key] || control.fallback}
                  disabled={!canEdit}
                  onChange={(value) => onColourChange(control.key, value)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </OrganisationCard>
  )
}

function PermissionRow({ title, description, checked, disabled, onChange }) {
  return (
    <div className="flex flex-col gap-3 border-t border-[#e5edf4] py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-[#17233a]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[#60758d]">{description}</p>
      </div>
      <OrganisationSwitch checked={checked} disabled={disabled} label={title} onChange={onChange} />
    </div>
  )
}

function OverviewRow({ label, value, verified = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-[#31455c]">{label}</span>
      <span className={verified ? 'inline-flex items-center gap-1 text-sm font-semibold text-[#0f7f4f]' : 'text-sm font-semibold text-[#60758d]'}>
        {verified ? <CheckCircle2 className="h-4 w-4" strokeWidth={2} /> : null}
        {value}
      </span>
    </div>
  )
}

export default function SettingsOrganisationPage({ section = 'organisation' }) {
  const { role, currentWorkspace, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const copyKey = WORKSPACE_TYPE_COPY_KEYS[resolvedWorkspaceType] || (role === 'bond_originator' ? 'bond' : 'agency')
  const isBondOriginator = copyKey === 'bond'
  const copy = isBondOriginator ? BOND_SETTINGS_COPY : AGENCY_SETTINGS_COPY
  const {
    state: organisationContextState,
    loading: organisationContextLoading,
    error: organisationContextError,
    applyOrganisationState,
    refreshOrganisation,
  } = useOrganisation()
  const [state, setState] = useState(null)
  const [initialState, setInitialState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogoTarget, setUploadingLogoTarget] = useState('')
  const [brandPreviewTab, setBrandPreviewTab] = useState('portal')
  const [onboardingPreviewType, setOnboardingPreviewType] = useState('buyer')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (organisationContextLoading) {
        setLoading(true)
        return
      }

      if (organisationContextState) {
        setState(organisationContextState)
        setInitialState(organisationContextState)
        setError('')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await refreshOrganisation({ forceRefresh: true })
        if (active) {
          setState(response)
          setInitialState(response)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || organisationContextError)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [organisationContextError, organisationContextLoading, organisationContextState, refreshOrganisation])

  const form = useMemo(() => state?.organisation || null, [state])
  const onboarding = useMemo(() => state?.onboarding || null, [state])
  const membershipRole = normalizeOrganisationMembershipRole(state?.membershipRole, {
    appRole: role,
    workspaceType: resolvedWorkspaceType,
  })
  const canEdit = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
    workspaceType: resolvedWorkspaceType,
  })
  const showBrandingOnly = section === 'branding'
  const hasUnsavedChanges = state && initialState ? JSON.stringify(state) !== JSON.stringify(initialState) : false

  useEffect(() => {
    if (!hasUnsavedChanges || typeof window === 'undefined') return undefined
    const unsavedPrompt = showBrandingOnly ? BRANDING_UNSAVED_PROMPT : ORGANISATION_UNSAVED_PROMPT

    function handleBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }

    function handleDocumentClick(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : event.target?.parentElement
      const anchor = target?.closest?.('a[href]')
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return
      const nextUrl = new URL(anchor.href, window.location.href)
      if (nextUrl.origin !== window.location.origin || nextUrl.pathname === window.location.pathname) return
      if (window.confirm(unsavedPrompt)) return
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleDocumentClick, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleDocumentClick, true)
    }
  }, [hasUnsavedChanges, showBrandingOnly])

  function updateField(key, value) {
    setMessage('')
    setState((previous) => ({
      ...previous,
      organisation: {
        ...previous.organisation,
        [key]: value,
      },
    }))
  }

  function updateAgencyField(key, value) {
    setMessage('')
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        agencyInformation: {
          ...(previous.onboarding?.agencyInformation || {}),
          [key]: value,
        },
      },
    }))
  }

  function updateOrganisationAddress(value) {
    setMessage('')
    setState((previous) => {
      const nextAddress = value
        ? {
            formattedAddress: value.formattedAddress || '',
            addressLine1: value.streetAddress || value.formattedAddress || '',
            suburb: value.suburb || '',
            city: value.city || '',
            province: value.province || '',
            country: value.country || 'South Africa',
            postalCode: value.postalCode || '',
            latitude: value.latitude ?? null,
            longitude: value.longitude ?? null,
            googlePlaceId: value.placeId || value.googlePlaceId || '',
          }
        : {
            formattedAddress: '',
            addressLine1: '',
            suburb: '',
            city: '',
            province: '',
            country: 'South Africa',
            postalCode: '',
            latitude: null,
            longitude: null,
            googlePlaceId: '',
          }

      return {
        ...previous,
        organisation: {
          ...previous.organisation,
          ...nextAddress,
        },
        onboarding: {
          ...previous.onboarding,
          agencyInformation: {
            ...(previous.onboarding?.agencyInformation || {}),
            physicalAddress: nextAddress.addressLine1,
            formattedAddress: nextAddress.formattedAddress,
            province: nextAddress.province,
            country: nextAddress.country,
          },
        },
      }
    })
  }

  function updatePrincipalField(key, value) {
    setMessage('')
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        principalInformation: {
          ...(previous.onboarding?.principalInformation || {}),
          [key]: value,
        },
      },
    }))
  }

  function updatePermissionField(key, value) {
    setMessage('')
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        permissions: {
          ...(previous.onboarding?.permissions || {}),
          [key]: value,
        },
      },
    }))
  }

  function updateBrandColour(key, value) {
    setMessage('')
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        branding: {
          ...(previous.onboarding?.branding || {}),
          brandColours: {
            ...(previous.onboarding?.branding?.brandColours || {}),
            [key]: value,
          },
        },
      },
    }))
  }

  function updateBrandingNestedField(sectionKey, key, value) {
    setMessage('')
    setState((previous) => ({
      ...previous,
      onboarding: {
        ...previous.onboarding,
        branding: {
          ...(previous.onboarding?.branding || {}),
          [sectionKey]: {
            ...(previous.onboarding?.branding?.[sectionKey] || {}),
            [key]: value,
          },
        },
      },
    }))
  }

  function updatePublicBrandField(key, value) {
    setMessage('')
    setState((previous) => {
      const nextState = {
        ...previous,
        onboarding: {
          ...previous.onboarding,
          branding: {
            ...(previous.onboarding?.branding || {}),
            publicIdentity: {
              ...(previous.onboarding?.branding?.publicIdentity || {}),
              [key]: value,
            },
          },
        },
      }

      if (key === 'website') {
        nextState.organisation = {
          ...previous.organisation,
          website: value,
        }
        nextState.onboarding.agencyInformation = {
          ...(previous.onboarding?.agencyInformation || {}),
          website: value,
        }
      }

      if (key === 'supportEmail') {
        nextState.organisation = {
          ...(nextState.organisation || previous.organisation),
          supportEmail: value,
        }
      }

      return nextState
    })
  }

  function clearBrandAsset(targetKey) {
    const assetConfig = BRAND_ASSET_TARGETS[targetKey]
    if (!assetConfig) return
    setMessage('')
    setState((previous) => {
      const brandingState = previous.onboarding?.branding || {}
      const previousUrl = normalizeText(brandingState[targetKey])
      const previousName = normalizeText(brandingState[`${targetKey}Name`])
      const currentHistory = getBrandAssetHistory(brandingState, targetKey)
      const nextHistory = previousUrl
        ? [{ url: previousUrl, fileName: previousName || assetConfig.title, replacedAt: new Date().toISOString() }, ...currentHistory].slice(0, 3)
        : currentHistory
      return {
        ...previous,
        organisation: targetKey === 'logoLight'
          ? {
              ...previous.organisation,
              logoUrl: '',
            }
          : previous.organisation,
        onboarding: {
          ...previous.onboarding,
          branding: {
            ...brandingState,
            [targetKey]: '',
            [`${targetKey}Name`]: '',
            [assetConfig.bucketField]: '',
            [assetConfig.pathField]: '',
            assetHistory: {
              ...(brandingState.assetHistory || {}),
              [targetKey]: nextHistory,
            },
          },
        },
      }
    })
  }

  function rollbackBrandAsset(targetKey, historyEntry = {}) {
    const assetConfig = BRAND_ASSET_TARGETS[targetKey]
    const url = normalizeText(historyEntry.url)
    if (!assetConfig || !url) return
    setMessage('')
    setState((previous) => {
      const brandingState = previous.onboarding?.branding || {}
      return {
        ...previous,
        organisation: targetKey === 'logoLight'
          ? {
              ...previous.organisation,
              logoUrl: url,
            }
          : previous.organisation,
        onboarding: {
          ...previous.onboarding,
          branding: {
            ...brandingState,
            [targetKey]: url,
            [`${targetKey}Name`]: normalizeText(historyEntry.fileName) || assetConfig.title,
            assetHistory: {
              ...(brandingState.assetHistory || {}),
              [targetKey]: getBrandAssetHistory(brandingState, targetKey).filter((entry) => normalizeText(entry.url) !== url),
            },
          },
        },
      }
    })
  }

  async function copyBrandHex(value) {
    const hexValue = normalizeText(value).toUpperCase()
    if (!hexValue) return
    try {
      await navigator.clipboard?.writeText(hexValue)
      setMessage(`${hexValue} copied.`)
    } catch {
      setMessage(`${hexValue} ready to copy.`)
    }
  }

  function updateOrganisationDefault(key, value) {
    setMessage('')
    setState((previous) => {
      const settingsJson = previous.organisation?.settingsJson || {}
      return {
        ...previous,
        organisation: {
          ...previous.organisation,
          settingsJson: {
            ...settingsJson,
            organisationDefaults: {
              ...ORGANISATION_DEFAULTS,
              ...(settingsJson.organisationDefaults || {}),
              [key]: value,
            },
          },
        },
      }
    })
  }

  async function handleLogoUpload(file, targetKey) {
    if (!file || !canEdit || !state) return
    const validationError = validateBrandAssetFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    try {
      const assetConfig = BRAND_ASSET_TARGETS[targetKey] || BRAND_ASSET_TARGETS.logoLight
      setUploadingLogoTarget(targetKey)
      setError('')
      setMessage('')
      const upload = await uploadOrganisationBrandingAsset({
        file,
        variant: assetConfig.variant,
      })
      const assetUrl = upload.resolvedUrl || upload.signedUrl || upload.publicUrl || ''
      const previousBranding = state.onboarding?.branding || {}
      const previousUrl = normalizeText(previousBranding[targetKey])
      const previousName = normalizeText(previousBranding[`${targetKey}Name`])
      const currentHistory = getBrandAssetHistory(previousBranding, targetKey)
      const nextHistory = previousUrl
        ? [{ url: previousUrl, fileName: previousName || assetConfig.title, replacedAt: new Date().toISOString() }, ...currentHistory].slice(0, 3)
        : currentHistory
      const nextBranding = {
        ...previousBranding,
        [targetKey]: assetUrl || previousBranding[targetKey] || '',
        [`${targetKey}Name`]: file.name,
        [assetConfig.bucketField]: upload.bucket || previousBranding[assetConfig.bucketField] || '',
        [assetConfig.pathField]: upload.path || previousBranding[assetConfig.pathField] || '',
        assetHistory: {
          ...(previousBranding.assetHistory || {}),
          [targetKey]: nextHistory,
        },
      }

      if (targetKey === 'logoIcon') {
        for (const generatedTarget of ['favicon', 'portalIcon', 'mobileIcon', 'browserTile']) {
          if (!normalizeText(nextBranding[generatedTarget])) {
            const generatedConfig = BRAND_ASSET_TARGETS[generatedTarget]
            nextBranding[generatedTarget] = assetUrl
            nextBranding[`${generatedTarget}Name`] = file.name
            nextBranding[`${generatedTarget}GeneratedFrom`] = 'Generated from Icon Logo'
            nextBranding[generatedConfig.bucketField] = upload.bucket || ''
            nextBranding[generatedConfig.pathField] = upload.path || ''
          }
        }
      }

      const nextState = {
        ...state,
        onboarding: {
          ...state.onboarding,
          branding: nextBranding,
        },
        organisation: targetKey === 'logoLight'
          ? {
              ...state.organisation,
              logoUrl: assetUrl || state.organisation?.logoUrl || '',
            }
          : state.organisation,
      }

      setState(nextState)

      const saveTasks = [saveAgencyOnboardingDraft(nextState.onboarding)]
      if (targetKey === 'logoLight') {
        saveTasks.push(updateOrganisationSettings(nextState.organisation))
      }
      await Promise.all(saveTasks)

      applyOrganisationState(nextState)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('itg:organisation-branding-updated'))
      }

      setMessage(targetKey === 'logoIcon' ? 'Icon logo uploaded and applied.' : targetKey === 'logoDark' ? 'Dark logo uploaded and applied.' : `${assetConfig.title} uploaded and applied.`)
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload the selected logo. Please try again.')
    } finally {
      setUploadingLogoTarget('')
    }
  }

  async function handleSave(event) {
    event?.preventDefault?.()
    if (!canEdit || !state) return

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const [organisationResponse, onboardingResponse] = await Promise.all([
        updateOrganisationSettings(state.organisation),
        saveAgencyOnboardingDraft({
          ...state.onboarding,
          organisationType: isBondOriginator ? 'bond_originator' : state.onboarding?.organisationType,
        }, { syncCommercialAccess: true }),
      ])

      await upsertAreaFromAddress(buildOrganisationAddressValue(state.organisation, state.onboarding), { incrementListingCount: false })

      const nextState = {
        ...state,
        ...organisationResponse,
        membershipRole: organisationResponse.membershipRole || onboardingResponse.membershipRole || state?.membershipRole || 'viewer',
        onboarding: onboardingResponse.onboarding,
      }

      setState((previous) => ({
        ...previous,
        ...nextState,
      }))
      setInitialState(nextState)
      applyOrganisationState(nextState)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('itg:organisation-branding-updated'))
      }

      setMessage(showBrandingOnly ? BRANDING_SUCCESS_MESSAGE : ORGANISATION_SUCCESS_MESSAGE)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SettingsLoadingState label="Loading organisation settings…" />
  }

  if (!form || !onboarding) {
    return (
      <div className={settingsPageClass}>
        <OrganisationPageHeader sectionTitle={showBrandingOnly ? 'Branding' : 'Organisation'} />
        <SettingsBanner tone="warning">{error || copy.unavailable}</SettingsBanner>
      </div>
    )
  }

  const agencyInfo = onboarding.agencyInformation || {}
  const principal = onboarding.principalInformation || {}
  const permissions = onboarding.permissions || {}
  const branding = onboarding.branding || {}
  const brandColours = branding.brandColours || {}
  const branchRows = getBranchRows(onboarding)
  const branchCount = branchRows.length
  const managerCount = getManagerCount(branchRows)
  const userCount = getBranchUserCount(branchRows)
  const organisationName = getOrganisationDisplayName(form, onboarding)
  const organisationTypeLabel = getOrganisationTypeLabel(onboarding)
  const primaryLogo = getPrimaryLogo(form, onboarding)
  const primaryColour = getBrandColourValue(brandColours, 'primary', '#274C69')
  const secondaryColour = getBrandColourValue(brandColours, 'secondary', '#10273A')
  const accentColour = getBrandColourValue(brandColours, 'accent', '#F7CF22')
  const defaults = getOrganisationDefaults(form)
  const isPpraVerified = Boolean(normalizeText(agencyInfo.eaabPpraNumber))
  const isRegistrationVerified = Boolean(normalizeText(agencyInfo.companyRegistrationNumber))
  const isBrandingConfigured = Boolean(primaryLogo || branding.logoIcon || branding.logoDark)
  const addressText = normalizeText(form.formattedAddress || [form.city, form.province].filter(Boolean).join(', ')) || 'Johannesburg, Gauteng'
  const publicProfileTarget = form.id ? `/organisation/${encodeURIComponent(form.id)}` : '/settings/organisation'
  const brandColourValues = BRAND_COLOUR_CONTROLS.reduce((accumulator, control) => ({
    ...accumulator,
    [control.key]: getBrandColourValue(brandColours, control.key, control.fallback),
  }), {})
  const onboardingLandingColours = getOnboardingLandingColours(brandColours)
  const typography = getBrandTypography(branding)
  const publicBranding = getPublicBranding(form, agencyInfo, branding)
  const configuredBrandAssetCount = getConfiguredBrandAssetCount(branding)
  const brandHealth = getBrandHealthScore({ branding, brandColours, publicBranding })
  const brandLastUpdatedLabel = getBrandLastUpdatedLabel(onboarding.status?.lastSavedAt)
  const isSaveSuccessMessage = message === ORGANISATION_SUCCESS_MESSAGE || message === BRANDING_SUCCESS_MESSAGE

  if (showBrandingOnly) {
    const primaryAssetUrl = normalizeText(branding.logoLight || primaryLogo)
    const iconAssetUrl = normalizeText(branding.logoIcon)
    const mainBrandAssets = [
      {
        targetKey: 'logoLight',
        description: 'Used in sidebars, portals, reports and organisation headers.',
        previewUrl: primaryAssetUrl,
      },
      {
        targetKey: 'logoDark',
        description: 'Used on dark email headers and high-contrast brand surfaces.',
        previewUrl: branding.logoDark,
        previewTone: 'dark',
      },
      {
        targetKey: 'logoIcon',
        description: 'Square mark used for compact navigation, avatars and generated icons.',
        previewUrl: iconAssetUrl,
      },
    ]
    const appIconAssets = [
      {
        targetKey: 'favicon',
        description: 'Browser tab icon generated from or uploaded separately from your icon logo.',
        previewUrl: branding.favicon || iconAssetUrl,
        icon: Globe2,
      },
      {
        targetKey: 'portalIcon',
        description: 'Compact portal mark for client workspace headers.',
        previewUrl: branding.portalIcon || iconAssetUrl,
        icon: Monitor,
      },
      {
        targetKey: 'mobileIcon',
        description: 'Mobile shortcut icon for app-like portal experiences.',
        previewUrl: branding.mobileIcon || iconAssetUrl,
        icon: Smartphone,
      },
      {
        targetKey: 'browserTile',
        description: 'Pinned browser tile for supported browser surfaces.',
        previewUrl: branding.browserTile || iconAssetUrl,
        icon: Palette,
      },
    ]

    return (
      <div className={settingsPageClass}>
        <OrganisationPageHeader
          sectionTitle="Branding"
          description="Manage your agency's visual identity across Arch9, client portals and communications."
        />

        {!canEdit ? <SettingsBanner tone="warning">{copy.readOnly}</SettingsBanner> : null}
        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        {message && !isSaveSuccessMessage ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
        {isSaveSuccessMessage ? (
          <div className="fixed bottom-6 right-6 z-40 max-w-sm rounded-[16px] border border-[#ccead8] bg-white px-4 py-3 text-sm font-semibold text-[#1f7a45] shadow-[0_18px_42px_rgba(15,23,42,0.14)]" role="status">
            {message}
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSave}>
          <BrandHero
            organisationName={organisationName}
            primaryLogo={primaryAssetUrl}
            configuredAssetCount={configuredBrandAssetCount}
            brandHealth={brandHealth}
            lastUpdatedLabel={brandLastUpdatedLabel}
            canEdit={canEdit}
            uploading={uploadingLogoTarget === 'logoLight'}
            onPreview={() => setBrandPreviewTab('portal')}
            onUpload={(file) => handleLogoUpload(file, 'logoLight')}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,920px)_300px] xl:items-start">
            <div className="space-y-6">
              <OrganisationCard title="Brand Assets" description="Manage the core logos used across portals, emails, reports and workspace surfaces.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {mainBrandAssets.map((asset) => {
                    const config = BRAND_ASSET_TARGETS[asset.targetKey]
                    return (
                      <BrandAssetTile
                        key={asset.targetKey}
                        title={config.title}
                        description={asset.description}
                        previewUrl={asset.previewUrl}
                        previewTone={asset.previewTone}
                        fileName={branding[`${asset.targetKey}Name`]}
                        formats={config.formats}
                        dimensions={config.dimensions}
                        canEdit={canEdit}
                        uploading={uploadingLogoTarget === asset.targetKey}
                        fallback={`${config.title} not uploaded`}
                        history={getBrandAssetHistory(branding, asset.targetKey)}
                        onFile={(file) => handleLogoUpload(file, asset.targetKey)}
                        onDelete={() => clearBrandAsset(asset.targetKey)}
                        onRollback={(entry) => rollbackBrandAsset(asset.targetKey, entry)}
                      />
                    )
                  })}
                </div>
              </OrganisationCard>

              <OrganisationCard title="Brand Colours" description="Set the core palette that drives buttons, email headers, portal accents and PDF previews.">
                <div className="rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
                  {BRAND_COLOUR_CONTROLS.map((control) => (
                    <BrandColourRow
                      key={control.key}
                      label={control.label}
                      value={brandColours[control.key] || control.fallback}
                      disabled={!canEdit}
                      onChange={(value) => updateBrandColour(control.key, value)}
                      onCopy={() => copyBrandHex(brandColours[control.key] || control.fallback)}
                    />
                  ))}
                </div>
              </OrganisationCard>

              <OnboardingLandingBrandingCard
                organisationName={organisationName}
                logoUrl={primaryAssetUrl}
                darkLogoUrl={branding.logoDark}
                iconUrl={iconAssetUrl}
                colours={onboardingLandingColours}
                activePortalType={onboardingPreviewType}
                setActivePortalType={setOnboardingPreviewType}
                canEdit={canEdit}
                uploadingLogoTarget={uploadingLogoTarget}
                onUploadLogo={(file, targetKey) => handleLogoUpload(file, targetKey)}
                onColourChange={(key, value) => updateBrandColour(key, value)}
              />

              <OrganisationCard title="Typography" description="Keep text, buttons and rounded controls consistent across branded surfaces.">
                <div className="grid gap-4 md:grid-cols-2">
                  <OrganisationField label="Primary Font" id="branding-primary-font">
                    <Field as="select" id="branding-primary-font" className={INPUT_CLASS} value={typography.primaryFont} disabled={!canEdit} onChange={(event) => updateBrandingNestedField('typography', 'primaryFont', event.target.value)}>
                      <option value="Inter">Inter</option>
                      <option value="Geist">Geist</option>
                      <option value="Arial">Arial</option>
                    </Field>
                  </OrganisationField>
                  <OrganisationField label="Weight" id="branding-font-weight">
                    <Field as="select" id="branding-font-weight" className={INPUT_CLASS} value={typography.weight} disabled={!canEdit} onChange={(event) => updateBrandingNestedField('typography', 'weight', event.target.value)}>
                      <option value="Regular">Regular</option>
                      <option value="Medium">Medium</option>
                      <option value="Semibold">Semibold</option>
                    </Field>
                  </OrganisationField>
                  <OrganisationField label="Button Style" id="branding-button-style">
                    <Field as="select" id="branding-button-style" className={INPUT_CLASS} value={typography.buttonStyle} disabled={!canEdit} onChange={(event) => updateBrandingNestedField('typography', 'buttonStyle', event.target.value)}>
                      <option value="Rounded">Rounded</option>
                      <option value="Soft">Soft</option>
                      <option value="Square">Square</option>
                    </Field>
                  </OrganisationField>
                  <OrganisationField label="Border Radius" id="branding-border-radius">
                    <Field as="select" id="branding-border-radius" className={INPUT_CLASS} value={typography.borderRadius} disabled={!canEdit} onChange={(event) => updateBrandingNestedField('typography', 'borderRadius', event.target.value)}>
                      <option value="8px">8px</option>
                      <option value="12px">12px</option>
                      <option value="16px">16px</option>
                    </Field>
                  </OrganisationField>
                </div>
                <div className="mt-5 flex items-center gap-3 rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
                  <Type className="h-5 w-5 text-[#0f7f4f]" strokeWidth={2} />
                  <p className="text-sm leading-6 text-[#60758d]">Typography settings are stored with your brand profile and reflected in previews before saving.</p>
                </div>
              </OrganisationCard>

              <BrandPreviewWorkspace
                activeTab={brandPreviewTab}
                setActiveTab={setBrandPreviewTab}
                organisationName={organisationName}
                logoUrl={primaryAssetUrl}
                iconUrl={iconAssetUrl}
                colours={brandColourValues}
                typography={typography}
              />

              <OrganisationCard title="App Icons" description="Manage compact assets for favicons, portals, mobile shortcuts and browser tiles.">
                <div className="grid gap-4 md:grid-cols-2">
                  {appIconAssets.map((asset) => {
                    const config = BRAND_ASSET_TARGETS[asset.targetKey]
                    const Icon = asset.icon
                    return (
                      <BrandAssetTile
                        key={asset.targetKey}
                        title={config.title}
                        description={asset.description}
                        previewUrl={asset.previewUrl}
                        fileName={branding[`${asset.targetKey}Name`]}
                        formats={config.formats}
                        dimensions={config.dimensions}
                        canEdit={canEdit}
                        uploading={uploadingLogoTarget === asset.targetKey}
                        fallback={<span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" strokeWidth={2} /> {config.title} not uploaded</span>}
                        history={getBrandAssetHistory(branding, asset.targetKey)}
                        generatedFrom={!branding[asset.targetKey] && iconAssetUrl ? 'Generated from Icon Logo' : branding[`${asset.targetKey}GeneratedFrom`]}
                        onFile={(file) => handleLogoUpload(file, asset.targetKey)}
                        onDelete={() => clearBrandAsset(asset.targetKey)}
                        onRollback={(entry) => rollbackBrandAsset(asset.targetKey, entry)}
                      />
                    )
                  })}
                </div>
              </OrganisationCard>

              <OrganisationCard title="Public Branding" description="External identity details used in client portals, email footers and branded communication surfaces.">
                <div className="grid gap-4 md:grid-cols-2">
                  <OrganisationField label="Website" id="branding-public-website">
                    <Field id="branding-public-website" className={INPUT_CLASS} value={publicBranding.website} disabled={!canEdit} onChange={(event) => updatePublicBrandField('website', event.target.value)} />
                  </OrganisationField>
                  <OrganisationField label="Support Email" id="branding-public-support-email">
                    <Field id="branding-public-support-email" className={INPUT_CLASS} value={publicBranding.supportEmail} disabled={!canEdit} onChange={(event) => updatePublicBrandField('supportEmail', event.target.value)} />
                  </OrganisationField>
                  <OrganisationField label="Facebook" id="branding-public-facebook">
                    <Field id="branding-public-facebook" className={INPUT_CLASS} value={publicBranding.facebook} disabled={!canEdit} onChange={(event) => updatePublicBrandField('facebook', event.target.value)} />
                  </OrganisationField>
                  <OrganisationField label="LinkedIn" id="branding-public-linkedin">
                    <Field id="branding-public-linkedin" className={INPUT_CLASS} value={publicBranding.linkedIn} disabled={!canEdit} onChange={(event) => updatePublicBrandField('linkedIn', event.target.value)} />
                  </OrganisationField>
                  <OrganisationField label="Instagram" id="branding-public-instagram" className="md:col-span-2">
                    <Field id="branding-public-instagram" className={INPUT_CLASS} value={publicBranding.instagram} disabled={!canEdit} onChange={(event) => updatePublicBrandField('instagram', event.target.value)} />
                  </OrganisationField>
                </div>
              </OrganisationCard>
            </div>

            <BrandPreviewPanel
              organisationName={organisationName}
              logoUrl={primaryAssetUrl}
              iconUrl={iconAssetUrl}
              colours={brandColourValues}
              typography={typography}
              brandHealth={brandHealth}
              configuredAssetCount={configuredBrandAssetCount}
            />
          </div>
        </form>

        {canEdit ? (
          <SettingsStickySaveBar
            dirty={Boolean(hasUnsavedChanges)}
            saving={saving}
            message="Unsaved Branding Changes"
            discardLabel="Discard"
            saveLabel="Save Branding"
            onDiscard={() => {
              setState(initialState)
              setMessage('')
              setError('')
            }}
            onSave={handleSave}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className={settingsPageClass}>
      <OrganisationPageHeader
        sectionTitle={showBrandingOnly ? 'Branding' : 'Organisation'}
        description={showBrandingOnly ? 'Manage logos, colours, and brand assets used across Arch9.' : 'Manage your agency information, branding, permissions and operational defaults.'}
      />

      {!canEdit ? <SettingsBanner tone="warning">{copy.readOnly}</SettingsBanner> : null}
      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {message && !isSaveSuccessMessage ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
      {isSaveSuccessMessage ? (
        <div className="fixed bottom-6 right-6 z-40 max-w-sm rounded-[16px] border border-[#ccead8] bg-white px-4 py-3 text-sm font-semibold text-[#1f7a45] shadow-[0_18px_42px_rgba(15,23,42,0.14)]" role="status">
          {message}
        </div>
      ) : null}

      <form className="space-y-6" onSubmit={handleSave}>
        {!showBrandingOnly ? (
          <section className="rounded-[24px] border border-[#dfe8f1] bg-white p-5 shadow-[0_18px_46px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-center">
              <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
                <LogoMark logoUrl={primaryLogo} name={organisationName} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 text-[1.45rem] font-semibold leading-tight text-[#17233a]">{organisationName}</h2>
                    <VerificationBadge verified={isPpraVerified}>{isPpraVerified ? 'EAAB Verified' : 'EAAB Pending'}</VerificationBadge>
                    {isRegistrationVerified ? <VerificationBadge verified>Pty Ltd</VerificationBadge> : null}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#40566d]">{organisationTypeLabel}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm leading-6 text-[#60758d]">
                    <MapPin className="h-4 w-4" strokeWidth={2} />
                    {addressText}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#60758d]">
                    <span className="font-semibold text-[#40566d]">Primary Contact</span>
                    {' '}
                    {principal.principalFullName || form.primaryContactPerson || 'Not assigned'}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {canEdit ? (
                      <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#0f7f4f] bg-[#0f7f4f] px-4 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(15,127,79,0.18)] transition hover:bg-[#0d6f45]">
                        <Camera className="h-4 w-4" strokeWidth={2} />
                        {uploadingLogoTarget === 'logoLight' ? 'Uploading...' : 'Upload Logo'}
                        <input
                          type="file"
                          accept="image/png,image/svg+xml,image/jpeg,image/webp"
                          className="sr-only"
                          disabled={uploadingLogoTarget === 'logoLight'}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) void handleLogoUpload(file, 'logoLight')
                            event.target.value = ''
                          }}
                        />
                      </label>
                    ) : null}
                    <Link
                      to={publicProfileTarget}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:bg-[#f7fafc]"
                    >
                      <ExternalLink className="h-4 w-4" strokeWidth={2} />
                      View Public Profile
                    </Link>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <StatTile label="Users" value={userCount}>
                  <UsersRound className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} />
                </StatTile>
                <StatTile label={copy.branchCountLabel} value={branchCount}>
                  <GitBranch className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} />
                </StatTile>
                <StatTile label="Active Managers" value={managerCount}>
                  <ShieldCheck className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} />
                </StatTile>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,920px)_280px] xl:items-start">
          <div className="space-y-6">
            {!showBrandingOnly ? (
              <>
                <OrganisationCard title="Agency Information" description="General company information.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <OrganisationField label={copy.organisationNameLabel} id="organisation-agency-name">
                      <Field
                        id="organisation-agency-name"
                        className={INPUT_CLASS}
                        value={agencyInfo.agencyName || ''}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const value = event.target.value
                          updateAgencyField('agencyName', value)
                          updateField('name', value)
                        }}
                      />
                    </OrganisationField>
                    <OrganisationField label="Trading Name" id="organisation-trading-name">
                      <Field
                        id="organisation-trading-name"
                        className={INPUT_CLASS}
                        value={agencyInfo.tradingName || ''}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const value = event.target.value
                          updateAgencyField('tradingName', value)
                          updateField('displayName', value)
                        }}
                      />
                    </OrganisationField>
                    <OrganisationField
                      label="Registration Number"
                      id="organisation-registration-number"
                      badge={isRegistrationVerified ? <VerificationBadge verified>Verified</VerificationBadge> : null}
                    >
                      <Field
                        id="organisation-registration-number"
                        className={INPUT_CLASS}
                        value={agencyInfo.companyRegistrationNumber || ''}
                        disabled={!canEdit}
                        onChange={(event) => updateAgencyField('companyRegistrationNumber', event.target.value)}
                      />
                    </OrganisationField>
                    <OrganisationField label="VAT Number" id="organisation-vat-number">
                      <Field id="organisation-vat-number" className={INPUT_CLASS} value={agencyInfo.vatNumber || ''} disabled={!canEdit} onChange={(event) => updateAgencyField('vatNumber', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField
                      label={copy.complianceNumberLabel}
                      id="organisation-ppra-number"
                      badge={isPpraVerified ? <VerificationBadge verified>Verified</VerificationBadge> : null}
                    >
                      <Field id="organisation-ppra-number" className={INPUT_CLASS} value={agencyInfo.eaabPpraNumber || ''} disabled={!canEdit} onChange={(event) => updateAgencyField('eaabPpraNumber', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField label="Website" id="organisation-website">
                      <Field
                        id="organisation-website"
                        className={INPUT_CLASS}
                        value={agencyInfo.website || form.website || ''}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const value = event.target.value
                          updateAgencyField('website', value)
                          updateField('website', value)
                        }}
                      />
                    </OrganisationField>
                    <OrganisationField label={copy.agencyTypeLabel} id="organisation-agency-type">
                      <Field as="select" id="organisation-agency-type" className={INPUT_CLASS} value={agencyInfo.agencyType || (isBondOriginator ? 'national' : 'residential')} disabled={!canEdit} onChange={(event) => updateAgencyField('agencyType', event.target.value)}>
                        {(isBondOriginator ? BOND_ORIGINATOR_TYPE_OPTIONS : AGENCY_TYPE_OPTIONS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Field>
                    </OrganisationField>
                    <OrganisationField label={copy.businessFocusLabel} id="organisation-business-focus">
                      <Field as="select" id="organisation-business-focus" className={INPUT_CLASS} value={agencyInfo.businessFocus || (isBondOriginator ? 'bond_applications' : 'sales')} disabled={!canEdit} onChange={(event) => updateAgencyField('businessFocus', event.target.value)}>
                        {(isBondOriginator ? BOND_BUSINESS_FOCUS_OPTIONS : AGENCY_BUSINESS_FOCUS_OPTIONS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Field>
                    </OrganisationField>
                  </div>
                </OrganisationCard>

                <OrganisationCard title="Contact Information" description="Primary contact details used across portals, reports and outbound communication.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <OrganisationField label="Main Office Number" id="organisation-main-phone">
                      <Field
                        id="organisation-main-phone"
                        className={INPUT_CLASS}
                        value={agencyInfo.mainOfficeNumber || form.companyPhone || ''}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const value = event.target.value
                          updateAgencyField('mainOfficeNumber', value)
                          updateField('companyPhone', value)
                        }}
                      />
                    </OrganisationField>
                    <OrganisationField label="General Email" id="organisation-main-email">
                      <Field
                        id="organisation-main-email"
                        className={INPUT_CLASS}
                        value={agencyInfo.mainEmailAddress || form.companyEmail || ''}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const value = event.target.value
                          updateAgencyField('mainEmailAddress', value)
                          updateField('companyEmail', value)
                        }}
                      />
                    </OrganisationField>
                    <OrganisationField label="Website" id="organisation-contact-website">
                      <Field
                        id="organisation-contact-website"
                        className={INPUT_CLASS}
                        value={form.website || agencyInfo.website || ''}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const value = event.target.value
                          updateField('website', value)
                          updateAgencyField('website', value)
                        }}
                      />
                    </OrganisationField>
                    <OrganisationField label="Support Email" id="organisation-support-email">
                      <Field id="organisation-support-email" className={INPUT_CLASS} value={form.supportEmail || ''} disabled={!canEdit} onChange={(event) => updateField('supportEmail', event.target.value)} />
                    </OrganisationField>
                  </div>
                </OrganisationCard>

                <OrganisationCard title="Address" description="Office location used for branch routing, profile quality and local search.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <OrganisationField label="Office Address" id="organisation-office-address" className="md:col-span-2">
                      <Field id="organisation-office-address" className={INPUT_CLASS} value={form.addressLine1 || agencyInfo.physicalAddress || ''} disabled={!canEdit} onChange={(event) => updateField('addressLine1', event.target.value)} />
                    </OrganisationField>
                    <div className="md:col-span-2">
                      <AddressAutocomplete
                        label="Address Lookup"
                        value={buildOrganisationAddressValue(form, onboarding)}
                        disabled={!canEdit}
                        onChange={updateOrganisationAddress}
                        placeholder="12 Main Road Bedfordview"
                        description="Search and select an address to populate suburb, city, province and postal code."
                      />
                    </div>
                    <OrganisationField label="Suburb" id="organisation-suburb">
                      <Field id="organisation-suburb" className={INPUT_CLASS} value={form.suburb || ''} disabled={!canEdit} onChange={(event) => updateField('suburb', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField label="City" id="organisation-city">
                      <Field id="organisation-city" className={INPUT_CLASS} value={form.city || ''} disabled={!canEdit} onChange={(event) => updateField('city', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField label="Province" id="organisation-province">
                      <Field
                        id="organisation-province"
                        className={INPUT_CLASS}
                        value={form.province || agencyInfo.province || ''}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const value = event.target.value
                          updateField('province', value)
                          updateAgencyField('province', value)
                        }}
                      />
                    </OrganisationField>
                    <OrganisationField label="Postal Code" id="organisation-postal-code">
                      <Field id="organisation-postal-code" className={INPUT_CLASS} value={form.postalCode || ''} disabled={!canEdit} onChange={(event) => updateField('postalCode', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField label="Country" id="organisation-country">
                      <Field
                        id="organisation-country"
                        className={INPUT_CLASS}
                        value={form.country || agencyInfo.country || 'South Africa'}
                        disabled={!canEdit}
                        onChange={(event) => {
                          const value = event.target.value
                          updateField('country', value)
                          updateAgencyField('country', value)
                          updateOrganisationDefault('country', value)
                        }}
                      />
                    </OrganisationField>
                  </div>
                </OrganisationCard>

                <OrganisationCard title={copy.principalTitle} description={copy.principalDescription}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <OrganisationField label="Owner" id="organisation-principal-owner">
                      <Field id="organisation-principal-owner" className={INPUT_CLASS} value={principal.ownerName || principal.principalFullName || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('ownerName', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField label={copy.principalNameLabel} id="organisation-principal-name">
                      <Field id="organisation-principal-name" className={INPUT_CLASS} value={principal.principalFullName || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('principalFullName', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField label={copy.principalEmailLabel} id="organisation-principal-email">
                      <Field id="organisation-principal-email" className={INPUT_CLASS} value={principal.emailAddress || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('emailAddress', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField label="Phone" id="organisation-principal-phone">
                      <Field id="organisation-principal-phone" className={INPUT_CLASS} value={principal.phoneNumber || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('phoneNumber', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField label="Position" id="organisation-principal-position">
                      <Field id="organisation-principal-position" className={INPUT_CLASS} value={principal.position || ''} disabled={!canEdit} onChange={(event) => updatePrincipalField('position', event.target.value)} />
                    </OrganisationField>
                  </div>
                </OrganisationCard>
              </>
            ) : null}

            <OrganisationCard title="Branding" description="Brand assets used for portal, reporting, and outbound communication surfaces.">
              <div className="grid gap-4 lg:grid-cols-2">
                <BrandUploadTile
                  title="Primary Logo"
                  description="Horizontal logo for sidebars, reports, and organisation headers."
                  previewUrl={branding.logoLight}
                  fileName={branding.logoLightName}
                  fallback="Primary logo not uploaded"
                  uploading={uploadingLogoTarget === 'logoLight'}
                  canEdit={canEdit}
                  onFile={(file) => handleLogoUpload(file, 'logoLight')}
                />
                <BrandUploadTile
                  title="Icon Logo"
                  description="Square mark for compact surfaces."
                  previewUrl={branding.logoIcon}
                  fileName={branding.logoIconName}
                  fallback="Initials fallback"
                  uploading={uploadingLogoTarget === 'logoIcon'}
                  canEdit={canEdit}
                  onFile={(file) => handleLogoUpload(file, 'logoIcon')}
                />
                <BrandUploadTile
                  title="Dark Logo"
                  description="Used where a stronger contrast asset is needed."
                  previewUrl={branding.logoDark}
                  previewTone="dark"
                  fileName={branding.logoDarkName}
                  fallback="Dark logo not uploaded"
                  uploading={uploadingLogoTarget === 'logoDark'}
                  canEdit={canEdit}
                  onFile={(file) => handleLogoUpload(file, 'logoDark')}
                />
                <div className="grid gap-4">
                  <ColourControl label="Primary Colour" value={primaryColour} disabled={!canEdit} onChange={(value) => updateBrandColour('primary', value)} />
                  <ColourControl label="Secondary Colour" value={secondaryColour} disabled={!canEdit} onChange={(value) => updateBrandColour('secondary', value)} />
                  <ColourControl label="Accent Colour" value={accentColour} disabled={!canEdit} onChange={(value) => updateBrandColour('accent', value)} />
                </div>
              </div>
              <div className="mt-5 overflow-hidden rounded-[18px] border border-[#dfe8f1]">
                <div className="p-4 text-white" style={{ background: `linear-gradient(135deg, ${primaryColour}, ${secondaryColour})` }}>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/15 text-sm font-semibold">
                      {branding.logoIcon ? <img src={branding.logoIcon} alt="" className="h-full w-full object-contain p-2" /> : getInitials(organisationName)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{organisationName}</p>
                      <p className="text-xs text-white/75">Live branding preview</p>
                    </div>
                  </div>
                </div>
              </div>
            </OrganisationCard>

            <OnboardingLandingBrandingCard
              organisationName={organisationName}
              logoUrl={primaryLogo}
              darkLogoUrl={branding.logoDark}
              iconUrl={branding.logoIcon}
              colours={onboardingLandingColours}
              activePortalType={onboardingPreviewType}
              setActivePortalType={setOnboardingPreviewType}
              canEdit={canEdit}
              uploadingLogoTarget={uploadingLogoTarget}
              onUploadLogo={(file, targetKey) => handleLogoUpload(file, targetKey)}
              onColourChange={(key, value) => updateBrandColour(key, value)}
            />

            {!showBrandingOnly ? (
              <>
                <OrganisationCard title="Permissions & Visibility" description="Grouped controls for workspace scope, lead visibility and collaboration defaults.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <OrganisationField label="Principal Scope" id="organisation-principal-scope">
                      <Field as="select" id="organisation-principal-scope" className={INPUT_CLASS} value={permissions.principalScope || 'all'} disabled={!canEdit} onChange={(event) => updatePermissionField('principalScope', event.target.value)}>
                        {PERMISSION_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Field>
                    </OrganisationField>
                    <OrganisationField label="Branch Manager Scope" id="organisation-branch-manager-scope">
                      <Field as="select" id="organisation-branch-manager-scope" className={INPUT_CLASS} value={permissions.branchManagerScope || 'branch'} disabled={!canEdit} onChange={(event) => updatePermissionField('branchManagerScope', event.target.value)}>
                        {PERMISSION_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Field>
                    </OrganisationField>
                    <OrganisationField label={copy.agentScopeLabel} id="organisation-agent-scope">
                      <Field as="select" id="organisation-agent-scope" className={INPUT_CLASS} value={permissions.agentScope || 'own'} disabled={!canEdit} onChange={(event) => updatePermissionField('agentScope', event.target.value)}>
                        {PERMISSION_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Field>
                    </OrganisationField>
                    <OrganisationField label={copy.leadVisibilityLabel} id="organisation-lead-visibility">
                      <Field as="select" id="organisation-lead-visibility" className={INPUT_CLASS} value={permissions.crmLeadVisibility || 'private'} disabled={!canEdit} onChange={(event) => updatePermissionField('crmLeadVisibility', event.target.value)}>
                        {CRM_VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Field>
                    </OrganisationField>
                    <OrganisationField label="Default Matter Visibility" id="organisation-matter-visibility" className="md:col-span-2">
                      <Field as="select" id="organisation-matter-visibility" className={INPUT_CLASS} value={defaults.defaultMatterVisibility} disabled={!canEdit} onChange={(event) => updateOrganisationDefault('defaultMatterVisibility', event.target.value)}>
                        {CRM_VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Field>
                    </OrganisationField>
                  </div>
                  <div className="mt-5 rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
                    <p className="mb-1 text-sm font-semibold text-[#17233a]">Collaboration</p>
                    <PermissionRow
                      title={copy.sharingLabel}
                      description="Let managers coordinate work outside their home branch when needed."
                      checked={Boolean(permissions.allowCrossBranchCollaboration)}
                      disabled={!canEdit}
                      onChange={(value) => updatePermissionField('allowCrossBranchCollaboration', value)}
                    />
                    <PermissionRow
                      title={copy.queueLabel}
                      description="Allow approved teams to work from shared operational queues."
                      checked={Boolean(permissions.allowSharedLeadPools)}
                      disabled={!canEdit}
                      onChange={(value) => updatePermissionField('allowSharedLeadPools', value)}
                    />
                    <PermissionRow
                      title={copy.listingsLabel}
                      description="Permit shared property or development visibility for collaboration."
                      checked={Boolean(permissions.allowSharedListings)}
                      disabled={!canEdit}
                      onChange={(value) => updatePermissionField('allowSharedListings', value)}
                    />
                  </div>
                </OrganisationCard>

                <OrganisationCard title="Operational Defaults" description="Default regional and workspace behaviour for new records.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <OrganisationField label="Default Timezone" id="organisation-default-timezone">
                      <Field as="select" id="organisation-default-timezone" className={INPUT_CLASS} value={defaults.timezone} disabled={!canEdit} onChange={(event) => updateOrganisationDefault('timezone', event.target.value)}>
                        <option value="Africa/Johannesburg">Africa/Johannesburg</option>
                        <option value="UTC">UTC</option>
                        <option value="Europe/London">Europe/London</option>
                      </Field>
                    </OrganisationField>
                    <OrganisationField label="Country" id="organisation-default-country">
                      <Field id="organisation-default-country" className={INPUT_CLASS} value={defaults.country} disabled={!canEdit} onChange={(event) => updateOrganisationDefault('country', event.target.value)} />
                    </OrganisationField>
                    <OrganisationField label="Currency" id="organisation-default-currency">
                      <Field as="select" id="organisation-default-currency" className={INPUT_CLASS} value={defaults.currency} disabled={!canEdit} onChange={(event) => updateOrganisationDefault('currency', event.target.value)}>
                        <option value="ZAR">ZAR - South African Rand</option>
                        <option value="USD">USD - US Dollar</option>
                        <option value="GBP">GBP - British Pound</option>
                      </Field>
                    </OrganisationField>
                    <OrganisationField label="Date Format" id="organisation-default-date-format">
                      <Field as="select" id="organisation-default-date-format" className={INPUT_CLASS} value={defaults.dateFormat} disabled={!canEdit} onChange={(event) => updateOrganisationDefault('dateFormat', event.target.value)}>
                        <option value="DD MMM YYYY">DD MMM YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      </Field>
                    </OrganisationField>
                    <OrganisationField label="Language" id="organisation-default-language" className="md:col-span-2">
                      <Field as="select" id="organisation-default-language" className={INPUT_CLASS} value={defaults.language} disabled={!canEdit} onChange={(event) => updateOrganisationDefault('language', event.target.value)}>
                        <option value="English (South Africa)">English (South Africa)</option>
                        <option value="English (United Kingdom)">English (United Kingdom)</option>
                      </Field>
                    </OrganisationField>
                  </div>
                </OrganisationCard>

                <OrganisationCard
                  title={copy.branchLabel}
                  description={copy.branchCopy}
                  actions={
                    <Link to={copy.branchesHref} className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]">
                      <GitBranch className="h-4 w-4" strokeWidth={2} />
                      Manage Branches
                    </Link>
                  }
                >
                  <div className="flex flex-col gap-4 rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-2xl font-semibold text-[#17233a]">{branchCount} Active {copy.branchCountLabel}</p>
                      <p className="mt-1 text-sm leading-6 text-[#60758d]">Branch records are managed in the dedicated branch workspace.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link to={copy.branchesHref} className="inline-flex h-10 items-center justify-center rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]">
                        View Branches
                      </Link>
                      <Link to={copy.branchesHref} className="inline-flex h-10 items-center justify-center rounded-[12px] border border-[#0f7f4f] bg-[#0f7f4f] px-3 text-sm font-semibold text-white transition hover:bg-[#0d6f45]">
                        Manage Branches
                      </Link>
                    </div>
                  </div>
                </OrganisationCard>
              </>
            ) : null}
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-4 space-y-4 rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)]">
              <div>
                <h2 className="text-base font-semibold text-[#17233a]">Organisation Overview</h2>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">Status signals for this workspace.</p>
              </div>
              <div className="space-y-3 border-y border-[#e5edf4] py-4">
                <OverviewRow label="Agency Status" value={isPpraVerified ? 'Verified' : 'Pending'} verified={isPpraVerified} />
                <OverviewRow label="Users" value={userCount} />
                <OverviewRow label="Branches" value={branchCount} />
                <OverviewRow label="Branding" value={isBrandingConfigured ? 'Configured' : 'Incomplete'} verified={isBrandingConfigured} />
                <OverviewRow label="PPRA" value={isPpraVerified ? 'Verified' : 'Pending'} verified={isPpraVerified} />
              </div>
              <div className="rounded-[16px] bg-[#f8fbfa] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#17233a]">
                  <HelpCircle className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} />
                  Need Help?
                </div>
                <Link
                  to="/settings/help"
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
                >
                  Organisation Documentation
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </form>

      {canEdit ? (
        <SettingsStickySaveBar
          dirty={Boolean(hasUnsavedChanges)}
          saving={saving}
          message="Unsaved Changes"
          discardLabel="Discard"
          saveLabel={showBrandingOnly ? 'Save Branding' : 'Save Organisation'}
          onDiscard={() => {
            setState(initialState)
            setMessage('')
            setError('')
          }}
          onSave={handleSave}
        />
      ) : null}
    </div>
  )
}
