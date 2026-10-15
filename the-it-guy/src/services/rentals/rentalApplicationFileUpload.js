import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy.js'
import { runRecoverableDocumentUpload } from '../../lib/documentUploadRecovery.js'
import { withDocumentUploadDeadline } from '../../lib/documentUploadLifecycle.js'
const legacyRequests = new WeakMap()
const saved = result => Boolean(result?.document?.id || result?.documentId)

export async function uploadRentalApplicationFile(file, slot, version, request, { monitorSurface = 'rental', onProgress = null, scope = null } = {}) {
  const validated = validateDocumentUploadFile(file, { surface: 'rental_application' })
  if (!legacyRequests.has(request)) legacyRequests.set(request, crypto.randomUUID())
  const contextId = slot.requirementId || legacyRequests.get(request)
  let uploadUrl = ''
  const recover = async context => {
    const result = await request({ action: 'recover_upload', version: context.version, ticket: context.ticket })
    if (result.uploaded === true) return true
    if (result.uploaded === false && result.uploadUrl) { uploadUrl = result.uploadUrl; return false }
    throw new Error('The original file transfer could not be checked. Retry before uploading another file.')
  }
  return runRecoverableDocumentUpload({ monitorSurface, onProgress, scope: ['rental_document', scope, contextId, slot.generation, slot.subjectId, slot.purpose, slot.appendToPack === true], file,
    toSavedReceipt: result => result.data,
    recoverStorage: recover,
    run: async attempt => {
      if (!attempt.context) {
        const prepared = await withDocumentUploadDeadline(() => request({ action: 'prepare_upload', version, fileName: file.name, mimeType: validated.mimeType, fileSize: file.size, subjectId: slot.subjectId, purpose: slot.purpose, appendToPack: slot.appendToPack === true, ...(slot.requirementId ? { requirementId: slot.requirementId, generation: slot.generation } : {}) }))
        if (!prepared.ticket || !prepared.uploadUrl) throw new Error('The secure upload could not be prepared. Please retry.')
        // Persist a bounded completion ticket, never a login token or signed URL.
        attempt.setContext({ ticket: prepared.ticket, version })
        uploadUrl = prepared.uploadUrl
      }
      try {
        await attempt.upload(async signal => {
          const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': validated.mimeType, 'x-upsert': 'false', 'cache-control': 'max-age=0' }, body: file, signal })
          if (!response.ok) {
            const payload = await response.json?.().catch(() => null)
            const duplicate = /duplicate|already.?exists/i.test(`${payload?.error || ''} ${payload?.message || ''}`) || response.status === 409
            throw Object.assign(new Error(payload?.message || 'Unable to upload the selected document. Please retry.'), { statusCode: response.status || 400, ...(duplicate ? { code: '23505' } : {}) })
          }
          return 'rental-application-documents'
        })
      } catch (error) {
        if (error.code !== 'document_save_unconfirmed') throw error
        // A lost PUT may have committed. Missing bytes retain the SAME ticket
        // for a new signed URL on retry; no metadata save starts until confirmed.
        if (!await withDocumentUploadDeadline(() => recover(attempt.context), { timeoutMs: 10000 })) throw error
      }
      const complete = async () => {
        const data = await request({ action: 'complete_upload', version: attempt.context.version, ticket: attempt.context.ticket })
        if (saved(data) && (data.checklistUnavailable || data.application?.requirements === null)) data.persistenceWarnings = ['Document saved. Refresh the checklist before changing more evidence.']
        return { data }
      }
      const result = await attempt.persist({ save: complete, read: complete, isSaved: result => saved(result?.data) })
      return result.data
    },
  })
}
