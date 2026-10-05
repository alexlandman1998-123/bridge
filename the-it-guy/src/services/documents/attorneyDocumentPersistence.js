const attorneyRoles = new Set(['attorney', 'conveyancer', 'transferring_attorney', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney'])

export function isAttorneyDocumentActor(role) {
  return attorneyRoles.has(String(role || '').trim().toLowerCase())
}

async function documentRpc(client, name, parameters) {
  let result
  try {
    result = await client.rpc(name, parameters)
  } catch (error) {
    throw Object.assign(new Error('The save could not be confirmed. Reopen the matter before retrying.'), {
      code: 'document_save_unconfirmed', cause: error,
    })
  }
  if (result.error) {
    if (['PGRST202', '42883'].includes(result.error.code)) {
      throw Object.assign(new Error('Reliable attorney document saving is not available yet. Contact your administrator.'), {
        code: result.error.code, cause: result.error,
      })
    }
    if (!isDefiniteDocumentSaveFailure(result.error)) {
      throw Object.assign(new Error('The save could not be confirmed. Reopen the matter before retrying.'), {
        code: 'document_save_unconfirmed', cause: result.error,
      })
    }
    throw result.error
  }
  return result.data
}

export async function persistAttorneyDocument(client, { document, documentRequestId = null }) {
  const result = await documentRpc(client, document.attorney_version_kind ? 'bridge_save_attorney_document_version' : 'bridge_save_attorney_document', {
    p_document: document, p_document_request_id: documentRequestId,
  })
  if (!result?.document?.id) throw new Error('The saved document could not be confirmed. Refresh the matter before retrying.')
  return {
    ...result.document,
    canonicalRequirementInstanceId: result.document.canonical_requirement_instance_id || null,
    deduplicated: result.deduplicated === true,
    saved: true,
    postUploadProcessing: 'complete',
    refreshRequired: true,
    // A temporary download URL is resolved by the document reader. Its failure
    // or expiry must never change the outcome of a committed upload.
    url: null,
  }
}

export async function requestAttorneyDocuments(client, { transactionId, requests, commandId, groupTitle, groupDescription }) {
  const transientFields = new Set(['created_at', 'updated_at', 'created_by', 'created_by_role', 'request_group_id'])
  const result = await documentRpc(client, 'bridge_request_attorney_documents', {
    p_transaction_id: transactionId,
    p_requests: requests.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !transientFields.has(key)))),
    p_command_id: commandId || crypto.randomUUID(),
    p_group_title: groupTitle || null,
    p_group_description: groupDescription || null,
  })
  if (!Array.isArray(result) || result.length !== requests.length || result.some(row => !row.id)) {
    throw new Error('The saved requests could not be confirmed. Refresh the matter before retrying.')
  }
  return result
}

export async function reviewAttorneyDocument(client, { requirementInstanceId, documentId, action, reason, actorRole, commandId }) {
  const result = await documentRpc(client, 'bridge_review_attorney_document', {
    p_requirement_instance_id: requirementInstanceId, p_document_id: documentId || null,
    p_action: action, p_reason: reason || null, p_actor_role: actorRole,
    p_command_id: commandId || crypto.randomUUID(),
  })
  if (result?.ok !== true || result.requirementInstanceId !== requirementInstanceId) {
    throw new Error('The saved review could not be confirmed. Refresh the matter before retrying.')
  }
  return { ...result, saved: true, refreshRequired: true }
}

export async function reviewAttorneyDocumentRequest(client, { requestId, documentId, action, reason, commandId }) {
  const result = await documentRpc(client, 'bridge_review_attorney_document_request', {
    p_request_id: requestId, p_document_id: documentId,
    p_action: action, p_reason: reason?.trim() || null, p_command_id: commandId || crypto.randomUUID(),
  })
  if (result?.ok !== true || result.request?.id !== requestId) {
    throw new Error('The saved review could not be confirmed. Refresh the matter before retrying.')
  }
  return { ...result, saved: true, refreshRequired: true }
}

export function isDefiniteDocumentSaveFailure(error) {
  // A transport error may have occurred AFTER commit. Keep its storage object
  // so the same retry key can recover the saved record without deleting it.
  const code = String(error?.code || '')
  return (/^[0-9A-Z]{5}$/.test(code) && !code.startsWith('08')) || /^PGRST[12]/.test(code)
}

export function refreshAfterDocumentSave(refresh, onPending) {
  return Promise.resolve().then(refresh).catch(() => onPending?.())
}
