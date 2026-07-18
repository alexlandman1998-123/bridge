function text(value) {
  return String(value || '').trim()
}

function safePhrase(value, limit = 220) {
  return text(value)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '')
    .replace(/\b(?:signing_)?token\s*[:=]\s*\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
}

function targetId(value, fallback) {
  const candidate = text(value)
  return /^[a-z][a-z0-9_-]*$/i.test(candidate) ? candidate : fallback
}

export function buildDocumentAccessibility({
  surface = 'workspace',
  journey = null,
  responsibility = null,
  helpRecovery = null,
  mobileAction = null,
  completedFields = 0,
  requiredFields = 0,
  contentTargetId = '',
  actionsTargetId = '',
} = {}) {
  const phrases = []
  if (helpRecovery?.hasIssue) {
    phrases.push(safePhrase(helpRecovery.title), safePhrase(helpRecovery.summary))
  } else {
    phrases.push(safePhrase(journey?.title), safePhrase(journey?.summary))
  }

  const required = Math.max(0, Number(requiredFields) || 0)
  const completed = Math.max(0, Math.min(required || Number(completedFields) || 0, Number(completedFields) || 0))
  if (required > 0) phrases.push(`${completed} of ${required} required signing fields complete.`)

  if (responsibility?.currentOwner?.isViewer) phrases.push('You are responsible for the current step.')
  else if (responsibility?.currentOwner) {
    const owner = safePhrase(responsibility.currentOwner.name || responsibility.currentOwner.roleLabel || responsibility.currentOwner.label, 80)
    if (owner) phrases.push(`Current responsibility: ${owner}.`)
  }

  const nextAction = safePhrase(mobileAction?.action?.label, 80)
  if (nextAction) phrases.push(`Next action: ${nextAction}.`)

  return {
    contract: 'arch9-document-accessibility-v1',
    surface: safePhrase(surface, 30).toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
    announcement: phrases.filter(Boolean).join(' '),
    contentTargetId: targetId(contentTargetId, 'document-main-content'),
    actionsTargetId: targetId(actionsTargetId, 'document-main-actions'),
  }
}
