import {
  Archive,
  ArrowUpDown,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ChevronLeft,
  ChevronRight,
  Download,
  DollarSign,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { formatDate, titleize } from '../commercialFormatters'
import { toLookupOptions } from '../commercialPipelineHelpers'
import { formatRelativeTime, formatShortDate } from '../commercialProspectFormatters'
import {
  COMMERCIAL_CANVASSING_METHODS,
  COMMERCIAL_CATEGORY_OPTIONS,
  COMMERCIAL_PRIORITY_OPTIONS,
  COMMERCIAL_PROSPECT_STATUSES,
  COMMERCIAL_ROLE_OPTIONS,
  getDealTypeFromRole,
  getDealTypeLabel,
  getPropertyCategoryLabel,
  getProspectBadgeVariant,
  getCategoryBadgeVariant,
  getRoleLabel,
} from '../commercialProspectTypes'
import { deriveCommercialCanvassingMetrics, filterCommercialProspects, normaliseCommercialProspect } from '../commercialProspectFilters'
import { validateCommercialProspectDraft } from '../commercialProspectValidation'
import Button from '../../../components/ui/Button'
import Field from '../../../components/ui/Field'
import Modal from '../../../components/ui/Modal'
import {
  createCommercialCompany,
  createCommercialContact,
  createCommercialDeal,
  createCommercialRequirement,
  getCommercialLookupData,
} from '../services/commercialApi'
import { getCommercialCanvassingContext, listCommercialCanvassingWorkspace, createCommercialCanvassingActivity, createCommercialCanvassingProspect, deleteCommercialCanvassingProspect, updateCommercialCanvassingProspect } from '../services/commercialCanvassingApi'
import { getCommercialPipelineData } from '../services/commercialPipelineApi'

const CARD_CLASS = 'rounded-[24px] border border-[#e6edf4] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]'
const FOLLOW_UP_PRIORITIES = COMMERCIAL_PRIORITY_OPTIONS
const PROSPECT_STATUSES = COMMERCIAL_PROSPECT_STATUSES
const CANVASSING_METHODS = COMMERCIAL_CANVASSING_METHODS
const PROSPECT_PROPERTY_TYPES = COMMERCIAL_CATEGORY_OPTIONS.map((option) => option.label)
const PROSPECT_TYPES = [
  'Seller Prospect',
  'Buyer Prospect',
  'Landlord Prospect',
  'Tenant Prospect',
  'Investor Prospect',
  'Occupier Prospect',
  'Developer Prospect',
  'Other',
]
const FILTER_DEAL_TABS = [
  { value: 'all', label: 'All Prospects' },
  { value: 'sale', label: 'Sales' },
  { value: 'lease', label: 'Leases' },
]
const LEASE_QUEUE_OPTIONS = [
  { value: 'all', label: 'All Prospects' },
  { value: 'followups', label: 'Follow Ups Due' },
  { value: 'converted', label: 'Converted' },
]
const SORT_OPTIONS = [
  { value: 'updatedAt:desc', label: 'Newest Updated' },
  { value: 'createdAt:desc', label: 'Newest Created' },
  { value: 'createdAt:asc', label: 'Oldest Created' },
  { value: 'followUpDate:asc', label: 'Follow-Up Date' },
  { value: 'value:desc', label: 'Highest Value' },
  { value: 'value:asc', label: 'Lowest Value' },
]

function isFollowUpDue(prospect = {}) {
  const due = new Date(prospect.nextFollowUpDate || prospect.followUpDate || prospect.next_follow_up_date || prospect.follow_up_date || '')
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return due.getTime() <= today.getTime()
}

function isConvertedProspect(prospect = {}) {
  return normalizeKey(getProspectStatus(prospect)).includes('converted')
}

function isCanvassingFollowUp(prospect = {}) {
  return isOpenProspect(prospect) && (normalizeKey(getProspectStatus(prospect)).includes('follow') || isFollowUpDue(prospect))
}

function getCanvassingPageViewConfig(dealType = '') {
  const normalizedDealType = normalizeKey(dealType)
  if (normalizedDealType === 'lease') {
    const roleOptions = COMMERCIAL_ROLE_OPTIONS.filter((option) => ['landlord', 'tenant'].includes(option.value))
    return {
      key: 'lease',
      title: 'Leasing Canvassing',
      description: 'Track landlord and tenant prospecting before converting them into lease leads.',
      createLabel: '+ Add Lease Prospect',
      searchPlaceholder: 'Search lease prospects, companies, brokers...',
      tabs: [
        { id: 'all', label: 'All Lease Prospects', matches: () => true },
        { id: 'landlords', label: 'Landlords', matches: (prospect) => normalizeKey(prospect.prospectRole) === 'landlord' },
        { id: 'tenants', label: 'Tenants', matches: (prospect) => normalizeKey(prospect.prospectRole) === 'tenant' },
        { id: 'converted', label: 'Converted', matches: isConvertedProspect },
        { id: 'followups', label: 'Follow Ups', matches: isCanvassingFollowUp },
      ],
      baseDealType: 'lease',
      showDepartmentTabs: true,
      showRoleFilters: false,
      roleOptions,
      allowedRoles: ['landlord', 'tenant'],
      defaultCreateRole: 'landlord',
    }
  }

  if (normalizedDealType === 'sale') {
    const roleOptions = COMMERCIAL_ROLE_OPTIONS.filter((option) => ['seller', 'buyer'].includes(option.value))
    return {
      key: 'sale',
      title: 'Sales Canvassing',
      description: 'Track seller and buyer prospecting before converting them into sales leads.',
      createLabel: '+ Add Sales Prospect',
      searchPlaceholder: 'Search sales prospects, companies, brokers...',
      tabs: [
        { id: 'all', label: 'All Sales Prospects', matches: () => true },
        { id: 'sellers', label: 'Sellers', matches: (prospect) => normalizeKey(prospect.prospectRole) === 'seller' },
        { id: 'buyers', label: 'Buyers', matches: (prospect) => normalizeKey(prospect.prospectRole) === 'buyer' },
        { id: 'converted', label: 'Converted', matches: isConvertedProspect },
        { id: 'followups', label: 'Follow Ups', matches: isCanvassingFollowUp },
      ],
      baseDealType: 'sale',
      showDepartmentTabs: true,
      showRoleFilters: false,
      roleOptions,
      allowedRoles: ['seller', 'buyer'],
      defaultCreateRole: 'seller',
    }
  }

  const roleOptions = COMMERCIAL_ROLE_OPTIONS.filter((option) => ['seller', 'buyer', 'landlord', 'tenant'].includes(option.value))
  return {
    key: 'all',
    title: 'Prospects',
    description: 'Unified commercial prospect register and follow-up state.',
    createLabel: '+ Add Prospect',
    searchPlaceholder: 'Search prospects, companies, brokers...',
    tabs: FILTER_DEAL_TABS,
    baseDealType: 'all',
    showDepartmentTabs: false,
    showRoleFilters: true,
    roleOptions,
    allowedRoles: ['seller', 'buyer', 'landlord', 'tenant'],
    defaultCreateRole: 'seller',
  }
}

const SELL_REASON_OPTIONS = [
  'Relocating',
  'Scaling down',
  'Portfolio optimisation',
  'Owner-occupier exit',
  'Investment disposal',
  'Development opportunity',
  'Unknown',
  'Other',
]

const BUY_LOOKING_FOR_OPTIONS = [
  'Owner-occupier premises',
  'Investment property',
  'Development land',
  'Warehouse / industrial facility',
  'Retail premises',
  'Office premises',
  'Agricultural asset',
  'Other',
]

const PURCHASE_TIMELINE_OPTIONS = ['Immediately', '0–3 months', '3–6 months', '6–12 months', '12+ months', 'Unknown']
const LEASE_TIMELINE_OPTIONS = ['Immediately', '0–3 months', '3–6 months', '6–12 months', '12+ months', 'Unknown']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function splitContactName(value = '') {
  const trimmed = normalizeText(value)
  if (!trimmed) return { firstName: '', lastName: '' }
  const [first, ...rest] = trimmed.split(/\s+/)
  return { firstName: first || '', lastName: rest.join(' ') || '' }
}

function formatRelativeDate(value) {
  if (!value) return 'No follow-up set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No follow-up set'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(parsed)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 0 && diffDays < 7) return `In ${diffDays} days`
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} days ago`
  return formatDate(value)
}

function toneForStatus(status = '') {
  const normalized = normalizeKey(status)
  if (normalized.includes('converted')) return 'emerald'
  if (normalized.includes('qualified') || normalized.includes('interested')) return 'violet'
  if (normalized.includes('follow')) return 'amber'
  if (normalized.includes('lost')) return 'rose'
  if (normalized.includes('archived')) return 'slate'
  if (normalized.includes('contacted')) return 'blue'
  return 'blue'
}

function toneClass(tone = 'slate') {
  switch (tone) {
    case 'green':
    case 'emerald':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'purple':
    case 'violet':
      return 'border-violet-200 bg-violet-50 text-violet-700'
    case 'pink':
      return 'border-pink-200 bg-pink-50 text-pink-700'
    case 'amber':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'rose':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'blue':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'slate':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600'
  }
}

function ProspectTonePill({ value }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(toneForStatus(value))}`}>
      {titleize(value)}
    </span>
  )
}

function pickLookupLabel(options = [], id = '', fallback = '-') {
  const match = options.find((option) => normalizeText(option.value) === normalizeText(id))
  return match?.label || fallback
}

function getProspectDisplayName(prospect = {}) {
  return normalizeText(prospect.companyName)
    || normalizeText(prospect.contactName)
    || [normalizeText(prospect.firstName), normalizeText(prospect.lastName)].filter(Boolean).join(' ')
    || normalizeText(prospect.area)
    || 'Commercial prospect'
}

function getProspectStatus(prospect = {}) {
  return normalizeText(prospect.status) || 'New'
}

function buildInitialDraft(defaultBrokerId = '', defaults = {}) {
  return {
    prospectRole: 'seller',
    dealType: 'sale',
    propertyCategory: 'retail',
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    propertyAddress: '',
    propertyName: '',
    portfolioName: '',
    lookingFor: '',
    preferredArea: '',
    spaceRequirement: '',
    sizeRange: '',
    budgetRange: '',
    reasonForSelling: '',
    targetPurchaseTimeline: '',
    leaseTimeline: '',
    vacancyDetails: '',
    estimatedSaleValue: '',
    estimatedMonthlyRental: '',
    estimatedAnnualRental: '',
    canvassingMethod: 'Cold Call',
    status: 'New',
    nextFollowUpDate: '',
    followUpPriority: 'Medium',
    followUpNote: '',
    notes: '',
    assignedBrokerId: defaultBrokerId,
    companyId: '',
    contactId: '',
    propertyId: '',
    vacancyId: '',
    listingId: '',
    linkedEntityType: '',
    linkedEntityId: '',
    ...defaults,
  }
}

function buildDraftFromSearchParams(searchParams, defaultBrokerId = '') {
  const getParam = (key) => normalizeText(searchParams?.get(key))
  const role = getParam('role') || getParam('prospectRole') || 'seller'
  return buildInitialDraft(defaultBrokerId, {
    companyName: getParam('companyName'),
    contactName: getParam('contactName'),
    prospectRole: role,
    dealType: getParam('deal') || getDealTypeFromRole(role),
    propertyCategory: getParam('category') || getParam('propertyCategory') || 'retail',
    propertyAddress: getParam('propertyAddress') || getParam('area'),
    propertyName: getParam('propertyName') || getParam('portfolioName'),
    portfolioName: getParam('portfolioName'),
    lookingFor: getParam('lookingFor'),
    preferredArea: getParam('preferredArea') || getParam('area'),
    spaceRequirement: getParam('spaceRequirement'),
    sizeRange: getParam('sizeRange'),
    budgetRange: getParam('budgetRange'),
    reasonForSelling: getParam('reasonForSelling'),
    targetPurchaseTimeline: getParam('targetPurchaseTimeline'),
    leaseTimeline: getParam('leaseTimeline'),
    vacancyDetails: getParam('vacancyDetails'),
    estimatedSaleValue: getParam('estimatedSaleValue'),
    estimatedMonthlyRental: getParam('estimatedMonthlyRental'),
    estimatedAnnualRental: getParam('estimatedAnnualRental'),
    propertyType: getParam('propertyType'),
    area: getParam('area'),
    status: getParam('status') || 'New',
    nextFollowUpDate: getParam('nextFollowUpDate'),
    followUpPriority: getParam('followUpPriority') || 'Medium',
    followUpNote: getParam('followUpNote'),
    estimatedValue: getParam('estimatedValue'),
    notes: getParam('notes'),
    prospectType: getParam('prospectType') || 'Landlord Prospect',
    canvassingMethod: getParam('canvassingMethod') || 'Cold Call',
    companyId: getParam('companyId'),
    contactId: getParam('contactId'),
    propertyId: getParam('propertyId'),
    vacancyId: getParam('vacancyId'),
    listingId: getParam('listingId'),
    linkedEntityType: getParam('linkedEntityType'),
    linkedEntityId: getParam('linkedEntityId'),
  })
}

