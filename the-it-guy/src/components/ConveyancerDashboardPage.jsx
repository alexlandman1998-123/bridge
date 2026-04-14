import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FileText,
  Hourglass,
  ShieldAlert,
  Workflow,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import SectionHeader from './ui/SectionHeader'
import {
  selectConveyancerLiveActivity,
  selectConveyancerActiveTransactionsStrip,
  selectConveyancerInsights,
  selectConveyancerNeedsAttentionDetailed,
  selectConveyancerPipelineDetailed,
  selectConveyancerPriorityActions,
  selectConveyancerRegistrations,
  selectConveyancerRiskRows,
  selectConveyancerSummary,
  selectConveyancerWorkQueue,
} from '../core/transactions/conveyancerSelectors'

const PANEL_CLASS = 'rounded-surface border border-borderSoft bg-surface px-5 py-6 md:px-6'
const METRICS_BANNER_CLASS = 'rounded-surface border border-borderSoft bg-surfaceAlt p-3 md:p-4'
const SOFT_CARD_CLASS =
  'rounded-surface border border-borderDefault bg-surface px-4 py-4 shadow-surface transition duration-150 ease-out hover:-translate-y-px hover:border-borderStrong hover:shadow-floating'
const METRIC_CARD_CLASS =
  'group relative overflow-hidden rounded-surface border border-borderDefault bg-surface px-5 py-4 text-left shadow-surface transition duration-200 ease-out hover:-translate-y-0.5 hover:border-borderStrong hover:shadow-floating'
const ACTIVE_STRIP_PANEL_CLASS = 'rounded-surface border border-borderSoft bg-surfaceAlt px-4 py-5 md:px-5 md:py-6'
const ACTIVE_TRANSACTION_CARD_CLASS =
  'group relative flex w-[320px] min-w-[320px] flex-col rounded-surface border border-borderDefault bg-surface px-4 py-4 text-left shadow-surface transition duration-150 ease-out hover:-translate-y-px hover:border-borderStrong hover:shadow-floating'
const PRIORITY_CARD_CLASS =
  'group relative overflow-hidden rounded-surface border border-borderDefault bg-surface px-5 py-5 text-left shadow-surface transition duration-200 ease-out hover:-translate-y-0.5 hover:border-borderStrong hover:shadow-floating'
const WORK_ITEM_CARD_CLASS =
  'group relative overflow-hidden rounded-surface border border-borderDefault bg-surface px-5 py-4 text-left shadow-surface transition duration-200 ease-out hover:-translate-y-0.5 hover:border-borderStrong hover:shadow-floating'
const WORK_ITEM_CTA_CLASS =
  'inline-flex min-h-[38px] items-center gap-1 rounded-control border border-primary bg-primary px-3.5 py-1.5 text-helper font-semibold text-textInverse shadow-surface transition duration-150 ease-out group-hover:bg-primaryHover'
const INSIGHT_CARD_CLASS = 'rounded-surface border border-borderSoft bg-surface px-5 py-5 md:px-6'

const CASH_BOND_COLOR_MAP = {
  cash: '#3f78a8',
  bond: '#2f8a63',
  unknown: '#93a2b5',
}

const BANK_COLOR_MAP = {
  fnb: '#2f8a63',
  absa: '#3f78a8',
  nedbank: '#2f8696',
  standard_bank: '#5b6f88',
  sa_home_loans: '#6b7f98',
  unknown: '#93a2b5',
}

const DEMOGRAPHIC_COLOR_MAP = {
  '18_24': '#9f7aea',
  '25_34': '#3f78a8',
  '35_44': '#2f8696',
  '45_54': '#2f8a63',
  '55_': '#6b7f98',
  male: '#3f78a8',
  female: '#2f8a63',
  other: '#8b5cf6',
  prefer_not_to_say: '#c084fc',
  unknown: '#93a2b5',
}

const PRIORITY_META = {
  needs_attention: {
    icon: ShieldAlert,
    badgeClassName: 'border border-danger bg-dangerSoft text-danger',
    accentClassName: 'bg-danger',
  },
  awaiting_client_docs: {
    icon: FileText,
    badgeClassName: 'border border-warning bg-warningSoft text-warning',
    accentClassName: 'bg-warning',
  },
  stuck_over_7_days: {
    icon: Hourglass,
    badgeClassName: 'border border-warning bg-warningSoft text-warning',
    accentClassName: 'bg-warning',
  },
  ready_to_lodge: {
    icon: CheckCircle2,
    badgeClassName: 'border border-success bg-successSoft text-success',
    accentClassName: 'bg-success',
  },
}

