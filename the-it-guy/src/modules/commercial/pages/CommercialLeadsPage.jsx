import {
  Archive,
  ArrowRight,
  ArrowUpDown,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import Field from '../../../components/ui/Field'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { toLookupOptions } from '../commercialPipelineHelpers'
import {
  formatCurrencyZAR,
  formatRelativeTime,
  formatShortDate,
  normalizeKey,
  normalizeText,
} from '../commercialProspectFormatters'
import {
  COMMERCIAL_CANVASSING_METHODS,
  COMMERCIAL_CATEGORY_OPTIONS,
  COMMERCIAL_ROLE_OPTIONS,
  getCategoryBadgeVariant,
  getDealTypeFromRole,
  getDealTypeLabel,
  getPropertyCategoryLabel,
  getProspectBadgeVariant,
  getRoleLabel,
} from '../commercialProspectTypes'
import { deriveCommercialCanvassingMetrics, filterCommercialProspects, normaliseCommercialProspect } from '../commercialProspectFilters'
import {
  createCommercialCanvassingActivity,
  createCommercialCanvassingProspect,
  listCommercialCanvassingWorkspace,
  updateCommercialCanvassingProspect,
} from '../services/commercialCanvassingApi'
import { getCommercialLookupData, resolveCommercialAccessContext, resolveCommercialOrganisationContext } from '../services/commercialApi'

const LEAD_STAGE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'qualification', label: 'Qualification' },
  { value: 'requirement_captured', label: 'Requirement Captured' },
  { value: 'viewing', label: 'Viewing' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'converted', label: 'Converted' },
]

const LEAD_STATUS_FILTER_OPTIONS = [
  { value: 'New', label: 'New' },
  { value: 'Qualified', label: 'Qualified' },
  { value: 'Active', label: 'Active' },
  { value: 'Negotiation', label: 'Negotiation' },
  { value: 'Converted', label: 'Converted' },
  { value: 'Not Interested', label: 'Not Interested' },
]

const LEASE_TYPE_OPTIONS = [
  { value: 'landlord', label: 'Landlord' },
  { value: 'tenant', label: 'Tenant' },
]

const LEAD_MODAL_SOURCE_OPTIONS = [
  'Cold Call',
  'Referral',
  'Website',
  'Email Campaign',
  'Walk-In',
  'Existing Relationship',
  'Portal Enquiry',
  'Other',
].map((value) => ({ value, label: value }))

const LEAD_MODAL_STATUS_OPTIONS = ['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted', 'Lost'].map((value) => ({ value, label: value }))
const LEAD_MODAL_PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent'].map((value) => ({ value, label: value }))
const LEAD_MODAL_FUNDING_OPTIONS = ['Cash', 'Bond / Finance Required', 'Pre-approved', 'Unknown'].map((value) => ({ value, label: value }))
const CARD_CLASS = 'rounded-[18px] border border-[#e6edf4] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]'

const LEAD_SORT_OPTIONS = [
  { value: 'updatedAt:desc', label: 'Newest Updated' },
  { value: 'createdAt:desc', label: 'Newest Created' },
  { value: 'createdAt:asc', label: 'Oldest' },
  { value: 'value:desc', label: 'Highest Value' },
  { value: 'value:asc', label: 'Lowest Value' },
  { value: 'followUpDate:asc', label: 'Follow Up Date' },
  { value: 'lastActivityAt:desc', label: 'Recently Active' },
]

const BUDGET_BANDS = [
  { value: 'all', label: 'All' },
  { value: 'under_100k', label: 'Under R100K' },
  { value: '100k_500k', label: 'R100K - R500K' },
  { value: '500k_1m', label: 'R500K - R1M' },
  { value: '1m_5m', label: 'R1M - R5M' },
  { value: '5m_plus', label: 'R5M+' },
]

const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'Any Time' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
]

const ALL_LEAD_TABS = [
  { id: 'all', label: 'All Leads', matches: (lead) => leadTabMatches(lead, 'all') },
  { id: 'sales', label: 'Sales', matches: (lead) => leadTabMatches(lead, 'sales') },
  { id: 'leases', label: 'Leases', matches: (lead) => leadTabMatches(lead, 'leases') },
  { id: 'unclassified', label: 'Unclassified', matches: (lead) => leadTabMatches(lead, 'unclassified') },
  { id: 'qualified', label: 'Qualified', matches: (lead) => leadTabMatches(lead, 'qualified') },
  { id: 'converted', label: 'Converted', matches: (lead) => leadTabMatches(lead, 'converted') },
]

const LEASE_LEAD_TABS = [
  { id: 'all', label: 'All Leads', matches: () => true },
  { id: 'landlords', label: 'Landlords', matches: (lead) => normalizeLeadRole(lead) === 'landlord' },
  { id: 'tenants', label: 'Tenants', matches: (lead) => normalizeLeadRole(lead) === 'tenant' },
  { id: 'qualified', label: 'Qualified', matches: (lead) => ['qualified', 'proposal', 'negotiation'].includes(normalizeLeadStatus(lead.status)) },
  { id: 'converted', label: 'Converted', matches: (lead) => normalizeLeadStatus(lead.status) === 'converted' },
]

const SALE_LEAD_TABS = [
  { id: 'all', label: 'All Sales Leads', matches: () => true },
  { id: 'sellers', label: 'Sellers', matches: (lead) => normalizeLeadRole(lead) === 'seller' },
  { id: 'buyers', label: 'Buyers', matches: (lead) => normalizeLeadRole(lead) === 'buyer' },
  { id: 'qualified', label: 'Qualified', matches: (lead) => ['qualified', 'proposal', 'negotiation'].includes(normalizeLeadStatus(lead.status)) },
  { id: 'converted', label: 'Converted', matches: (lead) => normalizeLeadStatus(lead.status) === 'converted' },
]

const EMPTY_LEAD_COPY = {
  all: {
    title: 'No commercial leads yet',
    description: 'Capture commercial sales and leasing enquiries, then qualify and convert them into requirements, listings and deals.',
  },
  sales: {
    title: 'No sales leads yet',
    description: 'Track sellers and buyers who are active in the commercial sales pipeline.',
  },
  leases: {
    title: 'No lease leads yet',
    description: 'Track landlords and tenants who are active in the commercial leasing pipeline.',
  },
  unclassified: {
    title: 'No unclassified leads yet',
    description: 'Use this view while the team is cleaning up older lead records.',
  },
  qualified: {
    title: 'No qualified leads yet',
    description: 'Qualified leads will appear here once they are ready for the next step.',
  },
  converted: {
    title: 'No converted leads yet',
    description: 'Converted leads will appear here after they move into requirements, listings or deals.',
  },
  leaseDepartment: {
    all: {
      title: 'No leasing leads yet',
      description: 'Qualified prospects will appear here once brokers start converting landlord and tenant opportunities.',
    },
    landlords: {
      title: 'No landlord leads yet',
      description: 'Landlord opportunities will appear here once canvassing and referrals start landing.',
    },
    tenants: {
      title: 'No tenant leads yet',
      description: 'Tenant opportunities will appear here once the leasing team starts qualifying demand.',
    },
    qualified: {
      title: 'No qualified lease leads yet',
      description: 'Qualified lease leads will appear here once they are ready for vacancy matching or lease deals.',
    },
    converted: {
      title: 'No converted lease leads yet',
      description: 'Converted lease leads will appear here after they move into vacancies or lease deals.',
    },
  },
  saleDepartment: {
    all: {
      title: 'No sales leads yet',
      description: 'Track sellers and buyers active in the commercial sales pipeline.',
    },
    sellers: {
      title: 'No seller leads yet',
      description: 'Seller opportunities will appear here once canvassing and referrals start landing.',
    },
    buyers: {
      title: 'No buyer leads yet',
      description: 'Buyer opportunities will appear here once the sales team starts qualifying demand.',
    },
    qualified: {
      title: 'No qualified sales leads yet',
      description: 'Qualified sales leads will appear here once they are ready for listings or deals.',
    },
    converted: {
      title: 'No converted sales leads yet',
      description: 'Converted sales leads will appear here after they move into listings or deals.',
    },
  },
}

function getLeadPageViewConfig(dealType = '') {
  const normalizedDealType = normalizeLower(dealType)
  if (normalizedDealType === 'lease') {
    const roleOptions = COMMERCIAL_ROLE_OPTIONS.filter((option) => ['landlord', 'tenant'].includes(option.value))
    return {
      key: 'lease',
      title: 'Leasing Leads',
      description: 'Qualify landlord and tenant opportunities before converting them into vacancies, requirements or lease deals.',
      createLabel: '+ Add Lease Lead',
      searchPlaceholder: 'Search leads by name, company, broker, area...',
      tabs: LEASE_LEAD_TABS,
      baseDealType: 'lease',
      showRoleFilters: false,
      roleFilters: roleOptions.map((option) => ({ value: option.value, label: option.label })),
      roleOptions,
      allowedRoles: ['landlord', 'tenant'],
      defaultCreateRole: 'landlord',
      emptyCopy: EMPTY_LEAD_COPY.leaseDepartment,
    }
  }

  if (normalizedDealType === 'sale') {
    const roleOptions = COMMERCIAL_ROLE_OPTIONS.filter((option) => ['seller', 'buyer'].includes(option.value))
    return {
      key: 'sale',
      title: 'Sales Leads',
      description: 'Qualify seller and buyer opportunities before converting them into listings, requirements or sales deals.',
      createLabel: '+ Add Sales Lead',
      searchPlaceholder: 'Search sales leads, companies, brokers...',
      tabs: SALE_LEAD_TABS,
      baseDealType: 'sale',
      showRoleFilters: false,
      roleFilters: roleOptions.map((option) => ({ value: option.value, label: option.label })),
      roleOptions,
      allowedRoles: ['seller', 'buyer'],
      defaultCreateRole: 'seller',
      emptyCopy: EMPTY_LEAD_COPY.saleDepartment,
    }
  }

  const roleOptions = COMMERCIAL_ROLE_OPTIONS.filter((option) => ['seller', 'buyer', 'landlord', 'tenant'].includes(option.value))
  return {
    key: 'all',
    title: 'Prospects',
    description: 'Unified commercial prospect register and follow-up state.',
    createLabel: '+ Add Lead',
    searchPlaceholder: 'Search leads, companies, requirements, areas, brokers...',
    tabs: ALL_LEAD_TABS,
    baseDealType: 'all',
    showRoleFilters: true,
    roleFilters: [
      { value: 'all', label: 'All' },
      { value: 'seller', label: 'Sellers' },
      { value: 'buyer', label: 'Buyers' },
      { value: 'landlord', label: 'Landlords' },
      { value: 'tenant', label: 'Tenants' },
    ],
    roleOptions,
    allowedRoles: ['seller', 'buyer', 'landlord', 'tenant'],
    defaultCreateRole: 'seller',
    emptyCopy: EMPTY_LEAD_COPY,
  }
}

function toneClass(tone = 'slate') {
  switch (tone) {
    case 'blue':
      return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'green':
    case 'emerald':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'purple':
    case 'violet':
      return 'border-violet-200 bg-violet-50 text-violet-700'
    case 'amber':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'rose':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'pink':
      return 'border-pink-200 bg-pink-50 text-pink-700'
    case 'slate':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600'
  }
}

function normalizeLower(value) {
  return normalizeKey(value)
}

