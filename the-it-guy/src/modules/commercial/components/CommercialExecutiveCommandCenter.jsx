import { createElement, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Flame,
  Handshake,
  LineChart,
  MoreVertical,
  Plus,
  Radar,
  ShieldAlert,
  TrendingUp,
  UserRound,
  Users,
  Warehouse,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import CommercialEmptyState from './CommercialEmptyState'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'

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
    const conversion = index === 0 ? 100 : !previous?.count ? 0 : Math.max(0, Math.min(100, (stage.count / previous.count) * 100))
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
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      deal: row.title || row.transactionName || row.transaction_name || row.deal?.deal_name || 'Commercial deal',
      property: row.property?.property_name || row.deal?.property?.property_name || row.vacancy?.property_name || 'Unassigned property',
      broker: row.brokerName || 'Unassigned',
      stage: titleize(row.status || row.stage || row.deal?.stage),
      value: toNumber(row.value || row.targetValue),
      lastActivity: row.updatedAt || row.actualCloseDate || row.createdAt,
      daysOpen: daysBetween(row.createdAt || row.created_at, startOfToday()),
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
      const expiringLease = propertyLeases
        .map((row) => ({ row, daysToExpiry: daysBetween(startOfToday(), row.lease_end_date) }))
        .filter((item) => item.daysToExpiry !== null && item.daysToExpiry >= 0)
        .sort((left, right) => left.daysToExpiry - right.daysToExpiry)[0]
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
        attentionLabel: propertyVacancies.length
          ? `${formatNumber(propertyVacancies.length)} ${propertyVacancies.length === 1 ? 'Vacancy' : 'Vacancies'}`
          : expiringLease?.daysToExpiry <= 90
            ? `Lease expiry in ${formatNumber(expiringLease.daysToExpiry)} days`
            : propertyDeals.length
              ? 'High demand'
              : 'Stable',
      }
    })
    .sort((left, right) => {
      const riskScore = { High: 3, Medium: 2, Low: 1 }
      return (riskScore[right.risk] || 0) - (riskScore[left.risk] || 0) || right.vacancies - left.vacancies || right.annualRevenue - left.annualRevenue
    })
    .slice(0, 4)
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

