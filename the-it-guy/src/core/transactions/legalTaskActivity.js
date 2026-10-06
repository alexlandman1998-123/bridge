// Task records require an explicit saved identity. Lane labels and prose are not scope.
export function isLegalTaskActivity(entry, laneKey, taskKey) {
  if (!entry || !taskKey) return false
  const packet = entry.metadata?.workPacket
  const lane = packet?.laneKey || entry.laneKey || entry.lane_key
  const task = packet?.stageKey || entry.stepKey || entry.step_key
  if (lane && lane !== laneKey) return false
  if (task) return task === taskKey
  return Array.isArray(entry.filterKeys) && entry.filterKeys.includes(taskKey)
}

export function readLegalTaskOutcome(entries, laneKey, taskKey, status) {
  if (!['completed', 'completed_externally', 'not_applicable'].includes(status)) return null
  const latest = (entries || []).filter(entry => isLegalTaskActivity(entry, laneKey, taskKey) &&
    entry.metadata?.workPacket?.completionMethod).sort((a, b) =>
    new Date(b.timestamp || b.createdAt || b.created_at || 0) - new Date(a.timestamp || a.createdAt || a.created_at || 0))[0]
  if (!latest) return null
  const packet = latest.metadata.workPacket
  return { method: packet.completionMethod, reason: packet.overrideReason || '', recordedAt: latest.timestamp || latest.createdAt || latest.created_at || '' }
}
