export const LEGAL_WORKSPACE_UX_TELEMETRY_CONTRACT = 'arch9-legal-workspace-ux-v1'

export const LEGAL_WORKSPACE_UX_EVENTS = Object.freeze({
  taskViewed: 'task_viewed',
  primaryActionClicked: 'primary_action_clicked',
  secondaryActionClicked: 'secondary_action_clicked',
  completionClicked: 'completion_clicked',
  taskStatusUpdated: 'task_status_updated',
  returnPathUsed: 'return_path_used',
})

const SUPPORTED_EVENTS = new Set(Object.values(LEGAL_WORKSPACE_UX_EVENTS))
const SUPPORTED_LANES = new Set(['transfer', 'bond', 'cancellation'])
const SUPPORTED_TASK_TYPES = new Set([
  'capture_information',
  'collect_documents',
  'review_evidence',
  'request_external_action',
  'schedule_action',
  'confirm_milestone',
])
const SUPPORTED_STATUSES = new Set(['not_started', 'in_progress', 'waiting', 'blocked', 'completed', 'delayed'])
const SUPPORTED_ACTIONS = new Set([
  'capture_data',
  'request_document',
  'upload_document',
  'review_document',
  'open_documents',
  'open_parties',
  'open_finance',
  'schedule_signing',
  'add_note',
  'mark_complete',
  'mark_blocked',
  'mark_waiting',
  'mark_in_progress',
])
const SUPPORTED_PLACEMENTS = new Set(['task_view', 'primary', 'secondary', 'completion', 'status_modal', 'return_banner'])
const SUPPORTED_VIEWPORTS = new Set(['desktop', 'short_laptop', 'tablet', 'mobile'])
const SUPPORTED_OUTCOMES = new Set(['started', 'success', 'failure', 'cancelled'])
const SUPPORTED_TARGETS = new Set(['work', 'documents', 'stakeholders', 'finance', 'overview'])

function allowed(value, values, fallback = 'unknown') {
  const normalized = String(value || '').trim().toLowerCase()
  return values.has(normalized) ? normalized : fallback
}

function boundedMilliseconds(value) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0
  return Math.min(Math.round(numberValue), 60 * 60 * 1000)
}

export function resolveLegalWorkspaceViewport({ width = 0, height = 0 } = {}) {
  const safeWidth = Number(width) || 0
  const safeHeight = Number(height) || 0
  if (safeWidth && safeWidth < 768) return 'mobile'
  if (safeWidth && safeWidth < 1180) return 'tablet'
  if (safeHeight && safeHeight < 760) return 'short_laptop'
  return 'desktop'
}

export function buildLegalWorkspaceUxTelemetryEvent({
  eventName = '',
  lane = '',
  taskType = '',
  status = '',
  actionId = '',
  placement = '',
  elapsedMs = 0,
  viewport = '',
  targetWorkspace = '',
  outcome = 'started',
} = {}) {
  const normalizedEventName = String(eventName || '').trim()
  if (!SUPPORTED_EVENTS.has(normalizedEventName)) return null

  return {
    contract: LEGAL_WORKSPACE_UX_TELEMETRY_CONTRACT,
    eventName: normalizedEventName,
    severity: outcome === 'failure' ? 'warning' : 'info',
    metadata: {
      contract: LEGAL_WORKSPACE_UX_TELEMETRY_CONTRACT,
      lane: allowed(lane, SUPPORTED_LANES),
      taskType: allowed(taskType, SUPPORTED_TASK_TYPES),
      status: allowed(status, SUPPORTED_STATUSES),
      actionId: actionId ? allowed(actionId, SUPPORTED_ACTIONS, 'other') : 'none',
      placement: allowed(placement, SUPPORTED_PLACEMENTS),
      elapsedMs: boundedMilliseconds(elapsedMs),
      viewport: allowed(viewport, SUPPORTED_VIEWPORTS, 'desktop'),
      targetWorkspace: targetWorkspace ? allowed(targetWorkspace, SUPPORTED_TARGETS, 'other') : 'none',
      outcome: allowed(outcome, SUPPORTED_OUTCOMES, 'started'),
    },
  }
}
