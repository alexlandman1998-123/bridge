import {
  ArrowUpRight,
  ChevronRight,
  CircleCheck,
  Home,
  ListChecks,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { MobileCommandBriefPanel, MobileFieldModePanel } from '../../components/mobile-shell/MobileProductivity'
import { MobileCard, MobileEmptyState, MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates'
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

function KpiCard({ card }) {
  const Icon = card.key === 'tasks' ? ListChecks : card.key === 'pipeline' ? Sparkles : card.key === 'listings' ? Home : CircleCheck
  return (
    <MobileCard className="min-h-[142px] p-4">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-[17px] ${CARD_TONES[card.tone] || CARD_TONES.blue}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <strong className="mt-5 block text-[31px] font-bold leading-none text-[#10243a]">{formatMetric(card.value)}</strong>
      <p className="mt-2 text-[15px] font-semibold leading-5 text-[#10243a]">{card.label}</p>
      <p className={`mt-2 text-[12px] font-semibold ${card.key === 'tasks' && Number(card.value) > 0 ? 'text-[#b42318]' : 'text-[#1f7a5a]'}`}>
        {card.supportingValue || (card.key === 'tasks' && Number(card.value) > 0 ? 'Needs attention' : 'Up to date')}
      </p>
    </MobileCard>
  )
}

function SectionHeader({ title, actionTo = '', actionLabel = 'View All' }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[22px] font-semibold text-[#10243a]">{title}</h2>
      {actionTo ? <Link to={actionTo} className="text-sm font-semibold text-[#1f7a5a]">{actionLabel}</Link> : null}
    </div>
  )
}

function PriorityNowCard({ priority, onOpen }) {
  if (!priority) return null
  return (
    <button
      type="button"
      className="flex w-full items-center gap-4 rounded-[28px] border border-[#dbece1] bg-[#edf8f2] p-4 text-left shadow-[0_14px_34px_rgba(31,122,90,0.12)]"
      onClick={() => onOpen(priority.to)}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-white text-[#1f7a5a] shadow-[0_8px_18px_rgba(31,122,90,0.10)]">
        <ListChecks className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-[0.04em] text-[#1f7a5a]">Priority Now</span>
        <span className="mt-1 block truncate text-[17px] font-semibold text-[#10243a]">{priority.title}</span>
        <span className="mt-1 block truncate text-[13px] text-[#60758d]">{priority.body}</span>
        <span className="mt-1 block text-[12px] font-semibold text-[#b7791f]">{priority.meta}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#1f7a5a]" />
    </button>
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
    <MobileEmptyState title={title} body={body} actionLabel={actionLabel} onAction={onAction} />
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
    <div className="space-y-8">
      <section className="pt-2">
        <div className="min-w-0">
          <p className="text-[17px] font-medium text-[#60758d]">{snapshot.greeting},</p>
          <h1 className="mt-1 text-[38px] font-bold leading-[1.04] text-[#10243a]">{snapshot.displayName}</h1>
          <p className="mt-3 max-w-[29ch] text-[17px] leading-7 text-[#60758d]">
            {snapshot.category === 'principal' ? "Here's what's happening across your team." : "Here's what needs attention today."}
          </p>
        </div>
      </section>

      {showUnsupportedNotice ? (
        <MobileCard>
          <h2 className="text-[17px] font-semibold text-[#10243a]">That page is not available on mobile yet.</h2>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">You can continue from your mobile workspace.</p>
        </MobileCard>
      ) : null}

      <PriorityNowCard priority={priority} onOpen={handlePriorityOpen} />

      <MobileFieldModePanel
        workspace={{ module: snapshot.category || 'home' }}
        tasks={snapshot.tasks}
        documents={[]}
        priorityActions={priority ? [{ tone: snapshot.tasks.length ? 'amber' : 'green' }] : []}
        onOpenDocuments={() => navigate('/mobile/documents')}
      />

      <MobileCommandBriefPanel
        workspace={{ module: snapshot.category || 'home', moduleLabel: snapshot.copy?.workTitle || 'Mobile Workspace', status: snapshot.insight?.label || 'Today' }}
        tasks={snapshot.tasks}
        documents={[]}
        priorityActions={priority ? [{ tone: snapshot.tasks.length ? 'amber' : 'green', title: priority.title }] : []}
        activity={snapshot.recentActivity}
        onAction={(action) => {
          if (String(action).toLowerCase().includes('task')) navigate('/mobile/tasks')
          else if (String(action).toLowerCase().includes('document')) navigate('/mobile/documents')
          else navigate(workPath)
        }}
      />

      <section className="grid grid-cols-2 gap-3">
        {snapshot.summaryCards.map((card) => <KpiCard key={card.key} card={card} />)}
      </section>

      {snapshot.insight ? (
        <MobileCard className="bg-[#10243a] text-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9fe0bd]">{snapshot.insight.label}</p>
          <h2 className="mt-2 text-[30px] font-bold text-white">{snapshot.insight.value}</h2>
          <p className="mt-1 text-sm leading-6 text-[#dce8f2]">{snapshot.insight.body}</p>
        </MobileCard>
      ) : null}

      <section>
        <SectionHeader title={snapshot.copy.workTitle} actionTo={workPath} />
        {snapshot.activeWork.length ? (
          <div className="space-y-3">
            {snapshot.activeWork.slice(0, 4).map((item) => <ActiveWorkCard key={item.id} item={item} onOpen={handleActiveWorkOpen} />)}
          </div>
        ) : (
          <EmptyCompact title={snapshot.copy.workEmptyTitle} body={snapshot.copy.workEmptyBody} actionLabel={snapshot.quickActions[0]?.label || ''} onAction={snapshot.quickActions[0] ? () => handleQuickAction(snapshot.quickActions[0]) : null} />
        )}
      </section>

      <section>
        <SectionHeader title="Tasks Due Today" actionTo="/mobile/tasks" />
        {snapshot.tasks.length ? (
          <div className="space-y-3">
            {snapshot.tasks.slice(0, 3).map((item) => <TaskRow key={item.id} item={item} onOpen={handleTaskOpen} />)}
          </div>
        ) : (
          <EmptyCompact title={snapshot.copy.taskEmptyTitle} body={snapshot.copy.taskEmptyBody} />
        )}
      </section>

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

      <section>
        <SectionHeader title="Quick Actions" />
        <div className="grid grid-cols-2 gap-3">
          {snapshot.quickActions.slice(0, 4).map((action) => (
            <button
              key={action.key}
              type="button"
              className="flex min-h-[64px] items-center justify-center gap-2 rounded-[22px] bg-white px-3 text-sm font-semibold text-[#10243a] shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
              onClick={() => handleQuickAction(action)}
            >
              <ArrowUpRight className="h-4 w-4 text-[#1f7a5a]" />
              {action.label}
            </button>
          ))}
          <button type="button" className="flex min-h-[64px] items-center justify-center gap-2 rounded-[22px] border border-[#d7e0ea] bg-[#f8fafc] px-3 text-sm font-semibold text-[#60758d]" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </section>
    </div>
  )
}
