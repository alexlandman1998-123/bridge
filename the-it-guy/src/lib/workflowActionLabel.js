// Action payloads must remain intact for dispatch; only their labels belong in JSX.
export function workflowActionLabel(action, fallback = '') {
  if (typeof action === 'string' && action.trim()) return action
  if (typeof action?.label === 'string' && action.label.trim()) return action.label
  return fallback
}

export function workflowTaskButtonLabel(task) {
  return workflowActionLabel(task?.command, workflowActionLabel(task?.action, 'Complete Action'))
}
