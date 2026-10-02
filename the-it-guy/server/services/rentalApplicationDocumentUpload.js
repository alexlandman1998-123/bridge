import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { rentalApplicationDocumentSlots } from '../../src/services/rentals/rentalApplicationWizardModel.js'
const bucket = 'rental-application-documents'
export function validateRentalDocumentUpload({ fileName = '', mimeType = '', binary = Buffer.alloc(0) } = {}) {
  const safeFileName = String(fileName).trim().split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^[_.]+|[_.]+$/g, '').slice(0, 140)
  const extension = safeFileName.split('.').pop().toLowerCase()
  const mimeTypes = { pdf: ['application/pdf'], doc: ['application/msword'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'] }
  if (!mimeTypes[extension]?.includes(String(mimeType).toLowerCase())) throw new Error('Unsupported file type or mismatched extension. Upload a PDF, Word document, JPG or PNG.')
  if (!Number.isInteger(binary.length) || binary.length <= 0 || binary.length > 8 * 1024 * 1024) throw new Error('Documents must be 8 MB or smaller.')
  return { safeFileName, mimeType: String(mimeType).toLowerCase() }
}
const signature = (payload, secret) => createHmac('sha256', secret).update(payload).digest('base64url')
function readTicket(ticket, secret, application, source) {
  const [payload = '', digest = ''] = String(ticket || '').split('.')
  const expected = signature(payload, secret)
  if (digest.length !== expected.length || !timingSafeEqual(Buffer.from(digest), Buffer.from(expected))) throw new Error('Invalid document upload receipt.')
  const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (value.applicationId !== application.id || value.organisationId !== application.organisation_id || value.source !== source || value.expiresAt <= Date.now()) throw new Error('Document upload receipt is unavailable or expired.')
  return value
}
export async function uploadRentalApplicationDocument(db, application, body, { source = 'applicant', applicationClient = db, signingSecret = '' } = {}) {
  if (application.status !== 'draft') throw new Error('This application can no longer be edited.')
  if (Number(body.version) !== Number(application.version)) throw new Error('This application changed. Refresh and try again.')
  const storage = db.storage.from(bucket)
  let slot, policy, path, fileSize
  if (body.action === 'complete_upload') {
    if (!signingSecret) throw new Error('Document upload is not configured.')
    const ticket = readTicket(body.ticket, signingSecret, application, source)
    if (ticket.version !== Number(application.version)) throw new Error('This application changed. Refresh and try again.')
    slot = rentalApplicationDocumentSlots(application.application_data).find((item) => item.subjectId === ticket.subjectId && item.purpose === ticket.purpose)
    if (!slot) throw new Error('The person or evidence requirement changed. Please upload again.')
    path = ticket.path
    const info = await storage.info(path)
    if (info.error || !info.data) throw new Error('The file upload is incomplete. Retry the upload.')
    fileSize = Number(info.data.size)
    try {
      policy = validateRentalDocumentUpload({ fileName: ticket.fileName, mimeType: info.data.contentType, binary: { length: fileSize } })
      if (fileSize !== ticket.fileSize || policy.mimeType !== ticket.mimeType) throw new Error('The uploaded file differs from the selected document.')
    } catch (cause) { await storage.remove([path]).catch(() => null); throw cause }
  } else {
    slot = rentalApplicationDocumentSlots(application.application_data).find((item) => item.subjectId === (body.subjectId || 'primary') && item.purpose === (body.purpose || body.documentType))
    if (!slot) throw new Error('Choose an evidence type and person in this application.')
    if (body.action === 'prepare_upload') {
      if (!signingSecret) throw new Error('Document upload is not configured.')
      policy = validateRentalDocumentUpload({ fileName: body.fileName, mimeType: body.mimeType, binary: { length: Number(body.fileSize) } })
      path = `${application.organisation_id}/${application.id}/${randomUUID()}-${policy.safeFileName}`
      const upload = await storage.createSignedUploadUrl(path, { upsert: false })
      if (upload.error) throw upload.error
      const payload = Buffer.from(JSON.stringify({ applicationId: application.id, organisationId: application.organisation_id, version: Number(application.version), path, subjectId: slot.subjectId, purpose: slot.purpose, source, fileName: policy.safeFileName, mimeType: policy.mimeType, fileSize: Number(body.fileSize), expiresAt: Date.now() + 10 * 60 * 1000 })).toString('base64url')
      return { uploadUrl: upload.data.signedUrl, ticket: `${payload}.${signature(payload, signingSecret)}` }
    }
    // Legacy binary transport remains available to versioned clients; the shared wizard uses direct,
    // signed storage upload so an 8 MB document never passes through an API body.
    const binary = Buffer.from(String(body.contentBase64 || ''), 'base64')
    policy = validateRentalDocumentUpload({ fileName: body.fileName, mimeType: body.mimeType, binary })
    fileSize = binary.length
    path = `${application.organisation_id}/${application.id}/${randomUUID()}-${policy.safeFileName}`
    const uploaded = await storage.upload(path, binary, { contentType: policy.mimeType, upsert: false })
    if (uploaded.error) throw uploaded.error
  }
  let document
  try {
    const inserted = await applicationClient.from('rental_application_documents').insert({ application_id: application.id, organisation_id: application.organisation_id, document_type: slot.type, storage_path: path, file_name: policy.safeFileName, mime_type: policy.mimeType, file_size_bytes: fileSize, uploaded_at: new Date().toISOString() }).select('id, document_type, status, file_name, uploaded_at').single()
    if (inserted.error) throw inserted.error
    document = inserted.data
    const links = [...(application.application_data?.documentLinks || []), { documentId: document.id, subjectId: slot.subjectId, purpose: slot.purpose, source }]
    const saved = await applicationClient.from('rental_applications').update({ application_data: { ...application.application_data, documentLinks: links }, version: Number(application.version) + 1 }).eq('id', application.id).eq('version', application.version).eq('status', 'draft').select('id, status, version, application_data, updated_at').maybeSingle()
    if (saved.error || !saved.data) throw saved.error || new Error('This application changed. Refresh and try again.')
    return { document, application: saved.data }
  } catch (cause) {
    if (document) await Promise.resolve(db.from('rental_application_documents').delete().eq('id', document.id)).catch(() => null)
    await storage.remove([path]).catch(() => null)
    throw cause
  }
}
