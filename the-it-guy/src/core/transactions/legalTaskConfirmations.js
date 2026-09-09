export function normalizeTaskConfirmations(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).slice(0, 100).flatMap(([id, response]) => {
    if (!id || !['yes', 'no', 'not_applicable'].includes(response?.answer)) return []
    return [[id, { answer: response.answer, note: String(response.note || '').slice(0, 4000) }]]
  }))
}

export function readTaskConfirmations(entries = [], laneKey, taskKey) {
  const latest = entries.filter(entry => {
    const packet = entry?.metadata?.workPacket
    return packet?.laneKey === laneKey && packet?.stageKey === taskKey && packet?.taskConfirmations
  }).sort((a, b) => new Date(b.timestamp || b.createdAt || b.created_at || b.changed_at || 0) - new Date(a.timestamp || a.createdAt || a.created_at || a.changed_at || 0))[0]
  return normalizeTaskConfirmations(latest?.metadata?.workPacket?.taskConfirmations)
}
