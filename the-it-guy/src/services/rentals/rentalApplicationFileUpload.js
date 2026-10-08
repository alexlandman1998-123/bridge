import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy.js'
import { runRecoverableDocumentUpload } from '../../lib/documentUploadRecovery.js'
const legacyRequests = new WeakMap()
export async function uploadRentalApplicationFile(file, slot, version, request, { monitorSurface = 'rental' } = {}) {
  const validated = validateDocumentUploadFile(file, { surface: 'rental_application' })
  if (!legacyRequests.has(request)) legacyRequests.set(request, crypto.randomUUID())
  const contextId = slot.requirementId || legacyRequests.get(request)
  return runRecoverableDocumentUpload({ monitorSurface, scope: ['rental_document', contextId, slot.generation, slot.subjectId, slot.purpose, slot.appendToPack === true], file,
    toSavedReceipt: result => result.data,
    run: async attempt => {
      let uploadUrl = ''
      if (!attempt.context) {
        const prepared = await request({ action: 'prepare_upload', version, fileName: file.name, mimeType: validated.mimeType, fileSize: file.size, subjectId: slot.subjectId, purpose: slot.purpose, appendToPack: slot.appendToPack === true, ...(slot.requirementId ? { requirementId: slot.requirementId, generation: slot.generation } : {}) })
        // This signed completion ticket is a bounded retry receipt. The API
        // still requires current applicant/agent authority; no login token or
        // signed Storage URL is persisted with it.
        attempt.setContext({ ticket: prepared.ticket, version })
        uploadUrl = prepared.uploadUrl
      }
      try {
        await attempt.upload(async () => {
          const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': validated.mimeType, 'x-upsert': 'false', 'cache-control': 'max-age=0' }, body: file })
          if (!response.ok) throw Object.assign(new Error('Unable to upload the selected document. Please retry.'), { statusCode: response.status || 400 })
          return 'rental-application-documents'
        })
      } catch (error) {
        if (error.code !== 'document_save_unconfirmed') throw error
        // A lost PUT response is reconciled by server-side Storage inspection.
      }
      const complete = async () => ({ data: await request({ action: 'complete_upload', version: attempt.context.version, ticket: attempt.context.ticket }) })
      const result = await attempt.persist({ save: complete, read: complete })
      return result.data
    },
  })
}
