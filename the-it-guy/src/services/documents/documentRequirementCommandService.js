import { validateDocumentUploadFile, withDocumentUploadMimeType } from '../../lib/documentUploadPolicy.js'
import { isDefiniteUploadSaveRejection } from '../../lib/documentUploadRecovery.js'
import { createDocumentUploadProgressReporter, DOCUMENT_UPLOAD_TIMEOUTS, withDocumentUploadDeadline } from '../../lib/documentUploadLifecycle.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const unconfirmed = (cause) => Object.assign(new Error('The save could not be confirmed. Retry this same command to recover the result.'), {
  code: 'document_save_unconfirmed', cause,
})
async function rpc(client, name, args) {
  let response
  try { response = await withDocumentUploadDeadline(signal => {
    const request = client.rpc(name, args)
    return typeof request.abortSignal === 'function' ? request.abortSignal(signal) : request
  }, { timeoutMs: DOCUMENT_UPLOAD_TIMEOUTS.saving }) } catch (error) { throw unconfirmed(error) }
  if (response?.error) {
    if (isDefiniteUploadSaveRejection(response.error)) throw response.error
    throw unconfirmed(response.error)
  }
  return response?.data
}

// The caller retains this envelope until confirmed, including after a reload.
// Never allocate a new command ID inside the save or retry operation.
export async function executeDocumentRequirementCommand(client, command) {
  const { commandId, action, contextType, contextId, requirementId = null, expectedRevision = null, payload = {} } = command
  if (!uuid.test(commandId || '') || !uuid.test(contextId || '')) throw new Error('A stable command ID and context ID are required.')
  const result = await rpc(client, 'bridge_document_requirement_command', {
    p_command_id: commandId, p_action: action, p_context_type: contextType, p_context_id: contextId,
    p_requirement_id: requirementId, p_expected_revision: expectedRevision, p_payload: payload,
  })
  if (result?.saved !== true || result.commandId !== commandId || !result.requirement?.id) throw unconfirmed()
  if (requirementId && result.requirement.id !== requirementId) throw unconfirmed()
  if (action === 'upload' && !uuid.test(result.uploadId || '')) throw unconfirmed()
  if (globalThis.window && typeof CustomEvent !== 'undefined') {
    globalThis.window.dispatchEvent(new CustomEvent('arch9:document-requirements-changed', { detail: result.refreshContexts }))
  }
  return result
}

export const addDocumentRequirement = (client, command) => executeDocumentRequirementCommand(client, { ...command, action: 'add' })
export const removeDocumentRequirement = (client, command) => executeDocumentRequirementCommand(client, { ...command, action: 'remove' })
export const restoreDocumentRequirement = (client, command) => executeDocumentRequirementCommand(client, { ...command, action: 'restore' })

export async function prepareDocumentRequirementUpload(file, { commandId, actorId, requirementId, contextType, contextId, expectedRevision, replacesUploadId = null }) {
  for (const id of [commandId, actorId, requirementId, contextId]) if (!uuid.test(id || '')) throw new Error('Upload identity is missing.')
  const validated = validateDocumentUploadFile(file, { surface: 'requirement_command' })
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return {
    commandId, action: 'upload', contextType, contextId, requirementId, expectedRevision,
    payload: {
      filePath: `document-requirements/${requirementId}/${actorId}/${commandId}/${validated.safeName}`,
      fileName: validated.safeName, mimeType: validated.mimeType, sizeBytes: file.size, sha256, replacesUploadId,
    },
  }
}

export async function uploadDocumentRequirementFile(client, command, file, { onProgress = null } = {}) {
  const report = createDocumentUploadProgressReporter(onProgress)
  const fileName = file?.name || command.payload?.fileName
  report('preparing', '', { fileName })
  if (command.action !== 'upload' || !uuid.test(command.commandId || '')) throw new Error('Prepare the upload before saving.')
  const receipt = await rpc(client, 'bridge_document_requirement_command_receipt', { p_command_id: command.commandId })
  // Let the command RPC compare the entire immutable envelope and recheck access.
  if (receipt) {
    report('saving', 'Checking the saved upload…', { fileName })
    const result = await executeDocumentRequirementCommand(client, command)
    report('complete', 'Uploaded', { fileName })
    return result
  }
  if (!file) throw Object.assign(new Error('Choose the original file to finish this upload.'), { code: 'upload_file_required' })
  const actorId = command.payload.filePath.split('/')[2]
  const prepared = await prepareDocumentRequirementUpload(file, { ...command, actorId, replacesUploadId: command.payload.replacesUploadId })
  if (Object.keys(prepared.payload).some(key => prepared.payload[key] !== command.payload[key])) throw new Error('Choose the same file to retry this upload.')
  let upload
  report('uploading', '', { fileName })
  try {
    upload = await withDocumentUploadDeadline(() => client.storage.from('documents').upload(command.payload.filePath,
      withDocumentUploadMimeType(file, command.payload.mimeType), {
        upsert: false, contentType: command.payload.mimeType, metadata: { sha256: command.payload.sha256 },
      }), { timeoutMs: DOCUMENT_UPLOAD_TIMEOUTS.uploading })
  } catch (error) { throw unconfirmed(error) }
  // A previous attempt may already have saved the immutable bytes. The server
  // validates owner, path, size, MIME and digest metadata before linking them.
  if (upload.error && ![upload.error.statusCode, upload.error.code].some(code => ['409', 'Duplicate', 'ResourceAlreadyExists'].includes(String(code)))) throw unconfirmed(upload.error)
  // Never delete bytes on an uncertain database response. Retry the same envelope.
  report('saving', '', { fileName })
  const result = await executeDocumentRequirementCommand(client, command)
  report('complete', 'Uploaded', { fileName, documentId: result.uploadId })
  return result
}
