import { buildDocumentExperienceTelemetryEvent } from '../core/documents/documentExperienceTelemetry.js'
import { trackTelemetryEvent } from './observability/telemetry.js'

export async function recordDocumentExperienceEvent({ userId = '', workspaceId = '', transport = trackTelemetryEvent, ...input } = {}) {
  const event = buildDocumentExperienceTelemetryEvent({
    ...input,
    viewport: input.viewport || (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches ? 'mobile' : 'desktop'),
  })
  if (!event) return { accepted: false, persisted: false, reason: 'unsupported_event' }

  let dispatched = false
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('arch9:document-experience', { detail: event }))
    dispatched = true
  }

  if (!String(userId || '').trim()) return { accepted: true, dispatched, persisted: false, reason: 'anonymous_surface', event }
  const result = await transport({
    category: 'document_experience',
    eventName: event.eventName,
    userId: String(userId).trim(),
    workspaceId: String(workspaceId || '').trim(),
    route: '/document-experience',
    severity: event.severity,
    metadata: {
      contract: event.contract,
      surface: event.surface,
      audience: event.audience,
      packetType: event.packetType,
      state: event.state,
      actionId: event.actionId,
      category: event.category,
      viewport: event.viewport,
    },
  })
  return { accepted: true, dispatched, event, ...result }
}
