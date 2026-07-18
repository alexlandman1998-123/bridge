import { resolveDocumentAudience } from './documentRoleGuidance.js'

const EVENT_NAMES = new Set(['journey_viewed', 'primary_action_selected', 'recovery_selected', 'commit_opened', 'commit_confirmed', 'outcome_shown'])
const SURFACES = new Set(['workspace', 'signer_portal'])
const PACKET_TYPES = new Set(['mandate', 'otp', 'document'])
const STATES = new Set(['loading', 'draft', 'pdf_ready', 'ready_to_send', 'awaiting_signers', 'partially_signed', 'attention_required', 'finalising', 'publishing', 'completed', 'voided', 'archived', 'pending', 'sent', 'viewed', 'signed', 'expired', 'declined'])
const ACTION_IDS = new Set(['edit_document', 'open_preview', 'prepare_signatures', 'send_document', 'send_signature', 'open_signers', 'open_activity', 'open_final', 'open_certificate', 'retry_completion', 'workspace_primary', 'review_information', 'refresh', 'retry', 'next_field', 'review_document', 'complete_signing'])
const CATEGORIES = new Set(['attention', 'general', 'sent', 'follow_up', 'generated', 'completed', 'signature_setup', 'saved', 'signer_field', 'signer_complete', 'information', 'link', 'fields', 'waiting', 'conflict', 'temporary', 'help'])

function key(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function catalogValue(value, catalog, fallback = null) {
  const normalized = key(value)
  return catalog.has(normalized) ? normalized : fallback
}

export function buildDocumentExperienceTelemetryEvent({ eventName = '', surface = 'workspace', role = '', packetType = 'document', state = '', actionId = '', category = '', viewport = '' } = {}) {
  const event = key(eventName)
  if (!EVENT_NAMES.has(event)) return null
  const normalizedSurface = key(surface)
  const type = key(packetType)
  return {
    contract: 'arch9-document-experience-telemetry-v1',
    eventName: `document_experience_${event}`,
    surface: SURFACES.has(normalizedSurface) ? normalizedSurface : 'workspace',
    audience: resolveDocumentAudience(role),
    packetType: PACKET_TYPES.has(type) ? type : 'document',
    state: catalogValue(state, STATES, 'unknown'),
    actionId: catalogValue(actionId, ACTION_IDS),
    category: catalogValue(category, CATEGORIES),
    viewport: ['mobile', 'desktop'].includes(key(viewport)) ? key(viewport) : 'unknown',
    severity: ['recovery_selected'].includes(event) ? 'warning' : 'info',
  }
}

export { EVENT_NAMES as DOCUMENT_EXPERIENCE_EVENT_NAMES }
