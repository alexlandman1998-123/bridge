function normalizeText(value) {
  return String(value || '').trim()
}

export function buildLegalDocumentSupportReference({ packetType = 'document', packetId = '', code = 'GENERATION_FAILED' } = {}) {
  const type = normalizeText(packetType).toUpperCase() === 'OTP' ? 'OTP' : 'MAN'
  const packet = normalizeText(packetId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'UNSAVED'
  const reason = normalizeText(code).replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase() || 'FAILED'
  return `LD-${type}-${packet}-${reason}`
}

export function resolveLegalDocumentRetryPolicy({ recovery = {}, previousFailureCount = 0, packetType = 'mandate', packetId = '' } = {}) {
  const failureCount = Math.max(0, Number(previousFailureCount || 0)) + 1
  const supportReference = buildLegalDocumentSupportReference({ packetType, packetId, code: recovery?.code })
  if (recovery?.actionKey === 'retry' && failureCount > 1) {
    return {
      ...recovery,
      failureCount,
      escalated: true,
      retryable: false,
      actionKey: 'contact_support',
      actionLabel: 'Copy support reference',
      nextAction: `Stop retrying and contact support with reference ${supportReference}.`,
      supportReference,
    }
  }
  return { ...recovery, failureCount, escalated: false, supportReference }
}
