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

  const oldLegal = previous.transactionJourneySnapshot?.legalJourney
  const newLegal = incoming.transactionJourneySnapshot?.legalJourney
  // Keep a same-matter snapshot during a transient transport/database failure,
  // but never retain it after an authorization or invalid-plan response.
  if (oldLegal?.status === 'ready' && newLegal?.status === 'unavailable' && newLegal.retryable &&
      oldLegal.snapshot?.transactionId === incomingTransactionId) {
    incoming = { ...incoming, transactionJourneySnapshot: {
      ...incoming.transactionJourneySnapshot, legalJourney: { ...oldLegal, stale: true },
    } }
  }
  if (oldLegal?.status === 'ready' && newLegal?.status === 'ready' &&
      oldLegal.snapshot.transactionId === newLegal.snapshot.transactionId &&
      oldLegal.snapshot.revision > newLegal.snapshot.revision) {
    incoming = { ...incoming, transactionJourneySnapshot: {
      ...incoming.transactionJourneySnapshot, legalJourney: oldLegal,
    } }
  }
  // Legal revisions are independent of the older overall-rollup timestamp.
  const previousWithNewerLegal = newLegal?.status === 'ready' &&
    newLegal.snapshot.transactionId === previousTransactionId &&
    (!oldLegal?.snapshot || newLegal.snapshot.revision > oldLegal.snapshot.revision)
    ? { ...previous, transactionJourneySnapshot: {
      ...previous.transactionJourneySnapshot, legalJourney: newLegal,
    } } : previous

  if (hasCanonicalJourney(previous) && !hasCanonicalJourney(incoming)) {
    return previousWithNewerLegal
  }

  const previousDerivedTime = getDerivedTime(previous)
  const incomingDerivedTime = getDerivedTime(incoming)
  if (previousDerivedTime && incomingDerivedTime && incomingDerivedTime < previousDerivedTime) {
    return previousWithNewerLegal
  }

  return incoming
}

export function hasCanonicalTransactionJourney(rollup) {
  return hasCanonicalJourney(rollup)
}
