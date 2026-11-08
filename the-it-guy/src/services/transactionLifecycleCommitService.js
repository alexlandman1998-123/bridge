export async function getTransactionLifecyclePermissions(client, transactionId) {
  const { data, error } = await client.rpc('bridge_get_transaction_lifecycle_permissions', { p_transaction_id: transactionId })
  if (error) throw error
  return data || {}
}

export function requireLifecycleActionReceipt(data, transactionId, allowedStates) {
  if (data?.id !== transactionId || !allowedStates.includes(data?.lifecycle_state)) {
    throw Object.assign(new Error('This change could not be confirmed. Refresh the transaction before trying again.'), { code: 'TRANSACTION_LIFECYCLE_UNCONFIRMED' })
  }
  return data
}

export async function commitTransactionLifecycle(client, { transactionId, action, registrationDate = null, titleDeedNumber = null, confirmationDocumentId = null }) {
  const { data, error } = await client.rpc('bridge_commit_transaction_lifecycle', {
    p_transaction_id: transactionId, p_action: action, p_registration_date: registrationDate,
    p_title_deed_number: titleDeedNumber, p_confirmation_document_id: confirmationDocumentId,
  })
  if (error) {
    if (error.code === '42501' && /row-level security|permission denied/i.test(error.message || '')) {
      throw Object.assign(new Error('Your current transaction permissions blocked this change. Refresh and ask the matter owner to check your access.'), { code: error.code })
    }
    throw error
  }
  const confirmed = data?.transactionId === transactionId && data?.action === action
    && (action === 'register' ? ['registered', 'completed'].includes(data.lifecycleState) && Boolean(data.registeredAt) : data.lifecycleState === 'completed' && Boolean(data.completedAt))
  if (!confirmed) throw Object.assign(new Error('This change could not be confirmed. Refresh the transaction before trying again.'), { code: 'TRANSACTION_LIFECYCLE_UNCONFIRMED' })
  return data
}

export async function readCommittedLifecycle({ receipt, transaction, read, followUps = [], warnings = [] }) {
  const results = await Promise.allSettled(followUps.map(item => Promise.resolve().then(item.run)))
  const notices = [...warnings.map(item => typeof item === 'string' ? item : item?.message).filter(Boolean)]
  results.forEach((result, index) => {
    if (result.status === 'rejected') notices.push(`The transaction change is saved, but ${followUps[index].label} could not be confirmed. Refresh and check the saved status before repeating the action.`)
  })
  let detail
  try {
    detail = await read()
    if (detail?.transaction?.id !== receipt.transactionId) throw new Error('Transaction refresh was incomplete.')
  } catch {
    notices.push('The transaction change is saved. The latest view could not be loaded; refresh before making another change.')
    detail = { transaction: { ...transaction, lifecycle_state: receipt.lifecycleState,
      registered_at: receipt.registeredAt, completed_at: receipt.completedAt,
      registration_date: receipt.registrationDate, title_deed_number: receipt.titleDeedNumber,
      registration_confirmation_document_id: receipt.registrationConfirmationDocumentId } }
  }
  return { ...detail, lifecycleReceipt: receipt, lifecycleWarnings: notices }
}
