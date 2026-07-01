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
  Factory,
  FileClock,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Sprout,
  Star,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { csvEscape, parseCsvText } from '../../../lib/csvImport'
import { fetchOrganisationSettings } from '../../../lib/settingsApi'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { formatDate, titleize } from '../commercialFormatters'
import { toLookupOptions } from '../commercialPipelineHelpers'
import { formatRelativeTime, formatShortDate } from '../commercialProspectFormatters'
import {
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
import CommercialAddressField from '../components/CommercialAddressField'
import { buildManualCommercialAddressValue } from '../components/commercialAddressFieldUtils'
import {
  createCommercialCompany,
  createCommercialContact,
  createCommercialDeal,
  createCommercialRequirement,
  getCommercialLookupData,
} from '../services/commercialApi'
import { getCommercialCanvassingContext, listCommercialCanvassingWorkspace, createCommercialCanvassingActivity, createCommercialCanvassingProspect, deleteCommercialCanvassingProspect, updateCommercialCanvassingProspect } from '../services/commercialCanvassingApi'
import {
  approveCommercialImportBatch,
  commitCommercialImportBatch,
  createCommercialImportBatch,
  createCommercialImportRows,
  listCommercialImportBatches,
  updateCommercialImportBatch,
  updateCommercialImportRow,
} from '../services/commercialImportApi'

const CARD_CLASS = 'rounded-[24px] border border-[#e6edf4] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]'
const FOLLOW_UP_PRIORITIES = COMMERCIAL_PRIORITY_OPTIONS
const PROSPECT_STATUSES = COMMERCIAL_PROSPECT_STATUSES
const CANVASSING_METHODS = [
  'Cold Call',
  'Referral',
  'Existing Database',
  'Deeds Search',
  'Lightstone',
  'Walk-in',
  'Website',
  'Other',
]
const PROSPECT_PROPERTY_TYPES = COMMERCIAL_CATEGORY_OPTIONS.map((option) => option.label)
const LEASE_ASSET_CLASS_OPTIONS = [
  { value: 'retail', label: 'Retail', icon: Building2, tone: 'violet' },
  { value: 'office', label: 'Office', icon: Building2, tone: 'blue' },
  { value: 'industrial', label: 'Industrial', icon: Factory, tone: 'rose' },
  { value: 'agricultural', label: 'Agricultural', icon: Sprout, tone: 'emerald' },
]
const SALES_ASSET_CLASS_OPTIONS = [
  { value: 'retail', label: 'Retail', icon: Building2, tone: 'violet' },
  { value: 'office', label: 'Office', icon: Building2, tone: 'blue' },
  { value: 'industrial', label: 'Industrial', icon: Factory, tone: 'rose' },
  { value: 'commercial', label: 'Commercial', icon: Building2, tone: 'blue' },
  { value: 'mixed_use', label: 'Mixed-use', icon: Building2, tone: 'amber' },
  { value: 'agricultural', label: 'Agricultural', icon: Sprout, tone: 'emerald' },
]
const LEASE_AREA_OPTIONS = ['Rosebank', 'Sandton', 'Midrand', 'Centurion', 'Menlyn', 'Bedfordview']
const SALES_AREA_OPTIONS = ['Rosebank', 'Sandton', 'Midrand', 'Centurion', 'Menlyn', 'Bedfordview']
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
const PROSPECT_IMPORT_AUDIT_RECORD_TYPES = new Set([
  'canvassing_seller_prospects',
  'canvassing_buyer_prospects',
  'canvassing_landlord_prospects',
  'canvassing_tenant_prospects',
])
const DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS = {
  enabled: true,
  allowedRecordTypes: [
    'canvassing_seller_prospects',
    'canvassing_buyer_prospects',
    'canvassing_landlord_prospects',
    'canvassing_tenant_prospects',
  ],
  requireManagerApproval: true,
  duplicateStrategy: 'review',
  defaultOwnerMode: 'uploading_broker',
  maxRowsPerUpload: 1000,
}

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

function getConvertedRequirementId(prospect = {}) {
  const linkedEntityType = normalizeKey(prospect.linkedEntityType || prospect.linked_entity_type)
  return normalizeText(
    prospect.convertedRequirementId
      || prospect.converted_requirement_id
      || prospect.requirementId
      || prospect.requirement_id
      || (linkedEntityType === 'commercial_requirement' ? prospect.linkedEntityId || prospect.linked_entity_id : ''),
  )
}

function isCanvassingFollowUp(prospect = {}) {
  return isOpenProspect(prospect) && (normalizeKey(getProspectStatus(prospect)).includes('follow') || isFollowUpDue(prospect))
}

function isWithinRelativeDate(value = '', filter = 'all') {
  if (!filter || filter === 'all') return true
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return false
  const days = filter === '7d' ? 7 : filter === '30d' ? 30 : filter === '90d' ? 90 : 0
  if (!days) return true
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days)
  return parsed.getTime() >= start.getTime()
}