const ATTENTION_TONE_CLASS = {
  critical: 'border border-danger bg-dangerSoft text-danger',
  warning: 'border border-warning bg-warningSoft text-warning',
  risk: 'border border-warning bg-warningSoft text-warning',
}

const STAGE_PILL_CLASS = {
  registered: 'border border-success bg-successSoft text-success',
  lodgement: 'border border-info bg-infoSoft text-info',
  registration_preparation: 'border border-info bg-infoSoft text-info',
  clearances: 'border border-primary bg-primarySoft text-primary',
  guarantees: 'border border-primary bg-primarySoft text-primary',
  signing: 'border border-primary bg-primarySoft text-primary',
  drafting: 'border border-primary bg-primarySoft text-primary',
  fica_onboarding: 'border border-primary bg-primarySoft text-primary',
  instruction_received: 'border border-borderDefault bg-mutedBg text-textMuted',
}

const ACTIVITY_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'comments', label: 'Comments' },
  { key: 'documents', label: 'Documents' },
  { key: 'stage_changes', label: 'Stage Changes' },
]

const METRIC_META = {
  active_transactions: {
    icon: Workflow,
    iconClassName: 'border border-primary bg-primarySoft text-primary',
    accentClassName: 'bg-primary',
  },
  lodged: {
    icon: Activity,
    iconClassName: 'border border-info bg-infoSoft text-info',
    accentClassName: 'bg-info',
  },
  registered_this_month: {
    icon: CheckCircle2,
    iconClassName: 'border border-success bg-successSoft text-success',
    accentClassName: 'bg-success',
  },
  blocked_on_hold: {
    icon: ShieldAlert,
    iconClassName: 'border border-danger bg-dangerSoft text-danger',
    accentClassName: 'bg-danger',
  },
}

function formatDateTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'No recent update'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'No recent update'

  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just now'

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}d ago`

  return formatDateTime(value)
}

function formatPropertyUnitText(property, unitNumber) {
  const normalizedUnit = String(unitNumber || '').trim().toLowerCase()
  if (!unitNumber || unitNumber === '-' || normalizedUnit === 'private matter') return property
  return `${property} • ${unitNumber}`
}

function getStageClassName(stageKey) {
  return STAGE_PILL_CLASS[stageKey] || 'border border-borderDefault bg-mutedBg text-textMuted'
}

function formatFinanceTypeLabel(financeType) {
  if (!financeType) return ''
  if (financeType === 'hybrid') return 'Hybrid'
  return financeType.charAt(0).toUpperCase() + financeType.slice(1)
}

function getProgressTone(percent) {
  if (percent >= 80) return '#2f8a63'
  if (percent >= 60) return '#2f8696'
  if (percent >= 30) return '#3f78a8'
  return '#7e91a8'
}

function getWorkItemAccentClass(stageKey) {
  if (stageKey === 'registered') return 'bg-success'
  if (stageKey === 'lodgement' || stageKey === 'registration_preparation') return 'bg-info'
  if (stageKey === 'guarantees' || stageKey === 'clearances') return 'bg-warning'
  if (stageKey === 'signing') return 'bg-primary'
  if (stageKey === 'drafting') return 'bg-primary'
  if (stageKey === 'fica_onboarding') return 'bg-info'
  return 'bg-borderStrong'
}

function toItemPercent(count, total) {
  if (!total) return 0
  return Math.round((Number(count || 0) / total) * 100)
}

function buildInsightDonutGradient(items = [], total = 0, colorMap = {}) {
  if (!total) return 'conic-gradient(#d8e3ef 0% 100%)'

  let cursor = 0
  const slices = items
    .filter((item) => Number(item?.count || 0) > 0)
    .map((item) => {
      const percent = (Number(item.count || 0) / total) * 100
      const start = cursor
      const end = cursor + percent
      cursor = end
      const color =
        colorMap[item.key] ||
        colorMap[String(item.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')] ||
        '#93a2b5'
      return `${color} ${start}% ${end}%`
    })

  return slices.length ? `conic-gradient(${slices.join(', ')})` : 'conic-gradient(#d8e3ef 0% 100%)'
}

function getInsightItemColor(item, colorMap = {}) {
  return (
    colorMap[item.key] ||
    colorMap[String(item.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')] ||
    '#93a2b5'
  )
}

function ConveyancerDashboardPage({ rows = [] }) {
  const navigate = useNavigate()
  const [activityFilter, setActivityFilter] = useState('all')

  const summary = useMemo(() => selectConveyancerSummary(rows), [rows])
  const activeTransactionsStrip = useMemo(() => selectConveyancerActiveTransactionsStrip(rows, 10), [rows])
  const priorities = useMemo(() => selectConveyancerPriorityActions(rows), [rows])
  const workQueue = useMemo(() => selectConveyancerWorkQueue(rows, 8), [rows])
  const needsAttention = useMemo(() => selectConveyancerNeedsAttentionDetailed(rows, 2), [rows])
  const pipeline = useMemo(() => selectConveyancerPipelineDetailed(rows), [rows])
  const riskRows = useMemo(() => selectConveyancerRiskRows(rows, 10), [rows])
  const liveActivity = useMemo(() => selectConveyancerLiveActivity(rows, 16), [rows])
  const registrations = useMemo(() => selectConveyancerRegistrations(rows, 6), [rows])
  const insights = useMemo(() => selectConveyancerInsights(rows), [rows])
  const topAgentsMaxCount = useMemo(
    () => Math.max(...insights.topAgents.items.map((item) => Number(item.count || 0)), 1),
    [insights.topAgents.items],
  )

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return liveActivity
    return liveActivity.filter((item) => item.category === activityFilter)
  }, [activityFilter, liveActivity])

  function openMatter(item) {
    if (item?.transactionId && !String(item.transactionId).startsWith('preview-')) {
      navigate(`/transactions/${item.transactionId}`)
      return
    }

    if (item?.unitId) {
      navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
      return
    }

    const fallbackSearch = item?.buyerName || item?.reference || item?.developmentName || item?.property || ''
    navigate(fallbackSearch ? `/transactions?search=${encodeURIComponent(fallbackSearch)}` : '/transactions')
  }

  function navigateToTransactions(filters = {}) {
    const search = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).length > 0) {
        search.set(key, String(value))
      }
    })
    const query = search.toString()
    navigate(query ? `/transactions?${query}` : '/transactions')
  }

  const topMetrics = useMemo(
    () => [
      {
        key: 'active_transactions',
        label: 'Active Transactions',
        value: summary.activeTransactions,
        helperText: 'Current live files',
        filter: { attorneyTab: 'active', blocked: 'all', risk: 'all' },
      },
      {
        key: 'lodged',
        label: 'Lodged',
        value: summary.lodged,
        helperText: 'Files near registration',
        filter: { attorneyTab: 'lodged' },
      },
      {
        key: 'registered_this_month',
        label: 'Registered This Month',
        value: summary.registeredThisMonth,
        helperText: 'Completed legal registrations',
        filter: { attorneyTab: 'registered', stage: 'registered' },
      },
      {
        key: 'blocked_on_hold',
        label: 'Blocked / On Hold',
        value: summary.blockedOrOnHold,
        helperText: 'Files needing intervention',
        filter: { attorneyTab: 'blocked', blocked: 'blocked' },
      },
    ],
    [summary.activeTransactions, summary.blockedOrOnHold, summary.lodged, summary.registeredThisMonth],
  )

  return (
    <div className="space-y-8">
      <section className={METRICS_BANNER_CLASS}>
        <div className="mb-3 px-1">
          <p className="text-label font-semibold uppercase tracking-[0.08em] text-textMuted">Pipeline Snapshot</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {topMetrics.map((item) => {
            const meta = METRIC_META[item.key] || METRIC_META.active_transactions
            const Icon = meta.icon
            return (
              <button
                key={item.key}
                type="button"
                className={METRIC_CARD_CLASS}
                onClick={() => navigateToTransactions(item.filter)}
              >
                <span className={`absolute inset-x-0 top-0 h-[2px] ${meta.accentClassName}`} aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <span className="block text-label font-semibold uppercase tracking-[0.08em] text-textMuted">{item.label}</span>
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-control ${meta.iconClassName}`} aria-hidden>
                    <Icon size={16} />
                  </span>
                </div>
                <strong className="mt-3 block text-4xl font-semibold leading-none tracking-[-0.03em] text-textStrong">{item.value}</strong>
                <p className="mt-2 text-secondary text-textMuted">{item.helperText}</p>
                <span className="mt-4 inline-flex items-center gap-1 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-1.5 text-helper font-semibold text-textStrong transition duration-150 ease-out group-hover:border-borderStrong group-hover:text-primary">
                  Open filtered view <ArrowRight size={14} />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className={ACTIVE_STRIP_PANEL_CLASS}>
        <SectionHeader
          title="Active Transactions"
          copy="Live files currently moving through the legal process."
          titleClassName="text-[1.18rem] tracking-[-0.02em]"
          copyClassName="text-sm leading-6"
          actions={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-borderSoft bg-surface px-3 py-1 text-helper font-semibold text-textMuted">
                {summary.activeTransactions} active
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigateToTransactions({ attorneyTab: 'active', blocked: 'all', risk: 'all' })}
              >
                View all active
              </Button>
            </div>
          }
        />

        {activeTransactionsStrip.length ? (
          <div className="-mx-1 mt-5 overflow-x-auto overflow-y-hidden px-1 pb-2">
            <div className="flex min-w-full gap-3">
              {activeTransactionsStrip.map((item) => {
                const progressPercent = Math.max(0, Math.min(100, Number(item.progressPercent || 0)))
                const progressWidth = Math.max(progressPercent > 0 ? 6 : 0, progressPercent)
                const progressTone = getProgressTone(progressPercent)
                const statusLabel = item.currentStage || 'Instruction Received'
                const partiesLabel = `${item.buyerName || 'Buyer pending'} • ${item.sellerName || 'Seller pending'}`
                const financeLabel = formatFinanceTypeLabel(item.financeType) || 'Unknown'
                const updatedLabel = formatRelativeTime(item.lastActivityAt)
                const supportingSignal = item.waitingOnLabel
                  ? item.waitingOnLabel
                  : item.stateKey === 'blocked'
                    ? 'File blocked'
                    : `Updated ${updatedLabel}`

                return (
                  <article
                    key={`${item.transactionId || item.unitId}-${item.reference}`}
                    className={ACTIVE_TRANSACTION_CARD_CLASS}
                    onClick={() => openMatter(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openMatter(item)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <header className="border-b border-[#dbe6f2] bg-[linear-gradient(135deg,#f1f6fb_0%,#ecf2f9_100%)] -mx-4 -mt-4 px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[0.86rem] font-medium tracking-[-0.005em] text-[#49647f]">
                            {item.developmentName || item.property}
                          </strong>
                        </div>
                        <span className="inline-flex shrink-0 items-center rounded-full border border-[#cddced] bg-white/92 px-2.5 py-1 text-[0.76rem] font-semibold text-[#2f4f6f]">
                          Unit {item.unitNumber}
                        </span>
                      </div>
                    </header>

                    <div className="grid gap-3 pt-4">
                      <section className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: progressTone }} aria-hidden />
                          <strong
                            title={statusLabel}
                            className="overflow-hidden text-ellipsis whitespace-nowrap text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]"
                          >
                            {statusLabel}
                          </strong>
                        </div>
                        <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.79rem] text-[#6c8096]">
                          {supportingSignal}
                        </p>
                      </section>

                      <section className="flex items-center justify-between gap-3">
                        <p
                          title={partiesLabel}
                          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.86rem] font-medium text-[#2f465e]"
                        >
                          {partiesLabel}
                        </p>
                        <span className="inline-flex shrink-0 items-center rounded-full border border-[#d6e1ee] bg-white px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#5b7189]">
                          {financeLabel}
                        </span>
                      </section>

                      <section className="rounded-surface-sm border border-[#e1e9f3] bg-[#fafcfe] px-4 py-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8fa6]">Progress</span>
                          <strong className="text-[0.95rem] font-semibold text-[#162334]">{Math.round(progressPercent)}%</strong>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#dfe7f1]" aria-hidden>
                          <span
                            className="block h-full rounded-full transition-all duration-200 ease-out"
                            style={{ width: `${progressWidth}%`, backgroundColor: progressTone }}
                          />
                        </div>
                      </section>

                      <footer className="flex items-center justify-end pt-0.5">
                        <span className="inline-flex items-center gap-1 text-[0.88rem] font-semibold text-primary transition duration-150 ease-out group-hover:gap-1.5">
                          View Transaction <ArrowRight size={15} />
                        </span>
                      </footer>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-surface border border-dashed border-borderDefault bg-surface px-5 py-8 text-center">
            <strong className="text-body font-semibold text-textStrong">No active transactions yet.</strong>
            <p className="mt-2 text-secondary text-textMuted">
              Live attorney-managed files will appear here once your workspace starts moving.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <SectionHeader
          title="Business and Buyer Insights"
          copy="Operational buyer mix and referral visibility from mapped transaction and onboarding data."
          titleClassName="text-[1.18rem] tracking-[-0.02em]"
          copyClassName="text-sm leading-6"
        />

        <div className="grid gap-5 xl:grid-cols-2">
          <article className={INSIGHT_CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-body font-semibold text-textStrong">Cash vs Bond Buyers</h3>
                <p className="mt-1 text-secondary text-textMuted">
                  Financing mix across attorney-accessible transactions.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1 text-helper font-semibold text-textMuted">
                {insights.cashVsBond.total} total
              </span>
            </div>

            {insights.cashVsBond.total > 0 ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div
                  className="h-[132px] w-[132px] rounded-full border border-borderSoft"
                  style={{
                    background: buildInsightDonutGradient(
                      insights.cashVsBond.items,
                      insights.cashVsBond.total,
                      CASH_BOND_COLOR_MAP,
                    ),
                  }}
                  aria-hidden
                >
                  <div className="mx-auto mt-[17px] flex h-[96px] w-[96px] items-center justify-center rounded-full border border-borderSoft bg-surface">
                    <strong className="text-[1.32rem] font-semibold leading-none tracking-[-0.02em] text-textStrong">
                      {insights.cashVsBond.total}
                    </strong>
                  </div>
                </div>

                <ul className="grid gap-2">
                  {insights.cashVsBond.items
                    .filter((item) => item.count > 0)
                    .map((item) => {
                      const itemColor = getInsightItemColor(item, CASH_BOND_COLOR_MAP)
                      return (
                        <li
                          key={item.key}
                          className="flex items-center justify-between gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: itemColor }} aria-hidden />
                            <span className="truncate text-secondary font-medium text-textStrong">{item.label}</span>
                          </div>
                          <span className="shrink-0 text-secondary font-semibold text-textStrong">
                            {item.count} ({toItemPercent(item.count, insights.cashVsBond.total)}%)
                          </span>
                        </li>
                      )
                    })}
                </ul>
              </div>
            ) : (
              <div className="mt-4 rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-secondary text-textMuted">
                No finance data available yet.
              </div>
            )}
          </article>

          <article className={INSIGHT_CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-body font-semibold text-textStrong">Bond Bank Split</h3>
                <p className="mt-1 text-secondary text-textMuted">
                  Distribution of bond-funded files by lender.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1 text-helper font-semibold text-textMuted">
                {insights.bondBankSplit.total} bond files
              </span>
            </div>

            {insights.bondBankSplit.total > 0 ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div
                  className="h-[132px] w-[132px] rounded-full border border-borderSoft"
                  style={{
                    background: buildInsightDonutGradient(
                      insights.bondBankSplit.items,
                      insights.bondBankSplit.total,
                      BANK_COLOR_MAP,
                    ),
                  }}
                  aria-hidden
                >
                  <div className="mx-auto mt-[17px] flex h-[96px] w-[96px] items-center justify-center rounded-full border border-borderSoft bg-surface">
                    <strong className="text-[1.32rem] font-semibold leading-none tracking-[-0.02em] text-textStrong">
                      {insights.bondBankSplit.total}
                    </strong>
                  </div>
                </div>

                <ul className="grid gap-2">
                  {insights.bondBankSplit.items.slice(0, 6).map((item) => {
                    const itemColor = getInsightItemColor(item, BANK_COLOR_MAP)
                    return (
                      <li
                        key={item.key}
                        className="flex items-center justify-between gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: itemColor }} aria-hidden />
                          <span className="truncate text-secondary font-medium text-textStrong">{item.label}</span>
                        </div>
                        <span className="shrink-0 text-secondary font-semibold text-textStrong">
                          {item.count} ({toItemPercent(item.count, insights.bondBankSplit.total)}%)
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <div className="mt-4 rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-secondary text-textMuted">
                No bond bank data captured yet.
              </div>
            )}
          </article>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <article className={INSIGHT_CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-body font-semibold text-textStrong">Buyer Age Group</h3>
                <p className="mt-1 text-secondary text-textMuted">
                  Distribution based on purchaser date of birth.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1 text-helper font-semibold text-textMuted">
                {insights.buyerAgeGroup.total} buyers
              </span>
            </div>

            {insights.buyerAgeGroup.total > 0 ? (
              <ul className="mt-5 grid gap-2">
                {insights.buyerAgeGroup.items
                  .filter((item) => item.count > 0)
                  .map((item) => {
                    const itemColor = getInsightItemColor(item, DEMOGRAPHIC_COLOR_MAP)
                    const width = Math.max(toItemPercent(item.count, insights.buyerAgeGroup.total), item.count > 0 ? 4 : 0)
                    return (
                      <li key={item.key} className="rounded-control border border-borderSoft bg-surfaceAlt px-3 py-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-secondary font-medium text-textStrong">{item.label}</span>
                          <span className="text-secondary font-semibold text-textStrong">
                            {item.count} ({toItemPercent(item.count, insights.buyerAgeGroup.total)}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[#dbe5f1]" aria-hidden>
                          <span
                            className="block h-full rounded-full transition-all duration-200 ease-out"
                            style={{ width: `${width}%`, backgroundColor: itemColor }}
                          />
                        </div>
                      </li>
                    )
                  })}
              </ul>
            ) : (
              <div className="mt-4 rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-secondary text-textMuted">
                No buyer demographic data available yet.
              </div>
            )}
          </article>

          <article className={INSIGHT_CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-body font-semibold text-textStrong">Buyer Gender</h3>
                <p className="mt-1 text-secondary text-textMuted">
                  Gender spread from onboarding buyer profiles.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1 text-helper font-semibold text-textMuted">
                {insights.buyerGender.total} buyers
              </span>
            </div>

            {insights.buyerGender.total > 0 ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div
                  className="h-[132px] w-[132px] rounded-full border border-borderSoft"
                  style={{
                    background: buildInsightDonutGradient(
                      insights.buyerGender.items,
                      insights.buyerGender.total,
                      DEMOGRAPHIC_COLOR_MAP,
                    ),
                  }}
                  aria-hidden
                >
                  <div className="mx-auto mt-[17px] flex h-[96px] w-[96px] items-center justify-center rounded-full border border-borderSoft bg-surface">
                    <strong className="text-[1.32rem] font-semibold leading-none tracking-[-0.02em] text-textStrong">
                      {insights.buyerGender.total}
                    </strong>
                  </div>
                </div>

                <ul className="grid gap-2">
                  {insights.buyerGender.items
                    .filter((item) => item.count > 0)
                    .map((item) => {
                      const itemColor = getInsightItemColor(item, DEMOGRAPHIC_COLOR_MAP)
                      return (
                        <li
                          key={item.key}
                          className="flex items-center justify-between gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: itemColor }} aria-hidden />
                            <span className="truncate text-secondary font-medium text-textStrong">{item.label}</span>
                          </div>
                          <span className="shrink-0 text-secondary font-semibold text-textStrong">
                            {item.count} ({toItemPercent(item.count, insights.buyerGender.total)}%)
                          </span>
                        </li>
                      )
                    })}
                </ul>
              </div>
            ) : (
              <div className="mt-4 rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-secondary text-textMuted">
                No buyer demographic data available yet.
              </div>
            )}
          </article>
        </div>

        <article className={INSIGHT_CARD_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-body font-semibold text-textStrong">Top Agents</h3>
              <p className="mt-1 text-secondary text-textMuted">
                Highest transaction contributors in the current attorney-accessible book.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate('/transactions')}>
              Open transactions
            </Button>
          </div>

          {insights.topAgents.total > 0 ? (
            <ol className="mt-5 grid gap-2.5">
              {insights.topAgents.items.slice(0, 5).map((item, index) => {
                const width = Math.max(Math.round((Number(item.count || 0) / topAgentsMaxCount) * 100), 6)
                return (
                  <li key={`${item.key}-${item.label}`} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-borderSoft bg-surface text-helper font-semibold text-textMuted">
                          {index + 1}
                        </span>
                        <strong className="truncate text-secondary font-semibold text-textStrong">{item.label}</strong>
                      </div>
                      <span className="text-secondary font-semibold text-textStrong">{item.count}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-[#dbe5f1]" aria-hidden>
                      <span
                        className="block h-full rounded-full bg-primary transition-all duration-200 ease-out"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="mt-4 rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-secondary text-textMuted">
              No agent mapping data available yet.
            </div>
          )}
        </article>
      </section>

      <section className={PANEL_CLASS}>
        <SectionHeader
          title="Today's Priorities"
          copy="Action-focused file buckets for immediate attention and next legal movement."
          titleClassName="text-[1.22rem] tracking-[-0.02em]"
          copyClassName="text-sm leading-6"
        />

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {priorities.map((item) => {
            const meta = PRIORITY_META[item.key] || PRIORITY_META.needs_attention
            const Icon = meta.icon
            return (
              <button
                key={item.key}
                type="button"
                className={PRIORITY_CARD_CLASS}
                onClick={() => navigateToTransactions(item.filter)}
              >
                <span className={`absolute inset-x-0 top-0 h-[2px] ${meta.accentClassName}`} aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${meta.badgeClassName}`}
                    aria-hidden
                  >
                    <Icon size={20} />
                  </span>
                  <span className="text-[1.7rem] font-semibold leading-none tracking-[-0.03em] text-textStrong">{item.count}</span>
                </div>
                <small className="mt-4 block text-label font-semibold uppercase tracking-[0.08em] text-textMuted">Priority Queue</small>
                <strong className="mt-1 block text-body font-semibold text-textStrong">{item.label}</strong>
                <p className="mt-1 text-secondary text-textMuted">{item.helperText}</p>
                <span className="mt-4 inline-flex items-center gap-1 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-1.5 text-helper font-semibold text-textStrong transition duration-150 ease-out group-hover:border-borderStrong group-hover:text-primary">
                  Open queue <ArrowRight size={14} />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className={PANEL_CLASS}>
        <SectionHeader
          title="My Work Today"
          copy="Files where legal execution needs your action now."
          titleClassName="text-[1.22rem] tracking-[-0.02em]"
          copyClassName="text-sm leading-6"
          actions={
            <Button variant="secondary" size="sm" onClick={() => navigate('/transactions')}>
              Open all files
            </Button>
          }
        />

        <div className="mt-5 grid gap-3">
          {workQueue.length ? (
            workQueue.map((item) => (
              <button
                key={`${item.transactionId || item.unitId}-${item.reference}`}
                type="button"
                className={`${WORK_ITEM_CARD_CLASS} grid gap-3 text-left lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center`}
                onClick={() => openMatter(item)}
              >
                <span className={`absolute inset-y-4 left-0 w-1 rounded-r ${getWorkItemAccentClass(item.stageKey)}`} aria-hidden />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-body font-semibold text-textStrong">{formatPropertyUnitText(item.property, item.unitNumber)}</strong>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-helper font-semibold ${getStageClassName(item.stageKey)}`}>
                      {item.stage}
                    </span>
                  </div>
                  <p className="mt-1 text-secondary text-textStrong">{item.reason}</p>
                  <small className="mt-2 block text-[0.78rem] text-textMuted">
                    {item.buyerName} • Updated {formatRelativeTime(item.lastActivityAt)}
                  </small>
                </div>

                <span className={WORK_ITEM_CTA_CLASS}>
                  {item.actionLabel} <ArrowRight size={14} />
                </span>
              </button>
            ))
          ) : (
            <div className="rounded-surface border border-dashed border-borderDefault bg-surfaceAlt px-5 py-8 text-center">
              <strong className="text-body font-semibold text-textStrong">No direct tasks assigned right now.</strong>
              <p className="mt-2 text-secondary text-textMuted">
                Priority files and live updates will appear here as matters move.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <article className={PANEL_CLASS}>
          <SectionHeader title="Needs Attention" copy="Exception buckets to triage and resolve bottlenecks quickly." />

          <div className="mt-5 grid gap-3">
            {needsAttention.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`${SOFT_CARD_CLASS} text-left`}
                onClick={() => navigateToTransactions(item.filter)}
              >
                <div className="flex items-start justify-between gap-3">
                  <strong className="text-body font-semibold text-textStrong">{item.label}</strong>
                  <span className={`inline-flex min-w-[2.4rem] items-center justify-center rounded-full px-2 py-1 text-helper font-semibold ${ATTENTION_TONE_CLASS[item.severity] || 'border border-borderDefault bg-mutedBg text-textMuted'}`}>
                    {item.count}
                  </span>
                </div>
                <p className="mt-1 text-secondary text-textMuted">{item.description}</p>

                {item.preview.length ? (
                  <div className="mt-3 grid gap-2 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2.5">
                    {item.preview.map((preview) => (
                      <div key={`${preview.transactionId || preview.unitId}-${preview.label}`} className="grid gap-0.5">
                        <small className="text-helper font-semibold text-textStrong">{preview.label}</small>
                        <small className="text-helper text-textMuted">{preview.note}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2.5 text-helper text-textMuted">
                    No files currently in this category.
                  </div>
                )}
              </button>
            ))}
          </div>
        </article>

        <article className={PANEL_CLASS}>
          <SectionHeader title="Pipeline" copy="Stage visibility with stuck counts to expose where throughput is slowing." />

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {pipeline.map((item, index) => (
              <button
                key={item.key}
                type="button"
                className={`${SOFT_CARD_CLASS} text-left`}
                onClick={() => navigateToTransactions(item.filter)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-control border border-borderSoft bg-surfaceAlt px-2 text-helper font-semibold text-textMuted">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-section-title font-semibold text-textStrong">{item.count}</span>
                </div>
                <strong className="mt-3 block text-body font-semibold text-textStrong">{item.label}</strong>
                <p className="mt-1 text-secondary text-textMuted">{item.helperText}</p>
                <small className="mt-2 block text-helper text-textMuted">
                  {item.stuckCount > 0 ? `${item.stuckCount} stuck in this stage` : 'No stuck files in this stage'}
                </small>
              </button>
            ))}
          </div>
        </article>
      </section>

      <DataTable
        title="Files at Risk"
        copy="Blocked, stale, or aging files sorted by operational risk."
        className="ui-table-card"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigateToTransactions({ risk: 'blocked' })}>
            View risk list
          </Button>
        }
      >
        <DataTableInner className="min-w-[920px]">
          <thead>
            <tr>
              <th>Property / Unit</th>
              <th>Buyer</th>
              <th>Seller</th>
              <th>Current Stage</th>
              <th>Days Open</th>
              <th>Next Action</th>
            </tr>
          </thead>
          <tbody>
            {riskRows.map((item) => (
              <tr
                key={item.transactionId || item.unitId}
                className="ui-data-row-clickable"
                onClick={() => openMatter(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openMatter(item)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <td>
                  <strong>{formatPropertyUnitText(item.property, item.unitNumber)}</strong>
                </td>
                <td>
                  <strong>{item.buyerName}</strong>
                </td>
                <td>
                  <strong>{item.sellerName || 'Not captured'}</strong>
                </td>
                <td>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-helper font-semibold ${getStageClassName(item.stageKey)}`}>
                    {item.currentStage}
                  </span>
                </td>
                <td>
                  <div className="grid gap-1">
                    <strong>{item.daysOpen}</strong>
                    <small>days open</small>
                  </div>
                </td>
                <td>
                  <small className="text-helper text-textStrong">{item.nextAction}</small>
                </td>
              </tr>
            ))}
            {!riskRows.length ? (
              <tr>
                <td colSpan={6}>No aged or blocked files are currently flagged.</td>
              </tr>
            ) : null}
          </tbody>
        </DataTableInner>
      </DataTable>

      <section className={PANEL_CLASS}>
        <SectionHeader
          title="Live Activity"
          copy="Recent comments, document events, and stage movement across your files."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {ACTIVITY_FILTER_OPTIONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`inline-flex min-h-[34px] items-center rounded-full border px-3 py-1.5 text-helper font-semibold transition duration-150 ease-out ${
                    activityFilter === item.key
                      ? 'border-borderStrong bg-surface text-textStrong shadow-surface'
                      : 'border-borderDefault bg-mutedBg text-textMuted hover:border-borderStrong hover:bg-surfaceAlt hover:text-textStrong'
                  }`}
                  onClick={() => setActivityFilter(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          }
        />

        <div className="mt-5 grid gap-3">
          {filteredActivity.length ? (
            filteredActivity.map((item) => (
              <button
                key={`${item.transactionId || item.unitId}-${item.updatedAt}`}
                type="button"
                className={`${SOFT_CARD_CLASS} text-left`}
                onClick={() => openMatter(item)}
              >
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-secondary font-semibold text-textStrong">{item.actor}</span>
                      <span className="inline-flex items-center rounded-full border border-borderSoft bg-surfaceAlt px-2 py-0.5 text-helper font-semibold text-textMuted">
                        {item.roleLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-secondary text-textStrong">{item.summary}</p>
                    <small className="mt-2 block text-helper text-textMuted">
                      {formatPropertyUnitText(item.property, item.unitNumber)} • {item.buyerName}
                    </small>
                  </div>
                  <span className="text-helper text-textMuted">{formatRelativeTime(item.updatedAt)}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-surface border border-dashed border-borderDefault bg-surfaceAlt px-5 py-8 text-center">
              <strong className="text-body font-semibold text-textStrong">No live activity in this filter yet.</strong>
              <p className="mt-2 text-secondary text-textMuted">Recent comments, uploads, and stage changes will appear here.</p>
            </div>
          )}
        </div>
      </section>

      <section className={PANEL_CLASS}>
        <SectionHeader
          title="Registrations This Month"
          copy="Recently completed matters for close-out and handover follow-through."
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigateToTransactions({ stage: 'registered' })}>
              Open registered files
            </Button>
          }
        />

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {registrations.map((item) => (
            <button key={`${item.transactionId || item.unitId}-${item.registeredAt}`} type="button" className={`${SOFT_CARD_CLASS} text-left`} onClick={() => openMatter(item)}>
              <div className="flex items-center justify-between gap-2">
                <strong className="text-secondary font-semibold text-textStrong">{item.reference}</strong>
                <span className="text-helper text-textMuted">{formatDateTime(item.registeredAt)}</span>
              </div>
              <p className="mt-2 text-secondary font-semibold text-textStrong">{item.buyerName}</p>
              <p className="mt-1 text-secondary text-textMuted">{formatPropertyUnitText(item.developmentName, item.unitNumber)}</p>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-borderSoft pt-3">
                <span className="inline-flex items-center rounded-full border border-success bg-successSoft px-3 py-1 text-helper font-semibold text-success">
                  Registered
                </span>
                <span className="inline-flex items-center gap-1 text-secondary font-semibold text-primary">
                  Open <ArrowRight size={14} />
                </span>
              </div>
            </button>
          ))}

          {!registrations.length ? (
            <div className="rounded-surface border border-dashed border-borderDefault bg-surfaceAlt px-5 py-8 text-center md:col-span-2 xl:col-span-3">
              <strong className="text-body font-semibold text-textStrong">No registrations recorded yet.</strong>
              <p className="mt-2 text-secondary text-textMuted">Completed registrations will appear here as matters close through the month.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export default ConveyancerDashboardPage
