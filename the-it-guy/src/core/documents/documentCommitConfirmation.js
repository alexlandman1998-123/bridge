function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function documentLabel(packetType) {
  const type = key(packetType)
  if (type === 'otp') return 'Offer to Purchase'
  if (type === 'mandate') return 'mandate'
  return 'document'
}

export function buildDocumentCommitConfirmation({ action = '', packetType = 'document', signerCount = 0, recipients = [], remainingFields = 0, signerRole = '' } = {}) {
  const normalizedAction = key(action)
  const label = documentLabel(packetType)
  if (normalizedAction === 'send_signature') {
    const count = Math.max(0, Number(signerCount) || 0)
    const confirmedRecipients = Array.isArray(recipients)
      ? recipients
        .map((recipient) => ({
          label: text(recipient?.label || recipient?.role || 'Signer'),
          name: text(recipient?.name || recipient?.signerName),
          email: text(recipient?.email || recipient?.signerEmail).toLowerCase(),
        }))
        .filter((recipient) => recipient.email)
      : []
    return {
      contract: 'arch9-document-commit-confirmation-v1',
      action: normalizedAction,
      title: `Send this ${label} for signature?`,
      summary: count > 0
        ? `Arch9 will lock this document version and send secure invitations to ${count} signing ${count === 1 ? 'party' : 'parties'}.`
        : 'No valid signing parties are available yet. Return to signature setup before sending.',
      confirmLabel: count > 0 ? `Send to ${count} ${count === 1 ? 'signer' : 'signers'}` : 'No signers available',
      canConfirm: count > 0,
      recipients: confirmedRecipients,
      points: ['The generated PDF is the exact version being sent.', 'Each invitation is private to its signing party.', 'Later wording changes require a new signing version.'],
    }
  }
  if (normalizedAction === 'complete_signing') {
    const remaining = Math.max(0, Number(remainingFields) || 0)
    const role = text(signerRole).replace(/_/g, ' ') || 'signer'
    return {
      contract: 'arch9-document-commit-confirmation-v1',
      action: normalizedAction,
      title: 'Complete your signing?',
      summary: remaining > 0
        ? `${remaining} required ${remaining === 1 ? 'field is' : 'fields are'} still incomplete.`
        : `This submits your completed fields as the ${role} for this ${label}.`,
      confirmLabel: remaining > 0 ? 'Fields still incomplete' : 'Complete signing',
      canConfirm: remaining === 0,
      points: ['Review the full document before submitting.', 'Your completed fields will be securely recorded.', 'You cannot edit this signing submission after completion.'],
    }
  }
  return null
}
