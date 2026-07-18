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
