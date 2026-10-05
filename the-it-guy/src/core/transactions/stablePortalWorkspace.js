// Apply only within the same authorised portal scope. Unavailable/denied reads
// must remain unavailable; never revive a snapshot after access was removed.
export function selectStablePortalWorkspace(previous, incoming) {
  const before = previous?.transactionJourneySnapshot?.legalJourney
  const after = incoming?.transactionJourneySnapshot?.legalJourney
  if (before?.status !== 'ready' || after?.status !== 'ready'
    || before.snapshot.transactionId !== after.snapshot.transactionId
    || after.snapshot.revision >= before.snapshot.revision) return incoming
  // The matter watermark now covers appointments too. A late older workspace
  // must not roll back a saved response while retaining the newer journey.
  return { ...incoming,
    ...(Array.isArray(previous.appointments) ? { appointments: previous.appointments } : {}),
    ...(Array.isArray(previous.legacyPortalData?.appointments) ? { legacyPortalData: {
      ...incoming.legacyPortalData, appointments: previous.legacyPortalData.appointments,
    } } : {}),
    transactionJourneySnapshot: {
    ...incoming.transactionJourneySnapshot, legalJourney: before,
  } }
}
