import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ExternalLink, Globe2, Loader2, RefreshCw, Send, SlidersHorizontal } from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { getWebsiteListingPublicationStatus, setWebsiteListingPublication } from '../../services/websiteListingPublicationService'
import {
  normalizeListingChannelPublicUrl,
  normalizeListingChannelReference,
} from '../../services/listings/listingMarketingChannelPresentation'

function propertySlug(title, listingId) {
  const safeTitle = String(title || 'property').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'property'
  return `${safeTitle}-${listingId}`
}

const INFRASTRUCTURE_BLOCKERS = [
  'Create the organisation website',
  'Publish the organisation website',
  'Activate a website domain',
]

export default function WebsiteListingPublicationPanel({ listingId, listingTitle, listingReference = '', preparationBlockers = [], onPrepare, onStatusChange, onPublicationAction, publicationState = null, onReviewChanges, savedAt = '', variant = 'panel' }) {
  const [publication, setPublication] = useState(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [manageOpen, setManageOpen] = useState(false)

  const load = useCallback(async () => {
    if (!listingId) return
    setLoading(true)
    setError('')
    try {
      setPublication(await getWebsiteListingPublicationStatus(listingId))
    } catch (loadError) {
      setError(loadError?.message || 'Website publication status could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { onStatusChange?.(publication) }, [onStatusChange, publication])

  const published = publication?.status === 'published'
  const effectivelyLive = published && publication?.websiteStatus === 'published' && publication?.projectionStatus === 'Published'
  const withdrawn = publicationState?.stage === 'withdrawn'
  const stale = effectivelyLive && (Boolean(publication?.stale) || Number(publicationState?.changeCount || 0) > 0)
  const publicUrl = publication?.hostname && effectivelyLive
    ? `https://${publication.hostname}/properties/${propertySlug(listingTitle, listingId)}`
    : ''
  const safePublicUrl = normalizeListingChannelPublicUrl(publicUrl)
  const displayReference = normalizeListingChannelReference(listingReference)
  const readinessBlockers = useMemo(
    () => [...new Set([...(Array.isArray(preparationBlockers) ? preparationBlockers : []), ...(Array.isArray(publication?.blockers) ? publication.blockers : [])])],
    [preparationBlockers, publication?.blockers],
  )
  const infrastructureBlocked = readinessBlockers.some((blocker) => INFRASTRUCTURE_BLOCKERS.some((prefix) => String(blocker).startsWith(prefix)))
  const hasConnectedWebsite = Boolean(publication?.websiteSiteId && publication?.hostname)

  const run = async (nextAction) => {
    if (!listingId || action) return
    setAction(nextAction)
    setError('')
    setNotice('')
    let prepared = null
    let publicationTracked = false
    try {
      if (nextAction !== 'unpublish') {
        prepared = await onPrepare?.()
        if (prepared?.ok === false || prepared?.localOnly) throw prepared?.error || new Error('Save this listing to Supabase before publishing it to the website.')
        await onPublicationAction?.({ stage: 'submitted', action: nextAction, draft: prepared?.publicationDraft })
        publicationTracked = true
      }
      const nextPublication = await setWebsiteListingPublication(listingId, nextAction)
      if (nextAction !== 'unpublish') {
        const nextPublicUrl = nextPublication?.hostname
          ? normalizeListingChannelPublicUrl(`https://${nextPublication.hostname}/properties/${propertySlug(listingTitle, listingId)}`)
          : ''
        await onPublicationAction?.({
          stage: 'accepted',
          action: nextAction,
          publication: { ...nextPublication, publicUrl: nextPublicUrl },
          draft: prepared?.publicationDraft,
        })
      }
      setPublication(nextPublication)
      setNotice(nextAction === 'unpublish'
        ? 'Listing removed from the agency website.'
        : nextAction === 'update'
          ? 'Agency website listing updated from the current CRM details.'
          : 'Listing published to the agency website.')
    } catch (actionError) {
      if (publicationTracked) {
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
      setError(actionError?.message || 'The agency website publication could not be changed.')
    } finally {
      setAction('')
    }
  }

  const statusLabel = loading
    ? 'Checking…'
    : withdrawn
      ? 'Withdrawn'
    : effectivelyLive
      ? stale ? 'Update available' : 'Live on website'
      : published ? 'Hidden by readiness' : 'Not published'
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

  if (variant === 'channel') {
    // A website channel only makes sense after the organisation has a live site
    // with an active domain. Avoid showing a disabled, misleading channel row.
    if (!hasConnectedWebsite) return null

    return (
      <>
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(210px,1fr)_minmax(145px,0.7fr)_minmax(170px,0.8fr)_minmax(150px,0.75fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[#cfe4d8] bg-[#f2faf5] text-[#18713e]">
              <Globe2 size={21} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-5 text-[#142132]">Agency Website</p>
              <p className="truncate text-xs leading-5 text-[#607387]">Your public property website</p>
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
            {publicationState?.changeCount ? <button type="button" onClick={onReviewChanges} className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#f1dfb8] bg-[#fff8e8] px-2 py-1 text-[0.68rem] font-semibold text-[#8a641d]">{publicationState.changeCount} unpublished change{publicationState.changeCount === 1 ? '' : 's'}</button> : publicationState?.stage === 'verified' ? <p className="mt-1 text-[0.68rem] font-semibold text-[#1f7d44]">Matches verified snapshot</p> : null}
          </div>
          <div className="min-w-0">
            <div className="grid gap-1 text-[0.68rem] text-[#607387]">
              {savedAt ? <p><span className="font-semibold uppercase tracking-[0.06em] text-[#8294aa]">Arch9 saved</span> · {savedAt}</p> : null}
              {publicationState?.submittedAt ? <p><span className="font-semibold uppercase tracking-[0.06em] text-[#8294aa]">Submitted</span> · {new Date(publicationState.submittedAt).toLocaleString()}</p> : null}
              {publicationState?.acceptedAt ? <p><span className="font-semibold uppercase tracking-[0.06em] text-[#8294aa]">Accepted</span> · {new Date(publicationState.acceptedAt).toLocaleString()}</p> : null}
              {publicationState?.verifiedAt ? <p><span className="font-semibold uppercase tracking-[0.06em] text-[#8294aa]">Verified</span> · {new Date(publicationState.verifiedAt).toLocaleString()}</p> : null}
              {publicationState?.withdrawnAt ? <p><span className="font-semibold uppercase tracking-[0.06em] text-[#8294aa]">Withdrawn</span> · {new Date(publicationState.withdrawnAt).toLocaleString()}</p> : null}
              {!savedAt && !publicationState?.submittedAt && publication?.updatedAt ? <p><span className="font-semibold uppercase tracking-[0.06em] text-[#8294aa]">Last updated</span> · {new Date(publication.updatedAt).toLocaleDateString()}</p> : null}
            </div>
          </div>
          <div className="flex justify-start lg:justify-end">
            <Button type="button" size="sm" variant="secondary" onClick={() => setManageOpen(true)}>
              <SlidersHorizontal size={15} />
              Manage
            </Button>
          </div>
          {error ? <p className="lg:col-span-5 rounded-[12px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]" role="alert">{error}</p> : null}
          {notice ? <p className="lg:col-span-5 rounded-[12px] border border-[#cfe7d7] bg-[#eef9f2] px-3 py-2 text-sm text-[#257044]" role="status">{notice}</p> : null}
        </div>

        <Modal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          title="Manage Agency Website"
          subtitle="Publish, update, or remove this listing from the agency website."
          className="max-w-3xl"
          footer={(
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setManageOpen(false)}>Close</Button>
              <Button type="button" variant="secondary" onClick={() => void load()} disabled={Boolean(action) || loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh status</Button>
              {published
                ? <Button type="button" onClick={() => void run('update')} disabled={Boolean(action) || infrastructureBlocked}>{action === 'update' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}{stale ? 'Update website listing' : 'Refresh website listing'}</Button>
                : <Button type="button" onClick={() => void run('publish')} disabled={Boolean(action) || loading || infrastructureBlocked}>{action === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Publish to website</Button>}
            </div>
          )}
        >
          <div className="grid gap-5">
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[14px] border border-[#dbe6f2] bg-[#fbfdff] p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#728479]">Website</p><p className="mt-1 text-sm font-semibold text-[#274634]">{publication?.websiteStatus || 'Not created'}</p></div>
              <div className="rounded-[14px] border border-[#dbe6f2] bg-[#fbfdff] p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#728479]">Listing projection</p><p className="mt-1 text-sm font-semibold text-[#274634]">{publication?.projectionStatus || 'Not saved'}</p></div>
              <div className="rounded-[14px] border border-[#dbe6f2] bg-[#fbfdff] p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#728479]">Durable public images</p><p className="mt-1 text-sm font-semibold text-[#274634]">{publication?.durableImageCount ?? 0} / {publication?.imageCount ?? 0}</p></div>
            </section>

            {readinessBlockers.length ? <section className="rounded-[14px] border border-[#f0d9ad] bg-[#fff9ec] p-3"><p className="text-sm font-semibold text-[#825514]">Readiness checks</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#825514]">{readinessBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></section> : null}
            {publication?.mediaCleanupPending > 0 ? <section className="rounded-[14px] border border-[#efc4c4] bg-[#fff5f5] p-3 text-xs leading-5 text-[#8a3030]">{publication.mediaCleanupPending} public media object{publication.mediaCleanupPending === 1 ? '' : 's'} could not be removed yet. Retry Unpublish before closing this listing.</section> : null}
            {error ? <p className="rounded-[12px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]" role="alert">{error}</p> : null}
            {notice ? <p className="rounded-[12px] border border-[#cfe7d7] bg-[#eef9f2] px-3 py-2 text-sm text-[#257044]" role="status">{notice}</p> : null}
            <div className="flex flex-wrap gap-2">
              {safePublicUrl ? <a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#c9d9cf] bg-white px-3 text-sm font-semibold text-[#2f6346]" href={safePublicUrl} target="_blank" rel="noreferrer">View listing <ExternalLink size={14} /></a> : null}
              {published ? <Button type="button" variant="secondary" className="border-[#f3c9c9] text-[#a43d35] hover:bg-[#fff5f5]" onClick={() => void run('unpublish')} disabled={Boolean(action)}>{action === 'unpublish' ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />}Expire listing</Button> : null}
            </div>
          </div>
        </Modal>
      </>
    )
  }

  return (
    <section className="rounded-[24px] border border-[#cfe4d8] bg-gradient-to-br from-[#f7fcf8] via-white to-[#edf8f1] p-5 shadow-[0_14px_30px_rgba(15,76,42,0.07)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#56806a]">Agency website channel</p>
          <h4 className="mt-1 text-[1.05rem] font-semibold text-[#173626]">Publish this CRM listing to your website</h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#607568]">The CRM remains the source of truth. Publish creates one website-channel record, Update refreshes it from the current listing, and Unpublish removes it without deleting the CRM listing.</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${effectivelyLive && !stale ? 'border-[#bfe2cb] bg-[#eaf8ef] text-[#1f7d44]' : stale ? 'border-[#f0d9ad] bg-[#fff9ec] text-[#825514]' : 'border-[#d9e3dc] bg-white text-[#607568]'}`}>
          {effectivelyLive && !stale ? <CheckCircle2 size={13} /> : stale ? <RefreshCw size={13} /> : <Globe2 size={13} />}
          {loading ? 'Checking…' : effectivelyLive ? stale ? 'Update available' : 'Published' : published ? 'Hidden by readiness' : 'Not published'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border border-[#dbe9df] bg-white/85 p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#728479]">Website</p><p className="mt-1 text-sm font-semibold text-[#274634]">{publication?.websiteStatus || 'Not created'}</p></div>
        <div className="rounded-[14px] border border-[#dbe9df] bg-white/85 p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#728479]">Listing projection</p><p className="mt-1 text-sm font-semibold text-[#274634]">{publication?.projectionStatus || 'Not saved'}</p></div>
        <div className="rounded-[14px] border border-[#dbe9df] bg-white/85 p-3"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#728479]">Durable public images</p><p className="mt-1 text-sm font-semibold text-[#274634]">{publication?.durableImageCount ?? 0} / {publication?.imageCount ?? 0}</p></div>
      </div>

      {readinessBlockers.length ? <div className="mt-4 rounded-[14px] border border-[#f0d9ad] bg-[#fff9ec] p-3"><p className="text-sm font-semibold text-[#825514]">Readiness checks</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#825514]">{readinessBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}
      {publication?.mediaCleanupPending > 0 ? <div className="mt-4 rounded-[14px] border border-[#efc4c4] bg-[#fff5f5] p-3 text-xs leading-5 text-[#8a3030]">{publication.mediaCleanupPending} public media object{publication.mediaCleanupPending === 1 ? '' : 's'} could not be removed yet. Retry Unpublish before closing this listing.</div> : null}
      {error ? <p className="mt-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]" role="alert">{error}</p> : null}
      {notice ? <p className="mt-4 rounded-[14px] border border-[#cfe7d7] bg-[#eef9f2] px-3 py-2 text-sm text-[#257044]" role="status">{notice}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {published
          ? <><Button type="button" className="justify-center" onClick={() => void run('update')} disabled={Boolean(action) || infrastructureBlocked}>{action === 'update' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}Update website</Button><Button type="button" variant="secondary" className="justify-center border-[#f3c9c9] text-[#a43d35] hover:bg-[#fff5f5]" onClick={() => void run('unpublish')} disabled={Boolean(action)}>{action === 'unpublish' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}Unpublish</Button></>
          : <Button type="button" className="justify-center" onClick={() => void run('publish')} disabled={Boolean(action) || loading || infrastructureBlocked}>{action === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Publish to website</Button>}
        <Button type="button" variant="secondary" className="justify-center" onClick={() => void load()} disabled={Boolean(action) || loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh status</Button>
        {safePublicUrl ? <a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#c9d9cf] bg-white px-3 text-sm font-semibold text-[#2f6346]" href={safePublicUrl} target="_blank" rel="noreferrer">View listing <ExternalLink size={14} /></a> : null}
      </div>
    </section>
  )
}
