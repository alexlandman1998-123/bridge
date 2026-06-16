import {
  Archive,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Filter,
  LayoutGrid,
  ListFilter,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
  TrendingUp,
  CircleDollarSign,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import Field from '../../../components/ui/Field'
import Modal from '../../../components/ui/Modal'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialFilterBar from '../components/CommercialFilterBar'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { toLookupOptions } from '../commercialPipelineHelpers'
import {
  calculateMonthDelta,
  formatCurrencyZAR,
  formatRelativeTime,
  formatShortDate,
  normalizeKey,
  normalizeText,
} from '../commercialProspectFormatters'
import {
  COMMERCIAL_CANVASSING_METHODS,
  COMMERCIAL_CATEGORY_OPTIONS,
  COMMERCIAL_PRIORITY_OPTIONS,
  COMMERCIAL_PROSPECT_STATUSES,
  COMMERCIAL_ROLE_OPTIONS,
  getCategoryBadgeVariant,
  getDealTypeFromRole,
  getDealTypeLabel,
  getPropertyCategoryLabel,
  getProspectBadgeVariant,
  getRoleLabel,
} from '../commercialProspectTypes'
import { deriveCommercialCanvassingMetrics, filterCommercialProspects, normaliseCommercialProspect } from '../commercialProspectFilters'
import { validateCommercialProspectDraft } from '../commercialProspectValidation'
import {
  createCommercialCanvassingActivity,
  createCommercialCanvassingProspect,
  deleteCommercialCanvassingProspect,
  listCommercialCanvassingWorkspace,
  updateCommercialCanvassingProspect,
} from '../services/commercialCanvassingApi'
import { getCommercialLookupData, resolveCommercialOrganisationContext } from '../services/commercialApi'

const LEAD_TABS = [
  { id: 'all', label: 'All Leads' },
  { id: 'sales', label: 'Sales' },
  { id: 'leases', label: 'Leases' },
  { id: 'unclassified', label: 'Unclassified' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'converted', label: 'Converted' },
]

const LEAD_STAGE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'qualification', label: 'Qualification' },
  { value: 'site_search', label: 'Site Search' },
  { value: 'viewing', label: 'Viewing' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'converted', label: 'Converted' },
]

