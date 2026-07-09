import { CheckCircle2, Clock3, ExternalLink, ListChecks, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MobileCreateSheet, { MobileCreateRecoveryStrip, MobileDraftCard } from '../../components/mobile-shell/MobileCreateSheet'
import { mobileDraftMatchesModule } from '../../components/mobile-shell/mobileCreateConfig'
import { MobileOfflineDraftPanel } from '../../components/mobile-shell/MobileProductivity'
import { MobileCard, MobileEmptyState, MobileFilterChips } from '../../components/mobile-shell/MobileShellStates'
import { getOfflineDrafts } from '../../services/mobileProductivityService'
import { getMobileSharedTasks } from '../../services/mobileWorkspaceService'
import { trackMobileMetric } from '../../services/observability/monitoring'

const FILTERS = ['All', 'Today', 'High', 'Matter', 'Transaction', 'Application']

export default function MobileTasksPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState(() => getMobileSharedTasks())
  const [drafts, setDrafts] = useState(() => getOfflineDrafts())
  const [filter, setFilter] = useState('All')
  const createType = searchParams.get('create') || ''
  const createOpen = createType === 'follow-up'
  const visibleTasks = useMemo(() => {
    if (filter === 'All') return tasks
    const needle = filter.toLowerCase()
    return tasks.filter((task) => `${task.title} ${task.related} ${task.due} ${task.priority} ${task.module}`.toLowerCase().includes(needle))
  }, [filter, tasks])
  const pendingDrafts = useMemo(() => (
    drafts.filter((draft) => mobileDraftMatchesModule(draft, 'tasks'))
  ), [drafts])

  function completeTask(taskId) {
    setTasks((current) => current.filter((task) => task.id !== taskId))
    void trackMobileMetric('task_completed', { route: '/mobile/tasks', metadata: { taskId } })
  }

  function viewItem(task) {
    void trackMobileMetric('workspace_action_used', { route: '/mobile/tasks', metadata: { taskId: task.id, action: 'View Item' } })
    if (task.route) navigate(task.route)
  }

  function snoozeTask(taskId) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, due: 'Tomorrow', snoozed: true } : task))
    void trackMobileMetric('workspace_action_used', { route: '/mobile/tasks', metadata: { taskId, action: 'Snooze' } })
  }

  function assignTask(taskId) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, assigned: 'You' } : task))
    void trackMobileMetric('workspace_action_used', { route: '/mobile/tasks', metadata: { taskId, action: 'Assign' } })
  }

  function clearCreateIntent() {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('create')
    setSearchParams(nextParams, { replace: true })
  }

  function handleDraftSaved() {
    setDrafts(getOfflineDrafts())
  }

  return (
    <div className="space-y-5" data-mobile-shared-tasks>
      <section className="rounded-[30px] bg-[#10243a] p-5 text-white shadow-[0_20px_46px_rgba(15,23,42,0.18)]">
        <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">Mobile Execution</p>
        <h1 className="mt-2 text-[32px] font-semibold leading-tight">Tasks</h1>
        <p className="mt-2 text-[15px] leading-6 text-[#dce8f2]">Outstanding work across transactions, matters, applications, leads and deals.</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { label: 'Open', value: tasks.length, icon: ListChecks },
            { label: 'Today', value: tasks.filter((task) => task.due === 'Today').length, icon: Clock3 },
            { label: 'High', value: tasks.filter((task) => task.priority === 'High').length, icon: CheckCircle2 },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="rounded-[20px] bg-white/10 p-3">
                <Icon className="h-4 w-4 text-[#9fe0bd]" />
                <p className="mt-2 text-[22px] font-semibold">{item.value}</p>
                <p className="text-[11px] font-semibold text-[#c7d7e4]">{item.label}</p>
              </div>
            )
          })}
        </div>
      </section>

      <MobileFilterChips items={FILTERS} active={filter} onChange={setFilter} />

      {pendingDrafts.length ? (
        <section className="space-y-3" data-mobile-pending-follow-ups>
          {pendingDrafts.map((draft) => <MobileDraftCard key={draft.id} draft={draft} />)}
        </section>
      ) : null}

      <MobileCreateRecoveryStrip moduleKey="tasks" />

      {visibleTasks.length ? visibleTasks.map((task) => (
        <MobileCard key={task.id}>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff6e5] text-[#b7791f]">
              <ListChecks className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold text-[#10243a]">{task.title}</p>
              <p className="mt-1 text-[13px] leading-5 text-[#60758d]">{task.related}{task.assigned ? ` · Assigned to ${task.assigned}` : ''}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex min-h-8 items-center rounded-full bg-[#fff6e5] px-3 text-xs font-semibold text-[#b7791f]">{task.priority}</span>
            <span className="inline-flex min-h-8 items-center rounded-full bg-[#edf3f8] px-3 text-xs font-semibold text-[#60758d]">{task.due}</span>
            <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[#edf8f2] px-3 text-xs font-semibold text-[#1f7a5a]"><UserRound className="h-3.5 w-3.5" />{task.owner || 'You'}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a]" onClick={() => viewItem(task)}><ExternalLink className="h-4 w-4" />View Item</button>
            <button type="button" className="min-h-11 rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a]" onClick={() => snoozeTask(task.id)}>Snooze</button>
            <button type="button" className="min-h-11 rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a]" onClick={() => assignTask(task.id)}>Assign</button>
            <button type="button" className="min-h-11 rounded-2xl bg-[#10243a] px-3 text-sm font-semibold text-white" onClick={() => completeTask(task.id)}>Complete</button>
          </div>
        </MobileCard>
      )) : pendingDrafts.length && filter === 'All' ? null : <MobileEmptyState title="No outstanding tasks." body={filter === 'All' ? 'Your shared task list is clear.' : 'No tasks match this filter.'} />}
      <MobileOfflineDraftPanel />
      <MobileCreateSheet
        open={createOpen}
        type={createType}
        route="/mobile/tasks"
        onClose={clearCreateIntent}
        onSaved={handleDraftSaved}
      />
    </div>
  )
}
