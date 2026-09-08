// Apply only within the same authorised portal scope. Unavailable/denied reads
// must remain unavailable; never revive a snapshot after access was removed.
export function selectStablePortalWorkspace(previous, incoming) {
  const before = previous?.transactionJourneySnapshot?.legalJourney
  const after = incoming?.transactionJourneySnapshot?.legalJourney
  if (before?.status !== 'ready' || after?.status !== 'ready'
    || before.snapshot.transactionId !== after.snapshot.transactionId
    || after.snapshot.revision >= before.snapshot.revision) return incoming
  return { ...incoming, transactionJourneySnapshot: {
    ...incoming.transactionJourneySnapshot, legalJourney: before,
  } }
}
