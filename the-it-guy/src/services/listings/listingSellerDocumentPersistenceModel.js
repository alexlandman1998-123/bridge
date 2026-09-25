function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function buildPrivateListingDocumentPersistenceReceipt({
  documentRow = null,
  storagePath = '',
  requirementStatusUpdated = false,
  requirementStatusApplicable = false,
  promotion = null,
  promotionAttempted = false,
  warnings = [],
} = {}) {
  const persistedDocumentId = text(documentRow?.id)
  const persistedStoragePath = text(documentRow?.storage_path || storagePath)
  const normalizedWarnings = (Array.isArray(warnings) ? warnings : []).map(text).filter(Boolean)
  const recordVerified = Boolean(persistedDocumentId && persistedStoragePath)
  const promotionError = text(promotion?.error || promotion?.promotion_error)
  const promotionStatus = text(promotion?.promotion_status || promotion?.reason)
  const pendingTransactionPromotion = Boolean(
    promotion?.pending_transaction_promotion ||
    ['pending', 'pending_transaction', 'no_transaction'].includes(key(promotionStatus)),
  )

  return {
    status: recordVerified ? (normalizedWarnings.length ? 'verified_with_attention' : 'verified') : 'unverified',
    recordVerified,
    storageVerified: Boolean(persistedStoragePath),
    documentId: persistedDocumentId,
    storagePath: persistedStoragePath,
    requirementStatus: requirementStatusApplicable
      ? requirementStatusUpdated ? 'updated' : 'attention'
      : 'not_applicable',
    transactionHandoff: !promotionAttempted
      ? 'not_attempted'
      : promotionError || normalizedWarnings.some((warning) => warning.toLowerCase().includes('transaction'))
        ? 'attention'
        : pendingTransactionPromotion
          ? 'pending_transaction'
          : 'linked',
    warnings: normalizedWarnings,
  }
}

export default buildPrivateListingDocumentPersistenceReceipt