function splitContactName(value = '') {
  const trimmed = normalizeText(value)
  if (!trimmed) return { firstName: '', lastName: '' }
  const [first, ...rest] = trimmed.split(/\s+/)
  return { firstName: first || '', lastName: rest.join(' ') || '' }
}

function getLeadRoleSpecific(record = {}) {
  return record?.roleSpecific || record?.role_specific || record?.metadata?.roleSpecific || record?.metadata_json?.roleSpecific || {}
}

function buildInitialDraft(record = null, defaultBroker = null) {
  const role = normalizeLeadRole(record)
  const roleSpecific = getLeadRoleSpecific(record)
  const preserved = roleSpecific.preservedProspectData || {}
  const contact = record?.contactName || preserved.contactPerson || [record?.firstName, record?.lastName].filter(Boolean).join(' ')
  const company = record?.companyName || preserved.companyName || record?.displayName || ''
  const notes = extractNoteValue(record?.notes, 'Notes') || record?.notes || preserved.notes || ''
  return {
    prospectRole: role,
    dealType: getDealTypeFromRole(role),
    propertyCategory: normalizeLower(record?.propertyCategory || preserved.assetClass || record?.propertyType) || 'commercial',
    companyName: company,
    contactPerson: contact,
    phone: record?.phone || preserved.contactNumber || '',
    email: record?.email || preserved.email || '',
    propertyAddress: extractNoteValue(record?.notes, 'Property / Asset Address or Area') || preserved.address || record?.area || '',
    propertyName: extractNoteValue(record?.notes, 'Property / Portfolio Name') || roleSpecific.propertyDetails || roleSpecific.propertyName || '',
    areaNode: extractNoteValue(record?.notes, 'Area / Node') || roleSpecific.areaNode || preserved.area || record?.area || '',
    requirementName: extractNoteValue(record?.notes, 'Requirement Name') || roleSpecific.requirementName || roleSpecific.requirementType || '',
    lookingFor: extractNoteValue(record?.notes, 'Looking For') || roleSpecific.requirementType || roleSpecific.requirementName || '',
    preferredArea: extractNoteValue(record?.notes, 'Preferred Area / Node') || extractNoteValue(record?.notes, 'Preferred Area') || roleSpecific.areaNode || preserved.area || record?.area || '',
    spaceRequirement: extractNoteValue(record?.notes, 'Space Requirement') || roleSpecific.requirementType || roleSpecific.requirementName || '',
    sizeRange: extractNoteValue(record?.notes, 'Size Range') || roleSpecific.minSize || roleSpecific.maxSize || '',
    budgetRange: extractNoteValue(record?.notes, 'Budget Range') || roleSpecific.budget || '',
    vacancyDetails: extractNoteValue(record?.notes, 'Vacancy Details') || roleSpecific.vacancyPotential || '',
    reasonForSelling: extractNoteValue(record?.notes, 'Reason for Selling') || roleSpecific.mandateType || '',
    desiredOccupationDate: roleSpecific.desiredOccupationDate || roleSpecific.targetOccupationDate || '',
    fundingStatus: roleSpecific.fundingStatus || 'Unknown',
    expectedAskingPrice: roleSpecific.expectedAskingPrice || '',
    estimatedPropertyValue: roleSpecific.estimatedPropertyValue || '',
    targetPurchaseTimeline: extractNoteValue(record?.notes, 'Target Purchase Timeline') || '',
    leaseTimeline: extractNoteValue(record?.notes, 'Lease Timeline') || roleSpecific.timing || roleSpecific.availability || '',
    estimatedSaleValue: String(record?.estimatedValue || ''),
    estimatedMonthlyRental: roleSpecific.askingRental || '',
    estimatedAnnualRental: '',
    canvassingMethod: record?.canvassingMethod || preserved.source || 'Cold Call',
    status: normalizeText(record?.status) || 'New',
    followUpDate: record?.nextFollowUpDate || roleSpecific.followUpDate || '',
    priority: record?.followUpPriority || 'Medium',
    assignedBrokerId: record?.assignedBrokerId || preserved.brokerId || defaultBroker?.value || '',
    assignedBrokerName: record?.assignedBrokerName || preserved.brokerName || defaultBroker?.label || '',
    branchId: record?.branchId || defaultBroker?.branchId || '',
    notes,
  }
}

function normalizeLeadRole(record = {}) {
  const explicit = normalizeLower(record?.prospectRole || record?.prospectType || record?.leadRole || record?.lead_role)
  if (['seller', 'buyer', 'landlord', 'tenant'].includes(explicit)) return explicit
  if (explicit.includes('landlord')) return 'landlord'
  if (explicit.includes('tenant') || explicit.includes('occupier')) return 'tenant'
  if (explicit.includes('buyer') || explicit.includes('investor')) return 'buyer'
  if (explicit.includes('seller') || explicit.includes('owner')) return 'seller'
  const dealType = normalizeLower(record?.dealType || record?.deal_type)
  if (dealType === 'lease') return 'landlord'
  return 'seller'
}

function normalizeLeadStatus(status = '') {
  const value = normalizeLower(status)
  if (!value) return 'new'
  if (value.includes('archived')) return 'archived'
  if (value.includes('converted')) return 'converted'
  if (value.includes('follow')) return 'follow_up'
  if (value.includes('qualified')) return 'qualified'
  if (value.includes('proposal')) return 'proposal'
  if (value.includes('negotiat')) return 'negotiation'
  if (value.includes('active')) return 'active'
  if (value.includes('contact')) return 'contacted'
  if (value.includes('lost') || value.includes('not_interested') || value.includes('not interested')) return 'lost'
  return 'new'
}

function leadTabMatches(lead, activeTab) {
  const role = normalizeLeadRole(lead)
  const dealType = normalizeLower(lead.dealType || lead.deal_type || getDealTypeFromRole(role))
  const stage = normalizeLeadStatus(lead.status)
  if (activeTab === 'sales') return dealType === 'sale'
  if (activeTab === 'leases') return dealType === 'lease'
  if (activeTab === 'unclassified') {
    return !normalizeText(lead.prospectRole) || !normalizeText(lead.dealType) || !normalizeText(lead.propertyCategory)
  }
  if (activeTab === 'qualified') return ['qualified', 'proposal', 'negotiation'].includes(stage)
  if (activeTab === 'converted') return stage === 'converted'
  return true
}

function getLeadStageLabel(lead = {}) {
  const stage = normalizeLeadStatus(lead.status)
  if (stage === 'qualified') return 'Qualification'
  if (stage === 'proposal') return 'Proposal'
  if (stage === 'negotiation') return 'Negotiation'
  if (stage === 'follow_up') return 'Follow Up'
  if (stage === 'converted') return 'Converted'
  if (stage === 'lost') return 'Lost'
  if (stage === 'archived') return 'Archived'
  return 'Discovery'
}

function getLeadAreaLabel(lead = {}) {
  const preserved = getLeadRoleSpecific(lead).preservedProspectData || {}
  const bits = [lead.preferredArea, preserved.area, lead.propertyAddress, preserved.address, lead.area, lead.branchName].map((value) => normalizeText(value)).filter(Boolean)
  return bits.slice(0, 2).join(' · ') || 'Area pending'
}

function parseBudgetBand(value = '') {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 'all'
  if (amount < 100000) return 'under_100k'
  if (amount < 500000) return '100k_500k'
  if (amount < 1000000) return '500k_1m'
  if (amount < 5000000) return '1m_5m'
  return '5m_plus'
}

function matchesBudgetBand(value, band) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0 || band === 'all') return band === 'all'
  if (band === 'under_100k') return amount < 100000
  if (band === '100k_500k') return amount >= 100000 && amount < 500000
  if (band === '500k_1m') return amount >= 500000 && amount < 1000000
  if (band === '1m_5m') return amount >= 1000000 && amount < 5000000
  if (band === '5m_plus') return amount >= 5000000
  return true
}

function getLeadValue(lead = {}) {
  const amount = Number(lead.estimatedValue || lead.estimated_value || 0)
  return Number.isFinite(amount) ? amount : 0
}

function getLeadBudgetLabel(lead = {}) {
  const amount = getLeadValue(lead)
  if (!amount) return 'No value captured'
  const dealType = normalizeLower(lead.dealType || getDealTypeFromRole(normalizeLeadRole(lead)))
  return dealType === 'lease' ? `${formatCurrencyZAR(amount)} est. rental` : formatCurrencyZAR(amount)
}

function getLeadTitle(lead = {}) {
  const preserved = getLeadRoleSpecific(lead).preservedProspectData || {}
  return normalizeText(lead.companyName || preserved.companyName || lead.displayName || lead.contactName || preserved.contactPerson || [lead.firstName, lead.lastName].filter(Boolean).join(' ')) || 'Unknown lead'
}

function getLeadContactName(lead = {}) {
  const preserved = getLeadRoleSpecific(lead).preservedProspectData || {}
  return normalizeText(lead.contactName || preserved.contactPerson || [lead.firstName, lead.lastName].filter(Boolean).join(' ')) || 'No contact captured'
}

function getLeadContactPhone(lead = {}) {
  const preserved = getLeadRoleSpecific(lead).preservedProspectData || {}
  return normalizeText(lead.phone || preserved.contactNumber) || 'No contact number'
}

function getLeadTypeLabel(lead = {}) {
  const role = normalizeLeadRole(lead)
  if (role === 'landlord') return 'Landlord'
  if (role === 'tenant') return 'Tenant'
  if (role === 'seller') return 'Seller'
  if (role === 'buyer') return 'Buyer'
  return getRoleLabel(role)
}

function getLeadClientRole(lead = {}) {
  const role = normalizeLeadRole(lead)
  if (role === 'landlord') return 'Owner'
  if (role === 'tenant') return 'Occupier'
  if (role === 'seller') return 'Owner'
  if (role === 'buyer') return 'Buyer'
  return 'Client'
}

function getLeadClientSecondary(lead = {}) {
  const role = normalizeLeadRole(lead)
  if (role === 'landlord') return 'Asset Manager / Property Manager'
  if (role === 'tenant') return 'Tenant Rep / Decision Maker'
  if (role === 'buyer') return 'Decision Maker'
  if (role === 'seller') return 'Asset Owner'
  return lead.companyName || 'Company pending'
}

function getLeadRequirementLabel(lead = {}) {
  const role = normalizeLeadRole(lead)
  const roleSpecific = getLeadRoleSpecific(lead)
  if (role === 'landlord') return normalizeText(lead.vacancyDetails || roleSpecific.vacancyPotential || lead.propertyName || roleSpecific.propertyDetails || lead.propertyAddress) || 'Vacancy potential'
  if (role === 'tenant') return normalizeText(lead.spaceRequirement || roleSpecific.requirementType || lead.lookingFor || lead.sizeRange) || 'Requirement pending'
  if (role === 'buyer') return normalizeText(lead.lookingFor || lead.sizeRange) || 'Requirement pending'
  return normalizeText(lead.propertyName || lead.propertyAddress) || 'Asset pending'
}

function getLeadBudgetDetails(lead = {}) {
  const amount = getLeadValue(lead)
  const role = normalizeLeadRole(lead)
  if (role === 'landlord') {
    return amount
      ? { value: formatCurrencyZAR(amount), label: 'Asking rental' }
      : { value: 'No value', label: 'Rental not set' }
  }
  if (role === 'tenant') {
    return amount
      ? { value: formatCurrencyZAR(amount), label: 'Target budget' }
      : { value: 'No value', label: 'Budget not set' }
  }
  return amount
    ? { value: formatCurrencyZAR(amount), label: role === 'buyer' ? 'Target budget' : 'Expected value' }
    : { value: 'No value', label: 'Value not set' }
}

