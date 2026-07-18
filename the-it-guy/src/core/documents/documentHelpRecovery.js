import { resolveDocumentAudience } from './documentRoleGuidance.js'

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function includesAny(value, phrases) {
  return phrases.some((phrase) => value.includes(phrase))
}

function recovery({ audience, surface, category, title, summary, steps, action = null, tone = 'attention' }) {
  return {
    contract: 'arch9-document-help-recovery-v1',
    audience,
    surface,
    category,
    tone,
    title,
    summary,
    steps,
    action,
    hasIssue: true,
  }
}

export function buildDocumentHelpRecovery({ surface = 'workspace', role = '', state = 'draft', issue = '', hasPreview = true } = {}) {
  const normalizedSurface = key(surface)
  const audience = resolveDocumentAudience(role)
  const normalizedState = key(state)
  const safeIssue = text(issue).toLowerCase().slice(0, 600)
  const base = { contract: 'arch9-document-help-recovery-v1', audience, surface: normalizedSurface }

  if (safeIssue) {
    if (normalizedSurface === 'signer_portal' && includesAny(safeIssue, ['expired', 'invalid', 'request a new signing link', 'link unavailable'])) {
      return recovery({ audience, surface: normalizedSurface, category: 'link', title: 'You need a fresh signing link', summary: 'The document is safe, but this link can no longer be used.', steps: ['Ask the agent or document sender for a new secure link.', 'Use only the newest invitation you receive.', 'You will not need to sign fields already accepted by the document.'] })
    }
    if (includesAny(safeIssue, ['required field', 'complete all', 'add your signature'])) {
      return recovery({ audience, surface: normalizedSurface, category: 'fields', title: 'A required field is still incomplete', summary: 'Nothing has been submitted yet. Complete the highlighted field and try again.', steps: ['Choose Next required field.', 'Add the requested signature or initials.', 'Choose Complete Signing when the progress shows 100%.'], action: { id: 'next_field', label: 'Go to next field' } })
    }
    if (includesAny(safeIssue, ['sign first', 'waiting for agent'])) {
      return recovery({ audience, surface: normalizedSurface, category: 'waiting', title: 'Another party must sign first', summary: 'Your document is not blocked. The signing order has not reached you yet.', steps: ['No action is required from you now.', 'Wait for the next secure invitation.', 'Contact the sender only if the expected invitation does not arrive.'], tone: 'info' })
    }
    if (includesAny(safeIssue, ['conflict', 'changed elsewhere', 'stale'])) {
      return recovery({ audience, surface: normalizedSurface, category: 'conflict', title: 'A newer document change is available', summary: 'Refresh before continuing so that you do not overwrite somebody else’s work.', steps: ['Refresh the document.', 'Review the newest wording.', 'Reapply your change if it is still needed.'], action: { id: 'refresh', label: 'Refresh document' } })
    }
    if (includesAny(safeIssue, ['missing', 'required information', 'validation', 'complete the document'])) {
      return recovery({ audience, surface: normalizedSurface, category: 'information', title: 'Document information needs attention', summary: 'The draft has not been sent. Review the missing or invalid information first.', steps: ['Open the editable document details.', 'Complete the highlighted information.', 'Generate and review the PDF again.'], action: { id: 'review_information', label: 'Review information' } })
    }
    if (includesAny(safeIssue, ['network', 'connection', 'temporarily', 'try again', 'retry', 'could not', 'unable'])) {
      return recovery({ audience, surface: normalizedSurface, category: 'temporary', title: 'This step did not finish', summary: 'Your saved document remains available. Retry the step before making duplicate changes or invitations.', steps: ['Check that your connection is active.', 'Retry once.', 'If it fails again, refresh and check the document status before repeating the action.'], action: { id: 'retry', label: 'Try again' } })
    }
    return recovery({ audience, surface: normalizedSurface, category: 'general', title: 'This step needs attention', summary: 'The document remains available. Check its current status before trying the action again.', steps: ['Review the status and responsibility cards.', 'Retry the current step once.', 'Ask the document owner for help if the same message returns.'], action: { id: 'retry', label: 'Try again' } })
  }

  const signer = normalizedSurface === 'signer_portal'
  return {
    ...base,
    category: 'help',
    tone: 'neutral',
    hasIssue: false,
    title: 'Need help?',
    summary: signer ? 'Your work is saved as each field is completed.' : 'Use the status, action and responsibility cards to find the next step.',
    steps: signer
      ? ['Read the full document before signing.', 'Use Next required field to move through the document.', 'Ask the sender for a new link if this one expires.']
      : normalizedState === 'completed'
        ? ['Open the signed PDF for the final record.', 'Use the completion certificate for signing evidence.', 'Review signing history if you need the timeline.']
        : ['Follow the first recommended action.', 'Check who owns the current step before following up.', hasPreview ? 'Review the PDF before it is sent.' : 'Generate the PDF before setting up signatures.'],
    action: null,
  }
}
