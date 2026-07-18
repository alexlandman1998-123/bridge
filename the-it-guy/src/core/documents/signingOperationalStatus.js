function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function roleFamily(value) {
  const role = key(value)
  if (['principal', 'owner', 'admin', 'super_admin', 'branch_manager', 'agency_admin'].includes(role)) return 'principal'
  if (role.includes('attorney') || role.includes('conveyancer')) return 'attorney'
  if (role.includes('buyer') || role.includes('purchaser') || role === 'client') return 'buyer'
  if (role.includes('seller')) return 'seller'
  return 'agent'
}

function signerCounts(signingSummary = {}) {
  const signers = Array.isArray(signingSummary?.signers) ? signingSummary.signers : []
  return {
    total: Number(signingSummary?.signerCount) || signers.length,
    signed: signers.filter((signer) => key(signer?.status) === 'signed').length,
    declined: signers.filter((signer) => key(signer?.status) === 'declined').length,
    expired: signers.filter((signer) => key(signer?.status) === 'expired').length,
    viewed: signers.filter((signer) => key(signer?.status) === 'viewed').length,
    sent: signers.filter((signer) => ['sent', 'viewed'].includes(key(signer?.status))).length,
  }
}

export function resolveSigningOperationalStatus({
  packetType = 'document',
  packet = {},
  versions = [],
  signingSummary = {},
  finalCompletion = null,
  viewerRole = 'agent',
} = {}) {
  const type = key(packetType || packet?.packet_type) || 'document'
  const label = type === 'otp' ? 'OTP' : type === 'mandate' ? 'mandate' : 'document'
  const status = key(packet?.status)
  const role = roleFamily(viewerRole)
  const rows = Array.isArray(versions) ? versions : []
  const latestVersion = rows[0] || {}
  const counts = signerCounts(signingSummary)
  const hasGeneratedPdf = rows.some((version) => key(version?.render_status) === 'generated')
  const hasFinalArtifact = rows.some((version) => text(version?.final_signed_file_path || version?.final_signed_file_url))
  const allSigned = counts.total > 0 && counts.signed === counts.total
  const completionReady = finalCompletion?.ready === true
  const completionStage = key(finalCompletion?.stage)
  const progress = counts.total ? Math.round((counts.signed / counts.total) * 100) : 0

  let state = 'draft'
  let tone = 'neutral'
  let title = `${label} draft`
  let summary = `The ${label} is still being prepared.`
  let nextAction = role === 'attorney' ? 'Monitor the document preparation.' : `Finish preparing the ${label}.`

  if (['voided', 'archived'].includes(status)) {
    state = status
    title = status === 'voided' ? `${label} cancelled` : `${label} archived`
    summary = `This ${label} is no longer in the active signing workflow.`
    nextAction = 'No signing action is available.'
  } else if (counts.declined > 0) {
    state = 'attention_required'
    tone = 'danger'
    title = 'Signature declined'
    summary = `${counts.declined} signer${counts.declined === 1 ? '' : 's'} declined this ${label}.`
    nextAction = role === 'attorney' ? 'Wait for the transaction owner to resolve the declined signature.' : 'Review the signer response before resending or replacing the document.'
  } else if (completionReady) {
    state = 'completed'
    tone = 'success'
    title = 'Completed everywhere'
    summary = `The final signed ${label} is saved to the transaction, visible in the portal, and delivered to ${finalCompletion.deliveredRecipientCount || counts.total} of ${finalCompletion.recipientCount || counts.total} recipients.`
    nextAction = `Open or download the final signed ${label}.`
  } else if (hasFinalArtifact) {
    state = 'publishing'
    tone = completionStage === 'awaiting_recipient_delivery' ? 'warning' : 'info'
    title = 'Signed PDF safe — publishing'
    const stageCopy = {
      awaiting_transaction_publication: 'The final PDF is being saved against the transaction.',
      awaiting_surface_completion: 'The final PDF is being published to the required transaction and portal surfaces.',
      awaiting_recipient_delivery: `The final PDF is available; secure delivery is complete for ${finalCompletion?.deliveredRecipientCount || 0} of ${finalCompletion?.recipientCount || counts.total} recipients.`,
    }
    summary = stageCopy[completionStage] || `The signed ${label} exists and completion checks are still running.`
    nextAction = role === 'principal' || role === 'agent' ? 'Retry completion if this status does not clear.' : 'No signature action is required; publication is still processing.'
  } else if (allSigned || status === 'completed') {
    state = 'finalising'
    tone = 'info'
    title = 'All signatures complete — finalising'
    summary = `All required parties signed the ${label}. The immutable final PDF is being generated.`
    nextAction = role === 'principal' || role === 'agent' ? 'Generate or retry the final signed PDF if processing stalls.' : 'No further signing action is required.'
  } else if (counts.signed > 0) {
    state = 'partially_signed'
    tone = 'warning'
    title = `Waiting for ${Math.max(counts.total - counts.signed, 0)} signer${counts.total - counts.signed === 1 ? '' : 's'}`
    summary = `${counts.signed} of ${counts.total} required signers completed the ${label}.`
    nextAction = role === 'attorney' ? 'Monitor the remaining signatures.' : 'Follow up with the remaining signer or resend an expired link.'
  } else if (counts.sent > 0 || status === 'sent') {
    state = 'awaiting_signers'
    tone = 'info'
    title = counts.viewed > 0 ? 'Opened — awaiting signature' : 'Sent for signature'
    summary = `${counts.signed} of ${counts.total || 1} required signers completed the ${label}.`
    nextAction = role === 'attorney' ? 'Monitor signer progress.' : 'Follow up or resend the signing link if necessary.'
  } else if (status === 'signing_prep') {
    state = 'ready_to_send'
    tone = 'info'
    title = 'Ready to send'
    summary = `The exact generated ${label} and its signing fields are ready.`
    nextAction = role === 'attorney' ? 'Wait for the transaction owner to send it.' : `Send the ${label} for signature.`
  } else if (hasGeneratedPdf || key(latestVersion?.render_status) === 'generated') {
    state = 'pdf_ready'
    title = 'PDF generated'
    summary = `The ${label} PDF is available but has not entered signing.`
    nextAction = role === 'attorney' ? 'Review the generated PDF.' : 'Prepare signature and initial blocks.'
  }

  return {
    contract: 'arch9-signing-operational-status-v1',
    state,
    tone,
    title,
    summary,
    nextAction,
    packetType: type,
    viewerRole: role,
    progress: { ...counts, percent: progress },
    finalCopyAvailable: hasFinalArtifact,
    completionReady,
    retryable: finalCompletion?.retryable === true,
  }
}
