import { createElement, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Flame,
  Handshake,
  LineChart,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  Warehouse,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import CommercialEmptyState from './CommercialEmptyState'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'

const PANEL_CLASS = 'rounded-[24px] border border-[#e6edf4] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]'
const GLASS_CARD_CLASS = 'rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,250,253,0.92)_100%)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl'
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

function formatMoney(value) {
  const formatted = formatCurrency(value)
  return formatted === '-' ? 'R0' : formatted
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

function relativeTime(value) {
  const date = asDate(value)
  if (!date) return 'Recently'
  const diffMs = Date.now() - date.getTime()
  const diffHours = Math.max(1, Math.round(diffMs / 3600000))
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short' }).format(date)
}

function getFirstName(profile = null) {
  const direct = normalizeText(profile?.firstName || profile?.first_name)
  if (direct) return direct
  const fullName = normalizeText(profile?.fullName || profile?.full_name || profile?.name)
  if (fullName) return fullName.split(/\s+/)[0]
  return 'there'
}

function getGreeting(profile = null) {
  const hour = new Date().getHours()
  const prefix = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${prefix}, ${getFirstName(profile)}`
}

function getMonthLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-ZA', { month: 'long' }).format(date)
}

function leaseValue(row = {}) {
  const monthlyRental = toNumber(row.monthly_rental)
  const termMonths = Math.max(toNumber(row.lease_term_months || row.lease_term || 12), 1)
  return monthlyRental * termMonths
}

function buildExecutivePipelineStages(data = {}, summary = {}, financialSummary = {}) {
  const requirements = (data.requirements || []).filter(isActiveRequirement)
  const viewings = (data.viewings || []).filter((row) => !['cancelled', 'no_show'].includes(normalizeLower(row.status)))
  const headsOfTerms = (data.headsOfTerms || []).filter((row) => !['converted', 'superseded', 'archived'].includes(normalizeLower(row.status)))
  const negotiationDeals = (data.deals || []).filter((row) => {
    const stage = normalizeLower(row.stage || row.status)
    return isActiveDeal(row) && (stage.includes('negotiat') || stage === 'qualified')
  })
  const leaseDrafts = (data.leases || []).filter((row) => {
    const status = normalizeLower(row.status)
    return !['active', 'archived', 'terminated', 'completed'].includes(status)
  })
  const signedHots = headsOfTerms.filter((row) => ['signed', 'ready_for_lease'].includes(normalizeLower(row.status)))
  const activeLeases = (data.leases || []).filter((row) => normalizeLower(row.status) === 'active')
  const requirementValue = requirements.reduce((sum, row) => sum + Math.max(toNumber(row.budget_max), toNumber(row.budget_min)), 0)
  const viewingValue = viewings.reduce((sum, row) => sum + Math.max(toNumber(row.asking_rental), 0), 0)
  const hotValue = headsOfTerms.reduce((sum, row) => sum + leaseValue(row), 0)
  const negotiationValue = negotiationDeals.reduce((sum, row) => sum + toNumber(row.deal_value), 0)
  const leaseDraftValue = leaseDrafts.reduce((sum, row) => sum + leaseValue(row), 0)
  const signedValue = signedHots.reduce((sum, row) => sum + leaseValue(row), 0)
  const activeValue = toNumber(financialSummary.activeLeaseValue || 0)

  const stages = [
    { key: 'requirements', label: 'Requirements', count: requirements.length || toNumber(summary.activeRequirements), value: requirementValue, icon: Users, accent: 'text-sky-200', border: 'border-sky-400/20', bg: 'bg-sky-400/10' },
    { key: 'viewings', label: 'Viewings', count: viewings.length, value: viewingValue, icon: CalendarDays, accent: 'text-blue-200', border: 'border-blue-400/20', bg: 'bg-blue-400/10' },
    { key: 'hot', label: 'Heads of Terms', count: headsOfTerms.length, value: hotValue, icon: Flame, accent: 'text-orange-200', border: 'border-orange-300/20', bg: 'bg-orange-400/10' },
    { key: 'negotiation', label: 'Negotiation', count: negotiationDeals.length || toNumber(summary.dealsInNegotiation), value: negotiationValue || toNumber(summary.activeNegotiationValue), icon: Handshake, accent: 'text-amber-100', border: 'border-amber-300/20', bg: 'bg-amber-400/10' },
    { key: 'lease_draft', label: 'Lease Draft', count: leaseDrafts.length, value: leaseDraftValue, icon: FileText, accent: 'text-yellow-100', border: 'border-yellow-300/20', bg: 'bg-yellow-400/10' },
    { key: 'signed', label: 'Signed', count: signedHots.length, value: signedValue, icon: CheckCircle2, accent: 'text-emerald-200', border: 'border-emerald-300/20', bg: 'bg-emerald-400/10' },
    { key: 'active', label: 'Active', count: activeLeases.length, value: activeValue, icon: Building2, accent: 'text-green-200', border: 'border-green-300/20', bg: 'bg-green-400/10' },
  ]

  return stages.map((stage, index) => {
    const previous = stages[index - 1]
    const conversion = !previous?.count ? 100 : Math.max(0, Math.min(100, (stage.count / previous.count) * 100))
    return { ...stage, conversion }
  })
}

function buildWeeklyActivity(data = {}) {
  const today = new Date()
  const weekStart = startOfWeek(today)
  const weekEnd = endOfWeek(today)
  const viewings = (data.viewings || []).filter((row) => {
    const viewingDate = row.viewing_date ? new Date(`${row.viewing_date}T${row.viewing_time || '09:00'}`) : asDate(row.created_at)
    return viewingDate && viewingDate >= weekStart && viewingDate <= weekEnd && !['cancelled', 'no_show'].includes(normalizeLower(row.status))
  }).length
  const hots = (data.headsOfTerms || []).filter((row) => isWithinRange(row.updated_at || row.created_at, weekStart, weekEnd)).length
  const leaseTransactions = (data.commercialTransactions || []).filter((row) => {
    if (normalizeLower(row.transactionType) !== 'lease') return false
    return normalizeLower(row.status) === 'completed' && isWithinRange(row.actualCloseDate || row.updatedAt || row.createdAt, weekStart, weekEnd)
  }).length
  const renewals = (data.commercialTransactions || []).filter((row) => {
    const expiryDate = row.lease?.lease_end_date
    const daysToExpiry = daysBetween(today, expiryDate)
    if (daysToExpiry === null || daysToExpiry > 180) return false
    return isWithinRange(row.updatedAt || row.actualCloseDate || row.createdAt, weekStart, weekEnd)
  }).length

  return [
    { key: 'viewings', label: 'Viewings', value: viewings, icon: CalendarDays, tone: 'text-sky-600 bg-sky-50' },
    { key: 'hots', label: 'Heads of Terms', value: hots, icon: Flame, tone: 'text-orange-600 bg-orange-50' },
    { key: 'signed', label: 'Leases Signed', value: leaseTransactions, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
    { key: 'renewals', label: 'Renewals', value: renewals, icon: Clock3, tone: 'text-violet-600 bg-violet-50' },
  ]
}

function buildRevenueTrend(data = {}) {
  const today = new Date()
  const firstMonth = startOfMonth(addMonths(today, -11))
  const points = Array.from({ length: 12 }, (_, index) => {
    const monthDate = addMonths(firstMonth, index)
    return {
      label: new Intl.DateTimeFormat('en-ZA', { month: 'short' }).format(monthDate),
      key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
      value: 0,
    }
  })
  const pointMap = new Map(points.map((point) => [point.key, point]))

  ;(data.commercialTransactions || []).forEach((transaction) => {
    if (!isOpenTransaction(transaction) && normalizeLower(transaction.status) !== 'completed') return
    const date = asDate(transaction.actualCloseDate || transaction.updatedAt || transaction.createdAt)
    if (!date || date < firstMonth) return
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const point = pointMap.get(key)
    if (!point) return
    point.value += toNumber(transaction.value || transaction.targetValue)
  })

  return points
}

function buildOpenDeals(data = {}) {
  return (data.commercialTransactions || [])
    .filter(isOpenTransaction)
    .slice()
    .sort((left, right) => {
      const rightDate = asDate(right.updatedAt || right.createdAt || 0)?.getTime() || 0
      const leftDate = asDate(left.updatedAt || left.createdAt || 0)?.getTime() || 0
      return rightDate - leftDate || toNumber(right.value) - toNumber(left.value)
    })
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      property: row.property?.property_name || row.title || 'Commercial deal',
      broker: row.brokerName || 'Unassigned',
      stage: titleize(row.status),
      value: toNumber(row.value || row.targetValue),
      to: `/commercial/transactions/${row.id}`,
    }))
}

function buildRiskWatch(data = {}, summary = {}, intelligence = {}) {
  const criticalLeases = (intelligence.renewalRisk || []).filter((row) => row.daysToExpiry <= 90).length
  const stalledDeals = (intelligence.managementAlerts || []).filter((row) => row.type === 'Stalled Transaction').length
  const overdueCompliance = toNumber(summary.documentCompliance?.overdue)
  const staleVacancies = (data.vacancies || []).filter((row) => {
    if (!isOpenVacancy(row)) return false
    const age = daysBetween(row.marketed_at || row.created_at, startOfToday())
    return Number.isFinite(age) && age > 60
  }).length
  const healthyOccupancy = toNumber(summary.occupancyRate)

  return {
    critical: [
      { label: 'Leases expiring', value: criticalLeases },
      { label: 'Overdue compliance items', value: overdueCompliance },
      { label: 'Stalled deals', value: stalledDeals },
    ],
    warning: [
      { label: 'Vacancies older than 60 days', value: staleVacancies },
    ],
    healthy: healthyOccupancy,
  }
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

function buildPortfolioCards(data = {}) {
  return (data.properties || [])
    .filter((row) => !['archived', 'inactive'].includes(normalizeLower(row.status || 'active')))
    .map((property) => {
      const propertyVacancies = (data.vacancies || []).filter((row) => row.property_id === property.id && isOpenVacancy(row))
      const propertyDeals = (data.deals || []).filter((row) => row.property_id === property.id && isActiveDeal(row))
      const propertyLeases = (data.leases || []).filter((row) => row.property_id === property.id && isActiveLease(row))
      const totalGla = toNumber(property.gla_m2)
      const availableArea = propertyVacancies.reduce((sum, row) => sum + toNumber(row.available_area_m2), 0)
      const occupancy = totalGla ? Math.max(0, Math.min(100, 100 - ((availableArea / totalGla) * 100))) : 0
      const annualRevenue = propertyLeases.reduce((sum, row) => sum + (toNumber(row.monthly_rental) * 12), 0)
      const criticalLeaseRisk = propertyLeases.some((row) => {
        const daysToExpiry = daysBetween(startOfToday(), row.lease_end_date)
        return daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 90
      })
      const risk = criticalLeaseRisk || occupancy < 75 || propertyVacancies.length >= 8
        ? 'High'
        : occupancy < 90 || propertyVacancies.length > 0
          ? 'Medium'
          : 'Low'
      const riskTone = risk === 'High' ? 'text-rose-700 bg-rose-50' : risk === 'Medium' ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50'
      const accent = risk === 'High' ? 'from-rose-500/15 via-orange-500/10 to-white' : risk === 'Medium' ? 'from-amber-500/15 via-yellow-400/10 to-white' : 'from-emerald-500/15 via-sky-500/10 to-white'
      return {
        id: property.id,
        name: property.property_name || 'Commercial asset',
        location: [property.suburb, property.city || property.province].filter(Boolean).join(', ') || property.address || 'Portfolio asset',
        occupancy,
        vacancies: propertyVacancies.length,
        activeDeals: propertyDeals.length,
        annualRevenue,
        risk,
        riskTone,
        accent,
        type: titleize(property.property_type || 'Commercial'),
      }
    })
    .sort((left, right) => right.annualRevenue - left.annualRevenue || right.occupancy - left.occupancy)
    .slice(0, 12)
}

function buildActionItems(data = {}, intelligence = {}) {
  const items = []
  const overdueDocumentRequests = (data.documentRequests || []).filter((row) => {
    const dueDate = asDate(row.due_date)
    return dueDate && dueDate < startOfToday() && !['approved', 'completed', 'archived'].includes(normalizeLower(row.status))
  })

  ;(intelligence.managementAlerts || []).forEach((alert) => {
    items.push({
      id: alert.id,
      title: alert.title,
      detail: `${alert.type} · ${alert.detail}`,
      severity: alert.priority === 'High' ? 'Critical' : alert.priority,
      to: alert.to || '/commercial/dashboard',
      dueLabel: alert.detail,
    })
  })

  ;(data.headsOfTerms || [])
    .filter((row) => ['sent', 'accepted'].includes(normalizeLower(row.status)))
    .slice(0, 4)
    .forEach((row) => {
      items.push({
        id: `hot-signature-${row.id}`,
        title: row.premises_description || `Heads of Terms ${String(row.id).slice(0, 8)}`,
        detail: 'Heads of Terms awaiting signature',
        severity: 'High',
        to: '/commercial/heads-of-terms',
        dueLabel: relativeTime(row.updated_at || row.created_at),
      })
    })

  overdueDocumentRequests.slice(0, 4).forEach((row) => {
    items.push({
      id: `document-request-${row.id}`,
      title: row.document_name || row.category || 'Compliance document',
      detail: 'Compliance document overdue',
      severity: 'Critical',
      to: '/commercial/documents',
      dueLabel: formatDate(row.due_date),
    })
  })

  ;(intelligence.renewalRisk || [])
    .filter((row) => row.daysToExpiry <= 30)
    .slice(0, 4)
    .forEach((row) => {
      items.push({
        id: `renewal-${row.id}`,
        title: row.property || row.title,
        detail: `Lease expiring in ${row.daysToExpiry} days`,
        severity: 'Critical',
        to: '/commercial/lease-expiry-watch',
        dueLabel: formatDate(row.expiryDate),
      })
    })

  const severityOrder = { Critical: 4, High: 3, Medium: 2, Low: 1 }
  return items
    .sort((left, right) => (severityOrder[right.severity] || 0) - (severityOrder[left.severity] || 0) || left.title.localeCompare(right.title))
    .slice(0, 10)
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

function DashboardHeader({ profile, organisationName }) {
  return (
    <header className={`${PANEL_CLASS} sticky top-4 z-20 bg-white/90 px-5 py-4 backdrop-blur-xl`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#6f8096]">ARCH9 Commercial Principal Dashboard v2</p>
          <h1 className="mt-2 text-[1.85rem] font-semibold tracking-[-0.05em] text-[#102236] sm:text-[2.2rem]">{getGreeting(profile)}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">Revenue, occupancy, pipeline, broker performance, and operational risk in one command centre.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[#e3ebf4] bg-white px-4 text-sm font-semibold text-[#102236] shadow-sm">
            <CalendarDays size={16} className="text-[#2d6ecf]" />
            {getMonthLabel()}
          </div>
          <div className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[#e3ebf4] bg-white px-4 text-sm font-semibold text-[#102236] shadow-sm">
            <Building2 size={16} className="text-[#2d6ecf]" />
            <span className="max-w-[180px] truncate">{organisationName || 'Commercial Workspace'}</span>
          </div>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e3ebf4] bg-white text-[#60758d] shadow-sm transition hover:border-blue-200 hover:text-[#2d6ecf]" aria-label="Notifications">
            <Bell size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}

function SectionHeading({ eyebrow, title, description, actionLabel = '', actionTo = '' }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#7b899a]">{eyebrow}</p> : null}
        <h2 className="mt-2 text-[1.15rem] font-semibold tracking-[-0.035em] text-[#102236] sm:text-[1.24rem]">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">{description}</p> : null}
      </div>
      {actionLabel && actionTo ? (
        <Link to={actionTo} className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
          {actionLabel}
          <ArrowUpRight size={15} />
        </Link>
      ) : null}
    </div>
  )
}

function KpiCard({ label, value, description, icon: Icon, loading = false }) {
  return (
    <article className={`${GLASS_CARD_CLASS} min-h-[120px] min-w-[220px] p-5 lg:min-w-0`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b899a]">{label}</p>
          <p className="mt-4 text-[2rem] font-bold tracking-[-0.06em] text-[#102236]">{loading ? '...' : value}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 text-[#2d6ecf] shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          {createElement(Icon, { size: 20 })}
        </span>
      </div>
      <p className="mt-4 text-sm text-[#60758d]">{description}</p>
    </article>
  )
}

function RevenueTrendChart({ points = [], loading = false }) {
  const width = 560
  const height = 220
  const paddingX = 16
  const paddingTop = 18
  const paddingBottom = 36
  const chartHeight = height - paddingTop - paddingBottom
  const stepX = points.length > 1 ? (width - (paddingX * 2)) / (points.length - 1) : 0
  const maxValue = Math.max(...points.map((point) => toNumber(point.value)), 1)

  const coordinates = points.map((point, index) => {
    const x = paddingX + (index * stepX)
    const y = paddingTop + chartHeight - ((toNumber(point.value) / maxValue) * chartHeight)
    return { ...point, x, y }
  })

  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = coordinates.length
    ? `${path} L ${coordinates[coordinates.length - 1].x} ${height - paddingBottom} L ${coordinates[0].x} ${height - paddingBottom} Z`
    : ''

  return (
    <div className="rounded-[24px] border border-[#edf2f7] bg-[linear-gradient(180deg,#fafdff_0%,#f6fbff_100%)] p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" aria-label="Revenue trend">
        {[0.25, 0.5, 0.75].map((tick) => (
          <line
            key={tick}
            x1={paddingX}
            x2={width - paddingX}
            y1={paddingTop + (chartHeight * tick)}
            y2={paddingTop + (chartHeight * tick)}
            stroke="#dbe7f2"
            strokeDasharray="4 8"
          />
        ))}
        {!loading && area ? <path d={area} fill="url(#revenue-fill)" /> : null}
        {!loading && path ? <path d={path} fill="none" stroke="#2ab673" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {!loading ? coordinates.map((point) => (
          <circle key={point.key} cx={point.x} cy={point.y} r="4.5" fill="#2ab673" stroke="#ffffff" strokeWidth="2" />
        )) : null}
        <defs>
          <linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(42,182,115,0.24)" />
            <stop offset="100%" stopColor="rgba(42,182,115,0.02)" />
          </linearGradient>
        </defs>
        {points.map((point, index) => (
          <text
            key={`${point.key}-label`}
            x={paddingX + (index * stepX)}
            y={height - 10}
            textAnchor="middle"
            className="fill-[#7b899a] text-[10px] font-semibold"
          >
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

function TrendPill({ delta = 0 }) {
  const positive = delta >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  const tone = positive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      <Icon size={12} />
      {Math.abs(delta).toFixed(0)}%
    </span>
  )
}

function MobileBrokerLeaderboard({ rows = [], loading = false }) {
  const topRows = rows.slice(0, 3)

  return (
    <div className="md:hidden">
      <div className="space-y-3 px-5 py-4">
        {topRows.map((row, index) => (
          <div key={row.id || row.name} className="rounded-[20px] border border-[#ebf1f6] bg-[#fbfdff] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f4f8fd] text-xs font-semibold text-[#102236]">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#102236]">{row.name || 'Broker'}</p>
                    <p className="truncate text-xs uppercase tracking-[0.12em] text-[#7b899a]">{titleize(row.role || 'broker')}</p>
                  </div>
                </div>
              </div>
              <span className="text-sm font-semibold text-[#102236]">{loading ? '...' : formatCompactCurrency(row.pipelineValue || 0)}</span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[#7b899a]">{loading ? '...' : `${formatNumber(row.activeDeals || 0)} active deals`}</p>
          </div>
        ))}
      </div>

      {rows.length > 3 ? (
        <details className="border-t border-[#edf2f7] px-5 py-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-[#1f6dd5]">
            View full top 10 leaderboard
          </summary>
          <div className="mt-4 space-y-3">
            {rows.slice(3).map((row, index) => (
              <div key={row.id || row.name} className="flex items-center justify-between gap-3 rounded-[18px] border border-[#ebf1f6] bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#102236]">{index + 4}. {row.name || 'Broker'}</p>
                  <p className="truncate text-xs uppercase tracking-[0.12em] text-[#7b899a]">{formatNumber(row.activeDeals || 0)} active deals</p>
                </div>
                <span className="text-sm font-semibold text-[#102236]">{loading ? '...' : formatCompactCurrency(row.pipelineValue || 0)}</span>
              </div>
            ))}
          </div>
        </details>
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
  onCreateListing,
}) {
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
  const kpis = useMemo(
    () => [
      { label: 'Pipeline Value', value: formatCompactCurrency(summary.pipelineValue || financialSummary.pipelineValue || 0), description: 'Current deal pipeline', icon: LineChart },
      { label: 'Expected Commission', value: formatCompactCurrency(financialSummary.expectedCommission || summary.expectedRevenue || 0), description: 'Potential revenue', icon: TrendingUp },
      { label: 'Active Listings', value: formatNumber(summary.activeListings || 0), description: 'Commercial opportunities', icon: Warehouse },
      { label: 'Active Requirements', value: formatNumber(summary.activeRequirements || 0), description: 'Tenant and buyer demand', icon: Users },
      { label: 'Occupancy', value: formatPercentValue(summary.occupancyRate || 0), description: 'Portfolio occupancy', icon: Building2 },
    ],
    [financialSummary, summary],
  )
  const pipelineStages = useMemo(() => buildExecutivePipelineStages(data || {}, summary, financialSummary), [data, financialSummary, summary])
  const weeklyActivity = useMemo(() => buildWeeklyActivity(data || {}), [data])
  const openDeals = useMemo(() => buildOpenDeals(data || {}), [data])
  const riskWatch = useMemo(() => buildRiskWatch(data || {}, summary, intelligence), [data, intelligence, summary])
  const brokerLeaderboard = useMemo(() => (intelligence.brokerScorecards || []).slice(0, 10), [intelligence.brokerScorecards])
  const brokerActivityRows = useMemo(() => buildBrokerActivityRows(data || {}, intelligence.brokerScorecards || []), [data, intelligence.brokerScorecards])
  const portfolioCards = useMemo(() => buildPortfolioCards(data || {}), [data])
  const actionItems = useMemo(() => buildActionItems(data || {}, intelligence), [data, intelligence])
  const trendPoints = useMemo(() => buildRevenueTrend(data || {}), [data])

  if (error) {
    return (
      <div className="mx-auto max-w-[1600px] px-3 pb-10 sm:px-5 lg:px-6">
        <DashboardHeader profile={profile} organisationName={data?.organisation?.name} />
        <div className="mt-8">
          <CommercialEmptyState title="Commercial dashboard data could not be loaded" description={error} />
        </div>
      </div>
    )
  }

  if (!loading && isFreshCommercialWorkspace) {
    return (
      <div className="mx-auto max-w-[1600px] px-3 pb-10 sm:px-5 lg:px-6">
        <DashboardHeader profile={profile} organisationName={data?.organisation?.name} />
        <div className="mt-8">
          <CommercialEmptyState
            title="No commercial portfolio data yet"
            description="Create your first listing, requirement, or transaction to start populating the executive command centre."
            primaryActionLabel="Create Listing"
            onPrimaryAction={onCreateListing}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 px-3 pb-10 sm:px-5 lg:px-6">
      <DashboardHeader profile={profile} organisationName={data?.organisation?.name} />

      <section className="space-y-4">
        <SectionHeading
          eyebrow="Executive KPI Bar"
          title="What matters now"
          description="Five signals to orient revenue, demand, stock, and occupancy within seconds."
        />
        <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0">
          <div className="flex gap-4 lg:grid lg:grid-cols-5">
            {kpis.map((card) => (
              <KpiCard key={card.label} {...card} loading={loading} />
            ))}
          </div>
        </div>
      </section>

      <section id="transactions" className="overflow-hidden rounded-[28px] border border-[#102c52] bg-[radial-gradient(circle_at_top_left,#173d6a_0%,#0e2d4e_45%,#081c33_100%)] px-5 py-6 shadow-[0_20px_48px_rgba(7,19,36,0.28)] sm:px-6">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-white/60">Commercial Command Centre</p>
            <h2 className="mt-2 text-[1.3rem] font-semibold tracking-[-0.04em] text-white">Pipeline flow, weekly velocity, and open deals</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">A live operating surface for requirements, negotiation momentum, signed paper, and active income.</p>
          </div>
          <Link to="/commercial/transactions" className="inline-flex items-center gap-1 text-sm font-semibold text-white/85 transition hover:text-white">
            View all deals
            <ArrowUpRight size={15} />
          </Link>
        </div>

        <div className="mt-6 space-y-6">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-stretch gap-4 xl:min-w-0 xl:flex-nowrap">
              {pipelineStages.map((stage, index) => {
                const Icon = stage.icon
                return (
                  <div key={stage.key} className="flex items-center gap-4">
                    <article className={`w-[208px] rounded-[24px] border ${stage.border} ${stage.bg} p-4 text-white backdrop-blur-xl`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ${stage.accent}`}>
                          <Icon size={18} />
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                          {index === 0 ? 'Base' : `${stage.conversion.toFixed(0)}% conv.`}
                        </span>
                      </div>
                      <p className="mt-4 text-sm font-semibold text-white/82">{stage.label}</p>
                      <p className="mt-2 text-[2rem] font-bold tracking-[-0.06em] text-white">{loading ? '...' : formatNumber(stage.count)}</p>
                      <p className="mt-2 text-sm text-white/65">{loading ? 'Loading value' : formatCompactCurrency(stage.value)}</p>
                    </article>
                    {index < pipelineStages.length - 1 ? <ArrowRight size={18} className="shrink-0 text-white/40" /> : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/55">This Week</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">Weekly activity</h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Live</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {weeklyActivity.map((item) => {
                  const Icon = item.icon
                  return (
                    <article key={item.key} className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${item.tone}`}>
                        <Icon size={18} />
                      </span>
                      <p className="mt-4 text-[1.85rem] font-bold tracking-[-0.05em] text-white">{loading ? '...' : formatNumber(item.value)}</p>
                      <p className="mt-2 text-sm text-white/68">{item.label}</p>
                    </article>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/55">Open Deals</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">What is moving now</h3>
                </div>
                <Link to="/commercial/transactions" className="inline-flex items-center gap-1 text-sm font-semibold text-white/82 transition hover:text-white">
                  View all
                  <ChevronRight size={15} />
                </Link>
              </div>
              <div className="mt-5 hidden grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_auto_auto] gap-3 border-b border-white/10 px-1 pb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45 sm:grid">
                <p>Property</p>
                <p>Broker</p>
                <p>Stage</p>
                <p className="text-right">Value</p>
              </div>
              <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                {openDeals.map((row) => (
                  <Link
                    key={row.id}
                    to={row.to}
                    className="block rounded-[20px] border border-white/10 bg-white/6 p-4 transition hover:bg-white/10 sm:rounded-[18px] sm:px-3 sm:py-3"
                  >
                    <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_auto_auto] sm:items-center sm:gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{row.property}</p>
                      </div>
                      <p className="truncate text-sm text-white/65">{row.broker}</p>
                      <div>
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/72">{row.stage}</span>
                      </div>
                      <p className="text-sm font-semibold tracking-[-0.03em] text-white sm:text-right">{formatCompactCurrency(row.value)}</p>
                    </div>
                  </Link>
                ))}
                {!openDeals.length && !loading ? <p className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-5 text-sm text-white/65">No open deals yet.</p> : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <article className={`${PANEL_CLASS} p-5 sm:p-6`}>
          <SectionHeading eyebrow="Revenue & Risk" title="Revenue Forecast" description="Pipeline value, lease value, expected commission, and a 12-month pipeline trend." />
          <div className="mt-6 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-3">
              {[
                ['Pipeline Value', formatMoney(financialSummary.pipelineValue || summary.pipelineValue || 0)],
                ['Lease Value', formatMoney(financialSummary.activeLeaseValue || 0)],
                ['Expected Commission', formatMoney(financialSummary.expectedCommission || summary.expectedRevenue || 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[20px] border border-[#ebf1f6] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b899a]">{label}</p>
                  <p className="mt-3 text-[1.6rem] font-bold tracking-[-0.05em] text-[#102236]">{loading ? '...' : value}</p>
                </div>
              ))}
            </div>
            <RevenueTrendChart points={trendPoints} loading={loading} />
          </div>
        </article>

        <article className={`${PANEL_CLASS} p-5 sm:p-6`}>
          <SectionHeading eyebrow="Revenue & Risk" title="Risk Watch" description="Lease expiry, compliance drag, stale stock, and occupancy health in one place." actionLabel="Lease watch" actionTo="/commercial/lease-expiry-watch" />
          <div className="mt-6 space-y-4">
            <div className="rounded-[22px] border border-rose-200 bg-[linear-gradient(180deg,#fffafa_0%,#fff4f4_100%)] p-4">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle size={16} />
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em]">Critical</p>
              </div>
              <div className="mt-4 space-y-3">
                {riskWatch.critical.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-[#5d4950]">{item.label}</p>
                    <strong className="text-lg font-bold tracking-[-0.03em] text-rose-700">{loading ? '...' : formatNumber(item.value)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-amber-200 bg-[linear-gradient(180deg,#fffdfa_0%,#fff8ef_100%)] p-4">
              <div className="flex items-center gap-2 text-amber-700">
                <ShieldAlert size={16} />
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em]">Warning</p>
              </div>
              <div className="mt-4 space-y-3">
                {riskWatch.warning.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-[#6a5843]">{item.label}</p>
                    <strong className="text-lg font-bold tracking-[-0.03em] text-amber-700">{loading ? '...' : formatNumber(item.value)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-emerald-200 bg-[linear-gradient(180deg,#f7fffb_0%,#effcf6_100%)] p-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 size={16} />
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em]">Healthy</p>
              </div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[2rem] font-bold tracking-[-0.06em] text-emerald-700">{loading ? '...' : formatPercentValue(riskWatch.healthy)}</p>
                  <p className="mt-1 text-sm text-[#547567]">Portfolio occupancy</p>
                </div>
                <div className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  Stable
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <SectionHeading eyebrow="Broker Performance" title="Who is driving revenue" description="Pipeline-ranked leaderboard with month-on-month broker activity." actionLabel="Broker performance" actionTo="/commercial/brokers/performance" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <article className={`${PANEL_CLASS} overflow-hidden`}>
            <div className="border-b border-[#edf2f7] px-5 py-4">
              <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#102236]">Leaderboard</h3>
              <p className="mt-1 text-sm text-[#60758d]">Ranked by pipeline value with active deal pressure.</p>
            </div>
            <MobileBrokerLeaderboard rows={brokerLeaderboard} loading={loading} />
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f8fbfe] text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7b899a]">
                  <tr>
                    <th className="px-5 py-3">Rank</th>
                    <th className="px-5 py-3">Broker</th>
                    <th className="px-5 py-3">Pipeline Value</th>
                    <th className="px-5 py-3 text-right">Active Deals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7]">
                  {brokerLeaderboard.map((row, index) => (
                    <tr key={row.id || row.name} className="bg-white">
                      <td className="px-5 py-4">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f4f8fd] text-xs font-semibold text-[#102236]">{index + 1}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(180deg,#eff5fb_0%,#dfeaf7_100%)] text-[#123b61]">
                            <UserRound size={16} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#102236]">{row.name || 'Broker'}</p>
                            <p className="truncate text-xs text-[#7b899a]">{titleize(row.role || 'broker')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#102236]">{loading ? '...' : formatCompactCurrency(row.pipelineValue || 0)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-[#102236]">{loading ? '...' : formatNumber(row.activeDeals || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className={`${PANEL_CLASS} p-5 sm:p-6`}>
            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#102236]">Broker Activity</h3>
            <p className="mt-1 text-sm text-[#60758d]">Viewings completed, requirements matched, Heads of Terms created, and deals signed this month.</p>
            <div className="mt-5 space-y-3">
              {brokerActivityRows.map((row) => (
                <div key={row.id} className="rounded-[22px] border border-[#ebf1f6] bg-[#fbfdff] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#102236]">{row.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#7b899a]">This month vs last month</p>
                    </div>
                    <TrendPill delta={row.delta} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['Viewings', row.current.viewingsCompleted],
                      ['Requirements', row.current.requirementsMatched],
                      ['Heads of Terms', row.current.hotCreated],
                      ['Deals Signed', row.current.dealsSigned],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[18px] border border-white bg-white px-3 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b899a]">{label}</p>
                        <p className="mt-2 text-lg font-bold tracking-[-0.03em] text-[#102236]">{loading ? '...' : formatNumber(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading eyebrow="Portfolio Overview" title="Asset cards, occupancy, and vacancy exposure" description="Unified property cards with occupancy, active deal flow, annual revenue, and risk score." actionLabel="All properties" actionTo="/commercial/properties" />
        <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0">
          <div className="flex gap-4 lg:grid lg:grid-cols-3">
            {portfolioCards.map((card) => (
              <article key={card.id} className={`${PANEL_CLASS} min-w-[290px] overflow-hidden lg:min-w-0`}>
                <div className={`h-28 bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${card.accent}`}>
                  <div className="flex h-full items-end justify-between px-5 pb-4">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#54667c]">{card.type}</p>
                      <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{card.name}</p>
                    </div>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-[#123b61] shadow-sm">
                      <Building2 size={18} />
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <p className="text-sm text-[#60758d]">{card.location}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b899a]">Occupancy</p>
                      <p className="mt-2 text-[1.55rem] font-bold tracking-[-0.05em] text-[#102236]">{formatPercentValue(card.occupancy)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${card.riskTone}`}>{card.risk} risk</span>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-[#e8eef4]">
                    <div className={`h-full rounded-full ${card.risk === 'High' ? 'bg-rose-500' : card.risk === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(Math.min(card.occupancy, 100), 0)}%` }} />
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {[
                      ['Vacancies', formatNumber(card.vacancies)],
                      ['Active Deals', formatNumber(card.activeDeals)],
                      ['Annual Revenue', formatCompactCurrency(card.annualRevenue)],
                      ['Risk Score', card.risk],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b899a]">{label}</p>
                        <p className="mt-2 text-sm font-semibold text-[#102236]">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading eyebrow="Action Centre" title="Requires attention" description="Critical first, then the next operational moves that keep revenue and portfolio health on track." />
        <article className={`${PANEL_CLASS} p-5 sm:p-6`}>
          <div className="space-y-3">
            {actionItems.map((item) => {
              const tone = item.severity === 'Critical'
                ? 'border-rose-200 bg-[linear-gradient(180deg,#fffafa_0%,#fff5f5_100%)] text-rose-700'
                : item.severity === 'High'
                  ? 'border-amber-200 bg-[linear-gradient(180deg,#fffdfa_0%,#fff8ef_100%)] text-amber-700'
                  : 'border-[#e6edf4] bg-[#fbfdff] text-[#60758d]'
              return (
                <Link key={item.id} to={item.to} className={`flex flex-col gap-3 rounded-[22px] border px-4 py-4 transition hover:shadow-[0_10px_24px_rgba(15,23,42,0.05)] sm:flex-row sm:items-center sm:justify-between ${tone}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1 ring-inset ring-current/10">{item.severity}</span>
                      <p className="truncate text-sm font-semibold text-[#102236]">{item.title}</p>
                    </div>
                    <p className="mt-2 text-sm">{item.detail}</p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em]">{item.dueLabel}</span>
                    <ArrowUpRight size={16} />
                  </div>
                </Link>
              )
            })}
            {!actionItems.length && !loading ? <p className="rounded-[22px] border border-[#e6edf4] bg-[#fbfdff] px-4 py-5 text-sm text-[#60758d]">No urgent action items right now.</p> : null}
          </div>
        </article>
      </section>

      {!organisationId && !loading ? (
        <CommercialEmptyState title="Commercial organisation context is missing" description="Select an active commercial workspace to load the executive command centre." />
      ) : null}
    </div>
  )
}
