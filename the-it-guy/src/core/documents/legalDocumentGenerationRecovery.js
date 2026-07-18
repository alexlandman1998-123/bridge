function normalizeText(value) {
  return String(value || '').trim()
}

function packetLabel(packetType) {
  return normalizeText(packetType).toLowerCase() === 'otp' ? 'OTP' : 'mandate'
}

function inferredCode(error) {
  const code = normalizeText(error?.code).toUpperCase()
  if (code) return code
  const message = normalizeText(error?.message || error).toLowerCase()
  return message.includes('taking too long') || message.includes('timed out') || message.includes('timeout')
    ? 'GENERATION_TIMEOUT'
    : ''
}

function validationRecovery(error, label) {
  const routingFacts = Array.isArray(error?.validation?.legalDocumentMissingRoutingFacts)
    ? error.validation.legalDocumentMissingRoutingFacts
    : []
  const critical = Array.isArray(error?.validation?.critical) ? error.validation.critical : []
  const fields = routingFacts.length
    ? routingFacts.map((field) => String(field).replace(/_/g, ' '))
    : critical.map((item) => normalizeText(item?.placeholderLabel || item?.field || item?.message)).filter(Boolean)
  return {
    code: 'VALIDATION_BLOCKED',
    label: 'Information needed',
    message: fields.length ? `${label} generation needs: ${fields.slice(0, 6).join(', ')}.` : `${label} generation needs more required information.`,
    nextAction: 'Complete the highlighted information, then select Generate again.',
    retryable: false,
    actionKey: 'review_information',
    actionLabel: 'Review information',
  }
}

/** Converts generation failures to a safe, actionable user-facing contract. */
export function resolveLegalDocumentGenerationRecovery(error = null, { packetType = 'mandate' } = {}) {
  const code = inferredCode(error)
  const label = packetLabel(packetType)
  if (['VALIDATION_BLOCKED', 'WARNINGS_BLOCKED', 'MANDATE_PREFLIGHT_BLOCKED'].includes(code)) return validationRecovery(error, label)
  if (code === 'GENERATION_ALREADY_IN_PROGRESS') return { code, label: 'Generation already running', message: `Another ${label} generation is already running for this packet. Your details are safe and a second copy was not started.`, nextAction: 'Wait a moment, then refresh the packet status.', retryable: true, actionKey: 'refresh', actionLabel: 'Refresh status' }
  if (code === 'GENERATION_TIMEOUT') return { code, label: 'Generation is taking longer than expected', message: `${label} generation stopped waiting before completion could be confirmed. Your entered details are still available.`, nextAction: 'Refresh the draft status once before starting another generation.', retryable: true, actionKey: 'refresh', actionLabel: 'Refresh status' }
  if (['AUTH_REQUIRED', 'AUTH_INVALID', 'JWT_EXPIRED', 'UNAUTHENTICATED'].includes(code)) return { code, label: 'Sign-in needs attention', message: `${label} generation could not confirm your signed-in session.`, nextAction: 'Sign in again, return to this packet, and select Generate.', retryable: true, actionKey: 'sign_in', actionLabel: 'Sign in again' }
  if (['PACKETS_RLS_DENIED', 'FORBIDDEN', 'GENERATION_FORBIDDEN'].includes(code)) return { code, label: 'Access needs attention', message: `Your current organisation role cannot generate this ${label}.`, nextAction: 'Ask an organisation administrator to check your legal-document access.', retryable: false, actionKey: 'contact_admin', actionLabel: 'Copy admin reference' }
  if (['MISSING_TEMPLATE_FILE', 'NATIVE_TEMPLATE_NOT_RENDERABLE', 'LEGAL_TEMPLATE_APPROVAL_REQUIRED', 'TEMPLATE_NOT_APPROVED', 'TEMPLATE_SOURCE_MISMATCH'].includes(code)) return { code, label: 'Template setup needs attention', message: `The approved ${label} template is not ready to generate a document.`, nextAction: 'Ask a legal-template administrator to review and activate the approved template.', retryable: false, actionKey: 'contact_admin', actionLabel: 'Copy admin reference' }
  if (['STORAGE_UPLOAD_FAILED', 'DOCUMENT_RECORD_CREATE_FAILED', 'MISSING_DOCUMENT_RECORD', 'MISSING_RENDERED_FILE_PATH', 'MISSING_RENDERED_FILE_REFERENCE', 'PACKET_VERSION_CREATE_FAILED'].includes(code)) return { code, label: 'Draft could not be saved', message: `${label} generation did not produce a saved draft. No document should be sent from this attempt.`, nextAction: 'Select Generate once more. If it fails again, contact support with the packet reference.', retryable: true, actionKey: 'retry', actionLabel: 'Try generation once' }
  if (['HTML_RENDER_FAILED', 'PDF_RENDER_FAILED', 'DOCX_RENDER_FAILED', 'RENDER_FAILED', 'GENERATOR_REQUEST_FAILED'].includes(code)) return { code, label: 'Draft could not be assembled', message: `The ${label} document could not be assembled from the approved template. Your entered details are still available.`, nextAction: 'Select Generate once more. If it fails again, ask a legal-template administrator to review the template.', retryable: true, actionKey: 'retry', actionLabel: 'Try generation once' }
  return { code: code || 'GENERATION_FAILED', label: 'Generation did not complete', message: `Arch9 could not confirm a usable ${label} draft. Your entered details are still available.`, nextAction: 'Select Generate once more. If it fails again, contact support with the packet reference.', retryable: true, actionKey: 'retry', actionLabel: 'Try generation once' }
}

export function formatLegalDocumentGenerationRecovery(error = null, options = {}) {
  const recovery = resolveLegalDocumentGenerationRecovery(error, options)
  return `${recovery.message} Next step: ${recovery.nextAction}`
}
