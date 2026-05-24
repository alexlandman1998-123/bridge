import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Download,
  Filter,
  LineChart,
  Map,
  PieChart,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAgencyPipelineSnapshot } from '../../lib/agencyPipelineService'
import { fetchOrganisationSettings } from '../../lib/settingsApi'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  COMPARISON_OPTIONS,
  DATE_RANGE_OPTIONS,
  buildAgencyAnalyticsModel,
} from '../../modules/agency/analytics/agencyAnalyticsUtils'
import { getBranches } from '../../services/agencyBranchService'

const CARD_CLASS = 'rounded-[24px] border border-[#dfe8f2] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.06)]'
const INNER_CARD_CLASS = 'rounded-[18px] border border-[#e4edf6] bg-[#fbfdff]'
const CONTROL_CLASS = 'h-11 rounded-[14px] border border-[#d8e3ef] bg-white px-3 text-sm font-semibold text-[#21374d] shadow-[0_8px_18px_rgba(15,23,42,0.04)] outline-none transition focus:border-[#9cc2e8] focus:ring-4 focus:ring-[#e7f2ff]'
const DONUT_COLORS = ['#1769d1', '#18a058', '#8b5cf6', '#94a3b8', '#f59e0b']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value, { compact = false } = {}) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R0'
  if (compact) {
    if (amount >= 1_000_000_000) return `R${(amount / 1_000_000_000).toFixed(amount >= 10_000_000_000 ? 0 : 1)}b`
    if (amount >= 1_000_000) return `R${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}m`
    if (amount >= 1_000) return `R${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}k`
    return `R${Math.round(amount)}`
  }
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatPercent(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '0%'
  return `${Math.round(amount)}%`
}

function formatNumber(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)
}

function formatKpiValue(item) {
  if (item.formatter === 'currency') return formatCurrency(item.value, { compact: true })
  if (item.formatter === 'percent') return formatPercent(item.value)
  if (item.formatter === 'days') return `${formatNumber(item.value)}d`
  return formatNumber(item.value)
}

function isMissingSourceError(error) {
  if (!error) return false
  const code = normalizeKey(error.code)
  const message = normalizeKey(error.message)
  const status = Number(error.status || error.statusCode || 0)
  return (
    status === 404 ||
    code === '42p01' ||
    code === '42703' ||
    code === 'pgrst116' ||
    code === 'pgrst204' ||
    code === 'pgrst205' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  )
}

function getMissingColumnName(error) {
  const message = normalizeText(error?.message)
  if (!message) return ''
  return (
    message.match(/column\s+\S+\.([a-zA-Z0-9_]+)\s+does not exist/i)?.[1] ||
    message.match(/could not find the ['"]?([a-zA-Z0-9_]+)['"]?\s+column/i)?.[1] ||
    ''
  )
}

function removeColumnFromSelect(fields, columnName) {
  if (!fields || fields === '*' || !columnName) return fields
  const normalizedColumn = normalizeKey(columnName)
  const parts = String(fields).split(',').map((part) => part.trim()).filter(Boolean)
  const nextParts = parts.filter((part) => normalizeKey(part.split(/\s+as\s+/i)[0]) !== normalizedColumn)
  return nextParts.length === parts.length ? fields : nextParts.join(', ')
}

async function safeSelect(table, selectVariants, {
  organisationId = '',
  organisationColumn = 'organisation_id',
  order = 'updated_at',
  ascending = false,
  limit = 1000,
} = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const variants = Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']
  let lastError = null
  for (const selectFields of variants) {
    let fields = selectFields
    const removedColumns = new Set()
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let query = supabase.from(table).select(fields)
      if (organisationId && organisationColumn) query = query.eq(organisationColumn, organisationId)
      if (order) query = query.order(order, { ascending })
      if (limit) query = query.limit(limit)
      const { data, error } = await query
      if (!error) return data || []
      lastError = error
      const missingColumn = getMissingColumnName(error)
      const nextFields = removeColumnFromSelect(fields, missingColumn)
      if (missingColumn && nextFields !== fields && !removedColumns.has(missingColumn)) {
        removedColumns.add(missingColumn)
        fields = nextFields
        continue
      }
      if (!isMissingSourceError(error)) throw error
      break
    }
  }
  console.debug('[AgencyAnalytics] Source unavailable; using empty result.', { table, message: lastError?.message })
  return []
}

async function safeSelectByIds(table, selectVariants, ids = [], {
  idColumn = 'transaction_id',
  order = 'updated_at',
  ascending = false,
  limit = 1000,
} = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const normalizedIds = [...new Set((Array.isArray(ids) ? ids : []).map(normalizeText).filter(Boolean))]
  if (!normalizedIds.length) return []
  const variants = Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']
  let lastError = null
  for (const selectFields of variants) {
    let fields = selectFields
    const removedColumns = new Set()
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let query = supabase.from(table).select(fields).in(idColumn, normalizedIds)
      if (order) query = query.order(order, { ascending })
      if (limit) query = query.limit(limit)
      const { data, error } = await query
      if (!error) return data || []
      lastError = error
      const missingColumn = getMissingColumnName(error)
      const nextFields = removeColumnFromSelect(fields, missingColumn)
      if (missingColumn && nextFields !== fields && !removedColumns.has(missingColumn)) {
        removedColumns.add(missingColumn)
        fields = nextFields
        continue
      }
      if (!isMissingSourceError(error)) throw error
      break
    }
  }
  console.debug('[AgencyAnalytics] Scoped source unavailable; using empty result.', { table, message: lastError?.message })
  return []
}

