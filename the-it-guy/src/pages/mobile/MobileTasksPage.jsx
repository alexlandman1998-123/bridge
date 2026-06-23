import { useState } from 'react'
import { MobileOfflineDraftPanel } from '../../components/mobile-shell/MobileProductivity'
import { MobileCard, MobileEmptyState } from '../../components/mobile-shell/MobileShellStates'
import { getMobileSharedTasks } from '../../services/mobileWorkspaceService'
import { trackMobileMetric } from '../../services/observability/monitoring'

export default function MobileTasksPage() {
  const [tasks, setTasks] = useState(() => getMobileSharedTasks())

  function completeTask(taskId) {
    setTasks((current) => current.filter((task) => task.id !== taskId))
    void trackMobileMetric('task_completed', { route: '/mobile/tasks', metadata: { taskId } })
  }

  function viewItem(taskId) {
    void trackMobileMetric('workspace_action_used', { route: '/mobile/tasks', metadata: { taskId, action: 'View Item' } })
  }

  function snoozeTask(taskId) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, due: 'Tomorrow', snoozed: true } : task))
    void trackMobileMetric('workspace_action_used', { route: '/mobile/tasks', metadata: { taskId, action: 'Snooze' } })
  }

  function assignTask(taskId) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, assigned: 'You' } : task))
    void trackMobileMetric('workspace_action_used', { route: '/mobile/tasks', metadata: { taskId, action: 'Assign' } })
  }

  return (
    <div className="space-y-4">
      <section>
        <h1 className="text-[28px] font-semibold text-[#10243a]">Tasks</h1>
        <p className="mt-2 text-sm leading-6 text-[#60758d]">Upload documents, review contracts, complete onboarding, confirm appointments and update status from mobile.</p>
      </section>
      {tasks.length ? tasks.map((task) => (
        <MobileCard key={task.id}>
          <p className="text-sm font-semibold text-[#10243a]">{task.title}</p>
          <p className="mt-1 text-sm text-[#60758d]">{task.related}{task.assigned ? ` · Assigned to ${task.assigned}` : ''}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="rounded-full bg-[#fff6e5] px-3 py-1 text-xs font-semibold text-[#b7791f]">{task.priority}</span>
            <span className="text-xs font-semibold text-[#60758d]">{task.due}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="min-h-10 rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a]" onClick={() => viewItem(task.id)}>View Item</button>
            <button type="button" className="min-h-10 rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a]" onClick={() => snoozeTask(task.id)}>Snooze</button>
            <button type="button" className="min-h-10 rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a]" onClick={() => assignTask(task.id)}>Assign</button>
            <button type="button" className="min-h-10 rounded-2xl bg-[#10243a] px-3 text-sm font-semibold text-white" onClick={() => completeTask(task.id)}>Complete</button>
          </div>
        </MobileCard>
      )) : <MobileEmptyState title="No outstanding tasks." body="Your shared task list is clear." />}
      <MobileOfflineDraftPanel />
    </div>
  )
}