function getControlledLeadStatusLabel(lead = {}) {
  const status = normalizeLeadStatus(lead.status)
  if (status === 'converted') return 'Converted'
  if (['archived', 'lost'].includes(status)) return 'Not Interested'
  if (['negotiation', 'proposal'].includes(status)) return 'Negotiation'
  if (status === 'qualified') return 'Qualified'
  if (status === 'active') return 'Active'
  if (['contacted', 'follow_up'].includes(status)) return 'Qualification'
  return 'New'
}

function getLeadStageSecondary(lead = {}) {
  return normalizeText(lead.lastActivityNote) || getLeadStageLabel(lead) || 'Call logged'
}

function isLeadQualifiedEnough(lead = {}) {
  const status = normalizeLeadStatus(lead.status)
  const stage = normalizeLower(lead.leadStage || lead.stage || lead.stageLabel)
  return ['qualified', 'proposal', 'negotiation', 'converted'].includes(status) || ['proposal', 'negotiation', 'converted'].includes(stage)
}

function getLeadStatusTone(lead = {}) {
  const status = getControlledLeadStatusLabel(lead)
  if (status === 'Converted') return 'green'
  if (status === 'Negotiation') return 'amber'
  if (status === 'Qualified') return 'blue'
  if (status === 'Active') return 'purple'
  if (status === 'Not Interested') return 'rose'
  return 'slate'
}

function isWithinDateFilter(value = '', filter = 'all') {
  if (filter === 'all') return true
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const days = filter === '7d' ? 7 : filter === '30d' ? 30 : filter === '90d' ? 90 : 0
  if (!days) return true
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return date >= cutoff
}

