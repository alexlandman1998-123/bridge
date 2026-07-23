import { invokeEdgeFunction } from './supabaseClient'
import { assertCanonicalSigningSession, buildCanonicalSigningSession } from '../core/documents/signingSessionContract'
import { buildSigningCompletion } from '../core/documents/signingCompletionContract'

function normalizeText(value) {
  return String(value || '').trim()
}

export async function resolveExternalSignerSession({ token } = {}) {
  const signingToken = normalizeText(token)
  if (!signingToken) {
    throw new Error('Signing token is required.')
  }

  const { data, error } = await invokeEdgeFunction('resolve-signer-token', {
    body: {
      action: 'resolve',
      token: signingToken,
    },
  })

  if (error) {
    const requestError = new Error(error.message || 'Unable to load signer session.')
    requestError.code = String(error.code || 'SIGNER_SESSION_REQUEST_FAILED')
    throw requestError
  }

  if (!data || data.success === false) {
    const edgeError = new Error(String(data?.error || data?.message || 'Unable to load signer session.'))
    edgeError.code = String(data?.errorCode || data?.error_code || 'SIGNER_SESSION_FAILED')
    edgeError.details = data || null
    throw edgeError
  }

  const canonicalInput = data?.signingSession || data?.signing_session || null
  const signingSession = canonicalInput
    ? assertCanonicalSigningSession(canonicalInput)
    : buildCanonicalSigningSession({
        document: {
          id: data?.session?.packet?.id,
          packetId: data?.session?.packet?.id,
          type: data?.session?.packet?.packet_type,
          title: data?.session?.packet?.title,
        },
        version: {
          id: data?.session?.version?.id,
          number: data?.session?.version?.version_number,
          status: data?.session?.version?.render_status,
          documentId: data?.session?.version?.rendered_document_id,
          fileName: data?.session?.version?.rendered_file_name,
          pdfPath: data?.session?.version?.rendered_file_path,
          pdfUrl: data?.session?.documentPreviewUrl,
        },
        signer: data?.session?.signer,
        fields: data?.session?.fields,
        binding: data?.session?.sessionBinding,
        presentation: data?.session?.previewData,
      })

  return {
    ...data,
    signingSession,
    completion: data?.completion ? buildSigningCompletion(data.completion) : null,
    session: data?.session
      ? {
          ...data.session,
          completion: data?.completion ? buildSigningCompletion(data.completion) : data.session.completion || null,
        }
      : data?.session,
  }
}

async function invokeSignerAction(payload = {}) {
  const { data, error } = await invokeEdgeFunction('signer-signing-action', {
    body: payload,
  })

  if (error) {
    const requestError = new Error(error.message || 'Unable to process signing action.')
    requestError.code = String(error.code || 'SIGNER_ACTION_REQUEST_FAILED')
    throw requestError
  }

  if (!data || data.success === false) {
    const edgeError = new Error(String(data?.error || data?.message || 'Unable to process signing action.'))
    edgeError.code = String(data?.errorCode || data?.error_code || 'SIGNER_ACTION_FAILED')
    edgeError.details = data || null
    throw edgeError
  }

  return data
}

export async function saveSignerAsset({ token, assetType, dataUrl } = {}) {
  return invokeSignerAction({
    action: 'upsert_asset',
    token,
    assetType,
    dataUrl,
  })
}

export async function applySignerField({ token, fieldId, assetType, assetPath = '', completedByEmail = '' } = {}) {
  return invokeSignerAction({
    action: 'apply_field',
    token,
    fieldId,
    assetType,
    assetPath,
    completedByEmail,
  })
}

export async function completeSignerSigning({ token } = {}) {
  return invokeSignerAction({
    action: 'complete_signing',
    token,
  })
}

/**
 * Completed signer pages never receive a stored URL from the signing session.
 * They ask the final-artifact resolver for a fresh, short-lived URL bound to
 * the same completed signing token and exact packet version.
 */
export async function resolveSignerFinalSignedArtifactAccess({
  token,
  packetId,
  packetVersionId,
  documentId = '',
  download = false,
} = {}) {
  const signingToken = normalizeText(token)
  const normalizedPacketId = normalizeText(packetId)
  const normalizedPacketVersionId = normalizeText(packetVersionId)
  const normalizedDocumentId = normalizeText(documentId)
  if (!signingToken || ((!normalizedPacketId || !normalizedPacketVersionId) && !normalizedDocumentId)) {
    throw new Error('The completed document reference is incomplete.')
  }

  const { data, error } = await invokeEdgeFunction('resolve-final-signed-document-access', {
    body: {
      context: 'signer',
      packetId: normalizedPacketId || null,
      packetVersionId: normalizedPacketVersionId || null,
      documentId: normalizedDocumentId || null,
      signingToken,
      action: download ? 'download' : 'status',
    },
  })
  if (error) {
    const requestError = new Error(normalizeText(error.message) || 'Unable to prepare the completed document.')
    requestError.code = normalizeText(error.code) || 'FINAL_ACCESS_REQUEST_FAILED'
    throw requestError
  }
  if (!data || data.success === false) {
    const responseError = new Error(normalizeText(data?.error || data?.message) || 'Unable to prepare the completed document.')
    responseError.code = normalizeText(data?.errorCode || data?.error_code) || 'FINAL_ACCESS_UNAVAILABLE'
    throw responseError
  }

  const artifact = data?.finalArtifact && typeof data.finalArtifact === 'object' ? data.finalArtifact : null
  const available = data.available === true && normalizeText(data.state).toLowerCase() === 'published'
  const downloadUrl = normalizeText(artifact?.downloadUrl)
  if (download && (!available || !downloadUrl)) {
    const downloadError = new Error(normalizeText(data?.message) || 'The completed document is not ready for secure download yet.')
    downloadError.code = 'FINAL_ACCESS_NOT_READY'
    throw downloadError
  }
  return {
    available,
    state: normalizeText(data.state) || 'unavailable',
    message: normalizeText(data.message) || (available ? 'The completed document is ready.' : 'The completed document is not ready yet.'),
    finalArtifact: artifact
      ? {
          documentId: normalizeText(artifact.documentId) || null,
          fileName: normalizeText(artifact.fileName) || 'signed-document.pdf',
          sha256: normalizeText(artifact.sha256) || null,
          byteLength: Number(artifact.byteLength) || null,
          ...(downloadUrl ? { downloadUrl } : {}),
        }
      : null,
  }
}
