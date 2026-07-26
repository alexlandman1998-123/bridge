function text(value) {
  return String(value || '').trim()
}

function safeMessage(value) {
  return text(value)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:signing_)?token\s*[:=]\s*\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420)
}

function includesAny(value, phrases) {
  return phrases.some((phrase) => value.includes(phrase))
}

export function buildDocumentOutcomeFeedback({ surface = 'workspace', message = '', remainingFields = 0 } = {}) {
  const safe = safeMessage(message)
  if (!safe) return null
  const normalized = safe.toLowerCase()
  const remaining = Math.max(0, Number(remainingFields) || 0)
  const attention = includesAny(normalized, ['failed', 'unable', 'could not', 'needs attention', 'please retry', 'not available'])
  let title = attention ? 'This step needs attention' : 'Action complete'
  let nextStep = attention ? 'Review the recovery guidance before trying this step again.' : 'Continue with the next recommended document action.'
  let category = attention ? 'attention' : 'general'

  if (String(surface).toLowerCase().includes('signer') && normalized === 'saving') {
    title = 'Saving'
    nextStep = 'Keep this page open while your signing is recorded.'
    category = 'signer_saving'
  } else if (!attention && String(surface).toLowerCase().includes('signer') && includesAny(normalized, ['signing recorded', 'signing submitted', 'securely recorded'])) {
    title = 'Signing recorded'
    nextStep = 'The completed PDF will appear here when it is ready.'
    category = 'signer_recorded'
  } else if (!attention && String(surface).toLowerCase().includes('signer') && includesAny(normalized, ['finalising pdf'])) {
    title = 'Finalising PDF'
    nextStep = 'You can check again in a moment. No new signing link is needed.'
    category = 'signer_finalising'
  } else if (!attention && String(surface).toLowerCase().includes('signer') && includesAny(normalized, ['pdf ready'])) {
    title = 'PDF ready'
    nextStep = 'Open or download the completed PDF.'
    category = 'signer_pdf_ready'
  } else if (!attention && includesAny(normalized, ['sent for signature', 'document sent'])) {
    title = 'Sent for signature'
    nextStep = 'Track signer progress and wait before sending a reminder.'
    category = 'sent'
  } else if (!attention && includesAny(normalized, ['reminder sent', 'link resent', 'links resent'])) {
    title = 'Signer follow-up sent'
    nextStep = 'Check the signer timeline before following up again.'
    category = 'follow_up'
  } else if (!attention && includesAny(normalized, ['generated successfully', 'generation completed', 'generated draft', 'draft generated'])) {
    title = 'Document generated'
    nextStep = 'Review the PDF, then confirm signer details and field placement.'
    category = 'generated'
  } else if (!attention && includesAny(normalized, ['final signed', 'signed mandate uploaded', 'archived and locked', 'all signers completed'])) {
    title = 'Signed record ready'
    nextStep = 'Open or download the final signed PDF from the transaction.'
    category = 'completed'
  } else if (!attention && includesAny(normalized, ['signature block', 'signing layout', 'signer fields prepared'])) {
    title = 'Signature setup saved'
    nextStep = 'Review the exact PDF and signer assignments before sending.'
    category = 'signature_setup'
  } else if (!attention && includesAny(normalized, ['saved', 'restored', 'selected', 'removed from this draft'])) {
    title = 'Changes saved'
    nextStep = 'Continue with the next recommended document action.'
    category = 'saved'
  } else if (String(surface).toLowerCase().includes('signer') && includesAny(normalized, ['signature applied', 'initial applied', 'signature added', 'initial added', 'already complete', 'applied to'])) {
    title = normalized.includes('already complete') ? 'Field already complete' : 'Field saved'
    nextStep = remaining > 0 ? `${remaining} required field${remaining === 1 ? '' : 's'} remaining. Continue to the next field.` : 'All required fields are ready. Review and complete signing.'
    category = 'signer_field'
  } else if (!attention && includesAny(normalized, ['status refreshed', 'is shown', 'opened'])) {
    title = 'Information updated'
    nextStep = 'Continue when you are ready.'
    category = 'information'
  }

  return {
    contract: 'arch9-document-outcome-feedback-v1',
    surface: String(surface || 'workspace').toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
    tone: attention ? 'attention' : category === 'information' ? 'info' : 'success',
    category,
    title,
    message: safe,
    nextStep,
  }
}
