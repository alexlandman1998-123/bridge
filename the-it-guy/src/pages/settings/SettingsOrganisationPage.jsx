import {
  Camera,
  Building2,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  GitBranch,
  Globe2,
  Inbox,
  Link2,
  Mail,
  MapPin,
  Megaphone,
  Monitor,
  Palette,
  Power,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Type,
  UploadCloud,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import Field from '../../components/ui/Field'
import { useAuthSession } from '../../context/AuthSessionContext'
import { useOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import useAttorneyModuleSettings from '../../hooks/useAttorneyModuleSettings'
import { ATTORNEY_MODULE_DEFINITIONS } from '../../lib/attorneyModuleSettings'
import {
  AGENCY_BUSINESS_LINE_OPTIONS,
  getAgencyBusinessFocusFromLines,
  getAgencyBusinessLinesFromFocus,
  normalizeAgencyBusinessLines,
} from '../../lib/agencyOnboarding'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { upsertAreaFromAddress } from '../../lib/location/upsertArea'
import {
  saveAgencyOnboardingDraft,
  updateOrganisationSettings,
  uploadOrganisationBrandingAsset,
} from '../../lib/settingsApi'
import {
  AGENCY_PUBLIC_INTAKE_SOURCE_CHANNELS,
  buildAgencyPublicIntakeUrls,
  loadAgencyPublicIntakePerformance,
  loadAgencyPublicIntakeLink,
  saveAgencyPublicIntakeLink,
  suggestAgencyPublicIntakeSlug,
} from '../../services/agencyPublicIntakeLinkService'
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
const BRAND_ASSET_APPLY_TIMEOUT_MS = 60000
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
  { key: 'primary', label: 'Primary', fallback: '#274C69', description: 'Used for buttons and headers' },
  { key: 'secondary', label: 'Secondary', fallback: '#10273A', description: 'Text and dark UI elements' },
  { key: 'accent', label: 'Accent', fallback: '#F7CF22', description: 'Links, highlights and badges' },
  { key: 'neutral', label: 'Neutral', fallback: '#F7F8FA', description: 'Backgrounds and surfaces' },
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

function getCurrentPublicHost() {
  if (typeof window === 'undefined') return 'https://app.arch9.co.za'
  return window.location.origin || 'https://app.arch9.co.za'
}

function createPublicIntakeDraft(link = null, organisationName = '') {
  if (link) {
    return {
      ...link,
      enabledIntents: link.enabledIntents?.length ? link.enabledIntents : ['buy', 'sell'],
      buyerCtaLabel: link.buyerCtaLabel || 'I am looking to buy',
      sellerCtaLabel: link.sellerCtaLabel || 'I am looking to sell',
      leadSourceLabel: link.leadSourceLabel || 'Public Intake',
      sourceChannel: link.sourceChannel || 'other',
    }
  }
  return {
    id: '',
    slug: suggestAgencyPublicIntakeSlug(organisationName),
    status: 'draft',
    isPrimary: true,
    heading: 'What can we help you with?',
    introduction: 'Choose the path that fits you and share a few details.',
    buyerCtaLabel: 'I am looking to buy',
    sellerCtaLabel: 'I am looking to sell',
    enabledIntents: ['buy', 'sell'],
    leadSourceLabel: 'Public Intake',
    sourceChannel: 'website',
    campaignCode: '',
    privacyPolicyVersion: 'agency-public-intake-v1',
    consentCopy: '',
  }
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

function getOrganisationDefaults(organisation = {}) {
  const defaults = organisation?.settingsJson?.organisationDefaults
  return {
    ...ORGANISATION_DEFAULTS,
    ...(defaults && typeof defaults === 'object' ? defaults : {}),
    country: normalizeText(defaults?.country || organisation?.country) || ORGANISATION_DEFAULTS.country,
  }
}

function getOrganisationTargets(organisation = {}) {
  const targets = organisation?.settingsJson?.targets
  return targets && typeof targets === 'object' ? targets : {}
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

function withBrandAssetTimeout(promise, timeoutMs = BRAND_ASSET_APPLY_TIMEOUT_MS) {
  let timeoutId
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Logo upload is taking longer than expected. Please retry with a smaller image or check your connection.'))
      }, timeoutMs)
    }),
  ]).finally(() => clearTimeout(timeoutId))
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

function getBrandHealthScore({ branding = {}, brandColours = {}, publicBranding = {}, showPublicIntake = false, publicIntakeDraft = null } = {}) {
  const checks = getBrandHealthChecks({ branding, brandColours, publicBranding, showPublicIntake, publicIntakeDraft }).map((item) => item.complete)
  const completed = checks.filter(Boolean).length
  return Math.round((completed / checks.length) * 100)
}

