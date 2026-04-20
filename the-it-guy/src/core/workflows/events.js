export function buildWorkflowActivityEvent({
  laneLabel = 'Workflow',
  stageLabel = '',
  action = 'updated',
  actorName = 'System',
  occurredAt = new Date().toISOString(),
} = {}) {
  const normalizedAction = String(action || 'updated')
    .trim()
    .toLowerCase()
  const normalizedStageLabel = String(stageLabel || '').trim()
  const normalizedLaneLabel = String(laneLabel || 'Workflow').trim()

  const actionText =
    normalizedAction === 'completed'
      ? 'completed'
      : normalizedAction === 'started'
        ? 'started'
        : normalizedAction

  const message = normalizedStageLabel
    ? `${normalizedLaneLabel} updated: ${normalizedStageLabel} ${actionText} by ${actorName} at ${occurredAt}.`
    : `${normalizedLaneLabel} updated by ${actorName} at ${occurredAt}.`

  return {
    type: `${normalizedLaneLabel.toLowerCase().replace(/\s+/g, '_')}_${normalizedAction}`,
    laneLabel: normalizedLaneLabel,
    stageLabel: normalizedStageLabel,
    action: normalizedAction,
    actorName: String(actorName || 'System').trim(),
    occurredAt,
    message,
  }
}
