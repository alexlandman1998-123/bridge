import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Hourglass,
  ShieldAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import SectionHeader from './ui/SectionHeader'
import {
  selectConveyancerLiveActivity,
  selectConveyancerNeedsAttentionDetailed,
  selectConveyancerPipelineDetailed,
  selectConveyancerPriorityActions,
  selectConveyancerRegistrations,
  selectConveyancerRiskRows,
  selectConveyancerSummary,
  selectConveyancerWorkQueue,
} from '../core/transactions/conveyancerSelectors'

const PANEL_CLASS = 'ui-panel ui-panel-body'
const SOFT_CARD_CLASS =
  'rounded-surface border border-borderDefault bg-surface px-4 py-4 shadow-surface transition duration-150 ease-out hover:-translate-y-px hover:border-borderStrong hover:shadow-floating'

const PRIORITY_META = {
  needs_attention: {
    icon: ShieldAlert,
    badgeClassName: 'border border-danger bg-dangerSoft text-danger',
  },
  awaiting_client_docs: {
    icon: FileText,
    badgeClassName: 'border border-warning bg-warningSoft text-warning',
  },
  stuck_over_7_days: {
    icon: Hourglass,
    badgeClassName: 'border border-warning bg-warningSoft text-warning',
  },
  ready_to_lodge: {
    icon: CheckCircle2,
    badgeClassName: 'border border-success bg-successSoft text-success',
  },
}

const ATTENTION_TONE_CLASS = {
  critical: 'border border-danger bg-dangerSoft text-danger',
  warning: 'border border-warning bg-warningSoft text-warning',
  risk: 'border border-warning bg-warningSoft text-warning',
}

const STAGE_PILL_CLASS = {
  registered: 'border border-success bg-successSoft text-success',
  lodged_at_deeds_office: 'border border-info bg-infoSoft text-info',
  ready_for_lodgement: 'border border-info bg-infoSoft text-info',
  preparation_in_progress: 'border border-primary bg-primarySoft text-primary',
}

const RISK_STATUS_CLASS = {
  Critical: 'border border-danger bg-dangerSoft text-danger',
  High: 'border border-warning bg-warningSoft text-warning',
  Watch: 'border border-info bg-infoSoft text-info',
}

const ACTIVITY_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'comments', label: 'Comments' },
  { key: 'documents', label: 'Documents' },
  { key: 'stage_changes', label: 'Stage Changes' },
]

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

function getRiskClassName(status) {
  return RISK_STATUS_CLASS[status] || 'border border-borderDefault bg-mutedBg text-textMuted'
}

function ConveyancerDashboardPage({ rows = [] }) {
  const navigate = useNavigate()
  const [activityFilter, setActivityFilter] = useState('all')

  const summary = useMemo(() => selectConveyancerSummary(rows), [rows])
  const priorities = useMemo(() => selectConveyancerPriorityActions(rows), [rows])
  const workQueue = useMemo(() => selectConveyancerWorkQueue(rows, 8), [rows])
  const needsAttention = useMemo(() => selectConveyancerNeedsAttentionDetailed(rows, 2), [rows])
  const pipeline = useMemo(() => selectConveyancerPipelineDetailed(rows), [rows])
  const riskRows = useMemo(() => selectConveyancerRiskRows(rows, 10), [rows])
  const liveActivity = useMemo(() => selectConveyancerLiveActivity(rows, 16), [rows])
  const registrations = useMemo(() => selectConveyancerRegistrations(rows, 6), [rows])

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

  return (
    <div className="space-y-6">
      <section className={PANEL_CLASS}>
        <SectionHeader
          title="Today's Priorities"
          copy="Action-focused file buckets for immediate attention and next legal movement."
          actions={
            <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
              {summary.activeTransactions} active matters
            </span>
          }
        />

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {priorities.map((item) => {
            const meta = PRIORITY_META[item.key] || PRIORITY_META.needs_attention
            const Icon = meta.icon
            return (
              <button
                key={item.key}
                type="button"
                className={`${SOFT_CARD_CLASS} text-left`}
                onClick={() => navigateToTransactions(item.filter)}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-control ${meta.badgeClassName}`}
                    aria-hidden
                  >
                    <Icon size={18} />
                  </span>
                  <span className="text-section-title font-semibold text-textStrong">{item.count}</span>
                </div>
                <strong className="mt-4 block text-body font-semibold text-textStrong">{item.label}</strong>
                <p className="mt-1 text-secondary text-textMuted">{item.helperText}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-secondary font-semibold text-primary">
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
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/transactions')}>
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
                className={`${SOFT_CARD_CLASS} grid gap-3 text-left lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center`}
                onClick={() => openMatter(item)}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-body font-semibold text-textStrong">{formatPropertyUnitText(item.property, item.unitNumber)}</strong>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-helper font-semibold ${getStageClassName(item.stageKey)}`}>
                      {item.stage}
                    </span>
                  </div>
                  <p className="mt-1 text-secondary text-textStrong">{item.reason}</p>
                  <small className="mt-2 block text-helper text-textMuted">
                    {item.buyerName} • Updated {formatRelativeTime(item.lastActivityAt)}
                  </small>
                </div>

                <span className="inline-flex items-center gap-1 text-secondary font-semibold text-primary">
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
        <DataTableInner className="min-w-[1100px]">
          <thead>
            <tr>
              <th>File / Transaction</th>
              <th>Property / Unit</th>
              <th>Buyer / Seller</th>
              <th>Current Stage</th>
              <th>Days Open</th>
              <th>Last Activity</th>
              <th>Risk Status</th>
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
                  <div className="grid gap-1">
                    <strong>{item.reference}</strong>
                    <small>{item.transactionId ? item.reference : 'Matter file'}</small>
                  </div>
                </td>
                <td>
                  <strong>{formatPropertyUnitText(item.property, item.unitNumber)}</strong>
                </td>
                <td>
                  <strong>{item.buyerName}</strong>
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
                  <div className="grid gap-1">
                    <strong>{formatRelativeTime(item.lastActivityAt)}</strong>
                    <small>{formatDateTime(item.lastActivityAt)}</small>
                  </div>
                </td>
                <td>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-helper font-semibold ${getRiskClassName(item.riskStatus)}`}>
                    {item.riskStatus}
                  </span>
                </td>
                <td>
                  <small className="text-helper text-textStrong">{item.nextAction}</small>
                </td>
              </tr>
            ))}
            {!riskRows.length ? (
              <tr>
                <td colSpan={8}>No aged or blocked files are currently flagged.</td>
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
