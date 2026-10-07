import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy.js'
export async function uploadRentalApplicationFile(file, slot, version, request) {
  const validated = validateDocumentUploadFile(file, { surface: 'rental_application' })
  const prepared = await request({ action: 'prepare_upload', version, fileName: file.name, mimeType: validated.mimeType, fileSize: file.size, subjectId: slot.subjectId, purpose: slot.purpose, appendToPack: slot.appendToPack === true, ...(slot.requirementId ? { requirementId: slot.requirementId, generation: slot.generation } : {}) })
  const response = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': validated.mimeType, 'x-upsert': 'false', 'cache-control': 'max-age=0' }, body: file })
  if (!response.ok) throw new Error('Unable to upload the selected document. Please retry.')
  return request({ action: 'complete_upload', version, ticket: prepared.ticket })
}
