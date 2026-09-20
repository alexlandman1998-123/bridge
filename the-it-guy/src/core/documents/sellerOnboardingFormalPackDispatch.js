export const SELLER_ONBOARDING_FORMAL_PACK_DISPATCH_CONTRACT = 'arch9-seller-onboarding-formal-pack-dispatch-v1'

const text = (value) => String(value ?? '').trim()

function route(value = '') {
  return text(value) === 'manual_upload' ? 'manual_upload' : 'digital_pack'
}

function deliveryStatus(value = '') {
  const status = text(value).toLowerCase()
  return ['sent', 'partial', 'failed'].includes(status) ? status : 'failed'
}

function recipients(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      signerName: text(row?.signerName || row?.signer_name),
      signerEmail: text(row?.signerEmail || row?.signer_email || row?.email).toLowerCase(),
      delivery: deliveryStatus(row?.delivery || row?.deliveryStatus || row?.delivery_status),
      expiresAt: text(row?.expiresAt || row?.expires_at) || null,
    }))
    .filter((row) => row.signerEmail)
}

/**
 * Stores delivery evidence only. Signing URLs are intentionally excluded because
 * they are bearer credentials and must not be retained in listing form data.
 */
export function createSellerOnboardingFormalPackDispatch({
  existing = {},
  formalPackApproval = {},
  response = {},
  selectedDocuments = [],
  signingRoute = 'digital_pack',
  actor = '',
  at = new Date().toISOString(),
} = {}) {
  const approval = formalPackApproval && typeof formalPackApproval === 'object' ? formalPackApproval : {}
  if (approval.status !== 'approved') throw new Error('Approve the onboarding and commercial terms before issuing a signing pack.')
  if (route(signingRoute) !== 'digital_pack') throw new Error('Only a digital signing route can be recorded as a delivery.')

  const source = response && typeof response === 'object' ? response : {}
  const delivery = deliveryStatus(source.delivery)
  const dispatchedRecipients = recipients(source.signingLinks || source.signing_links)
  if (!dispatchedRecipients.length) throw new Error('The signing service did not return any recipient delivery records.')

  const deliveredRecipientCount = dispatchedRecipients.filter((recipient) => recipient.delivery !== 'failed').length
  const entry = {
    at: text(at),
    actor: text(actor),
    status: deliveredRecipientCount ? delivery : 'failed',
    delivery,
    signingGroupId: text(source.signingGroupId || source.signing_group_id),
    supersededSigningGroupId: text(source.correctedSigningGroupId || source.corrected_signing_group_id) || null,
    isAmendment: source.isAmendment === true,
    signedSessionsRetained: Math.max(0, Number(source.signedSessionsRetained || source.signed_sessions_retained || 0) || 0),
    selectedDocuments: Array.isArray(selectedDocuments) ? selectedDocuments.map(text).filter(Boolean) : [],
    recipients: dispatchedRecipients,
    deliveredRecipientCount,
    recipientCount: dispatchedRecipients.length,
    expiresAt: text(source.expiresAt || source.expires_at) || null,
  }
  const current = existing && typeof existing === 'object' ? existing : {}
  return {
    contract: SELLER_ONBOARDING_FORMAL_PACK_DISPATCH_CONTRACT,
    ...entry,
    dispatchedAt: entry.at,
    dispatched_at: entry.at,
    dispatchedBy: entry.actor,
    dispatched_by: entry.actor,
    signingGroupId: entry.signingGroupId,
    signing_group_id: entry.signingGroupId,
    supersededSigningGroupId: entry.supersededSigningGroupId,
    superseded_signing_group_id: entry.supersededSigningGroupId,
    isAmendment: entry.isAmendment,
    is_amendment: entry.isAmendment,
    signedSessionsRetained: entry.signedSessionsRetained,
    signed_sessions_retained: entry.signedSessionsRetained,
    selectedDocuments: entry.selectedDocuments,
    selected_documents: entry.selectedDocuments,
    history: [...(Array.isArray(current.history) ? current.history : []), entry],
  }
}
