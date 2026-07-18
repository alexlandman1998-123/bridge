function text(value) { return typeof value === 'string' ? value.trim() : '' }

export function assessFinalCompletionRecovery({ status = {}, retryAttempts = [] } = {}) {
  const reasons = []
  if (text(status.contract) !== 'f5-v1') reasons.push('F5_STATUS_CONTRACT_INVALID')
  if (!text(status.packetId || status.packet_id) || !text(status.versionId || status.version_id)) reasons.push('F5_TARGET_MISSING')
  if (status.ready === true && text(status.stage) !== 'completed_everywhere') reasons.push('F5_READY_STAGE_INVALID')
  if (status.ready !== true && status.retryable === true && !text(status.finalArtifactPath || status.final_artifact_path)) reasons.push('F5_RETRY_ARTIFACT_MISSING')
  const processing = (Array.isArray(retryAttempts) ? retryAttempts : []).filter((attempt) => text(attempt.status) === 'processing')
  if (processing.length > 1) reasons.push('F5_CONCURRENT_RETRY_INVALID')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], completedEverywhere: status.ready === true, retryAvailable: status.ready !== true && status.retryable === true, processingRetryCount: processing.length }
}
