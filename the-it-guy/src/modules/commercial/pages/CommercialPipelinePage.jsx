import { createElement, useMemo } from 'react'
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  FileText,
  Handshake,
  KeyRound,
  Layers3,
  LineChart,
  ListChecks,
  MapPinned,
  MessageSquareText,
  Plus,
  Radar,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { formatCurrency, formatNumber } from '../commercialFormatters'
import { normalizeCommercialLifecycleStage } from '../commercialWorkflow'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialPipelineData } from '../services/commercialPipelineApi'

const CARD_CLASS = 'rounded-[24px] border border-[#e6edf4] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]'
const MODE_OPTIONS = [
  { id: 'leasing', label: 'Leasing' },
  { id: 'sales', label: 'Sales' },
]

const LEASING_STAGES = [
  { key: 'lead', label: 'Lead', icon: Users, color: '#2d6ecf' },
  { key: 'qualified', label: 'Qualified', icon: CheckCircle2, color: '#2d6ecf' },
  { key: 'matched', label: 'Matched', icon: MapPinned, color: '#15aabf' },
  { key: 'viewing_scheduled', label: 'Viewing Scheduled', icon: CalendarDays, color: '#0f8d63' },
  { key: 'negotiating', label: 'Negotiating', icon: MessageSquareText, color: '#e4a11b' },
  { key: 'hot_draft', label: 'HOT Draft', icon: FileText, color: '#9b5de5' },
  { key: 'hot_sent', label: 'HOT Sent', icon: Send, color: '#8b5cf6' },
  { key: 'hot_accepted', label: 'HOT Accepted', icon: ShieldCheck, color: '#0f8d63' },
  { key: 'lease_pending', label: 'Lease Pending', icon: Building2, color: '#1f6dd5' },
  { key: 'lease_signed', label: 'Lease Signed', icon: KeyRound, color: '#0f8d63' },
]

