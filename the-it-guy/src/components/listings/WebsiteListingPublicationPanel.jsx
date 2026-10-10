import './listing-channel-table.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Globe2, Loader2, RefreshCw, Send, X } from 'lucide-react'
import ListingWebsiteConnectionState from './ListingWebsiteConnectionState'
import Button from '../ui/Button'
import ListingChannelManageMenu from './ListingChannelManageMenu'
import ListingChannelLastUpdate from './ListingChannelLastUpdate'
import { getWebsiteListingPublicationStatus, setWebsiteListingPublication } from '../../services/websiteListingPublicationService'
import {
  buildWebsiteListingPublicUrl,
  normalizeListingChannelPublicUrl,
  normalizeListingChannelReference,
} from '../../services/listings/listingMarketingChannelPresentation'

const INFRASTRUCTURE_BLOCKERS = [
  'Create the organisation website',
  'Publish the organisation website',
  'Activate a website domain',
]

const AUTOMATIC_PREPARATION_BLOCKERS = new Set([
  'Save the listing publication details before publishing it to the website.',
  'Publish the listing projection before enabling the agency-website channel.',
  'Prepare durable website copies for every listing image.',
])

function describeWebsiteBlocker(blocker) {
  const message = String(blocker)
  if (message.startsWith('Create the organisation website')) return 'Set up your agency website in Website settings.'
  if (message.startsWith('Publish the organisation website')) return 'Make your agency website live in Website settings.'
  if (message.startsWith('Activate a website domain')) return 'Connect an active website address in Website settings.'
  if (message === 'Add at least one public HTTPS listing image.') return 'Add at least one photo to this listing.'
  return message
}

