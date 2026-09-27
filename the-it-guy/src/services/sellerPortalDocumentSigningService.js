import { supabase } from '../lib/supabaseClient'

const FUNCTION_NAME = 'seller-portal-document-signing'

async function invoke(action, fields = {}) {
  if (!supabase) throw new Error('The signing service is unavailable.')
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { action, ...fields } })
  if (error || data?.error) {
    let response = null
    try { response = await error?.context?.json?.() } catch { /* Use the client error below. */ }
    throw new Error(data?.error || response?.error || error?.message || 'The signing request failed.')
  }
  return data || {}
}

export const listSellerPortalSigningRequests = (listingId) => invoke('list', { listingId })
export const sendSellerDocumentForSignature = (listingId, documentKey) => invoke('issue', { listingId, documentKey })
export const viewSellerDocumentForSignature = (token) => invoke('view', { token })
export const signSellerDocumentInPortal = (token, { signedName, signatureType, signatureValue, versionDigest }) =>
  invoke('sign', { token, signedName, signatureType, signatureValue, versionDigest, accepted: true })
export const previewSellerPortalSignedDocument = (signingDocumentId) => invoke('preview', { signingDocumentId })
export const reviewSellerPortalSignedDocument = (signingDocumentId) => invoke('review', { signingDocumentId })
