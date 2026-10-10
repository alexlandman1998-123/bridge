export default function ListingChannelLastUpdate({ publicationState, publication, fallback = '', lifecycleOnly = false }) {
  const events = [
    ['Published', publication?.publishedAt],
    ['Updated', publication?.lastSyncedAt || publication?.updatedAt],
    ['Sent', publicationState?.submittedAt],
    ['Accepted', publicationState?.acceptedAt],
    ['Verified', publicationState?.verifiedAt],
    ['Withdrawn', publicationState?.withdrawnAt],
    ['Failed', publicationState?.failedAt],
  ].filter(([label, time]) => (!lifecycleOnly || label !== 'Failed') && time && Number.isFinite(new Date(time).getTime()))
  const latest = events.reduce((result, event) => !result || new Date(event[1]) >= new Date(result[1]) ? event : result, null)
  return <div className="listing-channel-activity"><p>{latest
    ? `${latest[0]} · ${new Date(latest[1]).toLocaleString()}`
    : fallback || 'No publication update yet'}</p></div>
}