function getCanvassingPageViewConfig(dealType = '') {
  const normalizedDealType = normalizeKey(dealType)
  if (normalizedDealType === 'lease') {
    const roleOptions = COMMERCIAL_ROLE_OPTIONS.filter((option) => ['landlord', 'tenant'].includes(option.value))
    return {
      key: 'lease',
      title: 'Leasing Prospects',
      description: 'Capture and qualify landlords and tenants. Convert them into leads when ready.',
      createLabel: '+ Add Prospect',
      searchPlaceholder: 'Search prospects by name, company, area...',
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
const LEASE_STATUS_OPTIONS = ['New', 'Contacted', 'Qualified', 'Converted', 'Not Interested']
const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'All dates' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function commercialAddressPayload(value = null) {
  if (!value || typeof value !== 'object') return {}
  const placeId = normalizeText(value.googlePlaceId || value.placeId)
  return {
    formatted_address: normalizeText(value.formattedAddress) || null,
    street_number: normalizeText(value.streetNumber) || null,
    route: normalizeText(value.route) || null,
    street_name: normalizeText(value.streetName || value.route) || null,
    street_address: normalizeText(value.streetAddress || value.formattedAddress) || null,
    suburb: normalizeText(value.suburb) || null,
    city: normalizeText(value.city) || null,
    province: normalizeText(value.province) || null,
    postal_code: normalizeText(value.postalCode) || null,
    country: normalizeText(value.country) || null,
    latitude: Number.isFinite(Number(value.latitude)) ? Number(value.latitude) : null,
    longitude: Number.isFinite(Number(value.longitude)) ? Number(value.longitude) : null,
    place_id: placeId || null,
    google_place_id: placeId || null,
    address_components: value.addressComponents || null,
    raw_google_response: value.rawGoogleResponse || null,
    geocoding_status: normalizeText(value.geocodingStatus) || (placeId ? 'google_place' : 'manual'),
  }
}

function compactCommercialAddressPayload(value = null) {
  return Object.fromEntries(Object.entries(commercialAddressPayload(value)).filter(([, entry]) => entry !== null && entry !== ''))
}

function getProspectAreaAddress(prospect = {}) {
  const roleSpecific = prospect.roleSpecific || prospect.metadata?.roleSpecific || {}
  return roleSpecific.preferredAreaAddress || roleSpecific.propertyAddressDetails || null
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeImportHeader(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeImportPhone(value = '') {
  return normalizeText(value).replace(/\D/g, '')
}

function normalizeImportDate(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return ''
}

const PROSPECT_IMPORT_COLUMNS = [
  'Company Name',
  'Contact Name',
  'Phone',
  'Email',
  'Prospect Role',
  'Property Category',
  'Area',
  'Status',
  'Source',
  'Assigned Broker',
  'Next Follow Up Date',
  'Notes',
]

const PROSPECT_IMPORT_TEMPLATE_ROWS = [
  ['ABC Properties', 'John Smith', '082 123 4567', 'john@example.com', 'Landlord', 'Retail', 'Rosebank', 'New', 'Existing Database', '', '2026-07-15', 'Owns a retail building near the mall'],
  ['Bright Logistics', 'Sarah Mokoena', '083 555 1212', 'sarah@example.com', 'Tenant', 'Industrial', 'Midrand', 'New', 'Referral', '', '', 'Needs 800 sqm warehouse space'],
  ['Urban Owner Co', 'Anele Dlamini', '084 555 1212', 'anele@example.com', 'Seller', 'Office', 'Cape Town CBD', 'New', 'Cold Call', '', '2026-07-20', 'Potential disposal mandate'],
  ['Prime Capital', 'Michael Naidoo', '081 555 1212', 'michael@example.com', 'Buyer', 'Industrial', 'Edenvale', 'New', 'Email', '', '2026-07-22', 'Looking for income-producing assets'],
]

function buildProspectImportTemplateCsv() {
  return [PROSPECT_IMPORT_COLUMNS, ...PROSPECT_IMPORT_TEMPLATE_ROWS]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n')
}

function buildProspectRejectedRowsCsv(rows = []) {
  const header = [...PROSPECT_IMPORT_COLUMNS, 'Import Status', 'Import Reason']
  const body = rows.map((row) => [
    row.payload?.companyName || '',
    row.payload?.contactName || '',
    row.payload?.phone || '',
    row.payload?.email || '',
    row.payload?.prospectRole ? getRoleLabel(row.payload.prospectRole) : '',
    row.payload?.propertyType || row.payload?.propertyCategory || '',
    row.payload?.area || '',
    row.payload?.status || '',
    row.payload?.canvassingMethod || '',
    row.payload?.assignedBrokerName || row.payload?.assignedBrokerId || '',
    row.payload?.nextFollowUpDate || '',
    row.payload?.notes || '',
    row.status || '',
    row.reason || [...(row.errors || []), ...(row.warnings || [])].join('; '),
  ])
  return [header, ...body].map((csvRow) => csvRow.map(csvEscape).join(',')).join('\n')
}

function getProspectImportAuditRecordType(row = {}) {
  const role = normalizeImportRole(row.payload?.prospectRole)
  if (role === 'seller') return 'canvassing_seller_prospects'
  if (role === 'buyer') return 'canvassing_buyer_prospects'
  if (role === 'landlord') return 'canvassing_landlord_prospects'
  if (role === 'tenant') return 'canvassing_tenant_prospects'
  return ''
}

function normalizeProspectBulkUploadSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const allowedRecordTypes = Array.isArray(source.allowedRecordTypes)
    ? source.allowedRecordTypes.filter((recordType) => PROSPECT_IMPORT_AUDIT_RECORD_TYPES.has(recordType))
    : DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS.allowedRecordTypes

  return {
    ...DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS,
    ...source,
    enabled: source.enabled !== false,
    allowedRecordTypes,
    requireManagerApproval: source.requireManagerApproval !== false,
    duplicateStrategy: ['review', 'skip', 'update'].includes(source.duplicateStrategy) ? source.duplicateStrategy : DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS.duplicateStrategy,
    defaultOwnerMode: ['uploading_broker', 'selected_broker', 'unassigned'].includes(source.defaultOwnerMode) ? source.defaultOwnerMode : DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS.defaultOwnerMode,
    maxRowsPerUpload: Math.max(1, Math.min(10000, Number(source.maxRowsPerUpload) || DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS.maxRowsPerUpload)),
  }
}

function getProspectImportRecordTypeForRole(role = '') {
  const normalizedRole = normalizeImportRole(role)
  if (normalizedRole === 'seller') return 'canvassing_seller_prospects'
  if (normalizedRole === 'buyer') return 'canvassing_buyer_prospects'
  if (normalizedRole === 'landlord') return 'canvassing_landlord_prospects'
  if (normalizedRole === 'tenant') return 'canvassing_tenant_prospects'
  return ''
}

function isProspectImportRoleAllowed(role = '', settings = DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS) {
  const recordType = getProspectImportRecordTypeForRole(role)
  if (!recordType) return true
  return (settings.allowedRecordTypes || []).includes(recordType)
}

function getProspectImportAuditStatus(status = '') {
  if (status === 'ready') return 'ready'
  if (status === 'warning') return 'warning'
  if (status === 'skipped') return 'skipped'
  if (status === 'invalid') return 'invalid'
  if (status === 'created') return 'created'
  if (status === 'failed') return 'failed'
  return 'pending'
}

function getProspectImportAuditAction(row = {}) {
  if (row.status === 'skipped') return 'skip'
  if (row.status === 'invalid') return 'review'
  return 'create'
}

function buildProspectImportDuplicateKey(row = {}) {
  const role = normalizeImportRole(row.payload?.prospectRole) || normalizeKey(row.payload?.prospectRole)
  const email = normalizeText(row.payload?.email).toLowerCase()
  const phone = normalizeImportPhone(row.payload?.phone)
  const company = normalizeKey(row.payload?.companyName)
  if (role && email) return `email:${role}:${email}`
  if (role && phone) return `phone:${role}:${phone}`
  if (role && company) return `company:${role}:${company}`
  return ''
}

function buildProspectImportNormalizedPayload(row = {}) {
  const payload = row.payload || {}
  return {
    company_name: normalizeText(payload.companyName),
    contact_name: normalizeText(payload.contactName),
    phone: normalizeText(payload.phone),
    email: normalizeText(payload.email).toLowerCase(),
    prospect_type: normalizeText(payload.prospectType),
    prospect_role: normalizeImportRole(payload.prospectRole) || normalizeText(payload.prospectRole),
    deal_type: normalizeText(payload.dealType),
    property_category: normalizeText(payload.propertyCategory),
    property_type: normalizeText(payload.propertyType),
    area: normalizeText(payload.area),
    status: normalizeText(payload.status) || 'New',
    canvassing_method: normalizeText(payload.canvassingMethod) || 'Existing Database',
    assigned_broker_id: normalizeText(payload.assignedBrokerId),
    assigned_broker_name: normalizeText(payload.assignedBrokerName),
    next_follow_up_date: normalizeImportDate(payload.nextFollowUpDate),
    follow_up_priority: normalizeImportPriority(payload.followUpPriority),
    notes: normalizeText(payload.notes),
  }
}

function buildProspectImportAuditRowPayload(row = {}) {
  const validationErrors = row.errors || []
  const validationWarnings = row.warnings || []
  return {
    rowNumber: row.rowNumber,
    sourceRow: row.source || {},
    mappedPayload: row.payload || {},
    normalizedPayload: buildProspectImportNormalizedPayload(row),
    status: getProspectImportAuditStatus(row.status),
    action: getProspectImportAuditAction(row),
    validationErrors,
    validationWarnings,
    duplicateKey: buildProspectImportDuplicateKey(row),
    duplicateRecordType: row.status === 'skipped' ? 'commercial_canvassing_prospects' : '',
    errorMessage: row.status === 'invalid' || row.status === 'skipped' ? row.reason : '',
    metadata: {
      source: 'commercial_canvassing_prospect_import_phase_3',
      importRowId: row.id,
      importFileName: row.payload?.metadata?.importFileName || '',
    },
  }
}

function summarizeProspectImportRows(rows = []) {
  return rows.reduce((summary, row) => {
    summary.totalRows += 1
    if (row.status === 'ready' || row.status === 'created' || row.status === 'failed') summary.validRows += 1
    if (row.status === 'warning' || row.warnings?.length) summary.warningRows += 1
    if (row.status === 'invalid' || row.errors?.length) summary.invalidRows += 1
    if (row.status === 'skipped') summary.skippedRows += 1
    if (row.status === 'created') summary.createdRows += 1
    if (row.status === 'failed') summary.failedRows += 1
    return summary
  }, {
    totalRows: 0,
    validRows: 0,
    warningRows: 0,
    invalidRows: 0,
    skippedRows: 0,
    createdRows: 0,
    failedRows: 0,
  })
}

function isProspectImportAuditBatch(batch = {}) {
  return PROSPECT_IMPORT_AUDIT_RECORD_TYPES.has(normalizeText(batch.recordType || batch.record_type))
}

function getProspectImportAuditBatchLabel(batch = {}) {
  const recordType = normalizeText(batch.recordType || batch.record_type)
  if (recordType === 'canvassing_seller_prospects') return 'Seller prospects'
  if (recordType === 'canvassing_buyer_prospects') return 'Buyer prospects'
  if (recordType === 'canvassing_landlord_prospects') return 'Landlord prospects'
  if (recordType === 'canvassing_tenant_prospects') return 'Tenant prospects'
  return 'Prospect import'
}

function getImportBatchStatusTone(status = '') {
  const normalized = normalizeKey(status)
  if (['committed', 'ready', 'approved'].includes(normalized)) return 'emerald'
  if (['failed', 'rejected', 'cancelled'].includes(normalized)) return 'rose'
  if (['approvalpending', 'validated', 'uploaded', 'committing'].includes(normalized)) return 'amber'
  return 'slate'
}

function getProspectImportBatchIssueCount(batch = {}) {
  return Number(batch.invalidRows || 0) + Number(batch.warningRows || 0) + Number(batch.failedCount || 0) + Number(batch.skippedCount || 0)
}

function downloadTextFile(fileName, text) {
  if (typeof document === 'undefined') return
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

function getImportValue(row = {}, aliases = []) {
  for (const alias of aliases) {
    const value = row[normalizeImportHeader(alias)]
    if (normalizeText(value)) return normalizeText(value)
  }
  return ''
}

function normalizeImportRole(value = '') {
  const key = normalizeImportHeader(value)
  if (['seller', 'sellerprospect', 'owner', 'propertyowner'].includes(key)) return 'seller'
  if (['buyer', 'buyerprospect', 'purchaser'].includes(key)) return 'buyer'
  if (['landlord', 'landlordprospect', 'lessor'].includes(key)) return 'landlord'
  if (['tenant', 'tenantprospect', 'occupier', 'lessee'].includes(key)) return 'tenant'
  return ''
}

function normalizeImportStatus(value = '') {
  const text = normalizeText(value)
  if (!text) return 'New'
  const match = PROSPECT_STATUSES.find((status) => normalizeKey(status) === normalizeKey(text))
  return match || 'New'
}

function normalizeImportPriority(value = '') {
  const text = normalizeText(value)
  if (!text) return 'Medium'
  const match = FOLLOW_UP_PRIORITIES.find((priority) => normalizeKey(priority) === normalizeKey(text))
  return match || 'Medium'
}

function splitContactName(value = '') {
  const trimmed = normalizeText(value)
  if (!trimmed) return { firstName: '', lastName: '' }
  const [first, ...rest] = trimmed.split(/\s+/)
  return { firstName: first || '', lastName: rest.join(' ') || '' }
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
    propertyAddressValue: null,
    propertyName: '',
    portfolioName: '',
    lookingFor: '',
    preferredArea: '',
    preferredAreaValue: null,
    spaceRequirement: '',
    sizeRange: '',
    budgetRange: '',
    reasonForSelling: '',
    targetPurchaseTimeline: '',
    leaseTimeline: '',
    vacancyDetails: '',
    industry: '',
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
  const roleLabel = getRoleLabel(role)
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
    targetPurchaseTimeline: getParam('targetPurchaseTimeline'),
    leaseTimeline: getParam('leaseTimeline'),
    vacancyDetails: getParam('vacancyDetails'),
    industry: getParam('industry'),
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
    prospectType: getParam('prospectType') || `${roleLabel} Prospect`,
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
  const role = normalizeKey(prospect.prospectRole)
  const dealType = normalizeKey(prospect.dealType)
  if (dealType === 'sale' || role === 'seller' || role === 'buyer') return 'purchase'
  if (dealType === 'lease' || role === 'landlord' || role === 'tenant') return 'lease'
  const type = normalizeKey(prospect.prospectType)
  if (type.includes('investor') || type.includes('buyer')) return 'purchase'
  if (type.includes('owner occupier') || type.includes('occupier')) return 'lease'
  if (type.includes('developer')) return 'investment'
  return 'lease'
}

function inferClientType(prospect = {}) {
  const role = normalizeKey(prospect.prospectRole)
  if (role === 'tenant') return 'tenant'
  if (role === 'buyer') return 'owner_occupier'
  if (role === 'seller' || role === 'landlord') return 'investor'
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

function getLeaseStatusLabel(status = '') {
  const normalized = normalizeKey(status)
  if (normalized.includes('converted')) return 'Converted'
  if (normalized.includes('not interested') || normalized.includes('lost') || normalized.includes('archived')) return 'Not Interested'
  if (normalized.includes('qualified')) return 'Qualified'
  if (normalized.includes('contacted')) return 'Contacted'
  return 'New'
}

function getLeaseStatusTone(status = '') {
  const normalized = normalizeKey(getLeaseStatusLabel(status))
  if (normalized === 'converted') return 'emerald'
  if (normalized === 'qualified') return 'violet'
  if (normalized === 'contacted') return 'blue'
  if (normalized === 'not interested') return 'slate'
  return 'green'
}

function LeaseStatusPill({ status }) {
  const label = getLeaseStatusLabel(status)
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneClass(getLeaseStatusTone(label))}`}>
      {label}
    </span>
  )
}

function LeaseAssetClass({ category = '' }) {
  const normalized = normalizeKey(category)
  const option = LEASE_ASSET_CLASS_OPTIONS.find((item) => item.value === normalized)
    || LEASE_ASSET_CLASS_OPTIONS.find((item) => normalizeKey(item.label) === normalized)
    || { value: normalized || 'other', label: getPropertyCategoryLabel(category), icon: Building2, tone: 'slate' }
  const IconComponent = option.icon || Building2
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#102236]">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-[8px] border ${toneClass(option.tone)}`}>
        <IconComponent size={15} />
      </span>
      {option.label}
    </span>
  )
}

function CanvassingKpiStrip({ loading = false, metrics = {}, counts = {}, mode = 'lease' }) {
  const firstRole = mode === 'sale'
    ? { label: 'Sellers', value: counts.sellers, icon: Building2, tone: 'green' }
    : { label: 'Landlords', value: counts.landlords, icon: Building2, tone: 'green' }
  const secondRole = mode === 'sale'
    ? { label: 'Buyers', value: counts.buyers, icon: Users, tone: 'violet' }
    : { label: 'Tenants', value: counts.tenants, icon: Users, tone: 'violet' }
  const items = [
    { label: 'Total Prospects', value: counts.total ?? metrics.prospects, icon: Users, tone: 'blue' },
    firstRole,
    secondRole,
    { label: 'Qualified', value: counts.qualified, icon: Star, tone: 'amber' },
    { label: 'Converted', value: metrics.converted, icon: CheckCircle2, tone: 'emerald' },
  ]

  return (
    <section className="grid overflow-hidden rounded-[12px] border border-[#dfe8f3] bg-white shadow-[0_10px_30px_rgba(15,35,70,0.04)] md:grid-cols-5">
      {items.map((item, index) => {
        const IconComponent = item.icon
        return (
          <div key={item.label} className={`flex min-h-[76px] items-center gap-4 px-5 py-4 ${index ? 'border-t border-[#e8eef5] md:border-l md:border-t-0' : ''}`}>
            <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border ${toneClass(item.tone)}`}>
              <IconComponent size={20} />
            </span>
            <div>
              <p className="text-[1.45rem] font-semibold leading-none tracking-[-0.03em] text-[#0b2344]">{loading ? '...' : item.value || 0}</p>
              <p className="mt-2 text-sm font-medium text-[#405a78]">{item.label}</p>
            </div>
          </div>
        )
      })}
    </section>
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

function FocusedProspectsEmptyState({ mode = 'lease', onAddPrimary, onAddSecondary }) {
  const primaryLabel = mode === 'sale' ? 'Add Seller' : 'Add Landlord'
  const secondaryLabel = mode === 'sale' ? 'Add Buyer' : 'Add Tenant'
  const singleActionLabel = mode === 'sale' ? '' : 'Add Prospect'
  const title = mode === 'sale' ? 'Build your sales prospect database' : 'Build your leasing prospect database'
  const description = mode === 'sale'
    ? 'Start capturing sellers and buyers. Qualified prospects can be converted into sales leads.'
    : 'Start capturing landlords and tenants. Qualified prospects can be converted into leads.'
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#eef5fb] text-[#0c5fd7]">
        <ClipboardList size={24} />
      </span>
      <p className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[#102236]">{title}</p>
      <p className="mt-2 max-w-[440px] text-sm leading-6 text-[#60758d]">{description}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {singleActionLabel ? (
          <Button type="button" onClick={onAddPrimary} className="h-11 rounded-[10px] bg-[#082f56] px-5 text-white hover:bg-[#0b3d70]">
            <Plus size={16} />
            {singleActionLabel}
          </Button>
        ) : (
          <>
            <Button type="button" onClick={onAddPrimary} className="h-11 rounded-[10px] bg-[#082f56] px-5 text-white hover:bg-[#0b3d70]">
              <Plus size={16} />
              {primaryLabel}
            </Button>
            <Button type="button" variant="secondary" onClick={onAddSecondary} className="h-11 rounded-[10px] px-5">
              <Plus size={16} />
              {secondaryLabel}
            </Button>
          </>
        )}
      </div>
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
      <span className="text-xs font-semibold text-[#183153]">{label}</span>
      {children}
      <FieldError error={error} />
    </label>
  )
}

function LeaseCreateSection({ number, title, icon, children }) {
  const IconComponent = icon
  return (
    <section className="border-t border-[#dfe8f3] pt-6 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-center gap-3">
        {IconComponent ? <IconComponent size={22} className="text-[#0f2a4a]" /> : null}
        <h4 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#102236]">{number}. {title}</h4>
      </div>
      {children}
    </section>
  )
}

function LeaseRoleTab({ active = false, icon, label, onClick }) {
  const IconComponent = icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-14 min-w-0 items-center justify-center gap-3 rounded-[8px] border px-5 text-sm font-semibold transition ${
        active
          ? 'border-[#6da0ff] bg-[#f3f8ff] text-[#095ed8] shadow-[0_0_0_1px_rgba(45,108,240,0.08)]'
          : 'border-[#dfe8f3] bg-white text-[#253a55] hover:border-[#bcd1ea] hover:bg-[#fbfdff]'
      }`}
    >
      {IconComponent ? <IconComponent size={19} /> : null}
      {label}
    </button>
  )
}

function LeaseAssetPill({ option, active = false, onClick }) {
  const IconComponent = option.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-[8px] border px-3 text-sm font-semibold transition ${
        active
          ? `${toneClass(option.tone)} shadow-[0_0_0_1px_rgba(15,23,42,0.04)]`
          : 'border-[#dfe8f3] bg-white text-[#1e3450] hover:border-[#bfd2e6] hover:bg-[#fbfdff]'
      }`}
    >
      {IconComponent ? <IconComponent size={16} /> : null}
      {option.label}
    </button>
  )
}

function ProspectAddressField({
  createDraft,
  createErrors,
  updateCreateAddressField,
  field,
  valueField,
  mode = 'full_address',
  placeholder,
  description,
}) {
  const currentValue = createDraft[valueField] || buildManualCommercialAddressValue(createDraft[field])
  return (
    <CommercialAddressField
      mode={mode}
      value={currentValue}
      placeholder={placeholder}
      description={description}
      error={createErrors[field]}
      onChange={(value) => updateCreateAddressField(field, valueField, value)}
      onManualInput={(value) => updateCreateAddressField(field, valueField, value)}
    />
  )
}

function renderSellerFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) {
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
          <ProspectAddressField
            createDraft={createDraft}
            createErrors={createErrors}
            updateCreateAddressField={updateCreateAddressField}
            field="propertyAddress"
            valueField="propertyAddressValue"
            mode="full_address"
            placeholder="Start typing the property address..."
            description="Select a property address, suburb, or node. Manual entries are allowed."
          />
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

function renderBuyerFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) {
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
          <ProspectAddressField
            createDraft={createDraft}
            createErrors={createErrors}
            updateCreateAddressField={updateCreateAddressField}
            field="preferredArea"
            valueField="preferredAreaValue"
            mode="area"
            placeholder="Search suburb, city or node..."
            description="Area-level Places results are supported, and manual entries still save."
          />
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

function renderLeaseAssetClassField({ createDraft, createErrors, updateCreateDraftField, label = 'Asset Class *', options = LEASE_ASSET_CLASS_OPTIONS }) {
  return (
    <div className="grid gap-2">
      <CreateLabel label={label} error={createErrors.propertyCategory}>
        <Field
          as="select"
          value={createDraft.propertyCategory}
          onChange={(event) => updateCreateDraftField('propertyCategory', event.target.value)}
          className="h-12 rounded-[8px] bg-white text-sm"
        >
          <option value="">Select asset class</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Field>
      </CreateLabel>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <LeaseAssetPill
            key={option.value}
            option={option}
            active={normalizeKey(createDraft.propertyCategory) === option.value}
            onClick={() => updateCreateDraftField('propertyCategory', option.value)}
          />
        ))}
      </div>
    </div>
  )
}

function renderLeaseProspectingFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) {
  return (
    <LeaseCreateSection number="3" title="Prospecting Information" icon={ClipboardList}>
      <div className="grid gap-4 md:grid-cols-2">
        <CreateLabel label="Assigned Broker *" error={createErrors.assignedBrokerId}>
          <Field as="select" value={createDraft.assignedBrokerId} onChange={(event) => updateCreateDraftField('assignedBrokerId', event.target.value)} className="h-12 rounded-[8px] bg-white text-sm">
            <option value="">Select broker</option>
            {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Source">
          <Field as="select" value={createDraft.canvassingMethod} onChange={(event) => updateCreateDraftField('canvassingMethod', event.target.value)} className="h-12 rounded-[8px] bg-white text-sm">
            <option value="">Select source</option>
            {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Field>
        </CreateLabel>
        <CreateLabel label="Notes" className="md:col-span-2">
          <div className="relative">
            <Field
              as="textarea"
              value={createDraft.notes}
              maxLength={500}
              onChange={(event) => updateCreateDraftField('notes', event.target.value)}
              placeholder="Any additional notes..."
              className="min-h-[72px] rounded-[8px] pb-7 text-sm"
            />
            <span className="pointer-events-none absolute bottom-3 right-3 text-xs font-semibold text-[#7a8da6]">{normalizeText(createDraft.notes).length}/500</span>
          </div>
        </CreateLabel>
      </div>
    </LeaseCreateSection>
  )
}

function renderLeaseLandlordFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) {
  return (
    <div className="space-y-6">
      <LeaseCreateSection number="1" title="Contact / Company Details" icon={Users}>
        <div className="grid gap-4 md:grid-cols-2">
          <CreateLabel label="Landlord / Company Name *" error={createErrors.companyName}>
            <Field value={createDraft.companyName} onChange={(event) => updateCreateDraftField('companyName', event.target.value)} placeholder="e.g. ABC Properties (Pty) Ltd" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Contact Person">
            <Field value={createDraft.contactName} onChange={(event) => updateCreateDraftField('contactName', event.target.value)} placeholder="e.g. John Smith" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Contact Number *" error={createErrors.phone}>
            <Field value={createDraft.phone} onChange={(event) => updateCreateDraftField('phone', event.target.value)} placeholder="e.g. 082 123 4567" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Email Address">
            <Field value={createDraft.email} onChange={(event) => updateCreateDraftField('email', event.target.value)} placeholder="e.g. john@abcproperties.co.za" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
        </div>
      </LeaseCreateSection>

      <LeaseCreateSection number="2" title="Property Details" icon={Building2}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.7fr)_minmax(0,1.15fr)]">
          <CreateLabel label="Property Address *" error={createErrors.propertyAddress}>
            <ProspectAddressField
              createDraft={createDraft}
              createErrors={createErrors}
              updateCreateAddressField={updateCreateAddressField}
              field="propertyAddress"
              valueField="propertyAddressValue"
              mode="full_address"
              placeholder="Start typing the property address..."
              description="We'll capture the area and suburb automatically when available."
            />
            <p className="text-xs font-medium text-[#5d718b]">We'll capture the area and suburb automatically.</p>
          </CreateLabel>
          <CreateLabel label="Area / Node">
            <Field as="select" value={createDraft.preferredArea} onChange={(event) => updateCreateDraftField('preferredArea', event.target.value)} className="h-12 rounded-[8px] bg-white text-sm">
              <option value="">Select area</option>
              {LEASE_AREA_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </CreateLabel>
          {renderLeaseAssetClassField({ createDraft, createErrors, updateCreateDraftField })}
        </div>
      </LeaseCreateSection>

      {renderLeaseProspectingFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions })}
    </div>
  )
}

function renderLeaseTenantFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions }) {
  return (
    <div className="space-y-5">
      <LeaseCreateSection number="1" title="Contact / Company Details" icon={Users}>
        <div className="grid gap-4 md:grid-cols-2">
          <CreateLabel label="Company Name *" error={createErrors.companyName}>
            <Field value={createDraft.companyName} onChange={(event) => updateCreateDraftField('companyName', event.target.value)} placeholder="e.g. Bright Logistics (Pty) Ltd" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Contact Person">
            <Field value={createDraft.contactName} onChange={(event) => updateCreateDraftField('contactName', event.target.value)} placeholder="e.g. Sarah Mokoena" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Contact Number *" error={createErrors.phone}>
            <Field value={createDraft.phone} onChange={(event) => updateCreateDraftField('phone', event.target.value)} placeholder="e.g. 082 123 4567" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Email Address">
            <Field value={createDraft.email} onChange={(event) => updateCreateDraftField('email', event.target.value)} placeholder="e.g. sarah@brightlogistics.co.za" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
        </div>
      </LeaseCreateSection>

      <LeaseCreateSection number="2" title="Business Details" icon={Building2}>
        <div className="grid gap-4 md:grid-cols-2">
          <CreateLabel label="Industry">
            <Field value={createDraft.industry} onChange={(event) => updateCreateDraftField('industry', event.target.value)} placeholder="e.g. Logistics" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          {renderLeaseAssetClassField({ createDraft, createErrors, updateCreateDraftField, label: 'Asset Class Interest *' })}
        </div>
      </LeaseCreateSection>

      {renderLeaseProspectingFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions })}
    </div>
  )
}

function renderSalesSellerFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) {
  return (
    <div className="space-y-6">
      <LeaseCreateSection number="1" title="Owner / Company Details" icon={Users}>
        <div className="grid gap-4 md:grid-cols-2">
          <CreateLabel label="Seller / Company Name *" error={createErrors.companyName}>
            <Field value={createDraft.companyName} onChange={(event) => updateCreateDraftField('companyName', event.target.value)} placeholder="e.g. ABC Properties (Pty) Ltd" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Contact Person">
            <Field value={createDraft.contactName} onChange={(event) => updateCreateDraftField('contactName', event.target.value)} placeholder="e.g. John Smith" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Contact Number">
            <Field value={createDraft.phone} onChange={(event) => updateCreateDraftField('phone', event.target.value)} placeholder="e.g. 082 123 4567" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Email Address">
            <Field value={createDraft.email} onChange={(event) => updateCreateDraftField('email', event.target.value)} placeholder="e.g. owner@company.co.za" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
        </div>
      </LeaseCreateSection>

      <LeaseCreateSection number="2" title="Sale Property Details" icon={Building2}>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(220px,0.65fr)]">
          <CreateLabel label="Property Address / Area *" error={createErrors.propertyAddress}>
            <ProspectAddressField
              createDraft={createDraft}
              createErrors={createErrors}
              updateCreateAddressField={updateCreateAddressField}
              field="propertyAddress"
              valueField="propertyAddressValue"
              mode="full_address"
              placeholder="Start typing an address or area..."
            />
          </CreateLabel>
          <CreateLabel label="Area / Node">
            <Field as="select" value={createDraft.preferredArea} onChange={(event) => updateCreateDraftField('preferredArea', event.target.value)} className="h-12 rounded-[8px] bg-white text-sm">
              <option value="">Select area</option>
              {SALES_AREA_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </CreateLabel>
        </div>
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,0.48fr)_minmax(0,1fr)]">
          <CreateLabel label="Estimated Sale Value" className="max-w-full lg:max-w-[420px]">
            <div className="relative">
              <DollarSign size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6f8197]" />
              <Field as="input" type="number" value={createDraft.estimatedSaleValue} onChange={(event) => updateCreateDraftField('estimatedSaleValue', event.target.value)} placeholder="0" className="h-12 rounded-[8px] pl-9 text-sm" />
            </div>
          </CreateLabel>
          {renderLeaseAssetClassField({ createDraft, createErrors, updateCreateDraftField, label: 'Asset Class *', options: SALES_ASSET_CLASS_OPTIONS })}
        </div>
      </LeaseCreateSection>

      {renderLeaseProspectingFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions })}
    </div>
  )
}

function renderSalesBuyerFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) {
  return (
    <div className="space-y-6">
      <LeaseCreateSection number="1" title="Buyer / Company Details" icon={Users}>
        <div className="grid gap-4 md:grid-cols-2">
          <CreateLabel label="Buyer / Company Name *" error={createErrors.companyName}>
            <Field value={createDraft.companyName} onChange={(event) => updateCreateDraftField('companyName', event.target.value)} placeholder="e.g. Bright Logistics (Pty) Ltd" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Contact Person">
            <Field value={createDraft.contactName} onChange={(event) => updateCreateDraftField('contactName', event.target.value)} placeholder="e.g. Sarah Mokoena" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Contact Number">
            <Field value={createDraft.phone} onChange={(event) => updateCreateDraftField('phone', event.target.value)} placeholder="e.g. 082 123 4567" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Email Address">
            <Field value={createDraft.email} onChange={(event) => updateCreateDraftField('email', event.target.value)} placeholder="e.g. buyer@company.co.za" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
        </div>
      </LeaseCreateSection>

      <LeaseCreateSection number="2" title="Purchase Requirement" icon={Building2}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_minmax(0,1.15fr)]">
          <CreateLabel label="Preferred Area *" error={createErrors.preferredArea}>
            <ProspectAddressField
              createDraft={createDraft}
              createErrors={createErrors}
              updateCreateAddressField={updateCreateAddressField}
              field="preferredArea"
              valueField="preferredAreaValue"
              mode="area"
              placeholder="Preferred suburb, node, or region"
              description="Area-level Places results are supported, and manual entries still save."
            />
          </CreateLabel>
          <CreateLabel label="Looking For *" error={createErrors.lookingFor}>
            <Field as="select" value={createDraft.lookingFor} onChange={(event) => updateCreateDraftField('lookingFor', event.target.value)} className="h-12 rounded-[8px] bg-white text-sm">
              <option value="">Select requirement</option>
              {BUY_LOOKING_FOR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </CreateLabel>
          {renderLeaseAssetClassField({ createDraft, createErrors, updateCreateDraftField, label: 'Asset Class Interest *', options: SALES_ASSET_CLASS_OPTIONS })}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <CreateLabel label="Budget Range">
            <Field value={createDraft.budgetRange} onChange={(event) => updateCreateDraftField('budgetRange', event.target.value)} placeholder="e.g. R8m - R12m" className="h-12 rounded-[8px] text-sm" />
          </CreateLabel>
          <CreateLabel label="Target Purchase Timeline">
            <Field as="select" value={createDraft.targetPurchaseTimeline} onChange={(event) => updateCreateDraftField('targetPurchaseTimeline', event.target.value)} className="h-12 rounded-[8px] bg-white text-sm">
              <option value="">Select timeline</option>
              {PURCHASE_TIMELINE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </CreateLabel>
        </div>
      </LeaseCreateSection>

      {renderLeaseProspectingFields({ createDraft, createErrors, updateCreateDraftField, brokerOptions })}
    </div>
  )
}

function CommercialCanvassingPage({ dealType = '' }) {
  const [searchParams] = useSearchParams()
  const pageView = useMemo(() => getCanvassingPageViewConfig(dealType), [dealType])
  const [organisationId, setOrganisationId] = useState('')
  const [prospects, setProspects] = useState([])
  const [activities, setActivities] = useState([])
  const [lookups, setLookups] = useState({})
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
  const [dateAddedFilter, setDateAddedFilter] = useState('all')
  const [lastContactFilter, setLastContactFilter] = useState('all')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [selectedProspectId, setSelectedProspectId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFileName, setImportFileName] = useState('')
  const [importRows, setImportRows] = useState([])
  const [importError, setImportError] = useState('')
  const [importAudit, setImportAudit] = useState({ batches: [], warning: '', unsupportedRows: 0 })
  const [recentImportBatches, setRecentImportBatches] = useState([])
  const [recentImportError, setRecentImportError] = useState('')
  const [recentImportsLoading, setRecentImportsLoading] = useState(false)
  const [recentImportAction, setRecentImportAction] = useState({ batchId: '', action: '' })
  const [prospectImportSettings, setProspectImportSettings] = useState(DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS)
  const [prospectImportSettingsError, setProspectImportSettingsError] = useState('')
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [createStep, setCreateStep] = useState(2)
  const [createErrors, setCreateErrors] = useState({})
  const [createDraft, setCreateDraft] = useState(buildInitialDraft())
  const [activityDraft, setActivityDraft] = useState(buildInitialActivityDraft())
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [openActionMenuId, setOpenActionMenuId] = useState('')
  const importFileInputRef = useRef(null)
  const createPrefillAppliedRef = useRef('')
  const createPrefillKey = searchParams.toString()
  const hasCreatePrefillParams = hasCreatePrefill(searchParams)

  const loadRecentProspectImportBatches = useCallback(async (nextOrganisationId = organisationId, { showLoading = true } = {}) => {
    const resolvedOrganisationId = normalizeText(nextOrganisationId)
    if (!resolvedOrganisationId) {
      setRecentImportBatches([])
      setRecentImportError('')
      return
    }

    if (showLoading) setRecentImportsLoading(true)
    setRecentImportError('')
    try {
      const batches = await listCommercialImportBatches(resolvedOrganisationId, { limit: 20 })
      setRecentImportBatches((batches || []).filter(isProspectImportAuditBatch).slice(0, 5))
    } catch (batchError) {
      setRecentImportBatches([])
      setRecentImportError(batchError?.message || 'Recent prospect imports could not be loaded.')
    } finally {
      if (showLoading) setRecentImportsLoading(false)
    }
  }, [organisationId])

  async function handleApproveRecentProspectImport(batch = {}) {
    const batchId = normalizeText(batch.id)
    if (!batchId) return
    setRecentImportAction({ batchId, action: 'approve' })
    setRecentImportError('')
    setMessage('')
    try {
      await approveCommercialImportBatch(batchId)
      setMessage('Prospect import approved for commit.')
      await loadRecentProspectImportBatches(organisationId, { showLoading: false })
    } catch (approveError) {
      setRecentImportError(approveError?.message || 'Prospect import could not be approved.')
    } finally {
      setRecentImportAction({ batchId: '', action: '' })
    }
  }

  async function handleCommitRecentProspectImport(batch = {}) {
    const batchId = normalizeText(batch.id)
    if (!batchId) return
    setRecentImportAction({ batchId, action: 'commit' })
    setRecentImportError('')
    setMessage('')
    try {
      const result = await commitCommercialImportBatch(batchId)
      setMessage(`Prospect import committed: ${result.summary.createdCount} created, ${result.summary.updatedCount} updated, ${result.summary.skippedCount} skipped, ${result.summary.failedCount} failed.`)
      await loadData({ showLoading: false, preserveOnError: true })
      await loadRecentProspectImportBatches(organisationId, { showLoading: false })
    } catch (commitError) {
      setRecentImportError(commitError?.message || 'Prospect import could not be committed.')
    } finally {
      setRecentImportAction({ batchId: '', action: '' })
    }
  }

  const loadData = useCallback(async ({ showLoading = true, preserveOnError = false } = {}) => {
    if (showLoading) setLoading(true)
    if (!preserveOnError) setError('')
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
        setRecentImportBatches([])
        return
      }
      const importSettingsPromise = fetchOrganisationSettings({ forceRefresh: true })
        .then((response) => {
          const nextOrganisationSettings = response?.organisationSettings || response || {}
          return {
            settings: normalizeProspectBulkUploadSettings(nextOrganisationSettings.commercialWorkspace?.bulkUpload),
            error: '',
          }
        })
        .catch((settingsError) => ({
          settings: DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS,
          error: settingsError?.message || 'Prospect import settings could not be loaded.',
        }))
      const [workspace, nextLookups, nextImportSettings] = await Promise.all([
        nextOrganisationId ? listCommercialCanvassingWorkspace(nextOrganisationId) : Promise.resolve({ prospects: [], activities: [] }),
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : Promise.resolve({}),
        importSettingsPromise,
      ])
      setOrganisationId(nextOrganisationId)
      setProspects(Array.isArray(workspace?.prospects) ? workspace.prospects : [])
      setActivities(Array.isArray(workspace?.activities) ? workspace.activities : [])
      setLookups(nextLookups || {})
      setProspectImportSettings(nextImportSettings.settings)
      setProspectImportSettingsError(nextImportSettings.error)
      void loadRecentProspectImportBatches(nextOrganisationId, { showLoading: false })
    } catch (loadError) {
      if (!preserveOnError) {
        setError(loadError?.message || 'Commercial canvassing could not be loaded.')
        setProspects([])
        setActivities([])
        setLookups({})
        setRecentImportBatches([])
        setProspectImportSettings(DEFAULT_PROSPECT_BULK_UPLOAD_SETTINGS)
      }
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [loadRecentProspectImportBatches])

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
      role: pageView.key === 'lease' || pageView.key === 'sale' ? roleFilter : pageView.showDepartmentTabs ? 'all' : roleFilter,
      category: categoryFilter,
      assigned: brokerFilter,
    })
      .filter((prospect) => statusFilter === 'all' || (
        pageView.key === 'lease' || pageView.key === 'sale'
          ? normalizeKey(getLeaseStatusLabel(prospect.stageLabel || prospect.status)) === normalizeKey(statusFilter)
          : normalizeKey(prospect.stageLabel || prospect.status) === normalizeKey(statusFilter)
      ))
      .filter((prospect) => methodFilter === 'all' || normalizeKey(prospect.sourceLabel || prospect.canvassingMethod || prospect.source) === normalizeKey(methodFilter))
      .filter((prospect) => isWithinRelativeDate(prospect.createdAt || prospect.created_at, dateAddedFilter))
      .filter((prospect) => isWithinRelativeDate(prospect.lastActivity?.activityDate || prospect.lastActivity?.createdAt, lastContactFilter))

    if (pageView.key === 'lease' || pageView.key === 'sale') {
      return rows
    }

    return pageView.showDepartmentTabs
      ? rows.filter((prospect) => activeTabConfig.matches(prospect))
      : rows
  }, [activeTabConfig, brokerFilter, categoryFilter, dateAddedFilter, dealFilter, lastContactFilter, methodFilter, normalizedProspects, pageView.baseDealType, pageView.key, pageView.showDepartmentTabs, roleFilter, search, statusFilter])

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
    const activeProspects = pageScopedProspects.filter((prospect) => !['archived', 'lost', 'closed'].includes(normalizeKey(prospect.status)))
    return {
      total: activeProspects.length,
      landlords: activeProspects.filter((prospect) => normalizeKey(prospect.prospectRole) === 'landlord').length,
      tenants: activeProspects.filter((prospect) => normalizeKey(prospect.prospectRole) === 'tenant').length,
      sellers: activeProspects.filter((prospect) => normalizeKey(prospect.prospectRole) === 'seller').length,
      buyers: activeProspects.filter((prospect) => normalizeKey(prospect.prospectRole) === 'buyer').length,
      qualified: activeProspects.filter((prospect) => getLeaseStatusLabel(prospect.status || prospect.stageLabel) === 'Qualified').length,
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
      sellers: buildSeries((row) => normalizeKey(row.prospectRole) === 'seller' && isOpenProspect(row)),
      buyers: buildSeries((row) => normalizeKey(row.prospectRole) === 'buyer' && isOpenProspect(row)),
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

  const importSummary = useMemo(() => {
    return importRows.reduce((summary, row) => {
      summary.total += 1
      summary[row.status] = (summary[row.status] || 0) + 1
      return summary
    }, { total: 0, ready: 0, warning: 0, skipped: 0, invalid: 0, created: 0, failed: 0, staged: 0 })
  }, [importRows])

  const rejectedImportRows = useMemo(
    () => importRows.filter((row) => ['skipped', 'invalid', 'failed'].includes(row.status)),
    [importRows],
  )

  const duplicateImportRows = useMemo(
    () => importRows.filter((row) => row.status === 'skipped'),
    [importRows],
  )

  function resetImportState() {
    setImportFileName('')
    setImportRows([])
    setImportError('')
    setImportAudit({ batches: [], warning: '', unsupportedRows: 0 })
    if (importFileInputRef.current) importFileInputRef.current.value = ''
  }

  function openImportModal() {
    resetImportState()
    setImportOpen(true)
  }

  function handleDownloadProspectTemplate() {
    downloadTextFile('arch9-prospect-import-template.csv', buildProspectImportTemplateCsv())
  }

  function buildExistingImportKeys() {
    const keys = new Set()
    normalizedProspects.forEach((prospect) => {
      const role = normalizeImportRole(prospect.prospectRole) || normalizeKey(prospect.prospectRole)
      const email = normalizeText(prospect.email).toLowerCase()
      const phone = normalizeImportPhone(prospect.phone)
      const company = normalizeKey(prospect.companyName)
      if (role && email) keys.add(`email:${role}:${email}`)
      if (role && phone) keys.add(`phone:${role}:${phone}`)
      if (role && company) keys.add(`company:${role}:${company}`)
    })
    return keys
  }

  function getImportDuplicateKeys(payload = {}) {
    const role = normalizeImportRole(payload.prospectRole) || normalizeKey(payload.prospectRole)
    const email = normalizeText(payload.email).toLowerCase()
    const phone = normalizeImportPhone(payload.phone)
    const company = normalizeKey(payload.companyName)
    return [
      role && email ? `email:${role}:${email}` : '',
      role && phone ? `phone:${role}:${phone}` : '',
      role && company ? `company:${role}:${company}` : '',
    ].filter(Boolean)
  }

  function getBrokerFromImport(value = '') {
    const text = normalizeText(value)
    if (!text) return null
    const key = normalizeKey(text)
    return brokerOptions.find((option) => (
      normalizeText(option.value) === text ||
      normalizeKey(option.label) === key ||
      normalizeKey(option.email) === key
    )) || null
  }

  function validateImportPayload(payload = {}, settings = prospectImportSettings) {
    const errors = []
    const warnings = []
    const role = normalizeImportRole(payload.prospectRole) || normalizeKey(payload.prospectRole)
    const email = normalizeText(payload.email)
    const followUpDate = normalizeText(payload.nextFollowUpDate)
    const recordType = getProspectImportRecordTypeForRole(role)

    if (!settings.enabled) errors.push('Bulk uploads are disabled in Commercial settings')
    if (!normalizeText(payload.companyName) && !normalizeText(payload.contactName)) errors.push('Missing company or contact name')
    if (!normalizeText(payload.phone) && !email) errors.push('Missing phone or email')
    if (!role) errors.push('Missing valid prospect role')
    if (recordType && !isProspectImportRoleAllowed(role, settings)) errors.push(`${getRoleLabel(role)} prospect imports are disabled in Bulk Upload settings`)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email format')
    if (followUpDate && !normalizeImportDate(followUpDate)) errors.push('Invalid follow-up date')

    if (!normalizeText(payload.area)) warnings.push('Area is blank')
    if (!normalizeText(payload.propertyType) && !normalizeText(payload.propertyCategory)) warnings.push('Property category is blank')
    if (settings.defaultOwnerMode !== 'unassigned' && !normalizeText(payload.assignedBrokerId)) warnings.push('No broker assigned')
    if (!normalizeText(payload.nextFollowUpDate)) warnings.push('No follow-up date')

    return { errors, warnings }
  }

  function decorateImportRows(rows = [], settings = prospectImportSettings) {
    const existingKeys = buildExistingImportKeys()
    const seenKeys = new Set()

    return rows.map((row) => {
      const payload = row.payload || {}
      const { errors, warnings } = validateImportPayload(payload, settings)
      const duplicateKeys = getImportDuplicateKeys(payload)
      const duplicate = duplicateKeys.some((key) => existingKeys.has(key) || seenKeys.has(key))
      const status = errors.length ? 'invalid' : duplicate ? 'skipped' : warnings.length ? 'warning' : 'ready'
      if (status === 'ready' || status === 'warning') duplicateKeys.forEach((key) => seenKeys.add(key))
      return {
        ...row,
        status,
        errors,
        warnings,
        reason: errors.join(', ') || (duplicate ? 'Duplicate email, phone, or company for this role' : warnings.join(', ')),
      }
    })
  }

  function mapCsvRowsToImportRows(csvRows = [], fileName = '') {
    const [headers = [], ...bodyRows] = csvRows
    const headerKeys = headers.map(normalizeImportHeader)
    if (!headerKeys.some(Boolean)) throw new Error('The CSV needs a header row.')

    const mappedRows = bodyRows.map((cells, index) => {
      const source = {}
      headerKeys.forEach((key, cellIndex) => {
        if (key) source[key] = normalizeText(cells[cellIndex])
      })

      const companyName = getImportValue(source, ['Company Name', 'Company', 'Owner / Company Name', 'Business Name'])
      const contactName = getImportValue(source, ['Contact Name', 'Contact', 'Contact Person', 'Decision Maker'])
      const phone = getImportValue(source, ['Phone', 'Mobile', 'Cell', 'Cell Number', 'Contact Number'])
      const email = getImportValue(source, ['Email', 'Email Address', 'Contact Email'])
      const role = normalizeImportRole(getImportValue(source, ['Prospect Role', 'Role', 'Prospect Type', 'Lead Type']))
      const categoryRaw = getImportValue(source, ['Property Category', 'Property Type', 'Asset Class', 'Category'])
      const categoryKey = categoryRaw ? normalizeKey(categoryRaw).replace(/[^a-z0-9]+/g, '_') : ''
      const brokerMatch = getBrokerFromImport(getImportValue(source, ['Assigned Broker', 'Broker', 'Agent', 'Assigned Agent']))
      const payload = {
        companyName,
        contactName,
        phone,
        email,
        prospectType: role ? `${getRoleLabel(role)} Prospect` : '',
        prospectRole: role,
        dealType: role ? getDealTypeFromRole(role) : '',
        propertyCategory: categoryKey,
        propertyType: categoryRaw ? getPropertyCategoryLabel(categoryKey) : '',
        area: getImportValue(source, ['Area', 'Suburb', 'Node', 'Region']),
        status: normalizeImportStatus(getImportValue(source, ['Status', 'Stage'])),
        canvassingMethod: getImportValue(source, ['Source', 'Canvassing Method', 'Method']) || 'Existing Database',
        assignedBrokerId: brokerMatch?.value || '',
        assignedBrokerName: brokerMatch?.label || '',
        nextFollowUpDate: normalizeImportDate(getImportValue(source, ['Next Follow Up Date', 'Follow Up Date', 'Next Action Date'])),
        followUpPriority: normalizeImportPriority(getImportValue(source, ['Priority', 'Follow Up Priority'])),
        notes: getImportValue(source, ['Notes', 'Note', 'Comments']),
        metadata: {
          importSource: 'prospect_csv_phase1',
          importRowNumber: index + 2,
          importFileName: fileName,
        },
      }

      return {
        id: `import-row-${index + 2}`,
        rowNumber: index + 2,
        source,
        payload,
        status: 'ready',
        errors: [],
        warnings: [],
        reason: '',
      }
    })

    return decorateImportRows(mappedRows)
  }

  function updateImportRowPayload(rowId = '', patch = {}) {
    setImportRows((current) => {
      const updated = current.map((row) => {
        if (row.id !== rowId) return row
        const nextPayload = { ...(row.payload || {}), ...patch }
        if (patch.prospectRole !== undefined) {
          const role = normalizeImportRole(patch.prospectRole) || normalizeKey(patch.prospectRole)
          nextPayload.prospectRole = role
          nextPayload.dealType = role ? getDealTypeFromRole(role) : ''
          nextPayload.prospectType = role ? `${getRoleLabel(role)} Prospect` : ''
        }
        if (patch.propertyCategory !== undefined) {
          nextPayload.propertyType = getPropertyCategoryLabel(patch.propertyCategory)
        }
        if (patch.nextFollowUpDate !== undefined) {
          nextPayload.nextFollowUpDate = normalizeImportDate(patch.nextFollowUpDate) || normalizeText(patch.nextFollowUpDate)
        }
        return { ...row, payload: nextPayload }
      })
      return decorateImportRows(updated)
    })
  }

  function handleDownloadRejectedProspectRows() {
    if (!rejectedImportRows.length) return
    downloadTextFile('arch9-prospect-import-rejected-rows.csv', buildProspectRejectedRowsCsv(rejectedImportRows))
  }

  async function handleProspectImportFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportError('')
    setImportRows([])
    setImportAudit({ batches: [], warning: '', unsupportedRows: 0 })
    setImportFileName(file.name)
    try {
      if (!prospectImportSettings.enabled) {
        throw new Error('Bulk uploads are disabled in Commercial settings.')
      }
      if (!file.name.toLowerCase().endsWith('.csv')) {
        throw new Error('Please upload a CSV file for this first version.')
      }
      const text = await file.text()
      const csvRows = parseCsvText(text)
      if (csvRows.length < 2) throw new Error('The CSV needs a header row and at least one prospect row.')
      const dataRowCount = Math.max(0, csvRows.length - 1)
      if (dataRowCount > prospectImportSettings.maxRowsPerUpload) {
        throw new Error(`This CSV has ${dataRowCount} rows. The current bulk upload limit is ${prospectImportSettings.maxRowsPerUpload} rows.`)
      }
      setImportRows(mapCsvRowsToImportRows(csvRows, file.name))
    } catch (fileError) {
      setImportError(fileError?.message || 'Prospects could not be read from this CSV.')
    }
  }

  async function createProspectImportAuditBatches(rows = []) {
    const groups = rows.reduce((accumulator, row) => {
      const recordType = getProspectImportAuditRecordType(row)
      if (!recordType) return accumulator
      if (!accumulator[recordType]) accumulator[recordType] = []
      accumulator[recordType].push(row)
      return accumulator
    }, {})
    const unsupportedRows = rows.filter((row) => !getProspectImportAuditRecordType(row)).length
    const batches = []

    for (const [recordType, groupedRows] of Object.entries(groups)) {
      const summary = summarizeProspectImportRows(groupedRows)
      const batch = await createCommercialImportBatch({
        organisationId,
        recordType,
        sourceType: 'csv',
        fileName: importFileName,
        fileMimeType: 'text/csv',
        duplicateStrategy: prospectImportSettings.duplicateStrategy,
        defaultOwnerMode: prospectImportSettings.defaultOwnerMode,
        requiresManagerApproval: prospectImportSettings.requireManagerApproval,
        totalRows: groupedRows.length,
        settingsSnapshot: {
          source: 'commercial_canvassing_prospect_import_phase_3',
          pageView: pageView.id,
          bulkUpload: prospectImportSettings,
        },
        columnMapping: PROSPECT_IMPORT_COLUMNS.reduce((mapping, column) => ({ ...mapping, [normalizeImportHeader(column)]: column }), {}),
        validationSummary: {
          phase: 'commercial_canvassing_prospect_import_phase_3',
          ...summary,
          unsupportedRows,
          requiresManagerApproval: prospectImportSettings.requireManagerApproval,
        },
        importSummary: {
          fileName: importFileName,
          recordType,
          status: 'preview_validated',
          ...summary,
        },
        metadata: {
          source: 'commercial_canvassing_prospect_import_phase_3',
          pageView: pageView.id,
          unsupportedRows,
          requiresManagerApproval: prospectImportSettings.requireManagerApproval,
        },
      })

      const createdAuditRows = []
      const rowPayloads = groupedRows.map(buildProspectImportAuditRowPayload)
      const chunkSize = 250
      for (let index = 0; index < rowPayloads.length; index += chunkSize) {
        const createdChunk = await createCommercialImportRows(batch.id, rowPayloads.slice(index, index + chunkSize))
        createdAuditRows.push(...createdChunk)
      }

      await updateCommercialImportBatch(batch.id, {
        status: prospectImportSettings.requireManagerApproval ? 'approval_pending' : 'ready',
        totalRows: summary.totalRows,
        validRows: summary.validRows,
        warningRows: summary.warningRows,
        invalidRows: summary.invalidRows,
        skippedCount: summary.skippedRows,
        validationSummary: {
          phase: 'commercial_canvassing_prospect_import_phase_3',
          ...summary,
          unsupportedRows,
          requiresManagerApproval: prospectImportSettings.requireManagerApproval,
        },
        importSummary: {
          fileName: importFileName,
          recordType,
          status: prospectImportSettings.requireManagerApproval ? 'approval_pending' : 'ready_for_direct_commit',
          ...summary,
          unsupportedRows,
          requiresManagerApproval: prospectImportSettings.requireManagerApproval,
        },
      })

      batches.push({
        ...batch,
        recordType,
        rowCount: groupedRows.length,
        rowsByLocalId: new Map(createdAuditRows.map((auditRow) => [auditRow.metadata?.importRowId, auditRow])),
      })
    }

    return { batches, unsupportedRows }
  }

  function getAuditRowForImportRow(auditContext = {}, rowId = '') {
    for (const batch of auditContext.batches || []) {
      const auditRow = batch.rowsByLocalId?.get(rowId)
      if (auditRow) return auditRow
    }
    return null
  }

  async function finalizeProspectImportAuditBatches(auditContext = {}, sourceRows = [], createdByRowId = new Map(), failedRows = new Map()) {
    const batches = auditContext.batches || []
    if (!batches.length) return

    const sourceRowsById = new Map(sourceRows.map((row) => [row.id, row]))
    const updates = []
    batches.forEach((batch) => {
      batch.rowsByLocalId?.forEach((auditRow, localRowId) => {
        const sourceRow = sourceRowsById.get(localRowId)
        const created = createdByRowId.get(localRowId)
        const failedMessage = failedRows.get(localRowId)
        if (created?.id) {
          updates.push(updateCommercialImportRow(auditRow.id, {
            status: 'created',
            action: 'create',
            targetTable: 'commercial_canvassing_prospects',
            targetRecordId: created.id,
            errorMessage: '',
            processedAt: new Date().toISOString(),
            metadata: {
              ...(auditRow.metadata || {}),
              createdProspectId: created.id,
            },
          }))
          return
        }
        if (failedMessage) {
          updates.push(updateCommercialImportRow(auditRow.id, {
            status: 'failed',
            action: 'create',
            targetTable: 'commercial_canvassing_prospects',
            errorMessage: failedMessage,
            processedAt: new Date().toISOString(),
          }))
          return
        }
        if (sourceRow?.status === 'skipped' || sourceRow?.status === 'invalid') {
          updates.push(updateCommercialImportRow(auditRow.id, {
            status: sourceRow.status,
            action: sourceRow.status === 'skipped' ? 'skip' : 'review',
            errorMessage: sourceRow.reason,
            processedAt: sourceRow.status === 'skipped' ? new Date().toISOString() : null,
          }))
        }
      })
    })

    const chunkSize = 50
    for (let index = 0; index < updates.length; index += chunkSize) {
      await Promise.all(updates.slice(index, index + chunkSize))
    }

    for (const batch of batches) {
      const batchLocalRows = Array.from(batch.rowsByLocalId?.keys() || []).map((localRowId) => sourceRowsById.get(localRowId)).filter(Boolean)
      const summary = summarizeProspectImportRows(batchLocalRows.map((row) => {
        if (createdByRowId.has(row.id)) return { ...row, status: 'created' }
        if (failedRows.has(row.id)) return { ...row, status: 'failed' }
        return row
      }))
      await updateCommercialImportBatch(batch.id, {
        status: summary.failedRows && !summary.createdRows ? 'failed' : 'committed',
        totalRows: summary.totalRows,
        validRows: summary.validRows,
        warningRows: summary.warningRows,
        invalidRows: summary.invalidRows,
        createdCount: summary.createdRows,
        skippedCount: summary.skippedRows,
        failedCount: summary.failedRows,
        importSummary: {
          fileName: importFileName,
          recordType: batch.recordType,
          phase: 'commercial_canvassing_prospect_import_phase_3',
          status: summary.failedRows && !summary.createdRows ? 'failed' : 'committed',
          committedAt: new Date().toISOString(),
          ...summary,
          unsupportedRows: auditContext.unsupportedRows || 0,
        },
      })
    }
  }

  async function handleCommitProspectImport() {
    const readyRows = importRows.filter((row) => row.status === 'ready' || row.status === 'warning')
    if (!organisationId || !readyRows.length) return
    if (!prospectImportSettings.enabled) {
      setImportError('Bulk uploads are disabled in Commercial settings.')
      return
    }

    setBusyAction('import')
    setImportError('')
    setError('')
    try {
      const createdRows = []
      const createdByRowId = new Map()
      const failedRows = new Map()
      let auditContext = { batches: [], unsupportedRows: 0 }
      const stagedRowIds = new Set()

      try {
        auditContext = await createProspectImportAuditBatches(importRows)
        setImportAudit({ ...auditContext, warning: '' })
      } catch (auditError) {
        if (prospectImportSettings.requireManagerApproval) {
          throw auditError
        }
        setImportAudit({
          batches: [],
          unsupportedRows: 0,
          warning: auditError?.message || 'Import audit trail could not be created, but the prospect import can continue.',
        })
      }

      const directCreateRows = readyRows.filter((row) => {
        const auditRow = getAuditRowForImportRow(auditContext, row.id)
        const shouldStageForApproval = prospectImportSettings.requireManagerApproval && auditRow
        if (shouldStageForApproval) stagedRowIds.add(row.id)
        return !shouldStageForApproval
      })

      for (const row of directCreateRows) {
        try {
          const auditRow = getAuditRowForImportRow(auditContext, row.id)
          const created = await createCommercialCanvassingProspect(organisationId, {
            ...row.payload,
            metadata: {
              ...(row.payload?.metadata || {}),
              commercialImportSource: 'commercial_canvassing_prospect_import_phase_3',
              commercialImportBatchId: auditRow?.batchId || '',
              commercialImportRowId: auditRow?.id || '',
            },
          })
          createdRows.push(created)
          createdByRowId.set(row.id, created)
        } catch (rowError) {
          failedRows.set(row.id, rowError?.message || 'Could not create this prospect.')
        }
      }

      if (auditContext.batches?.length && !prospectImportSettings.requireManagerApproval) {
        try {
          await finalizeProspectImportAuditBatches(auditContext, importRows, createdByRowId, failedRows)
        } catch (auditFinalizeError) {
          setImportAudit((current) => ({
            ...current,
            warning: auditFinalizeError?.message || 'Prospects were imported, but the import audit outcome could not be updated.',
          }))
        }
      }

      setImportRows((current) => current.map((row) => {
        if (failedRows.has(row.id)) return { ...row, status: 'failed', reason: failedRows.get(row.id) }
        if (createdByRowId.has(row.id)) return { ...row, status: 'created', reason: '' }
        if (stagedRowIds.has(row.id)) return { ...row, status: 'staged', reason: 'Staged for manager approval in Bulk Upload review' }
        return row
      }))

      if (createdRows.length) {
        setProspects((current) => [
          ...createdRows,
          ...current.filter((row) => !createdRows.some((created) => normalizeText(created.id) === normalizeText(row.id))),
        ])
      }

      const failedCount = failedRows.size
      const auditCount = auditContext.batches?.length || 0
      const unsupportedAudit = auditContext.unsupportedRows || 0
      const stagedCount = stagedRowIds.size
      setMessage(`${createdRows.length} prospects imported${stagedCount ? ` · ${stagedCount} staged for manager approval` : ''}${failedCount ? `, ${failedCount} failed` : ''}${auditCount ? ` · ${auditCount} audit ${auditCount === 1 ? 'batch' : 'batches'} saved` : ''}${unsupportedAudit ? ` · ${unsupportedAudit} rows imported without audit support` : ''}.`)
      if (!failedCount) setImportOpen(false)
      await loadData({ showLoading: false, preserveOnError: true })
      void loadRecentProspectImportBatches(organisationId, { showLoading: false })
    } catch (commitError) {
      setImportError(commitError?.message || 'Prospect import could not be completed.')
    } finally {
      setBusyAction('')
    }
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

  function updateCreateAddressField(textField, valueField, value) {
    setCreateDraft((current) => {
      const nextValue = value || null
      const next = {
        ...current,
        [valueField]: nextValue,
        [textField]: nextValue?.formattedAddress || '',
      }
      if (textField === 'propertyAddress' && nextValue?.suburb && !current.preferredArea) {
        next.preferredArea = nextValue.suburb
        next.preferredAreaValue = {
          formattedAddress: nextValue.suburb,
          suburb: nextValue.suburb,
          city: nextValue.city,
          province: nextValue.province,
          country: nextValue.country,
          placeId: nextValue.placeId,
          googlePlaceId: nextValue.googlePlaceId || nextValue.placeId,
          geocodingStatus: nextValue.geocodingStatus,
        }
      }
      return next
    })
    setCreateErrors((current) => ({ ...current, [textField]: '' }))
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
          preferredAreaValue: null,
          spaceRequirement: '',
          sizeRange: '',
          budgetRange: '',
          reasonForSelling: '',
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
          propertyAddressValue: null,
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
          propertyAddressValue: null,
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
        propertyAddressValue: null,
        propertyName: '',
        portfolioName: '',
        lookingFor: '',
        preferredArea: '',
        preferredAreaValue: null,
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
          ? normalizeText(createDraft.preferredArea || createDraft.propertyAddress || createDraft.propertyName || createDraft.portfolioName)
          : ''

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
        targetPurchaseTimeline: normalizeText(createDraft.targetPurchaseTimeline),
        leaseTimeline: normalizeText(createDraft.leaseTimeline),
        vacancyDetails: normalizeText(createDraft.vacancyDetails),
        industry: normalizeText(createDraft.industry),
        currentAddress: role === 'tenant' ? null : '',
        areaNode: normalizeText(createDraft.preferredArea),
        assetClassInterest: role === 'tenant' ? propertyCategory : '',
        estimatedSaleValue: normalizeText(createDraft.estimatedSaleValue),
        estimatedMonthlyRental: normalizeText(createDraft.estimatedMonthlyRental),
        estimatedAnnualRental: normalizeText(createDraft.estimatedAnnualRental),
        propertyAddressDetails: compactCommercialAddressPayload(createDraft.propertyAddressValue),
        preferredAreaAddress: role === 'tenant' ? null : compactCommercialAddressPayload(createDraft.preferredAreaValue),
      },
    }
  }

  async function submitCreateProspect({ addAnother = false } = {}) {
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
      if (addAnother) {
        resetCreateDraft(payload.prospectRole || pageView.defaultCreateRole)
      } else {
        setCreateOpen(false)
        setCreateStep(2)
        setCreateErrors({})
      }
      setMessage(`${getRoleLabel(payload.prospectRole)} prospect added.`)
      void loadData({ showLoading: false, preserveOnError: true })
    } catch (createError) {
      setError(createError?.message || 'Commercial canvassing prospect could not be created.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleCreateProspect(event) {
    event.preventDefault()
    await submitCreateProspect()
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
        requirementId: normalizeText(selectedProspect.requirementId),
        dealId: normalizeText(selectedProspect.dealId),
        linkedEntityType: normalizeText(selectedProspect.linkedEntityType),
        linkedEntityId: normalizeText(selectedProspect.linkedEntityId),
        convertedRequirementId: normalizeText(selectedProspect.convertedRequirementId),
        convertedDealId: normalizeText(selectedProspect.convertedDealId),
        convertedContactId: normalizeText(selectedProspect.convertedContactId),
        convertedCompanyId: normalizeText(selectedProspect.convertedCompanyId),
      })
      setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || selectedProspect) : row))
      setMessage('Prospect saved.')
      void loadData({ showLoading: false, preserveOnError: true })
    } catch (saveError) {
      setError(saveError?.message || 'Commercial canvassing prospect could not be saved.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleUpdateProspectStatus(prospect, nextStatus = 'Contacted') {
    if (!organisationId || !prospect) return
    setBusyAction(`status-${prospect.id}`)
    setError('')
    try {
      const updated = await updateCommercialCanvassingProspect(organisationId, prospect.id, {
        ...prospect,
        status: nextStatus,
        followUpNote: nextStatus === 'Contacted' ? `Contacted from ${pageView.key === 'sale' ? 'sales' : 'leasing'} prospects table` : prospect.followUpNote,
      })
      setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(prospect.id) ? (updated || { ...prospect, status: nextStatus }) : row))
      setMessage(`Prospect marked ${getLeaseStatusLabel(nextStatus).toLowerCase()}.`)
      void createCommercialCanvassingActivity(organisationId, {
        prospectId: prospect.id,
        brokerId: prospect.assignedBrokerId || '',
        brokerName: prospect.assignedBrokerName || pickLookupLabel(brokerOptions, prospect.assignedBrokerId, ''),
        activityType: 'Note',
        activityNote: `Status updated to ${nextStatus}`,
        outcome: nextStatus,
        activityDate: new Date().toISOString(),
      })
      void loadData({ showLoading: false, preserveOnError: true })
    } catch (statusError) {
      setError(statusError?.message || 'Prospect status could not be updated.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleConvertProspectToLead(prospect) {
    if (!prospect) return
    await handleConvert('requirement', prospect)
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
      void loadData({ showLoading: false, preserveOnError: true })
    } catch (activityError) {
      setError(activityError?.message || 'Activity could not be logged.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleConvert(type, prospectOverride = null) {
    const targetProspect = prospectOverride || selectedProspect
    if (!organisationId || !targetProspect) return
    setBusyAction(`convert-${type}`)
    setError('')
    try {
      const brokerId = normalizeText(targetProspect.assignedBrokerId || createDraft.assignedBrokerId || brokerOptions[0]?.value || '')
      const companyId = normalizeText(targetProspect.companyId)
      const contactId = normalizeText(targetProspect.contactId)
      let resolvedCompanyId = companyId
      let resolvedContactId = contactId

      if (type === 'contact') {
        if (!resolvedCompanyId) {
          const company = await createCommercialCompany({
            organisation_id: organisationId,
            company_name: normalizeText(targetProspect.companyName) || normalizeText(targetProspect.contactName) || 'Canvassed company',
            broker_id: brokerId || targetProspect.assignedBrokerId || brokerOptions[0]?.value || '',
            status: 'prospect',
            notes: normalizeText(targetProspect.notes) || 'Created from canvassing prospect',
          })
          resolvedCompanyId = company.id
        }
        if (!resolvedCompanyId) {
          throw new Error('A company is required before creating a contact from this canvassing prospect.')
        }
        const contactName = splitContactName(targetProspect.contactName || targetProspect.companyName || 'Prospect Contact')
        const contact = await createCommercialContact({
          organisation_id: organisationId,
          company_id: resolvedCompanyId,
          broker_id: brokerId,
          first_name: contactName.firstName || normalizeText(targetProspect.firstName) || 'Commercial',
          last_name: contactName.lastName || normalizeText(targetProspect.lastName) || 'Prospect',
          email: normalizeText(targetProspect.email) || null,
          phone: normalizeText(targetProspect.phone) || null,
          status: 'active',
          notes: normalizeText(targetProspect.notes) || 'Created from commercial canvassing',
        })
        resolvedContactId = contact.id
      }

      if (type === 'requirement') {
        const requirementAddressPayload = commercialAddressPayload(getProspectAreaAddress(targetProspect))
        const createdRequirement = await createCommercialRequirement({
          organisation_id: organisationId,
          company_id: resolvedCompanyId || null,
          contact_id: resolvedContactId || null,
          requirement_name: `${getProspectDisplayName(targetProspect)} Lead`,
          requirement_type: inferRequirementType(targetProspect),
          client_type: inferClientType(targetProspect),
          property_type: normalizeText(targetProspect.propertyType) || null,
          preferred_locations: normalizeText(targetProspect.area) ? [normalizeText(targetProspect.area)] : [],
          ...requirementAddressPayload,
          budget_min: 0,
          budget_max: Number(targetProspect.estimatedValue || 0) || null,
          target_occupation_date: normalizeText(targetProspect.nextFollowUpDate) || null,
          assigned_broker: brokerId,
          broker_id: brokerId,
          stage: 'new_requirement',
          status: 'active',
          notes: normalizeText(targetProspect.notes) || null,
          special_requirements: normalizeText(targetProspect.followUpNote) || null,
        })
        const updated = await updateCommercialCanvassingProspect(organisationId, targetProspect.id, {
          ...targetProspect,
          status: 'Converted to Lead',
          linkedEntityType: 'commercial_requirement',
          linkedEntityId: createdRequirement.id,
          requirementId: createdRequirement.id,
          companyId: resolvedCompanyId || targetProspect.companyId,
          contactId: resolvedContactId || targetProspect.contactId,
          convertedRequirementId: createdRequirement.id,
        })
        setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(targetProspect.id) ? (updated || targetProspect) : row))
        setMessage('Prospect converted to a lead.')
      } else if (type === 'deal') {
        const dealAddressPayload = commercialAddressPayload(getProspectAreaAddress(targetProspect))
        const createdDeal = await createCommercialDeal({
          organisation_id: organisationId,
          company_id: resolvedCompanyId || null,
          contact_id: resolvedContactId || null,
          deal_name: `${getProspectDisplayName(targetProspect)} Deal`,
          deal_type: inferDealType(targetProspect),
          requirement_id: normalizeText(targetProspect.requirementId) || null,
          property_id: normalizeText(targetProspect.propertyId) || null,
          vacancy_id: normalizeText(targetProspect.vacancyId) || null,
          listing_id: normalizeText(targetProspect.listingId) || null,
          ...dealAddressPayload,
          assigned_broker: brokerId,
          broker_id: brokerId,
          stage: 'new',
          status: 'active',
          deal_value: Number(targetProspect.estimatedValue || 0) || null,
          expected_close_date: normalizeText(targetProspect.nextFollowUpDate) || null,
          notes: normalizeText(targetProspect.notes) || null,
        })
        const updated = await updateCommercialCanvassingProspect(organisationId, targetProspect.id, {
          ...targetProspect,
          status: 'Converted to Deal',
          linkedEntityType: 'commercial_deal',
          linkedEntityId: createdDeal.id,
          companyId: resolvedCompanyId || targetProspect.companyId,
          contactId: resolvedContactId || targetProspect.contactId,
          convertedDealId: createdDeal.id,
        })
        setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(targetProspect.id) ? (updated || targetProspect) : row))
        setMessage('Prospect converted to a deal.')
      } else if (type === 'contact') {
        const updated = await updateCommercialCanvassingProspect(organisationId, targetProspect.id, {
          ...targetProspect,
          status: 'Converted to Contact',
          linkedEntityType: 'commercial_contact',
          linkedEntityId: resolvedContactId,
          companyId: resolvedCompanyId || targetProspect.companyId,
          contactId: resolvedContactId,
          convertedContactId: resolvedContactId,
          convertedCompanyId: resolvedCompanyId,
        })
        setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(targetProspect.id) ? (updated || targetProspect) : row))
        setMessage('Contact created from canvassing prospect.')
      }

      await createCommercialCanvassingActivity(organisationId, {
        prospectId: targetProspect.id,
        brokerId,
        brokerName: targetProspect.assignedBrokerName || pickLookupLabel(brokerOptions, brokerId, ''),
        activityType: 'Note',
        activityNote: type === 'requirement' ? 'Converted to commercial lead' : `Converted to ${type}`,
        outcome: type === 'requirement' ? 'lead' : type,
        activityDate: new Date().toISOString(),
      })
      void loadData({ showLoading: false, preserveOnError: true })
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

  const isFocusedCreateFlow = pageView.key === 'lease' || pageView.key === 'sale'
  const createModalTitle = pageView.key === 'sale' ? 'New Sales Canvassing Record' : 'New Canvassing Record'
  const createModalSubtitle = pageView.key === 'sale'
    ? 'Capture a potential seller or buyer. Qualify them later to convert into a sales lead.'
    : 'Capture basic details of a potential landlord or tenant. Qualify them later to convert into a lead.'
  const createModal = isFocusedCreateFlow ? (
    <Modal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      title={createModalTitle}
      subtitle={createModalSubtitle}
      className="max-w-[1140px]"
      footer={(
        <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} className="h-11 w-full rounded-[8px] sm:w-auto sm:min-w-[96px]">
            Cancel
          </Button>
          <Button type="submit" form="commercial-canvassing-create-form" disabled={busyAction === 'create'} className="h-11 w-full rounded-[8px] bg-[#082f56] text-white hover:bg-[#0b3d70] sm:w-auto sm:min-w-[150px]">
            {busyAction === 'create' ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
    >
      <form id="commercial-canvassing-create-form" onSubmit={handleCreateProspect} className="min-h-0">
        <div className="min-w-0">
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:max-w-[640px]">
            {pageView.key === 'sale' ? (
              <>
                <LeaseRoleTab
                  active={createRole === 'seller'}
                  icon={Building2}
                  label="Seller (Property)"
                  onClick={() => updateCreateRole('seller')}
                />
                <LeaseRoleTab
                  active={createRole === 'buyer'}
                  icon={Users}
                  label="Buyer (Requirement)"
                  onClick={() => updateCreateRole('buyer')}
                />
              </>
            ) : (
              <>
                <LeaseRoleTab
                  active={createRole === 'landlord'}
                  icon={Building2}
                  label="Landlord (Property)"
                  onClick={() => updateCreateRole('landlord')}
                />
                <LeaseRoleTab
                  active={createRole === 'tenant'}
                  icon={Users}
                  label="Tenant (Company)"
                  onClick={() => updateCreateRole('tenant')}
                />
              </>
            )}
          </div>

          {createRole === 'seller' ? renderSalesSellerFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) : null}
          {createRole === 'buyer' ? renderSalesBuyerFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) : null}
          {createRole === 'landlord' ? renderLeaseLandlordFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) : null}
          {createRole === 'tenant' ? renderLeaseTenantFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) : null}
        </div>
      </form>
    </Modal>
  ) : (
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
      <form id="commercial-canvassing-create-form" onSubmit={handleCreateProspect} className="min-h-0">
        <div className="grid min-h-0 gap-0 lg:grid-cols-[340px_minmax(0,1fr)]">
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

          <div className="min-h-0 bg-white">
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
                    createDraft.lookingFor || createDraft.spaceRequirement || createDraft.vacancyDetails || 'No detail captured',
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
                  {createRole === 'seller' ? renderSellerFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) : null}
                  {createRole === 'buyer' ? renderBuyerFields({ createDraft, createErrors, updateCreateDraftField, updateCreateAddressField, brokerOptions }) : null}
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

  const advancedFilterCount = [
    categoryFilter,
    methodFilter,
    dateAddedFilter,
    lastContactFilter,
    search,
    roleFilter,
    brokerFilter,
    statusFilter,
  ].filter((value) => normalizeText(value) && value !== 'all').length
  const shouldShowAdvancedFilters = showAdvancedFilters || advancedFilterCount > 0
  const isFocusedCanvassingView = pageView.key === 'lease' || pageView.key === 'sale'
  const primaryCreateRole = pageView.key === 'sale' ? 'seller' : 'landlord'
  const secondaryCreateRole = pageView.key === 'sale' ? 'buyer' : 'tenant'
  const primaryCreateLabel = pageView.key === 'sale' ? 'Add Seller' : 'Add Landlord'
  const secondaryCreateLabel = pageView.key === 'sale' ? 'Add Buyer' : 'Add Tenant'
  const focusedProspectNoun = pageView.key === 'sale' ? 'sales prospects' : 'lease prospects'
  const hasAnyProspects = pageScopedProspects.length > 0
  const tableTotalCount = sortedProspects.length
  const tableStart = tableTotalCount ? 1 : 0
  const tableEnd = tableTotalCount
  const currentSortLabel = SORT_OPTIONS.find((option) => option.value === `${sortKey}:${sortDirection}`)?.label || 'Newest Updated'
  const tableColumnLabels = isFocusedCanvassingView
    ? ['Prospect', 'Type', 'Asset Class', 'Area / Asset', 'Broker', 'Status', 'Last Contact', 'Actions']
    : ['Prospect', 'Type', 'Category', 'Source', 'Area / Asset', 'Stage / Next Step', 'Broker', 'Last Activity', 'Actions']
  const roleMetricCards = pageView.key === 'sale'
    ? [
        { label: 'Sellers', value: leaseRoleCounts.sellers, icon: Building2, trendLabel: '8%', series: kpiSeries.sellers, color: '#16a34a' },
        { label: 'Buyers', value: leaseRoleCounts.buyers, icon: Users, trendLabel: '18%', series: kpiSeries.buyers, color: '#8b5cf6' },
      ]
    : [
        { label: 'Landlords', value: leaseRoleCounts.landlords, icon: Building2, trendLabel: '8%', series: kpiSeries.landlords, color: '#16a34a' },
        { label: 'Tenants', value: leaseRoleCounts.tenants, icon: Users, trendLabel: '18%', series: kpiSeries.tenants, color: '#8b5cf6' },
      ]
  const emptyStateConfig = (() => {
    if (activeTab === 'followups') {
      return {
        icon: Clock3,
        title: 'No follow-ups due.',
        description: `${titleize(focusedProspectNoun)} follow-ups will appear here when a next action date is scheduled.`,
        actionLabel: pageView.key === 'sale' ? 'View All Sales Prospects' : 'View All Lease Prospects',
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
        description: `Try widening the category, broker, status, source, or search filters to bring more ${focusedProspectNoun} back into view.`,
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
      title: pageView.key === 'sale' ? 'No active sales prospects yet.' : 'No active lease prospects yet.',
      description: pageView.key === 'sale'
        ? 'Sales prospects will appear here once seller and buyer prospecting begins moving through the platform.'
        : 'Lease prospects will appear here once landlord and tenant prospecting begins moving through the platform.',
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
    const roleSpecific = prospect.roleSpecific || prospect.role_specific || {}
    return normalizeText(
      prospect.area ||
      prospect.propertyAddress ||
      prospect.preferredArea ||
      roleSpecific.areaNode ||
      roleSpecific.preferredArea ||
      roleSpecific.currentAddress ||
      roleSpecific.propertyAddress,
    ) || 'Area pending'
  }

  const getAssetLine = (prospect = {}) => {
    const roleSpecific = prospect.roleSpecific || prospect.role_specific || {}
    return normalizeText(
      prospect.propertyName ||
      prospect.portfolioName ||
      prospect.vacancyName ||
      prospect.lookingFor ||
      prospect.spaceRequirement ||
      roleSpecific.propertyAddress ||
      roleSpecific.propertyName ||
      roleSpecific.portfolioName ||
      roleSpecific.industry ||
      roleSpecific.currentAddress,
    ) || 'Asset pending'
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

          <article className={isFocusedCanvassingView ? 'space-y-6' : `${CARD_CLASS} overflow-hidden p-5 sm:p-6`}>
            <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h1 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#102236]">{pageView.title}</h1>
                <p className="mt-2 text-sm leading-6 text-[#4f6680]">{pageView.description}</p>
              </div>
              {isFocusedCanvassingView ? (
                pageView.key === 'lease' ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" onClick={() => openCreateModal(pageView.defaultCreateRole)} className="h-12 rounded-[10px] bg-[#082f56] px-5 shadow-[0_12px_28px_rgba(16,43,70,0.18)] hover:bg-[#0b3d70]">
                      <Plus size={16} />
                      Add Prospect
                    </Button>
                    <Button type="button" variant="secondary" onClick={openImportModal} className="h-12 rounded-[10px] px-5">
                      <Upload size={16} />
                      Import
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Button type="button" onClick={() => setCreateMenuOpen((current) => !current)} className="h-12 rounded-[10px] bg-[#082f56] px-5 shadow-[0_12px_28px_rgba(16,43,70,0.18)] hover:bg-[#0b3d70]">
                        <Plus size={16} />
                        Add Prospect
                        <ChevronRight size={15} className={`transition ${createMenuOpen ? 'rotate-90' : ''}`} />
                      </Button>
                      {createMenuOpen ? (
                        <div className="absolute right-0 top-14 z-30 w-44 overflow-hidden rounded-[12px] border border-[#dce6f0] bg-white py-1 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-[#102236] hover:bg-[#f7fafc]" onClick={() => { setCreateMenuOpen(false); openCreateModal(primaryCreateRole) }}>
                            <Building2 size={15} />
                            {primaryCreateLabel}
                          </button>
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-[#102236] hover:bg-[#f7fafc]" onClick={() => { setCreateMenuOpen(false); openCreateModal(secondaryCreateRole) }}>
                            <Users size={15} />
                            {secondaryCreateLabel}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <Button type="button" variant="secondary" onClick={openImportModal} className="h-12 rounded-[10px] px-5">
                      <Upload size={16} />
                      Import
                    </Button>
                  </div>
                )
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={() => openCreateModal(pageView.defaultCreateRole)} className="h-12 rounded-[14px] bg-[#102b46] px-5 shadow-[0_12px_28px_rgba(16,43,70,0.18)] hover:bg-[#143858]">
                    <Plus size={16} />
                    {pageView.createLabel.replace(/^\+\s*/, '')}
                  </Button>
                  <Button type="button" variant="secondary" onClick={openImportModal} className="h-12 rounded-[14px] px-5">
                    <Upload size={16} />
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
              )}
            </section>

            <section className={`${isFocusedCanvassingView ? 'rounded-[18px] border border-[#dce6f0] bg-white p-4 shadow-[0_12px_28px_rgba(15,35,55,0.05)]' : 'mt-6 rounded-[18px] border border-[#e2ebf4] bg-[#fbfdff] p-4'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#eef5ff] text-[#1f6dd5]">
                    <FileClock size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[#102236]">Recent Prospect Imports</h2>
                    <p className="mt-1 text-xs leading-5 text-[#60758d]">Track audited seller, buyer, landlord, and tenant prospect uploads created from this page.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void loadRecentProspectImportBatches(organisationId)}
                    disabled={recentImportsLoading || !organisationId}
                    className="h-10 rounded-[10px] px-3 text-xs"
                  >
                    <FileClock size={14} />
                    {recentImportsLoading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                  <Button asChild type="button" variant="secondary" className="h-10 rounded-[10px] px-3 text-xs">
                    <Link to="/commercial/settings/bulk-upload">
                      <ArrowRight size={14} />
                      Review All
                    </Link>
                  </Button>
                </div>
              </div>

              {recentImportError ? (
                <p className="mt-3 rounded-[12px] border border-[#f1d9ab] bg-[#fff9eb] px-3 py-2 text-xs font-semibold text-[#81550d]">{recentImportError}</p>
              ) : null}

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {recentImportsLoading && !recentImportBatches.length ? (
                  [0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-[14px] bg-[#eef3f7]" />)
                ) : recentImportBatches.length ? recentImportBatches.slice(0, 3).map((batch) => {
                  const tone = getImportBatchStatusTone(batch.status)
                  const issueCount = getProspectImportBatchIssueCount(batch)
                  const actionBusy = recentImportAction.batchId === batch.id
                  const canApprove = batch.status === 'approval_pending' || (batch.status === 'validated' && batch.requiresManagerApproval)
                  const canCommit = ['ready', 'approved', 'validated'].includes(normalizeKey(batch.status)) && (Number(batch.validRows || 0) + Number(batch.warningRows || 0) > 0)
                  return (
                    <article key={batch.id} className="rounded-[14px] border border-[#e2ebf4] bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#102236]">{batch.fileName || getProspectImportAuditBatchLabel(batch)}</p>
                          <p className="mt-1 text-xs text-[#71859b]">{getProspectImportAuditBatchLabel(batch)} · {batch.totalRows || 0} rows</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass(tone)}`}>{titleize(batch.status || 'uploaded')}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#60758d]">
                        <span>{batch.createdCount || 0} created</span>
                        <span>{batch.skippedCount || 0} skipped</span>
                        <span>{batch.failedCount || 0} failed</span>
                        {issueCount ? <span className="text-[#81550d]">{issueCount} issues</span> : null}
                      </div>
                      <p className="mt-2 text-xs text-[#8a96a8]">{formatRelativeTime(batch.updatedAt || batch.createdAt)}</p>
                      {canApprove || canCommit ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canApprove ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void handleApproveRecentProspectImport(batch)}
                              disabled={actionBusy}
                              className="h-8 rounded-[10px] px-2.5 text-xs"
                            >
                              <CheckCircle2 size={13} />
                              {actionBusy && recentImportAction.action === 'approve' ? 'Approving...' : 'Approve'}
                            </Button>
                          ) : null}
                          {canCommit ? (
                            <Button
                              type="button"
                              onClick={() => void handleCommitRecentProspectImport(batch)}
                              disabled={actionBusy}
                              className="h-8 rounded-[10px] px-2.5 text-xs"
                            >
                              <FileClock size={13} />
                              {actionBusy && recentImportAction.action === 'commit' ? 'Committing...' : 'Commit'}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  )
                }) : (
                  <div className="rounded-[14px] border border-dashed border-[#dce6f0] bg-white px-4 py-5 text-sm text-[#60758d] lg:col-span-3">
                    No audited prospect imports yet.
                  </div>
                )}
              </div>
            </section>

            {isFocusedCanvassingView ? (
              <CanvassingKpiStrip loading={loading} metrics={metrics} counts={leaseRoleCounts} mode={pageView.key} />
            ) : (
              <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <ProspectStat label="Total Prospects" value={loading ? '...' : metrics.prospects} detail="vs last 30 days" icon={Users} trendLabel="12%" series={kpiSeries.total} color="#2d6ecf" />
                {roleMetricCards.map((card) => (
                  <ProspectStat key={card.label} label={card.label} value={loading ? '...' : card.value} detail="vs last 30 days" icon={card.icon} trendLabel={card.trendLabel} series={card.series} color={card.color} />
                ))}
                <ProspectStat label="Follow Ups Due" value={loading ? '...' : metrics.followUpsDue} detail="vs last 30 days" icon={CalendarDays} trendLabel="6%" series={kpiSeries.followUps} color="#f59e0b" />
                <ProspectStat label="Converted" value={loading ? '...' : metrics.converted} detail="vs last 30 days" icon={CheckCircle2} trendLabel="15%" series={kpiSeries.converted} color="#0f766e" />
              </section>
            )}

            {pageView.showDepartmentTabs && !isFocusedCanvassingView ? (
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

            <section className={`${isFocusedCanvassingView ? 'rounded-[14px] border border-[#dce6f0] bg-white shadow-[0_14px_34px_rgba(15,35,70,0.05)]' : 'rounded-b-[18px] border border-t-0 border-[#dce6f0] bg-white'}`}>
              <div className="border-b border-[#e8eef5] px-4 py-4">
                <div className={isFocusedCanvassingView ? 'grid gap-3 lg:grid-cols-[minmax(260px,1fr)_154px_154px_154px_164px]' : 'flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between'}>
                  <SearchField value={search} onChange={setSearch} placeholder={pageView.searchPlaceholder} className={isFocusedCanvassingView ? 'w-full' : 'w-full 2xl:max-w-[34%] 2xl:flex-1'} />
                  <div className={isFocusedCanvassingView ? 'contents' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:flex 2xl:flex-wrap 2xl:items-center'}>
                    {isFocusedCanvassingView ? (
                      <>
                        <FilterSelect value={roleFilter} onChange={setRoleFilter} options={pageView.roleOptions} placeholder="Type" className="!w-full" />
                        <FilterSelect value={brokerFilter} onChange={setBrokerFilter} options={brokerOptions} placeholder="Broker" className="!w-full" />
                        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={LEASE_STATUS_OPTIONS.map((value) => ({ value, label: value }))} placeholder="Status" className="!w-full" />
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
                      {isFocusedCanvassingView ? 'More Filters' : 'Filters'}
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
                          setDateAddedFilter('all')
                          setLastContactFilter('all')
                          setActiveTab('all')
                          setShowAdvancedFilters(false)
                          if (!pageView.showDepartmentTabs) setDealFilter('all')
                        }}
                        className="text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]"
                      >
                        Clear filters
                      </button>
                    </div>
                    {isFocusedCanvassingView ? (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={(pageView.key === 'sale' ? SALES_ASSET_CLASS_OPTIONS : LEASE_ASSET_CLASS_OPTIONS).map(({ value, label }) => ({ value, label }))} placeholder="Asset Class" className="!w-full" />
                        <FilterSelect value={methodFilter} onChange={setMethodFilter} options={CANVASSING_METHODS.map((value) => ({ value, label: value }))} placeholder="Source" className="!w-full" />
                        <FilterSelect value={dateAddedFilter} onChange={setDateAddedFilter} options={DATE_FILTER_OPTIONS.slice(1)} placeholder="Date Added" className="!w-full" />
                        <FilterSelect value={lastContactFilter} onChange={setLastContactFilter} options={DATE_FILTER_OPTIONS.slice(1)} placeholder="Last Contact" className="!w-full" />
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
                            className="h-11 !w-full rounded-[14px] bg-white pl-9 text-sm"
                          >
                            {SORT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>Sort: {option.label}</option>
                            ))}
                          </Field>
                        </label>
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
                        {tableColumnLabels.map((label) => (
                          <th key={label} className="border-b border-[#e7edf4] px-5 py-3">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? Array.from({ length: 6 }).map((_, index) => (
                        <tr key={`loading-${index}`}>
                          <td colSpan={tableColumnLabels.length} className="border-b border-[#eef3f7] px-5 py-4">
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
                                  {!isFocusedCanvassingView ? <p className="mt-1 truncate text-xs text-[#6d839b]">{normalizeText(prospect.phone) || 'No phone captured'}</p> : null}
                                </div>
                              </div>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <div className="space-y-2">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(roleTone)}`}>{prospect.roleLabel}</span>
                                {!isFocusedCanvassingView ? <p className="text-xs text-[#63768b]">{prospect.dealTypeLabel}</p> : null}
                              </div>
                            </td>
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              {isFocusedCanvassingView
                                ? <LeaseAssetClass category={prospect.propertyCategory || prospect.propertyType} />
                                : <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(categoryTone)}`}>{prospect.categoryLabel}</span>}
                            </td>
                            {!isFocusedCanvassingView ? (
                              <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                                <span className="inline-flex rounded-full border border-[#e0e8f2] bg-[#f8fbff] px-2.5 py-1 text-xs font-semibold text-[#38506a]">
                                  {titleize(prospect.sourceLabel)}
                                </span>
                              </td>
                            ) : null}
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              <div className="space-y-1">
                                {pageView.key === 'sale' || !isFocusedCanvassingView ? <p className="text-sm font-semibold text-[#102236]">{getAssetLine(prospect)}</p> : null}
                                <div className="inline-flex items-center gap-1.5 text-xs text-[#63768b]">
                                  <MapPin size={12} className="text-[#9cb0c4]" />
                                  <span>{getAreaLine(prospect)}</span>
                                </div>
                              </div>
                            </td>
                            {isFocusedCanvassingView ? (
                              <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                                <div className="inline-flex items-center gap-2">
                                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e7edf6] text-xs font-semibold text-[#2b4f71]">
                                    {brokerLabel === 'Unassigned' ? 'U' : brokerLabel.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')}
                                  </span>
                                  <span className="text-sm font-semibold text-[#102236]">{brokerLabel}</span>
                                </div>
                              </td>
                            ) : null}
                            <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                              {isFocusedCanvassingView ? (
                                <LeaseStatusPill status={prospect.stageLabel || prospect.status} />
                              ) : (
                                <div className="space-y-2">
                                  <ProspectTonePill value={prospect.stageLabel} />
                                  <p className="line-clamp-1 text-sm font-medium text-[#4f6176]">{prospect.nextStepLabel}</p>
                                  <p className="text-xs text-[#8a96a8]">{prospect.nextFollowUpDate ? formatShortDate(prospect.nextFollowUpDate) : 'No follow-up date'}</p>
                                </div>
                              )}
                            </td>
                            {!isFocusedCanvassingView ? (
                              <td className="border-b border-[#eef3f7] px-4 py-4 align-top">
                                <div className="inline-flex items-center gap-2">
                                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e7edf6] text-xs font-semibold text-[#2b4f71]">
                                    {brokerLabel === 'Unassigned' ? 'U' : brokerLabel.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')}
                                  </span>
                                  <span className="text-sm font-semibold text-[#102236]">{brokerLabel}</span>
                                </div>
                              </td>
                            ) : null}
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
                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setDrawerOpen(true); setMessage('Edit the prospect in the detail popup.'); setOpenActionMenuId('') }}>Edit</button>
                                    {isFocusedCanvassingView ? (
                                      <>
                                        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setOpenActionMenuId(''); void handleUpdateProspectStatus(prospect, 'Contacted') }}>Mark Contacted</button>
                                        {!getConvertedRequirementId(prospect) && getLeaseStatusLabel(prospect.status || prospect.stageLabel) !== 'Converted' ? (
                                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setOpenActionMenuId(''); void handleConvertProspectToLead(prospect) }}>Convert to Lead</button>
                                        ) : null}
                                      </>
                                    ) : (
                                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#102236] transition hover:bg-[#f7fafc]" onClick={() => { setSelectedProspectId(prospect.id); setDrawerOpen(true); setMessage('Use the detail popup to log a call or add notes.'); setOpenActionMenuId('') }}>Log activity</button>
                                    )}
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
                          <td colSpan={tableColumnLabels.length} className="px-0 py-0">
                            {isFocusedCanvassingView && !hasAnyProspects ? (
                              <FocusedProspectsEmptyState mode={pageView.key} onAddPrimary={() => openCreateModal(primaryCreateRole)} onAddSecondary={() => openCreateModal(secondaryCreateRole)} />
                            ) : (
                              <InlineTableEmptyState
                                icon={emptyStateConfig.icon}
                                title={emptyStateConfig.title}
                                description={emptyStateConfig.description}
                                actionLabel={emptyStateConfig.actionLabel}
                                onAction={emptyStateConfig.onAction}
                              />
                            )}
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
                        <p>
                          {isFocusedCanvassingView
                            ? `${normalizeText(prospect.phone) || 'No contact number'} · ${normalizeText(prospect.email) || normalizeText(prospect.contactName) || 'Email pending'}`
                            : `${prospect.stageLabel} · ${prospect.nextStepLabel}`}
                        </p>
                        <p>Assigned: {brokerLabel}</p>
                        <p>{formatRelativeTime(lastActivity?.activityDate || lastActivity?.createdAt)} · {lastActivity?.activityNote || lastActivity?.activityType || 'No activity yet'}</p>
                      </div>
                    </div>
                  )
                }) : (
                  isFocusedCanvassingView && !hasAnyProspects ? (
                    <FocusedProspectsEmptyState mode={pageView.key} onAddPrimary={() => openCreateModal(primaryCreateRole)} onAddSecondary={() => openCreateModal(secondaryCreateRole)} />
                  ) : (
                    <InlineTableEmptyState
                      icon={emptyStateConfig.icon}
                      title={emptyStateConfig.title}
                      description={emptyStateConfig.description}
                      actionLabel={emptyStateConfig.actionLabel}
                      onAction={emptyStateConfig.onAction}
                    />
                  )
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

          <Modal
            open={drawerOpen && Boolean(selectedProspect)}
            onClose={() => setDrawerOpen(false)}
            title="Prospect Detail"
            subtitle={`Review touchpoints, qualify the prospect, and convert it into a ${pageView.key === 'sale' ? 'sales' : 'commercial'} lead.`}
            className="max-w-[1120px]"
          >
            {selectedProspect ? (
              <div className="-mx-6 -mb-6 -mt-6 overflow-hidden bg-[#f6f8fb]">
                <div className="bg-[#0f2237] px-5 py-5 text-white sm:px-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/15 bg-white/10 text-lg font-semibold shadow-inner">
                        {getProspectInitials(selectedProspect)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#9fb2c8]">{pageView.key === 'sale' ? 'Sales Prospect' : pageView.key === 'lease' ? 'Leasing Prospect' : 'Commercial Prospect'}</p>
                        <h2 className="mt-1 truncate text-2xl font-semibold tracking-[-0.035em] text-white">{getProspectDisplayName(selectedProspect)}</h2>
                        <div className="mt-2 flex flex-wrap gap-2 text-sm text-[#d4deea]">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1">
                            <Building2 size={14} />
                            {getAssetLine(selectedProspect)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1">
                            <MapPin size={14} />
                            {getAreaLine(selectedProspect)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1">
                            <CheckCircle2 size={14} />
                            {selectedProspect.status || 'New'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="secondary" onClick={handleSaveProspect} disabled={busyAction === 'save'} className="h-11 rounded-[12px] border-white/20 bg-white/10 px-4 text-white hover:bg-white/15">
                        <Save size={16} />
                        {busyAction === 'save' ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void handleConvert('requirement')}
                        disabled={busyAction.startsWith('convert-') || Boolean(getConvertedRequirementId(selectedProspect))}
                        className="h-11 rounded-[12px] bg-white px-4 text-[#0f2237] hover:bg-[#f2f6fb]"
                      >
                        <ArrowRight size={16} />
                        {getConvertedRequirementId(selectedProspect) ? 'Lead Created' : busyAction === 'convert-requirement' ? 'Converting...' : 'Convert to Lead'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="space-y-5 p-5 sm:p-6">
                    <section className="rounded-[20px] border border-[#dde7f2] bg-white p-4 shadow-[0_16px_36px_rgba(15,35,55,0.06)]">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#8293aa]">Overview</p>
                          <h3 className="mt-1 text-base font-semibold text-[#102236]">Contact and qualification details</h3>
                        </div>
                        <ProspectTonePill value={selectedProspect.status} />
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

                    <section className="rounded-[20px] border border-[#dde7f2] bg-white p-4 shadow-[0_16px_36px_rgba(15,35,55,0.06)]">
                      <div className="mb-4">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#8293aa]">Tasks</p>
                        <h3 className="mt-1 text-base font-semibold text-[#102236]">Follow-up and notes</h3>
                      </div>
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
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Follow-up note</span>
                          <Field value={selectedProspect.followUpNote || ''} onChange={(event) => updateSelectedProspectField('followUpNote', event.target.value)} />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Notes</span>
                          <Field as="textarea" value={selectedProspect.notes || ''} onChange={(event) => updateSelectedProspectField('notes', event.target.value)} />
                        </label>
                      </div>
                    </section>
                  </div>

                  <aside className="border-t border-[#dde7f2] bg-[#fbfcfe] p-5 sm:p-6 lg:border-l lg:border-t-0">
                    <div className="space-y-5 lg:sticky lg:top-0">
                      <section className="rounded-[20px] border border-[#dde7f2] bg-white p-4 shadow-[0_16px_36px_rgba(15,35,55,0.06)]">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#eaf4ff] text-[#0c5fd7]">
                            <CheckCircle2 size={18} />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-[#102236]">Qualification</p>
                            <p className="text-xs text-[#6d839b]">Move this record into Commercial Leads.</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          onClick={() => void handleConvert('requirement')}
                          disabled={busyAction.startsWith('convert-') || Boolean(getConvertedRequirementId(selectedProspect))}
                          className="mt-4 h-11 w-full rounded-[12px] bg-[#082f56] text-white hover:bg-[#0b3d70]"
                        >
                          <ArrowRight size={16} />
                          {getConvertedRequirementId(selectedProspect) ? 'Lead Created' : busyAction === 'convert-requirement' ? 'Converting...' : 'Convert to Lead'}
                        </Button>
                        {getWorkspaceLink('commercial_requirement', getConvertedRequirementId(selectedProspect)) ? (
                          <Link to={getWorkspaceLink('commercial_requirement', getConvertedRequirementId(selectedProspect))} className="mt-3 inline-flex w-full items-center justify-center rounded-[12px] border border-[#dbe6f0] bg-white px-4 py-2.5 text-sm font-semibold text-[#102236] transition hover:bg-[#f7fafc]">
                            Open lead
                          </Link>
                        ) : null}
                      </section>

                      <section className="rounded-[20px] border border-[#dde7f2] bg-white p-4 shadow-[0_16px_36px_rgba(15,35,55,0.06)]">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#8293aa]">Activity</p>
                        <div className="mt-3 grid gap-2">
                          <Button type="button" variant="secondary" onClick={() => handleLogActivity('Call')} disabled={busyAction.startsWith('activity-')} className="justify-center rounded-[12px]">
                            <Phone size={16} />
                            Call
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => handleLogActivity('WhatsApp')} disabled={busyAction.startsWith('activity-')} className="justify-center rounded-[12px]">
                            <MessageCircle size={16} />
                            WhatsApp
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => handleLogActivity('Email')} disabled={busyAction.startsWith('activity-')} className="justify-center rounded-[12px]">
                            <Mail size={16} />
                            Email
                          </Button>
                        </div>
                        <label className="mt-3 grid gap-1.5">
                          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Activity note</span>
                          <Field as="textarea" value={activityDraft.activityNote} onChange={(event) => setActivityDraft((current) => ({ ...current, activityNote: event.target.value }))} placeholder="What happened in the latest touchpoint?" />
                        </label>
                        <label className="mt-3 grid gap-1.5">
                          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Outcome</span>
                          <Field value={activityDraft.outcome} onChange={(event) => setActivityDraft((current) => ({ ...current, outcome: event.target.value }))} placeholder="Next step or outcome" />
                        </label>
                        <Button type="button" onClick={() => handleLogActivity('Note')} disabled={busyAction.startsWith('activity-')} className="mt-3 w-full rounded-[12px]">
                          <Save size={16} />
                          Log activity
                        </Button>
                      </section>

                      <section className="rounded-[20px] border border-[#dde7f2] bg-white p-4 shadow-[0_16px_36px_rgba(15,35,55,0.06)]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[#102236]">Timeline</p>
                          <span className="text-xs font-semibold text-[#7b899a]">{selectedActivities.length} touchpoints</span>
                        </div>
                        <div className="mt-3 max-h-[300px] space-y-3 overflow-y-auto pr-1">
                          {selectedActivities.length ? selectedActivities.map((activityRow) => (
                            <div key={activityRow.id} className="rounded-[14px] border border-[#eef3f7] bg-[#fbfdff] p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-[#102236]">{titleize(activityRow.activityType)}</p>
                                  <p className="mt-1 text-sm leading-6 text-[#60758d]">{activityRow.activityNote || 'No note recorded'}</p>
                                </div>
                                <span className="text-xs font-semibold text-[#7b899a]">{formatDate(activityRow.activityDate || activityRow.createdAt)}</span>
                              </div>
                              {activityRow.outcome ? <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#1a6e3a]">{activityRow.outcome}</p> : null}
                            </div>
                          )) : (
                            <InlineTableEmptyState icon={CalendarDays} title="No activity yet." description="Calls, emails, WhatsApp notes, and follow-up touchpoints will appear here." />
                          )}
                        </div>
                      </section>

                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" onClick={() => setArchiveOpen(true)} className="rounded-[12px]">
                          <Archive size={16} />
                          Archive
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => setDeleteOpen(true)} className="rounded-[12px] text-[#9b2f28]">
                          <Trash2 size={16} />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            ) : null}
          </Modal>

          {createModal}

          <Modal
            open={importOpen}
            onClose={() => {
              setImportOpen(false)
              resetImportState()
            }}
            title="Import Prospects"
            subtitle="Upload a CSV list and review rows before creating prospects."
            className="max-w-[1040px]"
            footer={(
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-semibold text-[#6f8197]">
                  {importSummary.total ? `${importSummary.ready} ready · ${importSummary.warning} warnings · ${importSummary.staged} staged · ${importSummary.skipped} skipped · ${importSummary.invalid} invalid` : 'CSV only'}
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="secondary" onClick={handleDownloadProspectTemplate}>
                    <Download size={16} />
                    Template
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleDownloadRejectedProspectRows} disabled={!rejectedImportRows.length}>
                    <Download size={16} />
                    Rejected Rows
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => { setImportOpen(false); resetImportState() }}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleCommitProspectImport} disabled={!prospectImportSettings.enabled || busyAction === 'import' || importSummary.ready + importSummary.warning < 1}>
                    <Upload size={16} />
                    {busyAction === 'import' ? 'Importing...' : prospectImportSettings.requireManagerApproval ? `Stage ${importSummary.ready + importSummary.warning || ''}`.trim() : `Import ${importSummary.ready + importSummary.warning || ''}`.trim()}
                  </Button>
                </div>
              </div>
            )}
          >
            <div className="space-y-5">
              <section className="rounded-[18px] border border-[#dce6f0] bg-[#fbfdff] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#102236]">{importFileName || 'No file selected'}</p>
                    <p className="mt-1 text-xs text-[#6f8197]">Required: company or contact, phone or email, and prospect role.</p>
                    <p className="mt-1 text-xs text-[#6f8197]">
                      Limit {prospectImportSettings.maxRowsPerUpload} rows · {prospectImportSettings.requireManagerApproval ? 'Manager approval required for audited prospect rows' : 'Audited rows can be created immediately'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={importFileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(event) => void handleProspectImportFileChange(event)}
                    />
                    <Button type="button" variant="secondary" onClick={() => importFileInputRef.current?.click()} disabled={!prospectImportSettings.enabled}>
                      <Upload size={16} />
                      Choose CSV
                    </Button>
                    <Button type="button" variant="ghost" onClick={handleDownloadProspectTemplate}>
                      <Download size={16} />
                      Download Template
                    </Button>
                  </div>
                </div>
                {prospectImportSettingsError ? (
                  <p className="mt-3 rounded-[12px] border border-[#f1d9ab] bg-[#fff9eb] px-3 py-2 text-sm text-[#81550d]">{prospectImportSettingsError}</p>
                ) : null}
                {!prospectImportSettings.enabled ? (
                  <p className="mt-3 rounded-[12px] border border-[#f5d0d0] bg-[#fff5f5] px-3 py-2 text-sm text-[#9f1d1d]">Bulk uploads are disabled in Commercial settings.</p>
                ) : null}
                {importError ? <p className="mt-3 rounded-[12px] border border-[#f5d0d0] bg-[#fff5f5] px-3 py-2 text-sm text-[#9f1d1d]">{importError}</p> : null}
                {importAudit.warning ? (
                  <p className="mt-3 rounded-[12px] border border-[#f1d9ab] bg-[#fff9eb] px-3 py-2 text-sm text-[#81550d]">{importAudit.warning}</p>
                ) : null}
                {importAudit.batches.length ? (
                  <div className="mt-3 rounded-[12px] border border-[#dbe9f6] bg-white px-3 py-2 text-sm text-[#49647f]">
                    <span className="font-semibold text-[#102236]">Audit trail saved:</span>{' '}
                    {importAudit.batches.map((batch) => `${batch.rowCount} ${batch.recordType.replace(/_/g, ' ')} rows`).join(' · ')}
                    {importAudit.unsupportedRows ? ` · ${importAudit.unsupportedRows} rows imported directly` : ''}
                  </div>
                ) : null}
              </section>

              {importRows.length ? (
                <>
                <section className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[16px] border border-[#dbe9f6] bg-[#f8fbff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#71859b]">Importable</p>
                    <p className="mt-1 text-2xl font-semibold text-[#102236]">{importSummary.ready + importSummary.warning}</p>
                    <p className="mt-1 text-xs leading-5 text-[#60758d]">{prospectImportSettings.requireManagerApproval ? 'Audited rows will be staged for review.' : 'Ready rows and rows with warnings will be created.'}</p>
                  </div>
                  <div className="rounded-[16px] border border-[#f1d9ab] bg-[#fff9eb] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#986a11]">Warnings</p>
                    <p className="mt-1 text-2xl font-semibold text-[#81550d]">{importSummary.warning + importSummary.skipped}</p>
                    <p className="mt-1 text-xs leading-5 text-[#7a5b1b]">Warnings can import. Duplicates are skipped.</p>
                  </div>
                  <div className="rounded-[16px] border border-[#f2c7c7] bg-[#fff5f5] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#9f1d1d]">Rejected</p>
                    <p className="mt-1 text-2xl font-semibold text-[#8e1b1b]">{importSummary.invalid + importSummary.failed}</p>
                    <p className="mt-1 text-xs leading-5 text-[#8e3d3d]">Fix invalid rows below or export them.</p>
                  </div>
                </section>

                {duplicateImportRows.length ? (
                  <section className="rounded-[16px] border border-[#f1d9ab] bg-[#fff9eb] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#81550d]">{duplicateImportRows.length} duplicate rows will be skipped</p>
                        <p className="mt-1 text-xs leading-5 text-[#7a5b1b]">Duplicates are matched by email, phone, or company name within the same prospect role.</p>
                      </div>
                      <Button type="button" variant="secondary" onClick={handleDownloadRejectedProspectRows} className="border-[#f1d9ab] bg-white text-[#81550d]">
                        <Download size={16} />
                        Export
                      </Button>
                    </div>
                  </section>
                ) : null}

                <section className="overflow-hidden rounded-[18px] border border-[#dce6f0] bg-white">
                  <div className="grid grid-cols-4 divide-x divide-[#e6edf4] border-b border-[#e6edf4] text-center text-sm font-semibold text-[#102236]">
                    <div className="p-3">{importSummary.ready} ready</div>
                    <div className="p-3">{importSummary.warning} warnings</div>
                    <div className="p-3">{importSummary.skipped} skipped</div>
                    <div className="p-3">{importSummary.invalid + importSummary.failed + importSummary.staged} needs review</div>
                  </div>
                  <div className="max-h-[430px] overflow-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-[#f8fbff] text-xs font-semibold uppercase tracking-[0.08em] text-[#71859b]">
                        <tr>
                          <th className="px-4 py-3">Row</th>
                          <th className="px-4 py-3">Prospect</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Contact</th>
                          <th className="px-4 py-3">Details</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eef3f7]">
                        {importRows.slice(0, 100).map((row) => {
                          const tone = row.status === 'ready' || row.status === 'created'
                            ? 'emerald'
                            : row.status === 'skipped' || row.status === 'warning' || row.status === 'staged'
                              ? 'amber'
                              : 'rose'
                          return (
                            <tr key={row.id}>
                              <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-[#7b899a]">{row.rowNumber}</td>
                              <td className="min-w-[240px] px-4 py-3">
                                <Field value={row.payload.companyName || ''} onChange={(event) => updateImportRowPayload(row.id, { companyName: event.target.value })} placeholder="Company name" className="h-10 rounded-[10px] text-sm" />
                                <Field value={row.payload.contactName || ''} onChange={(event) => updateImportRowPayload(row.id, { contactName: event.target.value })} placeholder="Contact name" className="mt-2 h-10 rounded-[10px] text-sm" />
                              </td>
                              <td className="min-w-[150px] px-4 py-3">
                                <Field as="select" value={row.payload.prospectRole || ''} onChange={(event) => updateImportRowPayload(row.id, { prospectRole: event.target.value })} className="h-10 rounded-[10px] bg-white text-sm">
                                  <option value="">Select role</option>
                                  {['seller', 'buyer', 'landlord', 'tenant'].map((role) => <option key={role} value={role}>{getRoleLabel(role)}</option>)}
                                </Field>
                              </td>
                              <td className="min-w-[220px] px-4 py-3">
                                <Field value={row.payload.phone || ''} onChange={(event) => updateImportRowPayload(row.id, { phone: event.target.value })} placeholder="Phone" className="h-10 rounded-[10px] text-sm" />
                                <Field value={row.payload.email || ''} onChange={(event) => updateImportRowPayload(row.id, { email: event.target.value })} placeholder="Email" className="mt-2 h-10 rounded-[10px] text-sm" />
                              </td>
                              <td className="min-w-[220px] px-4 py-3">
                                <Field value={row.payload.area || ''} onChange={(event) => updateImportRowPayload(row.id, { area: event.target.value })} placeholder="Area" className="h-10 rounded-[10px] text-sm" />
                                <Field as="select" value={row.payload.propertyCategory || ''} onChange={(event) => updateImportRowPayload(row.id, { propertyCategory: event.target.value })} className="mt-2 h-10 rounded-[10px] bg-white text-sm">
                                  <option value="">Property category</option>
                                  {COMMERCIAL_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </Field>
                                <Field
                                  as="select"
                                  value={row.payload.assignedBrokerId || ''}
                                  onChange={(event) => {
                                    const broker = brokerOptions.find((option) => option.value === event.target.value)
                                    updateImportRowPayload(row.id, { assignedBrokerId: event.target.value, assignedBrokerName: broker?.label || '' })
                                  }}
                                  className="mt-2 h-10 rounded-[10px] bg-white text-sm"
                                >
                                  <option value="">Unassigned</option>
                                  {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </Field>
                                <Field as="input" type="date" value={normalizeImportDate(row.payload.nextFollowUpDate) || ''} onChange={(event) => updateImportRowPayload(row.id, { nextFollowUpDate: event.target.value })} className="mt-2 h-10 rounded-[10px] text-sm" />
                              </td>
                              <td className="min-w-[240px] px-4 py-3 align-top">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(tone)}`}>
                                  {titleize(row.status)}
                                </span>
                                {row.status === 'skipped' || row.status === 'failed' ? (
                                  <p className="mt-2 max-w-[240px] text-xs leading-5 text-[#81550d]">{row.reason}</p>
                                ) : row.errors?.length ? (
                                  <ul className="mt-2 list-disc pl-4 text-xs leading-5 text-[#9f1d1d]">
                                    {row.errors.map((entry) => <li key={entry}>{entry}</li>)}
                                  </ul>
                                ) : null}
                                {!row.errors?.length && row.warnings?.length ? (
                                  <ul className="mt-2 list-disc pl-4 text-xs leading-5 text-[#81550d]">
                                    {row.warnings.map((entry) => <li key={entry}>{entry}</li>)}
                                  </ul>
                                ) : null}
                                {!row.errors?.length && !row.warnings?.length && row.reason ? <p className="mt-1 max-w-[240px] text-xs leading-5 text-[#7b899a]">{row.reason}</p> : null}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {importRows.length > 100 ? (
                      <p className="border-t border-[#eef3f7] px-4 py-3 text-xs text-[#7b899a]">Preview limited to first 100 rows.</p>
                    ) : null}
                  </div>
                </section>
                </>
              ) : (
                <section className="rounded-[18px] border border-dashed border-[#dce6f0] bg-white p-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#eef5ff] text-[#1f6dd5]">
                    <Upload size={20} />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-[#102236]">CSV preview will appear here</h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#60758d]">
                    Start from the template for the cleanest import.
                  </p>
                </section>
              )}
            </div>
          </Modal>

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