const BUDGET_BANDS = [
  { value: 'all', label: 'All' },
  { value: 'under_100k', label: 'Under R100K' },
  { value: '100k_500k', label: 'R100K - R500K' },
  { value: '500k_1m', label: 'R500K - R1M' },
  { value: '1m_5m', label: 'R1M - R5M' },
  { value: '5m_plus', label: 'R5M+' },
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

function buildInitialDraft(record = null, defaultBroker = null) {
  const role = normalizeLeadRole(record)
  const contact = record?.contactName || [record?.firstName, record?.lastName].filter(Boolean).join(' ')
  const company = record?.companyName || record?.displayName || ''
  const notes = extractNoteValue(record?.notes, 'Notes') || record?.notes || ''
  return {
    prospectRole: role,
    dealType: getDealTypeFromRole(role),
    propertyCategory: normalizeLower(record?.propertyCategory || record?.propertyType) || 'commercial',
    companyName: company,
    contactPerson: contact,
    phone: record?.phone || '',
    email: record?.email || '',
    propertyAddress: extractNoteValue(record?.notes, 'Property / Asset Address or Area') || record?.area || '',
    propertyName: extractNoteValue(record?.notes, 'Property / Portfolio Name') || '',
    lookingFor: extractNoteValue(record?.notes, 'Looking For') || '',
    preferredArea: extractNoteValue(record?.notes, 'Preferred Area') || record?.area || '',
    spaceRequirement: extractNoteValue(record?.notes, 'Space Requirement') || '',
    sizeRange: extractNoteValue(record?.notes, 'Size Range') || '',
    budgetRange: extractNoteValue(record?.notes, 'Budget Range') || '',
    vacancyDetails: extractNoteValue(record?.notes, 'Vacancy Details') || '',
    reasonForSelling: extractNoteValue(record?.notes, 'Reason for Selling') || '',
    targetPurchaseTimeline: extractNoteValue(record?.notes, 'Target Purchase Timeline') || '',
    leaseTimeline: extractNoteValue(record?.notes, 'Lease Timeline') || '',
    estimatedSaleValue: String(record?.estimatedValue || ''),
    estimatedMonthlyRental: '',
    estimatedAnnualRental: '',
    canvassingMethod: record?.canvassingMethod || 'Cold Call',
    status: normalizeText(record?.status) || 'New',
    followUpDate: record?.nextFollowUpDate || '',
    priority: record?.followUpPriority || 'Medium',
    assignedBrokerId: record?.assignedBrokerId || defaultBroker?.value || '',
    assignedBrokerName: record?.assignedBrokerName || defaultBroker?.label || '',
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
  if (value.includes('contact')) return 'contacted'
  if (value.includes('lost')) return 'lost'
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

function getClientTypeLabel(lead = {}) {
  const name = normalizeLower(lead.companyName || lead.displayName || '')
  if (name.includes('trust')) return 'Trust'
  if (name.includes('fund')) return 'Fund'
  if (name.includes('invest')) return 'Investor'
  if (normalizeLeadRole(lead) === 'seller' || normalizeLeadRole(lead) === 'landlord') return 'Owner'
  return 'Business'
}

function getLeadAssetLabel(lead = {}) {
  const role = normalizeLeadRole(lead)
  const asset = [
    lead.propertyName,
    lead.propertyAddress,
    lead.lookingFor,
    lead.spaceRequirement,
    lead.vacancyDetails,
    lead.sizeRange,
  ].map((value) => normalizeText(value)).filter(Boolean)
  if (role === 'seller') return asset[1] || asset[0] || 'Asset pending'
  if (role === 'buyer') return [asset[2] || 'Requirement pending', asset[5]].filter(Boolean).join(' · ') || 'Requirement pending'
  if (role === 'landlord') return [asset[0] || 'Portfolio pending', asset[4]].filter(Boolean).join(' · ') || 'Portfolio pending'
  if (role === 'tenant') return [asset[3] || 'Space requirement pending', lead.preferredArea || 'Area pending'].filter(Boolean).join(' · ')
  return asset[0] || 'Asset pending'
}

function getLeadAreaLabel(lead = {}) {
  const bits = [lead.preferredArea, lead.propertyAddress, lead.branchName].map((value) => normalizeText(value)).filter(Boolean)
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

function getLeadBudgetSubLabel(lead = {}) {
  const dealType = normalizeLower(lead.dealType || getDealTypeFromRole(normalizeLeadRole(lead)))
  if (dealType === 'lease') return 'Rental budget'
  return 'Purchase value'
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
    draft.lookingFor ? `Looking For: ${draft.lookingFor}` : '',
    draft.preferredArea ? `Preferred Area: ${draft.preferredArea}` : '',
    draft.spaceRequirement ? `Space Requirement: ${draft.spaceRequirement}` : '',
    draft.sizeRange ? `Size Range: ${draft.sizeRange}` : '',
    draft.budgetRange ? `Budget Range: ${draft.budgetRange}` : '',
    draft.vacancyDetails ? `Vacancy Details: ${draft.vacancyDetails}` : '',
    draft.reasonForSelling ? `Reason for Selling: ${draft.reasonForSelling}` : '',
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

function buildTrendSeries(leads = []) {
  const months = []
  const now = new Date()
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-ZA', { month: 'short' }),
      value: 0,
    })
  }
  leads.forEach((lead) => {
    const created = new Date(lead.createdAt || lead.created_at || lead.created_at || '')
    if (Number.isNaN(created.getTime())) return
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
    const bucket = months.find((item) => item.key === key)
    if (bucket) bucket.value += getLeadValue(lead)
  })
  return months
}

function buildStageBreakdown(leads = []) {
  const stages = [
    { key: 'discovery', label: 'Discovery', color: '#3b82f6' },
    { key: 'qualification', label: 'Qualification', color: '#8b5cf6' },
    { key: 'follow_up', label: 'Follow Up', color: '#f59e0b' },
    { key: 'converted', label: 'Converted', color: '#22c55e' },
  ]
  const rows = stages.map((stage) => ({
    ...stage,
    count: leads.filter((lead) => (lead.leadStage || 'discovery') === stage.key).length,
    value: leads.filter((lead) => (lead.leadStage || 'discovery') === stage.key).reduce((sum, lead) => sum + getLeadValue(lead), 0),
  }))
  return rows
}

function buildActivitySummary(activities = [], leadMap = new Map()) {
  return activities
    .slice(0, 6)
    .map((activity) => ({
      id: activity.id,
      title: normalizeText(activity.activityType || activity.activity_type) || 'Activity',
      description: normalizeText(activity.activityNote || activity.activity_note || activity.outcome) || 'Activity logged',
      time: formatRelativeTime(activity.createdAt || activity.created_at || activity.activityDate || activity.activity_date),
      leadLabel: leadMap.get(activity.prospectId || activity.prospect_id)?.displayName || 'Commercial lead',
      tone: activity.activityType === 'Call' ? 'blue' : activity.activityType === 'Email' ? 'violet' : activity.activityType === 'Meeting' ? 'emerald' : 'slate',
    }))
}

function toneForRole(role = '') {
  return toneClass(getProspectBadgeVariant(role))
}

function toneForCategory(category = '') {
  return toneClass(getCategoryBadgeVariant(category))
}

function LeadBadge({ children, tone = 'slate', className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(tone)} ${className}`.trim()}>
      {children}
    </span>
  )
}

function CommercialMetricCard({ label, value, sublabel, deltaLabel, icon: Icon, chart, emptyLabel }) {
  return (
    <article className="rounded-[24px] border border-[#e6edf4] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-[clamp(2.1rem,4vw,3rem)] font-semibold tracking-[-0.05em] text-[#102236]">{value}</p>
        </div>
        {Icon ? (
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f5f8fd] text-[#2d6ecf]">
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{sublabel}</p>
        {deltaLabel ? <p className="text-sm font-semibold text-emerald-600">{deltaLabel}</p> : null}
      </div>
      <div className="mt-5 min-h-[42px]">{chart || <p className="text-xs text-slate-400">{emptyLabel || 'No movement yet'}</p>}</div>
    </article>
  )
}

function LeadSparkline({ series = [], color = '#2d6ecf' }) {
  if (!series.length) {
    return <div className="h-10 rounded-2xl bg-slate-50" />
  }
  const width = 240
  const height = 56
  const padding = 2
  const max = Math.max(...series.map((item) => item.value), 1)
  const points = series.map((item, index) => {
    const x = padding + (index / Math.max(series.length - 1, 1)) * (width - padding * 2)
    const y = height - padding - ((item.value || 0) / max) * (height - padding * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full">
      <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
    </svg>
  )
}

function MiniBars({ series = [], color = '#2d6ecf' }) {
  if (!series.length) {
    return <div className="h-10 rounded-2xl bg-slate-50" />
  }
  const max = Math.max(...series.map((item) => item.value), 1)
  return (
    <div className="flex h-12 items-end gap-1">
      {series.map((item) => (
        <span
          key={item.label}
          className="flex-1 rounded-t-lg"
          style={{
            height: `${Math.max(14, Math.round(((item.value || 0) / max) * 100))}%`,
            background: `linear-gradient(to top, ${color}, rgba(255,255,255,0.2))`,
            minWidth: '6px',
          }}
        />
      ))}
    </div>
  )
}

function CommercialTrendCard({ series = [], total = 0, deltaLabel = '', empty = false }) {
  const latest = series[series.length - 1]?.value || 0
  const previous = series[series.length - 2]?.value || 0
  const change = calculateMonthDelta(latest, previous)
  return (
    <article className="rounded-[24px] border border-[#e6edf4] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[1.85rem] font-semibold tracking-[-0.04em] text-[#102236]">Pipeline Value Trend</h3>
          <p className="mt-2 text-sm text-slate-500">Commercial pipeline value across the last 6 months.</p>
        </div>
        <Button variant="secondary" size="sm" className="rounded-xl">
          Last 6 months
          <ChevronDown size={14} />
        </Button>
      </div>
      <div className="mt-5 rounded-[24px] border border-[#e6edf4] bg-[#fbfcfe] p-4">
        {empty ? (
          <CommercialEmptyState
            title="No pipeline activity yet"
            description="Create your first listing or deal to start tracking commercial pipeline value."
          />
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Value</p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[#102236]">{formatCurrencyZAR(total)}</p>
              </div>
              <p className="text-sm font-semibold text-emerald-600">{change > 0 ? `+${change}% vs last month` : deltaLabel || 'No movement yet'}</p>
            </div>
            <div className="mt-4">
              <LeadSparkline series={series} color="#2d6ecf" />
            </div>
            <div className="mt-3 flex items-center justify-between text-[0.7rem] uppercase tracking-[0.12em] text-slate-400">
              {series.map((item) => <span key={item.label}>{item.label}</span>)}
            </div>
          </>
        )}
      </div>
    </article>
  )
}

function CommercialStageCard({ stages = [], total = 0, empty = false }) {
  const totalValue = stages.reduce((sum, stage) => sum + stage.value, 0)
  const palette = stages.map((stage) => stage.color)
  return (
    <article className="rounded-[24px] border border-[#e6edf4] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[1.85rem] font-semibold tracking-[-0.04em] text-[#102236]">Pipeline by Stage</h3>
          <p className="mt-2 text-sm text-slate-500">Live commercial work split into the active lead stages.</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5f8fd] text-[#2d6ecf]">
          <BarChart3 size={18} />
        </span>
      </div>
      <div className="mt-5 rounded-[24px] border border-[#e6edf4] bg-[#fbfcfe] p-4">
        {empty ? (
          <CommercialEmptyState title="No active pipeline yet" description="Add leads, requirements or deals to see stage breakdowns here." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
            <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-full" style={{ background: `conic-gradient(${stages.map((stage, index) => {
              const share = totalValue ? (stage.value / totalValue) * 100 : 0
              const prior = stages.slice(0, index).reduce((sum, row) => sum + (totalValue ? (row.value / totalValue) * 100 : 0), 0)
              return `${stage.color} ${prior}% ${prior + share}%`
            }).join(', ')})` }}>
              <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Total</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#102236]">{formatCurrencyZAR(totalValue || total)}</p>
              </div>
            </div>
            <div className="grid gap-3">
              {stages.map((stage) => {
                const share = totalValue ? Math.round((stage.value / totalValue) * 100) : 0
                return (
                  <div key={stage.key} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      <div>
                        <p className="text-sm font-semibold text-[#102236]">{stage.label}</p>
                        <p className="text-xs text-slate-500">{stage.count} leads</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[#102236]">{formatCurrencyZAR(stage.value)}</p>
                      <p className="text-xs text-slate-500">{share}%</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function CommercialActivityCard({ items = [], empty = false }) {
  return (
    <article className="rounded-[24px] border border-[#e6edf4] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[1.85rem] font-semibold tracking-[-0.04em] text-[#102236]">Recent Activity</h3>
          <p className="mt-2 text-sm text-slate-500">The latest commercial updates across leads, notes and follow-ups.</p>
        </div>
        <Link to="/commercial/activity" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1267a3]">
          View all
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="mt-5 rounded-[24px] border border-[#e6edf4] bg-[#fbfcfe] p-4">
        {empty ? (
          <CommercialEmptyState title="No recent commercial activity yet." description="New leads, notes and follow-ups will appear here." />
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${toneClass(item.tone)}`}>
                  {item.title === 'Email' ? <Mail size={16} /> : item.title === 'Call' ? <Phone size={16} /> : item.title === 'Meeting' ? <CalendarDays size={16} /> : <MessageSquare size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#102236]">{item.title}</p>
                  <p className="truncate text-xs text-slate-500">{item.leadLabel} · {item.description}</p>
                </div>
                <p className="shrink-0 text-xs font-semibold text-slate-500">{item.time}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function CommercialInsightBanner({ hasData, metrics }) {
  return (
    <section className={`rounded-[24px] border px-5 py-4 shadow-[0_8px_26px_rgba(15,23,42,0.03)] ${hasData ? 'border-emerald-200 bg-emerald-50/40' : 'border-sky-200 bg-sky-50/50'}`}>
      <div className="flex items-center gap-4">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${hasData ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
          <Sparkles size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[#102236]">
            {hasData
              ? `Great progress! You have ${metrics.qualifiedLeads} qualified leads and ${metrics.followUpsDue} follow-ups due this week.`
              : 'Your commercial dashboard is ready.'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {hasData
              ? `Pipeline value is ${formatCurrencyZAR(metrics.pipelineValue)} across ${metrics.activeLeads} active leads.`
              : 'Add your first lead to start seeing useful insights here.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" className="rounded-xl">
          View insights
          <ArrowRight size={14} />
        </Button>
      </div>
    </section>
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

  useEffect(() => {
    if (open) setActiveTab('overview')
  }, [open, lead?.id])

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

function LeadActionsMenu({ lead, open, onToggle, onView, onEdit, onAddNote, onLogCall, onSchedule, onArchive, onDelete }) {
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
          {[
            { label: 'Open Lead', icon: Eye, onClick: onView },
            { label: 'Edit Lead', icon: Pencil, onClick: onEdit },
            { label: 'Add Note', icon: MessageSquare, onClick: onAddNote },
            { label: 'Log Call', icon: Phone, onClick: onLogCall },
            { label: 'Schedule Follow Up', icon: CalendarDays, onClick: onSchedule },
            { label: 'Archive', icon: Archive, onClick: onArchive },
            { label: 'Delete', icon: Trash2, onClick: onDelete, destructive: true },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={!item.onClick}
              title={!item.onClick ? 'Conversion workflow coming soon' : undefined}
              onClick={(event) => {
                event.stopPropagation()
                item.onClick?.(lead)
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 ${item.destructive ? 'text-rose-600 hover:bg-rose-50' : 'text-[#102236]'}`}
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

function LeadRow({ lead, onOpen, onEdit, onAddNote, onLogCall, onSchedule, onArchive, onDelete, menuOpen, onMenuToggle }) {
  return (
    <tr className="cursor-pointer border-b border-slate-200 bg-white transition hover:bg-slate-50/60" onClick={() => onOpen?.(lead)}>
      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {lead.initials || 'CL'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#102236]">{lead.displayName || 'Unknown lead'}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{lead.companyName || 'No company captured'}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{lead.phone || 'No phone captured'}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="grid gap-1">
          <LeadBadge tone={getProspectBadgeVariant(lead.prospectRole)}>{getRoleLabel(lead.prospectRole)}</LeadBadge>
          <span className="text-xs text-slate-500">{getDealTypeLabel(lead.dealType)}</span>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <LeadBadge tone={getCategoryBadgeVariant(lead.propertyCategory)}>{getPropertyCategoryLabel(lead.propertyCategory)}</LeadBadge>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-[#102236]">{getClientTypeLabel(lead)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-[#102236]">{getLeadAssetLabel(lead)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-[#102236]">{getLeadAreaLabel(lead)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold text-[#102236]">{getLeadBudgetLabel(lead)}</p>
        <p className="mt-1 text-xs text-slate-500">{getLeadBudgetSubLabel(lead)}</p>
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
          <CommercialStatusPill value={lead.status} label={normalizeText(lead.status) || 'New'} />
          <span className="text-xs text-slate-500">{getLeadStageLabel(lead)}</span>
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
          onView={onOpen}
          onEdit={onEdit}
          onAddNote={onAddNote}
          onLogCall={onLogCall}
          onSchedule={onSchedule}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      </td>
    </tr>
  )
}

function LeadCard({ lead, onOpen, onEdit, onAddNote, onLogCall, onArchive, onDelete, menuOpen, onMenuToggle, onSchedule }) {
  return (
    <article className="rounded-[24px] border border-[#e6edf4] bg-white p-4 shadow-[0_8px_26px_rgba(0,0,0,0.04)]" onClick={() => onOpen?.(lead)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {lead.initials || 'CL'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#102236]">{lead.displayName || 'Unknown lead'}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{lead.companyName || 'No company captured'}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{lead.phone || 'No phone captured'}</p>
          </div>
        </div>
        <LeadActionsMenu
          lead={lead}
          open={menuOpen}
          onToggle={onMenuToggle}
          onView={onOpen}
          onEdit={onEdit}
          onAddNote={onAddNote}
          onLogCall={onLogCall}
          onSchedule={onSchedule}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <LeadBadge tone={getProspectBadgeVariant(lead.prospectRole)}>{getRoleLabel(lead.prospectRole)}</LeadBadge>
        <LeadBadge tone={getCategoryBadgeVariant(lead.propertyCategory)}>{getPropertyCategoryLabel(lead.propertyCategory)}</LeadBadge>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-[#102236]">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Budget</span>
          <span className="font-semibold">{getLeadBudgetLabel(lead)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Stage</span>
          <span className="font-semibold">{getLeadStageLabel(lead)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Activity</span>
          <span className="font-semibold">{lead.lastActivityAt ? formatRelativeTime(lead.lastActivityAt) : 'No activity yet'}</span>
        </div>
      </div>
    </article>
  )
}

function NewCommercialLeadModal({
  open,
  mode = 'create',
  record = null,
  lookups = {},
  onClose,
  onSave,
}) {
  const brokerOptions = useMemo(() => toLookupOptions(lookups).brokers || [], [lookups])
  const defaultBroker = useMemo(() => getDefaultBroker(lookups), [lookups])
  const [step, setStep] = useState(2)
  const [selectedRole, setSelectedRole] = useState('seller')
  const [draft, setDraft] = useState(() => buildInitialDraft(record, defaultBroker))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!open) return
    const nextDraft = buildInitialDraft(record, defaultBroker)
    setSelectedRole(nextDraft.prospectRole)
    setDraft(nextDraft)
    setStep(2)
    setErrors({})
    setSaveError('')
  }, [open, record, defaultBroker])

  const roleOptions = useMemo(() => COMMERCIAL_ROLE_OPTIONS, [])
  const categoryOptions = useMemo(() => COMMERCIAL_CATEGORY_OPTIONS, [])

  const selectedBroker = useMemo(() => brokerOptions.find((item) => item.value === draft.assignedBrokerId) || brokerOptions[0] || defaultBroker, [brokerOptions, defaultBroker, draft.assignedBrokerId])

  const formFields = useMemo(() => {
    const common = [
      { name: 'companyName', label: selectedRole === 'seller' ? 'Owner / Company Name' : selectedRole === 'buyer' ? 'Buyer / Company Name' : selectedRole === 'landlord' ? 'Landlord / Company Name' : 'Tenant / Company Name', required: true },
      { name: 'contactPerson', label: 'Contact Person' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'propertyCategory', label: 'Property Category', type: 'select', required: true, options: categoryOptions },
      { name: 'canvassingMethod', label: 'Source / Method', type: 'select', options: COMMERCIAL_CANVASSING_METHODS.map((value) => ({ value, label: value })) },
      { name: 'status', label: 'Status', type: 'select', options: COMMERCIAL_PROSPECT_STATUSES.map((value) => ({ value, label: value })) },
      { name: 'priority', label: 'Priority', type: 'select', options: COMMERCIAL_PRIORITY_OPTIONS.map((value) => ({ value, label: value })) },
      { name: 'followUpDate', label: 'Follow-up Date', type: 'date' },
      { name: 'assignedBrokerId', label: 'Assigned Broker', type: 'select', required: true, options: brokerOptions },
      { name: 'notes', label: 'Notes', as: 'textarea', span: 'full' },
    ]

    const saleFields = [
      { name: 'propertyAddress', label: 'Property / Asset Address or Area', required: true },
      { name: 'estimatedSaleValue', label: 'Estimated Sale Value', type: 'number' },
      { name: 'reasonForSelling', label: 'Reason for Selling', type: 'select', options: [
        'Relocating',
        'Scaling down',
        'Portfolio optimisation',
        'Owner-occupier exit',
        'Investment disposal',
        'Development opportunity',
        'Unknown',
        'Other',
      ].map((value) => ({ value, label: value })) },
    ]

    const buyerFields = [
      { name: 'lookingFor', label: 'Looking For', required: true },
      { name: 'preferredArea', label: 'Preferred Area', required: true },
      { name: 'budgetRange', label: 'Budget Range' },
      { name: 'targetPurchaseTimeline', label: 'Target Purchase Timeline', type: 'select', options: ['Immediately', '0–3 months', '3–6 months', '6–12 months', '12+ months', 'Unknown'].map((value) => ({ value, label: value })) },
    ]

    const landlordFields = [
      { name: 'propertyName', label: 'Property / Portfolio Name', required: true },
      { name: 'vacancyDetails', label: 'Vacancy Details', as: 'textarea' },
      { name: 'estimatedMonthlyRental', label: 'Estimated Monthly Rental', type: 'number' },
      { name: 'estimatedAnnualRental', label: 'Estimated Annual Rental', type: 'number' },
    ]

    const tenantFields = [
      { name: 'spaceRequirement', label: 'Space Requirement', required: true },
      { name: 'preferredArea', label: 'Preferred Area', required: true },
      { name: 'sizeRange', label: 'Size Range' },
      { name: 'budgetRange', label: 'Budget / Rental Range' },
      { name: 'leaseTimeline', label: 'Lease Timeline', type: 'select', options: ['Immediately', '0–3 months', '3–6 months', '6–12 months', '12+ months', 'Unknown'].map((value) => ({ value, label: value })) },
    ]

    if (selectedRole === 'seller') return [...saleFields, ...common]
    if (selectedRole === 'buyer') return [...buyerFields, ...common]
    if (selectedRole === 'landlord') return [...landlordFields, ...common]
    return [...tenantFields, ...common]
  }, [brokerOptions, categoryOptions, selectedRole])

  if (!open) return null

  function updateDraft(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  function handleRoleChange(nextRole) {
    if (nextRole === selectedRole) return
    const hasTypedValues = Object.entries(draft).some(([key, value]) => {
      if (['prospectRole', 'dealType', 'propertyCategory', 'companyName', 'contactPerson', 'phone', 'email', 'canvassingMethod', 'status', 'priority', 'followUpDate', 'assignedBrokerId', 'assignedBrokerName', 'branchId', 'notes'].includes(key)) return false
      return Boolean(normalizeText(value))
    })
    if (hasTypedValues && !window.confirm('Changing the prospect type may hide some entered fields. Continue?')) return
    setSelectedRole(nextRole)
    setDraft((previous) => ({
      ...previous,
      prospectRole: nextRole,
      dealType: getDealTypeFromRole(nextRole),
      propertyCategory: nextRole === 'seller' || nextRole === 'buyer' ? previous.propertyCategory || 'commercial' : previous.propertyCategory || 'commercial',
    }))
    setErrors({})
  }

  function validateStep(nextStep = step) {
    const validationDraft = {
      prospectRole: selectedRole,
      companyName: draft.companyName,
      propertyCategory: draft.propertyCategory,
      assignedBrokerId: draft.assignedBrokerId,
      propertyAddress: draft.propertyAddress,
      lookingFor: draft.lookingFor,
      preferredArea: draft.preferredArea,
      propertyName: draft.propertyName,
      spaceRequirement: draft.spaceRequirement,
    }
    const baseErrors = validateCommercialProspectDraft(validationDraft)
    const nextErrors = { ...baseErrors }
    if (selectedRole === 'seller' && !normalizeText(draft.propertyAddress)) nextErrors.propertyAddress = 'Add a property or area.'
    if (selectedRole === 'buyer') {
      if (!normalizeText(draft.lookingFor)) nextErrors.lookingFor = 'Tell us what the buyer is looking for.'
      if (!normalizeText(draft.preferredArea)) nextErrors.preferredArea = 'Add a preferred area.'
    }
    if (selectedRole === 'landlord' && !normalizeText(draft.propertyName)) nextErrors.propertyName = 'Add a property or portfolio name.'
    if (selectedRole === 'tenant') {
      if (!normalizeText(draft.spaceRequirement)) nextErrors.spaceRequirement = 'Add the tenant space requirement.'
      if (!normalizeText(draft.preferredArea)) nextErrors.preferredArea = 'Add a preferred area.'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!validateStep(2)) return

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
    const commonClass = 'min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]'
    const options = field.options || []
    const labelText = field.label

    if (field.as === 'textarea') {
      return (
        <textarea
          rows={4}
          value={value}
          onChange={(event) => updateDraft(field.name, event.target.value)}
          className={`${commonClass} py-3`}
        />
      )
    }

    if (field.type === 'select') {
      return (
        <select value={value} onChange={(event) => updateDraft(field.name, event.target.value)} className={commonClass}>
          <option value="">{field.placeholder || 'Select...'}</option>
          {options.map((option) => (
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
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
        placeholder={labelText}
        className={commonClass}
      />
    )
  }

  const draftSummary = buildNotesSummary(draft)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit lead' : 'New lead'}
      subtitle="Capture the company, contact, or asset you want to work with through the commercial pipeline."
      className="max-w-[1120px] max-h-[calc(100vh-80px)] overflow-hidden"
      footer={(
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            Step {step} of 3
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" className="rounded-xl" type="button" onClick={onClose}>
              Cancel
            </Button>
            {step > 2 ? (
              <Button variant="secondary" size="sm" className="rounded-xl" type="button" onClick={() => setStep(2)}>
                Back
              </Button>
            ) : null}
            {step < 3 ? (
              <Button
                variant="primary"
                size="sm"
                className="rounded-xl"
                type="button"
                onClick={() => {
                  if (validateStep(2)) setStep(3)
                }}
              >
                Next: Review & Save
                <ArrowRight size={14} />
              </Button>
            ) : (
              <Button variant="primary" size="sm" className="rounded-xl" type="submit" form="commercial-lead-form" disabled={saving}>
                {saving ? 'Saving…' : 'Save Prospect'}
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <form id="commercial-lead-form" onSubmit={handleSubmit} className="grid min-h-0 grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-[#fbfcfe] p-5 lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Step 1 of 3</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#102236]">What type of prospect is this?</h3>
          <p className="mt-1 text-sm text-slate-500">Choose the best fit so we can show you the right fields.</p>
          <div className="mt-5 grid gap-3">
            {roleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleRoleChange(option.value)}
                className={`rounded-[24px] border p-4 text-left transition ${
                  selectedRole === option.value
                    ? 'border-blue-300 bg-blue-50/80 shadow-[0_10px_24px_rgba(45,110,207,0.08)]'
                    : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${selectedRole === option.value ? 'bg-white text-[#2d6ecf]' : 'bg-[#f5f8fd] text-[#2d6ecf]'}`}>
                    <Users size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102236]">{option.label} ({getDealTypeLabel(option.dealType)})</p>
                      {selectedRole === option.value ? <CheckCircle2 size={16} className="text-[#2d6ecf]" /> : <span className="h-4 w-4 rounded-full border border-slate-300" />}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{option.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Step 2 of 3</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.035em] text-[#102236]">
                About the {getRoleLabel(selectedRole).toLowerCase()}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Capture the key details about the company, contact, property or requirement.
              </p>
            </div>
            <Button variant="secondary" size="sm" className="rounded-xl" type="button" onClick={() => setStep(2)}>
              Change type
            </Button>
          </div>

          <div className="max-h-[calc(100vh-280px)] overflow-y-auto p-5">
            {saveError ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{saveError}</div>
            ) : null}

            {step < 3 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {formFields.map((field) => (
                  <label key={field.name} className={field.span === 'full' ? 'grid gap-1.5 md:col-span-2' : 'grid gap-1.5'}>
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                      {field.label}
                      {field.required ? <span className="text-rose-500"> *</span> : null}
                    </span>
                    {renderField(field)}
                  </label>
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Review prospect</p>
                  <p className="mt-2 text-base font-semibold text-[#102236]">Confirm the details before adding this prospect to commercial canvassing.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ['Prospect type', getRoleLabel(selectedRole)],
                    ['Deal type', getDealTypeLabel(getDealTypeFromRole(selectedRole))],
                    ['Company / Contact', [draft.companyName, draft.contactPerson].filter(Boolean).join(' · ') || 'Pending'],
                    ['Commercial details', [draft.propertyAddress, draft.propertyName, draft.lookingFor, draft.spaceRequirement].filter(Boolean).join(' · ') || 'Pending'],
                    ['Follow-up', draft.followUpDate ? formatShortDate(draft.followUpDate) : 'No date set'],
                    ['Assignment', draft.assignedBrokerName || selectedBroker?.label || 'Unassigned'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[24px] border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
                      <p className="mt-2 text-sm font-medium text-[#102236]">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Notes</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#102236]">{draftSummary || draft.notes || 'No notes captured yet.'}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </form>
    </Modal>
  )
}

function buildLeadPayload(draft, selectedRole, selectedBroker, organisationId) {
  const dealType = getDealTypeFromRole(selectedRole)
  const companyName = normalizeText(draft.companyName)
  const contactName = normalizeText(draft.contactPerson)
  const split = splitContactName(contactName)
  const estimatedFromSale = Number(draft.estimatedSaleValue || 0)
  const estimatedFromMonthly = Number(draft.estimatedMonthlyRental || 0) * 12
  const estimatedFromAnnual = Number(draft.estimatedAnnualRental || 0)
  const estimatedValue = dealType === 'lease'
    ? (estimatedFromAnnual || estimatedFromMonthly || Number(draft.estimatedSaleValue || 0) || 0)
    : (estimatedFromSale || Number(draft.estimatedAnnualRental || 0) || 0)

  return {
    organisationId: normalizeText(organisationId),
    body: {
      prospectType: `${getRoleLabel(selectedRole)} Prospect`,
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
      area: normalizeText(draft.propertyAddress || draft.preferredArea || draft.propertyName || draft.spaceRequirement) || null,
      propertyCategory: draft.propertyCategory || null,
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

function CommercialLeadsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [organisationId, setOrganisationId] = useState('')
  const [workspace, setWorkspace] = useState({ prospects: [], activities: [] })
  const [lookups, setLookups] = useState({})
  const [activeTab, setActiveTab] = useState(() => {
    const initial = normalizeKey(searchParams.get('tab'))
    return LEAD_TABS.some((tab) => tab.id === initial) ? initial : 'all'
  })
  const [roleFilter, setRoleFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState('updatedAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [advancedFilters, setAdvancedFilters] = useState({
    branch: 'all',
    team: 'all',
    assigned: 'all',
    status: 'all',
    stage: 'all',
    propertyType: 'all',
    budget: 'all',
  })
  const [drawerLead, setDrawerLead] = useState(null)
  const [modalState, setModalState] = useState({ open: false, mode: 'create', record: null })
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
    const byLeadId = new Map()
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

  const leadMap = useMemo(() => new Map(normalizedLeads.map((lead) => [lead.id, lead])), [normalizedLeads])
  const visibleLeads = useMemo(() => {
    const coreFilters = {
      search: searchTerm,
      dealType: activeTab,
      role: roleFilter,
      category: categoryFilter,
      branch: advancedFilters.branch,
      team: advancedFilters.team,
      assigned: advancedFilters.assigned,
      status: advancedFilters.status,
      stage: advancedFilters.stage,
    }
    let rows = filterCommercialProspects(normalizedLeads, coreFilters)
    rows = rows.filter((lead) => {
      if (advancedFilters.propertyType !== 'all' && normalizeLower(lead.propertyCategory) !== normalizeLower(advancedFilters.propertyType)) return false
      if (advancedFilters.budget !== 'all' && !matchesBudgetBand(getLeadValue(lead), advancedFilters.budget)) return false
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
  }, [activeTab, advancedFilters.assigned, advancedFilters.budget, advancedFilters.branch, advancedFilters.propertyType, advancedFilters.stage, advancedFilters.status, advancedFilters.team, categoryFilter, normalizedLeads, roleFilter, searchTerm, sortDirection, sortKey])

  const metrics = useMemo(() => deriveSummaryStats(normalizedLeads, workspace.activities || []), [normalizedLeads, workspace.activities])
  const trendSeries = useMemo(() => buildTrendSeries(normalizedLeads), [normalizedLeads])
  const stageBreakdown = useMemo(() => buildStageBreakdown(normalizedLeads), [normalizedLeads])
  const recentActivity = useMemo(() => buildActivitySummary(workspace.activities || [], leadMap), [leadMap, workspace.activities])
  const activeLeadCount = normalizedLeads.length
  const hasData = activeLeadCount > 0
  const pipelineDelta = calculateMonthDelta(trendSeries[trendSeries.length - 1]?.value || 0, trendSeries[trendSeries.length - 2]?.value || 0)

  useEffect(() => {
    if (!visibleLeads.length) setDrawerLead(null)
  }, [visibleLeads.length])

  function openCreateLead() {
    setModalState({ open: true, mode: 'create', record: null })
  }

  function openEditLead(lead) {
    setModalState({ open: true, mode: 'edit', record: lead })
    setOpenMenuId('')
  }

  function openDrawer(lead) {
    setDrawerLead(lead)
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

  function handleDelete(lead) {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return
    void deleteCommercialCanvassingProspect(organisationId, lead.id).then(() => loadData())
  }

  function handleSchedule() {
    window.alert('Scheduling workflow coming soon.')
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
    const copy = EMPTY_LEAD_COPY[activeTab] || EMPTY_LEAD_COPY.all
    return (
      <CommercialEmptyState
        title={copy.title}
        description={copy.description}
        primaryActionLabel="+ Add Lead"
        onPrimaryAction={openCreateLead}
      />
    )
  }

  const categoryPills = COMMERCIAL_CATEGORY_OPTIONS

  const roleFilters = activeTab === 'sales'
    ? [
      { value: 'all', label: 'All Sales' },
      { value: 'seller', label: 'Sellers' },
      { value: 'buyer', label: 'Buyers' },
    ]
    : activeTab === 'leases'
      ? [
        { value: 'all', label: 'All Leases' },
        { value: 'landlord', label: 'Landlords' },
        { value: 'tenant', label: 'Tenants' },
      ]
      : [
        { value: 'all', label: 'All' },
        { value: 'seller', label: 'Sellers' },
        { value: 'buyer', label: 'Buyers' },
        { value: 'landlord', label: 'Landlords' },
        { value: 'tenant', label: 'Tenants' },
      ]

  const advancedFilterConfigs = useMemo(() => ([
    { key: 'branch', label: 'Branch', options: (lookups.branches || []).map((row) => ({ value: row.id, label: row.name || row.branch_name || 'Branch' })) },
    { key: 'team', label: 'Team', options: (lookups.teams || []).map((row) => ({ value: row.id, label: row.name || row.team_name || 'Team' })) },
    { key: 'assigned', label: 'Broker Owner', options: (lookupMaps.brokers || []).map((row) => ({ value: row.value, label: row.label })) },
    { key: 'status', label: 'Status', options: COMMERCIAL_PROSPECT_STATUSES.map((value) => ({ value, label: value })) },
    { key: 'stage', label: 'Stage', options: LEAD_STAGE_OPTIONS.filter((option) => option.value !== 'all') },
    { key: 'propertyType', label: 'Property Type', options: COMMERCIAL_CATEGORY_OPTIONS },
    { key: 'budget', label: 'Budget/Rental', options: BUDGET_BANDS },
  ]), [lookupMaps.brokers, lookups.branches, lookups.teams])

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-5">
        <CommercialMetricCard
          label="Total Leads"
          value={metrics.prospects}
          sublabel="All active leads"
          deltaLabel={pipelineDelta ? `${pipelineDelta > 0 ? '+' : ''}${pipelineDelta}% vs last month` : 'No movement yet'}
          icon={Users}
          chart={<MiniBars series={trendSeries} color="#2d6ecf" />}
        />
        <CommercialMetricCard
          label="Qualified Leads"
          value={metrics.qualifiedLeads}
          sublabel="Ready for next step"
          icon={CheckCircle2}
          chart={<MiniBars series={stageBreakdown} color="#8b5cf6" />}
        />
        <CommercialMetricCard
          label="Follow Ups"
          value={metrics.followUpsDue}
          sublabel="Due this week"
          deltaLabel={metrics.overdueFollowUps ? `${metrics.overdueFollowUps} overdue` : 'On track'}
          icon={CalendarDays}
          chart={<MiniBars series={trendSeries.slice(-4)} color="#f59e0b" />}
        />
        <CommercialMetricCard
          label="Converted"
          value={metrics.converted}
          sublabel="This month"
          icon={TrendingUp}
          chart={<MiniBars series={stageBreakdown.map((stage) => ({ ...stage, value: stage.key === 'converted' ? stage.count : 0 }))} color="#22c55e" />}
        />
        <CommercialMetricCard
          label="Pipeline Value"
          value={formatCurrencyZAR(metrics.pipelineValue)}
          sublabel="Opportunity value in motion"
          deltaLabel={pipelineDelta ? `${pipelineDelta > 0 ? '+' : ''}${pipelineDelta}% vs last month` : 'No movement yet'}
          icon={CircleDollarSign}
          chart={<LeadSparkline series={trendSeries} color="#22c55e" />}
        />
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
        <div className="border-b border-slate-200 px-5 pt-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {LEAD_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id)
                    setRoleFilter('all')
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-[#1267a3]'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-[#102236]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Button variant="primary" size="md" className="rounded-xl self-start xl:self-auto" onClick={openCreateLead}>
              <Plus size={16} />
              Add Lead
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            {roleFilters.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRoleFilter(option.value)}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                  roleFilter === option.value
                    ? 'bg-blue-50 text-[#1267a3]'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-[#102236]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            {categoryPills.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategoryFilter(option.value)}
                className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                  categoryFilter === option.value
                    ? 'border-blue-200 bg-blue-50 text-[#1267a3]'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-slate-50 hover:text-[#102236]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_120px] xl:items-end">
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Search</span>
              <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-[#9fb9d1] focus-within:ring-4 focus-within:ring-[#dbeafe]">
                <Search size={16} className="text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search leads, companies, requirements, areas, brokers..."
                  className="w-full border-0 bg-transparent text-sm font-medium text-[#102236] outline-none placeholder:text-slate-400"
                />
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Sort</span>
              <select
                value={`${sortKey}:${sortDirection}`}
                onChange={(event) => {
                  const [nextKey, nextDirection] = String(event.target.value || '').split(':')
                  setSortKey(nextKey)
                  setSortDirection(nextDirection || 'desc')
                }}
                className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
              >
                <option value="updatedAt:desc">Newest Updated</option>
                <option value="createdAt:desc">Newest Created</option>
                <option value="createdAt:asc">Oldest</option>
                <option value="value:desc">Highest Value</option>
                <option value="value:asc">Lowest Value</option>
                <option value="followUpDate:asc">Follow Up Date</option>
                <option value="lastActivityAt:desc">Recently Active</option>
              </select>
            </label>
            <div className="flex items-center justify-end text-sm font-semibold text-slate-500">
              {visibleLeads.length} leads
            </div>
          </div>

          <div className="mt-4">
            <CommercialFilterBar
              filters={advancedFilterConfigs}
              values={advancedFilters}
              onChange={(key, value) => setAdvancedFilters((previous) => ({ ...previous, [key]: value }))}
              onClear={() => setAdvancedFilters({
                branch: 'all',
                team: 'all',
                assigned: 'all',
                status: 'all',
                stage: 'all',
                propertyType: 'all',
                budget: 'all',
              })}
            />
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-[24px] bg-slate-100" />
              ))}
            </div>
          ) : error ? (
            <CommercialEmptyState title="Commercial leads could not be loaded" description={error} />
          ) : !visibleLeads.length ? (
            renderEmptyState()
          ) : (
            <>
              <div className="hidden lg:block">
                <div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
                  <table className="min-w-[1400px] w-full border-collapse">
                    <thead className="bg-[#f8fafc] text-left text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-500">
                      <tr>
                        {['Lead', 'Type', 'Category', 'Client / Company', 'Requirement / Asset', 'Area', 'Budget / Rental', 'Broker', 'Status / Stage', 'Last Activity', 'Actions'].map((label) => (
                          <th key={label} className="px-4 py-3">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLeads.map((lead) => (
                        <LeadRow
                          key={lead.id}
                          lead={lead}
                          onOpen={openDrawer}
                          onEdit={openEditLead}
                          onAddNote={handleAddNote}
                          onLogCall={handleLogCall}
                          onSchedule={handleSchedule}
                          onArchive={handleArchive}
                          onDelete={handleDelete}
                          menuOpen={openMenuId === lead.id}
                          onMenuToggle={() => setOpenMenuId((previous) => (previous === lead.id ? '' : lead.id))}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 lg:hidden">
                {visibleLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onOpen={openDrawer}
                    onEdit={openEditLead}
                    onAddNote={handleAddNote}
                    onLogCall={handleLogCall}
                    onSchedule={handleSchedule}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    menuOpen={openMenuId === lead.id}
                    onMenuToggle={() => setOpenMenuId((previous) => (previous === lead.id ? '' : lead.id))}
                  />
                ))}
              </div>

              <footer className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Showing <span className="font-semibold text-[#102236]">1</span>-
                  <span className="font-semibold text-[#102236]">{visibleLeads.length}</span> of{' '}
                  <span className="font-semibold text-[#102236]">{visibleLeads.length}</span> leads
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" className="rounded-xl" disabled>
                    <ChevronLeft size={14} />
                  </Button>
                  <Button variant="primary" size="sm" className="rounded-xl" disabled>
                    1
                  </Button>
                  <Button variant="secondary" size="sm" className="rounded-xl" disabled>
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </footer>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <CommercialTrendCard series={trendSeries} total={metrics.pipelineValue} deltaLabel={pipelineDelta ? `${pipelineDelta > 0 ? '+' : ''}${pipelineDelta}% vs last month` : 'No movement yet'} empty={!hasData} />
        <CommercialStageCard stages={stageBreakdown} total={metrics.pipelineValue} empty={!hasData} />
        <CommercialActivityCard items={recentActivity} empty={!recentActivity.length} />
      </section>

      <CommercialInsightBanner hasData={hasData} metrics={metrics} />

      <NewCommercialLeadModal
        open={modalState.open}
        mode={modalState.mode}
        record={modalState.record}
        lookups={lookups}
        onClose={() => setModalState({ open: false, mode: 'create', record: null })}
        onSave={handleSaveLead}
      />

      <CommercialLeadDrawer
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
