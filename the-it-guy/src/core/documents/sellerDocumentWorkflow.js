import { isSellerDocumentPreparationArtifact } from '../../lib/sellerBasePackContract.js'

export const SELLER_DOCUMENT_ACTIONS = Object.freeze([
  ['upload_existing', 'Upload manually', 'Upload an existing signed copy using the workspace permissions; the agent reviews it.'],
  ['manual_upload', 'Generate and download', 'The agent prepares a reviewed copy. Arrange signatures, then upload it for review.'],
  ['digital_pack', 'Generate and send for signature', 'The agent emails a private signing link to every required signer.'],
])

export const SELLER_DOCUMENT_SELECTION_KEYS = Object.freeze({
  signed_disclosure_form: 'disclosure', signed_fica_declaration: 'fica', signed_mandate: 'mandate',
})

export function sellerGeneratedDocumentSelection(routes = {}) {
  return Object.entries(routes).filter(([key, route]) => SELLER_DOCUMENT_SELECTION_KEYS[key] && ['manual_upload', 'digital_pack'].includes(route))
    .map(([key]) => SELLER_DOCUMENT_SELECTION_KEYS[key])
}

export function getSellerDocumentSigningRequest(requests = [], key, versionId) {
  const matching = requests.filter(request => request.document_key === key && request.version_id === versionId)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  return matching.find(request => !['revoked', 'expired'].includes(request.status)) || matching[0] || null
}

export function sellerDocumentHasActiveSigning(requests = [], key) {
  return requests.some(request => request.document_key === key && ['prepared', 'sent', 'partially_signed', 'signed', 'reviewed'].includes(request.status))
}

/** Signed evidence needs review; preparing a copy or an email never completes it. */
export function buildSellerDocumentWorkflow({ item = {}, copy = null, request = null } = {}) {
  const uploaded = item.linkedDocument || item.originalDocument || item.upload || {}
  const status = String(item.lifecycleStatus || item.lifecycle_status || item.status || '').toLowerCase()
  const uploadedVersion = uploaded.reviewed_signing_version_id || uploaded.reviewedSigningVersionId || uploaded.version_id || uploaded.versionId || ''
  const currentVersion = copy?.versionId || request?.version_id || ''
  const uploadMatches = !currentVersion || !uploadedVersion || uploadedVersion === currentVersion
  const preparationOnly = isSellerDocumentPreparationArtifact(uploaded) || (!Object.keys(uploaded).length && isSellerDocumentPreparationArtifact(item))
  // A prior accepted upload cannot complete a request for a different version.
  const reviewed = request?.status === 'reviewed' || (!preparationOnly && !request && uploadMatches && ['complete', 'approved', 'verified', 'completed'].includes(status))
  const hasUpload = !preparationOnly && uploadMatches && (!request || uploadedVersion === request.version_id) && Boolean(['uploaded', 'under_review'].includes(status) || item.uploaded || item.hasUploadedDocument || item.storagePath || item.storage_path || item.url || uploaded.storage_path || uploaded.storagePath || (uploaded.id && ['uploaded', 'under_review', 'approved', 'signed'].includes(uploaded.status)))
  const active = ['prepared', 'sent', 'partially_signed', 'signed', 'reviewed'].includes(request?.status)
  let state = 'not_prepared', label = 'Choose a document action', detail = ''
  if (reviewed) { state = 'complete'; label = 'Reviewed and complete' }
  else if (request?.status === 'signed') { state = 'review'; label = 'Signed, awaiting agent review' }
  else if (request?.status === 'partially_signed') { state = 'signing'; label = 'Awaiting remaining signatures' }
  else if (request?.status === 'sent') { state = 'signing'; label = 'Awaiting online signatures' }
  else if (request?.status === 'prepared') { state = 'sending'; label = 'Preparing signature request' }
  else if (hasUpload) { state = 'review'; label = 'Uploaded — awaiting agent review' }
  else if (request?.status === 'expired') { state = 'retry'; label = 'Signing links expired'; detail = 'Send fresh links for this reviewed version. Previous evidence stays in the history.' }
  else if (request?.status === 'revoked') {
    state = 'retry'; label = 'Signature request failed or cancelled'
    if (String(request.revoke_reason || '').startsWith('agent_review_rejected: ')) {
      label = 'Rejected — replacement required'
      detail = String(request.revoke_reason).slice('agent_review_rejected: '.length)
    } else detail = request.revoke_reason === 'email_not_configured' ? 'Email delivery is not configured. Retry after it is restored.' : 'Earlier links are inactive. Retry sending this reviewed version.'
  }
  else if (copy) { state = 'prepared'; label = 'Prepared — awaiting signature'; detail = copy.signingRoute === 'digital_pack' ? 'The reviewed copy is ready. Signature links have not been sent.' : 'Download the reviewed copy, arrange signatures, and upload it for review.' }
  const signedCount = Number(request?.signed_count || 0), signerCount = Number(request?.signer_count || 0)
  if (signerCount && ['signing', 'review'].includes(state)) detail = `${signedCount} of ${signerCount} required signers signed.`
  const nextActor = ['not_prepared', 'sending', 'retry', 'review'].includes(state) ? 'agent' : state === 'complete' ? '' : 'seller'
  const uploadActors = item.lockedByTeam ? ['agent'] : ['agent', 'seller']
  const nextAction = state === 'complete' ? 'Reviewed evidence is retained. Transaction handoff is tracked separately.'
    : state === 'review' ? 'The agent reviews the signed document.'
    : ['signing', 'prepared'].includes(state) ? `Each required seller signs; the agent ${item.lockedByTeam ? 'uploads and ' : ''}reviews the returned evidence.`
    : `The agent chooses the document route and prepares it. ${item.lockedByTeam ? 'The agent' : 'The seller or agent'} can upload an existing signed copy.`
  return { state, label, detail, nextActor, nextAction,
    versionId: copy?.versionId || request?.version_id || uploadedVersion,
    signingRoute: copy?.signingRoute || request?.signing_route || (hasUpload ? 'upload_existing' : ''),
    visibility: 'agent_and_seller',
    permittedActors: { prepare: ['agent'], send: ['agent'], upload: uploadActors, review: ['agent'] }, canPrepare: !active && !hasUpload && !reviewed, canSend: !active && !hasUpload && !reviewed,
    canUpload: !active && !reviewed, canReview: request?.status === 'signed', canRefresh: active && !reviewed,
    sendLabel: state === 'retry' ? 'Retry signature send' : 'Generate and send for signature' }
}

export function sellerDocumentHasUploadedEvidence(uploads = [], key, { replacement = false } = {}) {
  return uploads.some(document => !isSellerDocumentPreparationArtifact(document) && document.document_type === key &&
    (['uploaded', 'under_review'].includes(document.status) || !replacement && document.status === 'approved'))
}
