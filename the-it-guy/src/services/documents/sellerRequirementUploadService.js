import { prepareDocumentRequirementUpload, uploadDocumentRequirementFile } from './documentRequirementCommandService.js'
import { clearRequirementCommand, readRequirementCommand, retainRequirementCommand } from './documentRequirementCommandRecovery.js'
import { isDefiniteUploadSaveRejection } from '../../lib/documentUploadRecovery.js'

export async function uploadSellerRequirementFile({ client, token, accessToken, listingId, requirement, file, storage = globalThis.localStorage }) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const tokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const key = `arch9:seller-requirement:v1:${client.supabaseUrl}:${listingId}:${tokenHash}:${requirement.id}`
  const command = readRequirementCommand(storage, key) || await prepareDocumentRequirementUpload(file, {
    commandId: crypto.randomUUID(), actorId: listingId, requirementId: requirement.id,
    contextType: 'private_listing', contextId: listingId, expectedRevision: requirement.command_revision,
    replacesUploadId: requirement.latest_upload_id || null,
  })
  retainRequirementCommand(storage, key, command)
  const adapter = {
    storage: client.storage,
    rpc(name, args) {
      const auth = { p_token: token, p_access_token: accessToken, p_command_id: args.p_command_id }
      if (name === 'bridge_document_requirement_command_receipt') return client.rpc('bridge_seller_requirement_upload_receipt', auth)
      if (name !== 'bridge_document_requirement_command' || args.p_action !== 'upload') throw new Error('Unsupported seller upload operation.')
      return client.rpc('bridge_seller_requirement_upload', { ...auth, p_requirement_id: args.p_requirement_id, p_expected_revision: args.p_expected_revision, p_payload: args.p_payload })
    },
  }
  try {
    const result = await uploadDocumentRequirementFile(adapter, command, file)
    clearRequirementCommand(storage, key, command)
    return { result, command }
  } catch (error) {
    if (isDefiniteUploadSaveRejection(error)) clearRequirementCommand(storage, key, command)
    throw error
  }
}