function getBrandHealthChecks({ branding = {}, brandColours = {}, publicBranding = {}, showPublicIntake = false, publicIntakeDraft = null } = {}) {
  return [
    {
      key: 'logo-assets',
      label: 'Logo & assets',
      complete: Boolean(normalizeText(branding.logoLight) && normalizeText(branding.logoDark) && normalizeText(branding.logoIcon)),
    },
    {
      key: 'colours',
      label: 'Colours',
      complete: BRAND_COLOUR_CONTROLS.every((control) => Boolean(getBrandColourValue(brandColours, control.key, ''))),
    },
    {
      key: 'client-portals',
      label: 'Client portals',
      complete: Boolean(normalizeText(branding.logoLight || branding.logoIcon)),
    },
    {
      key: 'email-branding',
      label: 'Email branding',
      complete: Boolean(normalizeText(branding.logoDark || branding.logoLight) && normalizeText(publicBranding.supportEmail)),
    },
    {
      key: 'document-branding',
      label: 'Document branding',
      complete: Boolean(normalizeText(branding.logoLight) && getBrandColourValue(brandColours, 'primary', '')),
    },
    {
      key: 'favicon',
      label: 'Favicon',
      complete: Boolean(normalizeText(branding.favicon || branding.logoIcon)),
    },
    ...(showPublicIntake
      ? [{
          key: 'public-intake',
          label: 'Public intake',
          complete: publicIntakeDraft?.status === 'active',
        }]
      : []),
  ]
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

function formatPublicIntakeContact(row = {}) {
  return normalizeText(row.contactEmail || row.contactPhone) || 'No contact method'
}

function formatPublicIntakeBudget(row = {}) {
  const min = Number(row.budgetMin)
  const max = Number(row.budgetMax)
  const formatter = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
  if (Number.isFinite(min) && Number.isFinite(max)) return `${formatter.format(min)} - ${formatter.format(max)}`
  if (Number.isFinite(max)) return `Up to ${formatter.format(max)}`
  if (Number.isFinite(min)) return `From ${formatter.format(min)}`
  return ''
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

function BusinessLineOption({ option, checked = false, disabled = false, onChange }) {
  return (
    <label
      className={`flex min-h-[104px] cursor-pointer items-start gap-3 rounded-[12px] border p-4 transition ${
        checked
          ? 'border-[#0f7f4f] bg-[#edf8f2] text-[#17233a]'
          : 'border-[#dfe8f1] bg-white text-[#43566d]'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-[#8ec9ad]'}`.trim()}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-[#b8c7d6] text-[#0f7f4f] focus:ring-[#dff2e8]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(option.value, event.target.checked)}
      />
      <span className="grid gap-1">
        <span className="text-sm font-semibold text-[#17233a]">{option.label}</span>
        <span className="text-sm leading-5 text-[#60758d]">{option.description}</span>
      </span>
    </label>
  )
}

function SettingsToast({ message }) {
  if (!message) return null
  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm rounded-[14px] border border-[#ccead8] bg-white px-4 py-3 text-sm font-semibold text-[#1f7a45] shadow-[0_18px_42px_rgba(15,23,42,0.14)]" role="status">
      {message}
    </div>
  )
}

function BrandImage({ src, alt = '', className = '', fallback = null }) {
  const resolvedSrc = normalizeText(src)
  const [failedSrc, setFailedSrc] = useState('')

  if (!resolvedSrc || failedSrc === resolvedSrc) {
    return fallback
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(resolvedSrc)}
    />
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
      <BrandImage src={logoUrl} alt="" className="h-full w-full object-contain p-3" fallback={getInitials(name)} />
    </span>
  )
}

function BrandHero({
  organisationName,
  primaryLogo,
  roleLabel,
  publicUrl,
  organisationTypeLabel,
  brandHealth,
  healthChecks = [],
  canEdit,
  uploading = false,
  onUpload,
  onHistory,
}) {
  const circumference = 2 * Math.PI * 46
  const progressOffset = circumference - (Math.max(0, Math.min(100, brandHealth)) / 100) * circumference

  return (
    <section id="brand-overview" className="scroll-mt-24 overflow-hidden rounded-[24px] border border-[#dfe8f1] bg-white shadow-[0_18px_46px_rgba(15,23,42,0.06)]">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 p-5 sm:p-7">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <LogoMark logoUrl={primaryLogo} name={organisationName} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[1.65rem] font-semibold leading-tight text-[#17233a]">{organisationName}</h2>
              <div className="mt-5 grid gap-4 text-sm text-[#60758d] md:grid-cols-3">
                <div className="flex gap-2">
                  <UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-[#40566d]" strokeWidth={2} />
                  <span>
                    <span className="block text-xs font-semibold text-[#7b8fa5]">Role</span>
                    <span className="mt-1 block font-semibold capitalize text-[#24364b]">{roleLabel || 'Workspace admin'}</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-[#40566d]" strokeWidth={2} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-[#7b8fa5]">Agency URL</span>
                    <span className="mt-1 flex min-w-0 items-center gap-1 font-semibold text-[#24364b]">
                      <span className="truncate">{publicUrl || 'Not configured'}</span>
                      {publicUrl ? <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> : null}
                    </span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#40566d]" strokeWidth={2} />
                  <span>
                    <span className="block text-xs font-semibold text-[#7b8fa5]">Industry</span>
                    <span className="mt-1 block font-semibold text-[#24364b]">{organisationTypeLabel || 'Real Estate'}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            {canEdit ? (
              <label className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#0f7f4f] bg-[#0f7f4f] px-5 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(15,127,79,0.18)] transition hover:bg-[#0d6f45]">
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
              <button
                type="button"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-5 text-sm font-semibold text-[#24364b] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:bg-[#f7fafc]"
                onClick={onHistory}
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2} />
                View Version History
              </button>
          </div>
        </div>

        <div className="border-t border-[#e5edf4] bg-[#fbfdff] p-5 sm:p-7 xl:border-l xl:border-t-0">
          <div className="flex gap-5">
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 108 108" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="54" cy="54" r="46" fill="none" stroke="#dce8f1" strokeWidth="8" />
                <circle
                  cx="54"
                  cy="54"
                  r="46"
                  fill="none"
                  stroke="#0f7f4f"
                  strokeLinecap="round"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={progressOffset}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-[#0f7f4f]">{brandHealth}%</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-[#17233a]">Brand Health</h3>
              <p className="mt-1 text-sm leading-6 text-[#60758d]">{brandHealth >= 85 ? 'Your brand is looking great.' : 'A few brand surfaces still need attention.'}</p>
              <div className="mt-3 grid gap-1.5">
                {healthChecks.map((item) => (
                  <div key={item.key} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    {item.complete ? (
                      <CheckCircle2 className="h-4 w-4 text-[#0f7f4f]" strokeWidth={2} />
                    ) : (
                      <Circle className="h-4 w-4 text-[#f97316]" strokeWidth={2} />
                    )}
                    <span className="truncate text-[#31455c]">{item.label}</span>
                    <span className={item.complete ? 'text-xs font-semibold text-[#60758d]' : 'text-xs font-semibold text-[#9a4d12]'}>
                      {item.complete ? 'Complete' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
        <BrandImage src={previewUrl} alt={`${title} preview`} className="h-full max-h-[104px] w-full object-contain" fallback={fallback} />
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

function BrandColourField({ label, value, description = 'Used across branded surfaces.', disabled = false, onChange, onCopy }) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#274C69'
  return (
    <div className="rounded-[14px] border border-[#e1eaf3] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="h-12 w-12 shrink-0 rounded-[12px] border border-[#d8e3ee] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.36)]" style={{ backgroundColor: safeValue }} />
          <div className="min-w-0 pt-0.5">
            <p className="truncate text-sm font-semibold text-[#17233a]">{label}</p>
            <button
              type="button"
              className="mt-1 font-mono text-xs font-semibold uppercase tracking-[0.04em] text-[#31455c] transition hover:text-[#0f7f4f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9dd9bd]"
              onClick={onCopy}
            >
              {safeValue.toUpperCase()}
            </button>
            <p className="mt-1 text-xs leading-5 text-[#60758d]">{description}</p>
          </div>
        </div>
        {onCopy ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white text-[#24364b] transition hover:bg-[#f7fafc]"
            onClick={onCopy}
            title={`Copy ${label} colour`}
            aria-label={`Copy ${label} colour`}
          >
            <Copy className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_48px] gap-2">
        <Field className={INPUT_CLASS} value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={`${label} hex value`} />
        <input
          type="color"
          className="h-11 w-12 cursor-pointer rounded-[12px] border border-[#d8e3ee] bg-white p-1"
          value={safeValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} colour picker`}
        />
      </div>
    </div>
  )
}

function TypographyPreviewCard({ title, fontName, children }) {
  return (
    <div className="rounded-[14px] border border-[#e1eaf3] bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <span className="text-5xl font-semibold leading-none text-[#111827]" style={{ fontFamily: fontName }}>
          Aa
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#17233a]">{title}</p>
          <p className="mt-1 text-xs font-semibold text-[#60758d]">{fontName}</p>
          <p className="mt-3 truncate text-xs font-semibold uppercase tracking-[0.08em] text-[#24364b]" style={{ fontFamily: fontName }}>
            ABCDEFGHIJKLMNOPQRSTUVWXYZ
          </p>
          <p className="mt-1 truncate text-xs text-[#60758d]" style={{ fontFamily: fontName }}>
            abcdefghijklmnopqrstuvwxyz 1234567890
          </p>
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
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
              <BrandImage src={iconUrl} alt="" className="h-full w-full object-contain p-2" fallback={getInitials(organisationName)} />
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
          <BrandImage src={logoUrl} alt="" className="h-10 max-w-[160px] object-contain" />
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
              <BrandImage src={iconUrl} alt="" className="h-full w-full object-contain p-2" fallback={getInitials(organisationName)} />
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
    <div id="brand-preview-workspace" className="scroll-mt-24">
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
    </div>
  )
}

function BrandPreviewPanel({ organisationName, logoUrl, iconUrl, colours, brandHealth, configuredAssetCount, onOpenFullPreview }) {
  const previewItems = [
    { key: 'agency', label: 'Agency Portal', description: 'Header & navigation', tab: 'portal', accent: colours.primary },
    { key: 'buyer', label: 'Buyer Portal', description: 'Mobile view', tab: 'portal', accent: colours.secondary },
    { key: 'seller', label: 'Seller Portal', description: 'Mobile view', tab: 'portal', accent: colours.accent },
    { key: 'email', label: 'Emails', description: 'Email header', tab: 'email', accent: colours.primary },
    { key: 'pdf', label: 'PDF / Documents', description: 'Document header', tab: 'pdf', accent: colours.secondary },
  ]

  return (
    <aside id="live-preview" className="min-w-0">
      <div className="space-y-4 rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.045)] xl:sticky xl:top-6">
        <div>
          <h2 className="text-base font-semibold text-[#17233a]">Live Brand Preview</h2>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">See how your brand appears across Arch9.</p>
        </div>
        <div className="grid gap-2">
          {previewItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#e8eef5] py-3 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9dd9bd]"
              onClick={() => {
                document.getElementById('brand-preview-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            >
              <span className="flex h-14 items-center justify-center overflow-hidden rounded-[10px] border border-[#e2ebf3] bg-[#f8fbfe]">
                {item.tab === 'email' || item.tab === 'pdf' ? (
                  <span className="grid w-16 gap-1">
                    <span className="h-2 rounded-full" style={{ backgroundColor: item.accent }} />
                    <span className="h-1.5 rounded-full bg-[#dbe5ef]" />
                    <span className="h-1.5 w-3/4 rounded-full bg-[#dbe5ef]" />
                  </span>
                ) : (
                  <span className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${hexToRgba(item.accent, 0.95)}, ${hexToRgba(colours.neutral, 0.95)})` }}>
                    <BrandImage src={iconUrl || logoUrl} alt="" className="h-8 w-8 object-contain" fallback={<span className="text-xs font-semibold text-white">{getInitials(organisationName)}</span>} />
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#17233a]">{item.label}</span>
                <span className="mt-0.5 block truncate text-xs text-[#60758d]">{item.description}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-[#40566d]" strokeWidth={2} />
            </button>
          ))}
        </div>
        <div className="space-y-3 border-y border-[#e5edf4] py-4">
          <OverviewRow label="Brand Health" value={`${brandHealth}%`} verified={brandHealth >= 80} />
          <OverviewRow label="Assets" value={configuredAssetCount} verified={configuredAssetCount >= 3} />
          <OverviewRow label="Colours" value="Configured" verified />
        </div>
        <button
          type="button"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]"
          onClick={onOpenFullPreview}
        >
          Open Full Preview
          <ExternalLink className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </aside>
  )
}

function OnboardingLandingLogoRow({ title, description, previewUrl, previewTone = 'light', canEdit = false, uploading = false, onFile }) {
  return (
    <article className="flex flex-col gap-3 rounded-[14px] border border-[#e1eaf3] bg-white p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={[
            'inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border p-2 text-xs font-semibold',
            previewTone === 'dark'
              ? 'border-[#17324d] bg-[#10273a] text-white/70'
              : 'border-[#d9e3ef] bg-white text-[#60758d]',
          ].join(' ')}
        >
          <BrandImage src={previewUrl} alt="" className="h-full w-full object-contain" fallback="Logo" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#17233a]">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-[#60758d]">{description}</span>
        </span>
      </div>
      {canEdit ? (
        <label className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]">
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
      <div className="p-5 text-white sm:p-6" style={{ background: overlay }}>
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 items-center">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/15 bg-white/10 p-2 text-sm font-semibold text-white">
              <BrandImage src={logoUrl || iconUrl} alt="" className="h-full w-full object-contain" fallback={getInitials(organisationName)} />
            </span>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>{copy.label}</p>
            <h3 className="mt-3 max-w-[520px] text-2xl font-semibold leading-tight text-white sm:text-3xl">
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
          <div className="grid w-full gap-2 rounded-[16px] border border-white/15 bg-white/10 p-3 backdrop-blur md:w-64 md:shrink-0">
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
  onCopyColour,
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
    <OrganisationCard title="Buyer / Seller Onboarding Links" description="Edit the logos and colours used by secure buyer and seller intake links.">
      <div className="space-y-5">
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <PreviewTabButton active={activePortalType === 'buyer'} onClick={() => setActivePortalType('buyer')}>
                Buyer
              </PreviewTabButton>
              <PreviewTabButton active={activePortalType === 'seller'} onClick={() => setActivePortalType('seller')}>
                Seller
              </PreviewTabButton>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8fa5]">Live preview</span>
          </div>
          <OnboardingLandingPreviewSurface
            portalType={activePortalType}
            organisationName={organisationName}
            logoUrl={previewLogoUrl}
            iconUrl={iconUrl}
            colours={colours}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
          <section className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#17233a]">Landing logos</h3>
              <p className="mt-1 text-sm leading-6 text-[#60758d]">Primary, dark and compact marks for intake pages.</p>
            </div>
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
          </section>

          <section className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#17233a]">Landing colours</h3>
              <p className="mt-1 text-sm leading-6 text-[#60758d]">Header and call-to-action colours for intake links.</p>
            </div>
            <div className="grid gap-3">
              {ONBOARDING_LANDING_COLOUR_CONTROLS.map((control) => (
                <BrandColourField
                  key={control.key}
                  label={control.label}
                  value={colours[control.key] || control.fallback}
                  disabled={!canEdit}
                  onChange={(value) => onColourChange(control.key, value)}
                  onCopy={() => onCopyColour?.(colours[control.key] || control.fallback)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </OrganisationCard>
  )
}

function PublicIntakeStatusPill({ status = 'draft' }) {
  const normalized = normalizeText(status).toLowerCase() || 'draft'
  const meta = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    draft: 'border-amber-200 bg-amber-50 text-amber-700',
    disabled: 'border-slate-200 bg-slate-50 text-slate-600',
    archived: 'border-slate-200 bg-slate-50 text-slate-500',
  }[normalized] || 'border-slate-200 bg-slate-50 text-slate-600'
  return (
    <span className={`inline-flex h-8 items-center justify-center rounded-[10px] border px-3 text-xs font-semibold uppercase tracking-[0.1em] ${meta}`}>
      {normalized}
    </span>
  )
}

function PublicIntakeUrlRow({ label, value, onCopy, onOpen }) {
  return (
    <div className="grid gap-3 rounded-[14px] border border-[#e4ecf5] bg-white p-3 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8fa5]">{label}</span>
      <span className="min-w-0 truncate rounded-[10px] bg-[#f7fafc] px-3 py-2 font-mono text-xs text-[#31455c]">{value || 'Publish the link to generate this URL'}</span>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={!value}
          onClick={() => onCopy?.(value, label)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white text-[#24364b] transition hover:bg-[#f7fafc] disabled:cursor-not-allowed disabled:opacity-45"
          title={`Copy ${label}`}
        >
          <Copy className="h-4 w-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          disabled={!value}
          onClick={() => onOpen?.(value)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white text-[#24364b] transition hover:bg-[#f7fafc] disabled:cursor-not-allowed disabled:opacity-45"
          title={`Open ${label}`}
        >
          <ExternalLink className="h-4 w-4" strokeWidth={2} />
        </button>
      </span>
    </div>
  )
}

function PublicIntakeIntentToggle({ intent, label, checked, disabled, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-[#e4ecf5] bg-white px-3 py-3">
      <span className="text-sm font-semibold text-[#17233a]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(intent, event.target.checked)}
        className="h-5 w-5 rounded border-[#c8d5e3] accent-[#0f7f4f]"
      />
    </label>
  )
}

function PublicIntakeLinkCard({
  canEdit,
  draft,
  loading,
  schemaReady,
  saving,
  urls,
  onChange,
  onCopy,
  onDisable,
  onOpen,
  onSave,
  onToggleIntent,
}) {
  const hasDraft = Boolean(draft)
  const enabledIntents = draft?.enabledIntents?.length ? draft.enabledIntents : ['buy', 'sell']
  const active = draft?.status === 'active'
  const disabled = !canEdit || loading || saving || !schemaReady

  return (
    <OrganisationCard
      title="Public Buyer / Seller Intake"
      description="Create the agency link used on social media, listing enquiries, and public listing catalogues."
      actions={hasDraft ? <PublicIntakeStatusPill status={draft.status} /> : null}
    >
      {!schemaReady ? (
        <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          Public intake storage is not installed in this environment yet. Apply the Phase 1 migration before activating agency links.
        </div>
      ) : loading ? (
        <div className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] px-4 py-5 text-sm font-semibold text-[#60758d]">
          Loading public intake link...
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
            <section className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#e8f5ee] text-[#0f7f4f]">
                  <Megaphone className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#17233a]">{active ? 'Live intake link' : 'Draft intake link'}</p>
                  <p className="mt-1 text-xs leading-5 text-[#60758d]">{active ? 'Ready for social and listing traffic.' : 'Publish when the copy and routing are ready.'}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                <PublicIntakeIntentToggle intent="buy" label="Buyer intake" checked={enabledIntents.includes('buy')} disabled={disabled} onChange={onToggleIntent} />
                <PublicIntakeIntentToggle intent="sell" label="Seller intake" checked={enabledIntents.includes('sell')} disabled={disabled} onChange={onToggleIntent} />
              </div>
            </section>

            <section className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <OrganisationField label="Public Slug" id="agency-public-intake-slug">
                  <Field
                    id="agency-public-intake-slug"
                    className={INPUT_CLASS}
                    value={draft?.slug || ''}
                    disabled={disabled || active}
                    onChange={(event) => onChange?.('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80))}
                  />
                </OrganisationField>
                <OrganisationField label="Default Source" id="agency-public-intake-source">
                  <Field
                    as="select"
                    id="agency-public-intake-source"
                    className={INPUT_CLASS}
                    value={draft?.sourceChannel || 'other'}
                    disabled={disabled}
                    onChange={(event) => onChange?.('sourceChannel', event.target.value)}
                  >
                    {AGENCY_PUBLIC_INTAKE_SOURCE_CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                  </Field>
                </OrganisationField>
                <OrganisationField label="Heading" id="agency-public-intake-heading" className="md:col-span-2">
                  <Field id="agency-public-intake-heading" className={INPUT_CLASS} value={draft?.heading || ''} disabled={disabled} onChange={(event) => onChange?.('heading', event.target.value)} maxLength={160} />
                </OrganisationField>
                <OrganisationField label="Introduction" id="agency-public-intake-introduction" className="md:col-span-2">
                  <textarea
                    id="agency-public-intake-introduction"
                    className={`${INPUT_CLASS} min-h-[88px] resize-y py-3`}
                    value={draft?.introduction || ''}
                    disabled={disabled}
                    onChange={(event) => onChange?.('introduction', event.target.value)}
                    maxLength={1000}
                  />
                </OrganisationField>
                <OrganisationField label="Buyer Button" id="agency-public-intake-buyer-cta">
                  <Field id="agency-public-intake-buyer-cta" className={INPUT_CLASS} value={draft?.buyerCtaLabel || ''} disabled={disabled} onChange={(event) => onChange?.('buyerCtaLabel', event.target.value)} maxLength={80} />
                </OrganisationField>
                <OrganisationField label="Seller Button" id="agency-public-intake-seller-cta">
                  <Field id="agency-public-intake-seller-cta" className={INPUT_CLASS} value={draft?.sellerCtaLabel || ''} disabled={disabled} onChange={(event) => onChange?.('sellerCtaLabel', event.target.value)} maxLength={80} />
                </OrganisationField>
                <OrganisationField label="Campaign Code" id="agency-public-intake-campaign">
                  <Field id="agency-public-intake-campaign" className={INPUT_CLASS} value={draft?.campaignCode || ''} disabled={disabled} onChange={(event) => onChange?.('campaignCode', event.target.value)} maxLength={80} />
                </OrganisationField>
                <OrganisationField label="Lead Source Label" id="agency-public-intake-lead-source">
                  <Field id="agency-public-intake-lead-source" className={INPUT_CLASS} value={draft?.leadSourceLabel || 'Public Intake'} disabled={disabled} onChange={(event) => onChange?.('leadSourceLabel', event.target.value)} maxLength={120} />
                </OrganisationField>
              </div>
            </section>
          </div>

          <section className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#17233a]">Distribution URLs</h3>
                <p className="mt-1 text-sm leading-6 text-[#60758d]">Use these for social profiles, campaigns, and the public listing catalogue.</p>
              </div>
              <Link2 className="h-5 w-5 text-[#7b8fa5]" strokeWidth={2} />
            </div>
            <div className="grid gap-2">
              <PublicIntakeUrlRow label="Main" value={urls.intakeUrl} onCopy={onCopy} onOpen={onOpen} />
              <PublicIntakeUrlRow label="Buyer" value={enabledIntents.includes('buy') ? urls.buyerUrl : ''} onCopy={onCopy} onOpen={onOpen} />
              <PublicIntakeUrlRow label="Seller" value={enabledIntents.includes('sell') ? urls.sellerUrl : ''} onCopy={onCopy} onOpen={onOpen} />
              <PublicIntakeUrlRow label="Listings" value={urls.listingsUrl} onCopy={onCopy} onOpen={onOpen} />
            </div>
          </section>

          {canEdit ? (
            <div className="flex flex-wrap justify-end gap-2">
              {draft?.id && draft.status !== 'disabled' ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onDisable}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#43566d] transition hover:bg-[#f7fafc] disabled:cursor-wait disabled:opacity-60"
                >
                  <Power className="h-4 w-4" strokeWidth={2} />
                  Disable
                </button>
              ) : null}
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave?.('draft')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc] disabled:cursor-wait disabled:opacity-60"
              >
                <FileText className="h-4 w-4" strokeWidth={2} />
                Save Draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave?.('active')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#0f7f4f] bg-[#0f7f4f] px-4 text-sm font-semibold text-white transition hover:bg-[#0d6f45] disabled:cursor-wait disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" strokeWidth={2} />
                {active ? 'Update Live Link' : 'Publish Link'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </OrganisationCard>
  )
}

function PublicIntakeMetric({ label, value, helper }) {
  return (
    <div className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8fa5]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#17233a]">{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5 text-[#60758d]">{helper}</p> : null}
    </div>
  )
}

function PublicIntakeSubmissionRow({ submission }) {
  const budget = formatPublicIntakeBudget(submission)
  return (
    <div className="grid gap-3 rounded-[14px] border border-[#e4ecf5] bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <PublicIntakeStatusPill status={submission.status} />
          <span className="text-sm font-semibold text-[#17233a]">{submission.contactName || `${titleize(submission.intent)} enquiry`}</span>
          <span className="rounded-[10px] bg-[#eef6f2] px-2 py-1 text-xs font-semibold text-[#0f7f4f]">{titleize(submission.intent)}</span>
        </div>
        <p className="mt-2 truncate text-sm text-[#60758d]">{formatPublicIntakeContact(submission)}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a9aab]">
          {titleize(submission.sourceChannel)}{submission.campaignCode ? ` · ${submission.campaignCode}` : ''}{budget ? ` · ${budget}` : ''}
        </p>
        {submission.processingError ? <p className="mt-1 text-xs text-rose-700">{submission.processingError}</p> : null}
      </div>
      <div className="flex items-center gap-3 text-sm font-semibold text-[#60758d]">
        {submission.leadId ? (
          <span className="inline-flex items-center gap-1.5 text-[#0f7f4f]">
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
            CRM
          </span>
        ) : null}
        <span>{getBrandLastUpdatedLabel(submission.createdAt)}</span>
      </div>
    </div>
  )
}

function PublicIntakePerformanceCard({ loading, schemaReady, performance, onRefresh }) {
  const summary = performance?.summary || {}
  const submissions = performance?.submissions || []
  const windowDays = performance?.windowDays || 30

  return (
    <OrganisationCard
      title="Public Intake Performance"
      description={`Recent buyer and seller enquiry health across the last ${windowDays} days.`}
      actions={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc] disabled:cursor-wait disabled:opacity-60"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </button>
      }
    >
      {!schemaReady ? (
        <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          Public intake submission storage is not installed in this environment yet. Apply the Phase 2 migration to view performance.
        </div>
      ) : loading ? (
        <div className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] px-4 py-5 text-sm font-semibold text-[#60758d]">
          Loading public intake performance...
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-5">
            <PublicIntakeMetric label="Enquiries" value={summary.total || 0} helper="Received" />
            <PublicIntakeMetric label="Accepted" value={summary.accepted || 0} helper="CRM-ready" />
            <PublicIntakeMetric label="Buyers" value={summary.buyer || 0} helper="Buying path" />
            <PublicIntakeMetric label="Sellers" value={summary.seller || 0} helper="Selling path" />
            <PublicIntakeMetric label="Review" value={summary.needsReview || 0} helper="Needs attention" />
          </div>

          <section className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#17233a]">Recent enquiries</h3>
                <p className="mt-1 text-sm leading-6 text-[#60758d]">Latest public intake submissions linked to this agency.</p>
              </div>
              <Inbox className="h-5 w-5 text-[#7b8fa5]" strokeWidth={2} />
            </div>
            {submissions.length ? (
              <div className="grid gap-2">
                {submissions.slice(0, 8).map((submission) => (
                  <PublicIntakeSubmissionRow key={submission.id} submission={submission} />
                ))}
              </div>
            ) : (
              <div className="rounded-[14px] border border-dashed border-[#d6e2ee] bg-white px-4 py-6 text-center">
                <p className="text-sm font-semibold text-[#17233a]">No public intake submissions yet</p>
                <p className="mt-1 text-sm leading-6 text-[#60758d]">Once the agency shares its link, buyer and seller enquiries will appear here.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </OrganisationCard>
  )
}

function BrandingEssentialsCard({
  organisationName,
  logoUrl,
  darkLogoUrl,
  iconUrl,
  colours,
  canEdit,
  uploadingLogoTarget,
  onUploadLogo,
  onColourChange,
  onCopyColour,
}) {
  const logoRows = [
    {
      key: 'logoLight',
      title: 'Primary Logo',
      description: 'Horizontal mark for sidebars, reports and headers.',
      previewUrl: logoUrl,
    },
    {
      key: 'logoDark',
      title: 'Dark Logo',
      description: 'High-contrast mark for dark branded surfaces.',
      previewUrl: darkLogoUrl,
      previewTone: 'dark',
    },
    {
      key: 'logoIcon',
      title: 'Icon Logo',
      description: 'Square mark for compact navigation and portal icons.',
      previewUrl: iconUrl,
    },
  ]
  const accentText = getContrastTextColour(colours.accent, colours.secondary)

  return (
    <OrganisationCard
      title="Core Branding"
      description="Keep the essential logos and palette in one quick-edit panel."
      actions={
        <Link to="/settings/branding" className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]">
          <Palette className="h-4 w-4" strokeWidth={2} />
          Full Brand Manager
        </Link>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <section className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[#17233a]">Logos</h3>
            <p className="mt-1 text-sm leading-6 text-[#60758d]">Upload once, reuse across workspace and client surfaces.</p>
          </div>
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
        </section>

        <section className="rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[#17233a]">Brand colours</h3>
            <p className="mt-1 text-sm leading-6 text-[#60758d]">Used by buttons, headers and document accents.</p>
          </div>
          <div className="grid gap-3">
            {BRAND_COLOUR_CONTROLS.map((control) => (
              <BrandColourField
                key={control.key}
                label={control.label}
                value={colours[control.key] || control.fallback}
                disabled={!canEdit}
                onChange={(value) => onColourChange(control.key, value)}
                onCopy={() => onCopyColour?.(colours[control.key] || control.fallback)}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 overflow-hidden rounded-[16px] border border-[#dfe8f1]">
        <div className="flex flex-col gap-4 p-4 text-white sm:flex-row sm:items-center sm:justify-between" style={{ background: `linear-gradient(135deg, ${colours.primary}, ${colours.secondary})` }}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-white/15 p-2 text-sm font-semibold">
              <BrandImage src={iconUrl} alt="" className="h-full w-full object-contain" fallback={getInitials(organisationName)} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{organisationName}</p>
              <p className="text-xs text-white/75">Workspace preview</p>
            </div>
          </div>
          <span
            className="inline-flex h-10 items-center justify-center rounded-[12px] px-4 text-sm font-semibold"
            style={{ backgroundColor: colours.accent, color: accentText }}
          >
            Primary action
          </span>
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

function AttorneyModulesCard({ modules = {}, loading = false, saving = false, error = '', canEdit = false, onToggle }) {
  return (
    <OrganisationCard title="Attorney Modules" description="Choose which legal workstreams appear in this firm workspace.">
      <div className="rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4">
        {ATTORNEY_MODULE_DEFINITIONS.map((definition) => (
          <PermissionRow
            key={definition.key}
            title={definition.title}
            description={definition.description}
            checked={modules[definition.key] !== false}
            disabled={!canEdit || loading || saving}
            onChange={(nextValue) => onToggle(definition.key, nextValue)}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-[#60758d]">
          {loading ? 'Loading module settings...' : saving ? 'Saving module settings...' : 'Transfer matters stay available as the core conveyancing workspace.'}
        </p>
        {error ? <p className="font-semibold text-[#b42318]">{error}</p> : null}
      </div>
    </OrganisationCard>
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
  const location = useLocation()
  const { role, currentWorkspace, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const isAttorneyWorkspace = resolvedWorkspaceType === 'attorney_firm' || role === 'attorney'
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
  const { refreshAuthState } = useAuthSession()
  const [state, setState] = useState(null)
  const [initialState, setInitialState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogoTarget, setUploadingLogoTarget] = useState('')
  const [onboardingPreviewType, setOnboardingPreviewType] = useState('buyer')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [publicIntakeDraft, setPublicIntakeDraft] = useState(null)
  const [publicIntakeLoading, setPublicIntakeLoading] = useState(false)
  const [publicIntakeSaving, setPublicIntakeSaving] = useState(false)
  const [publicIntakeSchemaReady, setPublicIntakeSchemaReady] = useState(true)
  const [publicIntakePerformance, setPublicIntakePerformance] = useState(null)
  const [publicIntakePerformanceLoading, setPublicIntakePerformanceLoading] = useState(false)
  const [publicIntakePerformanceSchemaReady, setPublicIntakePerformanceSchemaReady] = useState(true)
  const attorneyModuleState = useAttorneyModuleSettings({ enabled: isAttorneyWorkspace })

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
  const showBusinessLinesOnly = section === 'business-lines'
  const hasUnsavedChanges = state && initialState ? JSON.stringify(state) !== JSON.stringify(initialState) : false
  const showPublicIntakeControls = section !== 'branding' && (copyKey === 'agency' || role === 'agent' || role === 'developer')
  const publicIntakeOrganisationName = useMemo(() => getOrganisationDisplayName(form || {}, onboarding || {}), [form, onboarding])
  const publicIntakeHost = useMemo(() => getCurrentPublicHost(), [])
  const publicIntakeUrls = useMemo(
    () => buildAgencyPublicIntakeUrls({ slug: publicIntakeDraft?.slug || '', host: publicIntakeHost }),
    [publicIntakeDraft?.slug, publicIntakeHost],
  )

  useEffect(() => {
    if (typeof window === 'undefined' || location.hash !== '#public-intake') return undefined
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('public-intake')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loading, location.hash, publicIntakeLoading, section, showPublicIntakeControls])

  useEffect(() => {
    let active = true

    async function loadPublicIntake() {
      if (!showPublicIntakeControls || !form?.id) {
        setPublicIntakeDraft(null)
        setPublicIntakeSchemaReady(true)
        setPublicIntakeLoading(false)
        return
      }

      try {
        setPublicIntakeLoading(true)
        const result = await loadAgencyPublicIntakeLink({ organisationId: form.id })
        if (!active) return
        setPublicIntakeSchemaReady(result.schemaReady !== false)
        setPublicIntakeDraft(createPublicIntakeDraft(result.link, publicIntakeOrganisationName))
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Public intake link settings could not be loaded.')
        setPublicIntakeDraft(createPublicIntakeDraft(null, publicIntakeOrganisationName))
      } finally {
        if (active) setPublicIntakeLoading(false)
      }
    }

    void loadPublicIntake()
    return () => {
      active = false
    }
  }, [form?.id, publicIntakeOrganisationName, showPublicIntakeControls])

  async function refreshPublicIntakePerformance({ silent = false, intakeLinkId = '' } = {}) {
    if (!showPublicIntakeControls || !form?.id) {
      setPublicIntakePerformance(null)
      setPublicIntakePerformanceSchemaReady(true)
      return null
    }
    try {
      if (!silent) setPublicIntakePerformanceLoading(true)
      const result = await loadAgencyPublicIntakePerformance({
        organisationId: form.id,
        intakeLinkId: intakeLinkId || publicIntakeDraft?.id || '',
        windowDays: 30,
        limit: 50,
      })
      setPublicIntakePerformanceSchemaReady(result.schemaReady !== false)
      setPublicIntakePerformance(result)
      return result
    } catch (loadError) {
      setError(loadError?.message || 'Public intake performance could not be loaded.')
      return null
    } finally {
      if (!silent) setPublicIntakePerformanceLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    async function loadPerformance() {
      if (!showPublicIntakeControls || !form?.id) {
        setPublicIntakePerformance(null)
        setPublicIntakePerformanceSchemaReady(true)
        setPublicIntakePerformanceLoading(false)
        return
      }
      try {
        setPublicIntakePerformanceLoading(true)
        const result = await loadAgencyPublicIntakePerformance({
          organisationId: form.id,
          intakeLinkId: publicIntakeDraft?.id || '',
          windowDays: 30,
          limit: 50,
        })
        if (!active) return
        setPublicIntakePerformanceSchemaReady(result.schemaReady !== false)
        setPublicIntakePerformance(result)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Public intake performance could not be loaded.')
      } finally {
        if (active) setPublicIntakePerformanceLoading(false)
      }
    }

    void loadPerformance()
    return () => {
      active = false
    }
  }, [form?.id, publicIntakeDraft?.id, showPublicIntakeControls])

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

  function synchronizeAgencyBusinessLines(nextState = state) {
    if (!nextState || isBondOriginator) return nextState
    const currentAgencyInfo = nextState.onboarding?.agencyInformation || {}
    const businessLines = normalizeAgencyBusinessLines(
      currentAgencyInfo.businessLines ||
        currentAgencyInfo.business_lines ||
        currentAgencyInfo.businessFocus ||
        'sales',
    )
    const businessFocus = getAgencyBusinessFocusFromLines(businessLines)
    const settingsJson = nextState.organisation?.settingsJson || {}
    return {
      ...nextState,
      organisation: {
        ...nextState.organisation,
        settingsJson: {
          ...settingsJson,
          businessLines,
          businessFocus,
          agencyInformation: {
            ...(settingsJson.agencyInformation || {}),
            businessLines,
            businessFocus,
          },
        },
      },
      onboarding: {
        ...nextState.onboarding,
        agencyInformation: {
          ...currentAgencyInfo,
          businessLines,
          businessFocus,
        },
      },
    }
  }

  function updateAgencyBusinessLine(line, checked) {
    if (!canEdit || isBondOriginator) return
    setMessage('')
    setError('')
    setState((previous) => {
      const currentAgencyInfo = previous?.onboarding?.agencyInformation || {}
      const current = normalizeAgencyBusinessLines(
        currentAgencyInfo.businessLines ||
          currentAgencyInfo.business_lines ||
          currentAgencyInfo.businessFocus ||
          'sales',
      )
      const nextSet = new Set(current)
      if (checked) {
        nextSet.add(line)
      } else {
        nextSet.delete(line)
      }
      if (!nextSet.size) {
        setError('At least one business line must stay enabled.')
        return previous
      }
      return synchronizeAgencyBusinessLines({
        ...previous,
        onboarding: {
          ...previous.onboarding,
          agencyInformation: {
            ...currentAgencyInfo,
            businessLines: Array.from(nextSet),
            businessFocus: getAgencyBusinessFocusFromLines(Array.from(nextSet)),
          },
        },
      })
    })
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

  function updatePublicIntakeField(key, value) {
    setMessage('')
    setPublicIntakeDraft((previous) => ({
      ...createPublicIntakeDraft(previous, publicIntakeOrganisationName),
      [key]: value,
    }))
  }

  function togglePublicIntakeIntent(intent, checked) {
    setMessage('')
    setError('')
    const draft = createPublicIntakeDraft(publicIntakeDraft, publicIntakeOrganisationName)
    const current = draft.enabledIntents?.length ? draft.enabledIntents : ['buy', 'sell']
    const next = checked
      ? [...new Set([...current, intent])]
      : current.filter((item) => item !== intent)
    if (!next.length) {
      setError('At least one intake path must stay enabled.')
      return
    }
    setPublicIntakeDraft((previous) => {
      return {
        ...createPublicIntakeDraft(previous, publicIntakeOrganisationName),
        enabledIntents: next,
      }
    })
  }

  async function savePublicIntakeLink(status = 'draft') {
    if (!canEdit || !form?.id || !publicIntakeDraft) return
    const slug = normalizeText(publicIntakeDraft.slug)
    if (slug.length < 3) {
      setError('Public intake slug must be at least 3 characters.')
      return
    }
    try {
      setPublicIntakeSaving(true)
      setError('')
      setMessage('')
      const result = await saveAgencyPublicIntakeLink({
        ...publicIntakeDraft,
        organisationId: form.id,
        status,
      }, {
        organisationName: publicIntakeOrganisationName,
      })
      setPublicIntakeSchemaReady(result.schemaReady !== false)
      if (result.link) {
        setPublicIntakeDraft(createPublicIntakeDraft(result.link, publicIntakeOrganisationName))
        void refreshPublicIntakePerformance({ silent: true, intakeLinkId: result.link.id })
        setMessage(status === 'active' ? 'Public intake link published.' : status === 'disabled' ? 'Public intake link disabled.' : 'Public intake draft saved.')
      } else if (result.missingSchema) {
        setMessage('')
        setError('Public intake storage is not installed yet. Apply the Phase 1 migration first.')
      }
    } catch (saveError) {
      setError(saveError?.message || 'Public intake link could not be saved.')
    } finally {
      setPublicIntakeSaving(false)
    }
  }

  async function disablePublicIntakeLink() {
    await savePublicIntakeLink('disabled')
  }

  async function copyPublicIntakeUrl(value, label = 'URL') {
    const url = normalizeText(value)
    if (!url) return
    try {
      await navigator.clipboard?.writeText(url)
      setMessage(`${label} URL copied.`)
    } catch {
      setMessage(`${label} URL ready to copy: ${url}`)
    }
  }

  function openPublicIntakeUrl(value) {
    const url = normalizeText(value)
    if (!url || typeof window === 'undefined') return
    window.open(url, '_blank', 'noopener,noreferrer')
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

  function updateOrganisationTarget(key, value) {
    setMessage('')
    setState((previous) => {
      const settingsJson = previous.organisation?.settingsJson || {}
      const targets = settingsJson.targets && typeof settingsJson.targets === 'object' ? settingsJson.targets : {}
      return {
        ...previous,
        organisation: {
          ...previous.organisation,
          settingsJson: {
            ...settingsJson,
            targets: {
              ...targets,
              [key]: value,
            },
          },
        },
      }
    })
  }

  async function handleLogoUpload(file, targetKey) {
    if (!file || !canEdit || !state || uploadingLogoTarget) return
    const validationError = validateBrandAssetFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    const resolvedTargetKey = BRAND_ASSET_TARGETS[targetKey] ? targetKey : 'logoLight'
    const assetConfig = BRAND_ASSET_TARGETS[resolvedTargetKey]
    try {
      setUploadingLogoTarget(resolvedTargetKey)
      setError('')
      setMessage('')
      const upload = await withBrandAssetTimeout(uploadOrganisationBrandingAsset({
        file,
        variant: assetConfig.variant,
      }))
      const assetUrl = upload.resolvedUrl || upload.signedUrl || upload.publicUrl || ''
      const previousBranding = state.onboarding?.branding || {}
      const previousUrl = normalizeText(previousBranding[resolvedTargetKey])
      const previousName = normalizeText(previousBranding[`${resolvedTargetKey}Name`])
      const currentHistory = getBrandAssetHistory(previousBranding, resolvedTargetKey)
      const nextHistory = previousUrl
        ? [{ url: previousUrl, fileName: previousName || assetConfig.title, replacedAt: new Date().toISOString() }, ...currentHistory].slice(0, 3)
        : currentHistory
      const nextBranding = {
        ...previousBranding,
        [resolvedTargetKey]: assetUrl || previousBranding[resolvedTargetKey] || '',
        [`${resolvedTargetKey}Name`]: file.name,
        [assetConfig.bucketField]: upload.bucket || previousBranding[assetConfig.bucketField] || '',
        [assetConfig.pathField]: upload.path || previousBranding[assetConfig.pathField] || '',
        assetHistory: {
          ...(previousBranding.assetHistory || {}),
          [resolvedTargetKey]: nextHistory,
        },
      }

      if (resolvedTargetKey === 'logoIcon') {
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
        organisation: resolvedTargetKey === 'logoLight'
          ? {
              ...state.organisation,
              logoUrl: assetUrl || state.organisation?.logoUrl || '',
            }
          : state.organisation,
      }

      setState(nextState)

      const saveTasks = [saveAgencyOnboardingDraft(nextState.onboarding)]
      if (resolvedTargetKey === 'logoLight') {
        saveTasks.push(updateOrganisationSettings(nextState.organisation))
      }
      await withBrandAssetTimeout(Promise.all(saveTasks))

      applyOrganisationState(nextState)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('itg:organisation-branding-updated'))
      }

      setMessage(resolvedTargetKey === 'logoIcon' ? 'Icon logo uploaded and applied.' : resolvedTargetKey === 'logoDark' ? 'Dark logo uploaded and applied.' : `${assetConfig.title} uploaded and applied.`)
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
      const stateToSave = synchronizeAgencyBusinessLines(state)

      const [organisationResponse, onboardingResponse] = await Promise.all([
        updateOrganisationSettings(stateToSave.organisation),
        saveAgencyOnboardingDraft({
          ...stateToSave.onboarding,
          organisationType: isBondOriginator ? 'bond_originator' : stateToSave.onboarding?.organisationType,
        }, { syncCommercialAccess: true }),
      ])

      await upsertAreaFromAddress(buildOrganisationAddressValue(stateToSave.organisation, stateToSave.onboarding), { incrementListingCount: false })

      const nextState = {
        ...stateToSave,
        ...organisationResponse,
        membershipRole: organisationResponse.membershipRole || onboardingResponse.membershipRole || stateToSave?.membershipRole || 'viewer',
        onboarding: onboardingResponse.onboarding,
      }

      setState((previous) => ({
        ...previous,
        ...nextState,
      }))
      setInitialState(nextState)
      applyOrganisationState(nextState)
      refreshAuthState?.()

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

  async function toggleAttorneyModule(moduleKey, nextValue) {
    if (!canEdit) return
    setMessage('')
    setError('')
    try {
      await attorneyModuleState.updateModules({ [moduleKey]: nextValue })
      const moduleDefinition = ATTORNEY_MODULE_DEFINITIONS.find((item) => item.key === moduleKey)
      setMessage(`${moduleDefinition?.title || 'Attorney module'} ${nextValue ? 'enabled' : 'disabled'}.`)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to update attorney module settings.')
    }
  }

  if (loading) {
    return <SettingsLoadingState label="Loading organisation settings…" />
  }

  if (!form || !onboarding) {
    return (
      <div className={settingsPageClass}>
        <SettingsBanner tone="warning">{error || copy.unavailable}</SettingsBanner>
      </div>
    )
  }

  const agencyInfo = onboarding.agencyInformation || {}
  const agencyBusinessLineSource = agencyInfo.businessLines || agencyInfo.business_lines
  const agencyBusinessLines = agencyBusinessLineSource
    ? normalizeAgencyBusinessLines(agencyBusinessLineSource)
    : getAgencyBusinessLinesFromFocus(agencyInfo.businessFocus || 'sales')
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
  const defaults = getOrganisationDefaults(form)
  const targets = getOrganisationTargets(form)
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
  const brandHealthChecks = getBrandHealthChecks({ branding, brandColours, publicBranding, showPublicIntake: showPublicIntakeControls, publicIntakeDraft })
  const brandHealth = getBrandHealthScore({ branding, brandColours, publicBranding, showPublicIntake: showPublicIntakeControls, publicIntakeDraft })
  const isSaveSuccessMessage = message === ORGANISATION_SUCCESS_MESSAGE || message === BRANDING_SUCCESS_MESSAGE
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
  if (showBrandingOnly) {
    return (
      <div className={settingsPageClass}>
        {!canEdit ? <SettingsBanner tone="warning">{copy.readOnly}</SettingsBanner> : null}
        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        <SettingsToast message={message} />

        <form className="space-y-6" onSubmit={handleSave}>
          <BrandHero
            organisationName={organisationName}
            primaryLogo={primaryAssetUrl}
            roleLabel={membershipRole}
            publicUrl={publicBranding.website}
            organisationTypeLabel={organisationTypeLabel}
            brandHealth={brandHealth}
            healthChecks={brandHealthChecks}
            canEdit={canEdit}
            uploading={uploadingLogoTarget === 'logoLight'}
            onUpload={(file) => handleLogoUpload(file, 'logoLight')}
            onHistory={() => document.getElementById('identity')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />

          <div className="space-y-6">
            <OrganisationCard title="Identity" description="Manage your logos and brand assets.">
              <div id="identity" className="scroll-mt-24 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
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

            <OrganisationCard title="Colours & Typography" description="Set the palette and type rules used across your workspace.">
              <div id="colours-typography" className="scroll-mt-24 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {BRAND_COLOUR_CONTROLS.map((control) => (
                    <BrandColourField
                      key={control.key}
                      label={control.label}
                      description={control.description}
                      value={brandColours[control.key] || control.fallback}
                      disabled={!canEdit}
                      onChange={(value) => updateBrandColour(control.key, value)}
                      onCopy={() => copyBrandHex(brandColours[control.key] || control.fallback)}
                    />
                  ))}
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <TypographyPreviewCard title="Heading Font" fontName={typography.primaryFont}>
                    <Field as="select" id="branding-primary-font" className={INPUT_CLASS} value={typography.primaryFont} disabled={!canEdit} onChange={(event) => updateBrandingNestedField('typography', 'primaryFont', event.target.value)}>
                      <option value="Inter">Inter</option>
                      <option value="Geist">Geist</option>
                      <option value="Arial">Arial</option>
                    </Field>
                  </TypographyPreviewCard>
                  <TypographyPreviewCard title="Body Font" fontName={typography.primaryFont}>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field as="select" id="branding-font-weight" className={INPUT_CLASS} value={typography.weight} disabled={!canEdit} onChange={(event) => updateBrandingNestedField('typography', 'weight', event.target.value)}>
                        <option value="Regular">Regular</option>
                        <option value="Medium">Medium</option>
                        <option value="Semibold">Semibold</option>
                      </Field>
                      <Field as="select" id="branding-button-style" className={INPUT_CLASS} value={typography.buttonStyle} disabled={!canEdit} onChange={(event) => updateBrandingNestedField('typography', 'buttonStyle', event.target.value)}>
                        <option value="Rounded">Rounded</option>
                        <option value="Soft">Soft</option>
                        <option value="Square">Square</option>
                      </Field>
                      <Field as="select" id="branding-border-radius" className={INPUT_CLASS} value={typography.borderRadius} disabled={!canEdit} onChange={(event) => updateBrandingNestedField('typography', 'borderRadius', event.target.value)}>
                        <option value="8px">8px</option>
                        <option value="12px">12px</option>
                        <option value="16px">16px</option>
                      </Field>
                    </div>
                  </TypographyPreviewCard>
              </div>
            </OrganisationCard>
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

  if (showBusinessLinesOnly) {
    return (
      <div className={settingsPageClass}>
        {!canEdit ? <SettingsBanner tone="warning">{copy.readOnly}</SettingsBanner> : null}
        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        {message && !isSaveSuccessMessage ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}
        {isSaveSuccessMessage ? (
          <div className="fixed bottom-6 right-6 z-40 max-w-sm rounded-[16px] border border-[#ccead8] bg-white px-4 py-3 text-sm font-semibold text-[#1f7a45] shadow-[0_18px_42px_rgba(15,23,42,0.14)]" role="status">
            {message}
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSave}>
          <section className="rounded-[24px] border border-[#dfe8f1] bg-white p-5 shadow-[0_18px_46px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#60758d]">Workspace Setup</p>
                <h1 className="mt-2 text-[1.65rem] font-semibold leading-tight text-[#17233a]">Business Lines</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
                  Configure whether this agency operates Sales, Rentals, or both. Team access is assigned in Users after the organisation lines are saved.
                </p>
              </div>
              <Link
                to="/settings/users"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#24364b] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:bg-[#f7fafc]"
              >
                <UsersRound className="h-4 w-4" strokeWidth={2} />
                Manage Users
              </Link>
            </div>
          </section>

          {isBondOriginator ? (
            <OrganisationCard title="Business Focus" description="Select the operating focus for this bond originator workspace.">
              <OrganisationField label={copy.businessFocusLabel} id="organisation-business-focus">
                <Field as="select" id="organisation-business-focus" className={INPUT_CLASS} value={agencyInfo.businessFocus || 'bond_applications'} disabled={!canEdit} onChange={(event) => updateAgencyField('businessFocus', event.target.value)}>
                  {BOND_BUSINESS_FOCUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Field>
              </OrganisationField>
            </OrganisationCard>
          ) : (
            <OrganisationCard
              title="Agency Business Lines"
              description="Enable the operating lines this agency runs. At least one line must remain enabled."
              actions={
                <Link to="/settings/users" className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc]">
                  <UsersRound className="h-4 w-4" strokeWidth={2} />
                  Assign agents
                </Link>
              }
            >
              <div className="grid gap-3 md:grid-cols-2">
                {AGENCY_BUSINESS_LINE_OPTIONS.map((option) => (
                  <BusinessLineOption
                    key={option.value}
                    option={option}
                    checked={agencyBusinessLines.includes(option.value)}
                    disabled={!canEdit}
                    onChange={updateAgencyBusinessLine}
                  />
                ))}
              </div>
              <div className="mt-5 rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4 text-sm leading-6 text-[#60758d]">
                <p className="font-semibold text-[#17233a]">How this affects the app</p>
                <p className="mt-1">
                  Principals and managers can inherit all enabled business lines. Agents can be set to Sales only, Rentals only, or Sales & Rentals from Users once both agency lines are enabled.
                </p>
              </div>
            </OrganisationCard>
          )}
        </form>

        {canEdit ? (
          <SettingsStickySaveBar
            dirty={Boolean(hasUnsavedChanges)}
            saving={saving}
            message="Unsaved Business Line Changes"
            discardLabel="Discard"
            saveLabel="Save Business Lines"
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
                {isAttorneyWorkspace ? (
                  <AttorneyModulesCard
                    modules={attorneyModuleState.modules}
                    loading={attorneyModuleState.loading}
                    saving={attorneyModuleState.saving}
                    error={attorneyModuleState.error}
                    canEdit={canEdit}
                    onToggle={(moduleKey, nextValue) => void toggleAttorneyModule(moduleKey, nextValue)}
                  />
                ) : null}

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
                    {isBondOriginator ? (
                      <OrganisationField label={copy.businessFocusLabel} id="organisation-business-focus">
                        <Field as="select" id="organisation-business-focus" className={INPUT_CLASS} value={agencyInfo.businessFocus || 'bond_applications'} disabled={!canEdit} onChange={(event) => updateAgencyField('businessFocus', event.target.value)}>
                          {BOND_BUSINESS_FOCUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </Field>
                      </OrganisationField>
                    ) : null}
                  </div>
                </OrganisationCard>

                {!isBondOriginator ? (
                  <OrganisationCard
                    title="Business Lines"
                    description="Select the operating lines this agency runs."
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      {AGENCY_BUSINESS_LINE_OPTIONS.map((option) => (
                        <BusinessLineOption
                          key={option.value}
                          option={option}
                          checked={agencyBusinessLines.includes(option.value)}
                          disabled={!canEdit}
                          onChange={updateAgencyBusinessLine}
                        />
                      ))}
                    </div>
                  </OrganisationCard>
                ) : null}

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

            <BrandingEssentialsCard
              organisationName={organisationName}
              logoUrl={primaryAssetUrl}
              darkLogoUrl={branding.logoDark}
              iconUrl={iconAssetUrl}
              colours={brandColourValues}
              canEdit={canEdit}
              uploadingLogoTarget={uploadingLogoTarget}
              onUploadLogo={(file, targetKey) => handleLogoUpload(file, targetKey)}
              onColourChange={(key, value) => updateBrandColour(key, value)}
              onCopyColour={(value) => copyBrandHex(value)}
            />

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
              onCopyColour={(value) => copyBrandHex(value)}
            />

            {showPublicIntakeControls ? (
              <section id="public-intake" className="scroll-mt-24 space-y-6">
                <PublicIntakeLinkCard
                  canEdit={canEdit}
                  draft={publicIntakeDraft}
                  loading={publicIntakeLoading}
                  schemaReady={publicIntakeSchemaReady}
                  saving={publicIntakeSaving}
                  urls={publicIntakeUrls}
                  onChange={updatePublicIntakeField}
                  onCopy={copyPublicIntakeUrl}
                  onDisable={disablePublicIntakeLink}
                  onOpen={openPublicIntakeUrl}
                  onSave={savePublicIntakeLink}
                  onToggleIntent={togglePublicIntakeIntent}
                />
                <PublicIntakePerformanceCard
                  loading={publicIntakePerformanceLoading}
                  schemaReady={publicIntakePerformanceSchemaReady}
                  performance={publicIntakePerformance}
                  onRefresh={refreshPublicIntakePerformance}
                />
              </section>
            ) : null}

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

                {isBondOriginator ? (
                  <section id="targets" className="scroll-mt-24">
                    <OrganisationCard title="Targets" description="Dashboard targets for the bond originator command centre.">
                      <div className="grid gap-4 md:grid-cols-3">
                        <OrganisationField label="Monthly Applications" id="organisation-target-applications">
                          <Field
                            id="organisation-target-applications"
                            type="number"
                            min="0"
                            className={INPUT_CLASS}
                            value={targets.applications || ''}
                            disabled={!canEdit}
                            onChange={(event) => updateOrganisationTarget('applications', event.target.value)}
                          />
                        </OrganisationField>
                        <OrganisationField label="Monthly Loan Value" id="organisation-target-loan-value">
                          <Field
                            id="organisation-target-loan-value"
                            type="number"
                            min="0"
                            step="10000"
                            className={INPUT_CLASS}
                            value={targets.loanValue || ''}
                            disabled={!canEdit}
                            onChange={(event) => updateOrganisationTarget('loanValue', event.target.value)}
                          />
                        </OrganisationField>
                        <OrganisationField label="Approval Rate Target" id="organisation-target-approval-rate">
                          <Field
                            id="organisation-target-approval-rate"
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            className={INPUT_CLASS}
                            value={targets.approvalRate || ''}
                            disabled={!canEdit}
                            onChange={(event) => updateOrganisationTarget('approvalRate', event.target.value)}
                          />
                        </OrganisationField>
                      </div>
                    </OrganisationCard>
                  </section>
                ) : null}

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