function buildLeadSearchText(lead = {}, lookupLabel = '') {
  return [
    lead.displayName,
    lead.companyName,
    lead.contactName,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.email,
    lead.area,
    lead.propertyName,
    lead.propertyAddress,
    lead.lookingFor,
    lead.spaceRequirement,
    lead.vacancyDetails,
    lead.notes,
    lead.followUpNote,
    lead.assignedBrokerName,
    lookupLabel,
    getRoleLabel(normalizeLeadRole(lead)),
    getDealTypeLabel(lead.dealType),
    getPropertyCategoryLabel(lead.propertyCategory),
    getLeadStageLabel(lead),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function extractNoteValue(notes = '', label = '') {
  const lines = String(notes || '').split('\n')
  const line = lines.find((item) => item.toLowerCase().startsWith(`${label.toLowerCase()}:`))
  if (!line) return ''
  return line.split(':').slice(1).join(':').trim()
}

function buildNotesSummary(draft = {}) {
  const rows = [
    draft.roleNote ? `Role note: ${draft.roleNote}` : '',
    draft.propertyAddress ? `Property / Asset Address or Area: ${draft.propertyAddress}` : '',
    draft.propertyName ? `Property / Portfolio Name: ${draft.propertyName}` : '',
    draft.areaNode ? `Area / Node: ${draft.areaNode}` : '',
    draft.requirementName ? `Requirement Name: ${draft.requirementName}` : '',
    draft.lookingFor ? `Looking For: ${draft.lookingFor}` : '',
    draft.preferredArea ? `Preferred Area / Node: ${draft.preferredArea}` : '',
    draft.spaceRequirement ? `Space Requirement: ${draft.spaceRequirement}` : '',
    draft.sizeRange ? `Size Range: ${draft.sizeRange}` : '',
    draft.budgetRange ? `Budget Range: ${draft.budgetRange}` : '',
    draft.vacancyDetails ? `Vacancy Details: ${draft.vacancyDetails}` : '',
    draft.reasonForSelling ? `Reason for Selling: ${draft.reasonForSelling}` : '',
    draft.expectedAskingPrice ? `Expected Asking Price: ${draft.expectedAskingPrice}` : '',
    draft.estimatedPropertyValue ? `Estimated Property Value: ${draft.estimatedPropertyValue}` : '',
    draft.desiredOccupationDate ? `Desired Occupation Date: ${draft.desiredOccupationDate}` : '',
    draft.fundingStatus ? `Funding Status: ${draft.fundingStatus}` : '',
    draft.requirementNotes ? `Requirement Notes: ${draft.requirementNotes}` : '',
    draft.targetPurchaseTimeline ? `Target Purchase Timeline: ${draft.targetPurchaseTimeline}` : '',
    draft.leaseTimeline ? `Lease Timeline: ${draft.leaseTimeline}` : '',
  ].filter(Boolean)
  return rows.length ? `Commercial lead details\n${rows.join('\n')}` : ''
}

function getDefaultBroker(lookups = {}) {
  const brokers = toLookupOptions(lookups).brokers || []
  const first = brokers[0]
  if (!first) return null
  return { value: first.value, label: first.label, branchId: first.branchId || '' }
}

function buildLookupMaps(lookups = {}) {
  const options = toLookupOptions(lookups)
  return {
    ...options,
    branches: (lookups.branches || []).map((row) => ({
      value: row.id,
      label: row.name || row.branch_name || 'Branch',
    })),
    teams: (lookups.teams || []).map((row) => ({
      value: row.id,
      label: row.name || row.team_name || 'Team',
    })),
  }
}

function LeadBadge({ children, tone = 'slate', className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(tone)} ${className}`.trim()}>
      {children}
    </span>
  )
}

function SearchField({ value, onChange, placeholder = 'Search leads...', className = '' }) {
  return (
    <label className={`flex h-11 items-center gap-2 rounded-[14px] border border-[#dce6f0] bg-white px-3 text-sm text-[#102236] shadow-sm transition focus-within:border-[#9fb9d1] focus-within:ring-4 focus-within:ring-[#dbeafe] ${className}`.trim()}>
      <Search size={17} className="shrink-0 text-[#6f86a0]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent font-medium outline-none placeholder:text-[#91a2b5]"
      />
    </label>
  )
}

function RegisterTab({ active = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative -mb-px inline-flex min-h-10 items-center gap-1 whitespace-nowrap border-b-2 px-1 text-sm font-semibold transition ${
        active
          ? 'border-[#1f6dd5] text-[#0d5ed0]'
          : 'border-transparent text-[#405671] hover:text-[#102236]'
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

function InlineTableEmptyState({ icon = CalendarDays, title, description, actionLabel, onAction, actions = null }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center border border-[#dce6f0] bg-white px-6 py-10 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#eef5ff] text-[#1f6dd5]">
        {createElement(icon, { size: 23 })}
      </span>
      <h3 className="mt-5 text-[1.25rem] font-semibold tracking-[-0.02em] text-[#102236]">{title}</h3>
      <p className="mt-3 max-w-[520px] text-sm leading-6 text-[#526985]">{description}</p>
      {actions ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {actions}
        </div>
      ) : actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[12px] border border-[#b9d2ff] bg-white px-5 text-sm font-semibold text-[#0d5ed0] transition hover:bg-[#f5f9ff]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

function CompactKpiItem({ label, value, trend, icon, tone = 'blue' }) {
  return (
    <article className="flex h-[76px] min-w-0 items-center gap-3 rounded-[16px] border border-[#e6edf4] bg-[#fbfdff] px-3.5 py-3">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] ${toneClass(tone)}`}>
        {createElement(icon, { size: 16 })}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-[1.35rem] font-semibold leading-none tracking-[-0.03em] text-[#061b3a]">{value}</p>
          <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">{label}</p>
        </div>
        <p className="mt-1 truncate text-xs font-medium text-[#7a8da3]">{trend}</p>
      </div>
    </article>
  )
}

function CommercialLeadDrawer({
  open,
  lead,
  activities = [],
  onClose,
  onEdit,
  onAddNote,
  onLogCall,
}) {
  const [activeTab, setActiveTab] = useState('overview')

  if (!open || !lead) return null

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity' },
    { id: 'notes', label: 'Notes' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'listings', label: 'Listings' },
    { id: 'documents', label: 'Documents' },
    { id: 'history', label: 'Conversion History' },
  ]

  const activityRows = activities || []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm">
      <aside className="flex h-full w-full max-w-[940px] flex-col bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.18)]">
        <header className="border-b border-slate-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Lead detail</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">{lead.displayName || 'Commercial lead'}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CommercialStatusPill value={lead.status} label={lead.statusLabel || normalizeText(lead.status) || 'New'} />
                <LeadBadge tone={getProspectBadgeVariant(lead.prospectRole)}>{getRoleLabel(lead.prospectRole)}</LeadBadge>
                <LeadBadge tone={getCategoryBadgeVariant(lead.propertyCategory)}>{getPropertyCategoryLabel(lead.propertyCategory)}</LeadBadge>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => onAddNote?.(lead)}>
              Add Note
            </Button>
            <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => onLogCall?.(lead)}>
              Log Call
            </Button>
            <Button variant="primary" size="sm" className="rounded-xl" onClick={() => onEdit?.(lead)}>
              Edit Lead
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveTab(section.id)}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                  activeTab === section.id
                    ? 'bg-blue-50 text-[#1267a3]'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-[#102236]'
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                {[
                  ['Company', lead.companyName || 'No company captured'],
                  ['Contact', lead.contactName || 'No contact captured'],
                  ['Phone', lead.phone || 'No phone captured'],
                  ['Email', lead.email || 'No email captured'],
                  ['Area', getLeadAreaLabel(lead)],
                  ['Broker', lead.assignedBrokerName || 'Unassigned'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</span>
                    <span className="max-w-[65%] text-right text-sm font-medium text-[#102236]">{value}</span>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                {[
                  ['Deal type', getDealTypeLabel(lead.dealType)],
                  ['Stage', getLeadStageLabel(lead)],
                  ['Source', lead.sourceLabel || 'Other'],
                  ['Budget', getLeadBudgetLabel(lead)],
                  ['Follow-up', lead.followUpDate ? formatShortDate(lead.followUpDate) : 'No follow-up set'],
                  ['Last activity', lead.lastActivityAt ? formatRelativeTime(lead.lastActivityAt) : 'No activity yet'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</span>
                    <span className="max-w-[65%] text-right text-sm font-medium text-[#102236]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'activity' ? (
            <div className="grid gap-3">
              {activityRows.length ? activityRows.map((activity) => (
                <article key={activity.id} className="rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#102236]">{activity.activityType || activity.title || 'Activity'}</p>
                      <p className="mt-1 text-sm text-slate-500">{activity.activityNote || activity.outcome || 'Activity logged'}</p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold text-slate-500">{formatRelativeTime(activity.createdAt || activity.created_at || activity.activityDate || activity.activity_date)}</p>
                  </div>
                </article>
              )) : <CommercialEmptyState title="No activity yet" description="Activity logged against this lead will appear here." />}
            </div>
          ) : null}

          {activeTab === 'notes' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Lead notes</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#102236]">{lead.notes || 'No notes captured yet.'}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Follow-up note</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#102236]">{lead.followUpNote || 'No follow-up note captured yet.'}</p>
              </div>
            </div>
          ) : null}

          {activeTab === 'tasks' ? (
            <div className="grid gap-3">
              {[
                lead.nextStepLabel || 'Review next step',
                lead.followUpDate ? `Follow up on ${formatShortDate(lead.followUpDate)}` : 'Add a follow-up date',
                'Assign or confirm broker ownership',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <p className="text-sm text-[#102236]">{item}</p>
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === 'requirements' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Conversion path</p>
                <p className="mt-2 text-sm text-[#102236]">
                  {normalizeLeadRole(lead) === 'seller'
                    ? 'Convert to a sales listing and open a deal.'
                    : normalizeLeadRole(lead) === 'buyer'
                      ? 'Convert to a buyer requirement and open a deal.'
                      : normalizeLeadRole(lead) === 'landlord'
                        ? 'Convert to a property / vacancy record and open a lease deal.'
                        : 'Convert to a tenant requirement and open a lease deal.'}
                </p>
                <div className="mt-4 grid gap-2">
                  <button type="button" disabled title="Conversion workflow coming soon" className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-400">
                    <ArrowRight size={14} />
                    Convert
                  </button>
                </div>
              </div>
              <CommercialEmptyState
                title="Conversion workflow coming soon"
                description="We’ll wire the direct conversion actions once the commercial lead staging service is ready."
              />
            </div>
          ) : null}

          {activeTab === 'listings' ? (
            <CommercialEmptyState
              title="No listings linked yet"
              description="Linked sales listings or vacancies will appear here once the lead is converted."
            />
          ) : null}

          {activeTab === 'documents' ? (
            <div className="grid gap-3">
              <Link to="/commercial/documents" className="inline-flex items-center justify-between rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4 text-sm font-semibold text-[#102236] transition hover:border-blue-200 hover:bg-white">
                <span>Open document centre</span>
                <ArrowRight size={14} className="text-[#1267a3]" />
              </Link>
            </div>
          ) : null}

          {activeTab === 'history' ? (
            <div className="grid gap-3">
              <article className="rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                <p className="text-sm font-semibold text-[#102236]">{normalizeLeadStatus(lead.status) === 'converted' ? 'Converted' : 'Not yet converted'}</p>
                <p className="mt-1 text-sm text-slate-500">{lead.convertedAt ? `Converted on ${formatShortDate(lead.convertedAt)}` : 'No conversion history yet.'}</p>
              </article>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function LeadActionsMenu({
  lead,
  open,
  onToggle,
  onEdit,
  onLogActivity,
  onSendOnboarding,
  onCreateVacancy,
  onCreateRequirement,
  onConvertToDeal,
  onArchive,
}) {
  const role = normalizeLeadRole(lead)
  const items = [
    { label: 'Edit Lead', icon: Pencil, onClick: onEdit },
    { label: 'Log Activity', icon: MessageSquare, onClick: onLogActivity },
    { label: 'Send Onboarding', icon: CalendarDays, onClick: onSendOnboarding },
    role === 'landlord' ? { label: 'Create Vacancy', icon: Building2, onClick: onCreateVacancy } : null,
    role === 'tenant' ? { label: 'Create Requirement', icon: Users, onClick: onCreateRequirement } : null,
    isLeadQualifiedEnough(lead) ? { label: 'Convert to Deal', icon: ArrowRight, onClick: onConvertToDeal } : null,
    { label: 'Archive', icon: Archive, onClick: onArchive },
  ].filter(Boolean)

  return (
    <div className="relative flex justify-end">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onToggle?.()
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
        aria-label="Lead actions"
      >
        <MoreHorizontal size={15} />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={!item.onClick}
              title={!item.onClick ? 'Conversion workflow coming soon' : undefined}
              onClick={(event) => {
                event.stopPropagation()
                item.onClick?.(lead)
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LeadRow({
  lead,
  onOpen,
  onEdit,
  onLogActivity,
  onSendOnboarding,
  onCreateVacancy,
  onCreateRequirement,
  onConvertToDeal,
  onArchive,
  menuOpen,
  onMenuToggle,
}) {
  const budget = getLeadBudgetDetails(lead)
  const statusLabel = getControlledLeadStatusLabel(lead)
  return (
    <tr className="cursor-pointer border-b border-slate-200 bg-white transition hover:bg-slate-50/60" onClick={() => onOpen?.(lead)}>
      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {lead.initials || 'CL'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#102236]">{getLeadTitle(lead)}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{getLeadContactName(lead)}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{getLeadContactPhone(lead)}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <LeadBadge tone={getProspectBadgeVariant(lead.prospectRole)}>{getLeadTypeLabel(lead)}</LeadBadge>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="grid gap-1">
          <LeadBadge tone={getCategoryBadgeVariant(lead.propertyCategory)}>
            <Building2 size={12} className="mr-1" />
            {getPropertyCategoryLabel(lead.propertyCategory)}
          </LeadBadge>
          <span className="max-w-[180px] text-xs text-slate-500">{getLeadRequirementLabel(lead)}</span>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold text-[#102236]">{getLeadClientRole(lead)}</p>
        <p className="mt-1 text-xs text-slate-500">{getLeadClientSecondary(lead)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-[#102236]">{getLeadAreaLabel(lead)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold text-[#102236]">{budget.value}</p>
        <p className="mt-1 text-xs text-slate-500">{budget.label}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {(lead.assignedBrokerName || 'U').slice(0, 2).toUpperCase()}
          </div>
          <p className="text-sm font-medium text-[#102236]">{lead.assignedBrokerName || 'Unassigned'}</p>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="grid gap-1">
          <LeadBadge tone={getLeadStatusTone(lead)}>{statusLabel}</LeadBadge>
          <span className="text-xs text-slate-500">{getLeadStageSecondary(lead)}</span>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-[#102236]">{lead.lastActivityAt ? formatRelativeTime(lead.lastActivityAt) : 'No activity yet'}</p>
        <p className="mt-1 text-xs text-slate-500">{lead.lastActivityNote || 'Lead created'}</p>
      </td>
      <td className="px-4 py-4 align-top" onClick={(event) => event.stopPropagation()}>
        <LeadActionsMenu
          lead={lead}
          open={menuOpen}
          onToggle={onMenuToggle}
          onEdit={onEdit}
          onLogActivity={onLogActivity}
          onSendOnboarding={onSendOnboarding}
          onCreateVacancy={onCreateVacancy}
          onCreateRequirement={onCreateRequirement}
          onConvertToDeal={onConvertToDeal}
          onArchive={onArchive}
        />
      </td>
    </tr>
  )
}

function LeadCard({
  lead,
  onOpen,
  onEdit,
  onLogActivity,
  onSendOnboarding,
  onCreateVacancy,
  onCreateRequirement,
  onConvertToDeal,
  onArchive,
  menuOpen,
  onMenuToggle,
}) {
  const budget = getLeadBudgetDetails(lead)
  return (
    <article className="rounded-[24px] border border-[#e6edf4] bg-white p-4 shadow-[0_8px_26px_rgba(0,0,0,0.04)]" onClick={() => onOpen?.(lead)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {lead.initials || 'CL'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#102236]">{getLeadTitle(lead)}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{getLeadContactName(lead)}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{getLeadContactPhone(lead)}</p>
          </div>
        </div>
        <LeadActionsMenu
          lead={lead}
          open={menuOpen}
          onToggle={onMenuToggle}
          onEdit={onEdit}
          onLogActivity={onLogActivity}
          onSendOnboarding={onSendOnboarding}
          onCreateVacancy={onCreateVacancy}
          onCreateRequirement={onCreateRequirement}
          onConvertToDeal={onConvertToDeal}
          onArchive={onArchive}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <LeadBadge tone={getProspectBadgeVariant(lead.prospectRole)}>{getLeadTypeLabel(lead)}</LeadBadge>
        <LeadBadge tone={getCategoryBadgeVariant(lead.propertyCategory)}>{getPropertyCategoryLabel(lead.propertyCategory)}</LeadBadge>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-[#102236]">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Area</span>
          <span className="min-w-0 truncate text-right font-semibold">{getLeadAreaLabel(lead)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Budget / Rental</span>
          <span className="font-semibold">{budget.value}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Broker</span>
          <span className="font-semibold">{lead.assignedBrokerName || 'Unassigned'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Status</span>
          <span className="font-semibold">{getControlledLeadStatusLabel(lead)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Last Activity</span>
          <span className="font-semibold">{lead.lastActivityAt ? formatRelativeTime(lead.lastActivityAt) : 'No activity yet'}</span>
        </div>
      </div>
    </article>
  )
}

function getLeadModalCompanyLabel(role = '') {
  if (role === 'seller') return 'Seller / Company Name'
  if (role === 'buyer') return 'Buyer / Company Name'
  if (role === 'landlord') return 'Landlord / Company Name'
  if (role === 'tenant') return 'Tenant / Company Name'
  return 'Company Name'
}

function getLeadModalRoleDescription(role = '') {
  if (role === 'seller') return 'Owner or vendor lead for a commercial sale instruction.'
  if (role === 'buyer') return 'Buyer mandate, acquisition requirement or investor enquiry.'
  if (role === 'landlord') return 'Landlord opportunity with stock, vacancy or mandate potential.'
  if (role === 'tenant') return 'Tenant demand that can become a requirement or lease deal.'
  return 'Qualified commercial opportunity.'
}

function LeadModalSectionHeader({ icon, title }) {
  const Icon = icon
  return (
    <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#eef5ff] text-[#0b4f82]">
        {Icon ? <Icon size={17} /> : null}
      </span>
      <h3 className="text-base font-semibold tracking-[-0.02em] text-[#102236]">{title}</h3>
    </div>
  )
}

function NewCommercialLeadModal({
  open,
  mode = 'create',
  record = null,
  lookups = {},
  organisationId = '',
  defaultRole = 'seller',
  roleOptions = COMMERCIAL_ROLE_OPTIONS,
  onClose,
  onSave,
}) {
  const brokerOptions = useMemo(() => toLookupOptions(lookups).brokers || [], [lookups])
  const defaultBroker = useMemo(() => getDefaultBroker(lookups), [lookups])
  const [selectedRole, setSelectedRole] = useState(defaultRole)
  const [draft, setDraft] = useState(() => buildInitialDraft(record, defaultBroker))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false

    async function prepareDraft() {
      const currentContext = await resolveCommercialAccessContext().catch(() => null)
      const currentBroker = brokerOptions.find((item) => {
        const userId = normalizeText(item.userId || item.user_id || item.value)
        return userId && userId === normalizeText(currentContext?.userId)
      })
      const broker = currentBroker || defaultBroker || brokerOptions[0] || null
      const nextDraft = buildInitialDraft(record, broker)
      const nextRole = normalizeKey(record?.prospectRole || (mode === 'edit' ? nextDraft.prospectRole : defaultRole) || defaultRole) || defaultRole
      nextDraft.prospectRole = nextRole
      nextDraft.dealType = getDealTypeFromRole(nextRole)
      if (!nextDraft.assignedBrokerId && broker?.value) nextDraft.assignedBrokerId = broker.value
      if (!nextDraft.assignedBrokerName && broker?.label) nextDraft.assignedBrokerName = broker.label
      if (!nextDraft.branchId && broker?.branchId) nextDraft.branchId = broker.branchId
      if (!cancelled) {
        setSelectedRole(nextRole)
        setDraft(nextDraft)
        setErrors({})
        setSaveError('')
      }
    }

    prepareDraft()
    return () => {
      cancelled = true
    }
  }, [brokerOptions, defaultBroker, defaultRole, mode, open, record])

  const selectedBroker = useMemo(
    () => brokerOptions.find((item) => item.value === draft.assignedBrokerId) || defaultBroker || brokerOptions[0] || null,
    [brokerOptions, defaultBroker, draft.assignedBrokerId],
  )

  const propertyFields = useMemo(() => {
    const assetClass = { name: 'propertyCategory', label: 'Asset Class', type: 'select', required: true, options: COMMERCIAL_CATEGORY_OPTIONS }
    const saleReasonOptions = [
      'Relocating',
      'Scaling down',
      'Portfolio optimisation',
      'Owner-occupier exit',
      'Investment disposal',
      'Development opportunity',
      'Unknown',
      'Other',
    ].map((value) => ({ value, label: value }))

    if (selectedRole === 'landlord') {
      return [
        { name: 'propertyName', label: 'Property / Portfolio Name', required: true },
        { name: 'propertyAddress', label: 'Property Address' },
        { name: 'areaNode', label: 'Area / Node' },
        assetClass,
        { name: 'vacancyDetails', label: 'Vacancy Details', as: 'textarea', span: 'full' },
        { name: 'estimatedMonthlyRental', label: 'Estimated Monthly Rental', type: 'number' },
        { name: 'estimatedAnnualRental', label: 'Estimated Annual Rental', type: 'number' },
      ]
    }

    if (selectedRole === 'tenant') {
      return [
        { name: 'requirementName', label: 'Requirement Name', required: true },
        { name: 'preferredArea', label: 'Preferred Area / Node', required: true },
        assetClass,
        { name: 'sizeRange', label: 'Required Size Range' },
        { name: 'budgetRange', label: 'Budget / Monthly Rental' },
        { name: 'desiredOccupationDate', label: 'Desired Occupation Date', type: 'date' },
        { name: 'requirementNotes', label: 'Requirement Notes', as: 'textarea', span: 'full' },
      ]
    }

    if (selectedRole === 'buyer') {
      return [
        { name: 'requirementName', label: 'Requirement Name', required: true },
        { name: 'preferredArea', label: 'Preferred Area / Node', required: true },
        assetClass,
        { name: 'budgetRange', label: 'Budget Range' },
        { name: 'sizeRange', label: 'Required Size Range' },
        { name: 'fundingStatus', label: 'Funding Status', type: 'select', options: LEAD_MODAL_FUNDING_OPTIONS },
        { name: 'requirementNotes', label: 'Requirement Notes', as: 'textarea', span: 'full' },
      ]
    }

    return [
      { name: 'propertyName', label: 'Property / Portfolio Name', required: true },
      { name: 'propertyAddress', label: 'Property Address' },
      { name: 'areaNode', label: 'Area / Node' },
      assetClass,
      { name: 'expectedAskingPrice', label: 'Expected Asking Price', type: 'number' },
      { name: 'estimatedPropertyValue', label: 'Estimated Property Value', type: 'number' },
      { name: 'reasonForSelling', label: 'Reason for Selling', type: 'select', options: saleReasonOptions },
    ]
  }, [selectedRole])

  const qualificationFields = useMemo(() => [
    { name: 'assignedBrokerId', label: 'Assigned Broker', type: 'select', required: true, options: brokerOptions },
    { name: 'canvassingMethod', label: 'Source / Method', type: 'select', options: LEAD_MODAL_SOURCE_OPTIONS },
    { name: 'status', label: 'Status', type: 'select', options: LEAD_MODAL_STATUS_OPTIONS },
    { name: 'priority', label: 'Priority', type: 'select', options: LEAD_MODAL_PRIORITY_OPTIONS },
    { name: 'followUpDate', label: 'Follow-up Date', type: 'date' },
    { name: 'notes', label: 'Notes', as: 'textarea', span: 'full' },
  ], [brokerOptions])

  if (!open) return null

  function updateDraft(key, value) {
    setDraft((previous) => {
      const next = { ...previous, [key]: value }
      if (key === 'assignedBrokerId') {
        const broker = brokerOptions.find((item) => item.value === value)
        next.assignedBrokerName = broker?.label || ''
        next.branchId = broker?.branchId || ''
      }
      return next
    })
    setErrors((previous) => {
      if (!previous[key]) return previous
      const next = { ...previous }
      delete next[key]
      return next
    })
  }

  function handleRoleChange(nextRole) {
    if (nextRole === selectedRole) return
    const roleSpecificKeys = [
      'propertyName',
      'propertyAddress',
      'areaNode',
      'requirementName',
      'lookingFor',
      'preferredArea',
      'spaceRequirement',
      'sizeRange',
      'budgetRange',
      'vacancyDetails',
      'reasonForSelling',
      'desiredOccupationDate',
      'fundingStatus',
      'expectedAskingPrice',
      'estimatedPropertyValue',
      'requirementNotes',
      'leaseTimeline',
      'targetPurchaseTimeline',
    ]
    const hasTypedValues = roleSpecificKeys.some((key) => Boolean(normalizeText(draft[key])))
    if (hasTypedValues && !window.confirm('Changing the lead type may hide some entered fields. Continue?')) return
    setSelectedRole(nextRole)
    setDraft((previous) => ({
      ...previous,
      prospectRole: nextRole,
      dealType: getDealTypeFromRole(nextRole),
      propertyCategory: previous.propertyCategory || 'commercial',
    }))
    setErrors({})
  }

  function validateLead() {
    const nextErrors = {}
    if (!normalizeText(draft.companyName)) nextErrors.companyName = 'Add the company or client name.'
    if (!normalizeText(draft.phone)) nextErrors.phone = 'Add a contact number.'
    if (!normalizeText(draft.propertyCategory)) nextErrors.propertyCategory = 'Choose an asset class.'
    if (!normalizeText(draft.assignedBrokerId)) nextErrors.assignedBrokerId = 'Assign a broker.'

    if (selectedRole === 'landlord' || selectedRole === 'seller') {
      if (!normalizeText(draft.propertyName)) nextErrors.propertyName = 'Add a property or portfolio name.'
    }
    if (selectedRole === 'tenant' || selectedRole === 'buyer') {
      if (!normalizeText(draft.requirementName || draft.spaceRequirement || draft.lookingFor)) nextErrors.requirementName = 'Add a requirement name.'
      if (!normalizeText(draft.preferredArea)) nextErrors.preferredArea = 'Add a preferred area or node.'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!validateLead()) return

    const payload = buildLeadPayload(draft, selectedRole, selectedBroker, organisationId)
    try {
      setSaving(true)
      setSaveError('')
      const saved = mode === 'edit' && record?.id
        ? await updateCommercialCanvassingProspect(payload.organisationId, record.id, payload.body)
        : await createCommercialCanvassingProspect(payload.organisationId, payload.body)
      onSave?.(saved)
      onClose?.()
    } catch (error) {
      setSaveError(String(error?.message || error || 'The lead could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  function renderField(field) {
    const value = draft[field.name] ?? ''
    const inputClass = `min-h-11 w-full rounded-2xl border bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe] ${
      errors[field.name] ? 'border-rose-300' : 'border-slate-200'
    }`

    if (field.as === 'textarea') {
      return (
        <textarea
          rows={field.rows || 4}
          value={value}
          onChange={(event) => updateDraft(field.name, event.target.value)}
          className={`${inputClass} py-3`}
        />
      )
    }

    if (field.type === 'select') {
      return (
        <select value={value} onChange={(event) => updateDraft(field.name, event.target.value)} className={inputClass}>
          <option value="">{field.placeholder || 'Select...'}</option>
          {(field.options || []).map((option) => (
            <option key={option.value || option} value={option.value || option}>
              {option.label || option}
            </option>
          ))}
        </select>
      )
    }

    return (
      <Field
        value={value}
        onChange={(event) => updateDraft(field.name, event.target.value)}
        type={field.type || 'text'}
        placeholder={field.placeholder || field.label}
        className={inputClass}
      />
    )
  }

  function renderFieldShell(field) {
    return (
      <label key={field.name} className={field.span === 'full' ? 'grid gap-1.5 md:col-span-2' : 'grid gap-1.5'}>
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          {field.label}
          {field.required ? <span className="text-rose-500"> *</span> : null}
        </span>
        {renderField(field)}
        {errors[field.name] ? <span className="text-xs font-semibold text-rose-600">{errors[field.name]}</span> : null}
      </label>
    )
  }

  const roleCards = roleOptions.filter((option) => ['seller', 'buyer', 'landlord', 'tenant'].includes(option.value))
  const contactFields = [
    { name: 'companyName', label: getLeadModalCompanyLabel(selectedRole), required: true },
    { name: 'contactPerson', label: 'Contact Person' },
    { name: 'phone', label: 'Contact Number', type: 'tel', required: true },
    { name: 'email', label: 'Email Address', type: 'email' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f1f33]/45 px-3 py-4 backdrop-blur-sm sm:px-6">
      <form id="commercial-lead-form" onSubmit={handleSubmit} className="my-auto flex max-h-[calc(100dvh-32px)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(15,31,51,0.22)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#102236]">{mode === 'edit' ? 'Edit Lead' : 'New Lead'}</h2>
            <p className="mt-1 text-sm text-slate-500">Capture a qualified commercial opportunity and route it into the correct pipeline.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-[#102236]" aria-label="Close lead modal">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {saveError ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{saveError}</div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {roleCards.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleRoleChange(option.value)}
                className={`rounded-[22px] border p-4 text-left transition ${
                  selectedRole === option.value
                    ? 'border-[#8ab4e6] bg-[#eef6ff] shadow-[0_12px_30px_rgba(18,103,163,0.12)]'
                    : 'border-slate-200 bg-white hover:border-[#b9cfe6] hover:bg-[#fbfcfe]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${selectedRole === option.value ? 'bg-white text-[#0b4f82]' : 'bg-[#f5f8fd] text-slate-500'}`}>
                    <Users size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102236]">{option.label} Lead</p>
                      {selectedRole === option.value ? <CheckCircle2 size={17} className="text-[#0b76bd]" /> : <span className="h-4 w-4 rounded-full border border-slate-300" />}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{getLeadModalRoleDescription(option.value)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4 sm:p-5">
            <LeadModalSectionHeader icon={Users} title="1. Contact / Company Details" />
            <div className="grid gap-4 md:grid-cols-2">{contactFields.map(renderFieldShell)}</div>
          </section>

          <section className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 sm:p-5">
            <LeadModalSectionHeader icon={Building2} title="2. Property / Requirement Details" />
            <div className="grid gap-4 md:grid-cols-2">{propertyFields.map(renderFieldShell)}</div>
          </section>

          <section className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 sm:p-5">
            <LeadModalSectionHeader icon={CheckCircle2} title="3. Lead Qualification" />
            <div className="grid gap-4 md:grid-cols-2">{qualificationFields.map(renderFieldShell)}</div>
          </section>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-[#fbfcfe] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="secondary" className="rounded-2xl" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" className="rounded-2xl bg-[#092f57]" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Lead'}
          </Button>
        </footer>
      </form>
    </div>
  )
}

function buildLeadPayload(draft, selectedRole, selectedBroker, organisationId) {
  const dealType = getDealTypeFromRole(selectedRole)
  const companyName = normalizeText(draft.companyName)
  const contactName = normalizeText(draft.contactPerson)
  const split = splitContactName(contactName)
  const estimatedFromAskingPrice = Number(draft.expectedAskingPrice || 0)
  const estimatedFromPropertyValue = Number(draft.estimatedPropertyValue || 0)
  const estimatedFromSale = Number(draft.estimatedSaleValue || 0)
  const estimatedFromMonthly = Number(draft.estimatedMonthlyRental || 0) * 12
  const estimatedFromAnnual = Number(draft.estimatedAnnualRental || 0)
  const estimatedValue = dealType === 'lease'
    ? (estimatedFromAnnual || estimatedFromMonthly || Number(draft.budgetRange || 0) || 0)
    : (estimatedFromAskingPrice || estimatedFromPropertyValue || estimatedFromSale || Number(draft.budgetRange || 0) || 0)
  const addressOrArea = normalizeText(draft.propertyAddress || draft.areaNode || draft.preferredArea || draft.propertyName || draft.requirementName || draft.spaceRequirement)
  const preferredArea = normalizeText(draft.preferredArea || draft.areaNode)
  const requirementName = normalizeText(draft.requirementName || draft.spaceRequirement || draft.lookingFor)
  const preservedProspectData = {
    type: selectedRole,
    companyName: companyName || null,
    contactPerson: contactName || null,
    contactNumber: normalizeText(draft.phone) || null,
    email: normalizeText(draft.email) || null,
    address: addressOrArea || null,
    area: preferredArea || normalizeText(draft.propertyAddress) || addressOrArea || null,
    assetClass: draft.propertyCategory || null,
    brokerId: draft.assignedBrokerId || selectedBroker?.value || null,
    brokerName: draft.assignedBrokerName || selectedBroker?.label || null,
    source: draft.canvassingMethod || 'Cold Call',
    notes: normalizeText(draft.notes) || null,
    propertyName: normalizeText(draft.propertyName) || null,
    propertyAddress: normalizeText(draft.propertyAddress) || null,
    areaNode: normalizeText(draft.areaNode) || null,
    requirementName: requirementName || null,
    preferredArea: preferredArea || null,
    budgetRange: normalizeText(draft.budgetRange) || null,
    sizeRange: normalizeText(draft.sizeRange) || null,
  }
  const leadQualificationFields = selectedRole === 'landlord'
    ? {
      relationshipType: 'Owner',
      propertyName: normalizeText(draft.propertyName) || null,
      propertyAddress: normalizeText(draft.propertyAddress) || null,
      areaNode: normalizeText(draft.areaNode) || null,
      propertyDetails: normalizeText(draft.propertyName || draft.propertyAddress) || null,
      vacancyPotential: normalizeText(draft.vacancyDetails) || null,
      mandateType: normalizeText(draft.reasonForSelling) || null,
      askingRental: normalizeText(draft.estimatedMonthlyRental || draft.estimatedAnnualRental) || null,
      estimatedMonthlyRental: normalizeText(draft.estimatedMonthlyRental) || null,
      estimatedAnnualRental: normalizeText(draft.estimatedAnnualRental) || null,
      availability: normalizeText(draft.leaseTimeline || draft.targetPurchaseTimeline) || null,
      followUpDate: draft.followUpDate || null,
      qualificationNotes: normalizeText(draft.notes) || null,
    }
    : selectedRole === 'tenant'
      ? {
        requirementName: requirementName || null,
        requirementType: requirementName || null,
        preferredAreas: preferredArea ? [preferredArea] : [],
        areaNode: preferredArea || null,
        minSize: normalizeText(draft.sizeRange) || null,
        maxSize: normalizeText(draft.sizeRange) || null,
        budget: normalizeText(draft.budgetRange || draft.estimatedMonthlyRental || draft.estimatedAnnualRental) || null,
        desiredOccupationDate: draft.desiredOccupationDate || null,
        timing: normalizeText(draft.desiredOccupationDate || draft.leaseTimeline || draft.targetPurchaseTimeline) || null,
        decisionMaker: contactName || null,
        requirementNotes: normalizeText(draft.requirementNotes) || null,
        qualificationNotes: normalizeText(draft.notes || draft.requirementNotes) || null,
      }
      : selectedRole === 'seller'
        ? {
          propertyName: normalizeText(draft.propertyName) || null,
          propertyAddress: normalizeText(draft.propertyAddress) || null,
          areaNode: normalizeText(draft.areaNode) || null,
          propertyDetails: normalizeText(draft.propertyName || draft.propertyAddress) || null,
          expectedAskingPrice: normalizeText(draft.expectedAskingPrice) || null,
          estimatedPropertyValue: normalizeText(draft.estimatedPropertyValue) || null,
          reasonForSelling: normalizeText(draft.reasonForSelling) || null,
          qualificationNotes: normalizeText(draft.notes) || null,
        }
        : {
          requirementName: requirementName || null,
          requirementType: requirementName || null,
          preferredAreas: preferredArea ? [preferredArea] : [],
          areaNode: preferredArea || null,
          budget: normalizeText(draft.budgetRange) || null,
          sizeRange: normalizeText(draft.sizeRange) || null,
          fundingStatus: normalizeText(draft.fundingStatus) || null,
          requirementNotes: normalizeText(draft.requirementNotes) || null,
          qualificationNotes: normalizeText(draft.notes || draft.requirementNotes) || null,
        }

  return {
    organisationId: normalizeText(organisationId),
    body: {
      prospectType: `${getRoleLabel(selectedRole)} Prospect`,
      prospectRole: selectedRole,
      dealType,
      canvassingMethod: draft.canvassingMethod || 'Cold Call',
      propertyType: draft.propertyCategory || 'commercial',
      status: draft.status || 'New',
      nextFollowUpDate: draft.followUpDate || null,
      followUpPriority: draft.priority || 'Medium',
      followUpNote: '',
      estimatedValue: estimatedValue || null,
      notes: [draft.notes, buildNotesSummary(draft)].filter(Boolean).join('\n\n') || null,
      branchId: selectedBroker?.branchId || draft.branchId || null,
      assignedBrokerId: draft.assignedBrokerId || selectedBroker?.value || null,
      assignedBrokerName: draft.assignedBrokerName || selectedBroker?.label || null,
      companyName: companyName || null,
      contactName: contactName || null,
      firstName: split.firstName || (dealType === 'lease' ? 'Lead' : 'Lead'),
      lastName: split.lastName || null,
      phone: draft.phone || null,
      email: draft.email || null,
      area: addressOrArea || null,
      propertyCategory: draft.propertyCategory || null,
      propertyName: normalizeText(draft.propertyName) || null,
      propertyAddress: normalizeText(draft.propertyAddress) || null,
      preferredArea: preferredArea || null,
      lookingFor: requirementName || null,
      spaceRequirement: normalizeText(draft.sizeRange || draft.spaceRequirement) || null,
      sizeRange: normalizeText(draft.sizeRange) || null,
      budgetRange: normalizeText(draft.budgetRange) || null,
      vacancyDetails: normalizeText(draft.vacancyDetails) || null,
      roleSpecific: {
        preservedProspectData,
        ...leadQualificationFields,
      },
    },
  }
}

function getBrokerLookupById(brokers = [], brokerId = '') {
  return brokers.find((row) => normalizeText(row.value) === normalizeText(brokerId)) || null
}

function deriveSummaryStats(leads = [], activities = []) {
  const metrics = deriveCommercialCanvassingMetrics(leads, activities)
  const qualifiedLeads = leads.filter((lead) => ['qualified', 'proposal', 'negotiation'].includes(normalizeLeadStatus(lead.status))).length
  const activeLeads = leads.filter((lead) => !['archived', 'lost'].includes(normalizeLeadStatus(lead.status))).length
  return { ...metrics, qualifiedLeads, activeLeads }
}

function CommercialLeadsPage({ dealType = '' }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const pageView = useMemo(() => getLeadPageViewConfig(dealType), [dealType])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [organisationId, setOrganisationId] = useState('')
  const [workspace, setWorkspace] = useState({ prospects: [], activities: [] })
  const [lookups, setLookups] = useState({})
  const [activeTab, setActiveTab] = useState(() => {
    const initial = normalizeKey(searchParams.get('tab'))
    return pageView.tabs.some((tab) => tab.id === initial) ? initial : pageView.tabs[0]?.id || 'all'
  })
  const [roleFilter, setRoleFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState('updatedAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState({
    branch: 'all',
    team: 'all',
    assigned: 'all',
    status: 'all',
    stage: 'all',
    propertyType: 'all',
    budget: 'all',
    source: 'all',
    area: '',
    dateAdded: 'all',
    lastActivity: 'all',
  })
  const [drawerLead, setDrawerLead] = useState(null)
  const [modalState, setModalState] = useState({ open: false, mode: 'create', record: null, role: pageView.defaultCreateRole })
  const [openMenuId, setOpenMenuId] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const context = await resolveCommercialOrganisationContext()
      const nextOrganisationId = context.organisationId || ''
      const [nextWorkspace, nextLookups] = await Promise.all([
        nextOrganisationId ? listCommercialCanvassingWorkspace(nextOrganisationId) : Promise.resolve({ prospects: [], activities: [] }),
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : Promise.resolve({}),
      ])
      setOrganisationId(nextOrganisationId)
      setWorkspace(nextWorkspace || { prospects: [], activities: [] })
      setLookups(nextLookups || {})
      return { organisationId: nextOrganisationId, workspace: nextWorkspace || { prospects: [], activities: [] }, lookups: nextLookups || {} }
    } catch (loadError) {
      setError(String(loadError?.message || loadError || 'Commercial leads could not be loaded.'))
      setWorkspace({ prospects: [], activities: [] })
      return { organisationId: '', workspace: { prospects: [], activities: [] }, lookups: {} }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!pageView.tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(pageView.tabs[0]?.id || 'all')
      setRoleFilter('all')
    }
  }, [activeTab, pageView.tabs])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', activeTab)
    setSearchParams(next, { replace: true })
  }, [activeTab, searchParams, setSearchParams])

  const lookupMaps = useMemo(() => buildLookupMaps(lookups), [lookups])
  const brokerChoices = useMemo(() => (lookupMaps.brokers || []).map((row) => ({
    ...row,
    branchId: getBrokerLookupById(lookups?.brokers || [], row.value)?.branchId || '',
  })), [lookupMaps.brokers, lookups?.brokers])

  const normalizedLeads = useMemo(() => {
    const activitiesByLeadId = new Map()
    ;(workspace.activities || []).forEach((activity) => {
      const prospectId = normalizeText(activity.prospectId || activity.prospect_id)
      if (!prospectId) return
      if (!activitiesByLeadId.has(prospectId)) activitiesByLeadId.set(prospectId, [])
      activitiesByLeadId.get(prospectId).push(activity)
    })

    return (workspace.prospects || []).map((row) => {
      const broker = brokerChoices.find((item) => normalizeText(item.value) === normalizeText(row.assignedBrokerId))
      const lastActivity = activitiesByLeadId.get(row.id)?.[0] || null
      const lead = normaliseCommercialProspect(row, {
        assignedBrokerName: row.assignedBrokerName || broker?.label || '',
        branchId: row.branchId || broker?.branchId || '',
        lastActivity,
      })
      const stageLabel = getLeadStageLabel(lead)
      const searchText = buildLeadSearchText(lead, broker?.label || '')
      const displayName = lead.displayName || getRoleLabel(lead.prospectRole) || 'Commercial lead'
      return {
        ...lead,
        id: row.id,
        displayName,
        initials: displayName
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toUpperCase(),
        branchId: row.branchId || lead.branchId || '',
        branchName: normalizeText((lookups.branches || []).find((branch) => branch.id === (row.branchId || lead.branchId))?.name),
        teamId: row.teamId || lead.teamId || '',
        assignedBrokerId: row.assignedBrokerId || '',
        assignedBrokerName: row.assignedBrokerName || broker?.label || 'Unassigned',
        lastActivityAt: lastActivity?.createdAt || lastActivity?.created_at || lastActivity?.activityDate || lastActivity?.activity_date || lead.updatedAt || lead.updated_at || lead.createdAt || lead.created_at,
        lastActivityNote: normalizeText(lastActivity?.activityNote || lastActivity?.activity_note || lastActivity?.outcome) || 'Lead created',
        statusLabel: normalizeText(row.status) || 'New',
        stageLabel,
        searchText,
        valueBand: parseBudgetBand(getLeadValue(lead)),
      }
    })
  }, [brokerChoices, lookups.branches, workspace.activities, workspace.prospects])

  const pageScopedLeads = useMemo(() => {
    if (pageView.baseDealType === 'all') return normalizedLeads
    return normalizedLeads.filter((lead) => normalizeLower(lead.dealType || getDealTypeFromRole(normalizeLeadRole(lead))) === pageView.baseDealType)
  }, [normalizedLeads, pageView.baseDealType])
  const activeTabConfig = useMemo(
    () => pageView.tabs.find((tab) => tab.id === activeTab) || pageView.tabs[0] || ALL_LEAD_TABS[0],
    [activeTab, pageView.tabs],
  )
  const visibleLeads = useMemo(() => {
    const coreFilters = {
      search: searchTerm,
      dealType: pageView.baseDealType,
      role: roleFilter,
      category: categoryFilter,
      branch: advancedFilters.branch,
      team: advancedFilters.team,
      assigned: advancedFilters.assigned,
      status: 'all',
      stage: advancedFilters.stage,
    }
    let rows = filterCommercialProspects(normalizedLeads, coreFilters)
    rows = rows.filter((lead) => {
      if (!activeTabConfig.matches(lead)) return false
      if (advancedFilters.propertyType !== 'all' && normalizeLower(lead.propertyCategory) !== normalizeLower(advancedFilters.propertyType)) return false
      if (advancedFilters.budget !== 'all' && !matchesBudgetBand(getLeadValue(lead), advancedFilters.budget)) return false
      if (advancedFilters.status !== 'all' && normalizeLower(getControlledLeadStatusLabel(lead)) !== normalizeLower(advancedFilters.status)) return false
      if (advancedFilters.source !== 'all' && normalizeLower(lead.sourceLabel || lead.canvassingMethod) !== normalizeLower(advancedFilters.source)) return false
      if (normalizeText(advancedFilters.area) && !getLeadAreaLabel(lead).toLowerCase().includes(normalizeText(advancedFilters.area).toLowerCase())) return false
      if (!isWithinDateFilter(lead.createdAt || lead.created_at, advancedFilters.dateAdded)) return false
      if (!isWithinDateFilter(lead.lastActivityAt, advancedFilters.lastActivity)) return false
      return true
    })
    rows = [...rows].sort((left, right) => {
      const leftValue = sortKey === 'value' ? getLeadValue(left) : left?.[sortKey] || left?.updatedAt || left?.createdAt || ''
      const rightValue = sortKey === 'value' ? getLeadValue(right) : right?.[sortKey] || right?.updatedAt || right?.createdAt || ''
      const leftDate = new Date(leftValue)
      const rightDate = new Date(rightValue)
      const leftNumeric = Number(leftValue)
      const rightNumeric = Number(rightValue)
      let comparison = 0
      if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric) && sortKey === 'value') {
        comparison = leftNumeric - rightNumeric
      } else if (!Number.isNaN(leftDate.getTime()) && !Number.isNaN(rightDate.getTime()) && ['updatedAt', 'createdAt', 'lastActivityAt', 'followUpDate'].includes(sortKey)) {
        comparison = leftDate.getTime() - rightDate.getTime()
      } else {
        comparison = String(leftValue || '').localeCompare(String(rightValue || ''), undefined, { numeric: true, sensitivity: 'base' })
      }
      return sortDirection === 'desc' ? -comparison : comparison
    })
    return rows
  }, [activeTabConfig, advancedFilters.area, advancedFilters.assigned, advancedFilters.budget, advancedFilters.branch, advancedFilters.dateAdded, advancedFilters.lastActivity, advancedFilters.propertyType, advancedFilters.source, advancedFilters.stage, advancedFilters.status, advancedFilters.team, categoryFilter, normalizedLeads, pageView.baseDealType, roleFilter, searchTerm, sortDirection, sortKey])

  const metrics = useMemo(() => deriveSummaryStats(pageScopedLeads, workspace.activities || []), [pageScopedLeads, workspace.activities])
  const roleMetrics = useMemo(() => {
    const activeRows = pageScopedLeads.filter((lead) => !['archived', 'lost'].includes(normalizeLeadStatus(lead.status)))
    if (pageView.key === 'sale') {
      return { primaryLabel: 'Sellers', primaryValue: activeRows.filter((lead) => normalizeLeadRole(lead) === 'seller').length, secondaryLabel: 'Buyers', secondaryValue: activeRows.filter((lead) => normalizeLeadRole(lead) === 'buyer').length }
    }
    if (pageView.key === 'lease') {
      return { primaryLabel: 'Landlords', primaryValue: activeRows.filter((lead) => normalizeLeadRole(lead) === 'landlord').length, secondaryLabel: 'Tenants', secondaryValue: activeRows.filter((lead) => normalizeLeadRole(lead) === 'tenant').length }
    }
    return { primaryLabel: 'Sales Leads', primaryValue: activeRows.filter((lead) => normalizeLower(lead.dealType || getDealTypeFromRole(normalizeLeadRole(lead))) === 'sale').length, secondaryLabel: 'Lease Leads', secondaryValue: activeRows.filter((lead) => normalizeLower(lead.dealType || getDealTypeFromRole(normalizeLeadRole(lead))) === 'lease').length }
  }, [pageScopedLeads, pageView.key])

  useEffect(() => {
    if (!visibleLeads.length) setDrawerLead(null)
  }, [visibleLeads.length])

  function openCreateLead(nextRole = pageView.defaultCreateRole) {
    setModalState({ open: true, mode: 'create', record: null, role: nextRole })
    setShowCreateMenu(false)
  }

  function openEditLead(lead) {
    setModalState({ open: true, mode: 'edit', record: lead, role: lead?.prospectRole || pageView.defaultCreateRole })
    setOpenMenuId('')
  }

  function openDrawer(lead) {
    const leadId = normalizeText(lead?.id)
    if (!leadId) return
    const role = normalizeLeadRole(lead)
    const routeDealType = pageView.baseDealType === 'sale' || pageView.baseDealType === 'lease'
      ? pageView.baseDealType
      : normalizeLower(lead?.dealType || getDealTypeFromRole(role)) === 'sale'
        ? 'sale'
        : 'lease'
    const basePath = routeDealType === 'sale' ? '/commercial/sales/leads' : '/commercial/leasing/leads'
    navigate(`${basePath}/${encodeURIComponent(leadId)}${location.search || ''}`)
    setOpenMenuId('')
  }

  function handleAddNote(lead) {
    const note = window.prompt('Add a note for this lead')
    if (!normalizeText(note)) return
    void createCommercialCanvassingActivity(organisationId, {
      prospectId: lead.id,
      activityType: 'Note',
      activityNote: note,
    }).then(() => loadData())
  }

  function handleLogCall(lead) {
    const note = window.prompt('Call outcome / note')
    if (!normalizeText(note)) return
    void createCommercialCanvassingActivity(organisationId, {
      prospectId: lead.id,
      activityType: 'Call',
      activityNote: note,
    }).then(() => loadData())
  }

  function handleArchive(lead) {
    if (!window.confirm('Archive this lead?')) return
    void updateCommercialCanvassingProspect(organisationId, lead.id, {
      status: 'Archived',
      archivedAt: new Date().toISOString(),
    }).then(() => loadData())
  }

  function handleSendOnboarding(lead) {
    setOpenMenuId('')
    window.alert(`Send onboarding for ${getLeadTitle(lead)} is ready to connect to the onboarding workflow.`)
  }

  function handleCreateVacancy(lead) {
    setOpenMenuId('')
    window.alert(`Create Vacancy from ${getLeadTitle(lead)} is ready to connect to the vacancy creation workflow.`)
  }

  function handleCreateRequirement(lead) {
    setOpenMenuId('')
    window.alert(`Create Requirement from ${getLeadTitle(lead)} is ready to connect to the requirement workflow.`)
  }

  function handleConvertToDeal(lead) {
    setOpenMenuId('')
    if (!isLeadQualifiedEnough(lead)) return
    window.alert(`Convert ${getLeadTitle(lead)} to Deal is ready to connect to the deal workflow.`)
  }

  async function handleSaveLead(savedLead) {
    const refreshed = await loadData()
    const savedId = normalizeText(savedLead?.id)
    const nextLead = savedId
      ? (refreshed.workspace?.prospects || []).find((item) => normalizeText(item.id) === savedId)
      : null
    setDrawerLead(nextLead ? normaliseCommercialProspect(nextLead, {}) : (savedLead ? normaliseCommercialProspect(savedLead, {}) : null))
  }

  function renderEmptyState() {
    const copy = pageView.emptyCopy[activeTab] || pageView.emptyCopy.all || EMPTY_LEAD_COPY.all
    return (
      <InlineTableEmptyState
        icon={CalendarDays}
        title={copy.title}
        description={copy.description}
        actionLabel={pageView.createLabel.replace(/^\+\s*/, '')}
        onAction={() => openCreateLead(pageView.defaultCreateRole)}
      />
    )
  }

  const tableTotalCount = visibleLeads.length
  const tableStart = tableTotalCount ? 1 : 0
  const tableEnd = tableTotalCount
  const currentSortLabel = LEAD_SORT_OPTIONS.find((option) => option.value === `${sortKey}:${sortDirection}`)?.label || 'Newest Updated'
  const advancedFilterCount = [
    searchTerm,
    activeTab,
    roleFilter,
    categoryFilter,
    advancedFilters.branch,
    advancedFilters.team,
    advancedFilters.assigned,
    advancedFilters.status,
    advancedFilters.stage,
    advancedFilters.propertyType,
    advancedFilters.budget,
    advancedFilters.source,
    advancedFilters.area,
    advancedFilters.dateAdded,
    advancedFilters.lastActivity,
  ].filter((value) => normalizeText(value) && value !== 'all').length
  const shouldShowAdvancedFilters = showAdvancedFilters || advancedFilterCount > 0
  const resetLeadFilters = () => {
    setSearchTerm('')
    setRoleFilter('all')
    setCategoryFilter('all')
    setActiveTab('all')
    setAdvancedFilters({
      branch: 'all',
      team: 'all',
      assigned: 'all',
      status: 'all',
      stage: 'all',
      propertyType: 'all',
      budget: 'all',
      source: 'all',
      area: '',
      dateAdded: 'all',
      lastActivity: 'all',
    })
    setShowAdvancedFilters(false)
  }

  return (
    <div className="pb-10">
      <article className={`${CARD_CLASS} overflow-hidden p-4 sm:p-5`}>
        <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#102236]">{pageView.title}</h1>
            <p className="mt-1.5 text-sm leading-6 text-[#4f6680]">{pageView.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pageView.key === 'lease' ? (
              <Button
                type="button"
                onClick={() => openCreateLead(pageView.defaultCreateRole)}
                className="h-11 rounded-[14px] bg-[#102b46] px-4 shadow-[0_12px_28px_rgba(16,43,70,0.18)] hover:bg-[#143858]"
              >
                <Plus size={16} />
                {pageView.createLabel.replace(/^\+\s*/, '')}
              </Button>
            ) : (
              <div className="relative">
                <Button
                  type="button"
                  onClick={() => setShowCreateMenu((current) => !current)}
                  className="h-11 rounded-[14px] bg-[#102b46] px-4 shadow-[0_12px_28px_rgba(16,43,70,0.18)] hover:bg-[#143858]"
                >
                  <Plus size={16} />
                  {pageView.createLabel.replace(/^\+\s*/, '')}
                </Button>
                {showCreateMenu ? (
                  <div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                    {pageView.roleOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => openCreateLead(option.value)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
                      >
                        <Users size={14} />
                        Add {option.label} Lead
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            <Button type="button" variant="secondary" className="h-11 rounded-[14px] px-4" disabled title="Import is coming soon">
              <Download size={16} />
              Import
            </Button>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#dce6f0] bg-white text-[#62758b] shadow-sm transition hover:border-[#bfd2e6] hover:bg-[#f8fbff] hover:text-[#0f2748]"
              aria-label="More page actions"
            >
              <MoreHorizontal size={17} />
            </button>
          </div>
        </section>

        <section className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <CompactKpiItem
            label="Total Leads"
            value={loading ? '...' : metrics.prospects}
            trend={`${metrics.activeLeads || 0} active`}
            icon={Users}
            tone="blue"
          />
          <CompactKpiItem
            label={roleMetrics.primaryLabel}
            value={loading ? '...' : roleMetrics.primaryValue}
            trend={pageView.key === 'lease' ? 'Owner-side' : 'Vendor-side'}
            icon={Building2}
            tone="green"
          />
          <CompactKpiItem
            label={roleMetrics.secondaryLabel}
            value={loading ? '...' : roleMetrics.secondaryValue}
            trend={pageView.key === 'lease' ? 'Occupier-side' : 'Acquirer-side'}
            icon={Users}
            tone="purple"
          />
          <CompactKpiItem
            label="Follow Ups Due"
            value={loading ? '...' : metrics.followUpsDue}
            trend={metrics.overdueFollowUps ? `${metrics.overdueFollowUps} overdue` : 'No overdue follow-ups'}
            icon={CalendarDays}
            tone="amber"
          />
          <CompactKpiItem
            label="Converted"
            value={loading ? '...' : metrics.converted}
            trend="Moved into workflow"
            icon={CheckCircle2}
            tone="emerald"
          />
        </section>

        <div className="mt-4 border-b border-[#e8eef5]">
          <div className="flex gap-5 overflow-x-auto">
            {pageView.tabs.map((tab) => {
              const count = pageScopedLeads.filter((lead) => tab.matches(lead)).length
              return (
                <RegisterTab
                  key={tab.id}
                  active={activeTab === tab.id}
                  onClick={() => {
                    setActiveTab(tab.id)
                    setRoleFilter('all')
                  }}
                >
                  <span>{tab.label}</span>
                  {count ? (
                    <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${activeTab === tab.id ? 'bg-[#e7efff] text-[#1952c6]' : 'bg-[#f1f5f9] text-[#60758d]'}`}>
                      {count}
                    </span>
                  ) : null}
                </RegisterTab>
              )
            })}
          </div>
        </div>

        <section className="rounded-b-[18px] border border-t-0 border-[#dce6f0] bg-white">
          <div className="border-b border-[#e8eef5] px-4 py-4">
            <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <SearchField value={searchTerm} onChange={setSearchTerm} placeholder={pageView.searchPlaceholder} className="w-full 2xl:max-w-[34%] 2xl:flex-1" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:flex 2xl:flex-wrap 2xl:items-center">
                <FilterSelect
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={pageView.key === 'lease' ? LEASE_TYPE_OPTIONS : pageView.roleFilters.filter((option) => option.value !== 'all')}
                  placeholder="Type"
                  className="!w-full 2xl:!w-[128px]"
                />
                <FilterSelect value={advancedFilters.assigned} onChange={(value) => setAdvancedFilters((previous) => ({ ...previous, assigned: value }))} options={lookupMaps.brokers || []} placeholder="Broker" className="!w-full 2xl:!w-[138px]" />
                <FilterSelect value={advancedFilters.status} onChange={(value) => setAdvancedFilters((previous) => ({ ...previous, status: value }))} options={LEAD_STATUS_FILTER_OPTIONS} placeholder="Status" className="!w-full 2xl:!w-[138px]" />
                <FilterSelect value={advancedFilters.stage} onChange={(value) => setAdvancedFilters((previous) => ({ ...previous, stage: value }))} options={LEAD_STAGE_OPTIONS.filter((option) => option.value !== 'all')} placeholder="Stage" className="!w-full 2xl:!w-[138px]" />
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
                  More Filters
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
                  <button type="button" onClick={resetLeadFilters} className="text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
                    Clear filters
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={COMMERCIAL_CATEGORY_OPTIONS} placeholder="Asset Class" className="!w-full" />
                  <FilterSelect value={advancedFilters.source} onChange={(value) => setAdvancedFilters((previous) => ({ ...previous, source: value }))} options={COMMERCIAL_CANVASSING_METHODS.map((value) => ({ value, label: value }))} placeholder="Source" className="!w-full" />
                  <FilterSelect value={advancedFilters.budget} onChange={(value) => setAdvancedFilters((previous) => ({ ...previous, budget: value }))} options={BUDGET_BANDS.filter((option) => option.value !== 'all')} placeholder="Budget / Rental" className="!w-full" />
                  <Field
                    value={advancedFilters.area}
                    onChange={(event) => setAdvancedFilters((previous) => ({ ...previous, area: event.target.value }))}
                    placeholder="Area / Node"
                    className="h-11 rounded-[14px] bg-white text-sm"
                  />
                  <FilterSelect value={advancedFilters.dateAdded} onChange={(value) => setAdvancedFilters((previous) => ({ ...previous, dateAdded: value }))} options={DATE_FILTER_OPTIONS.filter((option) => option.value !== 'all')} placeholder="Date Added" className="!w-full" />
                  <FilterSelect value={advancedFilters.lastActivity} onChange={(value) => setAdvancedFilters((previous) => ({ ...previous, lastActivity: value }))} options={DATE_FILTER_OPTIONS.filter((option) => option.value !== 'all')} placeholder="Last Activity" className="!w-full" />
                  <label className="relative block">
                    <ArrowUpDown size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#1f6dd5]" />
                    <Field
                      as="select"
                      value={`${sortKey}:${sortDirection}`}
                      onChange={(event) => {
                        const [nextKey, nextDirection] = String(event.target.value || '').split(':')
                        setSortKey(nextKey)
                        setSortDirection(nextDirection || 'desc')
                      }}
                      aria-label={`Sort: ${currentSortLabel}`}
                      className="h-11 !w-full rounded-[14px] bg-white pl-9 text-sm"
                    >
                      {LEAD_SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>Sort: {option.label}</option>
                      ))}
                    </Field>
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden">
            <div className="hidden lg:block">
              <div className="max-h-[560px] overflow-auto">
                <table className="min-w-[1280px] w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10 bg-[#f7fafc] text-left text-[12px] font-semibold uppercase tracking-[0.12em] text-[#61758b]">
                    <tr>
                      {['Lead', 'Type', 'Category / Requirement', 'Client / Company', 'Area', 'Budget / Rental', 'Broker', 'Status / Stage', 'Last Activity', 'Actions'].map((label) => (
                        <th key={label} className="border-b border-[#e7edf4] px-4 py-3">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? Array.from({ length: 6 }).map((_, index) => (
                      <tr key={`lead-loading-${index}`}>
                        <td colSpan={10} className="border-b border-[#eef3f7] px-5 py-4">
                          <div className="h-16 animate-pulse rounded-[16px] bg-slate-100" />
                        </td>
                      </tr>
                    )) : error ? (
                      <tr>
                        <td colSpan={10} className="px-0 py-0">
                          <InlineTableEmptyState icon={CalendarDays} title="Commercial leads could not be loaded" description={error} />
                        </td>
                      </tr>
                    ) : visibleLeads.length ? visibleLeads.map((lead) => (
                      <LeadRow
                        key={lead.id}
                        lead={lead}
                        onOpen={openDrawer}
                        onEdit={openEditLead}
                        onLogActivity={handleLogCall}
                        onSendOnboarding={handleSendOnboarding}
                        onCreateVacancy={handleCreateVacancy}
                        onCreateRequirement={handleCreateRequirement}
                        onConvertToDeal={handleConvertToDeal}
                        onArchive={handleArchive}
                        menuOpen={openMenuId === lead.id}
                        onMenuToggle={() => setOpenMenuId((previous) => (previous === lead.id ? '' : lead.id))}
                      />
                    )) : (
                      <tr>
                        <td colSpan={10} className="px-0 py-0">
                          {renderEmptyState()}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="divide-y divide-[#eef3f7] lg:hidden">
              {loading ? Array.from({ length: 3 }).map((_, index) => (
                <div key={`mobile-lead-loading-${index}`} className="px-4 py-4">
                  <div className="h-24 animate-pulse rounded-[18px] bg-slate-100" />
                </div>
              )) : error ? (
                <InlineTableEmptyState icon={CalendarDays} title="Commercial leads could not be loaded" description={error} />
              ) : visibleLeads.length ? visibleLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onOpen={openDrawer}
                  onEdit={openEditLead}
                  onLogActivity={handleLogCall}
                  onSendOnboarding={handleSendOnboarding}
                  onCreateVacancy={handleCreateVacancy}
                  onCreateRequirement={handleCreateRequirement}
                  onConvertToDeal={handleConvertToDeal}
                  onArchive={handleArchive}
                  menuOpen={openMenuId === lead.id}
                  onMenuToggle={() => setOpenMenuId((previous) => (previous === lead.id ? '' : lead.id))}
                />
              )) : renderEmptyState()}
            </div>

            <div className="flex flex-col gap-3 border-t border-[#eef3f7] px-5 py-4 text-sm text-[#63768b] sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing <span className="font-semibold text-[#102236]">{tableStart}</span>-
                <span className="font-semibold text-[#102236]">{tableEnd}</span> of{' '}
                <span className="font-semibold text-[#102236]">{pageScopedLeads.length}</span> leads
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

      <NewCommercialLeadModal
        open={modalState.open}
        mode={modalState.mode}
        record={modalState.record}
        lookups={lookups}
        organisationId={organisationId}
        defaultRole={modalState.role || pageView.defaultCreateRole}
        roleOptions={pageView.roleOptions}
        onClose={() => setModalState({ open: false, mode: 'create', record: null, role: pageView.defaultCreateRole })}
        onSave={handleSaveLead}
      />

      <CommercialLeadDrawer
        key={drawerLead?.id || 'closed'}
        open={Boolean(drawerLead)}
        lead={drawerLead}
        activities={(workspace.activities || []).filter((activity) => normalizeText(activity.prospectId || activity.prospect_id) === normalizeText(drawerLead?.id))}
        onClose={() => setDrawerLead(null)}
        onEdit={openEditLead}
        onAddNote={handleAddNote}
        onLogCall={handleLogCall}
      />
    </div>
  )
}

export default CommercialLeadsPage