export default function WebsiteListingPublicationPanel({ listingId, listingTitle, listingReference = '', preparationBlockers = [], onPrepare, onEdit, onStatusChange, onPublicationAction, publicationState = null, onReviewChanges, savedAt = '', variant = 'panel', showConnectionState = false, hideDisconnected = false, manageActions = null, refreshKey = 0 }) {
  const [publication, setPublication] = useState(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!listingId) return
    setLoading(true)
    setError('')
    try {
      setPublication(await getWebsiteListingPublicationStatus(listingId, { includePartner: false }))
    } catch (loadError) {
      setError(loadError?.message || 'Website publication status could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { void load() }, [load, refreshKey])
  useEffect(() => { onStatusChange?.(publication) }, [onStatusChange, publication])

  const published = publication?.status === 'published'
  const effectivelyLive = published && publication?.websiteStatus === 'published' && publication?.projectionStatus === 'Published'
  const withdrawn = publicationState?.stage === 'withdrawn'
  const stale = !manageActions && effectivelyLive && (Boolean(publication?.stale) || Number(publicationState?.changeCount || 0) > 0)
  const publicUrl = effectivelyLive
    ? buildWebsiteListingPublicUrl(publication, listingId, listingTitle)
    : ''
  const safePublicUrl = normalizeListingChannelPublicUrl(publicUrl)
  const displayReference = normalizeListingChannelReference(listingReference)
  const readinessBlockers = useMemo(
    () => [...new Set([...(Array.isArray(preparationBlockers) ? preparationBlockers : []), ...(Array.isArray(publication?.blockers) ? publication.blockers : [])])],
    [preparationBlockers, publication?.blockers],
  )
  const infrastructureBlocked = readinessBlockers.some((blocker) => INFRASTRUCTURE_BLOCKERS.some((prefix) => String(blocker).startsWith(prefix)))
  const itemsToFix = [...new Set(readinessBlockers.filter((blocker) => !AUTOMATIC_PREPARATION_BLOCKERS.has(blocker)).map(describeWebsiteBlocker))]
  const hasConnectedWebsite = Boolean(publication?.websiteSiteId && publication?.hostname)
  const websiteLabel = publication?.websiteLabel || 'Agency Website'

  const run = async (nextAction) => {
    if (!listingId || action) return
    setAction(nextAction)
    setError('')
    setNotice('')
    let prepared = null
    let publicationTracked = false
    let accepted = false
    try {
      if (nextAction !== 'unpublish') {
        prepared = await onPrepare?.()
        if (prepared?.ok === false || prepared?.localOnly) throw prepared?.error || new Error('Save this listing to Supabase before publishing it to the website.')
        await onPublicationAction?.({ stage: 'submitted', action: nextAction, draft: prepared?.publicationDraft })
        publicationTracked = true
      }
      const nextPublication = await setWebsiteListingPublication(listingId, nextAction)
      if (nextPublication?.status !== (nextAction === 'unpublish' ? 'unpublished' : 'published')) throw new Error('Website publication status could not be confirmed. Refresh status before retrying.')
      accepted = true
      setPublication(nextPublication)
      if (nextAction !== 'unpublish') {
        const nextPublicUrl = buildWebsiteListingPublicUrl(nextPublication, listingId, listingTitle)
        await onPublicationAction?.({
          stage: 'accepted',
          action: nextAction,
          publication: { ...nextPublication, publicUrl: nextPublicUrl },
          draft: prepared?.publicationDraft,
        })
      }
      setPublication(nextPublication)
      if (nextAction === 'unpublish') await onPublicationAction?.({ stage: 'withdrawn', action: nextAction, publication: nextPublication })
      setNotice(nextAction === 'unpublish'
        ? 'Listing removed from the agency website.'
        : nextAction === 'update'
          ? 'Website listing updated with the latest details and photos.'
          : 'Listing published to the agency website.')
    } catch (actionError) {
      if (publicationTracked && !accepted) {
        try {
          await onPublicationAction?.({
            stage: 'failed',
            action: nextAction,
            publication: { error: actionError?.message || 'Website publication failed.' },
            draft: prepared?.publicationDraft,
          })
        } catch {
          // Preserve the original publication failure in the interface.
        }
      }
      if (nextAction === 'unpublish' && !accepted) {
        try { await onPublicationAction?.({ stage: 'withdrawal_failed', action: nextAction, publication: { error: actionError.message } }) } catch { /* Preserve the original failure. */ }
      }
      setError(accepted ? 'The website accepted the request, but publication history could not be saved. Refresh status before retrying.' : actionError?.message || 'The agency website publication could not be changed.')
    } finally {
      setAction('')
    }
  }

  const statusLabel = loading
    ? 'Checking…'
    : withdrawn
      ? 'Withdrawn'
    : effectivelyLive
      ? stale ? 'Changes not published' : 'Live on website'
      : published ? 'Not visible on website' : 'Not on website'
  const statusClass = withdrawn
    ? 'text-[#526a82]'
    : effectivelyLive && !stale
    ? 'text-[#18713e]'
    : stale || published
      ? 'text-[#9a5b13]'
      : 'text-[#526a82]'
  const statusDotClass = withdrawn
    ? 'border border-[#aebdca] bg-white'
    : effectivelyLive && !stale
    ? 'bg-[#1f9d64]'
    : stale || published
      ? 'bg-[#d99321]'
      : 'border border-[#aebdca] bg-white'

  const publishButtonLabel = effectivelyLive ? 'Update website listing' : 'Publish to website'
  const websiteSummary = <>
    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-[14px] border border-[#dbe6f2] bg-[#fbfdff] p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#728479]">Agency website</p><p className="mt-1 text-sm font-semibold text-[#274634]">{loading ? 'Checking…' : publication?.websiteStatus === 'published' ? 'Live' : publication?.websiteStatus ? 'Not live yet' : 'Not set up'}</p></div>
      <div className="rounded-[14px] border border-[#dbe6f2] bg-[#fbfdff] p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#728479]">This listing</p><p className={`mt-1 text-sm font-semibold ${statusClass}`}>{statusLabel}</p></div>
      <div className="rounded-[14px] border border-[#dbe6f2] bg-[#fbfdff] p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#728479]">Website photos</p><p className="mt-1 text-sm font-semibold text-[#274634]">{loading ? 'Checking…' : publication?.imageCount ? `${publication?.durableImageCount ?? 0} of ${publication.imageCount} ready` : 'No photos added'}</p></div>
    </section>
    {!loading ? <section className={`rounded-[14px] border p-3 ${itemsToFix.length ? 'border-[#f0d9ad] bg-[#fff9ec] text-[#825514]' : 'border-[#dbe6f2] bg-[#fbfdff] text-[#43596b]'}`}>
      <p className="text-sm font-semibold">{itemsToFix.length ? 'Before you can publish' : effectivelyLive ? 'This listing is visible to visitors' : 'This listing is not visible on your website'}</p>
      {itemsToFix.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">{itemsToFix.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      <p className="mt-2 text-xs leading-5">{infrastructureBlocked ? 'Complete the website setup, then check the status again.' : itemsToFix.length ? `Fix the items above, then choose ${publishButtonLabel}. Arch9 saves the listing details and prepares the website photos automatically.` : effectivelyLive ? 'Choose Update website listing to show the latest details and photos. Remove from website hides it from visitors and keeps it in Arch9.' : 'Choose Publish to website. Arch9 saves the listing details and prepares the website photos automatically.'}</p>
    </section> : null}
  </>

  if (variant === 'channel') {
    // A website channel only makes sense after the organisation has a live site
    // with an active domain. Avoid showing a disabled, misleading channel row.
    if (!hasConnectedWebsite) return showConnectionState && !hideDisconnected
      ? <ListingWebsiteConnectionState name="Agency Website" loading={loading} error={error} detail={readinessBlockers.join(' ') || 'No agency website with an active domain is connected to this organisation.'} onRetry={() => void load()} />
      : null

    return (
      <>
        <div className="listing-channel-columns">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[#cfe4d8] bg-[#f2faf5] text-[#18713e]">
              <Globe2 size={21} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-5 text-[#142132]">{websiteLabel}</p>
              <p className="truncate text-xs leading-5 text-[#607387]">{publication.hostname}</p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa] lg:hidden">Reference</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#243d56] lg:mt-0" title={displayReference || 'Not assigned'}>{displayReference || 'Not assigned'}</p>
            {safePublicUrl ? (
              <a href={safePublicUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78] transition hover:text-[#143a5b] hover:underline">
                View listing
                <ExternalLink size={12} />
              </a>
            ) : (
              <p className="mt-1 text-xs font-medium text-[#8a98a8]">Listing link unavailable</p>
            )}
          </div>
          <div className="min-w-0 md:justify-self-start">
            <p className={`inline-flex items-center gap-2 text-sm font-semibold ${statusClass}`}>
              <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
              {statusLabel}
            </p>
            {!manageActions && publicationState?.changeCount ? <button type="button" onClick={onReviewChanges} className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#f1dfb8] bg-[#fff8e8] px-2 py-1 text-[0.68rem] font-semibold text-[#8a641d]">{publicationState.changeCount} unpublished change{publicationState.changeCount === 1 ? '' : 's'}</button> : null}
          </div>
          <ListingChannelLastUpdate publicationState={publicationState} publication={publication} lifecycleOnly={Boolean(manageActions)} fallback={savedAt ? `Saved in Arch9 · ${savedAt}` : ''} />
          <div className="flex justify-start lg:justify-end"><ListingChannelManageMenu channelName={websiteLabel}>{manageActions || <>
            <Button type="button" variant="secondary" onClick={() => void load()} disabled={Boolean(action) || loading}><RefreshCw size={15} />Refresh status</Button>
            <Button type="button" variant="secondary" onClick={() => onEdit ? onEdit() : void run(published ? 'update' : 'publish')} disabled={Boolean(action) || loading || (!onEdit && infrastructureBlocked)}>{action ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}{onEdit ? 'Edit listing' : published ? publishButtonLabel : 'Publish to website'}</Button>
            {published || publication?.mediaCleanupPending > 0 ? <Button type="button" variant="secondary" className="text-[#a43d35]" onClick={() => void run('unpublish')} disabled={Boolean(action)}><X size={15} />Remove from website</Button> : null}
          </>}</ListingChannelManageMenu></div>
          {!manageActions && itemsToFix.length ? <p className="text-xs text-[#825514] lg:col-span-5">{itemsToFix.join(' ')}</p> : null}
          {!manageActions && publication?.mediaCleanupPending > 0 ? <p className="text-xs text-[#8a3030] lg:col-span-5">{publication.mediaCleanupPending} website photos could not be removed. Choose Remove from website again to retry.</p> : null}
          {!manageActions && error ? <p className="lg:col-span-5 rounded-[12px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]" role="alert">{error}</p> : null}
          {notice ? <p className="lg:col-span-5 rounded-[12px] border border-[#cfe7d7] bg-[#eef9f2] px-3 py-2 text-sm text-[#257044]" role="status">{notice}</p> : null}
        </div>


      </>
    )
  }

  return (
    <section className="rounded-[24px] border border-[#cfe4d8] bg-gradient-to-br from-[#f7fcf8] via-white to-[#edf8f1] p-5 shadow-[0_14px_30px_rgba(15,76,42,0.07)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#56806a]">Agency website channel</p>
          <h4 className="mt-1 text-[1.05rem] font-semibold text-[#173626]">Manage this listing on your website</h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#607568]">Publish makes this listing visible to website visitors. Update shows the latest details and photos. Remove from website hides it from visitors and keeps it in Arch9.</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${effectivelyLive && !stale ? 'border-[#bfe2cb] bg-[#eaf8ef] text-[#1f7d44]' : stale ? 'border-[#f0d9ad] bg-[#fff9ec] text-[#825514]' : 'border-[#d9e3dc] bg-white text-[#607568]'}`}>
          {effectivelyLive && !stale ? <CheckCircle2 size={13} /> : stale ? <RefreshCw size={13} /> : <Globe2 size={13} />}
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-5">{websiteSummary}</div>
      {publication?.mediaCleanupPending > 0 ? <div className="mt-4 rounded-[14px] border border-[#efc4c4] bg-[#fff5f5] p-3 text-xs leading-5 text-[#8a3030]">{publication.mediaCleanupPending} website photo{publication.mediaCleanupPending === 1 ? '' : 's'} could not be removed yet. Choose Remove from website again to retry.</div> : null}
      {error ? <p className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]" role="alert">{error}</p> : null}
      {notice ? <p className="mt-4 rounded-[14px] border border-[#cfe7d7] bg-[#eef9f2] px-3 py-2 text-sm text-[#257044]" role="status">{notice}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {published
          ? <><Button type="button" className="justify-center" onClick={() => void run('update')} disabled={Boolean(action) || loading || infrastructureBlocked}>{action === 'update' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}{publishButtonLabel}</Button><Button type="button" variant="secondary" className="justify-center border-[#f3c9c9] text-[#a43d35] hover:bg-[#fff5f5]" onClick={() => void run('unpublish')} disabled={Boolean(action)}>{action === 'unpublish' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}Remove from website</Button></>
          : <Button type="button" className="justify-center" onClick={() => void run('publish')} disabled={Boolean(action) || loading || infrastructureBlocked}>{action === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Publish to website</Button>}
        <Button type="button" variant="secondary" className="justify-center" onClick={() => void load()} disabled={Boolean(action) || loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh status</Button>
        {safePublicUrl ? <a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#c9d9cf] bg-white px-3 text-sm font-semibold text-[#2f6346]" href={safePublicUrl} target="_blank" rel="noreferrer">View listing <ExternalLink size={14} /></a> : null}
      </div>
    </section>
  )
}
