import {
  ArrowUpRight,
  Building2,
  Camera,
  ChevronRight,
  CheckCircle2,
  CircleCheck,
  Clock3,
  FileText,
  ListChecks,
  Sparkles,
  Target,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { MobileCard, MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates'
import { getMobileDashboardSnapshot, getMobileDashboardSnapshotAsync } from '../../services/mobileDashboardService'
import { trackMobileMetric } from '../../services/observability/monitoring'

const CARD_TONES = {
  green: 'bg-[#e8f6ef] text-[#1f7a5a]',
  amber: 'bg-[#fff6e5] text-[#b7791f]',
  blue: 'bg-[#e8f0f6] text-[#274c69]',
  navy: 'bg-[#10243a] text-white',
}

const ROLE_WORK_PATH = {
  agent: '/mobile/transactions',
  principal: '/mobile/transactions',
  attorney: '/mobile/matters',
  bond_originator: '/mobile/applications',
  commercial: '/mobile/deals',
}

function formatMetric(value) {
  if (typeof value === 'number') return new Intl.NumberFormat('en-ZA').format(value)
  return String(value ?? '0')
}

function getPriority(snapshot) {
  const task = snapshot?.tasks?.[0]
  if (task) {
    return {
      title: task.title,
      body: task.related || 'Task due today',
      meta: task.dueTime || task.due || 'Today',
      to: '/mobile/tasks',
    }
  }
  const work = snapshot?.activeWork?.[0]
  if (work) {
    return {
      title: work.status || work.stage || 'Review next action',
      body: work.title,
      meta: work.meta || work.stage || 'In progress',
      to: work.to || '/mobile/transactions',
    }
  }
  const activity = snapshot?.recentActivity?.[0]
  if (activity) {
    return {
      title: activity.title,
      body: activity.body,
      meta: activity.time,
      to: '/mobile/activity',
    }
  }
  return null
}

function getSummaryCard(snapshot, key) {
  return (snapshot?.summaryCards || []).find((card) => card.key === key) || null
}

function getSummaryValue(snapshot, key, fallback = '0') {
  const value = getSummaryCard(snapshot, key)?.value
  return value === undefined || value === null || value === '' ? fallback : formatMetric(value)
}

function getSummaryNumber(snapshot, key) {
  const value = getSummaryCard(snapshot, key)?.value
  if (typeof value === 'number') return value
  const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function getHealthScore(snapshot) {
  const taskPressure = (snapshot?.tasks || []).length * 6
  const staleWork = (snapshot?.activeWork || []).filter((item) => Number(item.progress || 0) < 35).length * 3
  return Math.max(72, Math.min(96, 92 - taskPressure - staleWork))
}

function getCommandAction(snapshot, priority) {
  if (priority) {
    return {
      eyebrow: 'Next best action',
      title: priority.title,
      body: priority.body,
      meta: priority.meta,
      to: priority.to,
    }
  }

  if (snapshot?.category === 'principal') {
    return {
      eyebrow: 'Next best action',
      title: 'Review lead flow',
      body: 'Mandates clear. No urgent blockers.',
      meta: 'Today',
      to: '/mobile/leads',
    }
  }

  return {
    eyebrow: 'Next best action',
    title: 'Keep today moving',
    body: 'Capture the next field update.',
    meta: 'Ready',
    to: '/mobile/create',
  }
}

function KpiCard({ card }) {
  const Icon = card.key === 'tasks' ? ListChecks : card.key === 'pipeline' ? Sparkles : card.key === 'listings' ? Building2 : CircleCheck
  const taskCount = card.key === 'tasks' ? Number(card.value || 0) : 0
  return (
    <div className="min-h-[88px] rounded-[16px] border border-[#dfe7ef] bg-white px-3 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-[11px] ${CARD_TONES[card.tone] || CARD_TONES.blue}`}>
          <Icon className="h-[17px] w-[17px]" />
        </span>
        {card.key === 'tasks' ? (
          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${taskCount > 0 ? 'bg-[#fff1e7] text-[#b45309]' : 'bg-[#edf8f2] text-[#1f7a5a]'}`}>
            {taskCount > 0 ? 'Due' : 'Clear'}
          </span>
        ) : null}
      </div>
      <strong className="mt-3 block truncate text-[22px] font-bold leading-none text-[#10243a]">{formatMetric(card.value)}</strong>
      <p className="mt-1.5 line-clamp-2 text-[10px] font-semibold uppercase leading-4 text-[#60758d]">{card.label}</p>
    </div>
  )
}

function SectionHeader({ title, actionTo = '', actionLabel = 'View All' }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[18px] font-semibold text-[#10243a]">{title}</h2>
      {actionTo ? <Link to={actionTo} className="text-[13px] font-semibold text-[#1f7a5a]">{actionLabel}</Link> : null}
    </div>
  )
}

function AgencyCommandCard({ snapshot, priority, onOpen }) {
  const action = getCommandAction(snapshot, priority)
  const pipelineValue = getSummaryValue(snapshot, 'pipeline', 'R0')
  const activeTransactions = getSummaryValue(snapshot, 'active', '0')
  const mandates = getSummaryValue(snapshot, 'listings', '0')
  const atRisk = Math.max((snapshot?.tasks || []).length, getSummaryNumber(snapshot, 'tasks'))
  const healthScore = getHealthScore(snapshot)

  return (
    <section className="overflow-hidden rounded-[22px] bg-[#10243a] p-4 text-white shadow-[0_16px_36px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">Agency Command</p>
          <h1 className="mt-2 text-[28px] font-bold leading-[1.05] text-white">{pipelineValue} pipeline</h1>
          <p className="mt-2 text-[14px] leading-5 text-[#d7e4ed]">
            {activeTransactions} active transactions · {mandates} mandates · {atRisk} at risk
          </p>
        </div>
        <div className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center rounded-full bg-[#a8e7be] text-[#10243a] ring-8 ring-white/5">
          <span className="text-[23px] font-bold leading-none">{healthScore}</span>
          <span className="mt-1 text-[8px] font-bold uppercase">Health</span>
        </div>
      </div>

      <button
        type="button"
        className="mt-4 flex w-full items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.08] p-3 text-left transition active:bg-white/[0.13]"
        onClick={() => onOpen(action.to)}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-white text-[#1f7a5a]">
          <Target className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase text-[#9fe0bd]">{action.eyebrow}</span>
          <span className="mt-1 block line-clamp-2 text-[14px] font-semibold leading-5 text-white">{action.title}</span>
          <span className="mt-0.5 block line-clamp-2 text-[12px] leading-4 text-[#c4d4df]">{action.body}</span>
        </span>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-[#d7e4ed]">{action.meta}</span>
      </button>
    </section>
  )
}

function CommandActions({ actions = [], onAction }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {actions.slice(0, 4).map((action) => (
        <button
          key={action.key}
          type="button"
          className="flex min-h-[50px] items-center justify-center gap-2 rounded-[16px] border border-[#dfe7ef] bg-white px-3 text-[13px] font-semibold text-[#10243a] shadow-[0_8px_20px_rgba(15,23,42,0.04)] active:bg-[#f8fafc]"
          onClick={() => onAction(action)}
        >
          <ArrowUpRight className="h-4 w-4 text-[#1f7a5a]" />
          <span className="truncate">{action.label}</span>
        </button>
      ))}
    </div>
  )
}

function TodayQueue({ snapshot, priority, onOpen }) {
  const rows = [
    {
      key: 'priority',
      icon: Target,
      title: getCommandAction(snapshot, priority).title,
      body: getCommandAction(snapshot, priority).body,
      status: getCommandAction(snapshot, priority).meta,
      to: getCommandAction(snapshot, priority).to,
    },
    {
      key: 'documents',
      icon: FileText,
      title: 'Document queue clear',
      body: 'Scan and sync from the field when a mandate or OTP lands.',
      status: 'Clear',
      to: '/mobile/documents',
    },
    {
      key: 'capture',
      icon: Camera,
      title: 'Offline capture ready',
      body: 'Lead notes, photos, and documents can be saved on mobile.',
      status: 'Ready',
      to: '/mobile/create',
    },
  ]

  if (!(snapshot?.recentActivity || []).length) {
    rows.push({
      key: 'movement',
      icon: Clock3,
      title: 'No recent movement',
      body: 'The agency is clean right now. New activity will surface here.',
      status: 'Stable',
      to: '/mobile/activity',
    })
  }

  return (
    <section>
      <SectionHeader title="Today" />
      <div className="overflow-hidden rounded-[20px] border border-[#dfe7ef] bg-white shadow-[0_10px_26px_rgba(15,23,42,0.045)]">
        {rows.slice(0, 4).map((row, index) => {
          const Icon = row.icon
          return (
            <button
              key={row.key}
              type="button"
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${index ? 'border-t border-[#edf2f6]' : ''}`}
              onClick={() => onOpen(row.to)}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#edf8f2] text-[#1f7a5a]">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[#10243a]">{row.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-[#60758d]">{row.body}</span>
              </span>
              <span className="shrink-0 rounded-full bg-[#f2f6f9] px-2.5 py-1 text-[11px] font-semibold text-[#60758d]">{row.status}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function WorkThumbnail({ item }) {
  const initial = String(item.title || 'A').slice(0, 1).toUpperCase()
  return (
    <span className="relative flex h-[86px] w-[86px] shrink-0 overflow-hidden rounded-[22px] bg-[#dce8f2]">
      <span className="absolute inset-0 bg-[linear-gradient(135deg,#10243a_0%,#1f7a5a_52%,#e8f6ef_100%)]" />
      <span className="absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/88 text-sm font-bold text-[#10243a]">
        {initial}
      </span>
    </span>
  )
}

function ActiveWorkCard({ item, onOpen }) {
  return (
    <button
      type="button"
      className="flex w-full gap-4 rounded-[28px] border border-white/80 bg-white p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.07)]"
      onClick={() => onOpen(item)}
    >
      <WorkThumbnail item={item} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-semibold text-[#10243a]">{item.title}</span>
            <span className="mt-1 block truncate text-[13px] text-[#60758d]">{item.eyebrow}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-[#94a3b8]" />
        </span>
        <span className="mt-3 flex items-center justify-between gap-3">
          <span className="rounded-full bg-[#e8f6ef] px-3 py-1 text-[12px] font-semibold text-[#1f7a5a]">{item.stage}</span>
          <span className="text-[12px] font-semibold text-[#60758d]">{item.progress || 0}%</span>
        </span>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[#edf3f8]">
          <span className="block h-full rounded-full bg-[#1f7a5a]" style={{ width: `${Math.max(Math.min(item.progress || 0, 100), 4)}%` }} />
        </span>
        <span className="mt-3 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[13px] font-semibold text-[#10243a]">{item.status}</span>
          {item.value ? <span className="shrink-0 text-[13px] font-semibold text-[#10243a]">{item.value}</span> : null}
        </span>
      </span>
    </button>
  )
}

function ActiveTransactionsRail({
  items = [],
  title = 'Active Transactions',
  actionTo = '',
  emptyTitle = 'No active transactions yet.',
  emptyBody = 'Your active transactions will appear here once work is in motion.',
  emptyActionLabel = 'Create Transaction',
  onOpen,
  onEmptyAction,
}) {
  return (
    <section>
      <SectionHeader title={title} actionTo={actionTo} />
      {items.length ? (
        <div className="-mx-5 overflow-x-auto px-5 pb-2 [-webkit-overflow-scrolling:touch]">
          <div className="flex snap-x gap-3">
            {items.map((item) => (
              <div key={item.id} className="w-[82vw] min-w-[280px] max-w-[330px] shrink-0 snap-start">
                <ActiveWorkCard item={item} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyCompact title={emptyTitle} body={emptyBody} actionLabel={emptyActionLabel} onAction={onEmptyAction} />
      )}
    </section>
  )
}

function TaskRow({ item, onOpen }) {
  return (
    <button type="button" className="flex w-full items-start gap-3 rounded-[24px] border border-white/80 bg-white p-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)]" onClick={() => onOpen(item)}>
      <span className="mt-1 h-5 w-5 shrink-0 rounded-full border-2 border-[#b9c5d2] bg-white" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[#10243a]">{item.title}</span>
        <span className="mt-1 block truncate text-[13px] text-[#60758d]">{item.related}</span>
      </span>
      <span className="shrink-0 text-[12px] font-semibold text-[#b42318]">{item.dueTime || item.due || 'Today'}</span>
    </button>
  )
}

function ActivityRow({ item, last = false }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex flex-col items-center">
        <span className="mt-1 h-3 w-3 rounded-full bg-[#1f7a5a]" />
        {!last ? <span className="mt-1 h-12 w-px bg-[#dfe7ef]" /> : null}
      </span>
      <div className="min-w-0 flex-1 pb-4">
        <p className="truncate text-[15px] font-semibold text-[#10243a]">{item.title}</p>
        <p className="mt-1 truncate text-[13px] text-[#60758d]">{item.body}</p>
      </div>
      <span className="shrink-0 text-[12px] font-semibold text-[#94a3b8]">{item.time}</span>
    </div>
  )
}

function EmptyCompact({ title, body, actionLabel, onAction }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#d7e0ea] bg-white px-4 py-5 text-left">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#edf8f2] text-[#1f7a5a]">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[#10243a]">{title}</span>
          <span className="mt-1 block text-[13px] leading-5 text-[#60758d]">{body}</span>
          {actionLabel && onAction ? (
            <button
              type="button"
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[14px] bg-[#10243a] px-3 text-[13px] font-semibold text-white"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
        </span>
      </div>
    </div>
  )
}

export default function MobileHome() {
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const organisation = organisationContext?.organisation || null
  const organisationLoading = Boolean(organisationContext?.loading)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState(() => {
    try {
      return { loading: true, error: '', snapshot: getMobileDashboardSnapshot({ workspace }) }
    } catch (error) {
      return { loading: false, error: error?.message || "We couldn't load your dashboard.", snapshot: null }
    }
  })
  const showUnsupportedNotice = searchParams.get('mobileNotice') === 'unsupported'

  const load = useCallback(() => {
    if (organisationLoading) {
      setState((previous) => ({ ...previous, loading: true, error: '' }))
      return () => {}
    }

    let active = true
    setState((previous) => ({ ...previous, loading: !previous.snapshot, error: '' }))
    getMobileDashboardSnapshotAsync({ workspace, organisation })
      .then((snapshot) => {
        if (!active) return
        setState({ loading: false, error: '', snapshot })
      })
      .catch((error) => {
        if (!active) return
        try {
          setState({
            loading: false,
            error: '',
            snapshot: getMobileDashboardSnapshot({ workspace }),
          })
        } catch {
          setState({ loading: false, error: error?.message || "We couldn't load your dashboard.", snapshot: null })
        }
      })

    return () => {
      active = false
    }
  }, [organisation, organisationLoading, workspace])

  useEffect(() => {
    if (organisationLoading) return undefined

    let active = true
    Promise.resolve()
      .then(() => getMobileDashboardSnapshotAsync({ workspace, organisation }))
      .then((snapshot) => {
        if (!active) return
        setState({ loading: false, error: '', snapshot })
      })
      .catch((error) => {
        if (!active) return
        try {
          setState({
            loading: false,
            error: '',
            snapshot: getMobileDashboardSnapshot({ workspace }),
          })
        } catch {
          setState({ loading: false, error: error?.message || "We couldn't load your dashboard.", snapshot: null })
        }
      })

    return () => {
      active = false
    }
  }, [organisation, organisationLoading, workspace])

  useEffect(() => {
    if (!state.snapshot) return
    void trackMobileMetric('dashboard_opened', {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: '/mobile/home',
      metadata: {
        role: workspace.role || workspace.baseRole || '',
        module: workspace.workspaceType || '',
        dashboardType: state.snapshot.category,
      },
    })
  }, [state.snapshot, workspace])

  const snapshot = state.snapshot
  const workPath = useMemo(() => ROLE_WORK_PATH[snapshot?.category] || '/mobile/transactions', [snapshot?.category])
  const priority = useMemo(() => getPriority(snapshot), [snapshot])

  function handleActiveWorkOpen(item) {
    void trackMobileMetric('transaction_card_clicked', {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: '/mobile/home',
      metadata: { dashboardType: snapshot?.category || '', destinationRoute: item.to || workPath },
    })
    navigate(item.to || workPath)
  }

  function handleTaskOpen(item) {
    void trackMobileMetric('task_clicked', {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: '/mobile/home',
      metadata: { dashboardType: snapshot?.category || '', priority: item.priority || '' },
    })
  }

  function handlePriorityOpen(to = '') {
    if (!to) return
    void trackMobileMetric('priority_card_clicked', {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: '/mobile/home',
      metadata: { dashboardType: snapshot?.category || '', destinationRoute: to },
    })
    navigate(to)
  }

  function handleQuickAction(action) {
    void trackMobileMetric('quick_action_used', {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: '/mobile/home',
      metadata: { dashboardType: snapshot?.category || '', action: action.key, destinationRoute: action.to },
    })
    navigate(action.to)
  }

  if (state.loading) return <MobileLoadingState label="Loading mobile dashboard" />
  if (state.error) return <MobileErrorState title="We couldn't load your dashboard." body={state.error} onRetry={load} />

  return (
    <div className="space-y-5" data-mobile-home>
      {showUnsupportedNotice ? (
        <MobileCard>
          <h2 className="text-[17px] font-semibold text-[#10243a]">That page is not available on mobile yet.</h2>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">You can continue from your mobile workspace.</p>
        </MobileCard>
      ) : null}

      <section className="pt-1">
        <p className="mb-2 text-[13px] font-semibold text-[#60758d]">{snapshot.greeting}, {snapshot.displayName}</p>
        <AgencyCommandCard snapshot={snapshot} priority={priority} onOpen={handlePriorityOpen} />
      </section>

      <section className="grid grid-cols-2 gap-3">
        {snapshot.summaryCards.map((card) => <KpiCard key={card.key} card={card} />)}
      </section>

      <CommandActions actions={snapshot.quickActions} onAction={handleQuickAction} />

      <ActiveTransactionsRail
        items={snapshot.activeWork}
        title={snapshot.copy.workloadLabel || snapshot.copy.workTitle || 'Active Transactions'}
        actionTo={workPath}
        emptyTitle={snapshot.copy.workEmptyTitle}
        emptyBody={snapshot.copy.workEmptyBody}
        emptyActionLabel={snapshot.quickActions.find((action) => action.key === 'create_transaction')?.label || snapshot.quickActions[0]?.label || ''}
        onOpen={handleActiveWorkOpen}
        onEmptyAction={() => {
          const createTransaction = snapshot.quickActions.find((action) => action.key === 'create_transaction') || snapshot.quickActions[0]
          if (createTransaction) handleQuickAction(createTransaction)
        }}
      />

      <TodayQueue snapshot={snapshot} priority={priority} onOpen={handlePriorityOpen} />

      {snapshot.tasks.length ? (
        <section>
          <SectionHeader title="Tasks Due Today" actionTo="/mobile/tasks" />
          <div className="space-y-3">
            {snapshot.tasks.slice(0, 3).map((item) => <TaskRow key={item.id} item={item} onOpen={handleTaskOpen} />)}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Recent Activity" actionTo="/mobile/activity" />
        {snapshot.recentActivity.length ? (
          <MobileCard className="pb-1">
            {snapshot.recentActivity.slice(0, 5).map((item, index, items) => <ActivityRow key={item.id} item={item} last={index === items.length - 1} />)}
          </MobileCard>
        ) : (
          <EmptyCompact title={snapshot.copy.activityEmptyTitle} body={snapshot.copy.activityEmptyBody} />
        )}
      </section>
    </div>
  )
}
