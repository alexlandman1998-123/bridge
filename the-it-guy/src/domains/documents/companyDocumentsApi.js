import { supabase, createScopedSupabaseClient } from '../../lib/supabaseClient.js'
import { validateDocumentUploadFile, withDocumentUploadMimeType } from '../../lib/documentUploadPolicy.js'
import { runRecoverableDocumentUpload, readSavedUploadByPath } from '../../lib/documentUploadRecovery.js'
import { withDocumentUploadDeadline } from '../../lib/documentUploadLifecycle.js'

export const COMPANY_DOCUMENT_BUCKET = 'company-documents'
export const COMPANY_DOCUMENT_CHANGE_EVENT = 'arch9:company-documents-changed'
const unconfirmed = cause => Object.assign(new Error('The company document save could not be confirmed. Keep the file selected and retry to check the saved record.'), { code: 'document_save_unconfirmed', retained: true, cause })
export function companyDocumentRow(row = {}) {
  return { ...row, fileName: row.file_name || '', storageBucket: row.storage_bucket || COMPANY_DOCUMENT_BUCKET, storagePath: row.storage_path || '', createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at }
}
async function actorClient({ client = supabase, actorId } = {}) {
  if (!client || !actorId) throw new Error('Sign in before opening company documents.')
  const auth = await withDocumentUploadDeadline(() => client.auth.getUser())
  if (auth.error) throw auth.error
  if (auth.data?.user?.id !== actorId) throw new Error('Your account changed. Reopen Company Documents before continuing.')
  const sessionResult = typeof client.auth.getSession === 'function' ? await client.auth.getSession() : null
  if (sessionResult?.error) throw sessionResult.error
  const session = sessionResult?.data?.session
  if (session?.user?.id && session.user.id !== actorId) throw new Error('Your account changed. Reopen Company Documents before continuing.')
  return session?.access_token ? createScopedSupabaseClient({ Authorization: `Bearer ${session.access_token}` }) || client : client
}
function changed(organisationId) {
  try {
    window.dispatchEvent(new CustomEvent(COMPANY_DOCUMENT_CHANGE_EVENT, { detail: { organisationId } }))
    window.localStorage.setItem(COMPANY_DOCUMENT_CHANGE_EVENT, `${organisationId}:${Date.now()}:${Math.random()}`)
  } catch { /* An optional refresh signal cannot fail a saved document. */ }
}
async function rpc(client, name, parameters) {
  const result = await withDocumentUploadDeadline(signal => {
    const query = client.rpc(name, parameters)
    return typeof query.abortSignal === 'function' ? query.abortSignal(signal) : query
  }, { timeoutMs: 30000 })
  if (result.error) throw result.error
  return result.data
}
export async function fetchCompanyDocuments({ organisationId, includeHistory = false, ...auth }) {
  if (!organisationId) throw new Error('Choose an organisation before opening company documents.')
  const client = await actorClient(auth)
  const result = await rpc(client, 'bridge_company_document_workspace', { p_organisation_id: organisationId, p_include_history: includeHistory })
  if (result?.organisationId !== organisationId || !Array.isArray(result.documents)) throw new Error('Your company document workspace could not be verified. Check your organisation access and refresh.')
  return { ...result, documents: result.documents.map(companyDocumentRow) }
}
export async function uploadCompanyDocument({ organisationId, actorId, file, title, category, status = 'uploaded', visibility = 'management', previous = null, legacyId = null, onProgress, ...auth }) {
  const policy = validateDocumentUploadFile(file, { surface: 'company_document' })
  if (!organisationId || !String(title || '').trim() || !String(category || '').trim()) throw new Error('Choose an organisation, document title and category before uploading.')
  const client = await actorClient({ ...auth, actorId })
  // Old browser files can fill localStorage. Import recovery references belong
  // in sessionStorage (which survives a tab reload), leaving those originals
  // untouched until the verified save can safely clear each old copy.
  let receiptStorage
  if (legacyId) { try { receiptStorage = globalThis.sessionStorage } catch { /* The normal recovery boundary still fails safely. */ } }
  return runRecoverableDocumentUpload({ client, file, scope: ['company_document', organisationId, actorId, title.trim(), category, status, visibility, previous?.id, previous?.revision, legacyId],
    storageBuckets: [COMPANY_DOCUMENT_BUCKET], receiptStorage, onProgress, toSavedReceipt: result => ({ ...companyDocumentRow(result.data), saved: true }),
    run: async attempt => {
      const legacyKey = legacyId ? `${legacyId}:${attempt.fileFingerprint}` : null
      if (legacyKey) {
        const existing = await client.from('company_documents').select('*').eq('organisation_id', organisationId).eq('uploaded_by', actorId).eq('legacy_import_key', legacyKey).maybeSingle()
        if (existing.error) throw existing.error
        if (existing.data?.id) {
          if (existing.data.organisation_id !== organisationId || existing.data.uploaded_by !== actorId || existing.data.legacy_import_key !== legacyKey || existing.data.sha256 !== attempt.fileFingerprint) throw unconfirmed()
          attempt.saved(existing); return { ...companyDocumentRow(existing.data), saved: true }
        }
      }
      const path = attempt.path(`${organisationId}/${actorId}/${crypto.randomUUID()}/${policy.safeName}`)
      await attempt.upload(async () => {
        const result = await client.storage.from(COMPANY_DOCUMENT_BUCKET).upload(path, withDocumentUploadMimeType(file, policy.mimeType), {
          upsert: false, contentType: policy.mimeType, metadata: { sha256: attempt.fileFingerprint },
        })
        if (result.error) throw result.error
        return COMPANY_DOCUMENT_BUCKET
      })
      const saved = await attempt.persist({
        save: async () => {
          const result = await rpc(client, 'bridge_company_document_upload', { p_organisation_id: organisationId, p_upload_id: path.split('/')[2], p_payload: {
            title: title.trim(), category, status, visibility, storagePath: path, fileName: file.name, mimeType: policy.mimeType, sizeBytes: file.size, sha256: attempt.fileFingerprint,
            previousId: previous?.id || null, expectedRevision: previous?.revision || null, legacyImportKey: legacyKey,
          } })
          if (result?.saved !== true || result.document?.id !== path.split('/')[2] || result.document?.organisation_id !== organisationId || result.document?.storage_path !== path) throw unconfirmed()
          return { data: result.document }
        },
        read: () => readSavedUploadByPath(client, { table: 'company_documents', column: 'storage_path', path, filters: { organisation_id: organisationId } }),
        cleanup: async () => { const result = await client.storage.from(COMPANY_DOCUMENT_BUCKET).remove([path]); if (result.error) throw result.error },
      })
      changed(organisationId)
      return { ...companyDocumentRow(saved.data), saved: true }
    },
  })
}
export async function changeCompanyDocument({ organisationId, document, action, visibility = null, status = null, ...auth }) {
  const client = await actorClient(auth)
  const result = await rpc(client, 'bridge_company_document_change', { p_organisation_id: organisationId, p_document_id: document.id, p_revision: document.revision, p_action: action, p_visibility: visibility, p_status: status })
  const row = result?.document
  if (result?.saved !== true || row?.id !== document.id || row?.organisation_id !== organisationId || (action === 'archive' && !row.archived_at) || (action === 'visibility' && row.visibility !== visibility) || (action === 'status' && row.status !== status)) throw unconfirmed()
  changed(organisationId)
  return { ...companyDocumentRow(row), saved: true }
}
export async function createCompanyDocumentSignedUrl({ organisationId, document, ...auth }) {
  const client = await actorClient(auth)
  // Read the persisted reference under current RLS, rather than trusting a path
  // carried by a stale list, a cached URL or another organisation's form.
  const row = await client.from('company_documents').select('id,storage_bucket,storage_path').eq('id', document.id).eq('organisation_id', organisationId).single()
  if (row.error) throw row.error
  if (row.data?.id !== document.id || !row.data?.storage_path || row.data.storage_bucket !== COMPANY_DOCUMENT_BUCKET) throw new Error('The saved company file is unavailable. Refresh the document list.')
  const result = await client.storage.from(COMPANY_DOCUMENT_BUCKET).createSignedUrl(row.data.storage_path, 60)
  if (result.error) throw result.error
  if (!result.data?.signedUrl) throw new Error('The company file could not be opened. Check access and retry.')
  return result.data.signedUrl
}
