import {
  DOCUMENTS_BUCKET,
  createScopedSupabaseClient,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabaseClient.js'

export const DEVELOPER_DOCUMENT_PORTAL_PATH = '/developer/document-portal'
export const DEVELOPER_DOCUMENT_PORTAL_MAX_FILE_BYTES = 20 * 1024 * 1024

function requireAuthenticatedClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

function requirePortalClient(token) {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) throw new Error('Developer document portal token is required.')
  const client = createScopedSupabaseClient({
    'x-bridge-developer-document-token': normalizedToken,
  })
  if (!client) throw new Error('Supabase is not configured.')
  return client
}

function createPortalToken() {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now()}${Math.random().toString(36).slice(2)}`
  return `ddp_${randomId}_${Math.random().toString(36).slice(2, 12)}`
}

function safeFileName(value = 'document') {
  return String(value || 'document')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'document'
}

function normalizePortalPayload(payload = {}) {
  const requirements = Array.isArray(payload.requirements) ? payload.requirements : []
  const documents = Array.isArray(payload.documents) ? payload.documents : []
  const satisfiedStatuses = new Set(['uploaded', 'under_review', 'approved', 'completed', 'waived'])
  const requiredRows = requirements.filter((item) => item?.required !== false)
  const completeRows = requiredRows.filter((item) => satisfiedStatuses.has(String(item?.status || '').toLowerCase()))
  return {
    portal: payload.portal || {},
    development: payload.development || {},
    unit: payload.unit || {},
    transaction: payload.transaction || {},
    requirements,
    documents,
    summary: {
      required: requiredRows.length,
      received: completeRows.length,
      outstanding: Math.max(0, requiredRows.length - completeRows.length),
      progress: requiredRows.length ? Math.round((completeRows.length / requiredRows.length) * 100) : 100,
    },
  }
}

export function buildDeveloperDocumentPortalUrl(token, origin = '') {
  const normalizedToken = encodeURIComponent(String(token || '').trim())
  if (!normalizedToken) return ''
  const base = String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '')
  return `${base}${DEVELOPER_DOCUMENT_PORTAL_PATH}/${normalizedToken}`
}

export async function createDeveloperDocumentPortalLink({
  transactionId,
  recipientEmail,
  expiresDays = 14,
} = {}) {
  if (!transactionId) throw new Error('Transaction is required.')
  const email = String(recipientEmail || '').trim().toLowerCase()
  if (!email) throw new Error('Developer email is required.')
  const accessToken = createPortalToken()
  const client = requireAuthenticatedClient()
  const { data, error } = await client.rpc('bridge_create_developer_document_portal_link', {
    p_transaction_id: transactionId,
    p_recipient_email: email,
    p_access_token: accessToken,
    p_expires_days: Number(expiresDays) || 14,
  })
  if (error) throw error
  return {
    ...(data || {}),
    accessToken,
    url: buildDeveloperDocumentPortalUrl(accessToken),
  }
}

export async function fetchDeveloperDocumentPortal(token) {
  const client = requirePortalClient(token)
  const { data, error } = await client.rpc('bridge_developer_document_portal_payload')
  if (error) throw error
  return normalizePortalPayload(data || {})
}

export async function uploadDeveloperDocumentPortalFile({
  token,
  portalId,
  transactionId,
  requirementId = null,
  category = 'Developer Documents',
  file,
} = {}) {
  if (!portalId || !transactionId) throw new Error('Portal context is incomplete. Refresh the page and try again.')
  if (!file) throw new Error('Choose a document to upload.')
  if (Number(file.size || 0) > DEVELOPER_DOCUMENT_PORTAL_MAX_FILE_BYTES) {
    throw new Error('Files must be 20 MB or smaller.')
  }

  const client = requirePortalClient(token)
  const filePath = `developer-document-portal/${portalId}/${transactionId}/${Date.now()}-${safeFileName(file.name)}`
  const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data, error } = await client.rpc('bridge_submit_developer_document_portal_document', {
    p_file_path: filePath,
    p_file_name: file.name || 'Developer document',
    p_category: category || 'Developer Documents',
    p_requirement_id: requirementId || null,
  })
  if (error) {
    await client.storage.from(DOCUMENTS_BUCKET).remove([filePath]).catch(() => {})
    throw error
  }
  return data
}

export async function createDeveloperPortalDocumentUrl({ token, filePath, expiresIn = 300 } = {}) {
  if (!filePath) return ''
  const client = requirePortalClient(token)
  const { data, error } = await client.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(filePath, Math.max(60, Math.min(Number(expiresIn) || 300, 3600)))
  if (error) throw error
  return data?.signedUrl || ''
}

export const __developerDocumentPortalTestUtils = Object.freeze({
  normalizePortalPayload,
  safeFileName,
})
