function text(value) {
  return String(value || '').trim()
}

function getTransactionId(rollup) {
  return text(rollup?.transactionId || rollup?.transaction_id || rollup?.transactionJourneySnapshot?.transactionId)
}

function hasCanonicalJourney(rollup) {
  const snapshot = rollup?.transactionJourneySnapshot
  return Boolean(
    snapshot &&
      Number(snapshot.schemaVersion) >= 1 &&
      Array.isArray(snapshot.milestones) &&
      snapshot.milestones.length,
  )
}

function getDerivedTime(rollup) {
  const value =
    rollup?.transactionJourneySnapshot?.derivedAt ||
    rollup?.derivedAt ||
    rollup?.lastWorkflowUpdatedAt ||
    ''
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function selectStableTransactionRollup(previous, incoming, { transactionId = '' } = {}) {
  const targetTransactionId = text(transactionId)
  const previousTransactionId = getTransactionId(previous)
  const incomingTransactionId = getTransactionId(incoming)
  const previousMatchesTarget = !targetTransactionId || !previousTransactionId || previousTransactionId === targetTransactionId

  if (!incoming || typeof incoming !== 'object') {
    return previousMatchesTarget ? previous || null : null
  }

  if (targetTransactionId && incomingTransactionId && incomingTransactionId !== targetTransactionId) {
    return previousMatchesTarget ? previous || null : null
  }

  if (!previous || !previousMatchesTarget) {
    return incoming
  }

  if (hasCanonicalJourney(previous) && !hasCanonicalJourney(incoming)) {
    return previous
  }

  const previousDerivedTime = getDerivedTime(previous)
  const incomingDerivedTime = getDerivedTime(incoming)
  if (previousDerivedTime && incomingDerivedTime && incomingDerivedTime < previousDerivedTime) {
    return previous
  }

  return incoming
}

export function hasCanonicalTransactionJourney(rollup) {
  return hasCanonicalJourney(rollup)
}
