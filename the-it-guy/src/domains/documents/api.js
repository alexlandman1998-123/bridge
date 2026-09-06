// Canonical document-domain API. Start with operations whose public contract
// is small and fully covered before moving upload/signing orchestration.
export async function generateOtpDocumentFromTemplate({ transactionId } = {}) {
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) {
    throw new Error('Transaction is required.')
  }

  const error = new Error(
    'The legacy OTP DOCX renderer is retired. Generate OTPs through the canonical packet-bound PDF workflow.',
  )
  error.code = 'OTP_LEGACY_RENDERER_RETIRED'
  error.requiredAction = 'CREATE_OR_REISSUE_CANONICAL_OTP_PDF'
  throw error
}

// The repository operation receives its infrastructure dependencies explicitly.
// The legacy facade continues to provide those dependencies during migration.
export async function updateDocumentClientVisibilityRecord({
  client,
  documentId,
  isClientVisible,
  isMissingColumnError,
  recordEvent,
} = {}) {
  const visibilityScope = isClientVisible ? 'shared' : 'internal'

  let query = await client
    .from('documents')
    .update({
      is_client_visible: Boolean(isClientVisible),
      visibility_scope: visibilityScope,
    })
    .eq('id', documentId)
    .select('id, transaction_id, is_client_visible, visibility_scope')
    .single()

  if (query.error && isMissingColumnError(query.error, 'visibility_scope')) {
    query = await client
      .from('documents')
      .update({ is_client_visible: Boolean(isClientVisible) })
      .eq('id', documentId)
      .select('id, transaction_id, is_client_visible')
      .single()
  }

  const { data, error } = query
  if (error) {
    if (error.code === '42703') {
      throw new Error('is_client_visible column is missing. Run sql/schema.sql first.')
    }
    throw error
  }

  await recordEvent({
    transactionId: data?.transaction_id || null,
    eventType: 'DocumentVisibilityChanged',
    eventData: {
      documentId: data?.id || documentId,
      isClientVisible: Boolean(data?.is_client_visible ?? isClientVisible),
      visibilityScope: data?.visibility_scope || visibilityScope,
    },
  })

  return data
}
