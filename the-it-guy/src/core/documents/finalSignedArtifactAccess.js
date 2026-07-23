import { invokeEdgeFunction } from '../../lib/supabaseClient'

const FINAL_SIGNED_ARTIFACT_ACCESS_FUNCTION = 'resolve-final-signed-document-access'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeContext(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (['client_portal', 'seller_portal', 'workspace'].includes(normalized)) {
    return normalized
  }
  return ''
}

function unavailableFinalArtifactAccess(message = 'The final signed document is not available right now.') {
  return {
    available: false,
    state: 'unavailable',
    message,
    finalArtifact: null,
  }
}

function normalizeFinalArtifactAccess(payload = {}) {
  const state = normalizeText(payload?.state || 'unavailable').toLowerCase() || 'unavailable'
  const finalArtifact = payload?.finalArtifact && typeof payload.finalArtifact === 'object'
    ? payload.finalArtifact
    : null
  const downloadUrl = normalizeText(finalArtifact?.downloadUrl || finalArtifact?.url)
  const available = payload?.available === true && state === 'published'

  return {
    available,
    state,
    message: normalizeText(payload?.message) || (available
      ? 'The final signed document is ready.'
      : 'The final signed document is not available right now.'),
    finalArtifact: available
      ? {
          documentId: normalizeText(finalArtifact?.documentId) || null,
          fileName: normalizeText(finalArtifact?.fileName) || 'signed-document.pdf',
          sha256: normalizeText(finalArtifact?.sha256) || null,
          byteLength: Number(finalArtifact?.byteLength) || null,
          ...(downloadUrl ? { downloadUrl } : {}),
        }
      : null,
  }
}

/**
 * Resolves a final signed document through the server-owned Phase 3 fence.
 * This deliberately accepts packet/version identifiers or a final Documents
 * row identifier only; browser callers never supply a storage bucket or path
 * that could bypass F2/publication.
 */
export async function resolveFinalSignedArtifactAccess({
  context,
  packetId,
  packetVersionId,
  documentId = '',
  portalToken = '',
  sellerAccessToken = '',
  download = false,
} = {}) {
  const accessContext = normalizeContext(context)
  const normalizedPacketId = normalizeText(packetId)
  const normalizedPacketVersionId = normalizeText(packetVersionId)
  const normalizedDocumentId = normalizeText(documentId)
  const hasPacketVersion = Boolean(normalizedPacketId && normalizedPacketVersionId)
  if (!accessContext || (!hasPacketVersion && !normalizedDocumentId)) {
    return unavailableFinalArtifactAccess('The final signed document reference is incomplete.')
  }

  let response
  try {
    response = await invokeEdgeFunction(FINAL_SIGNED_ARTIFACT_ACCESS_FUNCTION, {
      body: {
        context: accessContext,
        packetId: normalizedPacketId || null,
        packetVersionId: normalizedPacketVersionId || null,
        documentId: normalizedDocumentId || null,
        portalToken: normalizeText(portalToken) || null,
        sellerAccessToken: normalizeText(sellerAccessToken) || null,
        action: download ? 'download' : 'status',
      },
    })
  } catch (error) {
    return unavailableFinalArtifactAccess(normalizeText(error?.message) || undefined)
  }

  const { data, error } = response || {}

  if (error) {
    return unavailableFinalArtifactAccess(normalizeText(error?.message) || undefined)
  }
  if (!data || data.success === false) {
    return unavailableFinalArtifactAccess(normalizeText(data?.error || data?.message) || undefined)
  }

  const resolved = normalizeFinalArtifactAccess(data)
  if (download && resolved.available && !normalizeText(resolved?.finalArtifact?.downloadUrl)) {
    return unavailableFinalArtifactAccess('A fresh secure link could not be created. Please try again.')
  }
  return resolved
}

export function resolveClientPortalFinalSignedArtifactAccess(options = {}) {
  return resolveFinalSignedArtifactAccess({
    ...options,
    context: 'client_portal',
  })
}

export function resolveSellerPortalFinalSignedArtifactAccess(options = {}) {
  return resolveFinalSignedArtifactAccess({
    ...options,
    context: 'seller_portal',
  })
}

export function resolveWorkspaceFinalSignedArtifactAccess(options = {}) {
  return resolveFinalSignedArtifactAccess({
    ...options,
    context: 'workspace',
  })
}
