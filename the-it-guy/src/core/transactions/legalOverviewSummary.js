const DONE = new Set(['completed', 'completed_externally', 'not_applicable'])

// Presentation only: use the authorised journey, never stage strings or dates
// as evidence of work. Commercial OTP/finance milestones remain independent.
export function buildLegalOverviewSummary(transactionId, journey, laneKey = 'transfer') {
  const snapshot = journey?.status === 'ready' ? journey.snapshot : null
  if (!snapshot || snapshot.transactionId !== transactionId || !Array.isArray(snapshot.lanes) ||
    !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || snapshot.planRevision !== snapshot.revision) return null
  const lane = snapshot.lanes.find(item => item.key === laneKey)
  if (!lane || !Array.isArray(lane.phases) || !lane.phases.length ||
    !lane.phases.every(phase => Array.isArray(phase.tasks) && phase.tasks.every(task => task.revision === snapshot.revision))) return null
  const phase = lane.phases.find(item => item.tasks?.some(task => !DONE.has(task.status)))
  const task = phase?.tasks.find(item => !DONE.has(item.status))
  const title = task?.label || 'All applicable legal tasks complete'
  return {
    source: 'shared-legal-journey',
    stageLabel: phase?.label || 'Legal work complete',
    title, description: task ? `Next outstanding task in ${phase.label}.` : 'Review the saved journey and close-out records.',
    label: title, status: task?.status || 'completed', priority: task?.status === 'blocked' ? 'high' : 'normal',
    taskKey: task?.key || null, laneKey,
    primaryActionLabel: 'Open Conveyancing', primaryActionTarget: 'transfer',
    secondaryActionLabel: 'View Documents', secondaryActionTarget: 'documents',
    primaryLabel: 'Open Conveyancing', secondaryLabel: 'View Documents', target: 'transfer',
    owner: 'Conveyancing', ownerKey: 'transfer_attorney',
  }
}
