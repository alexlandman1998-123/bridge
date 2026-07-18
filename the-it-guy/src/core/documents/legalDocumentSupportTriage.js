function normalizeText(value) {
  return String(value || '').trim()
}

function normalizePacketType(value) {
  return normalizeText(value).toLowerCase() === 'otp' ? 'otp' : 'mandate'
}

export const LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES = Object.freeze([
  'generation_succeeded',
  'template_corrected',
  'access_restored',
  'session_restored',
  'platform_incident_resolved',
  'duplicate_closed',
])

function lifecycleKey(packetId, supportReference) {
  return `${normalizeText(packetId)}:${normalizeText(supportReference)}`
}

function isoFromMs(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null
}

export function buildLegalDocumentSupportTriageSnapshot({ events = [], packets = [], now = Date.now(), responseSlaMinutes = 30, resolutionSlaMinutes = 240 } = {}) {
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  const responseSlaMs = Math.max(1, Number(responseSlaMinutes || 30)) * 60 * 1000
  const resolutionSlaMs = Math.max(1, Number(resolutionSlaMinutes || 240)) * 60 * 1000
  const packetMap = new Map((Array.isArray(packets) ? packets : []).map((packet) => [normalizeText(packet?.id), packet]))
  const lifecycle = new Map()
  for (const event of Array.isArray(events) ? events : []) {
    if (!['legal_generation_support_acknowledged', 'legal_generation_support_resolved'].includes(normalizeText(event?.event_type))) continue
    const payload = event?.event_payload_json && typeof event.event_payload_json === 'object' ? event.event_payload_json : {}
    if (normalizeText(payload.contract) !== 'k2-v1' || payload.rawDetailsIncluded !== false) continue
    const supportReference = normalizeText(payload.supportReference).slice(0, 80)
    if (!/^LD-(OTP|MAN)-[A-Z0-9]+-[A-Z0-9]+$/.test(supportReference)) continue
    const key = lifecycleKey(event?.packet_id, supportReference)
    const current = lifecycle.get(key) || {}
    if (event.event_type === 'legal_generation_support_acknowledged') {
      current.acknowledgedAt = normalizeText(event?.created_at)
      current.acknowledgedBy = normalizeText(event?.created_by) || null
    } else if (LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES.includes(payload.resolutionCode)) {
      current.resolvedAt = normalizeText(event?.created_at)
      current.resolvedBy = normalizeText(event?.created_by) || null
      current.resolutionCode = payload.resolutionCode
    }
    lifecycle.set(key, current)
  }
  const handoffs = (Array.isArray(events) ? events : [])
    .filter((event) => normalizeText(event?.event_type) === 'legal_generation_support_handoff')
    .map((event) => {
      const payload = event?.event_payload_json && typeof event.event_payload_json === 'object' ? event.event_payload_json : {}
      if (normalizeText(payload.contract) !== 'j4-v1' || payload.rawDetailsIncluded !== false) return null
      const supportReference = normalizeText(payload.supportReference).slice(0, 80)
      if (!/^LD-(OTP|MAN)-[A-Z0-9]+-[A-Z0-9]+$/.test(supportReference)) return null
      const packetId = normalizeText(event?.packet_id)
      const packet = packetMap.get(packetId) || {}
      const caseLifecycle = lifecycle.get(lifecycleKey(packetId, supportReference)) || {}
      const caseStatus = caseLifecycle.resolvedAt ? 'resolved' : caseLifecycle.acknowledgedAt ? 'acknowledged' : 'open'
      const createdMs = Date.parse(event?.created_at || '')
      const acknowledgedMs = Date.parse(caseLifecycle.acknowledgedAt || '')
      const responseDueMs = Number.isFinite(createdMs) ? createdMs + responseSlaMs : null
      const resolutionDueMs = Number.isFinite(acknowledgedMs) ? acknowledgedMs + resolutionSlaMs : null
      const slaState = caseStatus === 'resolved'
        ? 'complete'
        : caseStatus === 'acknowledged'
          ? Number.isFinite(resolutionDueMs) && nowMs > resolutionDueMs ? 'resolution_overdue' : 'resolution_due'
          : Number.isFinite(responseDueMs) && nowMs > responseDueMs ? 'response_overdue' : 'response_due'
      return {
        id: normalizeText(event?.id),
        supportReference,
        packetId,
        packetTitle: normalizeText(packet?.title) || 'Legal document packet',
        packetStatus: normalizeText(packet?.status).toLowerCase() || 'unknown',
        packetType: normalizePacketType(payload.packetType || packet?.packet_type),
        failureCode: normalizeText(payload.failureCode).replace(/[^A-Z0-9_]/gi, '').toUpperCase().slice(0, 64) || 'GENERATION_FAILED',
        surface: ['workspace', 'packet_panel', 'document_builder'].includes(payload.surface) ? payload.surface : 'workspace',
        failureCount: Math.max(1, Math.min(99, Number(payload.failureCount || 1))),
        escalationType: payload.escalationType === 'administrator' ? 'administrator' : 'support',
        actorId: normalizeText(event?.created_by) || null,
        createdAt: normalizeText(event?.created_at),
        caseStatus,
        acknowledgedAt: caseLifecycle.acknowledgedAt || null,
        acknowledgedBy: caseLifecycle.acknowledgedBy || null,
        resolvedAt: caseLifecycle.resolvedAt || null,
        resolvedBy: caseLifecycle.resolvedBy || null,
        resolutionCode: caseLifecycle.resolutionCode || null,
        ageMinutes: Number.isFinite(createdMs) ? Math.max(0, Math.floor((nowMs - createdMs) / 60000)) : null,
        responseDueAt: isoFromMs(responseDueMs),
        resolutionDueAt: isoFromMs(resolutionDueMs),
        slaState,
        overdue: slaState.endsWith('_overdue'),
        nextAction: caseStatus === 'resolved' ? 'No action required' : caseStatus === 'acknowledged' ? 'Resolve the support handoff' : 'Acknowledge the support handoff',
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      const priority = { response_overdue: 0, resolution_overdue: 1, response_due: 2, resolution_due: 3, complete: 4 }
      const priorityDifference = (priority[left.slaState] ?? 9) - (priority[right.slaState] ?? 9)
      return priorityDifference || Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0)
    })
  return {
    handoffs,
    summary: {
      total: handoffs.length,
      otp: handoffs.filter((row) => row.packetType === 'otp').length,
      mandate: handoffs.filter((row) => row.packetType === 'mandate').length,
      administrator: handoffs.filter((row) => row.escalationType === 'administrator').length,
      support: handoffs.filter((row) => row.escalationType === 'support').length,
      repeatedFailures: handoffs.filter((row) => row.failureCount > 1).length,
      open: handoffs.filter((row) => row.caseStatus === 'open').length,
      acknowledged: handoffs.filter((row) => row.caseStatus === 'acknowledged').length,
      resolved: handoffs.filter((row) => row.caseStatus === 'resolved').length,
      overdue: handoffs.filter((row) => row.overdue).length,
      responseOverdue: handoffs.filter((row) => row.slaState === 'response_overdue').length,
      resolutionOverdue: handoffs.filter((row) => row.slaState === 'resolution_overdue').length,
    },
    sla: { responseMinutes: responseSlaMs / 60000, resolutionMinutes: resolutionSlaMs / 60000 },
  }
}