function hasCreatePrefill(searchParams) {
  return [
    'companyName',
    'contactName',
    'area',
    'propertyAddress',
    'propertyName',
    'portfolioName',
    'preferredArea',
    'propertyId',
    'vacancyId',
    'listingId',
    'linkedEntityType',
    'linkedEntityId',
    'role',
    'deal',
    'category',
  ].some((key) => Boolean(normalizeText(searchParams?.get(key))))
}

function getWorkspaceLink(entityType = '', entityId = '') {
  const id = normalizeText(entityId)
  const normalizedType = normalizeText(entityType)
  if (!id) return ''
  switch (normalizedType) {
    case 'commercial_company':
      return `/commercial/companies/${id}`
    case 'commercial_contact':
      return `/commercial/contacts/${id}`
    case 'commercial_property':
      return `/commercial/properties/${id}`
    case 'commercial_vacancy':
      return `/commercial/vacancies/${id}`
    case 'commercial_listing':
      return `/commercial/listings/${id}`
    case 'commercial_requirement':
      return '/commercial/requirements/pipeline'
    case 'commercial_deal':
      return '/commercial/deals/pipeline'
    default:
      return ''
  }
}

function buildInitialActivityDraft() {
  return { activityType: 'Call', activityNote: '', outcome: '' }
}

function isConvertedStatus(status = '') {
  return normalizeKey(status).startsWith('converted to ')
}

function isOpenProspect(prospect = {}) {
  const status = getProspectStatus(prospect)
  return !['lost', 'archived'].includes(normalizeKey(status)) && !isConvertedStatus(status)
}

function inferRequirementType(prospect = {}) {
  const type = normalizeKey(prospect.prospectType)
  if (type.includes('investor') || type.includes('buyer')) return 'purchase'
  if (type.includes('owner occupier') || type.includes('occupier')) return 'lease'
  if (type.includes('developer')) return 'investment'
  return 'lease'
}

function inferClientType(prospect = {}) {
  const type = normalizeKey(prospect.prospectType)
  if (type.includes('tenant') || type.includes('occupier')) return 'tenant'
  if (type.includes('investor')) return 'investor'
  if (type.includes('buyer')) return 'owner_occupier'
  if (type.includes('landlord')) return 'landlord'
  return 'tenant'
}

function inferDealType(prospect = {}) {
  const type = inferRequirementType(prospect)
  return type === 'purchase' || type === 'investment' ? 'sale' : 'lease'
}

function buildSparklinePath(series = []) {
  const values = (Array.isArray(series) ? series : []).map((value) => Number(value || 0))
  if (!values.length) return ''
  const max = Math.max(1, ...values)
  const min = Math.min(...values)
  const span = Math.max(1, max - min)
  return values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100
    const y = 28 - (((value - min) / span) * 20)
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')
}

function MetricSparkline({ series = [], color = '#2d6ecf' }) {
  const path = buildSparklinePath(series)
  if (!path) return <div className="h-8 w-full rounded-full bg-[#f4f7fb]" />
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-full" role="img" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ProspectStat({ label, value, detail, icon, trendLabel = '', series = [], color = '#2d6ecf' }) {
  const IconComponent = icon
  return (
    <article className={`${CARD_CLASS} flex min-h-[126px] flex-col justify-between p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7b899a]">{label}</p>
          <p className="mt-3 text-[1.8rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">{value}</p>
          <p className="mt-2 text-[12px] text-[#6b7f95]">{detail}</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[#eef5fb] text-[#2d6ecf]">
          {IconComponent ? <IconComponent size={18} /> : null}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <MetricSparkline series={series} color={color} />
        </div>
        <p className="shrink-0 text-[11px] font-semibold text-[#7b899a]">{trendLabel || 'Current snapshot'}</p>
      </div>
    </article>
  )
}

function SearchField({ value, onChange, placeholder = 'Search canvassing prospects...', className = '' }) {
  return (
    <label className={`relative block ${className}`.trim()}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7d8ea3]" />
      <Field
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-[14px] pl-9"
      />
    </label>
  )
}

function RegisterTab({ active = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative whitespace-nowrap pb-3 text-sm font-semibold transition ${
        active
          ? 'text-[#1952c6] after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-[#2c6cf0]'
          : 'text-[#63768b] hover:text-[#0f2748]'
      }`}
    >
      {children}
    </button>
  )
}

