export const ATTORNEY_TASK_TERMINAL_STATUSES = ['completed', 'completed_externally', 'not_applicable']
export function isAttorneyTaskResolved(status) {
  return ATTORNEY_TASK_TERMINAL_STATUSES.includes(status)
}
export function isAttorneyTaskCompleted(status) {
  return status === 'completed' || status === 'completed_externally'
}
export function summarizeAttorneyTaskOutcomes(tasks = []) {
  const applicable = tasks.filter(task => task.status !== 'not_applicable')
  const completed = applicable.filter(task => isAttorneyTaskCompleted(task.status)).length
  return { total: applicable.length, completed, notApplicable: tasks.length - applicable.length,
    percent: applicable.length ? Math.round(completed / applicable.length * 100) : 0 }
}
