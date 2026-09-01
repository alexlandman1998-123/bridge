import {
  buildLegalWorkspaceUxTelemetryEvent,
  resolveLegalWorkspaceViewport,
} from '../core/transactions/legalWorkspaceUxTelemetry.js'
import { trackTelemetryEvent } from './observability/telemetry.js'

export async function recordLegalWorkspaceUxEvent({
  userId = '',
  workspaceId = '',
  transport = trackTelemetryEvent,
  ...input
} = {}) {
  const viewport = input.viewport || (typeof window !== 'undefined'
    ? resolveLegalWorkspaceViewport({ width: window.innerWidth, height: window.innerHeight })
    : 'desktop')
  const event = buildLegalWorkspaceUxTelemetryEvent({ ...input, viewport })
  if (!event) return { accepted: false, dispatched: false, persisted: false, reason: 'unsupported_event' }

  let dispatched = false
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('arch9:legal-workspace-ux', { detail: event }))
    dispatched = true
  }

  const safeUserId = String(userId || '').trim()
  if (!safeUserId) return { accepted: true, dispatched, persisted: false, reason: 'anonymous_surface', event }

  const result = await transport({
    category: 'legal_workspace_ux',
    eventName: event.eventName,
    userId: safeUserId,
    workspaceId: String(workspaceId || '').trim(),
    route: '/attorney/legal-workspace',
    severity: event.severity,
    metadata: event.metadata,
  })
  return { accepted: true, dispatched, event, ...result }
}