function FilterChip({ active = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-[10px] px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-[#edf3ff] text-[#1952c6] shadow-[inset_0_0_0_1px_rgba(44,108,240,0.08)]'
          : 'text-[#60758d] hover:bg-[#f7faff] hover:text-[#0f2748]'
      }`}
    >
      {children}
    </button>
  )
}

function FilterSelect({ value, onChange, options = [], placeholder, className = '' }) {
  return (
    <Field as="select" value={value} onChange={(event) => onChange(event.target.value)} className={`h-11 rounded-[14px] bg-white text-sm ${className}`.trim()}>
      <option value="all">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value || option} value={option.value || option}>
          {option.label || option}
        </option>
      ))}
    </Field>
  )
}

function InlineTableEmptyState({ icon, title, description, actionLabel, onAction }) {
  const IconComponent = icon || ClipboardList
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#2d6ecf]">
        <IconComponent size={22} />
      </span>
      <p className="mt-4 text-base font-semibold text-[#102236]">{title}</p>
      <p className="mt-2 max-w-[420px] text-sm leading-6 text-[#60758d]">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex h-10 items-center rounded-[12px] border border-[#dce6f0] bg-white px-4 text-sm font-semibold text-[#0f2748] transition hover:border-[#bfd2e6] hover:bg-[#f8fbff]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

function FieldError({ error }) {
  if (!error) return null
  return <p className="text-xs font-medium text-rose-600">{error}</p>
}

function ReviewCard({ title, lines = [] }) {
  return (
    <div className="rounded-[18px] border border-[#dfe8f3] bg-[#fbfdff] p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8293aa]">{title}</p>
      <div className="mt-2 space-y-1 text-sm text-[#102236]">
        {lines.filter(Boolean).map((line, index) => (
          <p key={`${title}-${index}-${line}`} className="leading-6">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

function CreateLabel({ label, error, children, className = '' }) {
  return (
    <label className={`grid gap-1.5 ${className}`.trim()}>
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      {children}
      <FieldError error={error} />
    </label>
  )
}

function renderSellerFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Owner / Company Name *" error={createErrors.companyName}>
          <Field value={createDraft.companyName} onChange={(event) => updateCreateDraftField('companyName', event.target.value)} placeholder="Owner or company name" />
        </CreateLabel>
        <CreateLabel label="Contact Person">
          <Field value={createDraft.contactName} onChange={(event) => updateCreateDraftField('contactName', event.target.value)} placeholder="Decision maker or main contact" />
        </CreateLabel>
        <CreateLabel label="Phone">
          <Field value={createDraft.phone} onChange={(event) => updateCreateDraftField('phone', event.target.value)} placeholder="Phone number" />
        </CreateLabel>
        <CreateLabel label="Email">
          <Field value={createDraft.email} onChange={(event) => updateCreateDraftField('email', event.target.value)} placeholder="Email address" />
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Property / Asset Address or Area *" error={createErrors.propertyAddress}>
          <Field value={createDraft.propertyAddress} onChange={(event) => updateCreateDraftField('propertyAddress', event.target.value)} placeholder="Suburb, node, street address or area" />
        </CreateLabel>
        <CreateLabel label="Property Category *" error={createErrors.propertyCategory}>
          <Field as="select" value={createDraft.propertyCategory} onChange={(event) => updateCreateDraftField('propertyCategory', event.target.value)}>
            {COMMERCIAL_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Field>
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Estimated Sale Value">
          <Field as="input" type="number" value={createDraft.estimatedSaleValue} onChange={(event) => updateCreateDraftField('estimatedSaleValue', event.target.value)} placeholder="e.g. R5 000 000" />
        </CreateLabel>
        <CreateLabel label="Reason for Selling">
          <Field as="select" value={createDraft.reasonForSelling} onChange={(event) => updateCreateDraftField('reasonForSelling', event.target.value)}>
            <option value="">Select reason</option>
            {SELL_REASON_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CreateLabel label="Follow-up Date">
          <Field as="input" type="date" value={createDraft.nextFollowUpDate} onChange={(event) => updateCreateDraftField('nextFollowUpDate', event.target.value)} />
        </CreateLabel>
        <CreateLabel label="Priority">
          <Field as="select" value={createDraft.followUpPriority} onChange={(event) => updateCreateDraftField('followUpPriority', event.target.value)}>
            {FOLLOW_UP_PRIORITIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Assigned Broker" error={createErrors.assignedBrokerId}>
          <Field as="select" value={createDraft.assignedBrokerId} onChange={(event) => updateCreateDraftField('assignedBrokerId', event.target.value)}>
            <option value="">Unassigned</option>
            {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Field>
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Canvassing Method">
          <Field as="select" value={createDraft.canvassingMethod} onChange={(event) => updateCreateDraftField('canvassingMethod', event.target.value)}>
            {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Notes">
          <Field as="textarea" value={createDraft.notes} onChange={(event) => updateCreateDraftField('notes', event.target.value)} placeholder="Context, objections, next step..." />
        </CreateLabel>
      </div>
    </>
  )
}

function renderBuyerFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Buyer / Company Name *" error={createErrors.companyName}>
          <Field value={createDraft.companyName} onChange={(event) => updateCreateDraftField('companyName', event.target.value)} placeholder="Buyer or company name" />
        </CreateLabel>
        <CreateLabel label="Contact Person">
          <Field value={createDraft.contactName} onChange={(event) => updateCreateDraftField('contactName', event.target.value)} placeholder="Decision maker or main contact" />
        </CreateLabel>
        <CreateLabel label="Phone">
          <Field value={createDraft.phone} onChange={(event) => updateCreateDraftField('phone', event.target.value)} placeholder="Phone number" />
        </CreateLabel>
        <CreateLabel label="Email">
          <Field value={createDraft.email} onChange={(event) => updateCreateDraftField('email', event.target.value)} placeholder="Email address" />
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Looking For *" error={createErrors.lookingFor}>
          <Field as="select" value={createDraft.lookingFor} onChange={(event) => updateCreateDraftField('lookingFor', event.target.value)}>
            <option value="">Select requirement</option>
            {BUY_LOOKING_FOR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Property Category *" error={createErrors.propertyCategory}>
          <Field as="select" value={createDraft.propertyCategory} onChange={(event) => updateCreateDraftField('propertyCategory', event.target.value)}>
            {COMMERCIAL_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Preferred Area *" error={createErrors.preferredArea}>
          <Field value={createDraft.preferredArea} onChange={(event) => updateCreateDraftField('preferredArea', event.target.value)} placeholder="Preferred area or node" />
        </CreateLabel>
        <CreateLabel label="Budget Range">
          <Field value={createDraft.budgetRange} onChange={(event) => updateCreateDraftField('budgetRange', event.target.value)} placeholder="e.g. R100 000 - R150 000" />
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CreateLabel label="Target Purchase Timeline">
          <Field as="select" value={createDraft.targetPurchaseTimeline} onChange={(event) => updateCreateDraftField('targetPurchaseTimeline', event.target.value)}>
            <option value="">Select timeline</option>
            {PURCHASE_TIMELINE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Follow-up Date">
          <Field as="input" type="date" value={createDraft.nextFollowUpDate} onChange={(event) => updateCreateDraftField('nextFollowUpDate', event.target.value)} />
        </CreateLabel>
        <CreateLabel label="Priority">
          <Field as="select" value={createDraft.followUpPriority} onChange={(event) => updateCreateDraftField('followUpPriority', event.target.value)}>
            {FOLLOW_UP_PRIORITIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Assigned Broker" error={createErrors.assignedBrokerId}>
          <Field as="select" value={createDraft.assignedBrokerId} onChange={(event) => updateCreateDraftField('assignedBrokerId', event.target.value)}>
            <option value="">Unassigned</option>
            {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Canvassing Method">
          <Field as="select" value={createDraft.canvassingMethod} onChange={(event) => updateCreateDraftField('canvassingMethod', event.target.value)}>
            {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
      </div>
      <CreateLabel label="Notes">
        <Field as="textarea" value={createDraft.notes} onChange={(event) => updateCreateDraftField('notes', event.target.value)} placeholder="Context, objections, next step..." />
      </CreateLabel>
    </>
  )
}

function renderLandlordFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Landlord / Company Name *" error={createErrors.companyName}>
          <Field value={createDraft.companyName} onChange={(event) => updateCreateDraftField('companyName', event.target.value)} placeholder="Landlord or company name" />
        </CreateLabel>
        <CreateLabel label="Asset Manager">
          <Field value={createDraft.contactName} onChange={(event) => updateCreateDraftField('contactName', event.target.value)} placeholder="Asset manager or authorised signatory" />
        </CreateLabel>
        <CreateLabel label="Phone">
          <Field value={createDraft.phone} onChange={(event) => updateCreateDraftField('phone', event.target.value)} placeholder="Phone number" />
        </CreateLabel>
        <CreateLabel label="Email">
          <Field value={createDraft.email} onChange={(event) => updateCreateDraftField('email', event.target.value)} placeholder="Email address" />
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Property / Portfolio Name *" error={createErrors.propertyName}>
          <Field value={createDraft.propertyName} onChange={(event) => updateCreateDraftField('propertyName', event.target.value)} placeholder="Rosebank Mall, Route 21 Business Park, owner portfolio" />
        </CreateLabel>
        <CreateLabel label="Property Category *" error={createErrors.propertyCategory}>
          <Field as="select" value={createDraft.propertyCategory} onChange={(event) => updateCreateDraftField('propertyCategory', event.target.value)}>
            {COMMERCIAL_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Vacancy Details">
          <Field value={createDraft.vacancyDetails} onChange={(event) => updateCreateDraftField('vacancyDetails', event.target.value)} placeholder="e.g. 500 sqm office vacancy from August" />
        </CreateLabel>
        <CreateLabel label="Preferred Area">
          <Field value={createDraft.preferredArea} onChange={(event) => updateCreateDraftField('preferredArea', event.target.value)} placeholder="Location or node" />
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CreateLabel label="Estimated Monthly Rental">
          <Field as="input" type="number" value={createDraft.estimatedMonthlyRental} onChange={(event) => updateCreateDraftField('estimatedMonthlyRental', event.target.value)} placeholder="0" />
        </CreateLabel>
        <CreateLabel label="Estimated Annual Rental">
          <Field as="input" type="number" value={createDraft.estimatedAnnualRental} onChange={(event) => updateCreateDraftField('estimatedAnnualRental', event.target.value)} placeholder="0" />
        </CreateLabel>
        <CreateLabel label="Follow-up Date">
          <Field as="input" type="date" value={createDraft.nextFollowUpDate} onChange={(event) => updateCreateDraftField('nextFollowUpDate', event.target.value)} />
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CreateLabel label="Priority">
          <Field as="select" value={createDraft.followUpPriority} onChange={(event) => updateCreateDraftField('followUpPriority', event.target.value)}>
            {FOLLOW_UP_PRIORITIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Assigned Broker" error={createErrors.assignedBrokerId}>
          <Field as="select" value={createDraft.assignedBrokerId} onChange={(event) => updateCreateDraftField('assignedBrokerId', event.target.value)}>
            <option value="">Unassigned</option>
            {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Canvassing Method">
          <Field as="select" value={createDraft.canvassingMethod} onChange={(event) => updateCreateDraftField('canvassingMethod', event.target.value)}>
            {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
      </div>
      <CreateLabel label="Notes">
        <Field as="textarea" value={createDraft.notes} onChange={(event) => updateCreateDraftField('notes', event.target.value)} placeholder="Context, objections, next step..." />
      </CreateLabel>
    </>
  )
}

function renderTenantFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Tenant / Company Name *" error={createErrors.companyName}>
          <Field value={createDraft.companyName} onChange={(event) => updateCreateDraftField('companyName', event.target.value)} placeholder="Tenant or company name" />
        </CreateLabel>
        <CreateLabel label="Contact Person">
          <Field value={createDraft.contactName} onChange={(event) => updateCreateDraftField('contactName', event.target.value)} placeholder="Decision maker or main contact" />
        </CreateLabel>
        <CreateLabel label="Phone">
          <Field value={createDraft.phone} onChange={(event) => updateCreateDraftField('phone', event.target.value)} placeholder="Phone number" />
        </CreateLabel>
        <CreateLabel label="Email">
          <Field value={createDraft.email} onChange={(event) => updateCreateDraftField('email', event.target.value)} placeholder="Email address" />
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Space Requirement *" error={createErrors.spaceRequirement}>
          <Field value={createDraft.spaceRequirement} onChange={(event) => updateCreateDraftField('spaceRequirement', event.target.value)} placeholder="e.g. 800-1,200 sqm warehouse with yard" />
        </CreateLabel>
        <CreateLabel label="Property Category *" error={createErrors.propertyCategory}>
          <Field as="select" value={createDraft.propertyCategory} onChange={(event) => updateCreateDraftField('propertyCategory', event.target.value)}>
            {COMMERCIAL_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Preferred Area *" error={createErrors.preferredArea}>
          <Field value={createDraft.preferredArea} onChange={(event) => updateCreateDraftField('preferredArea', event.target.value)} placeholder="Preferred area or node" />
        </CreateLabel>
        <CreateLabel label="Size Range">
          <Field value={createDraft.sizeRange} onChange={(event) => updateCreateDraftField('sizeRange', event.target.value)} placeholder="e.g. 500 - 800 sqm" />
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CreateLabel label="Budget / Rental Range">
          <Field value={createDraft.budgetRange} onChange={(event) => updateCreateDraftField('budgetRange', event.target.value)} placeholder="e.g. R80 000 - R120 000" />
        </CreateLabel>
        <CreateLabel label="Lease Timeline">
          <Field as="select" value={createDraft.leaseTimeline} onChange={(event) => updateCreateDraftField('leaseTimeline', event.target.value)}>
            <option value="">Select timeline</option>
            {LEASE_TIMELINE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Follow-up Date">
          <Field as="input" type="date" value={createDraft.nextFollowUpDate} onChange={(event) => updateCreateDraftField('nextFollowUpDate', event.target.value)} />
        </CreateLabel>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <CreateLabel label="Priority">
          <Field as="select" value={createDraft.followUpPriority} onChange={(event) => updateCreateDraftField('followUpPriority', event.target.value)}>
            {FOLLOW_UP_PRIORITIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Assigned Broker" error={createErrors.assignedBrokerId}>
          <Field as="select" value={createDraft.assignedBrokerId} onChange={(event) => updateCreateDraftField('assignedBrokerId', event.target.value)}>
            <option value="">Unassigned</option>
            {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Canvassing Method">
          <Field as="select" value={createDraft.canvassingMethod} onChange={(event) => updateCreateDraftField('canvassingMethod', event.target.value)}>
            {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
      </div>
      <CreateLabel label="Notes">
        <Field as="textarea" value={createDraft.notes} onChange={(event) => updateCreateDraftField('notes', event.target.value)} placeholder="Context, objections, next step..." />
      </CreateLabel>
    </>
  )
}

function CommercialCanvassingPage({ dealType = '' }) {
  const [searchParams] = useSearchParams()
  const pageView = useMemo(() => getCanvassingPageViewConfig(dealType), [dealType])
  const [organisationId, setOrganisationId] = useState('')
  const [prospects, setProspects] = useState([])
  const [activities, setActivities] = useState([])
  const [lookups, setLookups] = useState({})
  const [, setPipeline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [canvassingEnabled, setCanvassingEnabled] = useState(true)
  const [search, setSearch] = useState('')
  const [dealFilter, setDealFilter] = useState(pageView.baseDealType || 'all')
  const [activeTab, setActiveTab] = useState(pageView.tabs[0]?.id || 'all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [brokerFilter, setBrokerFilter] = useState('all')
  const [sortKey, setSortKey] = useState('updatedAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [selectedProspectId, setSelectedProspectId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createStep, setCreateStep] = useState(2)
  const [createErrors, setCreateErrors] = useState({})
  const [createDraft, setCreateDraft] = useState(buildInitialDraft())
  const [activityDraft, setActivityDraft] = useState(buildInitialActivityDraft())
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [openActionMenuId, setOpenActionMenuId] = useState('')
  const createPrefillAppliedRef = useRef('')
  const createPrefillKey = searchParams.toString()
  const hasCreatePrefillParams = hasCreatePrefill(searchParams)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const context = await getCommercialCanvassingContext()
      const nextOrganisationId = context.organisationId || ''
      const nextCanvassingEnabled = context.commercialCanvassingEnabled !== false
      setCanvassingEnabled(nextCanvassingEnabled)
      if (!nextCanvassingEnabled) {
        setOrganisationId(nextOrganisationId)
        setProspects([])
        setActivities([])
        setLookups({})
        setPipeline(null)
        return
      }
      const [workspace, nextLookups, nextPipeline] = await Promise.all([
        nextOrganisationId ? listCommercialCanvassingWorkspace(nextOrganisationId) : Promise.resolve({ prospects: [], activities: [] }),
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : Promise.resolve({}),
        nextOrganisationId ? getCommercialPipelineData(nextOrganisationId) : Promise.resolve(null),
      ])
      setOrganisationId(nextOrganisationId)
      setProspects(Array.isArray(workspace?.prospects) ? workspace.prospects : [])
      setActivities(Array.isArray(workspace?.activities) ? workspace.activities : [])
      setLookups(nextLookups || {})
      setPipeline(nextPipeline || null)
    } catch (loadError) {
      setError(loadError?.message || 'Commercial canvassing could not be loaded.')
      setProspects([])
      setActivities([])
      setLookups({})
      setPipeline(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!pageView.showDepartmentTabs || !pageView.baseDealType) return
    if (dealFilter !== pageView.baseDealType) {
      setDealFilter(pageView.baseDealType)
    }
  }, [dealFilter, pageView.baseDealType, pageView.showDepartmentTabs])

  useEffect(() => {
    if (!pageView.tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(pageView.tabs[0]?.id || 'all')
    }
  }, [activeTab, pageView.tabs])

  const lookupOptions = useMemo(() => toLookupOptions(lookups), [lookups])
  const brokerOptions = useMemo(() => lookupOptions.brokers || [], [lookupOptions])

  useEffect(() => {
    setCreateDraft((previous) => {
      if (previous.assignedBrokerId) return previous
      return { ...previous, assignedBrokerId: brokerOptions[0]?.value || '' }
    })
  }, [brokerOptions])

  useEffect(() => {
    if (!hasCreatePrefillParams || createPrefillAppliedRef.current === createPrefillKey) return
    const nextDraft = buildDraftFromSearchParams(searchParams, brokerOptions[0]?.value || '')
    if (pageView.showDepartmentTabs && !normalizeText(searchParams.get('role')) && !normalizeText(searchParams.get('prospectRole'))) {
      nextDraft.prospectRole = pageView.defaultCreateRole
      nextDraft.dealType = getDealTypeFromRole(pageView.defaultCreateRole)
    }
    setCreateDraft(nextDraft)
    setCreateOpen(true)
    setCreateStep(2)
    setCreateErrors({})
    createPrefillAppliedRef.current = createPrefillKey
  }, [brokerOptions, createPrefillKey, hasCreatePrefillParams, pageView.defaultCreateRole, pageView.showDepartmentTabs, searchParams])

  useEffect(() => {
    if (dealFilter === 'sale' && ['landlord', 'tenant'].includes(normalizeKey(roleFilter))) {
      setRoleFilter('all')
    }
    if (dealFilter === 'lease' && ['seller', 'buyer'].includes(normalizeKey(roleFilter))) {
      setRoleFilter('all')
    }
  }, [dealFilter, roleFilter])

  const activitiesByProspectId = useMemo(() => {
    const nextMap = new Map()

    activities.forEach((activityRow) => {
      const prospectId = normalizeText(activityRow?.prospectId || activityRow?.prospect_id)
      if (!prospectId || nextMap.has(prospectId)) return
      nextMap.set(prospectId, activityRow)
    })

    return nextMap
  }, [activities])

  const normalizedProspects = useMemo(() => prospects.map((prospect) => normaliseCommercialProspect(prospect, {
    lastActivity: activitiesByProspectId.get(normalizeText(prospect.id)) || null,
    assignedBrokerName: pickLookupLabel(brokerOptions, prospect.assignedBrokerId, prospect.assignedBrokerName || ''),
  })), [activitiesByProspectId, brokerOptions, prospects])

  const pageScopedProspects = useMemo(() => {
    if (!pageView.showDepartmentTabs || pageView.baseDealType === 'all') return normalizedProspects
    return normalizedProspects.filter((prospect) => normalizeKey(prospect.dealType) === normalizeKey(pageView.baseDealType))
  }, [normalizedProspects, pageView.baseDealType, pageView.showDepartmentTabs])

  const selectedProspect = useMemo(
    () => prospects.find((prospect) => normalizeText(prospect.id) === normalizeText(selectedProspectId)) || null,
    [prospects, selectedProspectId],
  )

  const selectedActivities = useMemo(
    () => activities
      .filter((activityRow) => normalizeText(activityRow.prospectId || activityRow.prospect_id) === normalizeText(selectedProspect?.id))
      .sort((left, right) => new Date(right.activityDate || right.createdAt || 0) - new Date(left.activityDate || left.createdAt || 0)),
    [activities, selectedProspect],
  )

  const activeTabConfig = useMemo(
    () => pageView.tabs.find((tab) => tab.id === activeTab) || pageView.tabs[0] || FILTER_DEAL_TABS[0],
    [activeTab, pageView.tabs],
  )

  const roleFilterOptions = useMemo(
    () => pageView.showRoleFilters
      ? [
        { value: 'all', label: 'All' },
        ...(dealFilter === 'lease'
          ? [{ value: 'landlord', label: 'Landlords' }, { value: 'tenant', label: 'Tenants' }]
          : dealFilter === 'sale'
            ? [{ value: 'seller', label: 'Sellers' }, { value: 'buyer', label: 'Buyers' }]
            : [{ value: 'seller', label: 'Sellers' }, { value: 'buyer', label: 'Buyers' }, { value: 'landlord', label: 'Landlords' }, { value: 'tenant', label: 'Tenants' }]),
      ]
      : pageView.roleOptions,
    [dealFilter, pageView.roleOptions, pageView.showRoleFilters],
  )

  const filteredProspects = useMemo(() => {
    const rows = filterCommercialProspects(normalizedProspects, {
      search,
      dealType: pageView.showDepartmentTabs ? pageView.baseDealType : dealFilter,
      role: pageView.key === 'lease' ? roleFilter : pageView.showDepartmentTabs ? 'all' : roleFilter,
      category: categoryFilter,
      assigned: brokerFilter,
    })
      .filter((prospect) => statusFilter === 'all' || normalizeKey(prospect.stageLabel || prospect.status) === normalizeKey(statusFilter))
      .filter((prospect) => methodFilter === 'all' || normalizeKey(prospect.sourceLabel || prospect.canvassingMethod || prospect.source) === normalizeKey(methodFilter))

    if (pageView.key === 'lease') {
      if (activeTab === 'followups') return rows.filter((prospect) => isCanvassingFollowUp(prospect))
      if (activeTab === 'converted') return rows.filter((prospect) => isConvertedProspect(prospect))
      return rows
    }

    return pageView.showDepartmentTabs
      ? rows.filter((prospect) => activeTabConfig.matches(prospect))
      : rows
  }, [activeTab, activeTabConfig, brokerFilter, categoryFilter, dealFilter, methodFilter, normalizedProspects, pageView.baseDealType, pageView.key, pageView.showDepartmentTabs, roleFilter, search, statusFilter])

  const sortedProspects = useMemo(() => {
    const rows = [...filteredProspects]

    rows.sort((left, right) => {
      const leftValue = sortKey === 'value'
        ? Number(left.estimatedValue || left.estimated_value || 0)
        : sortKey === 'followUpDate'
          ? left.nextFollowUpDate || left.next_follow_up_date || ''
          : sortKey === 'lastActivityAt'
            ? left.lastActivity?.activityDate || left.lastActivity?.createdAt || ''
            : left?.[sortKey] || left?.updatedAt || left?.createdAt || ''
      const rightValue = sortKey === 'value'
        ? Number(right.estimatedValue || right.estimated_value || 0)
        : sortKey === 'followUpDate'
          ? right.nextFollowUpDate || right.next_follow_up_date || ''
          : sortKey === 'lastActivityAt'
            ? right.lastActivity?.activityDate || right.lastActivity?.createdAt || ''
            : right?.[sortKey] || right?.updatedAt || right?.createdAt || ''

      let comparison = 0
      if (sortKey === 'value') {
        comparison = leftValue - rightValue
      } else if (['updatedAt', 'createdAt', 'followUpDate', 'lastActivityAt'].includes(sortKey)) {
        const leftDate = new Date(leftValue)
        const rightDate = new Date(rightValue)
        const leftTime = Number.isNaN(leftDate.getTime()) ? 0 : leftDate.getTime()
        const rightTime = Number.isNaN(rightDate.getTime()) ? 0 : rightDate.getTime()
        comparison = leftTime - rightTime
      } else {
        comparison = String(leftValue).localeCompare(String(rightValue))
      }

      return sortDirection === 'desc' ? -comparison : comparison
    })

    return rows
  }, [filteredProspects, sortDirection, sortKey])

  const metrics = useMemo(() => deriveCommercialCanvassingMetrics(pageScopedProspects, activities), [activities, pageScopedProspects])
  const leaseRoleCounts = useMemo(() => {
    const activeLeaseProspects = pageScopedProspects.filter((prospect) => !['archived', 'lost', 'closed'].includes(normalizeKey(prospect.status)))
    return {
      landlords: activeLeaseProspects.filter((prospect) => normalizeKey(prospect.prospectRole) === 'landlord').length,
      tenants: activeLeaseProspects.filter((prospect) => normalizeKey(prospect.prospectRole) === 'tenant').length,
    }
  }, [pageScopedProspects])

  const kpiSeries = useMemo(() => {
    const buildSeries = (resolver) => {
      const buckets = Array.from({ length: 6 }, (_, index) => ({
        start: new Date(Date.now() - (5 - index) * 7 * 24 * 60 * 60 * 1000),
        value: 0,
      }))
      buckets.forEach((bucket) => bucket.start.setHours(0, 0, 0, 0))
      for (const row of pageScopedProspects) {
        const date = new Date(row.createdAt || row.created_at || row.updatedAt || row.updated_at || 0)
        if (Number.isNaN(date.getTime()) || !resolver(row)) continue
        const index = buckets.findIndex((bucket, bucketIndex) => {
          const start = bucket.start.getTime()
          const end = bucketIndex === buckets.length - 1 ? Number.POSITIVE_INFINITY : buckets[bucketIndex + 1].start.getTime()
          return date.getTime() >= start && date.getTime() < end
        })
        if (index >= 0) buckets[index].value += 1
      }
      return buckets.map((bucket) => bucket.value)
    }
    const buildFollowUpSeries = () => {
      const buckets = Array.from({ length: 6 }, (_, index) => ({
        start: new Date(Date.now() - (5 - index) * 7 * 24 * 60 * 60 * 1000),
        value: 0,
      }))
      buckets.forEach((bucket) => bucket.start.setHours(0, 0, 0, 0))
      for (const row of pageScopedProspects) {
        const date = new Date(row.nextFollowUpDate || row.next_follow_up_date || 0)
        if (Number.isNaN(date.getTime()) || !isOpenProspect(row)) continue
        const index = buckets.findIndex((bucket, bucketIndex) => {
          const start = bucket.start.getTime()
          const end = bucketIndex === buckets.length - 1 ? Number.POSITIVE_INFINITY : buckets[bucketIndex + 1].start.getTime()
          return date.getTime() >= start && date.getTime() < end
        })
        if (index >= 0) buckets[index].value += 1
      }
      return buckets.map((bucket) => bucket.value)
    }
    return {
      total: buildSeries((row) => isOpenProspect(row)),
      landlords: buildSeries((row) => normalizeKey(row.prospectRole) === 'landlord' && isOpenProspect(row)),
      tenants: buildSeries((row) => normalizeKey(row.prospectRole) === 'tenant' && isOpenProspect(row)),
      followUps: buildFollowUpSeries(),
      converted: buildSeries((row) => normalizeKey(row.status).includes('converted')),
    }
  }, [pageScopedProspects])

  const tabCounts = useMemo(() => {
    return pageView.tabs.reduce((accumulator, tab) => {
      accumulator[tab.id] = pageScopedProspects.filter((prospect) => tab.matches(prospect)).length
      return accumulator
    }, {})
  }, [pageScopedProspects, pageView.tabs])

  function resetCreateDraft(nextRole = pageView.defaultCreateRole) {
    setCreateDraft(buildInitialDraft(brokerOptions[0]?.value || '', {
      prospectRole: nextRole,
      dealType: getDealTypeFromRole(nextRole),
      propertyCategory: 'retail',
      assignedBrokerId: brokerOptions[0]?.value || '',
    }))
    setCreateErrors({})
    setCreateStep(2)
  }

  function openCreateModal(nextRole = pageView.defaultCreateRole) {
    resetCreateDraft(nextRole)
    setCreateOpen(true)
  }

  useEffect(() => {
    if (selectedProspectId && !selectedProspect) {
      setDrawerOpen(false)
      setSelectedProspectId('')
    }
  }, [selectedProspect, selectedProspectId])

  function updateSelectedProspectField(field, value) {
    setProspects((current) => current.map((row) => (
      normalizeText(row.id) === normalizeText(selectedProspectId)
        ? { ...row, [field]: value }
        : row
    )))
  }

  function updateCreateDraftField(field, value) {
    setCreateDraft((current) => {
      const next = { ...current, [field]: value }
      if (field === 'prospectRole') {
        next.dealType = getDealTypeFromRole(value)
        next.propertyCategory = current.propertyCategory || 'retail'
      }
      if (field === 'propertyCategory' && !normalizeText(value)) {
        next.propertyCategory = 'retail'
      }
      return next
    })
    setCreateErrors((current) => ({ ...current, [field]: '' }))
  }

  function updateCreateRole(nextRole) {
    setCreateDraft((current) => {
      const cleared = {
        ...current,
        prospectRole: nextRole,
        dealType: getDealTypeFromRole(nextRole),
      }
      if (nextRole === 'seller') {
        return {
          ...cleared,
          lookingFor: '',
          preferredArea: '',
          spaceRequirement: '',
          sizeRange: '',
          budgetRange: '',
          reasonForSelling: current.reasonForSelling || '',
          targetPurchaseTimeline: '',
          leaseTimeline: '',
          vacancyDetails: '',
          estimatedMonthlyRental: '',
          estimatedAnnualRental: '',
        }
      }
      if (nextRole === 'buyer') {
        return {
          ...cleared,
          propertyAddress: '',
          propertyName: '',
          portfolioName: '',
          spaceRequirement: '',
          sizeRange: '',
          estimatedMonthlyRental: '',
          estimatedAnnualRental: '',
          leaseTimeline: '',
          reasonForSelling: '',
          vacancyDetails: '',
        }
      }
      if (nextRole === 'landlord') {
        return {
          ...cleared,
          propertyAddress: '',
          lookingFor: '',
          targetPurchaseTimeline: '',
          reasonForSelling: '',
          estimatedSaleValue: '',
          estimatedMonthlyRental: current.estimatedMonthlyRental || '',
        }
      }
      return {
        ...cleared,
        propertyAddress: '',
        propertyName: '',
        portfolioName: '',
        lookingFor: '',
        targetPurchaseTimeline: '',
        reasonForSelling: '',
        estimatedSaleValue: '',
      }
    })
    setCreateErrors({})
    setCreateStep(2)
  }

  function validateCreateDraft() {
    const errors = validateCommercialProspectDraft(createDraft)
    setCreateErrors(errors)
    return errors
  }

  function buildCreatePayloadFromDraft() {
    const role = normalizeKey(createDraft.prospectRole)
    const dealType = getDealTypeFromRole(role)
    const propertyCategory = normalizeKey(createDraft.propertyCategory) || 'other'
    const companyName = normalizeText(createDraft.companyName)
    const contactName = normalizeText(createDraft.contactName)
    const followUpValue = normalizeText(createDraft.followUpNote || createDraft.notes)
    const estimatedValue = role === 'landlord'
      ? Number(createDraft.estimatedAnnualRental || createDraft.estimatedMonthlyRental || 0) || 0
      : Number(createDraft.estimatedSaleValue || 0) || 0
    const areaValue = role === 'seller'
      ? normalizeText(createDraft.propertyAddress)
      : role === 'buyer'
        ? normalizeText(createDraft.preferredArea)
        : role === 'landlord'
          ? normalizeText(createDraft.propertyName || createDraft.portfolioName)
          : normalizeText(createDraft.preferredArea)

    return {
      companyName,
      contactName,
      phone: normalizeText(createDraft.phone),
      email: normalizeText(createDraft.email),
      prospectType: `${getRoleLabel(role)} Prospect`,
      canvassingMethod: normalizeText(createDraft.canvassingMethod) || 'Cold Call',
      propertyType: getPropertyCategoryLabel(propertyCategory),
      area: areaValue,
      status: normalizeText(createDraft.status) || 'New',
      nextFollowUpDate: normalizeText(createDraft.nextFollowUpDate),
      followUpPriority: normalizeText(createDraft.followUpPriority) || 'Medium',
      followUpNote: followUpValue,
      estimatedValue,
      notes: normalizeText(createDraft.notes || createDraft.vacancyDetails),
      assignedBrokerId: normalizeText(createDraft.assignedBrokerId),
      companyId: normalizeText(createDraft.companyId),
      contactId: normalizeText(createDraft.contactId),
      propertyId: normalizeText(createDraft.propertyId),
      vacancyId: normalizeText(createDraft.vacancyId),
      listingId: normalizeText(createDraft.listingId),
      linkedEntityType: normalizeText(createDraft.linkedEntityType),
      linkedEntityId: normalizeText(createDraft.linkedEntityId),
      dealType,
      prospectRole: role,
      propertyCategory,
      roleSpecific: {
        propertyAddress: normalizeText(createDraft.propertyAddress),
        propertyName: normalizeText(createDraft.propertyName),
        portfolioName: normalizeText(createDraft.portfolioName),
        lookingFor: normalizeText(createDraft.lookingFor),
        preferredArea: normalizeText(createDraft.preferredArea),
        spaceRequirement: normalizeText(createDraft.spaceRequirement),
        sizeRange: normalizeText(createDraft.sizeRange),
        budgetRange: normalizeText(createDraft.budgetRange),
        reasonForSelling: normalizeText(createDraft.reasonForSelling),
        targetPurchaseTimeline: normalizeText(createDraft.targetPurchaseTimeline),
        leaseTimeline: normalizeText(createDraft.leaseTimeline),
        vacancyDetails: normalizeText(createDraft.vacancyDetails),
        estimatedSaleValue: normalizeText(createDraft.estimatedSaleValue),
        estimatedMonthlyRental: normalizeText(createDraft.estimatedMonthlyRental),
        estimatedAnnualRental: normalizeText(createDraft.estimatedAnnualRental),
      },
    }
  }

  async function handleCreateProspect(event) {
    event.preventDefault()
    if (!organisationId) return
    const errors = validateCreateDraft()
    if (Object.keys(errors).length > 0) {
      setCreateStep(2)
      setError('Please complete the missing commercial prospect details.')
      return
    }

    setBusyAction('create')
    setError('')
    try {
      const payload = buildCreatePayloadFromDraft()
      const created = await createCommercialCanvassingProspect(organisationId, payload)
      setProspects((current) => [created, ...current.filter((row) => normalizeText(row.id) !== normalizeText(created.id))])
      setSelectedProspectId(created.id)
      setCreateOpen(false)
      setCreateStep(2)
      setCreateErrors({})
      setMessage(`${getRoleLabel(payload.prospectRole)} prospect added.`)
      await loadData()
    } catch (createError) {
      setError(createError?.message || 'Commercial canvassing prospect could not be created.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleSaveProspect() {
    if (!organisationId || !selectedProspect) return
    setBusyAction('save')
    setError('')
    try {
      const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
        ...selectedProspect,
        companyName: normalizeText(selectedProspect.companyName),
        contactName: normalizeText(selectedProspect.contactName),
        firstName: normalizeText(selectedProspect.firstName),
        lastName: normalizeText(selectedProspect.lastName),
        phone: normalizeText(selectedProspect.phone),
        email: normalizeText(selectedProspect.email),
        prospectType: normalizeText(selectedProspect.prospectType) || 'Other',
        canvassingMethod: normalizeText(selectedProspect.canvassingMethod) || 'Cold Call',
        propertyType: normalizeText(selectedProspect.propertyType),
        area: normalizeText(selectedProspect.area),
        status: normalizeText(selectedProspect.status) || 'New',
        nextFollowUpDate: normalizeText(selectedProspect.nextFollowUpDate),
        followUpPriority: normalizeText(selectedProspect.followUpPriority) || 'Medium',
        followUpNote: normalizeText(selectedProspect.followUpNote),
        estimatedValue: Number(selectedProspect.estimatedValue || 0) || 0,
        notes: normalizeText(selectedProspect.notes),
        assignedBrokerId: normalizeText(selectedProspect.assignedBrokerId),
        assignedBrokerName: normalizeText(selectedProspect.assignedBrokerName),
        assignedBrokerEmail: normalizeText(selectedProspect.assignedBrokerEmail),
        companyId: normalizeText(selectedProspect.companyId),
        contactId: normalizeText(selectedProspect.contactId),
        propertyId: normalizeText(selectedProspect.propertyId),
        vacancyId: normalizeText(selectedProspect.vacancyId),
        listingId: normalizeText(selectedProspect.listingId),
        linkedEntityType: normalizeText(selectedProspect.linkedEntityType),
        linkedEntityId: normalizeText(selectedProspect.linkedEntityId),
      })
      setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || selectedProspect) : row))
      setMessage('Prospect saved.')
      await loadData()
    } catch (saveError) {
      setError(saveError?.message || 'Commercial canvassing prospect could not be saved.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleLogActivity(type = 'Note') {
    if (!organisationId || !selectedProspect) return
    if (!normalizeText(activityDraft.activityNote) && type === 'Note') {
      setError('Add a note before logging this activity.')
      return
    }
    setBusyAction(`activity-${type}`)
    setError('')
    try {
      const created = await createCommercialCanvassingActivity(organisationId, {
        prospectId: selectedProspect.id,
        brokerId: selectedProspect.assignedBrokerId || createDraft.assignedBrokerId || brokerOptions[0]?.value || '',
        brokerName: selectedProspect.assignedBrokerName || pickLookupLabel(brokerOptions, selectedProspect.assignedBrokerId, '') || '',
        activityType: type,
        activityNote: normalizeText(activityDraft.activityNote) || `${type} logged from canvassing workspace`,
        outcome: normalizeText(activityDraft.outcome),
        activityDate: new Date().toISOString(),
      })
      setActivities((current) => [created, ...current])
      setActivityDraft(buildInitialActivityDraft())
      setMessage(`${type} logged.`)
      await loadData()
    } catch (activityError) {
      setError(activityError?.message || 'Activity could not be logged.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleConvert(type) {
    if (!organisationId || !selectedProspect) return
    setBusyAction(`convert-${type}`)
    setError('')
    try {
      const brokerId = normalizeText(selectedProspect.assignedBrokerId || createDraft.assignedBrokerId || brokerOptions[0]?.value || '')
      const companyId = normalizeText(selectedProspect.companyId)
      const contactId = normalizeText(selectedProspect.contactId)
      let resolvedCompanyId = companyId
      let resolvedContactId = contactId

      if (type === 'contact') {
        if (!resolvedCompanyId) {
          const company = await createCommercialCompany({
            organisation_id: organisationId,
            company_name: normalizeText(selectedProspect.companyName) || normalizeText(selectedProspect.contactName) || 'Canvassed company',
            broker_id: brokerId || selectedProspect.assignedBrokerId || brokerOptions[0]?.value || '',
            status: 'prospect',
            notes: normalizeText(selectedProspect.notes) || 'Created from canvassing prospect',
          })
          resolvedCompanyId = company.id
        }
        if (!resolvedCompanyId) {
          throw new Error('A company is required before creating a contact from this canvassing prospect.')
        }
        const contactName = splitContactName(selectedProspect.contactName || selectedProspect.companyName || 'Prospect Contact')
        const contact = await createCommercialContact({
          organisation_id: organisationId,
          company_id: resolvedCompanyId,
          broker_id: brokerId,
          first_name: contactName.firstName || normalizeText(selectedProspect.firstName) || 'Commercial',
          last_name: contactName.lastName || normalizeText(selectedProspect.lastName) || 'Prospect',
          email: normalizeText(selectedProspect.email) || null,
          phone: normalizeText(selectedProspect.phone) || null,
          status: 'active',
          notes: normalizeText(selectedProspect.notes) || 'Created from commercial canvassing',
        })
        resolvedContactId = contact.id
      }

      if (type === 'requirement') {
        const createdRequirement = await createCommercialRequirement({
          organisation_id: organisationId,
          company_id: resolvedCompanyId || null,
          contact_id: resolvedContactId || null,
          requirement_name: `${getProspectDisplayName(selectedProspect)} Requirement`,
          requirement_type: inferRequirementType(selectedProspect),
          client_type: inferClientType(selectedProspect),
          property_type: normalizeText(selectedProspect.propertyType) || null,
          preferred_locations: normalizeText(selectedProspect.area) ? [normalizeText(selectedProspect.area)] : [],
          budget_min: 0,
          budget_max: Number(selectedProspect.estimatedValue || 0) || null,
          target_occupation_date: normalizeText(selectedProspect.nextFollowUpDate) || null,
          assigned_broker: brokerId,
          broker_id: brokerId,
          stage: 'new_requirement',
          status: 'active',
          notes: normalizeText(selectedProspect.notes) || null,
          special_requirements: normalizeText(selectedProspect.followUpNote) || null,
        })
        const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
          ...selectedProspect,
          status: 'Converted to Requirement',
          linkedEntityType: 'commercial_requirement',
          linkedEntityId: createdRequirement.id,
          companyId: resolvedCompanyId || selectedProspect.companyId,
          contactId: resolvedContactId || selectedProspect.contactId,
          convertedRequirementId: createdRequirement.id,
        })
        setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || selectedProspect) : row))
        setMessage('Prospect converted to a requirement.')
      } else if (type === 'deal') {
        const createdDeal = await createCommercialDeal({
          organisation_id: organisationId,
          company_id: resolvedCompanyId || null,
          contact_id: resolvedContactId || null,
          deal_name: `${getProspectDisplayName(selectedProspect)} Deal`,
          deal_type: inferDealType(selectedProspect),
          requirement_id: normalizeText(selectedProspect.requirementId) || null,
          property_id: normalizeText(selectedProspect.propertyId) || null,
          vacancy_id: normalizeText(selectedProspect.vacancyId) || null,
          listing_id: normalizeText(selectedProspect.listingId) || null,
          assigned_broker: brokerId,
          broker_id: brokerId,
          stage: 'new',
          status: 'active',
          deal_value: Number(selectedProspect.estimatedValue || 0) || null,
          expected_close_date: normalizeText(selectedProspect.nextFollowUpDate) || null,
          notes: normalizeText(selectedProspect.notes) || null,
        })
        const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
          ...selectedProspect,
          status: 'Converted to Deal',
          linkedEntityType: 'commercial_deal',
          linkedEntityId: createdDeal.id,
          companyId: resolvedCompanyId || selectedProspect.companyId,
          contactId: resolvedContactId || selectedProspect.contactId,
          convertedDealId: createdDeal.id,
        })
        setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || selectedProspect) : row))
        setMessage('Prospect converted to a deal.')
      } else if (type === 'contact') {
        const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
          ...selectedProspect,
          status: 'Converted to Contact',
          linkedEntityType: 'commercial_contact',
          linkedEntityId: resolvedContactId,
          companyId: resolvedCompanyId || selectedProspect.companyId,
          contactId: resolvedContactId,
          convertedContactId: resolvedContactId,
          convertedCompanyId: resolvedCompanyId,
        })
        setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || selectedProspect) : row))
        setMessage('Contact created from canvassing prospect.')
      }

      await createCommercialCanvassingActivity(organisationId, {
        prospectId: selectedProspect.id,
        brokerId,
        brokerName: selectedProspect.assignedBrokerName || pickLookupLabel(brokerOptions, brokerId, ''),
        activityType: 'Note',
        activityNote: `Converted to ${type}`,
        outcome: type,
        activityDate: new Date().toISOString(),
      })
      await loadData()
    } catch (convertError) {
      setError(convertError?.message || 'This canvassing prospect could not be converted.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleArchiveProspect() {
    if (!organisationId || !selectedProspect) return
    setBusyAction('archive')
    setError('')
    try {
      const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
        ...selectedProspect,
        status: 'Archived',
        archivedAt: new Date().toISOString(),
      })
      setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || { ...selectedProspect, status: 'Archived' }) : row))
      setArchiveOpen(false)
      setMessage('Prospect archived.')
      await createCommercialCanvassingActivity(organisationId, {
        prospectId: selectedProspect.id,
        brokerId: selectedProspect.assignedBrokerId || '',
        brokerName: selectedProspect.assignedBrokerName || '',
        activityType: 'Follow-Up',
        activityNote: 'Prospect archived from commercial canvassing workspace',
        outcome: 'Archived',
        activityDate: new Date().toISOString(),
      })
      await loadData()
    } catch (archiveError) {
      setError(archiveError?.message || 'Prospect could not be archived.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleDeleteProspect() {
    if (!organisationId || !selectedProspect) return
    setBusyAction('delete')
    setError('')
    try {
      await deleteCommercialCanvassingProspect(organisationId, selectedProspect.id)
      setProspects((current) => current.filter((row) => normalizeText(row.id) !== normalizeText(selectedProspect.id)))
      setActivities((current) => current.filter((row) => normalizeText(row.prospectId) !== normalizeText(selectedProspect.id)))
      setSelectedProspectId('')
      setDeleteOpen(false)
      setMessage('Prospect deleted.')
      await loadData()
    } catch (deleteError) {
      setError(deleteError?.message || 'Prospect could not be deleted.')
    } finally {
      setBusyAction('')
    }
  }

  function handleCreateReviewNext() {
    const errors = validateCreateDraft()
    if (Object.keys(errors).length > 0) {
      setCreateStep(2)
      setError('Please complete the missing commercial prospect details.')
      return
    }
    setError('')
    setCreateStep(3)
  }

  const createRole = normalizeKey(createDraft.prospectRole) || pageView.defaultCreateRole
  const createRoleOption = pageView.roleOptions.find((option) => option.value === createRole) || pageView.roleOptions[0] || COMMERCIAL_ROLE_OPTIONS[0]
  const createDealLabel = getDealTypeLabel(getDealTypeFromRole(createRole))
  const createCategoryLabel = getPropertyCategoryLabel(createDraft.propertyCategory)
  const createSummaryLines = [
    createDraft.companyName || createDraft.contactName || 'No company captured',
    createDraft.propertyAddress || createDraft.propertyName || createDraft.portfolioName || createDraft.preferredArea || 'No property captured',
    createDraft.nextFollowUpDate ? formatShortDate(createDraft.nextFollowUpDate) : 'No follow-up date',
  ]

  const createModal = (
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={pageView.showDepartmentTabs ? `New ${pageView.key === 'lease' ? 'lease' : 'sales'} prospect` : 'New prospect'}
        subtitle={pageView.showDepartmentTabs ? `Capture the company, contact, or asset you want to work with through ${pageView.title.toLowerCase()}.` : 'Capture the company, contact, or asset you want to work with through the commercial pipeline.'}
        className="max-w-[1120px]"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#7b899a]">
            {createStep === 3 ? 'Review and save this prospect.' : 'Shared fields are preserved when you change type.'}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (createStep === 3) {
                  setCreateStep(2)
                  return
                }
                setCreateOpen(false)
              }}
            >
              {createStep === 3 ? <ChevronLeft size={16} /> : null}
              {createStep === 3 ? 'Back' : 'Cancel'}
            </Button>
            {createStep === 3 ? (
              <Button type="submit" form="commercial-canvassing-create-form" disabled={busyAction === 'create'}>
                <Save size={16} />
                {busyAction === 'create' ? 'Saving...' : 'Save Prospect'}
              </Button>
            ) : (
              <Button type="button" onClick={handleCreateReviewNext}>
                Next: Review & Save
                <ChevronRight size={16} />
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <form id="commercial-canvassing-create-form" onSubmit={handleCreateProspect} className="overflow-hidden">
        <div className="grid max-h-[calc(100vh-220px)] gap-0 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="border-b border-[#e6edf4] bg-[#fbfdff] p-5 lg:border-b-0 lg:border-r">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#8a96a8]">Step 1 of 3</p>
            <h4 className="mt-2 text-[1.1rem] font-semibold tracking-[-0.02em] text-[#102236]">What type of prospect is this?</h4>
            <p className="mt-2 text-sm leading-6 text-[#63768b]">Choose the best fit so we can show the right commercial fields.</p>

            <div className="mt-5 grid gap-3">
              {pageView.roleOptions.map((option) => {
                const selected = createRole === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateCreateRole(option.value)}
                    className={`rounded-[18px] border p-4 text-left transition ${
                      selected
                        ? 'border-[#2c6cf0] bg-[#eff5ff] shadow-[0_0_0_1px_rgba(44,108,240,0.08)]'
                        : 'border-[#e1e9f3] bg-white hover:border-[#bfd2ea] hover:bg-[#fbfdff]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#102236]">{option.label} ({getDealTypeLabel(option.dealType)})</p>
                        <p className="mt-1 text-sm leading-6 text-[#63768b]">{option.description}</p>
                      </div>
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${selected ? 'border-[#2c6cf0] bg-[#2c6cf0] text-white' : 'border-[#c9d7e8] bg-white text-transparent'}`}>
                        <CheckCircle2 size={12} />
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            <p className="mt-4 text-xs leading-5 text-[#71859b]">
              {createRoleOption.description}
            </p>

            <div className="mt-5 rounded-[16px] border border-dashed border-[#d8e3f0] bg-white px-4 py-3 text-xs leading-5 text-[#71859b]">
              Switching type keeps shared fields and clears role-specific details that do not apply.
            </div>

            <button
              type="button"
              onClick={() => setCreateStep(2)}
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]"
            >
              Change type
              <ArrowRight size={14} />
            </button>
          </aside>

          <div className="overflow-y-auto bg-white">
            {createStep === 3 ? (
              <section className="p-5 sm:p-6">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#8a96a8]">Step 3 of 3</p>
                <h4 className="mt-2 text-[1.1rem] font-semibold tracking-[-0.02em] text-[#102236]">Review prospect</h4>
                <p className="mt-2 text-sm leading-6 text-[#63768b]">Confirm the details before adding this prospect to commercial canvassing.</p>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <ReviewCard title="Prospect type" lines={[`${getRoleLabel(createRole)} (${createDealLabel})`, createCategoryLabel]} />
                  <ReviewCard title="Company / Contact" lines={[createDraft.companyName || 'No company captured', createDraft.contactName || 'No contact captured', createDraft.phone || 'No phone captured', createDraft.email || 'No email captured']} />
                  <ReviewCard title="Commercial details" lines={[
                    createDraft.propertyAddress || createDraft.propertyName || createDraft.portfolioName || createDraft.preferredArea || 'No property context captured',
                    createDraft.lookingFor || createDraft.spaceRequirement || createDraft.reasonForSelling || createDraft.vacancyDetails || 'No detail captured',
                    createDraft.propertyCategory ? `Category: ${createCategoryLabel}` : 'No category selected',
                  ]} />
                  <ReviewCard title="Follow-up" lines={[
                    createDraft.nextFollowUpDate ? `Due ${formatShortDate(createDraft.nextFollowUpDate)}` : 'No follow-up date',
                    `Priority: ${normalizeText(createDraft.followUpPriority) || 'Medium'}`,
                    `Source: ${normalizeText(createDraft.canvassingMethod) || 'Cold Call'}`,
                  ]} />
                  <ReviewCard title="Assignment" lines={[
                    pickLookupLabel(brokerOptions, createDraft.assignedBrokerId, 'Unassigned'),
                    createDraft.assignedBrokerId ? 'Assigned broker captured' : 'No broker assigned',
                  ]} />
                  <ReviewCard title="Notes" lines={[normalizeText(createDraft.notes) || normalizeText(createDraft.followUpNote) || 'No notes captured']} />
                </div>

                <div className="mt-6 rounded-[18px] border border-[#dfe8f3] bg-[#f8fbff] p-4 text-sm text-[#63768b]">
                  {createSummaryLines.map((line) => line).join(' · ')}
                </div>
              </section>
            ) : (
              <section className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#8a96a8]">Step 2 of 3</p>
                    <h4 className="mt-2 text-[1.1rem] font-semibold tracking-[-0.02em] text-[#102236]">
                      {createRole === 'seller' ? 'About the seller' : createRole === 'buyer' ? 'About the buyer' : createRole === 'landlord' ? 'About the landlord' : 'About the tenant'}
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-[#63768b]">
                      {createRole === 'seller' ? 'Capture key details about the property owner.' : createRole === 'buyer' ? 'Capture what the buyer is looking for.' : createRole === 'landlord' ? 'Capture the landlord, asset manager and vacancy opportunity.' : 'Capture the tenant space requirement.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreateStep(1)}
                    className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#dce6f0] bg-white px-3 text-sm font-medium text-[#0f2748] transition hover:border-[#bfd2e6] hover:text-[#0e335f]"
                  >
                    <ChevronLeft size={15} />
                    Change type
                  </button>
                </div>

                <div className="mt-5 grid gap-4">
                  {createRole === 'seller' ? renderSellerFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) : null}
                  {createRole === 'buyer' ? renderBuyerFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) : null}
                  {createRole === 'landlord' ? renderLandlordFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) : null}
                  {createRole === 'tenant' ? renderTenantFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) : null}
                </div>
              </section>
            )}
          </div>
        </div>
      </form>
    </Modal>
  )

  const advancedFilterCount = [categoryFilter, statusFilter, brokerFilter, methodFilter, search, roleFilter, activeTab].filter((value) => normalizeText(value) && value !== 'all').length
  const shouldShowAdvancedFilters = showAdvancedFilters || advancedFilterCount > 0
  const hasAnyProspects = pageScopedProspects.length > 0
  const tableTotalCount = sortedProspects.length
  const tableStart = tableTotalCount ? 1 : 0
  const tableEnd = tableTotalCount
  const currentSortLabel = SORT_OPTIONS.find((option) => option.value === `${sortKey}:${sortDirection}`)?.label || 'Newest Updated'
  const emptyStateConfig = (() => {
    if (activeTab === 'followups') {
      return {
        icon: Clock3,
        title: 'No follow-ups due.',
        description: 'Lease prospect follow-ups will appear here when a next action date is scheduled.',
        actionLabel: 'View All Lease Prospects',
        onAction: () => {
          setActiveTab('all')
          setSearch('')
          setCategoryFilter('all')
          setStatusFilter('all')
          setMethodFilter('all')
          setBrokerFilter('all')
          setRoleFilter('all')
        },
      }
    }
    if (hasAnyProspects) {
      return {
        icon: SlidersHorizontal,
        title: 'No prospects match these filters.',
        description: 'Try widening the category, broker, status, source, or search filters to bring more lease prospects back into view.',
        actionLabel: 'Clear Filters',
        onAction: () => {
          setSearch('')
          setCategoryFilter('all')
          setStatusFilter('all')
          setMethodFilter('all')
          setBrokerFilter('all')
          setShowAdvancedFilters(false)
          if (pageView.showDepartmentTabs) setActiveTab('all')
        },
      }
    }
    return {
      icon: ClipboardList,
      title: 'No active lease prospects yet.',
      description: 'Lease prospects will appear here once landlord and tenant prospecting begins moving through the platform.',
      actionLabel: pageView.createLabel.replace(/^\+\s*/, ''),
      onAction: () => openCreateModal(pageView.defaultCreateRole),
    }
  })()

  const getProspectInitials = (prospect = {}) => {
    return getProspectDisplayName(prospect)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'P'
  }

  const getAreaLine = (prospect = {}) => {
    return normalizeText(prospect.area || prospect.propertyAddress || prospect.preferredArea) || 'Area pending'
  }

  const getAssetLine = (prospect = {}) => {
    return normalizeText(prospect.propertyName || prospect.portfolioName || prospect.vacancyName || prospect.lookingFor || prospect.spaceRequirement) || 'Asset pending'
  }

  return (
    <div className="pb-10">
      {!loading && !canvassingEnabled ? (
        <CommercialEmptyState
          title="Commercial canvassing is not enabled yet"
          description="This workspace is live, but canvassing is still being rolled out. Enable the feature in Commercial workspace setup to expose prospecting, follow-up, and conversion actions."
        />
      ) : null}

      {!canvassingEnabled ? null : (
        <>
          {error ? <div className="rounded-[18px] border border-[#f6d4d4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f1d1d]">{error}</div> : null}
          {message ? <div className="rounded-[18px] border border-[#d4e8dc] bg-[#eef9f1] px-4 py-3 text-sm text-[#1a6e3a]">{message}</div> : null}

          <article className={`${CARD_CLASS} overflow-hidden p-5 sm:p-6`}>
            <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h1 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#102236]">{pageView.title}</h1>
                <p className="mt-2 text-sm leading-6 text-[#4f6680]">{pageView.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => openCreateModal(pageView.defaultCreateRole)} className="h-12 rounded-[14px] bg-[#102b46] px-5 shadow-[0_12px_28px_rgba(16,43,70,0.18)] hover:bg-[#143858]">
                  <Plus size={16} />
                  {pageView.createLabel.replace(/^\+\s*/, '')}
                </Button>
                <Button type="button" variant="secondary" className="h-12 rounded-[14px] px-5" disabled title="Import is coming soon">
                  <Download size={16} />
                  Import
                </Button>
                <button
                  type="button"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#dce6f0] bg-white text-[#62758b] shadow-sm transition hover:border-[#bfd2e6] hover:bg-[#f8fbff] hover:text-[#0f2748]"
                  aria-label="More page actions"
                >
                  <MoreHorizontal size={17} />
                </button>
              </div>
            </section>

            <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <ProspectStat label="Total Prospects" value={loading ? '...' : metrics.prospects} detail="vs last 30 days" icon={Users} trendLabel="12%" series={kpiSeries.total} color="#2d6ecf" />
              <ProspectStat label="Landlords" value={loading ? '...' : leaseRoleCounts.landlords} detail="vs last 30 days" icon={Building2} trendLabel="8%" series={kpiSeries.landlords} color="#16a34a" />
              <ProspectStat label="Tenants" value={loading ? '...' : leaseRoleCounts.tenants} detail="vs last 30 days" icon={Users} trendLabel="18%" series={kpiSeries.tenants} color="#8b5cf6" />
              <ProspectStat label="Follow Ups Due" value={loading ? '...' : metrics.followUpsDue} detail="vs last 30 days" icon={CalendarDays} trendLabel="6%" series={kpiSeries.followUps} color="#f59e0b" />
              <ProspectStat label="Converted" value={loading ? '...' : metrics.converted} detail="vs last 30 days" icon={CheckCircle2} trendLabel="15%" series={kpiSeries.converted} color="#0f766e" />
            </section>

            {pageView.showDepartmentTabs ? (
              <div className="mt-7 border-b border-[#e8eef5]">
                <div className="flex gap-9 overflow-x-auto">
                  {pageView.tabs.map((tab) => (
                    <RegisterTab key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                      <span>{tab.label}</span>
                      {tabCounts[tab.id] ? (
                        <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${activeTab === tab.id ? 'bg-[#e7efff] text-[#1952c6]' : 'bg-[#f1f5f9] text-[#60758d]'}`}>
                          {tabCounts[tab.id]}
                        </span>
                      ) : null}
                    </RegisterTab>
                  ))}
                </div>
              </div>
            ) : null}

            <section className="rounded-b-[18px] border border-t-0 border-[#dce6f0] bg-white">
              <div className="border-b border-[#e8eef5] px-4 py-4">
                <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                  <SearchField value={search} onChange={setSearch} placeholder={pageView.searchPlaceholder} className="w-full 2xl:max-w-[34%] 2xl:flex-1" />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:flex 2xl:flex-wrap 2xl:items-center">
                    <FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={COMMERCIAL_CATEGORY_OPTIONS} placeholder="Category" className="!w-full 2xl:!w-[148px]" />
                    <FilterSelect value={brokerFilter} onChange={setBrokerFilter} options={brokerOptions} placeholder="Broker" className="!w-full 2xl:!w-[138px]" />
                    <FilterSelect value={statusFilter} onChange={setStatusFilter} options={PROSPECT_STATUSES.map((value) => ({ value, label: value }))} placeholder="Status" className="!w-full 2xl:!w-[138px]" />
                    <FilterSelect value={methodFilter} onChange={setMethodFilter} options={CANVASSING_METHODS.map((value) => ({ value, label: value }))} placeholder="Source" className="!w-full 2xl:!w-[138px]" />
                    <label className="relative block">
                      <ArrowUpDown size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#1f6dd5]" />
                      <Field
                        as="select"
                        value={`${sortKey}:${sortDirection}`}
                        onChange={(event) => {
                          const [nextKey, nextDirection] = String(event.target.value || '').split(':')
                          if (!nextKey) return
                          setSortDirection(nextDirection || 'desc')
                          setSortKey(nextKey)
                        }}
                        aria-label={`Sort: ${currentSortLabel}`}
                        className="h-11 !w-full rounded-[14px] bg-white pl-9 text-sm 2xl:!w-[198px]"
                      >
                        {SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>Sort: {option.label}</option>
                        ))}
                      </Field>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedFilters((current) => !current)}
                      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border px-4 text-sm font-semibold transition ${
                        shouldShowAdvancedFilters
                          ? 'border-[#d7e3f4] bg-[#f5f8fc] text-[#0f2748]'
                          : 'border-[#e2eaf3] bg-white text-[#0f2748] hover:border-[#d0dceb] hover:bg-[#f8fbff]'
                      }`}
                    >
                      <SlidersHorizontal size={15} />
                      Filters
                      {advancedFilterCount ? (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#e7efff] px-1.5 text-[11px] font-semibold text-[#1952c6]">
                          {advancedFilterCount}
                        </span>
                      ) : null}
                    </button>
                  </div>
                </div>

                {shouldShowAdvancedFilters ? (
                  <div className="mt-3 flex flex-col gap-3 rounded-[16px] border border-[#e6edf4] bg-[#fbfdff] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-[#60758d]">{advancedFilterCount || 0} active filter{advancedFilterCount === 1 ? '' : 's'}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('')
                          setRoleFilter('all')
                          setCategoryFilter('all')
                          setStatusFilter('all')
                          setMethodFilter('all')
                          setBrokerFilter('all')
                          setActiveTab('all')
                          setShowAdvancedFilters(false)
                          if (!pageView.showDepartmentTabs) setDealFilter('all')
                        }}
                        className="text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]"
                      >
                        Clear filters
                      </button>
                    </div>
                    {pageView.key === 'lease' ? (
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)]">
                        <FilterSelect value={roleFilter} onChange={setRoleFilter} options={pageView.roleOptions} placeholder="Type" className="!w-full" />
                        <FilterSelect value={activeTab} onChange={setActiveTab} options={LEASE_QUEUE_OPTIONS} placeholder="View" className="!w-full" />
                      </div>
                    ) : null}
                    {pageView.showRoleFilters ? (
                      <div className="flex flex-wrap gap-2">
                        {roleFilterOptions.map((item) => (
                          <FilterChip key={item.value} active={roleFilter === item.value} onClick={() => setRoleFilter(item.value)}>
                            {item.label}
                          </FilterChip>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="overflow-hidden">
                <div className="hidden md:block">
                  <div className="max-h-[560px] overflow-auto">
                    <table className="min-w-[1260px] w-full border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 bg-[#f7fafc] text-left text-[12px] font-semibold uppercase tracking-[0.12em] text-[#61758b]">
                      <tr>
                        {['Prospect', 'Type', 'Category', 'Source', 'Area / Asset', 'Stage / Next Step', 'Broker', 'Last Activity', 'Actions'].map((label) => (
                          <th key={label} className="border-b border-[#e7edf4] px-5 py-3">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? Array.from({ length: 6 }).map((_, index) => (
                        <tr key={`loading-${index}`}>
                          <td colSpan={9} className="border-b border-[#eef3f7] px-5 py-4">
                            <div className="h-16 animate-pulse rounded-[16px] bg-slate-100" />
                          </td>
                        </tr>
                      )) : sortedProspects.length ? sortedProspects.map((prospect) => {
                        const brokerLabel = prospect.assignedBrokerDisplay || pickLookupLabel(brokerOptions, prospect.assignedBrokerId, prospect.assignedBrokerName || 'Unassigned')
                        const roleTone = getProspectBadgeVariant(prospect.prospectRole)
                        const categoryTone = getCategoryBadgeVariant(prospect.propertyCategory)
                        const showMenu = openActionMenuId === prospect.id
                        const lastActivity = prospect.lastActivity || null
                        return (
                          <tr
                            key={prospect.id}
                            className="cursor-pointer border-b border-[#eef3f7] transition hover:bg-[#fbfdff]"
                            onClick={() => {
                              setSelectedProspectId(prospect.id)
                              setDrawerOpen(true)
                              setOpenActionMenuId('')
                            }}
                          >
                            <td className="border-b border-[#eef3f7] px-5 py-4 align-top">
                              <div className="flex items-start gap-3">
                                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef5fb] text-sm font-semibold text-[#2d6ecf]">
                                  {getProspectInitials(prospect)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#102236]">{getProspectDisplayName(prospect)}</p>
                                  <p className="mt-1 truncate text-xs text-[#6d839b]">{normalizeText(prospect.contactName) || prospect.secondaryLine || 'No contact captured'}</p>
                                  <p className="mt-1 truncate text-xs text-[#6d839b]">{normalizeText(prospect.phone) || 'No phone captured'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <div className="space-y-2">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(roleTone)}`}>{prospect.roleLabel}</span>
                                <p className="text-xs text-[#63768b]">{prospect.dealTypeLabel}</p>
                              </div>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(categoryTone)}`}>{prospect.categoryLabel}</span>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <span className="inline-flex rounded-full border border-[#e0e8f2] bg-[#f8fbff] px-2.5 py-1 text-xs font-semibold text-[#38506a]">
                                {titleize(prospect.sourceLabel)}
                              </span>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-[#102236]">{getAssetLine(prospect)}</p>
                                <div className="inline-flex items-center gap-1.5 text-xs text-[#63768b]">
                                  <MapPin size={12} className="text-[#9cb0c4]" />
                                  <span>{getAreaLine(prospect)}</span>
                                </div>
                              </div>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <div className="space-y-2">
                                <ProspectTonePill value={prospect.stageLabel} />
                                <p className="line-clamp-1 text-sm font-medium text-[#4f6176]">{prospect.nextStepLabel}</p>
                                <p className="text-xs text-[#8a96a8]">{prospect.nextFollowUpDate ? formatShortDate(prospect.nextFollowUpDate) : 'No follow-up date'}</p>
                              </div>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <div className="inline-flex items-center gap-2">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e7edf6] text-xs font-semibold text-[#2b4f71]">
                                  {brokerLabel === 'Unassigned' ? 'U' : brokerLabel.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')}
                                </span>
                                <span className="text-sm font-semibold text-[#102236]">{brokerLabel}</span>
                              </div>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <p className="text-sm font-medium text-[#4f6176]">{formatRelativeTime(lastActivity?.activityDate || lastActivity?.createdAt)}</p>
                              <p className="mt-1 line-clamp-1 text-xs text-[#8a96a8]">{lastActivity?.activityNote || lastActivity?.outcome || lastActivity?.activityType || 'No activity yet'}</p>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <div className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
                                <button
                                  type="button"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dce6f0] bg-white text-[#62758b] transition hover:border-[#bfd2e6] hover:bg-[#f8fbff]"
                                  aria-label={`Open actions for ${getProspectDisplayName(prospect)}`}
                                  onClick={() => setOpenActionMenuId((current) => (current === prospect.id ? '' : prospect.id))}
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                                {showMenu ? (
                                  <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-[14px] border border-[#dce6f0] bg-white py-1 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setDrawerOpen(true); setOpenActionMenuId('') }}>Open details</button>
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setDrawerOpen(true); setMessage('Edit the prospect in the detail drawer.'); setOpenActionMenuId('') }}>Edit</button>
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setDrawerOpen(true); setMessage('Use the detail drawer to log a call or add notes.'); setOpenActionMenuId('') }}>Log activity</button>
                                    <div className="my-1 border-t border-[#eef3f7]" />
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#a13b35] transition hover:bg-[#fff5f5]" onClick={() => { setSelectedProspectId(prospect.id); setArchiveOpen(true); setOpenActionMenuId('') }}>Archive</button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )
                      }) : (
                        <tr>
                          <td colSpan={9} className="px-0 py-0">
                            <InlineTableEmptyState
                              icon={emptyStateConfig.icon}
                              title={emptyStateConfig.title}
                              description={emptyStateConfig.description}
                              actionLabel={emptyStateConfig.actionLabel}
                              onAction={emptyStateConfig.onAction}
                            />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>

                <div className="divide-y divide-[#eef3f7] md:hidden">
                {loading ? Array.from({ length: 3 }).map((_, index) => (
                  <div key={`mobile-loading-${index}`} className="px-4 py-4">
                    <div className="h-24 animate-pulse rounded-[18px] bg-slate-100" />
                  </div>
                )) : sortedProspects.length ? sortedProspects.map((prospect) => {
                  const lastActivity = prospect.lastActivity || null
                  const brokerLabel = prospect.assignedBrokerDisplay || pickLookupLabel(brokerOptions, prospect.assignedBrokerId, prospect.assignedBrokerName || 'Unassigned')
                  return (
                    <div
                      key={prospect.id}
                      className="cursor-pointer px-4 py-4 transition hover:bg-[#fbfdff]"
                      onClick={() => {
                        setSelectedProspectId(prospect.id)
                        setDrawerOpen(true)
                        setOpenActionMenuId('')
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-start gap-3">
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef5fb] text-sm font-semibold text-[#2d6ecf]">
                              {getProspectInitials(prospect)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#102236]">{getProspectDisplayName(prospect)}</p>
                              <p className="mt-1 text-xs text-[#6d839b]">{normalizeText(prospect.contactName) || prospect.secondaryLine || 'No contact captured'}</p>
                              <p className="mt-1 text-xs text-[#6d839b]">{normalizeText(prospect.phone) || 'No phone captured'}</p>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dce6f0] bg-white text-[#62758b]"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedProspectId(prospect.id)
                            setDrawerOpen(true)
                          }}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-[#63768b]">
                        <div className="flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${toneClass(getProspectBadgeVariant(prospect.prospectRole))}`}>{prospect.roleLabel}</span>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${toneClass(getCategoryBadgeVariant(prospect.propertyCategory))}`}>{prospect.categoryLabel}</span>
                          <span className="inline-flex rounded-full border border-[#e0e8f2] bg-[#f8fbff] px-2.5 py-1 font-semibold text-[#38506a]">{titleize(prospect.sourceLabel)}</span>
                        </div>
                        <p>{getAssetLine(prospect)} · {getAreaLine(prospect)}</p>
                        <p>{prospect.stageLabel} · {prospect.nextStepLabel}</p>
                        <p>Assigned: {brokerLabel}</p>
                        <p>{formatRelativeTime(lastActivity?.activityDate || lastActivity?.createdAt)} · {lastActivity?.activityNote || lastActivity?.activityType || 'No activity yet'}</p>
                      </div>
                    </div>
                  )
                }) : (
                  <InlineTableEmptyState
                    icon={emptyStateConfig.icon}
                    title={emptyStateConfig.title}
                    description={emptyStateConfig.description}
                    actionLabel={emptyStateConfig.actionLabel}
                    onAction={emptyStateConfig.onAction}
                  />
                )}
                </div>

                <div className="flex flex-col gap-3 border-t border-[#eef3f7] px-5 py-4 text-sm text-[#63768b] sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    Showing <span className="font-semibold text-[#102236]">{tableStart}</span>-
                    <span className="font-semibold text-[#102236]">{tableEnd}</span> of{' '}
                    <span className="font-semibold text-[#102236]">{pageScopedProspects.length}</span> prospects
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Field as="select" value="10" onChange={() => {}} aria-label="Rows per page" className="h-10 !w-[150px] rounded-[12px] bg-white py-2 text-sm">
                      <option value="10">10 per page</option>
                    </Field>
                    <button type="button" disabled className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#e2eaf3] bg-[#f8fbff] text-[#b7c5d5]"><ChevronLeft size={16} /></button>
                    <button type="button" disabled className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#e2eaf3] bg-[#f8fbff] text-[#b7c5d5]"><ChevronRight size={16} /></button>
                  </div>
                </div>
              </div>
            </section>
          </article>

          {drawerOpen && selectedProspect ? (
            <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20">
              <button type="button" className="flex-1 cursor-default" aria-label="Close drawer backdrop" onClick={() => setDrawerOpen(false)} />
              <aside className="h-full w-full max-w-[560px] overflow-y-auto border-l border-[#dce6f0] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                <div className="sticky top-0 z-10 border-b border-[#e8eef5] bg-white/95 px-5 py-4 backdrop-blur">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b899a]">Prospect Detail</p>
                      <h2 className="mt-2 truncate text-[1.3rem] font-semibold tracking-[-0.03em] text-[#102236]">{getProspectDisplayName(selectedProspect)}</h2>
                      <p className="mt-1 text-sm text-[#63768b]">{getAreaLine(selectedProspect)} · {getAssetLine(selectedProspect)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" onClick={handleSaveProspect} disabled={busyAction === 'save'} className="rounded-[12px]">
                        <Save size={16} />
                        {busyAction === 'save' ? 'Saving...' : 'Save'}
                      </Button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#dce6f0] bg-white text-[#62758b] transition hover:border-[#bfd2e6] hover:bg-[#f8fbff] hover:text-[#0f2748]"
                        onClick={() => setDrawerOpen(false)}
                        aria-label="Close prospect drawer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 px-5 py-5">
                  <section className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Overview</h3>
                      <ProspectTonePill value={selectedProspect.status} />
                    </div>
                    <div className="rounded-[16px] border border-[#eef3f7] bg-[#fbfdff] px-4 py-3 text-sm text-[#60758d]">
                      Assigned broker: <span className="font-semibold text-[#102236]">{pickLookupLabel(brokerOptions, selectedProspect.assignedBrokerId, selectedProspect.assignedBrokerName || 'Unassigned')}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Company</span>
                        <Field value={selectedProspect.companyName || ''} onChange={(event) => updateSelectedProspectField('companyName', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Contact</span>
                        <Field value={selectedProspect.contactName || ''} onChange={(event) => updateSelectedProspectField('contactName', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Phone</span>
                        <Field value={selectedProspect.phone || ''} onChange={(event) => updateSelectedProspectField('phone', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Email</span>
                        <Field value={selectedProspect.email || ''} onChange={(event) => updateSelectedProspectField('email', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Category</span>
                        <Field as="select" value={selectedProspect.propertyType || ''} onChange={(event) => updateSelectedProspectField('propertyType', event.target.value)}>
                          <option value="">Select type</option>
                          {PROSPECT_PROPERTY_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                        </Field>
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Area</span>
                        <Field value={selectedProspect.area || ''} onChange={(event) => updateSelectedProspectField('area', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Broker</span>
                        <Field as="select" value={selectedProspect.assignedBrokerId || ''} onChange={(event) => updateSelectedProspectField('assignedBrokerId', event.target.value)}>
                          <option value="">Unassigned</option>
                          {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </Field>
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Status</span>
                        <Field as="select" value={selectedProspect.status || 'New'} onChange={(event) => updateSelectedProspectField('status', event.target.value)}>
                          {PROSPECT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
                        </Field>
                      </label>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Activity</h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Button type="button" variant="secondary" onClick={() => handleLogActivity('Call')} disabled={busyAction.startsWith('activity-')}>
                        <Phone size={16} />
                        Call
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => handleLogActivity('WhatsApp')} disabled={busyAction.startsWith('activity-')}>
                        <MessageCircle size={16} />
                        WhatsApp
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => handleLogActivity('Email')} disabled={busyAction.startsWith('activity-')}>
                        <Mail size={16} />
                        Email
                      </Button>
                    </div>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Activity note</span>
                      <Field as="textarea" value={activityDraft.activityNote} onChange={(event) => setActivityDraft((current) => ({ ...current, activityNote: event.target.value }))} placeholder="What happened in the latest touchpoint?" />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Outcome</span>
                      <Field value={activityDraft.outcome} onChange={(event) => setActivityDraft((current) => ({ ...current, outcome: event.target.value }))} placeholder="Next step or outcome" />
                    </label>
                    <Button type="button" onClick={() => handleLogActivity('Note')} disabled={busyAction.startsWith('activity-')}>
                      <Save size={16} />
                      Log activity
                    </Button>
                    <div className="space-y-3">
                      {selectedActivities.length ? selectedActivities.map((activityRow) => (
                        <div key={activityRow.id} className="rounded-[16px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[#102236]">{titleize(activityRow.activityType)}</p>
                              <p className="mt-1 text-sm leading-6 text-[#60758d]">{activityRow.activityNote || 'No note recorded'}</p>
                            </div>
                            <span className="text-xs font-semibold text-[#7b899a]">{formatDate(activityRow.activityDate || activityRow.createdAt)}</span>
                          </div>
                          {activityRow.outcome ? <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#1a6e3a]">{activityRow.outcome}</p> : null}
                        </div>
                      )) : (
                        <InlineTableEmptyState icon={CalendarDays} title="No activity yet." description="Calls, emails, WhatsApp notes, and follow-up touchpoints will appear here." />
                      )}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Notes</h3>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Follow-up note</span>
                      <Field value={selectedProspect.followUpNote || ''} onChange={(event) => updateSelectedProspectField('followUpNote', event.target.value)} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Notes</span>
                      <Field as="textarea" value={selectedProspect.notes || ''} onChange={(event) => updateSelectedProspectField('notes', event.target.value)} />
                    </label>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Tasks</h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Follow-up date</span>
                        <Field as="input" type="date" value={selectedProspect.nextFollowUpDate || ''} onChange={(event) => updateSelectedProspectField('nextFollowUpDate', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Priority</span>
                        <Field as="select" value={selectedProspect.followUpPriority || 'Medium'} onChange={(event) => updateSelectedProspectField('followUpPriority', event.target.value)}>
                          {FOLLOW_UP_PRIORITIES.map((option) => <option key={option} value={option}>{option}</option>)}
                        </Field>
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Estimated value</span>
                        <Field as="input" type="number" value={selectedProspect.estimatedValue || ''} onChange={(event) => updateSelectedProspectField('estimatedValue', event.target.value)} />
                      </label>
                    </div>
                    <div className="rounded-[16px] border border-[#eef3f7] bg-[#fbfdff] p-4 text-sm text-[#60758d]">
                      {selectedProspect.nextFollowUpDate ? `Next follow-up ${formatRelativeDate(selectedProspect.nextFollowUpDate)}.` : 'No scheduled follow-up yet.'}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Conversion History</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Button type="button" variant="secondary" onClick={() => void handleConvert('requirement')} disabled={busyAction.startsWith('convert-')}>
                        <ClipboardList size={16} />
                        {busyAction === 'convert-requirement' ? 'Creating...' : 'Requirement'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void handleConvert('deal')} disabled={busyAction.startsWith('convert-')}>
                        <DollarSign size={16} />
                        {busyAction === 'convert-deal' ? 'Creating...' : 'Deal'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void handleConvert('contact')} disabled={busyAction.startsWith('convert-')}>
                        <UserPlus size={16} />
                        {busyAction === 'convert-contact' ? 'Creating...' : 'Contact'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setArchiveOpen(true)}>
                        <Archive size={16} />
                        Archive
                      </Button>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-[16px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Linked company</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[#102236]">{pickLookupLabel(lookupOptions.companies, selectedProspect.companyId, selectedProspect.companyName || 'Not linked')}</p>
                          {getWorkspaceLink('commercial_company', selectedProspect.companyId) ? <Link to={getWorkspaceLink('commercial_company', selectedProspect.companyId)} className="text-xs font-semibold text-[#1f6dd5]">Open</Link> : null}
                        </div>
                      </div>
                      <div className="rounded-[16px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Workflow link</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[#102236]">{selectedProspect.linkedEntityType ? `${titleize(selectedProspect.linkedEntityType)} ${selectedProspect.linkedEntityId || ''}`.trim() : 'Not linked'}</p>
                          {getWorkspaceLink(selectedProspect.linkedEntityType, selectedProspect.linkedEntityId) ? <Link to={getWorkspaceLink(selectedProspect.linkedEntityType, selectedProspect.linkedEntityId)} className="text-xs font-semibold text-[#1f6dd5]">Open</Link> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="secondary" onClick={() => setDeleteOpen(true)}>
                        <Trash2 size={16} />
                        Delete
                      </Button>
                    </div>
                  </section>
                </div>
              </aside>
            </div>
          ) : null}

          {createModal}

      <Modal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archive prospect"
        subtitle="This keeps the record and activity history intact."
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleArchiveProspect} disabled={busyAction === 'archive'}>
              <Archive size={16} />
              {busyAction === 'archive' ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        )}
      >
        <p className="text-sm leading-6 text-[#60758d]">
          The prospect will move out of the active queue, but the timeline stays available for future reference.
        </p>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete prospect"
        subtitle="This removes the prospect and its local activity history."
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleDeleteProspect} disabled={busyAction === 'delete'}>
              <Trash2 size={16} />
              {busyAction === 'delete' ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        )}
      >
        <p className="text-sm leading-6 text-[#60758d]">
          If you delete this prospect, its activity trail is removed from the canvassing workspace as well.
        </p>
      </Modal>
        </>
      )}
    </div>
  )
}

export default CommercialCanvassingPage
