import {
  Bell,
  ChevronRight,
  Clock3,
  FileText,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { MobileCard, MobileEmptyState, MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates'
import { getMobileDashboardSnapshot } from '../../services/mobileDashboardService'
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

function PriorityCard({ card }) {
  return (
    <MobileCard className="min-h-[122px] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${CARD_TONES[card.tone] || CARD_TONES.blue}`}>
          {card.key === 'tasks' ? <ListChecks className="h-5 w-5" /> : card.key === 'documents' ? <FileText className="h-5 w-5" /> : card.key === 'notifications' ? <Bell className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </span>
        <strong className="text-[26px] font-semibold leading-none text-[#10243a]">{formatMetric(card.value)}</strong>
      </div>
      <p className="mt-4 text-[13px] font-semibold leading-5 text-[#10243a]">{card.label}</p>
    </MobileCard>
  )
}

function SectionHeader({ title, actionTo = '', actionLabel = 'View All' }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[19px] font-semibold text-[#10243a]">{title}</h2>
      {actionTo ? <Link to={actionTo} className="text-sm font-semibold text-[#1f7a5a]">{actionLabel}</Link> : null}
    </div>
  )
}

function ActiveWorkCard({ item, onOpen }) {
  return (
    <button
      type="button"
      className="block w-full rounded-[22px] border border-[#e4ebf2] bg-white p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
      onClick={() => onOpen(item)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold uppercase text-[#60758d]">{item.eyebrow}</p>
          <h3 className="mt-1 truncate text-[17px] font-semibold text-[#10243a]">{item.title}</h3>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#94a3b8]" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-[#60758d]">
        <span>{item.stage}</span>
        <span>{item.meta}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf3f8]">
        <span className="block h-full rounded-full bg-[#1f7a5a]" style={{ width: `${Math.max(Math.min(item.progress || 0, 100), 4)}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#e8f6ef] px-3 py-1 text-xs font-semibold text-[#1f7a5a]">{item.status}</span>
        {item.value ? <span className="text-sm font-semibold text-[#10243a]">{item.value}</span> : null}
      </div>
    </button>
  )
}

function TaskRow({ item, onOpen }) {
  return (
    <button type="button" className="flex w-full items-start gap-3 rounded-[20px] border border-[#e4ebf2] bg-white p-4 text-left" onClick={() => onOpen(item)}>
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff6e5] text-[#b7791f]">
        <Clock3 className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#10243a]">{item.title}</span>
        <span className="mt-1 block truncate text-xs text-[#60758d]">{item.related}</span>
        <span className="mt-2 inline-flex rounded-full bg-[#feecec] px-2.5 py-1 text-[11px] font-semibold text-[#b42318]">{item.priority}</span>
      </span>
      <span className="text-xs font-semibold text-[#60758d]">{item.dueTime}</span>
    </button>
  )
}

function ActivityRow({ item }) {
  return (
    <div className="flex items-start gap-3 rounded-[18px] bg-white px-3 py-3">
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1f7a5a]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#10243a]">{item.title}</p>
        <p className="mt-1 truncate text-xs text-[#60758d]">{item.body}</p>
      </div>
      <span className="shrink-0 text-xs font-semibold text-[#94a3b8]">{item.time}</span>
    </div>
  )
}

export default function MobileHome() {
  const workspace = useWorkspace()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState(() => {
    try {
      return { loading: false, error: '', snapshot: getMobileDashboardSnapshot({ workspace }) }
    } catch (error) {
      return { loading: false, error: error?.message || "We couldn't load your dashboard.", snapshot: null }
    }
  })
  const showUnsupportedNotice = searchParams.get('mobileNotice') === 'unsupported'

  const load = useCallback(() => {
    try {
      const snapshot = getMobileDashboardSnapshot({ workspace })
      setState({ loading: false, error: '', snapshot })
    } catch (error) {
      setState({ loading: false, error: error?.message || "We couldn't load your dashboard.", snapshot: null })
    }
  }, [workspace])

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

  function handleNotificationOpen() {
    void trackMobileMetric('notification_opened', {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: '/mobile/home',
      metadata: { dashboardType: snapshot?.category || '', destinationRoute: '/mobile/notifications' },
    })
    navigate('/mobile/notifications')
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
    <div className="space-y-5">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1f7a5a]">{snapshot.greeting}, {snapshot.displayName}</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight text-[#10243a]">Here&apos;s what&apos;s happening today.</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#10243a] shadow-[0_10px_24px_rgba(15,23,42,0.08)]" onClick={handleNotificationOpen} aria-label="Open notifications">
            <Bell className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1f7a5a] px-1 text-[10px] font-bold text-white">{snapshot.notifications?.unreadCount || 0}</span>
          </button>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#10243a] text-sm font-semibold text-white">
            {String(snapshot.displayName || 'A').slice(0, 1).toUpperCase()}
          </span>
        </div>
      </section>

      {showUnsupportedNotice ? (
        <MobileCard>
          <h2 className="text-[17px] font-semibold text-[#10243a]">That page is not available on mobile yet.</h2>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">You can continue from your mobile workspace.</p>
        </MobileCard>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        {snapshot.summaryCards.map((card) => <PriorityCard key={card.key} card={card} />)}
      </section>

      {snapshot.insight ? (
        <MobileCard className="bg-[#10243a] text-white">
          <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">{snapshot.insight.label}</p>
          <h2 className="mt-2 text-[24px] font-semibold text-white">{snapshot.insight.value}</h2>
          <p className="mt-1 text-sm leading-6 text-[#dce8f2]">{snapshot.insight.body}</p>
        </MobileCard>
      ) : null}

      <section>
        <SectionHeader title={snapshot.copy.workTitle} actionTo={workPath} />
        {snapshot.activeWork.length ? (
          <div className="space-y-3">
            {snapshot.activeWork.slice(0, 5).map((item) => <ActiveWorkCard key={item.id} item={item} onOpen={handleActiveWorkOpen} />)}
          </div>
        ) : (
          <MobileEmptyState title={snapshot.copy.workEmptyTitle} body={snapshot.copy.workEmptyBody} actionLabel={snapshot.quickActions[0]?.label || ''} onAction={snapshot.quickActions[0] ? () => handleQuickAction(snapshot.quickActions[0]) : null} />
        )}
      </section>

      <section>
        <SectionHeader title="Tasks Due Today" />
        {snapshot.tasks.length ? (
          <div className="space-y-3">
            {snapshot.tasks.slice(0, 5).map((item) => <TaskRow key={item.id} item={item} onOpen={handleTaskOpen} />)}
          </div>
        ) : (
          <MobileEmptyState title={snapshot.copy.taskEmptyTitle} body={snapshot.copy.taskEmptyBody} />
        )}
      </section>

      <section>
        <SectionHeader title="Recent Activity" />
        {snapshot.recentActivity.length ? (
          <div className="space-y-2 rounded-[22px] border border-[#e4ebf2] bg-[#f8fafc] p-2">
            {snapshot.recentActivity.slice(0, 10).map((item) => <ActivityRow key={item.id} item={item} />)}
          </div>
        ) : (
          <MobileEmptyState title={snapshot.copy.activityEmptyTitle} body={snapshot.copy.activityEmptyBody} />
        )}
      </section>

      <section>
        <SectionHeader title="Quick Actions" />
        <div className="grid grid-cols-2 gap-3">
          {snapshot.quickActions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="flex min-h-[58px] items-center justify-center gap-2 rounded-[20px] bg-white px-3 text-sm font-semibold text-[#10243a] shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
              onClick={() => handleQuickAction(action)}
            >
              <Plus className="h-4 w-4 text-[#1f7a5a]" />
              {action.label}
            </button>
          ))}
          <button type="button" className="flex min-h-[58px] items-center justify-center gap-2 rounded-[20px] border border-[#d7e0ea] bg-[#f8fafc] px-3 text-sm font-semibold text-[#60758d]" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </section>
    </div>
  )
}