function mergeRows(primary = [], fallback = [], key = 'id') {
  const seen = new Set()
  const rows = []
  for (const row of [...primary, ...fallback]) {
    const id = normalizeText(row?.[key] || row?.lead_id || row?.leadId || row?.transaction_id || row?.transactionId)
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    rows.push(row)
  }
  return rows
}

function isDeletedListingRow(row = {}) {
  const status = normalizeKey(row.listing_status || row.listingStatus || row.status || row.stage)
  const visibility = normalizeKey(row.listing_visibility || row.listingVisibility)
  return Boolean(row.deleted_at || row.is_deleted || status === 'withdrawn' || status === 'deleted' || visibility === 'archived')
}

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'BR'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function CardHeader({ eyebrow, title, copy, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{eyebrow}</p> : null}
        <h2 className="mt-1 text-[1.08rem] font-semibold tracking-[-0.03em] text-[#12263a]">{title}</h2>
        {copy ? <p className="mt-1 max-w-2xl text-sm leading-6 text-[#65788d]">{copy}</p> : null}
      </div>
      {action}
    </div>
  )
}

function EmptyState({ title = 'No data yet', copy = 'Data will appear here once records are available.', icon = BarChart3 }) {
  return (
    <div className="grid min-h-[180px] place-items-center rounded-[18px] border border-dashed border-[#d5e0ec] bg-[#fbfdff] px-4 py-8 text-center">
      <div>
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-[16px] bg-[#edf5ff] text-[#1769d1]">
          {createElement(icon, { size: 20 })}
        </span>
        <p className="mt-3 text-sm font-semibold text-[#24384d]">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#718399]">{copy}</p>
      </div>
    </div>
  )
}

function ChangePill({ value, inverse = false }) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return <span className="text-[0.72rem] font-semibold text-[#8a9aac]">No comparison</span>
  }
  const positive = Number(value) >= 0
  const good = inverse ? !positive : positive
  const Icon = positive ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.72rem] font-bold ${good ? 'bg-[#eaf8f0] text-[#16834a]' : 'bg-[#fff1f0] text-[#c93d35]'}`}>
      <Icon size={12} />
      {Math.abs(Math.round(Number(value)))}%
    </span>
  )
}

function KpiCard({ item, compact = false }) {
  return (
    <article className={`${CARD_CLASS} ${compact ? 'px-4 py-3.5' : 'px-4 py-4'} min-w-0`}>
      <p className="min-h-[2rem] text-[0.68rem] font-semibold uppercase leading-4 tracking-[0.11em] text-[#7a8ca1]">{item.label}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <strong className="text-[1.38rem] font-semibold leading-none tracking-[-0.04em] text-[#101d2c] tabular-nums">
          {formatKpiValue(item)}
        </strong>
        <ChangePill value={item.change} inverse={item.formatter === 'days'} />
      </div>
      <p className="mt-2 text-[0.72rem] font-medium text-[#8a9aac]">{item.comparisonLabel}</p>
    </article>
  )
}

function KpiStrip({ title, items, columns = 'xl:grid-cols-6' }) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#6c8096]">{title}</h2>
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${columns}`}>
        {items.map((item) => <KpiCard key={item.label} item={item} compact />)}
      </div>
    </section>
  )
}

