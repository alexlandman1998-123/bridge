import {
  Archive,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { formatCurrency, formatDate, titleize } from '../commercialFormatters'
import { toLookupOptions } from '../commercialPipelineHelpers'
import { formatCurrencyZAR, formatRelativeTime, formatShortDate } from '../commercialProspectFormatters'
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

function getProspectSource(prospect = {}) {
  return normalizeText(prospect.canvassingMethod) || 'Other'
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

function isArchivedStatus(status = '') {
  return normalizeKey(status) === 'archived'
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

function ProspectStat({ label, value, detail, icon: Icon }) {
  return (
    <article className={`${CARD_CLASS} flex min-h-[154px] flex-col justify-between p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-medium text-[#60758d]">{label}</p>
          <p className="mt-5 text-[38px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">{value}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#eef5fb] text-[#2d6ecf]">
          <Icon size={20} />
        </span>
      </div>
      <p className="text-[13px] font-normal text-[#7b899a]">{detail}</p>
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

function EmptyDetailState() {
  return (
    <CommercialEmptyState
      title="No prospect selected"
      description="Choose a canvassing record to review the follow-up trail, conversion actions, and linked commercial records."
    />
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

function CommercialCanvassingPage() {
  const [searchParams] = useSearchParams()
  const [organisationId, setOrganisationId] = useState('')
  const [organisationName, setOrganisationName] = useState('')
  const [prospects, setProspects] = useState([])
  const [activities, setActivities] = useState([])
  const [lookups, setLookups] = useState({})
  const [pipeline, setPipeline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [canvassingEnabled, setCanvassingEnabled] = useState(true)
  const [search, setSearch] = useState('')
  const [dealFilter, setDealFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [brokerFilter, setBrokerFilter] = useState('all')
  const [selectedProspectId, setSelectedProspectId] = useState('')
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
        setOrganisationName(context.organisation?.name || 'Commercial workspace')
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
      setOrganisationName(context.organisation?.name || 'Commercial workspace')
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
    setCreateDraft(nextDraft)
    setCreateOpen(true)
    setCreateStep(2)
    setCreateErrors({})
    createPrefillAppliedRef.current = createPrefillKey
  }, [brokerOptions, createPrefillKey, hasCreatePrefillParams, searchParams])

  useEffect(() => {
    if (selectedProspectId || !prospects.length) return
    setSelectedProspectId(prospects[0].id)
  }, [prospects, selectedProspectId])

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

  const selectedProspect = useMemo(
    () => prospects.find((prospect) => normalizeText(prospect.id) === normalizeText(selectedProspectId)) || null,
    [prospects, selectedProspectId],
  )

  const selectedProspectView = useMemo(
    () => (selectedProspect
      ? normaliseCommercialProspect(selectedProspect, {
        lastActivity: activitiesByProspectId.get(normalizeText(selectedProspect.id)) || null,
        assignedBrokerName: pickLookupLabel(brokerOptions, selectedProspect.assignedBrokerId, selectedProspect.assignedBrokerName || ''),
      })
      : null),
    [activitiesByProspectId, brokerOptions, selectedProspect],
  )

  const selectedActivities = useMemo(
    () => activities
      .filter((activityRow) => normalizeText(activityRow.prospectId) === normalizeText(selectedProspect?.id))
      .sort((left, right) => new Date(right.activityDate || right.createdAt || 0) - new Date(left.activityDate || left.createdAt || 0)),
    [activities, selectedProspect],
  )

  const filteredProspects = useMemo(() => filterCommercialProspects(normalizedProspects, {
    search,
    dealType: dealFilter,
    role: roleFilter,
    category: categoryFilter,
    assigned: brokerFilter,
  }).filter((prospect) => statusFilter === 'all' || normalizeKey(prospect.stageLabel || prospect.status) === normalizeKey(statusFilter)), [brokerFilter, categoryFilter, dealFilter, normalizedProspects, roleFilter, search, statusFilter])

  const metrics = useMemo(() => deriveCommercialCanvassingMetrics(normalizedProspects, activities), [activities, normalizedProspects])

  function resetCreateDraft(nextRole = 'seller') {
    setCreateDraft(buildInitialDraft(brokerOptions[0]?.value || '', {
      prospectRole: nextRole,
      dealType: getDealTypeFromRole(nextRole),
      propertyCategory: 'retail',
      assignedBrokerId: brokerOptions[0]?.value || '',
    }))
    setCreateErrors({})
    setCreateStep(2)
  }

  function openCreateModal(nextRole = 'seller') {
    resetCreateDraft(nextRole)
    setCreateOpen(true)
  }

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

  const createRole = normalizeKey(createDraft.prospectRole) || 'seller'
  const createRoleOption = COMMERCIAL_ROLE_OPTIONS.find((option) => option.value === createRole) || COMMERCIAL_ROLE_OPTIONS[0]
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
      title="New prospect"
      subtitle="Capture the company, contact, or asset you want to work with through the commercial pipeline."
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
              {COMMERCIAL_ROLE_OPTIONS.map((option) => {
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

  const selectedBrokerLabel = selectedProspectView?.assignedBrokerDisplay || pickLookupLabel(brokerOptions, selectedProspect?.assignedBrokerId, selectedProspect?.assignedBrokerName || 'Unassigned')

  return (
    <div className="space-y-8 pb-10">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#8a96a8]">{organisationName}</p>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.04em] text-[#102236] lg:text-[36px]">Canvassing</h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-6 text-[#63768b]">
            Track prospecting activity and convert interested prospects into commercial leads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-[14px] border border-[#dce6f0] bg-white p-1 shadow-sm">
            {FILTER_DEAL_TABS.map((tab) => {
              const active = dealFilter === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setDealFilter(tab.value)}
                  className={`h-10 rounded-[12px] px-4 text-sm font-medium transition ${
                    active
                      ? 'bg-[#eff5ff] text-[#1f4f78] shadow-[0_1px_2px_rgba(15,35,55,0.08)]'
                      : 'text-[#62758b] hover:bg-[#f8fbff] hover:text-[#0f2748]'
                  }`}
                >
                  {tab.value === 'all' ? 'All' : tab.label}
                </button>
              )
            })}
          </div>
          <Button type="button" onClick={() => openCreateModal(createRole)}>
            <Plus size={16} />
            Prospect
          </Button>
        </div>
      </section>

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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ProspectStat label="Prospects" value={loading ? '...' : metrics.prospects} detail="All active prospects" icon={ClipboardList} />
        <ProspectStat label="Activities" value={loading ? '...' : metrics.activities} detail="This month" icon={CalendarDays} />
        <ProspectStat label="Follow Ups" value={loading ? '...' : metrics.followUpsDue} detail={loading ? 'Due this week' : `${metrics.overdueFollowUps} overdue`} icon={CheckCircle2} />
        <ProspectStat label="Converted" value={loading ? '...' : metrics.converted} detail="This month" icon={DollarSign} />
        <ProspectStat label="Pipeline Value" value={loading ? '...' : formatCurrencyZAR(metrics.pipelineValue)} detail="Opportunity value in motion" icon={DollarSign} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <article className={`${CARD_CLASS} overflow-hidden`}>
          <div className="border-b border-[#e6edf4] p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-[#102236]">Prospects</h2>
                <p className="mt-1 text-sm leading-6 text-[#63768b]">Unified commercial prospect register and follow-up state.</p>
              </div>
              <div className="grid gap-3 xl:grid-cols-[minmax(0,260px)_repeat(3,minmax(0,180px))]">
                <SearchField value={search} onChange={setSearch} placeholder="Search prospects, areas, brokers..." />
                <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-[14px]">
                  <option value="all">All stages</option>
                  {PROSPECT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
                </Field>
                <Field as="select" value={brokerFilter} onChange={(event) => setBrokerFilter(event.target.value)} className="h-11 rounded-[14px]">
                  <option value="all">All brokers</option>
                  {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Field>
                <Field as="select" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} className="h-11 rounded-[14px]">
                  <option value="all">All methods</option>
                  {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                </Field>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {FILTER_DEAL_TABS.map((tab) => {
                  const active = dealFilter === tab.value
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setDealFilter(tab.value)}
                      className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
                        active
                          ? 'border-[#2c6cf0] bg-[#eff5ff] text-[#1f4f78]'
                          : 'border-[#dce6f0] bg-white text-[#63768b] hover:border-[#bfd2e6] hover:text-[#0f2748]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { value: 'all', label: 'All' },
                  ...(dealFilter === 'lease'
                    ? [{ value: 'landlord', label: 'Landlords' }, { value: 'tenant', label: 'Tenants' }]
                    : dealFilter === 'sale'
                      ? [{ value: 'seller', label: 'Sellers' }, { value: 'buyer', label: 'Buyers' }]
                      : [{ value: 'seller', label: 'Sellers' }, { value: 'buyer', label: 'Buyers' }, { value: 'landlord', label: 'Landlords' }, { value: 'tenant', label: 'Tenants' }]),
                ].map((item) => {
                  const active = roleFilter === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setRoleFilter(item.value)}
                      className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
                        active
                          ? 'border-[#2c6cf0] bg-[#eff5ff] text-[#1f4f78]'
                          : 'border-[#dce6f0] bg-white text-[#63768b] hover:border-[#bfd2e6] hover:text-[#0f2748]'
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { value: 'all', label: 'All Categories' },
                  ...COMMERCIAL_CATEGORY_OPTIONS,
                ].map((item) => {
                  const active = categoryFilter === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setCategoryFilter(item.value)}
                      className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
                        active
                          ? 'border-[#2c6cf0] bg-[#eff5ff] text-[#1f4f78]'
                          : 'border-[#dce6f0] bg-white text-[#63768b] hover:border-[#bfd2e6] hover:text-[#0f2748]'
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="overflow-hidden">
            {loading ? (
              <div className="p-6 text-sm text-[#60758d]">Loading commercial canvassing workspace...</div>
            ) : filteredProspects.length ? (
              <>
                <div className="hidden max-h-[780px] overflow-auto md:block">
                  <table className="min-w-[1240px] border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="text-left text-[12px] uppercase tracking-[0.14em] text-[#7b899a]">
                        <th className="border-b border-[#eef3f7] px-6 py-4 font-semibold">Prospect</th>
                        <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Type</th>
                        <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Category</th>
                        <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Source / Method</th>
                        <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Area / Asset</th>
                        <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Stage / Next Step</th>
                        <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Assigned</th>
                        <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Last Activity</th>
                        <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProspects.map((prospect) => {
                        const selected = normalizeText(prospect.id) === normalizeText(selectedProspectId)
                        const brokerLabel = prospect.assignedBrokerDisplay || pickLookupLabel(brokerOptions, prospect.assignedBrokerId, prospect.assignedBrokerName || 'Unassigned')
                        const roleTone = getProspectBadgeVariant(prospect.prospectRole)
                        const categoryTone = getCategoryBadgeVariant(prospect.propertyCategory)
                        const showMenu = openActionMenuId === prospect.id
                        const initials = prospect.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'P'
                        const lastActivity = prospect.lastActivity || null
                        const conversionActions = prospect.prospectRole === 'seller'
                          ? ['Convert to Seller Lead', 'Create Sales Listing']
                          : prospect.prospectRole === 'buyer'
                            ? ['Convert to Buyer Lead', 'Create Buyer Requirement']
                            : prospect.prospectRole === 'landlord'
                              ? ['Convert to Landlord', 'Create Vacancy', 'Create Lease Listing']
                              : ['Convert to Tenant Requirement', 'Create Lease Lead']

                        return (
                          <tr
                            key={prospect.id}
                            className={`cursor-pointer border-b border-[#eef3f7] transition ${selected ? 'bg-[#f4f8fc]' : 'hover:bg-[#fbfdff]'}`}
                            onClick={() => {
                              setSelectedProspectId(prospect.id)
                              setOpenActionMenuId('')
                            }}
                          >
                            <td className="px-6 py-4 align-top">
                              <div className="flex items-start gap-3">
                                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef5fb] text-sm font-semibold text-[#2d6ecf]">
                                  {initials}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#102236]">{prospect.displayName}</p>
                                  <p className="mt-1 truncate text-xs text-[#6d839b]">{prospect.secondaryLine || 'No contact captured'}</p>
                                  <p className="mt-1 truncate text-xs text-[#6d839b]">{normalizeText(prospect.phone) || 'No phone captured'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-2">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(roleTone)}`}>{prospect.roleLabel}</span>
                                <p className="text-sm text-[#63768b]">{prospect.dealTypeLabel}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(categoryTone)}`}>{prospect.categoryLabel}</span>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <span className="inline-flex rounded-full border border-[#e0e8f2] bg-[#f8fbff] px-2.5 py-1 text-xs font-semibold text-[#38506a]">
                                {titleize(prospect.sourceLabel)}
                              </span>
                            </td>
                            <td className="px-4 py-4 align-top text-sm text-[#102236]">{prospect.areaLabel || 'Area pending'}</td>
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-2">
                                <ProspectTonePill value={prospect.stageLabel} />
                                <p className="line-clamp-1 text-sm font-medium text-[#63768b]">{prospect.nextStepLabel}</p>
                                <p className="text-xs text-[#8a96a8]">{prospect.nextFollowUpDate ? formatShortDate(prospect.nextFollowUpDate) : 'No follow-up date'}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="inline-flex items-center gap-2">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e7edf6] text-xs font-semibold text-[#2b4f71]">
                                  {brokerLabel === 'Unassigned' ? 'U' : brokerLabel.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')}
                                </span>
                                <span className="text-sm font-semibold text-[#102236]">{brokerLabel}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <p className="text-sm font-medium text-[#63768b]">{formatRelativeTime(lastActivity?.activityDate || lastActivity?.createdAt)}</p>
                              <p className="mt-1 text-xs text-[#8a96a8]">{lastActivity?.activityType || 'No activity yet'}</p>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
                                <button
                                  type="button"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dce6f0] bg-white text-[#62758b] transition hover:border-[#bfd2e6] hover:bg-[#f8fbff]"
                                  aria-label={`Open actions for ${prospect.displayName}`}
                                  onClick={() => setOpenActionMenuId((current) => (current === prospect.id ? '' : prospect.id))}
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                                {showMenu ? (
                                  <div className="absolute right-0 top-10 z-20 w-52 overflow-hidden rounded-[14px] border border-[#dce6f0] bg-white py-1 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setOpenActionMenuId('') }}>Open</button>
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setOpenActionMenuId('') }}>Edit</button>
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setMessage('Use the activity panel to add a note.'); setOpenActionMenuId('') }}>Add note</button>
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setMessage('Use the activity panel to log a call.'); setOpenActionMenuId('') }}>Log call</button>
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setMessage('Follow-up scheduling coming soon.'); setOpenActionMenuId('') }}>Schedule follow-up</button>
                                    <div className="my-1 border-t border-[#eef3f7]" />
                                    {conversionActions.map((actionLabel) => (
                                      <button
                                        key={actionLabel}
                                        type="button"
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#9d5a13] transition hover:bg-[#fff8ee]"
                                        title="Conversion workflow coming soon"
                                        disabled
                                      >
                                        {actionLabel}
                                      </button>
                                    ))}
                                    <div className="my-1 border-t border-[#eef3f7]" />
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#a13b35] transition hover:bg-[#fff5f5]" onClick={() => { setSelectedProspectId(prospect.id); setArchiveOpen(true); setOpenActionMenuId('') }}>Archive</button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-[#eef3f7] md:hidden">
                  {filteredProspects.map((prospect) => {
                    const lastActivity = prospect.lastActivity || null
                    const brokerLabel = prospect.assignedBrokerDisplay || pickLookupLabel(brokerOptions, prospect.assignedBrokerId, prospect.assignedBrokerName || 'Unassigned')
                    const initials = prospect.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'P'
                    return (
                      <div
                        key={prospect.id}
                        className="cursor-pointer px-4 py-4 transition hover:bg-[#fbfdff]"
                        onClick={() => {
                          setSelectedProspectId(prospect.id)
                          setOpenActionMenuId('')
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-start gap-3">
                              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef5fb] text-sm font-semibold text-[#2d6ecf]">
                                {initials}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#102236]">{prospect.displayName}</p>
                                <p className="mt-1 text-xs text-[#6d839b]">{prospect.secondaryLine || 'No contact captured'}</p>
                                <p className="mt-1 text-xs text-[#6d839b]">{normalizeText(prospect.phone) || 'No phone captured'}</p>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dce6f0] bg-white text-[#62758b]"
                            onClick={(event) => {
                              event.stopPropagation()
                              setOpenActionMenuId((current) => (current === prospect.id ? '' : prospect.id))
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
                          <p>{prospect.areaLabel || 'Area pending'}</p>
                          <p>{prospect.stageLabel} · {prospect.nextStepLabel}</p>
                          <p>Assigned: {brokerLabel}</p>
                          <p>{formatRelativeTime(lastActivity?.activityDate || lastActivity?.createdAt)} · {lastActivity?.activityType || 'No activity yet'}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="p-6">
                <CommercialEmptyState
                  title="No commercial prospects yet."
                  description={
                    dealFilter === 'sale'
                      ? 'Track property owners and buyers ready to move through the sales pipeline.'
                      : dealFilter === 'lease'
                        ? 'Track landlords and tenants for the leasing pipeline.'
                        : 'Add your first seller, buyer, landlord or tenant prospect to start building your commercial pipeline.'
                  }
                  primaryActionLabel="+ Add Prospect"
                  onPrimaryAction={() => openCreateModal(createRole)}
                />
              </div>
            )}
          </div>
        </article>

        <aside className="space-y-6">
          {selectedProspect ? (
            <>
              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Selected prospect</p>
                    <h2 className="mt-2 text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">{getProspectDisplayName(selectedProspect)}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#60758d]">{normalizeText(selectedProspect.area) || 'No area captured yet'}</p>
                  </div>
                  <ProspectTonePill value={selectedProspect.status} />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b899a]">Estimated value</p>
                    <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#0f2748]">{formatCurrency(selectedProspect.estimatedValue)}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b899a]">Follow-up</p>
                    <p className="mt-2 text-sm font-semibold text-[#0f2748]">{formatRelativeDate(selectedProspect.nextFollowUpDate)}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b899a]">Broker</p>
                    <p className="mt-2 text-sm font-semibold text-[#0f2748]">{selectedBrokerLabel}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b899a]">Source</p>
                    <p className="mt-2 text-sm font-semibold text-[#0f2748]">{titleize(getProspectSource(selectedProspect))}</p>
                  </div>
                </div>
              </article>

              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0f2748]">Edit prospect</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">Keep the commercial canvass record current as the conversation moves.</p>
                  </div>
                  <Button type="button" onClick={handleSaveProspect} disabled={busyAction === 'save'}>
                    <Save size={16} />
                    {busyAction === 'save' ? 'Saving...' : 'Save'}
                  </Button>
                </div>

                <div className="mt-5 grid gap-4">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Company</span>
                    <Field value={selectedProspect.companyName || ''} onChange={(event) => updateSelectedProspectField('companyName', event.target.value)} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Contact</span>
                    <Field value={selectedProspect.contactName || ''} onChange={(event) => updateSelectedProspectField('contactName', event.target.value)} />
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Phone</span>
                      <Field value={selectedProspect.phone || ''} onChange={(event) => updateSelectedProspectField('phone', event.target.value)} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Email</span>
                      <Field value={selectedProspect.email || ''} onChange={(event) => updateSelectedProspectField('email', event.target.value)} />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prospect type</span>
                      <Field as="select" value={selectedProspect.prospectType || 'Landlord Prospect'} onChange={(event) => updateSelectedProspectField('prospectType', event.target.value)}>
                        {PROSPECT_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Canvassing method</span>
                      <Field as="select" value={selectedProspect.canvassingMethod || 'Cold Call'} onChange={(event) => updateSelectedProspectField('canvassingMethod', event.target.value)}>
                        {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Property type</span>
                      <Field as="select" value={selectedProspect.propertyType || ''} onChange={(event) => updateSelectedProspectField('propertyType', event.target.value)}>
                        <option value="">Select type</option>
                        {PROSPECT_PROPERTY_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Area</span>
                      <Field value={selectedProspect.area || ''} onChange={(event) => updateSelectedProspectField('area', event.target.value)} />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Broker owner</span>
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
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Priority</span>
                      <Field as="select" value={selectedProspect.followUpPriority || 'Medium'} onChange={(event) => updateSelectedProspectField('followUpPriority', event.target.value)}>
                        {FOLLOW_UP_PRIORITIES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Follow-up date</span>
                      <Field as="input" type="date" value={selectedProspect.nextFollowUpDate || ''} onChange={(event) => updateSelectedProspectField('nextFollowUpDate', event.target.value)} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Estimated value</span>
                      <Field as="input" type="number" value={selectedProspect.estimatedValue || ''} onChange={(event) => updateSelectedProspectField('estimatedValue', event.target.value)} />
                    </label>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Follow-up note</span>
                    <Field value={selectedProspect.followUpNote || ''} onChange={(event) => updateSelectedProspectField('followUpNote', event.target.value)} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Notes</span>
                    <Field as="textarea" value={selectedProspect.notes || ''} onChange={(event) => updateSelectedProspectField('notes', event.target.value)} />
                  </label>
                </div>
              </article>

              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0f2748]">Conversion</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">Move the prospect into the next commercial record when the outcome is clear.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
                  <Button type="button" variant="secondary" onClick={() => setArchiveOpen(true)} disabled={busyAction.startsWith('convert-')}>
                    <Archive size={16} />
                    Archive
                  </Button>
                </div>
              </article>

              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0f2748]">Activity</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">{selectedActivities.length} logged touchpoints</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
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
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Note</span>
                    <Field as="textarea" value={activityDraft.activityNote} onChange={(event) => setActivityDraft((current) => ({ ...current, activityNote: event.target.value }))} placeholder="What happened on the call or visit?" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Outcome</span>
                    <Field value={activityDraft.outcome} onChange={(event) => setActivityDraft((current) => ({ ...current, outcome: event.target.value }))} placeholder="Next step or outcome" />
                  </label>
                  <Button type="button" onClick={() => handleLogActivity('Note')} disabled={busyAction.startsWith('activity-')}>
                    <Save size={16} />
                    Log activity
                  </Button>
                </div>
                <div className="mt-6 space-y-3">
                  {selectedActivities.length ? selectedActivities.map((activityRow) => (
                    <div key={activityRow.id} className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[#102236]">{titleize(activityRow.activityType)}</p>
                          <p className="mt-1 text-sm leading-6 text-[#60758d]">{activityRow.activityNote || 'No note recorded'}</p>
                        </div>
                        <span className="text-xs font-semibold text-[#7b899a]">{formatDate(activityRow.activityDate || activityRow.createdAt)}</span>
                      </div>
                      {activityRow.outcome ? <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#1a6e3a]">{activityRow.outcome}</p> : null}
                    </div>
                  )) : (
                    <CommercialEmptyState
                      title="No activities yet"
                      description="Log calls, emails, WhatsApp notes, and follow-up steps against this prospect."
                    />
                  )}
                </div>
              </article>

              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0f2748]">Linked records</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">Commercial records already connected to this prospect.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Company</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102236]">{pickLookupLabel(lookupOptions.companies, selectedProspect.companyId, selectedProspect.companyName || 'Not linked')}</p>
                      {getWorkspaceLink('commercial_company', selectedProspect.companyId) ? (
                        <Link to={getWorkspaceLink('commercial_company', selectedProspect.companyId)} className="text-xs font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
                          Open
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Contact</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102236]">{pickLookupLabel(lookupOptions.contacts, selectedProspect.contactId, selectedProspect.contactName || 'Not linked')}</p>
                      {getWorkspaceLink('commercial_contact', selectedProspect.contactId) ? (
                        <Link to={getWorkspaceLink('commercial_contact', selectedProspect.contactId)} className="text-xs font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
                          Open
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Property / vacancy / listing</p>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#102236]">
                          {[pickLookupLabel(lookupOptions.properties, selectedProspect.propertyId, ''), pickLookupLabel(lookupOptions.vacancies, selectedProspect.vacancyId, ''), pickLookupLabel(lookupOptions.listings, selectedProspect.listingId, '')]
                            .filter((value) => normalizeText(value))
                            .join(' · ') || 'Not linked'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {getWorkspaceLink('commercial_property', selectedProspect.propertyId) ? (
                            <Link to={getWorkspaceLink('commercial_property', selectedProspect.propertyId)} className="inline-flex items-center gap-1 rounded-full border border-[#dce6f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f2748] transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
                              Open property
                            </Link>
                          ) : null}
                          {getWorkspaceLink('commercial_vacancy', selectedProspect.vacancyId) ? (
                            <Link to={getWorkspaceLink('commercial_vacancy', selectedProspect.vacancyId)} className="inline-flex items-center gap-1 rounded-full border border-[#dce6f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f2748] transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
                              Open vacancy
                            </Link>
                          ) : null}
                          {getWorkspaceLink('commercial_listing', selectedProspect.listingId) ? (
                            <Link to={getWorkspaceLink('commercial_listing', selectedProspect.listingId)} className="inline-flex items-center gap-1 rounded-full border border-[#dce6f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f2748] transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
                              Open listing
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Workflow link</p>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102236]">
                        {selectedProspect.linkedEntityType ? `${titleize(selectedProspect.linkedEntityType)} ${selectedProspect.linkedEntityId || ''}`.trim() : 'Not linked'}
                      </p>
                      {getWorkspaceLink(selectedProspect.linkedEntityType, selectedProspect.linkedEntityId) ? (
                        <Link to={getWorkspaceLink(selectedProspect.linkedEntityType, selectedProspect.linkedEntityId)} className="text-xs font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
                          Open
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={() => setArchiveOpen(true)}>
                    <Archive size={16} />
                    Archive
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setDeleteOpen(true)}>
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </div>
              </article>
            </>
          ) : (
            <EmptyDetailState />
          )}
        </aside>
      </section>

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
