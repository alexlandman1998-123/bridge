import { useId, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Flame,
  Handshake,
  LineChart,
  PieChart,
  ShieldAlert,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import CommercialEmptyState from './CommercialEmptyState'
import { formatNumber, titleize } from '../commercialFormatters'

const PANEL_CLASS = 'rounded-[24px] border border-[rgba(15,23,42,0.07)] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
const GLASS_CARD_CLASS = 'rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.94)_100%)] shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl'
const EMPTY_OBJECT = Object.freeze({})

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

function asDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function startOfToday(date = new Date()) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfWeek(date = new Date()) {
  const next = startOfToday(date)
  const dayIndex = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - dayIndex)
  return next
}

function endOfWeek(date = new Date()) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  next.setHours(23, 59, 59, 999)
  return next
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  next.setHours(23, 59, 59, 999)
  return next
}

function addMonths(date, count) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + count)
  return next
}

function isWithinRange(value, start, end) {
  const date = asDate(value)
  return Boolean(date && date >= start && date <= end)
}

function isActiveRequirement(row = {}) {
  return !['won', 'lost', 'archived', 'inactive'].includes(normalizeLower(row.stage || row.status || 'new'))
}

function isOpenVacancy(row = {}) {
  return !['occupied', 'archived', 'withdrawn', 'suspended', 'terminated', 'inactive'].includes(normalizeLower(row.status || 'draft'))
}

function isActiveDeal(row = {}) {
  return !['converted', 'lost', 'archived', 'inactive', 'completed', 'cancelled'].includes(normalizeLower(row.stage || row.status || 'new'))
}

function isActiveListing(row = {}) {
  return !['draft', 'internal_review', 'withdrawn', 'expired', 'archived', 'closed'].includes(normalizeLower(row.listing_status || row.status || 'draft'))
}

function isActiveLease(row = {}) {
  return !['archived', 'terminated', 'cancelled'].includes(normalizeLower(row.status || 'active'))
}

function isOpenTransaction(row = {}) {
  return !['completed', 'lost', 'cancelled'].includes(normalizeLower(row.status))
}

function daysBetween(start, end) {
  const startDate = asDate(start)
  const endDate = asDate(end)
  if (!startDate || !endDate) return null
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000)
}

function formatCompactCurrency(value) {
  const amount = toNumber(value)
  if (!amount) return 'R0'
  if (amount >= 1000000000) return `R${(amount / 1000000000).toFixed(1)}bn`
  if (amount >= 1000000) return `R${(amount / 1000000).toFixed(1)}m`
  if (amount >= 1000) return `R${(amount / 1000).toFixed(1)}k`
  return `R${Math.round(amount)}`
}

function formatPercentValue(value, maximumFractionDigits = 0) {
  const amount = toNumber(value)
  return `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits }).format(amount)}%`
}

function formatPercentage(value, maximumFractionDigits = 0) {
  return formatPercentValue(value, maximumFractionDigits)
}

