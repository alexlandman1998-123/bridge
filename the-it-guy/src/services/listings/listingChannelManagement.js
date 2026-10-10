const SALE_STATUSES = new Set(['active', 'under_offer', 'sold'])

// A sale-status change belongs to the property. Other edits belong to one advert.
export async function saveListingChannelManagement({ channel, draft, listingStatus, expiryDate, activeChannels = [], retryResults = [] }, { saveDraft, recordStarted, recordStage, sendUpdate, recordFinished }) {
  const retry = retryResults.length > 0
  const statusChanged = listingStatus !== draft.listingStatus
  if (statusChanged && (!SALE_STATUSES.has(listingStatus) || listingStatus === 'active' || ['sold', 'withdrawn'].includes(draft.listingStatus) || String(draft.listingType).toLowerCase() === 'rental')) {
    throw new Error('Choose Under offer or Sold for an active sale listing.')
  }
  const expiryChanged = channel === 'Property24' && expiryDate !== draft.property24ExpiryDate
  if (!retry && !statusChanged && !expiryChanged) return { ok: true, results: [] }
  if (expiryChanged && !activeChannels.includes('Property24')) throw new Error('Publish this listing from listing setup before changing its Property24 expiry date.')
  const nextDraft = { ...draft, listingStatus, ...(channel === 'Property24' ? { property24ExpiryDate: expiryDate } : {}) }
  const targets = retry
    ? retryResults.filter((result) => result.status === 'failed' && result.channel !== 'Activity').map(({ channel: name, action }) => ({ channel: name, action }))
    : statusChanged
      ? [...new Set(activeChannels)].map((name) => ({ channel: name, action: name === 'Property24' && expiryChanged ? 'expiry' : listingStatus }))
      : [{ channel: 'Property24', action: 'expiry' }]
  if (targets.some((target) => !['sold', 'under_offer'].includes(target.action) && !(target.channel === 'Property24' && target.action === 'expiry'))) throw new Error('Publish listing content and retry failed publications from listing setup.')
  const results = []
  let historyIssue = false
  const saved = await saveDraft(nextDraft)
  if (!saved?.ok || saved.localOnly) throw saved?.error || new Error('The listing could not be saved. Try again.')
  results.push({ channel: 'Arch9', status: 'saved', detail: 'Saved.' })
  try {
    if (targets.length) await recordStarted(targets)
  } catch (error) {
    return { ok: false, results: [...results, ...targets.map((target) => ({ ...target, status: 'failed', detail: error?.message || 'The update could not be started. Try again.' }))] }
  }
  for (const target of targets) {
    let accepted = false
    try {
      await recordStage(target, 'submitted', nextDraft)
      await sendUpdate(target, nextDraft)
      accepted = true
      await recordStage(target, 'accepted', nextDraft)
      results.push({ ...target, status: 'sent', detail: 'Update accepted.' })
    } catch (error) {
      if (accepted) {
        historyIssue = true
        results.push({ ...target, status: 'sent', detail: 'Update accepted; history needs attention.' })
        continue
      }
      await recordStage(target, 'failed', nextDraft, error?.message).catch(() => null)
      results.push({ ...target, status: 'failed', detail: error?.message || 'Could not update this channel. Try again.' })
    }
  }
  try {
    await recordFinished(results, statusChanged ? listingStatus : retry ? 'retry' : 'update')
  } catch {
    historyIssue = true
  }
  if (historyIssue) results.push({ channel: 'Activity', status: 'failed', detail: 'Updates were sent, but their history could not be saved. Check the channels before trying again.' })
  return { ok: !results.some((result) => result.status === 'failed'), results }
}
