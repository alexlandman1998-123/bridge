import { isAttorneyTaskResolved } from './attorneyTaskOutcomes.js'

const QUERY_KEYS = ['transferView', 'transferStage', 'transferTask', 'workflowLane']
const WORKFLOW_LANES = new Set(['transfer', 'bond', 'cancellation'])

export function readTransferWorkspaceNavigation(search = '') {
  const params = new URLSearchParams(search)
  const view = params.get('transferView')
  return {
    active: view === 'overview' || view === 'workspace',
    view: view === 'workspace' ? 'workspace' : 'overview',
    laneKey: WORKFLOW_LANES.has(params.get('workflowLane')) ? params.get('workflowLane') : 'transfer',
    stageKey: params.get('transferStage') || '',
    taskKey: params.get('transferTask') || '',
  }
}

export function writeTransferWorkspaceNavigation(search = '', navigation = null) {
  const params = new URLSearchParams(search)
  QUERY_KEYS.forEach((key) => params.delete(key))
  if (navigation?.view === 'overview' || navigation?.view === 'workspace') {
    params.set('transferView', navigation.view)
    if (navigation.laneKey && navigation.laneKey !== 'transfer' && WORKFLOW_LANES.has(navigation.laneKey)) params.set('workflowLane', navigation.laneKey)
    if (navigation.stageKey) params.set('transferStage', navigation.stageKey)
    if (navigation.view === 'workspace' && navigation.taskKey) params.set('transferTask', navigation.taskKey)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function resolveTransferWorkspaceNavigation(navigation = {}, phases = []) {
  const fallbackPhase = phases.find((phase) => phase.hasCurrentTask)
    || phases.find((phase) => phase.status === 'in_progress')
    || phases.find((phase) => phase.tasks?.length)
    || phases[0]
    || null
  const requestedPhase = phases.find((phase) => phase.key === navigation.stageKey)
  const phase = requestedPhase || fallbackPhase
  const requestedTask = phase?.tasks?.find((task) => task.key === navigation.taskKey) || null
  // Older overview links and stage-only entry points open the same task workspace.
  // Explicit task links keep their selection, including completed and legacy work.
  const task = requestedTask || getTransferStageEntryTask(phase)
  return {
    view: task ? 'workspace' : 'overview',
    phase,
    task,
    invalid: Boolean(navigation.active && (
      (navigation.stageKey && !requestedPhase) ||
      (navigation.taskKey && !requestedTask)
    )),
  }
}

export function getTransferStageEntryTask(phase = null) {
  if (!phase) return null
  return phase.tasks?.find((task) => !isAttorneyTaskResolved(task.status))
    || phase.currentTask
    || phase.tasks?.[0]
    || null
}

export function getNextTransferStageTask(phase = null, currentTaskKey = '') {
  const tasks = phase?.tasks || []
  const currentIndex = tasks.findIndex((task) => task.key === currentTaskKey)
  return currentIndex >= 0 ? tasks[currentIndex + 1] || null : null
}