function calculateMonthDelta(current, previous, mode = 'percent') {
  const currentValue = toNumber(current)
  const previousValue = toNumber(previous)
  if (!currentValue && !previousValue) {
    return { delta: 0, direction: 'flat' }
  }

  if (mode === 'points') {
    const delta = currentValue - previousValue
    return { delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' }
  }

  if (!previousValue) {
    const delta = currentValue ? 100 : 0
    return { delta, direction: delta > 0 ? 'up' : 'flat' }
  }

  const delta = ((currentValue - previousValue) / previousValue) * 100
  return { delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' }
}

function buildMonthWindows(months = 6, endDate = new Date()) {
  const anchor = startOfMonth(endDate)
  return Array.from({ length: months }, (_, index) => {
    const monthDate = addMonths(anchor, index - (months - 1))
    return {
      key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
      label: new Intl.DateTimeFormat('en-ZA', { month: 'short' }).format(monthDate),
      start: startOfMonth(monthDate),
      end: endOfMonth(monthDate),
    }
  })
}

function buildMonthlyCountSeries(rows = [], dateAccessor = (row) => row.created_at || row.createdAt || row.updated_at || row.updatedAt, months = 6) {
  return buildMonthWindows(months).map((window) => ({
    label: window.label,
    key: window.key,
    value: rows.reduce((count, row) => {
      const date = asDate(typeof dateAccessor === 'function' ? dateAccessor(row) : row?.[dateAccessor])
      return date && date >= window.start && date <= window.end ? count + 1 : count
    }, 0),
  }))
}

function buildMonthlyValueSeries(rows = [], valueAccessor = (row) => row.value || row.targetValue || 0, dateAccessor = (row) => row.actualCloseDate || row.updatedAt || row.createdAt, months = 6) {
  return buildMonthWindows(months).map((window) => ({
    label: window.label,
    key: window.key,
    value: rows.reduce((total, row) => {
      const date = asDate(typeof dateAccessor === 'function' ? dateAccessor(row) : row?.[dateAccessor])
      if (!date || date < window.start || date > window.end) return total
      const amount = typeof valueAccessor === 'function' ? valueAccessor(row) : row?.[valueAccessor]
      return total + toNumber(amount)
    }, 0),
  }))
}

function getFirstName(profile = null) {
  const direct = normalizeText(profile?.firstName || profile?.first_name)
  if (direct) return direct
  const fullName = normalizeText(profile?.fullName || profile?.full_name || profile?.name)
  if (fullName) return fullName.split(/\s+/)[0]
  return 'there'
}

function buildBrokerActivityRows(data = {}, brokerRows = []) {
  const today = new Date()
  const currentMonthStart = startOfMonth(today)
  const currentMonthEnd = endOfMonth(today)
  const previousMonthDate = addMonths(today, -1)
  const previousMonthStart = startOfMonth(previousMonthDate)
  const previousMonthEnd = endOfMonth(previousMonthDate)

  function totalForPeriod(brokerId, start, end) {
    const viewingsCompleted = (data.viewings || []).filter((row) =>
      normalizeText(row.broker_id) === brokerId &&
      normalizeLower(row.status) === 'completed' &&
      isWithinRange(row.updated_at || row.viewing_date, start, end),
    ).length
    const requirementsMatched = (data.requirements || []).filter((row) =>
      normalizeText(row.assigned_broker || row.broker_id) === brokerId &&
      isWithinRange(row.updated_at || row.created_at, start, end),
    ).length
    const hotCreated = (data.headsOfTerms || []).filter((row) =>
      normalizeText(row.broker_id) === brokerId &&
      isWithinRange(row.updated_at || row.created_at, start, end),
    ).length
    const dealsSigned = (data.commercialTransactions || []).filter((row) =>
      normalizeText(row.brokerId || row.broker_id) === brokerId &&
      normalizeLower(row.status) === 'completed' &&
      isWithinRange(row.actualCloseDate || row.updatedAt || row.createdAt, start, end),
    ).length

    return {
      viewingsCompleted,
      requirementsMatched,
      hotCreated,
      dealsSigned,
      total: viewingsCompleted + requirementsMatched + hotCreated + dealsSigned,
    }
  }

  return brokerRows.slice(0, 6).map((row) => {
    const current = totalForPeriod(normalizeText(row.id), currentMonthStart, currentMonthEnd)
    const previous = totalForPeriod(normalizeText(row.id), previousMonthStart, previousMonthEnd)
    const delta = previous.total ? ((current.total - previous.total) / previous.total) * 100 : (current.total ? 100 : 0)
    return {
      id: row.id,
      name: row.name || 'Broker',
      current,
      delta,
    }
  })
}

function buildFreshWorkspaceState(summary = {}, data = {}) {
  return !toNumber(summary.activeListings) &&
    !toNumber(summary.activeRequirements) &&
    !toNumber(summary.activeCompanies) &&
    !(data.deals || []).length &&
    !(data.leases || []).length &&
    !(data.vacancies || []).length &&
    !(data.commercialTransactions || []).length
}

function getDisplayName(profile = null) {
  return normalizeText(profile?.fullName || profile?.full_name || profile?.name)
    || [normalizeText(profile?.firstName || profile?.first_name), normalizeText(profile?.lastName || profile?.last_name)].filter(Boolean).join(' ')
    || getFirstName(profile)
}

function getModeFromRole(value = '') {
  const role = normalizeLower(value)
  if (['seller', 'buyer', 'investor', 'purchaser'].includes(role) || role.includes('seller') || role.includes('buyer') || role.includes('invest')) return 'sales'
  if (['landlord', 'tenant', 'occupier'].includes(role) || role.includes('landlord') || role.includes('tenant') || role.includes('occupier')) return 'leasing'
  return ''
}

function getRecordMode(row = {}, fallback = 'leasing') {
  const explicit = normalizeLower(row.mode || row.workflowMode || row.workflow_mode || row.businessLine || row.business_line)
  if (explicit.includes('sales') || explicit.includes('sale')) return 'sales'
  if (explicit.includes('leasing') || explicit.includes('lease')) return 'leasing'

  const transactionType = normalizeLower(row.transactionType || row.transaction_type || row.dealType || row.deal_type || row.listing_intent || row.listingIntent || row.requirement_type || row.requirementType || row.listing_type || row.listingType)
  if (['sale', 'sales', 'purchase', 'investment'].includes(transactionType) || transactionType.includes('sale') || transactionType.includes('purchase') || transactionType.includes('investment')) return 'sales'
  if (['lease', 'leasing', 'rental'].includes(transactionType) || transactionType.includes('lease') || transactionType.includes('rental')) return 'leasing'

  return getModeFromRole(row.prospectRole || row.prospectType || row.leadRole || row.lead_role || row.client_type || row.clientType) || fallback
}

function isModeRecord(row = {}, mode = 'leasing', fallback = 'leasing') {
  return getRecordMode(row, fallback) === mode
}

function getRowDate(row = {}) {
  return row.created_at || row.createdAt || row.created_date || row.updated_at || row.updatedAt || ''
}

function isThisWeek(row = {}) {
  return isWithinRange(getRowDate(row), startOfWeek(), endOfWeek())
}

function getCommissionValue(row = {}) {
  return toNumber(row.commission?.commissionValue || row.commissionValue || row.commission_value || row.estimated_commission || row.commission_amount)
}

function getTransactionValue(row = {}) {
  return toNumber(row.value || row.targetValue || row.target_value || row.deal_value || row.pricing || row.asking_price || row.asking_rental)
}

function getBrokerId(row = {}) {
  return normalizeText(row.brokerId || row.broker_id || row.assigned_broker || row.broker_assignment || row.deal?.broker_id || row.deal?.assigned_broker)
}

function stageMatches(row = {}, patterns = []) {
  const value = normalizeLower(row.status || row.stage || row.currentStage || row.current_stage || row.listing_status)
  return patterns.some((pattern) => value.includes(pattern))
}

function buildChangeForRows(rows = []) {
  const months = buildMonthWindows(2)
  const previous = rows.filter((row) => isWithinRange(getRowDate(row), months[0].start, months[0].end)).length
  const current = rows.filter((row) => isWithinRange(getRowDate(row), months[1].start, months[1].end)).length
  return calculateMonthDelta(current, previous)
}

function trendLabelFromDelta(delta = {}, emptyLabel = 'No prior period') {
  if (!delta || delta.direction === 'flat') return emptyLabel
  const prefix = delta.delta > 0 ? '+' : '-'
  return `${prefix}${Math.abs(delta.delta).toFixed(0)}% vs last month`
}

function buildModeSlices(data = {}, mode = 'leasing') {
  const companies = data.companies || []
  const landlords = data.landlords || []
  const tenants = data.tenants || []
  const vacancies = data.vacancies || []
  const listings = data.listings || []
  const requirements = data.requirements || []
  const viewings = data.viewings || []
  const deals = data.deals || []
  const headsOfTerms = data.headsOfTerms || []
  const leases = data.leases || []
  const transactions = data.commercialTransactions || []
  const commissions = data.commissions || []

  const modeCompanies = companies.filter((row) => isModeRecord(row, mode, mode))
  const modeListings = listings.filter((row) => isModeRecord(row, mode, 'sales'))
  const modeRequirements = requirements.filter((row) => isModeRecord(row, mode, 'leasing'))
  const modeDeals = deals.filter((row) => isModeRecord(row, mode, 'leasing'))
  const modeTransactions = transactions.filter((row) => isModeRecord(row, mode, 'leasing'))
  const modeCommissions = commissions.filter((row) => isModeRecord(row, mode, mode))
  const modeViewings = viewings.filter((row) => {
    if (mode === 'leasing') return true
    return isModeRecord(row, mode, 'leasing')
  })

  const openTransactions = modeTransactions.filter(isOpenTransaction)
  const openDeals = modeDeals.filter(isActiveDeal)
  const activeListings = modeListings.filter(isActiveListing)
  const openVacancies = vacancies.filter(isOpenVacancy)
  const activeRequirements = modeRequirements.filter(isActiveRequirement)
  const activeHeadsOfTerms = headsOfTerms.filter((row) => !['converted', 'superseded', 'archived'].includes(normalizeLower(row.status)))
  const activeLeases = leases.filter(isActiveLease)
  const modeLeads = mode === 'leasing'
    ? [...modeCompanies, ...landlords, ...tenants].filter((row, index, rows) => rows.findIndex((candidate) => normalizeText(candidate.id) && normalizeText(candidate.id) === normalizeText(row.id)) === index)
    : modeCompanies

  const pipelineValue = [...openTransactions, ...openDeals, ...activeListings].reduce((sum, row) => sum + getTransactionValue(row), 0)
  const commissionForecast = [...openTransactions, ...openDeals, ...modeCommissions].reduce((sum, row) => sum + getCommissionValue(row), 0)

  return {
    companies: modeCompanies,
    leads: modeLeads,
    landlords,
    tenants,
    vacancies: openVacancies,
    listings: activeListings,
    requirements: activeRequirements,
    viewings: modeViewings.filter((row) => !['cancelled', 'no_show'].includes(normalizeLower(row.status))),
    deals: openDeals,
    headsOfTerms: activeHeadsOfTerms,
    leases: activeLeases,
    transactions: modeTransactions,
    openTransactions,
    commissions: modeCommissions,
    pipelineValue,
    commissionForecast,
  }
}

function CommercialDashboardModeToggle({ mode, onChange }) {
  return (
    <div className="inline-flex h-10 rounded-[12px] border border-[#d8e2ee] bg-white p-1 shadow-[0_8px_20px_rgba(15,23,42,0.05)]" role="tablist" aria-label="Commercial dashboard mode">
      {[
        { key: 'leasing', label: 'Leasing', icon: Building2 },
        { key: 'sales', label: 'Sales', icon: BadgeDollarSign },
      ].map((item) => {
        const selected = mode === item.key
        const Icon = item.icon
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.key)}
            className={`inline-flex min-w-[104px] items-center justify-center gap-2 rounded-[9px] px-4 text-[13px] font-semibold transition ${
              selected
                ? 'bg-[#0b2342] text-white shadow-[0_8px_18px_rgba(11,35,66,0.18)]'
                : 'text-[#33465d] hover:bg-[#f5f8fb]'
            }`}
          >
            <Icon size={15} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function DashboardHeader({ profile, mode, onModeChange }) {
  return (
    <header className="flex flex-col gap-3 pt-1 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-[#0f2748] lg:text-[22px]">{getDisplayName(profile)}</h1>
        <p className="mt-1 text-[13px] font-medium text-[#60758d]">Commercial Operations Overview</p>
      </div>
      <CommercialDashboardModeToggle mode={mode} onChange={onModeChange} />
    </header>
  )
}

function MiniSparkline({ values = [], tone = '#2d6ecf' }) {
  const uid = useId().replace(/:/g, '')
  const width = 180
  const height = 58
  const padding = 4
  const usableWidth = width - (padding * 2)
  const usableHeight = height - (padding * 2)
  const maxValue = Math.max(...values.map((value) => toNumber(value)), 1)
  const step = values.length > 1 ? usableWidth / (values.length - 1) : 0
  const points = values.map((value, index) => {
    const x = padding + (index * step)
    const y = padding + usableHeight - ((toNumber(value) / maxValue) * usableHeight)
    return { x, y }
  })

  if (!values.length) {
    return <div className="h-[58px] rounded-[18px] border border-dashed border-[#e4ebf2] bg-[#fbfdff]" />
  }

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = `${path} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[58px] w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.26" />
          <stop offset="100%" stopColor={tone} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${uid})`} />
      <path d={path} fill="none" stroke={tone} strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3.5" fill={tone} stroke="#ffffff" strokeWidth="2" />
    </svg>
  )
}

function MiniProgress({ value = 0, tone = '#23b26d', label = '' }) {
  const amount = Math.max(0, Math.min(100, toNumber(value)))
  return (
    <div className="space-y-2">
      <div className="h-2.5 rounded-full bg-[#edf2f7]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${amount}%`,
            background: `linear-gradient(90deg, ${tone} 0%, rgba(35,178,109,0.72) 100%)`,
          }}
        />
      </div>
      {label ? <p className="text-[12px] font-medium text-[#6b7c91]">{label}</p> : null}
    </div>
  )
}

function CommercialKpiRow({ items = [], loading = false }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon || LineChart
        const delta = item.delta || {}
        const positive = delta.direction !== 'down'
        return (
          <article key={item.key || item.label} className={`${GLASS_CARD_CLASS} min-h-[146px] p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-[#66768a]">{item.label}</p>
                <p className="mt-3 text-[30px] font-semibold leading-none tracking-normal text-[#0f2748] tabular-nums">{loading ? '...' : item.value}</p>
              </div>
              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${item.tone || 'bg-[#edf5ff] text-[#1769d1]'}`}>
                <Icon size={17} />
              </span>
            </div>
            <p className="mt-3 truncate text-[12px] font-medium text-[#52657a]">{item.subLabel}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${positive ? 'text-[#16894f]' : 'text-[#c83b36]'}`}>
                <TrendingUp size={12} className={positive ? '' : 'rotate-180'} />
                {trendLabelFromDelta(delta, item.emptyTrend || 'No trend yet')}
              </span>
              <span className="w-[92px]">
                <MiniSparkline values={item.sparkline || []} tone={item.sparkTone || '#3773f5'} />
              </span>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function buildCommercialKpis({ mode, slices, summary, financialSummary, series }) {
  const leadRows = slices.leads || []
  const newLeadsThisWeek = leadRows.filter(isThisWeek).length
  const hotCount = slices.headsOfTerms.filter((row) => ['sent', 'under_review', 'accepted', 'signed', 'ready_for_lease'].includes(normalizeLower(row.status))).length
  const negotiationCount = [...slices.deals, ...slices.openTransactions].filter((row) => stageMatches(row, ['negotiat', 'proposal', 'under_offer', 'hot'])).length
  const signedPending = slices.headsOfTerms.filter((row) => ['signed', 'ready_for_lease'].includes(normalizeLower(row.status))).length
  const activeTransactions = slices.openTransactions.length || slices.deals.length
  const vacancyDelta = buildChangeForRows(slices.vacancies)
  const transactionsDelta = buildChangeForRows([...slices.openTransactions, ...slices.deals])
  const listingsDelta = buildChangeForRows(slices.listings)
  const leadsDelta = buildChangeForRows(leadRows)
  const commissionDelta = calculateMonthDelta(series.commission.at(-1)?.value || 0, series.commission.at(-2)?.value || 0)
  const pipelineDelta = calculateMonthDelta(series.pipeline.at(-1)?.value || 0, series.pipeline.at(-2)?.value || 0)

  if (mode === 'sales') {
    return [
      {
        key: 'active-transactions',
        label: 'Active Transactions',
        value: formatNumber(activeTransactions),
        subLabel: 'Sales deals in progress',
        delta: transactionsDelta,
        icon: Handshake,
        tone: 'bg-[#edf5ff] text-[#1769d1]',
        sparkline: series.transactions.map((point) => point.value),
      },
      {
        key: 'active-listings',
        label: 'Active Listings',
        value: formatNumber(slices.listings.length || toNumber(summary.activeListings)),
        subLabel: 'Live sales listings',
        delta: listingsDelta,
        icon: Building2,
        tone: 'bg-[#ecfdf3] text-[#16894f]',
        sparkTone: '#18a765',
        sparkline: series.listings.map((point) => point.value),
      },
      {
        key: 'pipeline-value',
        label: 'Pipeline Value',
        value: formatCompactCurrency(slices.pipelineValue || financialSummary.pipelineValue || summary.pipelineValue),
        subLabel: 'Total sales pipeline value',
        delta: pipelineDelta,
        icon: LineChart,
        tone: 'bg-[#f3efff] text-[#7657d8]',
        sparkTone: '#7657d8',
        sparkline: series.pipeline.map((point) => point.value),
      },
      {
        key: 'new-leads',
        label: 'New Leads This Week',
        value: formatNumber(newLeadsThisWeek),
        subLabel: 'Seller and buyer leads',
        delta: leadsDelta,
        icon: Users,
        tone: 'bg-[#fff7ea] text-[#df7b14]',
        sparkTone: '#f97316',
        sparkline: series.leads.map((point) => point.value),
      },
    ]
  }

  return [
    {
      key: 'vacancies',
      label: 'Number of Vacancies',
      value: formatNumber(slices.vacancies.length || summary.activeVacancies || 0),
      subLabel: 'Active vacancies',
      delta: vacancyDelta,
      icon: Warehouse,
      tone: 'bg-[#edf5ff] text-[#1769d1]',
      sparkline: series.vacancies.map((point) => point.value),
    },
    {
      key: 'deals-progress',
      label: 'Deals in Progress',
      value: formatNumber(activeTransactions),
      subLabel: `${formatNumber(hotCount)} HOT · ${formatNumber(negotiationCount)} negotiation · ${formatNumber(signedPending)} signed pending`,
      delta: transactionsDelta,
      icon: FileText,
      tone: 'bg-[#ecfdf3] text-[#16894f]',
      sparkTone: '#18a765',
      sparkline: series.transactions.map((point) => point.value),
    },
    {
      key: 'commission',
      label: 'Commission Forecast',
      value: formatCompactCurrency(slices.commissionForecast || financialSummary.expectedCommission || summary.expectedRevenue),
      subLabel: 'Expected leasing commission',
      delta: commissionDelta,
      icon: BadgeDollarSign,
      tone: 'bg-[#f3efff] text-[#7657d8]',
      sparkTone: '#7657d8',
      sparkline: series.commission.map((point) => point.value),
    },
    {
      key: 'new-leads',
      label: 'New Leads This Week',
      value: formatNumber(newLeadsThisWeek),
      subLabel: 'Landlord and tenant leads',
      delta: leadsDelta,
      icon: Users,
      tone: 'bg-[#fff7ea] text-[#df7b14]',
      sparkTone: '#f97316',
      sparkline: series.leads.map((point) => point.value),
    },
  ]
}

function buildModeSeries(slices = {}) {
  return {
    leads: buildMonthlyCountSeries(slices.leads || []),
    vacancies: buildMonthlyCountSeries(slices.vacancies || []),
    listings: buildMonthlyCountSeries(slices.listings || []),
    transactions: buildMonthlyCountSeries([...(slices.openTransactions || []), ...(slices.deals || [])]),
    pipeline: buildMonthlyValueSeries([...(slices.transactions || []), ...(slices.deals || []), ...(slices.listings || [])], getTransactionValue),
    commission: buildMonthlyValueSeries([...(slices.transactions || []), ...(slices.deals || []), ...(slices.commissions || [])], getCommissionValue),
  }
}

function buildModeStageBreakdown(mode, slices = {}) {
  const valueForRows = (rows = []) => rows.reduce((sum, row) => sum + getTransactionValue(row), 0)
  const leaseNegotiation = [...slices.deals, ...slices.openTransactions].filter((row) => stageMatches(row, ['negotiat', 'proposal', 'under_offer', 'lease_draft']))
  const signed = [
    ...slices.headsOfTerms.filter((row) => ['signed', 'ready_for_lease'].includes(normalizeLower(row.status))),
    ...slices.transactions.filter((row) => normalizeLower(row.status) === 'completed'),
  ]
  const salesOffers = [...slices.deals, ...slices.openTransactions].filter((row) => stageMatches(row, ['offer', 'proposal']))
  const underOffer = [...slices.listings, ...slices.openTransactions, ...slices.deals].filter((row) => stageMatches(row, ['under_offer', 'under offer']))
  const dueDiligence = [...slices.openTransactions, ...slices.deals].filter((row) => stageMatches(row, ['due_diligence', 'due diligence', 'legal']))
  const sold = slices.transactions.filter((row) => ['completed', 'sold', 'closed'].includes(normalizeLower(row.status)))

  const rawStages = mode === 'sales'
    ? [
        { key: 'listings', label: 'Listings', rows: slices.listings, value: valueForRows(slices.listings), color: '#0f9f6e', icon: Building2 },
        { key: 'offers', label: 'Offers', rows: salesOffers, value: valueForRows(salesOffers), color: '#3773f5', icon: Handshake },
        { key: 'under-offer', label: 'Under Offer', rows: underOffer, value: valueForRows(underOffer), color: '#7c4dff', icon: Flame },
        { key: 'due-diligence', label: 'Due Diligence', rows: dueDiligence, value: valueForRows(dueDiligence), color: '#f59e0b', icon: ShieldAlert },
        { key: 'sold', label: 'Sold', rows: sold, value: valueForRows(sold), color: '#d94c5c', icon: CheckCircle2 },
      ]
    : [
        { key: 'requirements', label: 'Requirements', rows: slices.requirements, value: valueForRows(slices.requirements), color: '#0f9f6e', icon: Users },
        { key: 'viewings', label: 'Viewings', rows: slices.viewings, value: valueForRows(slices.viewings), color: '#3773f5', icon: CalendarDays },
        { key: 'hot', label: 'Heads of Terms', rows: slices.headsOfTerms, value: valueForRows(slices.headsOfTerms), color: '#7c4dff', icon: FileText },
        { key: 'negotiation', label: 'Negotiation', rows: leaseNegotiation, value: valueForRows(leaseNegotiation), color: '#f59e0b', icon: Handshake },
        { key: 'signed', label: 'Signed', rows: signed, value: valueForRows(signed), color: '#d94c5c', icon: CheckCircle2 },
      ]

  const total = rawStages.reduce((sum, stage) => sum + stage.rows.length, 0)
  return rawStages.map((stage, index) => {
    const previous = rawStages[index - 1]
    const delta = buildChangeForRows(stage.rows)
    return {
      ...stage,
      count: stage.rows.length,
      percent: total ? (stage.rows.length / total) * 100 : 0,
      conversion: index === 0 ? 100 : !previous?.rows?.length ? 0 : (stage.rows.length / previous.rows.length) * 100,
      delta,
    }
  })
}

function CommercialTransactionHealth({ mode, stages = [], loading = false }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0)
  const circumference = 2 * Math.PI * 54
  const donutSegments = stages.reduce((items, stage) => {
    const previousOffset = items.reduce((sum, item) => sum + item.length, 0)
    return [
      ...items,
      {
        ...stage,
        length: (stage.percent / 100) * circumference,
        offset: previousOffset,
      },
    ]
  }, [])
  return (
    <section className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0f2748]">Transaction Health</h2>
          <p className="mt-1 text-[12px] text-[#66768a]">Breakdown of your {mode} pipeline by stage.</p>
        </div>
        <PieChart size={18} className="text-[#8a9aac]" />
      </div>
      {total || loading ? (
        <div className="mt-5 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
          <div className="relative mx-auto h-[170px] w-[170px]">
            <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
              <circle cx="70" cy="70" r="54" fill="none" stroke="#edf2f7" strokeWidth="24" />
              {donutSegments.map((stage) => (
                <circle key={stage.key} cx="70" cy="70" r="54" fill="none" stroke={stage.color} strokeWidth="24" strokeDasharray={`${stage.length} ${circumference - stage.length}`} strokeDashoffset={-stage.offset} />
              ))}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-[28px] font-semibold leading-none text-[#0f2748]">{loading ? '...' : formatNumber(total)}</p>
                <p className="mt-1 text-[11px] font-medium text-[#66768a]">Active</p>
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            {stages.map((stage) => (
              <div key={stage.key} className="grid grid-cols-[minmax(0,1fr)_44px_52px] items-center gap-3 rounded-[12px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="truncate text-[12px] font-semibold text-[#203247]">{stage.label}</span>
                </span>
                <span className="text-right text-[12px] font-semibold text-[#102236]">{loading ? '...' : formatNumber(stage.count)}</span>
                <span className="text-right text-[12px] font-medium text-[#66768a]">{formatPercentage(stage.percent, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <InlineEmptyPanel title="No active pipeline yet" description={`No ${mode} stages are available for this workspace yet.`} />
      )}
    </section>
  )
}

function CommercialAgencyPerformance({ mode, conversionSeries = [], loading = false }) {
  const current = conversionSeries.at(-1)?.value || 0
  return (
    <section className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0f2748]">Agency Performance</h2>
          <p className="mt-1 text-[12px] text-[#66768a]">{mode === 'sales' ? 'Seller/Buyer lead to sale conversion.' : 'Landlord/Tenant lead to deal conversion.'}</p>
        </div>
        <div className="rounded-[12px] border border-[#e5edf6] bg-[#fbfdff] px-3 py-2 text-right">
          <p className="text-[18px] font-semibold leading-none text-[#0f2748]">{loading ? '...' : formatPercentage(current, 1)}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Current</p>
        </div>
      </div>
      <div className="mt-4 rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] p-3">
        <LineChartBox points={conversionSeries} loading={loading} suffix="%" />
      </div>
    </section>
  )
}

function LineChartBox({ points = [], loading = false, suffix = '', valueFormatter = null }) {
  const width = 520
  const height = 210
  const paddingX = 28
  const paddingY = 24
  const maxValue = Math.max(1, ...points.map((point) => toNumber(point.value)))
  const stepX = points.length > 1 ? (width - (paddingX * 2)) / (points.length - 1) : 0
  const coords = points.map((point, index) => ({
    ...point,
    x: paddingX + (index * stepX),
    y: height - paddingY - ((toNumber(point.value) / maxValue) * (height - (paddingY * 2))),
  }))
  const path = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = coords.length ? `${path} L ${coords.at(-1).x} ${height - paddingY} L ${coords[0].x} ${height - paddingY} Z` : ''
  const formatValue = valueFormatter || ((value) => `${formatNumber(value)}${suffix}`)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[210px] w-full" aria-label="Trend chart">
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
        <line key={tick} x1={paddingX} x2={width - paddingX} y1={paddingY + ((height - paddingY * 2) * tick)} y2={paddingY + ((height - paddingY * 2) * tick)} stroke="#e4ebf2" />
      ))}
      {!loading && area ? <path d={area} fill="rgba(55,115,245,0.08)" /> : null}
      {!loading && path ? <path d={path} fill="none" stroke="#2368e8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {!loading && coords.length ? <circle cx={coords.at(-1).x} cy={coords.at(-1).y} r="4" fill="#2368e8" stroke="#fff" strokeWidth="2" /> : null}
      {coords.map((point) => (
        <text key={point.key || point.label} x={point.x} y={height - 6} textAnchor="middle" className="fill-[#7b8ca2] text-[10px] font-semibold">{point.label}</text>
      ))}
      {!loading && coords.length ? (
        <text x={coords.at(-1).x - 8} y={Math.max(14, coords.at(-1).y - 10)} textAnchor="end" className="fill-[#0f2748] text-[13px] font-bold">{formatValue(coords.at(-1).value)}</text>
      ) : null}
    </svg>
  )
}

function buildConversionSeries(mode, slices = {}) {
  const leads = slices.leads || []
  const closedRows = mode === 'sales'
    ? slices.transactions.filter((row) => ['completed', 'sold', 'closed'].includes(normalizeLower(row.status)))
    : [...slices.deals, ...slices.transactions].filter((row) => !['lost', 'cancelled'].includes(normalizeLower(row.status)))
  return buildMonthWindows(6).map((window) => {
    const leadCount = leads.filter((row) => isWithinRange(getRowDate(row), window.start, window.end)).length
    const converted = closedRows.filter((row) => isWithinRange(row.actualCloseDate || row.updatedAt || row.updated_at || row.createdAt || row.created_at, window.start, window.end)).length
    return {
      key: window.key,
      label: window.label,
      value: leadCount ? (converted / leadCount) * 100 : 0,
    }
  })
}

function CommercialTransactionFlow({ stages = [], mode, loading = false }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0)
  const final = stages.at(-1)?.count || 0
  const conversion = total ? (final / Math.max(1, stages[0]?.count || total)) * 100 : 0
  return (
    <section className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0f2748]">Transaction Flow</h2>
          <p className="mt-1 text-[12px] text-[#66768a]">Track your {mode} pipeline at every stage.</p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max items-stretch gap-3 xl:min-w-0 xl:grid xl:grid-cols-5">
          {stages.map((stage, index) => {
            const Icon = stage.icon
            const positive = stage.delta.direction !== 'down'
            return (
              <div key={stage.key} className="flex min-w-[166px] flex-1 items-center gap-3">
                <article className="min-h-[128px] flex-1 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[11px] bg-white text-[#1f6dd5] shadow-sm"><Icon size={15} /></span>
                    <span className={`text-[11px] font-semibold ${positive ? 'text-[#16894f]' : 'text-[#c83b36]'}`}>{trendLabelFromDelta(stage.delta, '0%')}</span>
                  </div>
                  <p className="mt-3 truncate text-[12px] font-semibold text-[#203247]">{stage.label}</p>
                  <p className="mt-2 text-[26px] font-semibold leading-none text-[#0f2748]">{loading ? '...' : formatNumber(stage.count)}</p>
                  <p className="mt-2 truncate text-[12px] font-semibold text-[#52657a]">{loading ? '...' : formatCompactCurrency(stage.value)}</p>
                </article>
                {index < stages.length - 1 ? <ArrowRight size={17} className="hidden shrink-0 text-[#9aaabd] xl:block" /> : null}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-4 grid gap-2 rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3 md:grid-cols-[160px_minmax(0,1fr)_140px] md:items-center">
        <div>
          <p className="text-[11px] font-semibold text-[#52657a]">Overall conversion rate</p>
          <p className="mt-1 text-[18px] font-semibold text-[#16894f]">{formatPercentage(conversion, 1)}</p>
        </div>
        <MiniProgress value={conversion} tone="#16894f" />
        <p className="text-[11px] font-semibold text-[#66768a] md:text-right">vs last 30 days</p>
      </div>
    </section>
  )
}

function getPropertyName(row = {}) {
  return normalizeText(row.property?.property_name || row.property_name || row.listing?.title || row.deal?.property?.property_name || row.vacancy?.property_name || row.title) || 'Commercial asset'
}

function getAreaName(row = {}) {
  return [row.property?.suburb || row.suburb, row.property?.city || row.city || row.property?.province || row.province].map(normalizeText).filter(Boolean).join(', ') || normalizeText(row.property?.address || row.address || row.listing?.location) || 'Area pending'
}

function getClientName(row = {}) {
  return normalizeText(row.company?.company_name || row.company?.name || row.tenant?.name || row.landlord?.name || row.deal?.company_name || row.title) || 'Client pending'
}

function getBrokerName(row = {}) {
  return normalizeText(row.brokerName || row.broker_name || row.assignedBrokerName || row.assigned_broker_name || row.deal?.brokerName) || 'Unassigned'
}

function getPropertyImage(row = {}) {
  return normalizeText(row.property?.image_url || row.property?.hero_image_url || row.property?.photo_url || row.listing?.image_url || row.listing?.hero_image_url || row.image_url || row.photo_url)
}

function buildActiveDealCards(mode, slices = {}) {
  const rows = mode === 'sales'
    ? [...slices.openTransactions, ...slices.deals, ...slices.listings]
    : [...slices.openTransactions, ...slices.deals, ...slices.headsOfTerms]
  const seen = new Set()
  return rows
    .filter((row) => {
      const key = normalizeText(row.id)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => (asDate(right.updatedAt || right.updated_at || right.createdAt || right.created_at || 0)?.getTime() || 0) - (asDate(left.updatedAt || left.updated_at || left.createdAt || left.created_at || 0)?.getTime() || 0))
    .slice(0, 10)
    .map((row) => ({
      id: row.id,
      property: getPropertyName(row),
      area: getAreaName(row),
      client: getClientName(row),
      broker: getBrokerName(row),
      stage: titleize(row.status || row.stage || row.currentStage || row.listing_status || (mode === 'sales' ? 'listing' : 'requirement')),
      value: getTransactionValue(row),
      image: getPropertyImage(row),
      daysInStage: daysBetween(row.updatedAt || row.updated_at || row.createdAt || row.created_at, startOfToday()),
      to: row.id && String(row.id).startsWith('ctx-') ? '/commercial/deals' : `/commercial/transactions/${row.id}`,
    }))
}

function CommercialActiveDealsCarousel({ mode, rows = [], loading = false }) {
  const title = mode === 'sales' ? 'Active Sales Deals' : 'Active Lease Deals'
  return (
    <section className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0f2748]">{title}</h2>
        <Link to={mode === 'sales' ? '/commercial/sales/deals' : '/commercial/leasing/deals'} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1f6dd5]">
          View all
          <ChevronRight size={14} />
        </Link>
      </div>
      {rows.length ? (
        <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rows.map((row) => (
            <Link key={row.id} to={row.to} className="w-[254px] shrink-0 snap-start overflow-hidden rounded-[16px] border border-[#e3ebf4] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.07)]">
              <div className="relative h-[112px] bg-[#edf2f7]">
                {row.image ? (
                  <img src={row.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center bg-[linear-gradient(135deg,#f4f8fc_0%,#e7eef7_100%)] text-[#8a9aac]">
                    <Building2 size={28} />
                  </div>
                )}
                <span className="absolute right-2 top-2 max-w-[140px] truncate rounded-full bg-white/92 px-2.5 py-1 text-[10px] font-bold text-[#123b61] shadow-sm">{row.stage}</span>
              </div>
              <div className="p-3">
                <p className="truncate text-[13px] font-semibold text-[#102236]">{row.property}</p>
                <p className="mt-1 truncate text-[11px] font-medium text-[#66768a]">{row.area}</p>
                <p className="mt-2 text-[16px] font-semibold leading-none text-[#0f2748]">{loading ? '...' : formatCompactCurrency(row.value)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-[#66768a]">
                  <span className="min-w-0"><strong className="block truncate text-[#203247]">{row.client}</strong>Client</span>
                  <span className="min-w-0 text-right"><strong className="block truncate text-[#203247]">{row.broker}</strong>Broker</span>
                </div>
                <p className="mt-2 text-[10px] font-semibold text-[#7b8ca2]">{row.daysInStage ?? '-'} days in stage</p>
              </div>
            </Link>
          ))}
        </div>
      ) : !loading ? (
        <InlineEmptyPanel title={`No active ${mode} deals yet`} description="Live transactions will appear here once commercial work is opened." />
      ) : null}
    </section>
  )
}

function buildAttentionRows(mode, slices = {}, summary = {}, intelligence = {}) {
  const alerts = (intelligence.managementAlerts || []).filter((row) => {
    if (!row) return false
    return mode === 'leasing' || !normalizeLower(row.type).includes('lease')
  })
  const openDocumentRequests = toNumber(summary.documentRequests?.outstanding || summary.documentCompliance?.outstanding)
  const overdueDocumentRequests = toNumber(summary.documentRequests?.overdue || summary.documentCompliance?.overdue)
  const stalledDeals = [...slices.openTransactions, ...slices.deals].filter((row) => {
    const age = daysBetween(row.updatedAt || row.updated_at || row.createdAt || row.created_at, startOfToday())
    return Number.isFinite(age) && age > 21
  }).length
  const awaitingHot = slices.headsOfTerms.filter((row) => ['sent', 'under_review', 'draft'].includes(normalizeLower(row.status))).length
  const expiringVacancies = mode === 'leasing' ? slices.vacancies.filter((row) => {
    const days = daysBetween(startOfToday(), row.available_to || row.expiry_date || row.lease_end_date)
    return days !== null && days >= 0 && days <= 45
  }).length : 0
  const expiringListings = mode === 'sales' ? slices.listings.filter((row) => {
    const days = daysBetween(startOfToday(), row.expires_at || row.expiry_date || row.mandate_expiry_date)
    return days !== null && days >= 0 && days <= 45
  }).length : 0

  return [
    ...alerts.slice(0, 2).map((row) => ({
      key: row.id,
      label: row.type || 'Attention item',
      detail: row.detail || row.title || 'Review required',
      count: row.priority || 'High',
      tone: normalizeLower(row.priority) === 'high' ? 'red' : 'amber',
      icon: AlertTriangle,
      to: row.to || '/commercial/reports',
    })),
    { key: 'overdue-followups', label: 'Overdue follow-ups', detail: 'No movement beyond operating window', count: stalledDeals, tone: stalledDeals ? 'amber' : 'slate', icon: Clock3, to: '/commercial/deals' },
    { key: 'hot-response', label: mode === 'sales' ? 'Offers awaiting response' : 'HOT awaiting response', detail: mode === 'sales' ? 'Offer and proposal follow-up' : 'Heads of Terms awaiting movement', count: awaitingHot, tone: awaitingHot ? 'amber' : 'slate', icon: Flame, to: '/commercial/heads-of-terms' },
    { key: 'documents', label: 'Documents outstanding', detail: `${formatNumber(overdueDocumentRequests)} overdue`, count: openDocumentRequests, tone: openDocumentRequests ? 'red' : 'slate', icon: FileText, to: '/commercial/documents' },
    { key: 'expiry', label: mode === 'sales' ? 'Listings expiring' : 'Vacancies expiring', detail: 'Within 45 days', count: mode === 'sales' ? expiringListings : expiringVacancies, tone: (mode === 'sales' ? expiringListings : expiringVacancies) ? 'amber' : 'slate', icon: CalendarDays, to: mode === 'sales' ? '/commercial/sales/listings' : '/commercial/vacancies' },
  ].filter((row) => row.count || row.tone !== 'slate').slice(0, 6)
}

function toneClass(tone) {
  if (tone === 'red') return 'bg-[#fff2f0] text-[#b42318]'
  if (tone === 'amber') return 'bg-[#fff7ea] text-[#9a5b13]'
  return 'bg-[#f1f5f9] text-[#52657a]'
}

function CommercialAttentionRequired({ rows = [], loading = false }) {
  return (
    <section className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-[#0f2748]">Attention Required</h2>
        <Link to="/commercial/reports" className="text-[12px] font-semibold text-[#1f6dd5]">View all</Link>
      </div>
      <div className="mt-4 grid gap-2">
        {rows.length ? rows.map((row) => {
          const Icon = row.icon
          return (
            <Link key={row.key} to={row.to} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[13px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2.5">
              <span className={`grid h-8 w-8 place-items-center rounded-[10px] ${toneClass(row.tone)}`}><Icon size={15} /></span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-[#203247]">{row.label}</span>
                <span className="block truncate text-[11px] text-[#66768a]">{row.detail}</span>
              </span>
              <span className="text-[13px] font-semibold text-[#0f2748]">{loading ? '...' : row.count}</span>
            </Link>
          )
        }) : !loading ? (
          <InlineEmptyPanel title="No priority items" description="No commercial operating risks are currently visible." />
        ) : null}
      </div>
    </section>
  )
}

function buildTopPerformers(mode, slices = {}, brokerRows = [], brokerActivityRows = []) {
  const activityMap = new Map(brokerActivityRows.map((row) => [row.id, row.delta]))
  return brokerRows.map((broker) => {
    const id = normalizeText(broker.id)
    const transactions = slices.transactions.filter((row) => getBrokerId(row) === id)
    const deals = slices.deals.filter((row) => getBrokerId(row) === id)
    const listings = slices.listings.filter((row) => getBrokerId(row) === id)
    const pipeline = [...transactions.filter(isOpenTransaction), ...deals, ...listings].reduce((sum, row) => sum + getTransactionValue(row), 0)
    const commission = [...transactions, ...deals, ...(broker.commissions || [])].reduce((sum, row) => sum + getCommissionValue(row), 0) || toNumber(broker.expectedCommission || broker.projectedCommission)
    return {
      ...broker,
      pipeline,
      dealsCount: transactions.filter(isOpenTransaction).length + deals.length + listings.length,
      commission,
      trend: activityMap.get(id) || 0,
    }
  }).filter((row) => row.pipeline || row.dealsCount || row.commission || mode === 'leasing')
    .sort((left, right) => right.pipeline - left.pipeline || right.commission - left.commission || right.dealsCount - left.dealsCount)
    .slice(0, 5)
}

function CommercialTopPerformers({ rows = [], loading = false }) {
  return (
    <section className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-[#0f2748]">Top Performers</h2>
        <Link to="/commercial/brokers" className="text-[12px] font-semibold text-[#1f6dd5]">View all</Link>
      </div>
      <div className="mt-4 overflow-hidden rounded-[14px] border border-[#edf2f7]">
        {rows.length ? (
          <table className="w-full text-left text-[12px]">
            <thead className="bg-[#fbfdff] text-[10px] uppercase tracking-[0.08em] text-[#7b8ca2]">
              <tr>
                <th className="px-3 py-2">Broker</th>
                <th className="px-2 py-2 text-right">Pipeline</th>
                <th className="px-2 py-2 text-right">Deals</th>
                <th className="px-2 py-2 text-right">Commission</th>
                <th className="px-3 py-2 text-right">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7]">
              {rows.map((row) => (
                <tr key={row.id || row.name}>
                  <td className="px-3 py-2.5">
                    <span className="block truncate font-semibold text-[#203247]">{row.name || 'Broker'}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold text-[#0f2748]">{loading ? '...' : formatCompactCurrency(row.pipeline)}</td>
                  <td className="px-2 py-2.5 text-right font-semibold text-[#0f2748]">{loading ? '...' : formatNumber(row.dealsCount)}</td>
                  <td className="px-2 py-2.5 text-right font-semibold text-[#0f2748]">{loading ? '...' : formatCompactCurrency(row.commission)}</td>
                  <td className="px-3 py-2.5 text-right"><TrendPill delta={row.trend} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : !loading ? (
          <InlineEmptyPanel title="No performer data yet" description="Broker performance appears once deals, listings, or commissions are assigned." />
        ) : null}
      </div>
    </section>
  )
}

function buildForecastMetrics(slices = {}) {
  const today = new Date()
  const monthStart = startOfMonth(today)
  const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
  const yearStart = new Date(today.getFullYear(), 0, 1)
  const rows = [...(slices.transactions || []), ...(slices.deals || []), ...(slices.commissions || [])]
  const sumSince = (start) => rows.reduce((sum, row) => {
    const date = asDate(row.expectedCloseDate || row.actualCloseDate || row.updatedAt || row.updated_at || row.createdAt || row.created_at)
    if (!date || date < start) return sum
    return sum + getCommissionValue(row)
  }, 0)
  return {
    month: sumSince(monthStart),
    quarter: sumSince(quarterStart),
    ytd: sumSince(yearStart),
    series: buildMonthlyValueSeries(rows, getCommissionValue),
  }
}

function CommercialCommissionForecast({ metrics, loading = false }) {
  return (
    <section className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[#0f2748]">Commission Forecast</h2>
          <p className="mt-1 text-[12px] text-[#66768a]">Commercial revenue visibility.</p>
        </div>
        <Link to="/commercial/reports" className="text-[12px] font-semibold text-[#1f6dd5]">View report</Link>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ['This Month', metrics.month],
          ['This Quarter', metrics.quarter],
          ['YTD', metrics.ytd],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[13px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</p>
            <p className="mt-1 text-[15px] font-semibold text-[#0f2748]">{loading ? '...' : formatCompactCurrency(value)}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] p-2">
        <LineChartBox points={metrics.series} loading={loading} valueFormatter={formatCompactCurrency} />
      </div>
    </section>
  )
}

function buildUpcomingAppointments(mode, slices = {}, intelligence = {}) {
  const viewings = (intelligence.upcomingViewings || []).map((row) => ({
    id: row.id,
    time: row.time || '',
    type: 'Viewing',
    property: row.property || 'Property pending',
    broker: row.broker || 'Broker pending',
    client: row.company || 'Client pending',
    to: row.to || '/commercial/viewings',
  }))
  const hotMeetings = mode === 'leasing' ? slices.headsOfTerms.slice(0, 4).map((row) => ({
    id: `hot-${row.id}`,
    time: '',
    type: 'HOT Meeting',
    property: getPropertyName(row),
    broker: getBrokerName(row),
    client: getClientName(row),
    to: '/commercial/heads-of-terms',
  })) : []
  return [...viewings, ...hotMeetings].slice(0, 8)
}

function CommercialAppointments({ rows = [], loading = false }) {
  return (
    <section className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#0f2748]">Appointments</h2>
        <Link to="/commercial/calendar" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1f6dd5]">View calendar <ChevronRight size={14} /></Link>
      </div>
      {rows.length ? (
        <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rows.map((row) => (
            <Link key={row.id} to={row.to} className="grid min-h-[92px] w-[246px] shrink-0 snap-start grid-cols-[54px_minmax(0,1fr)] gap-3 rounded-[15px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
              <span className="text-[15px] font-semibold leading-tight text-[#0f2748]">{row.time || '--:--'}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-[#203247]">{row.type}</span>
                <span className="mt-1 block truncate text-[11px] text-[#66768a]">{row.property}</span>
                <span className="mt-2 block truncate text-[11px] font-medium text-[#52657a]">{row.broker} · {row.client}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : !loading ? (
        <InlineEmptyPanel title="No upcoming appointments" description="Future viewings, negotiations, and client meetings will appear here." />
      ) : null}
    </section>
  )
}

function TrendPill({ delta = 0 }) {
  const positive = delta >= 0
  const tone = positive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      <TrendingUp size={12} className={positive ? '' : 'rotate-180'} />
      {Math.abs(delta).toFixed(0)}%
    </span>
  )
}

function InlineEmptyPanel({ title, description, actionLabel = '', onAction = null, tone = 'light' }) {
  const toneClass = tone === 'dark'
    ? 'border-white/10 bg-white/5 text-white/70'
    : 'border-dashed border-[#d9e5f0] bg-[#fbfdff] text-[#60758d]'

  return (
    <div className={`rounded-[24px] border px-5 py-5 ${toneClass}`}>
      <p className={`text-[15px] font-semibold tracking-[-0.02em] ${tone === 'dark' ? 'text-white' : 'text-[#102236]'}`}>{title}</p>
      <p className={`mt-2 max-w-2xl text-[13px] leading-6 ${tone === 'dark' ? 'text-white/65' : 'text-[#60758d]'}`}>{description}</p>
      {actionLabel && typeof onAction === 'function' ? (
        <button
          type="button"
          onClick={onAction}
          className={`mt-4 inline-flex h-[44px] items-center justify-center rounded-[12px] px-4 text-sm font-medium transition ${
            tone === 'dark'
              ? 'bg-white text-[#102236] hover:bg-[#f5f8fb]'
              : 'bg-[#123b61] text-white hover:bg-[#102f4d]'
          }`}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export default function CommercialExecutiveCommandCenter({
  data = null,
  loading = true,
  error = '',
  organisationId = '',
  profile = null,
}) {
  const [dashboardMode, setDashboardMode] = useState('leasing')
  const summary = useMemo(() => data?.summary || EMPTY_OBJECT, [data?.summary])
  const intelligence = useMemo(() => data?.intelligence || EMPTY_OBJECT, [data?.intelligence])
  const financialSummary = useMemo(
    () => data?.financialSummary || summary.financialSummary || EMPTY_OBJECT,
    [data?.financialSummary, summary],
  )

  const isFreshCommercialWorkspace = useMemo(
    () => buildFreshWorkspaceState(summary, data || {}),
    [data, summary],
  )
  const displaySummary = useMemo(
    () => (isFreshCommercialWorkspace
      ? {
          ...summary,
          pipelineValue: 0,
          activeListings: 0,
          activeRequirements: 0,
          occupancyRate: 0,
          expectedRevenue: 0,
          dealsInNegotiation: 0,
          activeNegotiationValue: 0,
        }
      : summary),
    [isFreshCommercialWorkspace, summary],
  )
  const displayFinancialSummary = useMemo(
    () => (isFreshCommercialWorkspace
      ? {
          ...financialSummary,
          pipelineValue: 0,
          activeLeaseValue: 0,
          expectedCommission: 0,
        }
      : financialSummary),
    [financialSummary, isFreshCommercialWorkspace],
  )
  const brokerLeaderboard = useMemo(() => (intelligence.brokerScorecards || []).slice(0, 10), [intelligence.brokerScorecards])
  const brokerActivityRows = useMemo(() => buildBrokerActivityRows(data || {}, intelligence.brokerScorecards || []), [data, intelligence.brokerScorecards])
  const topBrokerRows = useMemo(() => {
    const activityMap = new Map(brokerActivityRows.map((row) => [row.id, row.delta]))
    return brokerLeaderboard.slice(0, 5).map((row) => ({
      ...row,
      trend: activityMap.get(row.id) || 0,
    }))
  }, [brokerActivityRows, brokerLeaderboard])
  const modeSlices = useMemo(() => buildModeSlices(data || {}, dashboardMode), [dashboardMode, data])
  const modeSeries = useMemo(() => buildModeSeries(modeSlices), [modeSlices])
  const modeKpis = useMemo(
    () => buildCommercialKpis({
      mode: dashboardMode,
      slices: modeSlices,
      summary: displaySummary,
      financialSummary: displayFinancialSummary,
      series: modeSeries,
    }),
    [dashboardMode, displayFinancialSummary, displaySummary, modeSeries, modeSlices],
  )
  const modeStages = useMemo(() => buildModeStageBreakdown(dashboardMode, modeSlices), [dashboardMode, modeSlices])
  const modeConversionSeries = useMemo(() => buildConversionSeries(dashboardMode, modeSlices), [dashboardMode, modeSlices])
  const activeDealCards = useMemo(() => buildActiveDealCards(dashboardMode, modeSlices), [dashboardMode, modeSlices])
  const attentionRows = useMemo(() => buildAttentionRows(dashboardMode, modeSlices, displaySummary, intelligence), [dashboardMode, displaySummary, intelligence, modeSlices])
  const modeTopPerformers = useMemo(
    () => buildTopPerformers(dashboardMode, modeSlices, intelligence.brokerScorecards || topBrokerRows, brokerActivityRows),
    [brokerActivityRows, dashboardMode, intelligence.brokerScorecards, modeSlices, topBrokerRows],
  )
  const forecastMetrics = useMemo(() => buildForecastMetrics(modeSlices), [modeSlices])
  const upcomingAppointments = useMemo(() => buildUpcomingAppointments(dashboardMode, modeSlices, intelligence), [dashboardMode, intelligence, modeSlices])

  if (error) {
    return (
      <div className="space-y-6 pb-8">
        <DashboardHeader profile={profile} mode={dashboardMode} onModeChange={setDashboardMode} />
        <CommercialEmptyState title="Commercial dashboard data could not be loaded" description={error} />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      <DashboardHeader profile={profile} mode={dashboardMode} onModeChange={setDashboardMode} />

      <CommercialKpiRow items={modeKpis} loading={loading} />

      <section className="grid gap-4 xl:grid-cols-2">
        <CommercialTransactionHealth mode={dashboardMode} stages={modeStages} loading={loading} />
        <CommercialAgencyPerformance mode={dashboardMode} conversionSeries={modeConversionSeries} loading={loading} />
      </section>

      <CommercialTransactionFlow stages={modeStages} mode={dashboardMode} loading={loading} />

      <CommercialActiveDealsCarousel mode={dashboardMode} rows={activeDealCards} loading={loading} />

      <section className="grid gap-4 xl:grid-cols-3">
        <CommercialAttentionRequired rows={attentionRows} loading={loading} />
        <CommercialTopPerformers rows={modeTopPerformers} loading={loading} />
        <CommercialCommissionForecast metrics={forecastMetrics} loading={loading} />
      </section>

      <CommercialAppointments rows={upcomingAppointments} loading={loading} />

      {!organisationId && !loading ? (
        <CommercialEmptyState title="Commercial organisation context is missing" description="Select an active commercial workspace to load the overview." />
      ) : null}
    </div>
  )
}
