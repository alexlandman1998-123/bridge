import { resolveDocumentAudience } from './documentRoleGuidance.js'

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function action(id, label, description, priority = 'secondary', disabled = false) {
  return { id, label, description, priority, disabled: Boolean(disabled) }
}

function workspaceActions({ audience, state, canEdit, canSend, canFinalize, finalCopyAvailable, certificateAvailable }) {
  if (state === 'completed') return [
    action('open_final', 'Open signed PDF', 'View the immutable completed document.', 'primary', !finalCopyAvailable),
    action('open_certificate', 'Completion certificate', 'View or download completion evidence.', 'secondary', !certificateAvailable),
    action('open_activity', 'Signing history', 'Review the signing audit timeline.'),
  ]
  if (['publishing', 'finalising'].includes(state)) return [
    action('open_final', 'Check final PDF', 'Open the completed PDF when it becomes available.', 'primary', !finalCopyAvailable),
    action('open_activity', 'Signing history', 'Review the completion events.'),
    ...(canFinalize ? [action('retry_completion', 'Retry completion', 'Retry final publication if processing has stalled.')] : []),
  ]
  if (['awaiting_signers', 'partially_signed', 'attention_required'].includes(state)) return [
    action('open_signers', state === 'attention_required' ? 'Review signer issue' : 'Signer progress', 'See who opened, signed or needs follow-up.', 'primary'),
    action('open_activity', 'Signing history', 'Review invitations, reminders and signature evidence.'),
  ]
  if (state === 'ready_to_send') return [
    action('open_preview', 'Review PDF', 'Check the exact document that will be sent.', 'primary'),
    action('prepare_signatures', 'Signature fields', 'Verify signer details and field placement.'),
    ...(canSend ? [action('send_document', 'Send for signature', 'Send secure links to the signing parties.', 'secondary')] : []),
  ]
  if (state === 'pdf_ready') return [
    action('open_preview', 'Review PDF', 'Check the generated document.', 'primary'),
    action('prepare_signatures', 'Set signature fields', 'Place signature and initial blocks for each party.'),
    ...(canEdit ? [action('edit_document', 'Edit document', 'Return to the editable wording.')] : []),
  ]
  const firstLabel = audience === 'attorney' ? 'Review wording' : 'Edit document'
  return [
    action('edit_document', firstLabel, 'Open the editable document sections.', 'primary', !canEdit),
    action('open_preview', 'Preview document', 'Review how the current draft reads.'),
  ]
}

function signerActions({ remainingFields, requiredFields, canComplete }) {
  return [
    action('next_field', remainingFields > 0 ? 'Next required field' : 'Review completed fields', remainingFields > 0 ? `${remainingFields} required field${remainingFields === 1 ? '' : 's'} remaining.` : 'Return to the document fields.', 'primary', requiredFields === 0),
    action('review_document', 'Review document', 'Return to the beginning and read the full document.'),
    action('complete_signing', 'Complete signing', 'Submit only after every required field is complete.', 'secondary', !canComplete),
  ]
}

export function buildDocumentRoleActions({
  surface = 'workspace',
  role = '',
  state = 'draft',
  canEdit = false,
  canSend = false,
  canFinalize = false,
  finalCopyAvailable = false,
  certificateAvailable = false,
  remainingFields = 0,
  requiredFields = 0,
  canComplete = false,
} = {}) {
  const audience = resolveDocumentAudience(role)
  const actions = key(surface) === 'signer_portal'
    ? signerActions({ remainingFields: Math.max(0, Number(remainingFields) || 0), requiredFields: Math.max(0, Number(requiredFields) || 0), canComplete })
    : workspaceActions({ audience, state: key(state), canEdit, canSend, canFinalize, finalCopyAvailable, certificateAvailable })
  return { contract: 'arch9-document-role-actions-v1', surface: key(surface), audience, actions: actions.slice(0, 3) }
}
