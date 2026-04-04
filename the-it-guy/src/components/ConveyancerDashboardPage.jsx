import { FileCheck2, FileText, Landmark, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './ui/Button'
import Drawer from './ui/Drawer'
import DataTable, { DataTableInner } from './ui/DataTable'
import SectionHeader from './ui/SectionHeader'
import {
  selectConveyancerAttentionRows,
  selectConveyancerRegistrations,
  selectConveyancerNeedsAttention,
  selectConveyancerPipeline,
  selectConveyancerPipelineRows,
  selectConveyancerRecentFeed,
  selectConveyancerStuckFiles,
  selectConveyancerSummary,
} from '../core/transactions/conveyancerSelectors'

const DASHBOARD_PANEL_CLASS = 'rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'
const DASHBOARD_SOFT_CARD_CLASS =
  'rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition duration-150 ease-out'
const FEATURED_UPDATES_PANEL_CLASS =
  'overflow-hidden rounded-[28px] border border-[#dde4ee] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.07)]'

const UPDATE_TONE_STYLES = {
  comment: 'border-[#dbe6f3] bg-[#f7fafc] text-[#53657a]',
  guarantees: 'border-[#d8f0de] bg-[#edfdf3] text-[#1e7a46]',
  signing: 'border-[#d9e7fb] bg-[#eff6ff] text-[#275ea5]',
  clearance: 'border-[#fde3b5] bg-[#fff8e8] text-[#9a5b0f]',
  lodgement: 'border-[#d9e7fb] bg-[#eff6ff] text-[#275ea5]',
  registered: 'border-[#d8f0de] bg-[#edfdf3] text-[#1e7a46]',
  general: 'border-[#dbe6f3] bg-[#f7fafc] text-[#53657a]',
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

function buildMatterReference(transactionId, fallback = 'Matter') {
  const value = String(transactionId || '').trim()
  if (!value) return fallback
  if (value.startsWith('preview-')) return fallback
  const normalized = value.replaceAll('-', '').slice(0, 8).toUpperCase()
  return normalized ? `TRX-${normalized}` : fallback
}

function getUpdateTone(label = '') {
  const normalized = String(label || '').toLowerCase()

  if (normalized.includes('comment')) return 'comment'
  if (normalized.includes('guarantee') || normalized.includes('bond')) return 'guarantees'
  if (normalized.includes('sign')) return 'signing'
  if (normalized.includes('clearance')) return 'clearance'
  if (normalized.includes('lodg')) return 'lodgement'
  if (normalized.includes('register')) return 'registered'
  return 'general'
}

function getUpdateToneClassName(label = '') {
  return UPDATE_TONE_STYLES[getUpdateTone(label)] || UPDATE_TONE_STYLES.general
}

function getUpdateProgressClassName(label = '') {
  const tone = getUpdateTone(label)

  if (tone === 'guarantees' || tone === 'registered') {
    return 'bg-[linear-gradient(90deg,#2f8f5a_0%,#6ac48a_100%)]'
  }
  if (tone === 'clearance') {
    return 'bg-[linear-gradient(90deg,#b7791f_0%,#f1c46a_100%)]'
  }
  if (tone === 'signing' || tone === 'lodgement') {
    return 'bg-[linear-gradient(90deg,#456b92_0%,#8fb0cf_100%)]'
  }

  return 'bg-[linear-gradient(90deg,#506b88_0%,#91a7bf_100%)]'
}

function formatMatterLocation(item) {
  if (!item?.unitNumber || item.unitNumber === '-' || String(item.unitNumber).toLowerCase() === 'private matter') {
    return item?.developmentName || item?.property || '-'
  }

  return `${item.developmentName || item.property} • Unit ${item.unitNumber}`
}

function formatPropertyUnitText(property, unitNumber) {
  const normalizedUnit = String(unitNumber || '').trim().toLowerCase()
  if (!unitNumber || unitNumber === '-' || normalizedUnit === 'private matter') {
    return property
  }
  return `${property} • Unit ${unitNumber}`
}

function getMatterTypeLabel(item) {
  const unitNumber = String(item?.unitNumber || '').trim().toLowerCase()
  const developmentName = String(item?.developmentName || item?.property || '').trim().toLowerCase()
  if (unitNumber === 'private matter' || developmentName === 'standalone matter') {
    return 'Private'
  }
  return 'Development'
}

function getUpdateBannerLabel(item) {
  const unitNumber = String(item?.unitNumber || '').trim()
  const developmentName = String(item?.developmentName || '').trim().toLowerCase()
  const property = String(item?.property || '').trim()
  const normalizedUnit = unitNumber.toLowerCase()

  if (normalizedUnit.includes('residential transfer') || normalizedUnit.includes('freehold')) {
    return 'Residential transfer'
  }

  if (unitNumber && unitNumber !== '-' && unitNumber.toLowerCase() !== 'private matter') {
    if (unitNumber.toLowerCase().startsWith('unit') || unitNumber.toLowerCase().startsWith('erf')) return unitNumber
    return developmentName === 'standalone matter' ? `House ${unitNumber}` : `Unit ${unitNumber}`
  }

  const baseProperty = property.split('•')[0].split(',')[0].trim()
  if (baseProperty.toLowerCase().includes('freehold')) {
    return 'Residential transfer'
  }
  return baseProperty || 'House file'
}

function getUpdateContextLabel(item) {
  const developmentName = String(item?.developmentName || '').trim()
  const property = String(item?.property || '').trim()

  if (developmentName.toLowerCase().includes('freehold')) {
    return 'Freehold'
  }

  if (developmentName && developmentName.toLowerCase() !== 'standalone matter') {
    return developmentName
  }

  const simplifiedProperty = property.split('•')[0].split(',')[0].trim()
  if (simplifiedProperty.toLowerCase().includes('freehold')) {
    return 'Freehold'
  }

  return simplifiedProperty || 'Private matter'
}

function ConveyancerDashboardPage({ rows = [] }) {
  const navigate = useNavigate()
  const [drawerState, setDrawerState] = useState({ type: '', key: '' })
  const summary = useMemo(() => selectConveyancerSummary(rows), [rows])
  const needsAttention = useMemo(() => selectConveyancerNeedsAttention(rows), [rows])
  const pipeline = useMemo(() => selectConveyancerPipeline(rows), [rows])
  const stuckFiles = useMemo(() => selectConveyancerStuckFiles(rows), [rows])
  const recentFeed = useMemo(() => selectConveyancerRecentFeed(rows), [rows])
  const registrations = useMemo(() => selectConveyancerRegistrations(rows), [rows])
  const activeIssue = useMemo(
    () => (drawerState.type === 'issue' ? needsAttention.find((item) => item.key === drawerState.key) || null : null),
    [drawerState, needsAttention],
  )
  const activePipelineStage = useMemo(
    () => (drawerState.type === 'pipeline' ? pipeline.find((item) => item.key === drawerState.key) || null : null),
    [drawerState, pipeline],
  )
  const activeIssueRows = useMemo(
    () => (drawerState.type === 'issue' && drawerState.key ? selectConveyancerAttentionRows(rows, drawerState.key) : []),
    [drawerState, rows],
  )
  const activePipelineRows = useMemo(
    () => (drawerState.type === 'pipeline' && drawerState.key ? selectConveyancerPipelineRows(rows, drawerState.key) : []),
    [drawerState, rows],
  )
  const pipelineMax = useMemo(() => Math.max(...pipeline.map((item) => item.count), 0), [pipeline])
  const topUpdates = useMemo(() => {
    return recentFeed.map((item) => ({
      ...item,
      reference: buildMatterReference(item.transactionId),
      progress:
        item.eventLabel === 'Registered'
          ? 100
          : item.eventLabel === 'Lodged at Deeds Office'
            ? 94
            : item.eventLabel === 'Ready for Lodgement'
              ? 84
              : item.eventLabel === 'Preparation in Progress'
              ? 62
              : item.eventLabel === 'Documents Pending'
                ? 36
                : 18,
    }))
  }, [recentFeed])
  const registrationsList = useMemo(() => registrations, [registrations])

  const summaryCards = [
    {
      label: 'Active Transactions',
      value: summary.activeTransactions,
      meta: 'Live matters currently in transfer',
      icon: FileText,
      cardClassName: 'bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]',
      iconClassName: 'bg-[#eaf2fb] text-[#4d6780]',
    },
    {
      label: 'Lodged',
      value: summary.lodged,
      meta: 'Files already lodged at deeds office',
      icon: Landmark,
      cardClassName: 'bg-[linear-gradient(180deg,#fbfefb_0%,#ffffff_100%)]',
      iconClassName: 'bg-[#dff1e5] text-[#2d8755]',
    },
    {
      label: 'Registered This Month',
      value: summary.registeredThisMonth,
      meta: 'Completed registrations flowing into closure',
      icon: FileCheck2,
      cardClassName: 'bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]',
      iconClassName: 'bg-[#eaf2fb] text-[#4d6780]',
    },
    {
      label: 'On Hold / Blocked',
      value: summary.blocked,
      meta: 'Files needing intervention or follow-up',
      icon: ShieldAlert,
      cardClassName: 'bg-[linear-gradient(180deg,#fffaf6_0%,#ffffff_100%)]',
      iconClassName: 'bg-[#fee9d9] text-[#bf741d]',
    },
  ]
  const pipelineFilters = {
    instruction_received: {},
    fica_onboarding: { stage: 'awaiting_documents', missingDocs: 'missing' },
    drafting: { stage: 'awaiting_documents', search: 'prepare' },
    signing: { search: 'sign' },
    guarantees: { stage: 'awaiting_bond' },
    clearances: { stage: 'awaiting_clearance' },
    lodgement: { stage: 'lodged' },
    registration_preparation: { stage: 'ready_for_lodgement' },
    registered: { stage: 'registered' },
  }
  const activeDrawerTitle =
    activeIssue?.label || activePipelineStage?.label || (drawerState.type === 'registrations' ? 'Registrations This Month' : '')
  const activeDrawerCount =
    activeIssue?.count ??
    activePipelineStage?.count ??
    (drawerState.type === 'updates' ? topUpdates.length : drawerState.type === 'registrations' ? registrationsList.length : 0)
  const activeDrawerRows = drawerState.type === 'issue' ? activeIssueRows : activePipelineRows
  const activeDrawerDescription =
    drawerState.type === 'issue'
      ? `${activeDrawerCount} files currently match this issue.`
      : drawerState.type === 'pipeline'
        ? `${activeDrawerCount} files are currently sitting in this stage.`
        : drawerState.type === 'registrations'
          ? `${activeDrawerCount} matters registered this month and ready for close-out or follow-through.`
          : 'Recent file movement and commentary across active matters.'
  const activeDrawerFilter =
    drawerState.type === 'issue' ? activeIssue?.filter || {} : drawerState.type === 'pipeline' ? pipelineFilters[drawerState.key] || {} : {}

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

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => {
          const filter =
            item.label === 'Lodged'
              ? { stage: 'lodged' }
              : item.label === 'On Hold / Blocked'
                ? { risk: 'blocked', missingDocs: 'missing' }
                : item.label === 'Registered This Month'
                  ? { stage: 'registered' }
                  : { stage: 'all' }

          return (
            <button
              key={item.label}
              type="button"
              className={`conveyancer-kpi-card overflow-hidden rounded-[30px] border border-[#dbe5ef] px-6 py-6 text-left shadow-[0_14px_30px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:-translate-y-[1px] hover:border-[#ccd6e3] hover:shadow-[0_18px_34px_rgba(15,23,42,0.08)] ${item.cardClassName}`}
              onClick={() => navigateToTransactions(filter)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="block max-w-[12ch] text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8ca2]">
                    {item.label}
                  </span>
                  <strong className="mt-5 block text-[3.1rem] font-semibold leading-none tracking-[-0.06em] text-[#142132]">
                    {item.value}
                  </strong>
                </div>
                <span className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] ${item.iconClassName}`}>
                  <item.icon size={28} strokeWidth={2.1} />
                </span>
              </div>
              <p className="mt-6 max-w-[18ch] text-[0.98rem] leading-8 text-[#607387]">{item.meta}</p>
            </button>
          )
        })}
      </section>

      <section className={FEATURED_UPDATES_PANEL_CLASS}>
        <div className="mb-5 flex flex-col gap-4 border-b border-[#e8eef5] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-[#d9e4ef] bg-[#f8fbff] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#6f86a0]">
              Attorney dashboard
            </span>
            <h3 className="mt-3 text-[1.45rem] font-semibold tracking-[-0.035em] text-[#142132]">New Comments & Updates</h3>
            <p className="mt-2 text-[1rem] leading-7 text-[#5d7188]">
              Recent file movement and commentary that may need immediate follow-up.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[18px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
              <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Live matters</span>
              <strong className="mt-1 block text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{topUpdates.length}</strong>
            </div>
            <Button variant="ghost" className="bg-[#f8fbff] hover:bg-white" onClick={() => setDrawerState({ type: 'updates', key: 'all' })}>
              View all
            </Button>
          </div>
        </div>

        <div className="bridge-updates-scroll -mx-2 overflow-x-auto overflow-y-hidden px-2 pb-3">
          <div className="flex min-w-max gap-4 pr-2">
            {topUpdates.map((item) => (
              <article
                key={`update-card-${item.transactionId || item.unitId}-${item.updatedAt}`}
                className="group grid min-h-[258px] w-[320px] shrink-0 grid-rows-[auto_auto_auto_1fr_auto] overflow-hidden rounded-[22px] border border-[#dde4ee] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[#ccd6e3] hover:shadow-[0_18px_32px_rgba(15,23,42,0.08)]"
                onClick={() => openMatter(item)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[#8aa0b8]">
                      {item.reference || buildMatterReference(item.transactionId, 'Matter')}
                    </span>
                    <span className="mt-2 block text-[0.92rem] font-medium text-[#6e8298]">{formatRelativeTime(item.updatedAt)}</span>
                  </div>
                  <span
                    title={item.eventLabel}
                    className={`inline-flex max-w-[132px] shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-3 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${getUpdateToneClassName(item.eventLabel)}`}
                  >
                    {item.eventLabel}
                  </span>
                </div>

                <div className="grid gap-2.5 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="line-clamp-2 block min-h-[2.9rem] text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">
                      {item.buyerName}
                    </strong>
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[#d9e7fb] bg-[#f8fbff] px-3 py-1 text-[0.72rem] font-semibold text-[#617a94]">
                      {getMatterTypeLabel(item)}
                    </span>
                  </div>
                  <p className="line-clamp-1 min-h-[1.5rem] text-[0.92rem] leading-6 text-[#607387]">{formatMatterLocation(item)}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.78rem] font-semibold text-[#617a94]">
                    {Math.round(item.progress || 0)}% complete
                  </span>
                </div>

                <div className="mt-4 min-h-[78px] rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${getUpdateProgressClassName(item.eventLabel)}`} />
                    <p className="line-clamp-3 text-sm leading-6 text-[#5f7287]">{item.description}</p>
                  </div>
                </div>

                <div className="mt-3 border-t border-[#edf2f7] pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[0.8rem] font-medium text-[#7b8ca2]">Progress</span>
                    <span className="text-[0.82rem] font-semibold text-[#516579]">{Math.round(item.progress || 0)}%</span>
                  </div>
                  <div className="mt-3 h-2.5 rounded-full bg-[#e9f0f6]" aria-hidden>
                    <div
                      className={`h-full rounded-full ${getUpdateProgressClassName(item.eventLabel)}`}
                      style={{ width: `${Math.max(item.progress || 0, 10)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[0.72rem] font-medium text-[#8ba0b8]">Updated {formatRelativeTime(item.updatedAt)}</span>
                    <span className="inline-flex items-center text-sm font-semibold text-[#35546c] transition duration-150 ease-out group-hover:text-[#2b4356]">
                      Open matter
                    </span>
                  </div>
                </div>
              </article>
            ))}
            {!topUpdates.length ? (
              <div className="flex w-full min-w-0 items-center rounded-[22px] border border-dashed border-[#d8e1ec] bg-[#fbfdff] px-6 py-10 text-center text-[#607387]">
                <div className="mx-auto max-w-md">
                  <strong className="block text-[1rem] font-semibold text-[#142132]">No live updates yet</strong>
                  <p className="mt-2 text-sm leading-6">
                    New comments, signing updates, and registration activity will appear here once your workspace starts moving files.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <article className={DASHBOARD_PANEL_CLASS}>
          <SectionHeader title="Needs Attention" copy="Outstanding issues that are slowing files down right now." />

          <div className="mt-6 grid gap-3">
            {needsAttention.map((item) => (
              <button
                type="button"
                key={item.key}
                className="flex items-center justify-between gap-4 rounded-[18px] border border-[#dde4ee] bg-[#fbfcfe] px-4 py-4 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-white"
                onClick={() => setDrawerState({ type: 'issue', key: item.key })}
              >
                <div className="grid gap-1">
                  <small className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Issue</small>
                  <strong className="text-[0.98rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.label}</strong>
                  <span className="text-sm text-[#64748b]">Open affected files</span>
                </div>
                <em className="inline-flex min-w-[44px] items-center justify-center rounded-full border border-[#f3d7a8] bg-[#fff8ed] px-3 py-1 text-sm font-semibold not-italic text-[#9a5b0f]">
                  {item.count}
                </em>
              </button>
            ))}
          </div>
        </article>

        <article className={DASHBOARD_PANEL_CLASS}>
          <SectionHeader title="Transaction Pipeline" copy="Where active files are currently sitting across the conveyancing process." />

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {pipeline.map((item, index) => (
              <button
                type="button"
                key={item.key}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-4 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-white"
                onClick={() => setDrawerState({ type: 'pipeline', key: item.key })}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#dde4ee] bg-white">
                  <small className="text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{String(index + 1).padStart(2, '0')}</small>
                </div>
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="text-[0.98rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.label}</strong>
                    <em className="text-base font-semibold not-italic text-[#35546c]">{item.count}</em>
                  </div>
                  <span className="mt-2 block text-sm text-[#64748b]">Open matching files</span>
                  <div className="mt-4 h-2 rounded-full bg-[#edf2f7]" aria-hidden>
                    <i
                      className="block h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#6f90ab_100%)]"
                      style={{ width: `${pipelineMax > 0 ? Math.max((item.count / pipelineMax) * 100, item.count ? 12 : 0) : 0}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </article>
      </section>

      <DataTable
        title="Stuck or Aged Files"
        copy="Files that are blocked, stale, or taking too long to move."
        className="ui-table-card"
        actions={
          <Button variant="ghost" onClick={() => navigate('/transactions')}>
            View all
          </Button>
        }
      >
        <DataTableInner className="min-w-[980px]">
            <thead>
              <tr>
                <th>File / Transaction</th>
                <th>Property / Unit</th>
                <th>Buyer / Seller</th>
                <th>Current Stage</th>
                <th>Days Open</th>
                <th>Last Activity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stuckFiles.map((item) => (
                <tr
                  key={item.transactionId || item.unitId}
                  className="ui-data-row-clickable"
                  onClick={() => {
                    openMatter(item)
                  }}
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
                    <div className="grid gap-1">
                      <strong>{item.reference}</strong>
                      <small>{item.transactionId ? buildMatterReference(item.transactionId, item.reference) : 'Matter file'}</small>
                    </div>
                  </td>
                  <td>
                    <div className="grid gap-1">
                      <strong>{formatPropertyUnitText(item.property, item.unitNumber)}</strong>
                      <small>{item.developmentName || 'Standalone matter'}</small>
                    </div>
                  </td>
                  <td>
                    <div className="grid gap-1">
                      <strong>{item.buyerName}</strong>
                      <small>{item.clientName || 'Client file'}</small>
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center rounded-full border border-[#d9e7fb] bg-[#eff6ff] px-3 py-1 text-[0.74rem] font-semibold text-[#275ea5]">
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
                    <div className="grid gap-1">
                      <strong>{formatRelativeTime(item.lastActivityAt)}</strong>
                      <small>{formatDateTime(item.lastActivityAt)}</small>
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center rounded-full border border-[#f3d7a8] bg-[#fff8ed] px-3 py-1 text-[0.74rem] font-semibold text-[#9a5b0f]">
                      {item.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
              {!stuckFiles.length ? (
                <tr>
                  <td colSpan={7}>No aged or blocked files are currently flagged.</td>
                </tr>
              ) : null}
            </tbody>
        </DataTableInner>
      </DataTable>

      <section className={DASHBOARD_PANEL_CLASS}>
        <SectionHeader
          title="Registrations This Month"
          copy="Completed registrations that need close-out, handover, or post-registration follow-through."
          actions={
            <Button variant="ghost" onClick={() => setDrawerState({ type: 'registrations', key: 'all' })}>
              View all
            </Button>
          }
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {registrationsList.map((item) => (
            <button
              type="button"
              className={`${DASHBOARD_SOFT_CARD_CLASS} text-left hover:-translate-y-[1px] hover:border-[#ccd6e3] hover:bg-white hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]`}
              key={`${item.transactionId || item.unitId}-${item.registeredAt}`}
              onClick={() => {
                openMatter(item)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openMatter(item)
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <strong className="text-[0.95rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.reference}</strong>
                <small className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{formatDateTime(item.registeredAt)}</small>
              </div>
              <div className="mt-4 grid gap-2">
                <h4 className="text-[1.02rem] font-semibold tracking-[-0.025em] text-[#142132]">{item.buyerName}</h4>
                <p className="text-sm leading-6 text-[#5f7287]">{formatMatterLocation(item)}</p>
                <small className="text-sm leading-6 text-[#6d7f93]">{item.statusNote}</small>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
                <span className="inline-flex items-center rounded-full border border-[#d8f0de] bg-[#edfdf3] px-3 py-1 text-[0.74rem] font-semibold text-[#1e7a46]">
                  Registered
                </span>
                <span className="text-sm font-semibold text-[#35546c]">Open matter</span>
              </div>
            </button>
          ))}
          {!registrationsList.length ? (
            <div className="md:col-span-2 xl:col-span-3 rounded-[20px] border border-dashed border-[#d8e1ec] bg-[#fbfdff] px-6 py-10 text-center text-[#607387]">
              <strong className="block text-[1rem] font-semibold text-[#142132]">No registrations recorded yet</strong>
              <p className="mt-2 text-sm leading-6">
                Completed transfers will appear here once matters have moved through lodgement and registration.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {activeDrawerTitle || drawerState.type === 'updates' ? (
        <Drawer
          open
          onClose={() => setDrawerState({ type: '', key: '' })}
          title={activeDrawerTitle || 'New Comments & Updates'}
          subtitle={activeDrawerDescription}
          footer={
            drawerState.type === 'updates' ? (
              <Button variant="ghost" onClick={() => navigate('/transactions')}>
                Open transactions
              </Button>
            ) : drawerState.type === 'registrations' ? (
              <Button variant="ghost" onClick={() => navigateToTransactions({ stage: 'registered' })}>
                Open registered matters
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => navigateToTransactions(activeDrawerFilter)}>
                Open filtered transactions
              </Button>
            )
          }
        >
          {drawerState.type === 'updates' ? (
            <div className="grid gap-4">
              {topUpdates.map((item) => (
                <button
                  type="button"
                  key={`drawer-update-${item.transactionId || item.unitId}-${item.updatedAt}`}
                  className={`${DASHBOARD_SOFT_CARD_CLASS} text-left hover:-translate-y-[1px] hover:border-[#ccd6e3] hover:bg-white hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]`}
                  onClick={() => {
                    openMatter(item)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <small className="text-sm text-[#7b8ca2]">{formatRelativeTime(item.updatedAt)}</small>
                    <em
                      title={item.eventLabel}
                      className={`inline-flex max-w-[132px] items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold not-italic ${getUpdateToneClassName(item.eventLabel)}`}
                    >
                      {item.eventLabel}
                    </em>
                  </div>
                  <strong className="mt-4 block text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.buyerName}</strong>
                  <span className="mt-1 block text-sm leading-6 text-[#516579]">{formatMatterLocation(item)}</span>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
                    <small>{item.reference || buildMatterReference(item.transactionId, 'Matter')}</small>
                    <small>{Math.round(item.progress || 0)}% complete</small>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-[#5f7287]">{item.description}</p>
                  <div className="mt-5 h-2 rounded-full bg-[#edf2f7]" aria-hidden>
                    <i
                      className="block h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#6f90ab_100%)]"
                      style={{ width: `${Math.max(item.progress || 0, 10)}%` }}
                    />
                  </div>
                </button>
              ))}
              {!topUpdates.length ? (
                <div className="rounded-[20px] border border-dashed border-[#d8e1ec] bg-[#fbfdff] px-6 py-10 text-center text-[#607387]">
                  <strong className="block text-[1rem] font-semibold text-[#142132]">No live updates yet</strong>
                  <p className="mt-2 text-sm leading-6">This drawer will populate as soon as files in your workspace start changing.</p>
                </div>
              ) : null}
            </div>
          ) : drawerState.type === 'registrations' ? (
            <div className="grid gap-4">
              {registrationsList.map((item) => (
                <button
                  type="button"
                  className={`${DASHBOARD_SOFT_CARD_CLASS} text-left hover:-translate-y-[1px] hover:border-[#ccd6e3] hover:bg-white hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]`}
                  key={`drawer-registration-${item.transactionId || item.unitId}-${item.registeredAt}`}
                  onClick={() => {
                    openMatter(item)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong className="text-[0.95rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.reference}</strong>
                    <small className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{formatDateTime(item.registeredAt)}</small>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <h4 className="text-[1.02rem] font-semibold tracking-[-0.025em] text-[#142132]">{item.buyerName}</h4>
                    <p className="text-sm leading-6 text-[#5f7287]">{formatMatterLocation(item)}</p>
                    <small className="text-sm leading-6 text-[#6d7f93]">{item.statusNote}</small>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
                    <span className="inline-flex items-center rounded-full border border-[#d8f0de] bg-[#edfdf3] px-3 py-1 text-[0.74rem] font-semibold text-[#1e7a46]">
                      Registered
                    </span>
                    <span className="text-sm font-semibold text-[#35546c]">Open matter</span>
                  </div>
                </button>
              ))}
              {!registrationsList.length ? (
                <div className="rounded-[20px] border border-dashed border-[#d8e1ec] bg-[#fbfdff] px-6 py-10 text-center text-[#607387]">
                  <strong className="block text-[1rem] font-semibold text-[#142132]">No registrations yet</strong>
                  <p className="mt-2 text-sm leading-6">Registered matters will appear here after the first completed transfer reaches close-out.</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[18px] border border-[#e6edf5] bg-white">
              <DataTableInner className="min-w-[840px]">
                <thead>
                  <tr>
                    <th>File / Transaction</th>
                    <th>Property / Unit</th>
                    <th>Client</th>
                    <th>Stage</th>
                    <th>Last Activity</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {activeDrawerRows.map((item) => (
                    <tr key={`${item.transactionId || item.unitId}-${item.reference}`}>
                      <td>
                        <div className="grid gap-1">
                          <strong>{item.reference}</strong>
                          <small>{item.transactionId ? buildMatterReference(item.transactionId, item.reference) : 'Matter file'}</small>
                        </div>
                      </td>
                      <td>
                        <div className="grid gap-1">
                          <strong>{formatPropertyUnitText(item.property, item.unitNumber)}</strong>
                          <small>{item.developmentName || 'Standalone matter'}</small>
                        </div>
                      </td>
                      <td>
                        <div className="grid gap-1">
                          <strong>{item.clientName}</strong>
                          <small>{item.buyerName || 'Client linked matter'}</small>
                        </div>
                      </td>
                      <td>
                        <span className="inline-flex items-center rounded-full border border-[#d9e7fb] bg-[#eff6ff] px-3 py-1 text-[0.74rem] font-semibold text-[#275ea5]">
                          {item.stage}
                        </span>
                      </td>
                      <td>
                        <div className="grid gap-1">
                          <strong>{formatRelativeTime(item.lastActivityAt)}</strong>
                          <small>{formatDateTime(item.lastActivityAt)}</small>
                        </div>
                      </td>
                      <td>
                        <Button variant="ghost" onClick={() => openMatter(item)}>
                          Open transaction
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!activeDrawerRows.length ? (
                    <tr>
                      <td colSpan={6}>No files currently match this issue.</td>
                    </tr>
                  ) : null}
                </tbody>
              </DataTableInner>
            </div>
          )}
        </Drawer>
      ) : null}
    </div>
  )
}

export default ConveyancerDashboardPage
