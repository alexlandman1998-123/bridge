function normalizeStage(value = '') {
  return String(value || '').trim().toUpperCase()
}

export function mapLegacyStageToWorkflowAction(requestedStage) {
  const normalized = normalizeStage(requestedStage)

  switch (normalized) {
    case 'FIN':
    case 'FINANCE':
      return 'MOVE_TO_FINANCE'
    case 'ATTY':
    case 'XFER':
    case 'TRANSFER':
      return 'MOVE_TO_TRANSFER'
    case 'REG':
    case 'REGISTRATION':
      return 'MARK_READY_FOR_REGISTRATION'
    case 'COMPLETE':
    case 'REGISTERED':
      return 'MARK_REGISTERED'
    case 'CANCELLED':
    case 'ARCHIVED':
      return 'CANCEL_TRANSACTION'
    default:
      throw new Error(`Unsupported legacy stage: ${requestedStage}`)
  }
}