const SALES_STAGES = [
  { key: 'lead', label: 'Lead', icon: Users, color: '#2d6ecf' },
  { key: 'qualified', label: 'Qualified', icon: CheckCircle2, color: '#2d6ecf' },
  { key: 'matched', label: 'Matched', icon: MapPinned, color: '#15aabf' },
  { key: 'viewing_scheduled', label: 'Viewing Scheduled', icon: CalendarDays, color: '#0f8d63' },
  { key: 'offer_submitted', label: 'Offer Submitted', icon: Handshake, color: '#e4a11b' },
  { key: 'otp_draft', label: 'OTP Draft', icon: FileText, color: '#9b5de5' },
  { key: 'otp_sent', label: 'OTP Sent', icon: Send, color: '#8b5cf6' },
  { key: 'otp_accepted', label: 'OTP Accepted', icon: ShieldCheck, color: '#0f8d63' },
  { key: 'transfer_pending', label: 'Transfer Pending', icon: FileSignature, color: '#1f6dd5' },
  { key: 'transferred', label: 'Transferred', icon: KeyRound, color: '#0f8d63' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function recordDate(row = {}) {
  return row.updated_at || row.updatedAt || row.created_at || row.createdAt || row.viewing_date || ''
}

function titleize(value = '') {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function compactDate(value = '') {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

function inferMode(row = {}, kind = '') {
  const rawType = normalizeLower(row.deal_type || row.dealType || row.transaction_type || row.transactionType || row.listing_type || row.listingType || row.requirement_type || row.requirementType || row.type)
  if (['sale', 'sales', 'purchase', 'buyer', 'seller', 'investment'].some((token) => rawType.includes(token))) return 'sales'
  if (['lease', 'leasing', 'tenant', 'landlord', 'occupier', 'rental'].some((token) => rawType.includes(token))) return 'leasing'
  if (kind === 'listings' && normalizeLower(row.listing_category).includes('sale')) return 'sales'
  return 'leasing'
}

function recordValue(row = {}, kind = '') {
  if (kind === 'requirements') return Math.max(toNumber(row.budget_max), toNumber(row.budget_min), toNumber(row.estimated_value))
  if (kind === 'listings') return toNumber(row.pricing) || toNumber(row.asking_sale_price) || toNumber(row.asking_rental) || toNumber(row.asking_rental_per_m2)
  if (kind === 'transactions') return toNumber(row.value || row.target_value || row.deal_value)
  return toNumber(row.deal_value || row.value || row.target_value)
}

function stageForRecord(row = {}, kind = '', mode = 'leasing') {
  if (kind === 'viewings') return 'viewing_scheduled'

  if (kind === 'requirements') {
    const stage = normalizeCommercialLifecycleStage('requirements', row.stage || row.status, 'new')
    if (stage === 'qualified') return 'qualified'
    if (stage === 'matching') return 'matched'
    if (stage === 'viewing_scheduled') return 'viewing_scheduled'
    if (stage === 'negotiating') return mode === 'sales' ? 'offer_submitted' : 'negotiating'
    if (stage === 'hot' || stage === 'won') return mode === 'sales' ? 'otp_draft' : 'hot_draft'
    return 'lead'
  }

  if (kind === 'deals') {
    const stage = normalizeCommercialLifecycleStage('deals', row.stage || row.status, 'new')
    if (stage === 'qualified') return 'qualified'
    if (stage === 'negotiation') return mode === 'sales' ? 'offer_submitted' : 'negotiating'
    if (stage === 'hot_draft') return mode === 'sales' ? 'otp_draft' : 'hot_draft'
    if (stage === 'hot_sent') return mode === 'sales' ? 'otp_sent' : 'hot_sent'
    if (stage === 'hot_accepted') return mode === 'sales' ? 'otp_accepted' : 'hot_accepted'
    if (stage === 'lease_pending') return mode === 'sales' ? 'transfer_pending' : 'lease_pending'
    if (stage === 'converted') return mode === 'sales' ? 'transferred' : 'lease_signed'
    return 'lead'
  }

  if (kind === 'transactions') {
    const stage = normalizeCommercialLifecycleStage('transactions', row.stage || row.status, 'draft')
    if (stage === 'negotiating') return mode === 'sales' ? 'offer_submitted' : 'negotiating'
    if (stage === 'hot_in_progress') return mode === 'sales' ? 'otp_draft' : 'hot_draft'
    if (stage === 'hot_signed') return mode === 'sales' ? 'otp_accepted' : 'hot_accepted'
    if (stage === 'sale_pending') return 'transfer_pending'
    if (stage === 'lease_pending') return 'lease_pending'
    if (stage === 'completed') return mode === 'sales' ? 'transferred' : 'lease_signed'
    return 'lead'
  }

  if (kind === 'listings') {
    const stage = normalizeCommercialLifecycleStage('listings', row.listing_status || row.status, 'draft')
    if (stage === 'under_offer') return mode === 'sales' ? 'otp_accepted' : 'negotiating'
    if (stage === 'closed') return mode === 'sales' ? 'transferred' : 'lease_signed'
    return 'matched'
  }

  return 'lead'
}

function isUpcomingViewing(row = {}) {
  const status = normalizeLower(row.status)
  if (['completed', 'cancelled', 'no_show'].includes(status)) return false
  const dateText = normalizeText(row.viewing_date)
  if (!dateText) return false
  const timeText = normalizeText(row.viewing_time || '09:00').slice(0, 5) || '09:00'
  const scheduledAt = new Date(`${dateText}T${timeText}`)
  return !Number.isNaN(scheduledAt.getTime()) && scheduledAt >= new Date()
}

function scopeRows(rows = [], kind = '', mode = 'leasing') {
  return rows.filter((row) => inferMode(row, kind) === mode)
}

function buildStageRows({ data, mode }) {
  const stageConfig = mode === 'sales' ? SALES_STAGES : LEASING_STAGES
  const buckets = new Map(stageConfig.map((stage) => [stage.key, { ...stage, count: 0, value: 0 }]))
  const addRows = (rows, kind) => {
    rows.forEach((row) => {
      const key = stageForRecord(row, kind, mode)
      const bucket = buckets.get(key)
      if (!bucket) return
      bucket.count += 1
      bucket.value += recordValue(row, kind)
    })
  }

  addRows(scopeRows(data.requirements || [], 'requirements', mode), 'requirements')
  addRows(scopeRows(data.deals || [], 'deals', mode), 'deals')
  addRows(scopeRows(data.transactions || [], 'transactions', mode), 'transactions')
  addRows(scopeRows(data.listings || [], 'listings', mode), 'listings')
  addRows(scopeRows((data.viewings || []).filter(isUpcomingViewing), 'viewings', mode), 'viewings')

  const firstCount = buckets.get('lead')?.count || 0
  return stageConfig.map((stage) => {
    const row = buckets.get(stage.key) || { ...stage, count: 0, value: 0 }
    return {
      ...row,
      conversion: firstCount ? Math.round((row.count / firstCount) * 100) : 0,
    }
  })
}

function deriveModeData(data = {}, mode = 'leasing') {
  const requirements = scopeRows(data.requirements || [], 'requirements', mode)
  const deals = scopeRows(data.deals || [], 'deals', mode)
  const listings = scopeRows(data.listings || [], 'listings', mode)
  const transactions = scopeRows(data.transactions || [], 'transactions', mode)
  const viewings = scopeRows((data.viewings || []).filter(isUpcomingViewing), 'viewings', mode)

  const pipelineValue = [...transactions, ...deals, ...requirements, ...listings].reduce((sum, row) => sum + recordValue(row, inferMode(row)), 0)
  const qualified = requirements.filter((row) => ['qualified', 'matching', 'viewing_scheduled', 'negotiating', 'hot', 'won'].includes(normalizeCommercialLifecycleStage('requirements', row.stage || row.status, 'new')))
  const agreementStages = deals.filter((row) => {
    const stage = normalizeCommercialLifecycleStage('deals', row.stage || row.status, 'new')
    return ['hot_draft', 'hot_sent', 'hot_accepted', 'lease_pending'].includes(stage)
  })

  return {
    requirements,
    deals,
    listings,
    transactions,
    viewings,
    pipelineValue,
    qualifiedCount: qualified.length,
    agreementCount: agreementStages.length,
    stages: buildStageRows({ data, mode }),
  }
}

function MetricCard({ label, value, detail, icon }) {
  return (
    <article className={`${CARD_CLASS} min-h-[132px] p-4`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[#eef5ff] text-[#1f6dd5]">
          {createElement(icon, { size: 18 })}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#60758d]">{label}</p>
          <p className="mt-2 text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-[#061b3a]">{value}</p>
        </div>
      </div>
      <p className="mt-4 text-xs font-medium text-[#526985]">{detail}</p>
    </article>
  )
}

function StageCard({ stage }) {
  return (
    <article className="relative flex min-h-[182px] w-[150px] shrink-0 flex-col items-center rounded-[18px] border border-[#dce6f0] bg-white px-3 py-4 text-center shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] bg-[#eef5ff]" style={{ color: stage.color }}>
        {createElement(stage.icon, { size: 18 })}
      </span>
      <p className="mt-3 min-h-[38px] text-sm font-semibold leading-tight text-[#102236]">{stage.label}</p>
      <p className="mt-2 text-[1.55rem] font-semibold tracking-[-0.04em] text-[#061b3a]">{formatNumber(stage.count || 0)}</p>
      <p className="mt-1 text-xs font-medium text-[#60758d]">{stage.value ? formatCurrency(stage.value) : 'No value yet'}</p>
      <p className="mt-1 text-xs font-semibold text-[#60758d]">{stage.conversion ? `${stage.conversion}%` : '—'}</p>
      <span className="absolute inset-x-0 bottom-0 h-1.5 rounded-b-[18px]" style={{ backgroundColor: stage.color }} />
    </article>
  )
}

function StageFlow({ modeData, mode }) {
  const title = mode === 'sales' ? 'Sales Pipeline' : 'Leasing Pipeline'
  const hasActivity = modeData.stages.some((stage) => stage.count > 0)

  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
        <p className="text-sm leading-6 text-[#60758d]">
          {mode === 'sales'
            ? 'Track buyer and seller movement from lead to transferred.'
            : 'Track tenant demand and vacancies from lead to signed lease.'}
        </p>
      </div>
      <div className="mt-4 overflow-x-auto pb-2">
        <div className="flex min-w-max items-center gap-3">
          {modeData.stages.map((stage, index) => (
            <div key={stage.key} className="flex items-center gap-3">
              <StageCard stage={stage} />
              {index < modeData.stages.length - 1 ? <ArrowRight size={16} className="hidden shrink-0 text-[#7890aa] xl:block" /> : null}
            </div>
          ))}
        </div>
      </div>
      {!hasActivity ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-[#dce6f0] bg-[#fbfdff] px-4 py-3 text-sm text-[#60758d]">
          No {mode === 'sales' ? 'sales' : 'leasing'} activity yet. Start by adding a {mode === 'sales' ? 'sales lead or creating a listing' : 'tenant lead or creating a vacancy'}.
        </div>
      ) : null}
    </section>
  )
}

function InsightCard({ title, children, footer }) {
  return (
    <article className={`${CARD_CLASS} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-[-0.03em] text-[#102236]">{title}</h2>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
      {footer ? <div className="mt-4 border-t border-[#eef3f7] pt-3 text-center">{footer}</div> : null}
    </article>
  )
}

function AttentionRow({ title, detail, count }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-[#eef3f7] bg-[#fbfdff] px-3 py-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff1f2] text-[#d64545]">
        <ListChecks size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#102236]">{title}</p>
        <p className="mt-0.5 truncate text-xs text-[#60758d]">{detail}</p>
      </div>
      <span className="rounded-full bg-[#fff1f2] px-2 py-1 text-xs font-semibold text-[#c83232]">{formatNumber(count)}</span>
    </div>
  )
}

function ActivityRow({ title, detail, time }) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eafaf5] text-[#0f8d63]">
        <TrendingUp size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#102236]">{title}</p>
        <p className="mt-0.5 truncate text-xs text-[#60758d]">{detail}</p>
      </div>
      <span className="shrink-0 text-xs font-medium text-[#7890aa]">{time}</span>
    </div>
  )
}

function QuickAction({ to, label, icon }) {
  return (
    <Link to={to} className="flex min-h-[92px] flex-col items-center justify-center rounded-[16px] border border-[#dce6f0] bg-white px-3 py-3 text-center text-sm font-semibold text-[#102236] transition hover:border-[#bfd2e6] hover:bg-[#f8fbff]">
      <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#eef5ff] text-[#1f6dd5]">
        {createElement(icon, { size: 18 })}
      </span>
      {label}
    </Link>
  )
}

function PipelineSkeleton() {
  return (
    <div className="grid gap-5 pb-10">
      <div className="h-24 animate-pulse rounded-[24px] bg-white" />
      <div className="h-24 animate-pulse rounded-[24px] bg-white" />
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[132px] animate-pulse rounded-[24px] bg-white" />)}
      </div>
      <div className="h-[270px] animate-pulse rounded-[24px] bg-white" />
    </div>
  )
}

function CommercialPipelinePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedMode = searchParams.get('mode') === 'sales' ? 'sales' : 'leasing'
  const { data, loading, error } = useCommercialData(getCommercialPipelineData, [])

  const modeData = useMemo(() => deriveModeData(data || {}, selectedMode), [data, selectedMode])
  const leasingData = useMemo(() => deriveModeData(data || {}, 'leasing'), [data])
  const salesData = useMemo(() => deriveModeData(data || {}, 'sales'), [data])
  const totalPipelineValue = leasingData.pipelineValue + salesData.pipelineValue

  if (loading) return <PipelineSkeleton />

  if (error) {
    return (
      <div className="space-y-6 pb-10">
        <section className={`${CARD_CLASS} p-6`}>
          <h1 className="text-[1.8rem] font-semibold tracking-[-0.04em] text-[#0f2748]">Pipeline</h1>
          <p className="mt-2 text-sm leading-6 text-[#526276]">Track leasing and sales movement from first contact to signed deal.</p>
        </section>
        <CommercialEmptyState title="Commercial pipeline data could not be loaded" description={error} />
      </div>
    )
  }

  const modeLabel = selectedMode === 'sales' ? 'Sales' : 'Leasing'
  const kpis = selectedMode === 'sales'
    ? [
        { label: 'Pipeline Value', value: formatCurrency(modeData.pipelineValue), detail: 'Sales value in motion', icon: LineChart },
        { label: 'Active Buyer/Seller Leads', value: formatNumber(modeData.requirements.length), detail: 'Open sales demand records', icon: Users },
        { label: 'Qualified Prospects', value: formatNumber(modeData.qualifiedCount), detail: 'Ready for matching or offers', icon: CheckCircle2 },
        { label: 'Viewings Scheduled', value: formatNumber(modeData.viewings.length), detail: 'Upcoming sales inspections', icon: CalendarDays },
        { label: 'OTPs In Progress', value: formatNumber(modeData.agreementCount), detail: 'Offer paperwork moving', icon: FileSignature },
        { label: 'Sales Listings', value: formatNumber(modeData.listings.length), detail: 'Active sales stock', icon: Warehouse },
      ]
    : [
        { label: 'Pipeline Value', value: formatCurrency(modeData.pipelineValue), detail: 'Leasing value in motion', icon: LineChart },
        { label: 'Active Tenant Leads', value: formatNumber(modeData.requirements.length), detail: 'Open tenant demand records', icon: Users },
        { label: 'Qualified Tenants', value: formatNumber(modeData.qualifiedCount), detail: 'Ready for matching or viewings', icon: CheckCircle2 },
        { label: 'Viewings Scheduled', value: formatNumber(modeData.viewings.length), detail: 'Upcoming lease inspections', icon: CalendarDays },
        { label: 'HOTs In Progress', value: formatNumber(modeData.agreementCount), detail: 'Heads of terms moving', icon: FileText },
        { label: 'Vacancies', value: formatNumber(modeData.listings.length), detail: 'Lease stock being worked', icon: Building2 },
      ]

  const newLeadCount = modeData.requirements.filter((row) => normalizeCommercialLifecycleStage('requirements', row.stage || row.status, 'new') === 'new').length
  const agreementSentCount = modeData.deals.filter((row) => ['hot_sent', 'hot_accepted'].includes(normalizeCommercialLifecycleStage('deals', row.stage || row.status, 'new'))).length
  const incompleteStockCount = modeData.listings.filter((row) => !normalizeText(row.primary_image_url || row.image_url || row.mandate_document_url || row.document_url)).length
  const pendingTransferCount = modeData.transactions.filter((row) => ['sale_pending', 'lease_pending'].includes(normalizeCommercialLifecycleStage('transactions', row.stage || row.status, 'draft'))).length

  const attention = selectedMode === 'sales'
    ? [
        { title: 'Buyer/seller leads not yet contacted', detail: 'New sales leads need first contact', count: newLeadCount },
        { title: 'OTPs awaiting signature', detail: 'Offer paperwork needs follow-up', count: agreementSentCount },
        { title: 'Listings missing mandate', detail: 'Complete mandate or document pack', count: incompleteStockCount },
        { title: 'Transfers waiting on documents', detail: 'Keep attorney workflow moving', count: pendingTransferCount },
      ]
    : [
        { title: 'Tenant leads not yet contacted', detail: 'New leasing leads need first contact', count: newLeadCount },
        { title: 'HOTs awaiting signature', detail: 'Heads of terms need follow-up', count: agreementSentCount },
        { title: 'Vacancies missing photos/documents', detail: 'Improve marketing readiness', count: incompleteStockCount },
        { title: 'Lease expiring soon', detail: 'Review renewal and retention risk', count: pendingTransferCount },
      ]

  const activityRecords = [
    ...modeData.requirements.map((row) => ({ id: `req-${row.id}`, title: selectedMode === 'sales' ? 'Sales lead updated' : 'Tenant lead updated', detail: row.company_name || row.contact_name || row.requirement_name || 'Commercial lead', date: recordDate(row) })),
    ...modeData.deals.map((row) => ({ id: `deal-${row.id}`, title: selectedMode === 'sales' ? 'Offer movement' : 'HOT movement', detail: row.deal_name || row.name || titleize(row.stage), date: recordDate(row) })),
    ...modeData.viewings.map((row) => ({ id: `viewing-${row.id}`, title: 'Viewing scheduled', detail: row.property_name || row.company_name || row.location || 'Commercial viewing', date: recordDate(row) })),
    ...modeData.transactions.map((row) => ({ id: `tx-${row.id}`, title: selectedMode === 'sales' ? 'Transfer movement' : 'Lease movement', detail: row.title || row.status || 'Commercial transaction', date: recordDate(row) })),
  ]
    .filter((row) => normalizeText(row.date))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 4)

  const actions = selectedMode === 'sales'
    ? [
        { to: '/commercial/sales/leads', label: 'Add Sales Lead', icon: Plus },
        { to: '/commercial/sales/canvassing', label: 'Start Canvassing', icon: Radar },
        { to: '/commercial/sales/listings', label: 'Create Sales Listing', icon: Building2 },
        { to: '/commercial/sales/deals', label: 'Add Viewing', icon: CalendarDays },
        { to: '/commercial/documents?packetType=commercial_sale', label: 'Create OTP', icon: FileSignature },
        { to: '/commercial/sales/listings', label: 'View Sales Listings', icon: Search },
      ]
    : [
        { to: '/commercial/leasing/leads', label: 'Add Tenant Lead', icon: Plus },
        { to: '/commercial/leasing/canvassing', label: 'Start Canvassing', icon: Radar },
        { to: '/commercial/leasing/vacancies', label: 'Create Vacancy', icon: Building2 },
        { to: '/commercial/leasing/deals', label: 'Add Viewing', icon: CalendarDays },
        { to: '/commercial/heads-of-terms', label: 'Create HOT', icon: FileText },
        { to: '/commercial/leasing/vacancies', label: 'View Vacancies', icon: Search },
      ]

  return (
    <div className="space-y-5 pb-10">
      <section>
        <h1 className="text-[1.8rem] font-semibold tracking-[-0.04em] text-[#0f2748]">Pipeline</h1>
        <p className="mt-2 text-sm leading-6 text-[#526276]">Track leasing and sales movement from first contact to signed deal.</p>
      </section>

      <section className={`${CARD_CLASS} p-5`}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.48fr)] xl:items-center">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-[#60758d]">Total Pipeline Value</p>
              <p className="mt-1 text-[1.65rem] font-semibold tracking-[-0.04em] text-[#061b3a]">{formatCurrency(totalPipelineValue)}</p>
            </div>
            <div className="border-[#e8eef5] sm:border-l sm:pl-6">
              <p className="text-xs font-semibold text-[#60758d]">Leasing</p>
              <p className="mt-1 text-base font-semibold text-[#0d5ed0]">{formatCurrency(leasingData.pipelineValue)}</p>
            </div>
            <div className="border-[#e8eef5] sm:border-l sm:pl-6">
              <p className="text-xs font-semibold text-[#60758d]">Sales</p>
              <p className="mt-1 text-base font-semibold text-[#0f8d63]">{formatCurrency(salesData.pipelineValue)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 rounded-[18px] border border-[#dce6f0] bg-white p-1 shadow-sm">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSearchParams({ mode: option.id }, { replace: true })}
                className={`h-12 rounded-[14px] text-sm font-semibold transition ${selectedMode === option.id ? 'bg-[#1f6dd5] text-white shadow-[0_10px_24px_rgba(31,109,213,0.22)]' : 'text-[#102236] hover:bg-[#f8fbff]'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {kpis.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <StageFlow modeData={modeData} mode={selectedMode} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.15fr)]">
        <InsightCard
          title="Needs Attention"
          footer={<Link to={selectedMode === 'sales' ? '/commercial/sales/leads' : '/commercial/leasing/leads'} className="text-sm font-semibold text-[#0d5ed0]">View all</Link>}
        >
          {attention.map((item) => <AttentionRow key={item.title} {...item} />)}
        </InsightCard>

        <InsightCard
          title="Recent Activity"
          footer={<Link to="/commercial/activity" className="text-sm font-semibold text-[#0d5ed0]">View all activity</Link>}
        >
          {activityRecords.length ? activityRecords.map((item) => (
            <ActivityRow key={item.id} title={item.title} detail={item.detail} time={compactDate(item.date)} />
          )) : (
            <div className="rounded-[18px] border border-dashed border-[#dce6f0] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#60758d]">
              No {modeLabel.toLowerCase()} activity yet.
            </div>
          )}
        </InsightCard>

        <InsightCard
          title="Quick Actions"
          footer={<Link to={selectedMode === 'sales' ? '/commercial/sales/leads' : '/commercial/leasing/leads'} className="text-sm font-semibold text-[#0d5ed0]">View all actions</Link>}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {actions.map((action) => <QuickAction key={action.label} {...action} />)}
          </div>
        </InsightCard>
      </section>
    </div>
  )
}

export default CommercialPipelinePage
