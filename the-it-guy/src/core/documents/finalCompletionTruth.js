function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function count(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeFinalCompletionState(finalCompletion = null) {
  if (!finalCompletion || typeof finalCompletion !== 'object') return null

  const recipientCount = count(finalCompletion.recipientCount || finalCompletion.recipient_count)
  const deliveredRecipientCount = count(finalCompletion.deliveredRecipientCount || finalCompletion.delivered_recipient_count)
  const outstandingRecipientCount = Math.max(
    count(finalCompletion.outstandingRecipientCount || finalCompletion.outstanding_recipient_count),
    recipientCount > 0 ? recipientCount - deliveredRecipientCount : 0,
  )
  const stage = key(finalCompletion.stage)
  const explicitDeliveryReady = finalCompletion.deliveryReady ?? finalCompletion.delivery_ready
  const deliveryCountsComplete = recipientCount > 0 && deliveredRecipientCount >= recipientCount
  const deliveryReady = explicitDeliveryReady === false
    ? false
    : explicitDeliveryReady === true
      ? deliveryCountsComplete
      : deliveryCountsComplete
  const completionStageReady = !stage || stage === 'completed_everywhere'
  const ready = finalCompletion.ready === true && completionStageReady && deliveryReady
  const safeStage = ready
    ? 'completed_everywhere'
    : stage === 'completed_everywhere' && !deliveryReady
      ? 'awaiting_recipient_delivery'
      : stage || 'awaiting_recipient_delivery'

  return {
    ...finalCompletion,
    ready,
    stage: safeStage,
    retryable: finalCompletion.retryable === true ||
      (!ready && (finalCompletion.deliveryRetryable === true || finalCompletion.delivery_retryable === true || Boolean(text(finalCompletion.finalArtifactPath || finalCompletion.final_artifact_path)))),
    deliveryReady,
    deliveryStage: ready
      ? 'recipient_delivery_complete'
      : text(finalCompletion.deliveryStage || finalCompletion.delivery_stage) || 'recipient_delivery_pending',
    recipientCount,
    deliveredRecipientCount,
    outstandingRecipientCount,
  }
}

export function isFinalCompletionReady(finalCompletion = null) {
  return normalizeFinalCompletionState(finalCompletion)?.ready === true
}
