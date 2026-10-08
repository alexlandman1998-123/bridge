import { validateDocumentUploadFile } from '../../src/lib/documentUploadPolicy.js'
import { isDefiniteUploadSaveRejection } from '../../src/lib/documentUploadRecovery.js'
import { readRentalSavedChecklist } from './rentalSavedChecklist.js'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { rentalApplicationSavedDocumentSlots } from '../../src/services/rentals/rentalApplicationWizardModel.js'
const bucket = 'rental-application-documents'
export function validateRentalDocumentUpload({ fileName = '', mimeType = '', binary = Buffer.alloc(0) } = {}) {
  const policy = validateDocumentUploadFile({ name: fileName, type: mimeType, size: binary.length }, { surface: 'rental_application' })
  return { safeFileName: policy.safeName, mimeType: policy.mimeType }

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
  if (!['draft', 'submitted', 'under_review'].includes(application.status)) throw new Error('This application can no longer be edited.')
  let existingDocument = null
  let completionTicket = null
  if (body.action === 'complete_upload') {
    if (!signingSecret) throw new Error('Document upload is not configured.')
    completionTicket = readTicket(body.ticket, signingSecret, application, source)
    const found = await applicationClient.from('rental_application_documents').select('id, document_type, status, file_name, uploaded_at, created_at, intake_bundle_id, storage_path, intake_requirement_id, intake_generation').eq('application_id', application.id).eq('storage_path', completionTicket.path).maybeSingle()
    if (found.error) throw found.error
    existingDocument = found.data
    if (existingDocument && existingDocument.storage_path !== completionTicket.path) throw new Error('Upload recovery did not match the exact file.')
    if (existingDocument && application.application_data?.documentLinks?.some(link => link.documentId === existingDocument.id && link.requirementId === completionTicket.requirementId && Number(link.generation) === completionTicket.generation)) {
      return { document: existingDocument, application }
    }
  }
  if (Number(body.version) !== Number(application.version)) throw new Error('This application changed. Refresh and try again.')
  const requirements = await readRentalSavedChecklist(applicationClient, application)
  if (!requirements.length) throw new Error('Save the draft to prepare its document checklist before uploading.')
  const findRequirement = (subjectId, purpose, id, generation) => {
    const requirement = requirements.find((item) => item.active && item.mode === 'active' && item.scopeKey === 'application' && item.subjectId === subjectId && item.purpose === purpose)
    if (!requirement) throw new Error('Save the draft to prepare its document checklist before uploading.')
    if ((id && requirement.id !== id) || (generation !== undefined && requirement.generation !== Number(generation))) throw new Error('The saved evidence requirement changed. Refresh and upload again.')
    if (application.status !== 'draft' && requirement.state === 'accepted' && (!requirement.expiresAt || Date.parse(requirement.expiresAt) > Date.now())) throw new Error('This document has already been accepted. Contact your agent for a correction.')
    return requirement
  }
  const storage = db.storage.from(bucket)
  let slot, requirement, policy, path, fileSize, bundleId = randomUUID()
  if (body.action === 'complete_upload') {
    if (!signingSecret) throw new Error('Document upload is not configured.')
    const ticket = completionTicket
    if (ticket.version !== Number(application.version)) throw new Error('This application changed. Refresh and try again.')
    slot = rentalApplicationSavedDocumentSlots(application.application_data, requirements).find((item) => item.subjectId === ticket.subjectId && item.purpose === ticket.purpose)
    if (!slot) throw new Error('The person or evidence requirement changed. Please upload again.')
    requirement = findRequirement(ticket.subjectId, ticket.purpose, ticket.requirementId, ticket.generation)
    if (!ticket.requirementId || !Number.isInteger(ticket.generation)) throw new Error('The document receipt predates the saved checklist. Prepare a new upload.')
    bundleId = ticket.bundleId || randomUUID()
    path = ticket.path
    const info = await storage.info(path)
    if (info.error || !info.data) throw new Error('The file upload is incomplete. Retry the upload.')
    fileSize = Number(info.data.size)
    try {
      if (!info.data.contentType) throw new Error('The uploaded file has no verified content type.')
      policy = validateRentalDocumentUpload({ fileName: ticket.fileName, mimeType: info.data.contentType, binary: { length: fileSize } })
      if (fileSize !== ticket.fileSize || policy.mimeType !== ticket.mimeType) throw new Error('The uploaded file differs from the selected document.')
    } catch (cause) { await storage.remove([path]).catch(() => null); throw cause }
  } else {
    slot = rentalApplicationSavedDocumentSlots(application.application_data, requirements).find((item) => item.subjectId === (body.subjectId || 'primary') && item.purpose === (body.purpose || body.documentType))
    if (!slot) throw new Error('Choose an evidence type and person in this application.')
    requirement = findRequirement(slot.subjectId, slot.purpose, body.requirementId, body.generation)
    if (body.appendToPack === true) {
      if (!requirement.documentId) throw new Error('Upload the first file before adding to this pack.')
      const current = await applicationClient.from('rental_application_documents').select('intake_bundle_id').eq('id', requirement.documentId).eq('application_id', application.id).maybeSingle()
      if (current.error || !current.data?.intake_bundle_id) throw new Error('The document pack changed. Refresh and try again.')
      bundleId = current.data.intake_bundle_id
    }
    if (body.action === 'prepare_upload') {
      if (!signingSecret) throw new Error('Document upload is not configured.')
      policy = validateRentalDocumentUpload({ fileName: body.fileName, mimeType: body.mimeType, binary: { length: Number(body.fileSize) } })
      path = `${application.organisation_id}/${application.id}/${randomUUID()}-${policy.safeFileName}`
      const upload = await storage.createSignedUploadUrl(path, { upsert: false })
      if (upload.error) throw upload.error
      const payload = Buffer.from(JSON.stringify({ applicationId: application.id, organisationId: application.organisation_id, version: Number(application.version), path, bundleId, requirementId: requirement.id, generation: requirement.generation, subjectId: slot.subjectId, purpose: slot.purpose, source, fileName: policy.safeFileName, mimeType: policy.mimeType, fileSize: Number(body.fileSize), expiresAt: Date.now() + 10 * 60 * 1000 })).toString('base64url')
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
  let document = existingDocument
  try {
    const objectId = path.split('/').at(-1)?.slice(0, 36)
    const documentId = /^[a-f0-9-]{36}$/i.test(objectId || '') ? objectId : randomUUID()
    const inserted = document ? { data: document } : await applicationClient.from('rental_application_documents').insert({ id: documentId, application_id: application.id, organisation_id: application.organisation_id, document_type: slot.type, intake_requirement_id: requirement.id, intake_generation: requirement.generation, intake_bundle_id: bundleId, storage_path: path, file_name: policy.safeFileName, mime_type: policy.mimeType, file_size_bytes: fileSize, uploaded_at: new Date().toISOString() }).select('id, document_type, status, file_name, uploaded_at, created_at, intake_bundle_id').single()
    if (inserted.error) throw inserted.error
    document = inserted.data
    const links = [...(application.application_data?.documentLinks || []), { documentId: document.id, subjectId: slot.subjectId, purpose: slot.purpose, source, requirementId: requirement.id, generation: requirement.generation }]
    const saved = application.status !== 'draft' ? await applicationClient.rpc('rental_attach_submitted_document', { p_application_id: application.id, p_expected_version: Number(application.version), p_document_id: document.id, p_requirement_id: requirement.id, p_generation: requirement.generation }) : await applicationClient.from('rental_applications').update({ application_data: { ...application.application_data, documentLinks: links }, version: Number(application.version) + 1 }).eq('id', application.id).eq('version', application.version).eq('status', 'draft').select('id, status, version, application_data, organisation_id, updated_at, cost_snapshot_json, confirmation_json, application_fee_due_at').maybeSingle()
    if (saved.error || !saved.data) throw saved.error || Object.assign(new Error('This application changed. Refresh and try again.'), { code: '40001' })
    return { document, application: saved.data }
  } catch (cause) {
    // Never delete an insert/update whose response was lost. Recover only an
    // exact document assignment through the current authorised application.
    try {
      const found = await applicationClient.from('rental_application_documents').select('id, storage_path, intake_requirement_id, intake_generation, document_type, status, file_name, intake_bundle_id').eq('application_id', application.id).eq('storage_path', path).maybeSingle()
      const current = await applicationClient.from('rental_applications').select('*').eq('id', application.id).maybeSingle()
      if (!found.error && !current.error && found.data?.storage_path === path && current.data?.application_data?.documentLinks?.some(link => link.documentId === found.data.id && link.requirementId === requirement.id && Number(link.generation) === requirement.generation)) return { document: found.data, application: current.data }
    } catch { /* Missing recovery evidence is not proof of rollback. */ }
    if (!isDefiniteUploadSaveRejection(cause) || cause?.code === '23505') throw cause
    let removable = !document
    if (document) {
      try {
        const removed = await db.from('rental_application_documents').delete().eq('id', document.id).select('id').maybeSingle()
        removable = Boolean(!removed.error && removed.data?.id === document.id)
      } catch { removable = false }
    }
    if (removable) await storage.remove([path]).catch(() => null)
    throw cause
  }
}
