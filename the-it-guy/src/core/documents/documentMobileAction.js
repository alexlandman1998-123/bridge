function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function safeAction(action = null) {
  const id = key(action?.id)
  const label = text(action?.label)
  if (!id || !label || action?.disabled) return null
  return { id, label, description: text(action?.description) || null }
}

export function buildDocumentMobileAction({
  surface = 'workspace',
  primaryAction = null,
  recoveryAction = null,
  remainingFields = 0,
  requiredFields = 0,
  canComplete = false,
  currentOwnerLabel = '',
  blocked = false,
} = {}) {
  const normalizedSurface = key(surface)
  const remaining = Math.max(0, Number(remainingFields) || 0)
  const required = Math.max(0, Number(requiredFields) || 0)
  const recovery = safeAction(recoveryAction)
  let action = recovery
  let helper = recovery?.description || ''
  let contextLabel = recovery ? 'Needs attention' : 'Next action'

  if (blocked && !recovery) return null

  if (!action && normalizedSurface === 'signer_portal') {
    if (canComplete) {
      action = { id: 'complete_signing', label: 'Complete signing', description: 'All required fields are finished.' }
      helper = 'All required fields are complete. Submit your signing securely.'
    } else if (remaining > 0) {
      action = { id: 'next_field', label: 'Next required field', description: `${remaining} required field${remaining === 1 ? '' : 's'} remaining.` }
      helper = action.description
    } else {
      action = { id: 'review_document', label: 'Review document', description: required ? 'Review your completed fields.' : 'No signing fields are available yet.' }
      helper = action.description
    }
  }

  if (!action) {
    action = safeAction(primaryAction)
    helper = action?.description || ''
  }
  if (!action) return null

  const owner = text(currentOwnerLabel)
  return {
    contract: 'arch9-document-mobile-action-v1',
    surface: normalizedSurface,
    contextLabel,
    action,
    helper: helper || (owner ? `Currently with ${owner}.` : 'Continue with the next document step.'),
  }
}