function DashboardHeader({ profile }) {
  return (
    <header className="flex flex-col gap-4 pt-1 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">{getGreeting(profile)}</h1>
        <p className="mt-2 text-[19px] font-normal text-[#60758d]">Commercial Portfolio Overview</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/commercial/listings" className="inline-flex h-[44px] items-center gap-2 rounded-[12px] bg-[#0e335f] px-[16px] text-sm font-medium text-white shadow-[0_10px_24px_rgba(14,51,95,0.14)] transition hover:bg-[#0b294e]">
          <Plus size={16} />
          Listing
        </Link>
        <Link to="/commercial/leads" className="inline-flex h-[44px] items-center gap-2 rounded-[12px] border border-[#dce6f0] bg-white px-[16px] text-sm font-medium text-[#0f2748] shadow-sm transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
          <Plus size={16} />
          Requirement
        </Link>
        <Link to="/commercial/deals" className="inline-flex h-[44px] items-center gap-2 rounded-[12px] border border-[#dce6f0] bg-white px-[16px] text-sm font-medium text-[#0f2748] shadow-sm transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
          <Plus size={16} />
          Deal
        </Link>
      </div>
    </header>
  )
}

function KpiCard({ label, value, description, icon: Icon, loading = false }) {
  return (
    <article className={`${GLASS_CARD_CLASS} flex min-h-[168px] min-w-[230px] flex-col justify-between p-7 lg:min-w-0`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#6f7f92]">{label}</p>
          <p className="mt-5 text-[48px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">{loading ? '...' : value}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/90 text-[#2d6ecf] shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
          {createElement(Icon, { size: 20 })}
        </span>
      </div>
      <p className="text-[12px] font-normal text-[#7b899a]">{description}</p>
    </article>
  )
}

function RevenueTrendChart({ points = [], loading = false }) {
  const width = 560
  const height = 320
  const paddingX = 20
  const paddingTop = 22
  const paddingBottom = 42
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
    <div className="rounded-[24px] border border-[#edf2f7] bg-[linear-gradient(180deg,#fbfdff_0%,#f5faff_100%)] p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[320px] w-full" aria-label="Revenue trend">
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

function WorkflowShortcutCard({ to, title, description, icon: Icon, primary = false }) {
  return (
    <Link
      to={to}
      className={[
        'flex h-full items-start gap-3 rounded-[24px] border p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(15,23,42,0.06)]',
        primary
          ? 'border-[#cfe0ef] bg-[#f4f8fc] text-[#102236]'
          : 'border-[#e6edf4] bg-white text-[#102236]',
      ].join(' ')}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white text-[#1f6dd5] shadow-sm">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-[-0.02em] text-[#102236]">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[#6b7c91]">{description}</span>
      </span>
      <ArrowUpRight size={14} className="ml-auto shrink-0 text-[#8aa0b8]" />
    </Link>
  )
}

function SectionTitle({ title, action = null }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">{title}</h2>
      {action}
    </div>
  )
}

function StageBadge({ stage }) {
  const normalized = normalizeLower(stage)
  const tone = normalized.includes('require')
    ? 'bg-blue-50 text-blue-700 ring-blue-100'
    : normalized.includes('view')
      ? 'bg-sky-50 text-sky-700 ring-sky-100'
      : normalized.includes('head') || normalized.includes('terms')
        ? 'bg-orange-50 text-orange-700 ring-orange-100'
        : normalized.includes('negotiat')
          ? 'bg-amber-50 text-amber-700 ring-amber-100'
          : normalized.includes('draft')
            ? 'bg-violet-50 text-violet-700 ring-violet-100'
            : normalized.includes('signed') || normalized.includes('complete')
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
              : 'bg-slate-100 text-slate-600 ring-slate-200'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}>
      {stage || 'Requirements'}
    </span>
  )
}

function ActionStatusCard({ title, count, items = [], icon, tone }) {
  const styles = {
    red: 'border-[rgba(255,59,48,0.14)] bg-[rgba(255,59,48,0.05)] text-rose-700',
    amber: 'border-[rgba(255,149,0,0.14)] bg-[rgba(255,149,0,0.05)] text-amber-700',
    green: 'border-[rgba(52,199,89,0.14)] bg-[rgba(52,199,89,0.05)] text-emerald-700',
  }[tone]
  return (
    <article className={`rounded-[24px] border p-5 ${styles}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] bg-white/80 shadow-sm">
              {createElement(icon, { size: 17 })}
            </span>
            <p className="text-[15px] font-semibold tracking-[-0.02em] text-[#0f2748]">{title}</p>
          </div>
          <p className="mt-4 text-[46px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">{count}</p>
          {items.length ? (
            <ul className="mt-3 space-y-1.5">
              {items.map((item) => (
                <li key={item} className="flex items-center gap-2 text-[13px] font-medium text-[#526276]">
                  <span className="h-1.5 w-1.5 rounded-full bg-current/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default function CommercialExecutiveCommandCenter({
  data = null,
  loading = true,
  error = '',
  organisationId = '',
  profile = null,
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
  const kpis = useMemo(
    () => [
      { label: 'Pipeline Value', value: formatCompactCurrency(displaySummary.pipelineValue || displayFinancialSummary.pipelineValue || 0), description: '0% vs last month', icon: LineChart },
      { label: 'Expected Commission', value: formatCompactCurrency(displayFinancialSummary.expectedCommission || displaySummary.expectedRevenue || 0), description: '0% vs last month', icon: TrendingUp },
      { label: 'Active Listings', value: formatNumber(displaySummary.activeListings || 0), description: '0% vs last month', icon: Warehouse },
      { label: 'Active Requirements', value: formatNumber(displaySummary.activeRequirements || 0), description: '0% vs last month', icon: Users },
      { label: 'Occupancy', value: formatPercentValue(displaySummary.occupancyRate || 0), description: 'Stable', icon: Building2 },
    ],
    [displayFinancialSummary, displaySummary],
  )
  const pipelineStages = useMemo(() => buildExecutivePipelineStages(data || {}, displaySummary, displayFinancialSummary), [data, displayFinancialSummary, displaySummary])
  const weeklyActivity = useMemo(() => buildWeeklyActivity(data || {}), [data])
  const openDeals = useMemo(() => buildOpenDeals(data || {}), [data])
  const riskWatch = useMemo(() => buildRiskWatch(data || {}, displaySummary, intelligence), [data, displaySummary, intelligence])
  const brokerLeaderboard = useMemo(() => (intelligence.brokerScorecards || []).slice(0, 10), [intelligence.brokerScorecards])
  const brokerActivityRows = useMemo(() => buildBrokerActivityRows(data || {}, intelligence.brokerScorecards || []), [data, intelligence.brokerScorecards])
  const portfolioCards = useMemo(() => buildPortfolioCards(data || {}), [data])
  const actionItems = useMemo(() => buildActionItems(data || {}, intelligence), [data, intelligence])
  const trendPoints = useMemo(() => buildRevenueTrend(data || {}), [data])
  const compactPipelineStages = useMemo(
    () => pipelineStages.filter((stage) => ['requirements', 'viewings', 'hot', 'negotiation', 'signed'].includes(stage.key)),
    [pipelineStages],
  )
  const actionCentre = useMemo(() => {
    const attentionCount = riskWatch.critical.reduce((sum, item) => sum + toNumber(item.value), 0) || actionItems.length
    const monitorCount = riskWatch.warning.reduce((sum, item) => sum + toNumber(item.value), 0)
    return {
      attentionCount,
      monitorCount,
      healthyValue: formatPercentValue(riskWatch.healthy),
    }
  }, [actionItems.length, riskWatch])
  const topBrokerRows = useMemo(() => {
    const activityMap = new Map(brokerActivityRows.map((row) => [row.id, row.delta]))
    return brokerLeaderboard.slice(0, 5).map((row) => ({
      ...row,
      trend: activityMap.get(row.id) || 0,
    }))
  }, [brokerActivityRows, brokerLeaderboard])

  if (error) {
    return (
      <div className="space-y-6 pb-8">
        <DashboardHeader profile={profile} />
        <CommercialEmptyState title="Commercial dashboard data could not be loaded" description={error} />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <DashboardHeader profile={profile} />

      <section>
        <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0">
          <div className="flex gap-6 lg:grid lg:grid-cols-5">
            {kpis.map((card) => (
              <KpiCard key={card.label} {...card} loading={loading} />
            ))}
          </div>
        </div>
      </section>

      <section>
        <article className={`${PANEL_CLASS} p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Entry points</p>
              <h2 className="mt-2 text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">Workflow shortcuts</h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#60758d]">Start canvassing from the overview, then move straight into requirements, deals, or vacancy follow-up without changing context.</p>
            </div>
            <Link to="/commercial/canvassing" className="inline-flex h-[44px] items-center gap-2 rounded-[12px] bg-[#0e335f] px-[16px] text-sm font-medium text-white shadow-[0_10px_24px_rgba(14,51,95,0.14)] transition hover:bg-[#0b294e]">
              <Radar size={16} />
              Open canvassing
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkflowShortcutCard
              to="/commercial/canvassing"
              title="Canvassing"
              description="Capture prospects, log touchpoints, and launch the next commercial hand-off."
              icon={Radar}
              primary
            />
            <WorkflowShortcutCard
              to="/commercial/requirements/pipeline"
              title="Requirements"
              description="Move demand into qualification, matching, and viewings."
              icon={Users}
            />
            <WorkflowShortcutCard
              to="/commercial/deals/pipeline"
              title="Deals"
              description="Review leasing and sales opportunities in motion."
              icon={Handshake}
            />
            <WorkflowShortcutCard
              to="/commercial/vacancies"
              title="Vacancy follow-up"
              description="Check open stock and start property-side follow-up work."
              icon={Building2}
            />
          </div>
        </article>
      </section>

      <section>
        <article className={`${PANEL_CLASS} p-6`}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">Action Centre</h2>
            <Link to="/commercial/lease-expiry-watch" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
              View all
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <ActionStatusCard
              title="Attention Required"
              count={loading ? '...' : formatNumber(actionCentre.attentionCount)}
              items={['Lease Expiries', 'Compliance', 'Stalled Deals']}
              icon={AlertTriangle}
              tone="red"
            />
            <ActionStatusCard
              title="Monitor"
              count={loading ? '...' : formatNumber(actionCentre.monitorCount)}
              items={['Vacancies > 60 Days', 'Overdue Items']}
              icon={ShieldAlert}
              tone="amber"
            />
            <ActionStatusCard
              title="Healthy"
              count={loading ? '...' : actionCentre.healthyValue}
              items={['Occupancy', 'Renewals']}
              icon={CheckCircle2}
              tone="green"
            />
          </div>
        </article>
      </section>

      <section id="transactions">
        <article className={`${PANEL_CLASS} overflow-hidden`}>
          <div className="flex items-center justify-between gap-4 border-b border-[#edf2f7] px-6 py-4">
            <h2 className="text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">Active Deals</h2>
            <Link to="/commercial/deals" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
              View all deals
              <ChevronRight size={15} />
            </Link>
          </div>
          {openDeals.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-[#fbfdff] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a8798]">
                  <tr>
                    <th className="px-6 py-3.5">Deal</th>
                    <th className="px-4 py-3.5">Property</th>
                    <th className="px-4 py-3.5">Broker</th>
                    <th className="px-4 py-3.5">Stage</th>
                    <th className="px-4 py-3.5">Value</th>
                    <th className="px-4 py-3.5">Last Activity</th>
                    <th className="px-4 py-3.5 text-right">Days Open</th>
                    <th className="px-4 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7]">
                  {openDeals.map((row) => (
                    <tr key={row.id} className="bg-white transition hover:bg-[#fbfdff]">
                      <td className="px-6 py-3.5 font-semibold text-[#0f2748]">
                        <Link to={row.to} className="hover:text-[#1f6dd5]">{row.deal}</Link>
                      </td>
                      <td className="px-4 py-3.5 text-[#304159]">{row.property}</td>
                      <td className="px-4 py-3.5 text-[#304159]">{row.broker}</td>
                      <td className="px-4 py-3.5"><StageBadge stage={row.stage} /></td>
                      <td className="px-4 py-3.5 font-semibold text-[#0f2748]">{loading ? '...' : formatCompactCurrency(row.value)}</td>
                      <td className="px-4 py-3.5 text-[#526276]">{relativeTime(row.lastActivity)}</td>
                      <td className="px-4 py-3.5 text-right font-semibold text-[#0f2748]">{row.daysOpen ?? '-'}</td>
                      <td className="px-4 py-3.5 text-right">
                        <Link to={row.to} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6b7c91] hover:bg-[#eef5fb] hover:text-[#123b61]" aria-label={`Open ${row.deal}`}>
                          <MoreVertical size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !loading ? (
            <div className="p-6">
              <div className="rounded-[22px] border border-dashed border-[#d9e5f0] bg-[#fbfdff] px-5 py-5 text-[#60758d]">
                <p className="text-[15px] font-semibold text-[#102236]">No active deals.</p>
                <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#60758d]">Create your first leasing or sales deal.</p>
                <Link to="/commercial/deals" className="mt-4 inline-flex h-[44px] items-center justify-center rounded-[12px] bg-[#123b61] px-4 text-sm font-medium text-white transition hover:bg-[#102f4d]">
                  + Create Deal
                </Link>
              </div>
            </div>
          ) : null}
        </article>
      </section>

      <section>
        <article className={`${PANEL_CLASS} p-6`}>
          <SectionTitle title="Pipeline Flow" />
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-4 xl:min-w-0">
              {compactPipelineStages.map((stage, index) => {
                const Icon = stage.icon
                return (
                  <div key={stage.key} className="flex items-center gap-4">
                    <article className="w-[210px] rounded-[24px] border border-[#e8eef4] bg-[#fbfdff] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] bg-white text-[#1f6dd5] shadow-sm">
                          <Icon size={17} />
                        </span>
                        <span className="text-xs font-semibold text-[#6b7c91]">{index === 0 ? 'Base' : `${stage.conversion.toFixed(0)}%`}</span>
                      </div>
                      <p className="mt-3 text-[14px] font-semibold text-[#0f2748]">{stage.label}</p>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <p className="text-[28px] font-semibold leading-none text-[#0f2748]">{loading ? '...' : formatNumber(stage.count)}</p>
                        <p className="text-[13px] font-medium text-[#526276]">{loading ? '...' : formatCompactCurrency(stage.value)}</p>
                      </div>
                    </article>
                    {index < compactPipelineStages.length - 1 ? <ArrowRight size={18} className="shrink-0 text-[#97a8ba]" /> : null}
                  </div>
                )
              })}
            </div>
          </div>
        </article>
      </section>

      <section>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {weeklyActivity.map((item) => {
            const Icon = item.icon
            return (
              <article key={item.key} className={`${PANEL_CLASS} flex min-h-[108px] items-center justify-between gap-4 p-5`}>
                <div>
                  <p className="text-[14px] font-semibold text-[#0f2748]">{item.label === 'Leases Signed' ? 'Deals Signed' : item.label}</p>
                  <p className="mt-2.5 text-[30px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">{loading ? '...' : formatNumber(item.value)}</p>
                  <p className="mt-2 text-[12px] font-normal text-[#7b899a]">0% vs last week</p>
                </div>
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[14px] ${item.tone}`}>
                  <Icon size={19} />
                </span>
              </article>
            )
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <article className={`${PANEL_CLASS} p-6`}>
          <SectionTitle title="Revenue Forecast" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.7fr)_minmax(260px,0.3fr)]">
            <RevenueTrendChart points={trendPoints} loading={loading} />
            <div className="grid gap-4">
              {[
                ['This Month', formatMoney(displayFinancialSummary.projectedRevenue || displaySummary.expectedRevenue || 0)],
                ['This Quarter', formatMoney(displayFinancialSummary.expectedCommission || displaySummary.expectedRevenue || 0)],
                ['YTD', formatMoney(displayFinancialSummary.paidRevenue || 0)],
                ['Forecast', formatMoney(displayFinancialSummary.pipelineValue || displaySummary.pipelineValue || 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[24px] border border-[#ebf1f6] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[13px] font-medium text-[#60758d]">{label}</p>
                  <p className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-[#0f2748]">{loading ? '...' : value}</p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className={`${PANEL_CLASS} p-6`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">Risk Watch</h2>
            </div>
            <Link to="/commercial/lease-expiry-watch" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
              View all
              <ChevronRight size={15} />
            </Link>
          </div>
          <div className="mt-5 space-y-4">
            <div className="rounded-[24px] border border-[rgba(255,59,48,0.14)] bg-[rgba(255,59,48,0.05)] p-4">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle size={16} />
                <p className="text-[14px] font-semibold">Attention Required</p>
              </div>
              <div className="mt-4 space-y-3">
                {riskWatch.critical.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-[#5d4950]">{item.label}</p>
                    <strong className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-rose-700">{loading ? '...' : formatNumber(item.value)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-[rgba(255,149,0,0.14)] bg-[rgba(255,149,0,0.05)] p-4">
              <div className="flex items-center gap-2 text-amber-700">
                <ShieldAlert size={16} />
                <p className="text-[14px] font-semibold">Monitor</p>
              </div>
              <div className="mt-4 space-y-3">
                {riskWatch.warning.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-[#6a5843]">{item.label}</p>
                    <strong className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-amber-700">{loading ? '...' : formatNumber(item.value)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-[rgba(52,199,89,0.14)] bg-[rgba(52,199,89,0.05)] p-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 size={16} />
                <p className="text-[14px] font-semibold">Healthy</p>
              </div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[44px] font-semibold leading-none tracking-[-0.04em] text-emerald-700">{loading ? '...' : formatPercentValue(riskWatch.healthy)}</p>
                  <p className="mt-1 text-[13px] text-[#547567]">Portfolio occupancy</p>
                </div>
                <div className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  Stable
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <article className={`${PANEL_CLASS} overflow-hidden`}>
            <div className="flex items-center justify-between gap-4 border-b border-[#edf2f7] px-6 py-4">
              <h3 className="text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">Top Brokers</h3>
              <Link to="/commercial/brokers" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
                View All Brokers
                <ChevronRight size={15} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              {topBrokerRows.length ? (
                <table className="min-w-[680px] w-full text-left text-sm">
                  <thead className="bg-[#fbfdff] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a8798]">
                    <tr>
                      <th className="px-6 py-3.5">Broker</th>
                      <th className="px-4 py-3.5">Pipeline</th>
                      <th className="px-4 py-3.5">Deals</th>
                      <th className="px-4 py-3.5">Commission</th>
                      <th className="px-4 py-3.5 text-right">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f7]">
                    {topBrokerRows.map((row) => (
                      <tr key={row.id || row.name} className="bg-white">
                        <td className="px-6 py-3.5">
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
                        <td className="px-4 py-3.5 font-semibold text-[#0f2748]">{loading ? '...' : formatCompactCurrency(row.pipelineValue || 0)}</td>
                        <td className="px-4 py-3.5 font-semibold text-[#0f2748]">{loading ? '...' : formatNumber(row.activeDeals || 0)}</td>
                        <td className="px-4 py-3.5 font-semibold text-[#0f2748]">{loading ? '...' : formatCompactCurrency(row.expectedCommission || row.projectedCommission || row.commissionValue || 0)}</td>
                        <td className="px-4 py-3.5 text-right"><TrendPill delta={row.trend} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : !loading ? (
                <div className="p-5">
                  <InlineEmptyPanel title="No broker pipeline yet." description="Once brokers are assigned to commercial opportunities, their ranked pipeline value and active deal counts will appear here." />
                </div>
              ) : null}
            </div>
          </article>

          <article className={`${PANEL_CLASS} p-6`}>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">Properties Requiring Attention</h3>
              <Link to="/commercial/properties" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
                View all
                <ChevronRight size={15} />
              </Link>
            </div>
            <div className="mt-4 grid gap-4">
              {portfolioCards.map((card) => (
                <article key={card.id} className="flex items-center justify-between gap-4 rounded-[24px] border border-[#ebf1f6] bg-[#fbfdff] p-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${card.accent} text-[#123b61]`}>
                        <Building2 size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[#0f2748]">{card.name}</p>
                      <p className="mt-1 truncate text-[13px] text-[#6b7c91]">{card.location}</p>
                    </div>
                  </div>
                  <div className="grid shrink-0 grid-cols-[minmax(120px,1fr)_72px] items-center gap-4 text-right">
                    <p className={`text-[13px] font-semibold ${card.risk === 'High' ? 'text-rose-700' : card.risk === 'Medium' ? 'text-orange-700' : 'text-emerald-700'}`}>{card.attentionLabel}</p>
                    <div>
                      <p className="text-[14px] font-bold text-[#0f2748]">{formatPercentValue(card.occupancy)}</p>
                      <p className="text-[10px] font-semibold text-[#6b7c91]">Occupied</p>
                    </div>
                  </div>
                </article>
              ))}
              {!portfolioCards.length && !loading ? (
                <InlineEmptyPanel title="No properties requiring attention." description="Properties with vacancies, lease expiries, or strong demand will appear here." />
              ) : null}
            </div>
          </article>
        </div>
      </section>

      {!organisationId && !loading ? (
        <CommercialEmptyState title="Commercial organisation context is missing" description="Select an active commercial workspace to load the overview." />
      ) : null}
    </div>
  )
}