function PipelineOverviewChart({ data }) {
  const rows = data?.monthlyTrend || []
  const rawMaxValue = Math.max(0, ...rows.flatMap((row) => [toNumber(row.pipelineValue), toNumber(row.registeredValue)]))
  const maxValue = Math.max(1, rawMaxValue)
  if (!rows.length || !rawMaxValue) return <EmptyState title="No pipeline trend yet" copy="Transactions with dated values will populate the trend chart." icon={LineChart} />
  return (
    <div className="mt-5">
      <div className="flex h-[240px] items-end gap-3 border-b border-[#e6edf6] px-1">
        {rows.map((row) => {
          const pipelineHeight = Math.max(8, Math.round((toNumber(row.pipelineValue) / maxValue) * 190))
          const registeredHeight = Math.max(8, Math.round((toNumber(row.registeredValue) / maxValue) * 190))
          return (
            <div key={row.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="flex h-[200px] w-full items-end justify-center gap-1.5">
                <span className="w-[34%] rounded-t-lg bg-[#1769d1]" style={{ height: pipelineHeight }} title={`Pipeline ${formatCurrency(row.pipelineValue)}`} />
                <span className="w-[34%] rounded-t-lg bg-[#18a058]" style={{ height: registeredHeight }} title={`Registered ${formatCurrency(row.registeredValue)}`} />
              </div>
              <span className="text-[0.72rem] font-semibold text-[#7a8ca1]">{row.label}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-[#65788d]">
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#1769d1]" /> Pipeline Value</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#18a058]" /> Registered Value</span>
      </div>
    </div>
  )
}

function DonutChart({ items = [], totalLabel = 'Total', centerValue = '', emptyTitle = 'No breakdown yet' }) {
  const visibleItems = items.filter((item) => toNumber(item.count || item.value) > 0)
  const total = visibleItems.reduce((sum, item) => sum + toNumber(item.count || item.value), 0)
  if (!visibleItems.length || !total) return <EmptyState title={emptyTitle} copy="Captured deal data will populate this breakdown." icon={PieChart} />
  const segments = visibleItems.reduce((accumulator, item, index) => {
    const amount = toNumber(item.count || item.value)
    const start = accumulator.cursor
    const end = start + (amount / total) * 100
    return {
      cursor: end,
      values: [...accumulator.values, `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start}% ${end}%`],
    }
  }, { cursor: 0, values: [] }).values
  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
      <div className="relative mx-auto h-[180px] w-[180px] rounded-full" style={{ background: `conic-gradient(${segments.join(', ')})` }}>
        <div className="absolute inset-[34px] grid place-items-center rounded-full bg-white text-center shadow-inner">
          <strong className="text-[1.5rem] font-semibold text-[#101d2c]">{centerValue || formatNumber(total)}</strong>
          <span className="text-xs font-medium text-[#7a8ca1]">{totalLabel}</span>
        </div>
      </div>
      <div className="space-y-2">
        {visibleItems.map((item, index) => (
          <div key={item.key || item.label} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[#24384d]">
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="text-sm font-semibold text-[#101d2c]">{formatNumber(item.count || item.value)} <span className="text-xs text-[#7a8ca1]">({formatPercent(item.percentage)})</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HorizontalBars({ items = [], valueKey = 'count', labelKey = 'label', emptyTitle = 'No data yet' }) {
  const max = Math.max(1, ...items.map((item) => toNumber(item[valueKey])))
  const rows = items.filter((item) => toNumber(item[valueKey]) > 0)
  if (!rows.length) return <EmptyState title={emptyTitle} copy="More complete records will unlock this chart." />
  return (
    <div className="space-y-3">
      {rows.map((item) => (
        <div key={item.key || item[labelKey]}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold">
            <span className="truncate text-[#40546a]">{item[labelKey]}</span>
            <span className="text-[#101d2c]">{formatNumber(item[valueKey])}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#edf2f7]">
            <div className="h-full rounded-full bg-[#1769d1]" style={{ width: `${Math.max(4, Math.round((toNumber(item[valueKey]) / max) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function LeadFunnel({ rows = [] }) {
  if (!rows.length || !rows.some((row) => toNumber(row.count) > 0)) return <EmptyState title="No funnel data yet" copy="Leads, appointments, offers, and registrations will populate the funnel." />
  const max = Math.max(1, ...rows.map((row) => toNumber(row.count)))
  return (
    <div className="mt-5 grid gap-3">
      {rows.map((row) => (
        <div key={row.key} className={`${INNER_CARD_CLASS} p-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[#24384d]">{row.label}</span>
            <span className="text-sm font-semibold text-[#101d2c]">{formatNumber(row.count)}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#edf2f7]">
            <div className="h-full rounded-full bg-[#1769d1]" style={{ width: `${Math.max(4, Math.round((toNumber(row.count) / max) * 100))}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[0.72rem] font-medium text-[#7a8ca1]">
            <span>{formatPercent(row.conversion)} conversion</span>
            <span>{formatPercent(row.dropOff)} drop-off</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DataTable({ columns = [], rows = [], emptyTitle = 'No data yet', minWidth = 760 }) {
  if (!rows.length) return <EmptyState title={emptyTitle} copy="This table will populate once matching records are available." />
  return (
    <div className="mt-4 overflow-x-auto rounded-[18px] border border-[#e0e8f2]">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="bg-[#f7faff] text-[0.68rem] uppercase tracking-[0.12em] text-[#6f839a]">
          <tr>
            {columns.map((column) => <th key={column.key} className="px-4 py-3 font-semibold">{column.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f7] bg-white text-[#24384d]">
          {rows.map((row, index) => (
            <tr key={row.id || row.branchId || row.developmentId || row.agentId || `${index}`} className="transition hover:bg-[#f8fbff]">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 align-middle">
                  {column.render ? column.render(row, index) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExportButton() {
  return (
    <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[#d8e3ef] bg-white px-4 text-sm font-semibold text-[#21374d] shadow-[0_8px_18px_rgba(15,23,42,0.04)]" title="Export will be available in a later release">
      <Download size={16} />
      Export
    </button>
  )
}

function InsightsGrid({ insights = [] }) {
  const toneClass = {
    green: 'border-[#cfeedd] bg-[#f2fbf6] text-[#167a43]',
    amber: 'border-[#f2dfbb] bg-[#fff8eb] text-[#8a5e16]',
    red: 'border-[#f0cfcc] bg-[#fff5f4] text-[#b13b35]',
    blue: 'border-[#cfe2f6] bg-[#f3f8ff] text-[#1769d1]',
  }
  return (
    <section className={`${CARD_CLASS} p-5`}>
      <CardHeader eyebrow="Insights" title="Recommendations" copy="Rule-based signals from the current analytics scope." />
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {insights.map((insight) => (
          <article key={insight.label} className={`rounded-[18px] border p-4 ${toneClass[insight.tone] || toneClass.blue}`}>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] opacity-80">{insight.label}</p>
            <h3 className="mt-2 text-sm font-bold text-[#102236]">{insight.title}</h3>
            <p className="mt-2 text-xs leading-5 text-[#52657a]">{insight.copy}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

async function loadAnalyticsDataset() {
  const [branches, context] = await Promise.all([
    getBranches().catch((branchError) => {
      console.debug('[AgencyAnalytics] Branch source unavailable; using empty branches.', branchError?.message)
      return []
    }),
    fetchOrganisationSettings().catch(() => null),
  ])
  const organisationId = normalizeText(context?.organisation?.id)
  const localSnapshot = organisationId ? getAgencyPipelineSnapshot(organisationId) : { leads: [], appointments: [], tasks: [], deals: [], transactions: [] }
  const transactionFields = [
    'id, organisation_id, assigned_branch_id, lifecycle_state, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, suburb, city, sales_price, purchase_price, finance_type, cash_amount, bond_amount, bank, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, assigned_attorney_email, assigned_bond_originator_email, next_action, gross_commission_percentage, gross_commission_amount, agent_commission_amount, agency_commission_amount, registered_at, registration_date, completed_at, cancelled_at, archived_at, updated_at, created_at, is_active',
    'id, development_id, unit_id, buyer_id, finance_type, stage, current_main_stage, assigned_agent, assigned_agent_email, bank, sales_price, purchase_price, updated_at, created_at, is_active',
  ]
  const [
    transactions,
    leads,
    listings,
    users,
    appointments,
    buyers,
    developments,
  ] = await Promise.all([
    safeSelect('transactions', transactionFields, { order: 'updated_at', limit: 2000, organisationColumn: '' }),
    organisationId ? safeSelect('leads', [
      'lead_id, organisation_id, branch_id, assigned_agent_id, assigned_agent_email, lead_source, source, lead_category, lead_type, status, stage, converted_transaction_id, converted_at, budget, estimated_value, property_interest, seller_property_address, suburb, city, created_at, updated_at',
      'lead_id, organisation_id, assigned_agent_id, lead_source, status, stage, converted_transaction_id, converted_at, budget, estimated_value, created_at, updated_at',
    ], { organisationId, order: 'updated_at', limit: 2000 }) : [],
    organisationId ? safeSelect('private_listings', [
      'id, organisation_id, branch_id, development_id, assigned_agent_email, assigned_agent_name, listing_title, asking_price, listing_status, listing_visibility, stage, suburb, city, location, created_at, updated_at',
      'id, organisation_id, assigned_agent_email, listing_title, asking_price, listing_status, stage, created_at, updated_at',
    ], { organisationId, order: 'updated_at', limit: 1600 }) : [],
    organisationId ? safeSelect('organisation_users', [
      'id, organisation_id, user_id, branch_id, first_name, last_name, email, role, status, last_active_at, created_at, updated_at',
      'id, organisation_id, user_id, first_name, last_name, email, role, status, last_active_at, created_at, updated_at',
    ], { organisationId, order: 'updated_at', limit: 800 }) : [],
    organisationId ? safeSelect('appointments', [
      'appointment_id, organisation_id, transaction_id, lead_id, agent_id, branch_id, appointment_type, title, date_time, appointment_date, status, completed_at, created_at, updated_at',
      'appointment_id, organisation_id, transaction_id, lead_id, agent_id, appointment_type, title, date_time, appointment_date, status, created_at, updated_at',
    ], { organisationId, order: 'date_time', limit: 1000 }) : [],
    safeSelect('buyers', [
      'id, name, email, age, date_of_birth, gender, sex, buyer_type, purchaser_type, entity_type, marital_regime, marital_status, nationality, citizenship, country, income_bracket, monthly_income_bracket, income_range, created_at, updated_at',
      'id, name, email, created_at, updated_at',
    ], { order: 'updated_at', limit: 2000, organisationColumn: '' }),
    organisationId ? safeSelect('developments', [
      'id, organisation_id, name, location, suburb, city, updated_at, created_at',
      'id, name, location, updated_at, created_at',
    ], { organisationId, order: 'name', ascending: true, limit: 1000 }) : [],
  ])

  const transactionIds = (transactions || []).map((row) => normalizeText(row.id)).filter(Boolean)
  const [documentRequests, subprocesses] = await Promise.all([
    safeSelectByIds('document_requests', 'id, transaction_id, status, assigned_to_role, document_type, title, due_date, created_at, updated_at, completed_at', transactionIds, { order: 'updated_at', limit: 2000 }),
    safeSelectByIds('transaction_subprocesses', 'id, transaction_id, process_type, owner_type, status, created_at, updated_at', transactionIds, { order: 'updated_at', limit: 2000 }),
  ])

  return {
    branches: Array.isArray(branches) ? branches : [],
    organisationId,
    transactions: mergeRows(transactions, [...(localSnapshot.transactions || []), ...(localSnapshot.deals || [])]),
    leads: mergeRows(leads, localSnapshot.leads || [], 'lead_id'),
    listings: (Array.isArray(listings) ? listings : []).filter((row) => !isDeletedListingRow(row)),
    users,
    appointments: mergeRows(appointments, localSnapshot.appointments || [], 'appointment_id'),
    documentRequests,
    subprocesses,
    buyers,
    developments,
  }
}

export default function AgencyAnalyticsPage() {
  const [dataset, setDataset] = useState(null)
  const [branchId, setBranchId] = useState('all')
  const [dateRange, setDateRange] = useState('last_30_days')
  const [comparison, setComparison] = useState('previous_30_days')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nextDataset = await loadAnalyticsDataset()
      setDataset(nextDataset)
    } catch (loadError) {
      console.error('[AgencyAnalytics] load failed', loadError)
      setError(loadError?.message || 'Unable to load agency analytics right now.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  const analytics = useMemo(
    () =>
      buildAgencyAnalyticsModel({
        ...(dataset || {}),
        branchId,
        dateRangeKey: dateRange,
        comparisonKey: comparison,
      }),
    [branchId, comparison, dataset, dateRange],
  )

  const branchOptions = analytics.filters.branchOptions
  const selectedBranchLabel = analytics.filters.selectedBranchName
  const showBranchComparison = branchId === 'all'

  return (
    <section className="agency-analytics flex flex-col gap-5 pb-8">
      <header className={`${CARD_CLASS} overflow-hidden`}>
        <div className="border-b border-[#edf2f7] bg-[linear-gradient(135deg,#ffffff_0%,#f6faff_100%)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#1769d1]">Agency Intelligence</p>
              <h1 className="mt-2 text-[1.65rem] font-semibold tracking-[-0.045em] text-[#101d2c] sm:text-[2rem]">
                Principal Analytics Dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f738a]">
                Executive view across branch performance, pipeline health, buyer intelligence, lead conversion, and finance signals.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={loadAnalytics} className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[#d8e3ef] bg-white px-4 text-sm font-semibold text-[#21374d] shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <ExportButton />
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] sm:px-6">
          <label className="grid gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#6f839a]"><Filter size={13} /> Branch</span>
            <select className={CONTROL_CLASS} value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#6f839a]"><CalendarDays size={13} /> Date Range</span>
            <select className={CONTROL_CLASS} value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
              {DATE_RANGE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#6f839a]"><TrendingUp size={13} /> Compare</span>
            <select className={CONTROL_CLASS} value={comparison} onChange={(event) => setComparison(event.target.value)}>
              {COMPARISON_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <span className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[#d8e3ef] bg-[#f8fbff] px-4 text-sm font-semibold text-[#4d647c] lg:w-auto">
              {selectedBranchLabel}
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-[18px] border border-[#f2c7c3] bg-[#fff5f4] px-5 py-4 text-sm font-semibold text-[#b42318]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-4">
          <div className="h-28 animate-pulse rounded-[24px] bg-white" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-[24px] bg-white" />)}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="h-80 animate-pulse rounded-[24px] bg-white" />
            <div className="h-80 animate-pulse rounded-[24px] bg-white" />
          </div>
        </div>
      ) : null}

      {!loading ? (
        <>
          <KpiStrip title="Executive KPIs" items={analytics.executiveKpis} columns="xl:grid-cols-6" />
          <KpiStrip title="Operational KPIs" items={analytics.operationalKpis} columns="xl:grid-cols-7" />

          {analytics.meta.isEmpty ? (
            <section className={`${CARD_CLASS} p-6`}>
              <EmptyState
                title="No analytics activity in this scope"
                copy="Try All Branches or a wider date range. The dashboard avoids production mock values when live records are missing."
                icon={BarChart3}
              />
            </section>
          ) : null}

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader eyebrow="Pipeline Overview" title="Pipeline and registered value trend" copy="Monthly movement for the selected branch and date range." />
              <PipelineOverviewChart data={analytics.pipelineOverview} />
            </article>
            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader eyebrow="Deal Type" title="Bond, cash and hybrid split" copy="Deal count by finance type." />
              <DonutChart items={analytics.dealTypeBreakdown} totalLabel="Deals" emptyTitle="No deal type data yet" />
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader
                eyebrow="Area Intelligence"
                title="Areas We Are Active"
                copy="Top active areas by pipeline value, listings, transactions, and conversion."
                action={<button type="button" className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-[#d8e3ef] bg-white px-3 text-xs font-semibold text-[#21374d]" title="Map view will be wired in a later release"><Map size={14} /> View Map</button>}
              />
              <DataTable
                minWidth={820}
                emptyTitle="No area intelligence yet"
                columns={[
                  { key: 'area', label: 'Area' },
                  { key: 'pipelineValue', label: 'Pipeline Value', render: (row) => formatCurrency(row.pipelineValue, { compact: true }) },
                  { key: 'listings', label: 'Listings', render: (row) => formatNumber(row.listings) },
                  { key: 'transactions', label: 'Transactions', render: (row) => formatNumber(row.transactions) },
                  { key: 'conversion', label: 'Conversion %', render: (row) => formatPercent(row.conversion) },
                ]}
                rows={analytics.areas}
              />
            </article>

            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader eyebrow="Buyer Demographics" title="Who is buying" copy="Compact view of captured buyer profile data." />
              <div className="mt-5 grid gap-5">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f839a]">Age Range</p>
                  <HorizontalBars items={analytics.buyerDemographics.ageRanges} emptyTitle="No age data yet" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f839a]">Gender</p>
                    <DonutChart items={analytics.buyerDemographics.gender} totalLabel="Buyers" emptyTitle="No gender data" />
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f839a]">Buyer Type</p>
                    <DonutChart items={analytics.buyerDemographics.buyerTypes} totalLabel="Buyers" emptyTitle="No buyer type data" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['Nationality', analytics.buyerDemographics.nationality?.[0]?.label || 'Unknown', analytics.buyerDemographics.nationality?.[0]?.count || 0],
                    ['Marital Regime', analytics.buyerDemographics.maritalRegime?.[0]?.label || 'Unknown', analytics.buyerDemographics.maritalRegime?.[0]?.count || 0],
                    ['Income Bracket', analytics.buyerDemographics.incomeBracket?.[0]?.label || 'Unknown', analytics.buyerDemographics.incomeBracket?.[0]?.count || 0],
                  ].map(([label, value, count]) => (
                    <div key={label} className={`${INNER_CARD_CLASS} p-3`}>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a8ca1]">{label}</p>
                      <p className="mt-2 truncate text-sm font-semibold capitalize text-[#102236]">{value}</p>
                      <p className="mt-1 text-xs text-[#7a8ca1]">{formatNumber(count)} records</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader eyebrow="Lead Intelligence" title="Lead Breakdown" copy="Lead source volume and conversion quality." />
              <DataTable
                minWidth={620}
                emptyTitle="No lead source data yet"
                columns={[
                  { key: 'label', label: 'Source' },
                  { key: 'count', label: 'Leads', render: (row) => formatNumber(row.count) },
                  { key: 'converted', label: 'Converted', render: (row) => formatNumber(row.converted) },
                  { key: 'conversion', label: 'Conversion', render: (row) => formatPercent(row.conversion) },
                ]}
                rows={analytics.leadSources.filter((row) => toNumber(row.count) > 0)}
              />
            </article>
            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader eyebrow="Lead Funnel" title="Conversion Funnel" copy="Count, drop-off, and conversion by stage." />
              <LeadFunnel rows={analytics.leadFunnel} />
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader eyebrow="Bank Intelligence" title="Bond approval performance" copy="Uses captured bank and finance workflow data when available." />
              <DataTable
                minWidth={850}
                emptyTitle="No bank intelligence yet"
                columns={[
                  { key: 'bank', label: 'Bank' },
                  { key: 'approvalRate', label: 'Approval Rate', render: (row) => formatPercent(row.approvalRate) },
                  { key: 'averageApprovalTime', label: 'Avg Approval Time', render: (row) => `${formatNumber(row.averageApprovalTime)}d` },
                  { key: 'averageBondAmount', label: 'Avg Bond Amount', render: (row) => formatCurrency(row.averageBondAmount, { compact: true }) },
                  { key: 'approvals', label: 'Approvals', render: (row) => formatNumber(row.approvals) },
                  { key: 'rejectionRate', label: 'Rejection Rate', render: (row) => formatPercent(row.rejectionRate) },
                ]}
                rows={analytics.bankIntelligence}
              />
            </article>

            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader eyebrow="Pipeline Health" title="Bottlenecks and delay signals" copy="Documents, finance, signatures, and aged transaction warnings." />
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {analytics.pipelineHealth.chips.map((chip) => (
                  <div key={chip.label} className={`${INNER_CARD_CLASS} p-3`}>
                    <p className="text-xs font-semibold text-[#60758d]">{chip.label}</p>
                    <strong className="mt-2 block text-[1.35rem] leading-none text-[#101d2c]">{formatNumber(chip.count)}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[18px] border border-[#f0d9d7] bg-[#fff7f6] p-3">
                  <p className="text-xs font-semibold text-[#a33b35]">Transactions stuck longer than 14 days</p>
                  <strong className="mt-2 block text-[1.25rem] text-[#101d2c]">{formatNumber(analytics.pipelineHealth.stuckTransactions)}</strong>
                </div>
                <div className={`${INNER_CARD_CLASS} p-3`}>
                  <p className="text-xs font-semibold text-[#60758d]">Most common delay reason</p>
                  <strong className="mt-2 block text-sm text-[#101d2c]">{analytics.pipelineHealth.mostCommonDelayReason}</strong>
                </div>
                {analytics.pipelineHealth.milestoneTimes.map((milestone) => (
                  <div key={milestone.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[#60758d]">{milestone.label}</span>
                    <strong className="text-[#101d2c]">{formatNumber(milestone.days)}d</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader eyebrow="Agent Performance" title="Agent Performance Top 5" copy="Sorted by pipeline value." action={<Link to="/agency/agents" className="text-xs font-semibold text-[#1769d1]">View all agents</Link>} />
              <DataTable
                minWidth={760}
                emptyTitle="No agent performance yet"
                columns={[
                  {
                    key: 'agent',
                    label: 'Agent',
                    render: (row) => (
                      <span className="inline-flex items-center gap-2 font-semibold text-[#102236]">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#edf5ff] text-xs text-[#1769d1]">{getInitials(row.agent)}</span>
                        {row.agent}
                      </span>
                    ),
                  },
                  { key: 'pipelineValue', label: 'Pipeline Value', render: (row) => formatCurrency(row.pipelineValue, { compact: true }) },
                  { key: 'conversionRate', label: 'Conversion Rate', render: (row) => formatPercent(row.conversionRate) },
                  { key: 'registrations', label: 'Registrations', render: (row) => formatNumber(row.registrations) },
                  { key: 'averageDaysToRegistration', label: 'Avg Days', render: (row) => `${formatNumber(row.averageDaysToRegistration)}d` },
                ]}
                rows={analytics.agentPerformance}
              />
            </article>

            <article className={`${CARD_CLASS} p-5`}>
              <CardHeader
                eyebrow="Branch Performance"
                title={showBranchComparison ? 'Branch comparison' : 'Selected branch detail'}
                copy={showBranchComparison ? 'Performance across all accessible branches.' : 'Comparison table is scoped to the selected branch.'}
              />
              <DataTable
                minWidth={860}
                emptyTitle="No branch performance yet"
                columns={[
                  { key: 'branch', label: 'Branch' },
                  { key: 'pipelineValue', label: 'Pipeline Value', render: (row) => formatCurrency(row.pipelineValue, { compact: true }) },
                  { key: 'registeredValue', label: 'Registered Value', render: (row) => formatCurrency(row.registeredValue, { compact: true }) },
                  { key: 'conversionRate', label: 'Conversion Rate', render: (row) => formatPercent(row.conversionRate) },
                  { key: 'listings', label: 'Listings', render: (row) => formatNumber(row.listings) },
                  { key: 'transactions', label: 'Transactions', render: (row) => formatNumber(row.transactions) },
                  { key: 'activeAgents', label: 'Active Agents', render: (row) => formatNumber(row.activeAgents) },
                ]}
                rows={showBranchComparison ? analytics.branchPerformance : analytics.branchPerformance.filter((row) => row.branchId === branchId)}
              />
            </article>
          </section>

          <section className={`${CARD_CLASS} p-5`}>
            <CardHeader eyebrow="Development Performance" title="Development and project performance" copy="Pipeline, unit sales, average price, conversion, and active stock." />
            <DataTable
              minWidth={900}
              emptyTitle="No development performance yet"
              columns={[
                { key: 'development', label: 'Development' },
                { key: 'pipelineValue', label: 'Pipeline Value', render: (row) => formatCurrency(row.pipelineValue, { compact: true }) },
                { key: 'unitsSold', label: 'Units Sold', render: (row) => formatNumber(row.unitsSold) },
                { key: 'averagePrice', label: 'Average Price', render: (row) => formatCurrency(row.averagePrice, { compact: true }) },
                { key: 'conversionRate', label: 'Conversion Rate', render: (row) => formatPercent(row.conversionRate) },
                { key: 'activeListings', label: 'Active Listings', render: (row) => formatNumber(row.activeListings) },
              ]}
              rows={analytics.developmentPerformance}
            />
          </section>

          <InsightsGrid insights={analytics.insights} />
        </>
      ) : null}
    </section>
  )
}
