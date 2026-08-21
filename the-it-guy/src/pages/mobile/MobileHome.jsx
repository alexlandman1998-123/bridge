import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  CircleCheck,
  ListChecks,
  ScanLine,
  Sparkles,
  Target,
  UserPlus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { MobileCard, MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates'
import { getMobileDashboardSnapshot, getMobileDashboardSnapshotAsync } from '../../services/mobileDashboardService'
import { trackMobileMetric } from '../../services/observability/monitoring'

const CARD_TONES = {
  green: 'bg-[#e5f6ed] text-[#1f8b65]',
  amber: 'bg-[#fff4df] text-[#b7791f]',
  blue: 'bg-[#eaf1f9] text-[#2f6284]',
  navy: 'bg-[#10243a] text-white',
}

const SPARKLINE_TONES = {
  active: '#23936b',
  listings: '#4c83d9',
  pipeline: '#23936b',
  tasks: '#d99a2b',
  default: '#23936b',
}

const SPARKLINE_POINTS = {
  active: [12, 20, 15, 19, 14, 9, 24, 13, 27, 38, 34, 45],
  listings: [14, 18, 17, 26, 14, 12, 29, 18, 33, 45, 43, 52],
  pipeline: [8, 8, 8, 20, 21, 22, 35],
  tasks: [7, 7, 7, 7, 7, 7, 8],
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

function Sparkline({ id = 'default', color = SPARKLINE_TONES.default }) {
  const points = SPARKLINE_POINTS[id] || SPARKLINE_POINTS.active
  const width = 160
  const height = 34
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = Math.max(max - min, 1)
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width
      const y = height - 5 - ((point - min) / range) * (height - 11)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  const lastPoint = points[points.length - 1]
  const lastX = width
  const lastY = height - 5 - ((lastPoint - min) / range) * (height - 11)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-auto h-10 w-full overflow-visible" aria-hidden="true" preserveAspectRatio="none">
      <path d={`${path} L${width} ${height} L0 ${height} Z`} fill={`url(#mobile-home-spark-${id})`} opacity="0.45" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3.2" fill={color} />
      <defs>
        <linearGradient id={`mobile-home-spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function KpiCard({ card }) {
  const Icon = card.key === 'tasks' ? ListChecks : card.key === 'pipeline' ? Sparkles : card.key === 'listings' ? Building2 : CircleCheck
  const taskCount = card.key === 'tasks' ? Number(card.value || 0) : 0
  const sparkColor = SPARKLINE_TONES[card.key] || SPARKLINE_TONES.default
  return (
    <div className="flex min-h-[176px] flex-col rounded-[26px] border border-[#dce5ef] bg-white px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-12 w-12 items-center justify-center rounded-[18px] ${CARD_TONES[card.tone] || CARD_TONES.blue}`}>
          <Icon className="h-[21px] w-[21px]" />
        </span>
        {card.key === 'tasks' ? (
          <span className={`rounded-full px-4 py-2 text-[13px] font-bold ${taskCount > 0 ? 'bg-[#fff1e7] text-[#b45309]' : 'bg-[#e4f5ec] text-[#1f8b65]'}`}>
            {taskCount > 0 ? 'Due' : 'Clear'}
          </span>
        ) : null}
      </div>
      <strong className="mt-7 block truncate text-[32px] font-bold leading-none tracking-[-0.04em] text-[#10243a]">{formatMetric(card.value)}</strong>
      <p className="mt-3 line-clamp-2 text-[13px] font-bold uppercase leading-5 tracking-[0.02em] text-[#60758d]">{card.label}</p>
      <Sparkline id={card.key} color={sparkColor} />
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
  const circumference = 2 * Math.PI * 43
  const ringOffset = circumference - (healthScore / 100) * circumference

  return (
    <section className="relative overflow-hidden rounded-[30px] bg-[#061f1f] p-7 text-white shadow-[0_24px_54px_rgba(15,23,42,0.20)]">
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(126,230,181,0.22),transparent_32%),linear-gradient(120deg,#0b3633_0%,#062323_48%,#041d22_100%)]" />
      <span className="pointer-events-none absolute -right-20 -top-12 h-80 w-80 rounded-full border border-white/8 bg-white/[0.025]" />
      <span className="pointer-events-none absolute bottom-[-7rem] right-[-5rem] h-72 w-72 rounded-full border border-white/6 bg-white/[0.025]" />
      <div className="relative flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[14px] font-bold uppercase tracking-[0.14em] text-[#9fe0bd]">Agency Command</p>
          <h1 className="mt-6 text-[37px] font-bold leading-[1.04] tracking-[-0.06em] text-white">{pipelineValue} Pipeline</h1>
          <p className="mt-5 text-[17px] leading-6 text-[#d7e4ed]">
            {activeTransactions} active transactions · {mandates} mandates · {atRisk} at risk
          </p>
        </div>
        <div className="relative flex h-[116px] w-[116px] shrink-0 items-center justify-center">
          <svg viewBox="0 0 104 104" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="52" cy="52" r="43" fill="none" stroke="rgba(159,224,189,0.22)" strokeWidth="10" />
            <circle
              cx="52"
              cy="52"
              r="43"
              fill="none"
              stroke="#9fe0bd"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={ringOffset}
            />
          </svg>
          <span className="relative flex flex-col items-center justify-center text-center">
            <span className="text-[38px] font-bold leading-none tracking-[-0.04em]">{healthScore}</span>
            <span className="mt-2 text-[12px] font-bold uppercase tracking-[0.04em] text-[#b9ecd0]">Health</span>
          </span>
        </div>
      </div>

      <button
        type="button"
        className="relative mt-8 flex w-full items-center gap-4 rounded-[26px] border border-white/12 bg-white/[0.10] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition active:bg-white/[0.14]"
        onClick={() => onOpen(action.to)}
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[21px] bg-white text-[#1f8b65] shadow-[0_12px_26px_rgba(0,0,0,0.16)]">
          <Target className="h-[31px] w-[31px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold uppercase tracking-[0.08em] text-[#9fe0bd]">{action.eyebrow}</span>
          <span className="mt-3 block line-clamp-2 text-[20px] font-bold leading-7 text-white">{action.title}</span>
          <span className="mt-2 block line-clamp-2 text-[15px] leading-5 text-[#c4d4df]">{action.body}</span>
        </span>
        <span className="shrink-0 rounded-[18px] bg-white/10 px-4 py-3 text-center text-[14px] font-bold leading-5 text-[#d7e4ed]">{action.meta}</span>
      </button>
    </section>
  )
}

function getDashboardQuickActions(actions = []) {
  const leadAction = actions.find((action) => ['add_lead', 'create_lead'].includes(action.key)) || actions[0]
  const scanAction = actions.find((action) => ['scan_mandate', 'upload_document'].includes(action.key)) || actions.find((action) => action.key !== leadAction?.key) || actions[1]
  return [
    leadAction ? { ...leadAction, label: 'Add Lead', body: 'Capture a new lead', icon: UserPlus } : null,
    scanAction ? { ...scanAction, label: 'Scan Mandate', body: 'Instantly capture', icon: ScanLine } : null,
  ].filter(Boolean)
}

function CommandActions({ actions = [], onAction }) {
  const dashboardActions = getDashboardQuickActions(actions)
  return (
    <section>
      <h2 className="mb-4 text-[20px] font-bold tracking-[-0.03em] text-[#10243a]">Quick actions</h2>
      <div className="grid grid-cols-2 gap-4">
        {dashboardActions.map((action) => {
          const Icon = action.icon || ArrowUpRight
          return (
            <button
              key={action.key}
              type="button"
              className="flex min-h-[82px] items-center gap-4 rounded-[26px] border border-[#dce5ef] bg-white px-4 text-left shadow-[0_18px_40px_rgba(15,23,42,0.07)] active:bg-[#f8fafc]"
              onClick={() => onAction(action)}
            >
              <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[20px] bg-[#e5f6ed] text-[#1f8b65]">
                <Icon className="h-7 w-7" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-bold tracking-[-0.03em] text-[#10243a]">{action.label}</span>
                <span className="mt-1 block truncate text-[14px] font-semibold text-[#60758d]">{action.body}</span>
              </span>
              <ChevronRight className="h-6 w-6 shrink-0 text-[#7f8fa3]" />
            </button>
          )
        })}
      </div>
    </section>
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
  const priority = useMemo(() => getPriority(snapshot), [snapshot])

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
    <div className="space-y-7" data-mobile-home>
      {showUnsupportedNotice ? (
        <MobileCard>
          <h2 className="text-[17px] font-semibold text-[#10243a]">That page is not available on mobile yet.</h2>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">You can continue from your mobile workspace.</p>
        </MobileCard>
      ) : null}

      <section className="pt-5">
        <AgencyCommandCard snapshot={snapshot} priority={priority} onOpen={handlePriorityOpen} />
      </section>

      <section className="grid grid-cols-2 gap-4">
        {snapshot.summaryCards.map((card) => <KpiCard key={card.key} card={card} />)}
      </section>

      <CommandActions actions={snapshot.quickActions} onAction={handleQuickAction} />
    </div>
  )
}
