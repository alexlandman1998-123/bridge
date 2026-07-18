export const DOCUMENT_LIFECYCLE_STATES = Object.freeze([
  'draft',
  'pdf_generated',
  'ready_to_send',
  'sent',
  'partially_signed',
  'completed',
  'archived',
])

export const DOCUMENT_LIFECYCLE_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['pdf_generated', 'archived']),
  pdf_generated: Object.freeze(['draft', 'ready_to_send', 'archived']),
  ready_to_send: Object.freeze(['draft', 'pdf_generated', 'sent', 'archived']),
  sent: Object.freeze(['partially_signed', 'completed', 'archived']),
  partially_signed: Object.freeze(['completed', 'archived']),
  completed: Object.freeze(['archived']),
  archived: Object.freeze([]),
})

const LIFECYCLE_ALIASES = Object.freeze({
  draft: 'draft',
  ready_for_generation: 'draft',
  in_review: 'draft',
  generated: 'pdf_generated',
  pdf_generated: 'pdf_generated',
  approved: 'ready_to_send',
  locked: 'ready_to_send',
  signing_prep: 'ready_to_send',
  ready_to_send: 'ready_to_send',
  sent: 'sent',
  sent_for_signature: 'sent',
  sent_to_agent: 'sent',
  sent_to_seller: 'sent',
  generated_for_physical_signature: 'sent',
  partially_signed: 'partially_signed',
  agent_signed: 'partially_signed',
  seller_signed: 'partially_signed',
  viewed: 'sent',
  signed: 'completed',
  completed: 'completed',
  uploaded_signed: 'completed',
  archived: 'archived',
  voided: 'archived',
  cancelled: 'archived',
})

const STORAGE_STATUS_BY_LIFECYCLE = Object.freeze({
  draft: 'draft',
  pdf_generated: 'generated',
  ready_to_send: 'signing_prep',
  sent: 'sent',
  partially_signed: 'partially_signed',
  completed: 'completed',
  archived: 'archived',
})

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeDocumentLifecycleState(value, { fallback = 'draft' } = {}) {
  const normalized = LIFECYCLE_ALIASES[normalizeKey(value)]
  if (normalized) return normalized
  if (fallback === null) return null
  return LIFECYCLE_ALIASES[normalizeKey(fallback)] || 'draft'
}

export function toDocumentPacketStorageStatus(value) {
  const lifecycleState = normalizeDocumentLifecycleState(value)
  return STORAGE_STATUS_BY_LIFECYCLE[lifecycleState]
}

export function resolveDocumentLifecycleStateFromPacket(packet = null) {
  const storageState = normalizeDocumentLifecycleState(packet?.status, { fallback: null })
  const sourceState = normalizeDocumentLifecycleState(
    packet?.source_context_json?.lifecycle_state || packet?.sourceContextJson?.lifecycle_state,
    { fallback: null },
  )
  if (!sourceState) return storageState || 'draft'
  if (!storageState) return sourceState
  if (['sent', 'partially_signed', 'completed', 'archived'].includes(storageState)) return storageState
  if (storageState === 'ready_to_send') return 'ready_to_send'
  if (storageState === 'pdf_generated' && sourceState === 'draft') return 'pdf_generated'
  return sourceState
}

export function canTransitionDocumentLifecycle(currentState, nextState, { allowSame = true } = {}) {
  const current = normalizeDocumentLifecycleState(currentState, { fallback: null })
  const next = normalizeDocumentLifecycleState(nextState, { fallback: null })
  if (!current || !next) return false
  if (allowSame && current === next) return true
  return DOCUMENT_LIFECYCLE_TRANSITIONS[current].includes(next)
}

export function assertDocumentLifecycleTransition(currentState, nextState, options = {}) {
  const current = normalizeDocumentLifecycleState(currentState, { fallback: null })
  const next = normalizeDocumentLifecycleState(nextState, { fallback: null })
  if (!current) throw new Error(`Unknown document lifecycle state: ${String(currentState || '(empty)')}`)
  if (!next) throw new Error(`Unknown document lifecycle state: ${String(nextState || '(empty)')}`)
  if (!canTransitionDocumentLifecycle(current, next, options)) {
    throw new Error(`Transition blocked: ${current.replace(/_/g, ' ')} cannot move to ${next.replace(/_/g, ' ')}.`)
  }
  return next
}

export function isDocumentLifecycleEditable(value) {
  return ['draft', 'pdf_generated'].includes(normalizeDocumentLifecycleState(value))
}

export function isDocumentLifecycleInSigning(value) {
  return ['sent', 'partially_signed'].includes(normalizeDocumentLifecycleState(value))
}

export function isDocumentLifecycleTerminal(value) {
  return ['completed', 'archived'].includes(normalizeDocumentLifecycleState(value))
}

export function getDocumentLifecycleLabel(value) {
  const labels = {
    draft: 'Draft',
    pdf_generated: 'PDF Generated',
    ready_to_send: 'Ready to Send',
    sent: 'Sent for Signature',
    partially_signed: 'Partially Signed',
    completed: 'Completed',
    archived: 'Archived',
  }
  return labels[normalizeDocumentLifecycleState(value)]
}
