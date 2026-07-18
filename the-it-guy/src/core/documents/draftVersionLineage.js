function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assessDraftVersionLineage({ packet = {}, version = {}, versions = [], events = [] } = {}) {
  const validation = record(version.validation_summary_json || version.validationSummaryJson)
  const provenance = record(validation.render_provenance || validation.renderProvenance)
  const sourceContext = record(packet.source_context_json || packet.sourceContextJson)
  const attemptId = text(provenance.generationAttemptId || validation.generationAttemptId)
  const versionNumber = Number(version.version_number || version.versionNumber || 0)
  const reasons = []
  if (!UUID.test(attemptId)) reasons.push('D3_GENERATION_ATTEMPT_ID_MISSING')
  const numbers = versions.map((row) => Number(row.version_number || row.versionNumber || 0)).filter((value) => Number.isInteger(value) && value > 0)
  if (new Set(numbers).size !== numbers.length) reasons.push('D3_DUPLICATE_VERSION_NUMBER')
  const ordered = [...new Set(numbers)].sort((left, right) => left - right)
  if (ordered.some((value, index) => index > 0 && value !== ordered[index - 1] + 1)) reasons.push('D3_VERSION_SEQUENCE_GAP')
  if (!versionNumber || Number(packet.current_version_number || packet.currentVersionNumber || 0) !== versionNumber) reasons.push('D3_CURRENT_VERSION_POINTER_MISMATCH')
  if (numbers.length && Math.max(...numbers) !== versionNumber) reasons.push('D3_SELECTED_VERSION_NOT_LATEST')
  if (sourceContext.generationAttemptId !== attemptId || Number(sourceContext.lastGeneratedVersion || 0) !== versionNumber) reasons.push('D3_PACKET_LINEAGE_POINTER_MISMATCH')
  const started = events.some((event) => event.event_type === 'generation_started' && event.event_payload_json?.generationAttemptId === attemptId)
  const completed = events.some((event) => ['version_generated', 'packet_regenerated'].includes(event.event_type) && event.version_id === version.id && event.event_payload_json?.generationAttemptId === attemptId && Number(event.event_payload_json?.versionNumber || 0) === versionNumber)
  if (!started) reasons.push('D3_GENERATION_STARTED_EVENT_MISSING')
  if (!completed) reasons.push('D3_GENERATION_COMPLETED_EVENT_MISSING')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], packetId: text(packet.id) || null, versionId: text(version.id) || null, versionNumber: versionNumber || null, generationAttemptId: attemptId || null }
}
