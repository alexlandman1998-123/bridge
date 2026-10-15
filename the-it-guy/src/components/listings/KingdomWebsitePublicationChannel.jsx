import './listing-channel-table.css'
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Globe2, Loader2, RefreshCw } from 'lucide-react'
import Button from '../ui/Button'
import ListingChannelManageMenu from './ListingChannelManageMenu'
import ListingChannelLastUpdate from './ListingChannelLastUpdate'
import { getKingdomWebsitePublicationStatus, setKingdomWebsitePublication } from '../../services/kingdomWebsitePublicationService'
import { buildKingdomWebsiteListingPublicUrl } from '../../services/listings/listingMarketingChannelPresentation'
import ListingWebsiteConnectionState from './ListingWebsiteConnectionState'

export default function KingdomWebsitePublicationChannel({ listingId, listingTitle, listingReference, onPrepare, onEdit, onStatusChange, onPublicationAction, publicationState = null, savedAt = '', showConnectionState = false, manageActions = null, refreshKey = 0 }) {
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
      setPublication(await getKingdomWebsitePublicationStatus(listingId))
      return { ok: true, message: 'Latest Kingdom website status checked.' }
    } catch (loadError) {
      setError(loadError?.message || 'Kingdom website status could not be loaded.')
      return { ok: false, error: loadError?.message || 'Kingdom website status could not be loaded.' }
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { void load() }, [load, refreshKey])
  useEffect(() => { onStatusChange?.(publication) }, [onStatusChange, publication])

  if (!publication?.available) return showConnectionState && (loading || error)
    ? <ListingWebsiteConnectionState name="Kingdom Website" loading={loading} error={error} detail="Checking the authorised website-sharing connection." onRetry={() => void load()} />
    : null

  const published = publication.status === 'published'
  const live = published && publication.websiteStatus === 'published'
  const blockers = Array.isArray(publication.blockers) ? publication.blockers : []
  const link = live && publication.hostname
    ? buildKingdomWebsiteListingPublicUrl(publication, listingId, listingTitle, listingReference)
    : ''
  const stale = !manageActions && (publication.stale || publicationState?.changeCount > 0)
  const statusLabel = live ? stale ? 'Changes not published' : 'Live' : !manageActions && blockers.length ? 'Needs attention' : 'Not published'
  const statusColor = live && !stale ? 'text-[#18713e]' : !manageActions && (blockers.length || stale) ? 'text-[#9a5b13]' : 'text-[#526a82]'
  const infrastructureBlocked = blockers.some((blocker) => /Kingdom website|Kingdom website domain/.test(String(blocker)))

  const run = async (nextAction) => {
    if (action) return { ok: false, error: 'A Kingdom website request is already in progress.' }
    setAction(nextAction)
    setError('')
    setNotice('')
    let prepared = null
    let tracked = false
    let accepted = false
    try {
      if (nextAction !== 'unpublish') {
        prepared = await onPrepare?.()
        if (prepared?.ok === false || prepared?.localOnly) throw prepared?.error || new Error('Save this listing to Arch9 before publishing it to Kingdom.')
        await onPublicationAction?.({ stage: 'submitted', action: nextAction, draft: prepared?.publicationDraft })
        tracked = true
      }
      const next = await setKingdomWebsitePublication(listingId, nextAction)
      if (next?.status !== (nextAction === 'unpublish' ? 'unpublished' : 'published')) throw new Error('Kingdom publication status could not be confirmed. Refresh status before retrying.')
      accepted = true
      setPublication(next)
      await onPublicationAction?.({ stage: nextAction === 'unpublish' ? 'withdrawn' : 'accepted', action: nextAction, draft: prepared?.publicationDraft, publication: { ...next, publicUrl: next.hostname ? buildKingdomWebsiteListingPublicUrl(next, listingId, listingTitle, listingReference) : '' } })
      setNotice(nextAction === 'unpublish' ? 'Listing removed from the Kingdom website.'
        : nextAction === 'update' ? 'Kingdom website listing updated.' : 'Listing published to the Kingdom website.')
      return { ok: true, message: nextAction === 'unpublish' ? 'Listing removed from the Kingdom website.' : nextAction === 'update' ? 'Kingdom website listing updated.' : 'Listing published to the Kingdom website.' }
    } catch (actionError) {
      if (!accepted && (tracked || nextAction === 'unpublish')) {
        try { await onPublicationAction?.({ stage: nextAction === 'unpublish' ? 'withdrawal_failed' : 'failed', action: nextAction, publication: { error: actionError.message } }) } catch { /* Preserve the provider error. */ }
      }
      await load()
      setError(accepted ? 'Kingdom accepted the request, but publication history could not be saved. Refresh status before retrying.' : actionError?.message || 'Kingdom website publication failed.')
      return { ok: false, error: accepted ? 'Kingdom accepted the request, but publication history could not be saved. Refresh status before retrying.' : actionError?.message || 'Kingdom website publication failed.' }
    } finally {
      setAction('')
    }
  }

  return <>
    <div className="listing-channel-columns border-t border-[#edf2f7]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[#cfe4d8] bg-[#f2faf5] text-[#18713e]"><Globe2 size={21} /></span>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#142132]">Kingdom Website</p></div>
      </div>
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#243d56]">{listingReference || 'Not assigned'}</p>{link ? <a href={link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78] hover:underline">View listing <ExternalLink size={12} /></a> : <p className="mt-1 text-xs text-[#8a98a8]">Listing link unavailable</p>}</div>
      <div className="min-w-0"><p className={`inline-flex items-center gap-2 text-sm font-semibold ${statusColor}`}><span className={`h-2 w-2 rounded-full ${live && !stale ? 'bg-[#1f9d64]' : !manageActions && (blockers.length || stale) ? 'bg-[#d99321]' : 'border border-[#aebdca] bg-white'}`} />{statusLabel}</p>{!manageActions && blockers.length ? <p className="mt-1 text-xs text-[#8a641d]">{blockers[0]}</p> : null}</div>
      <ListingChannelLastUpdate publicationState={publicationState} publication={publication} lifecycleOnly={Boolean(manageActions)} fallback={savedAt ? `Saved in Arch9 · ${savedAt}` : ''} />
      <div className="flex justify-start lg:justify-end">{typeof manageActions === 'function' ? manageActions({ publication, statusLabel, publicUrl: link, busy: Boolean(action) || loading, error, issues: blockers, infrastructureBlocked, onRefresh: load, onPublish: () => run('publish'), onUpdate: () => run('update'), onWithdraw: () => run('unpublish') }) : manageActions || <ListingChannelManageMenu channelName="Kingdom Website"><>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading || Boolean(action)}><RefreshCw size={15} />Refresh status</Button>
        <Button type="button" variant="secondary" onClick={() => onEdit ? onEdit() : void run(published ? 'update' : 'publish')} disabled={Boolean(action) || loading || (!onEdit && infrastructureBlocked)}>{action ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}{onEdit ? 'Edit listing' : published ? 'Update website' : 'Publish to Kingdom'}</Button>
        {published ? <Button type="button" variant="secondary" className="text-[#a43d35]" onClick={() => void run('unpublish')} disabled={Boolean(action)}>Remove from website</Button> : null}
      </></ListingChannelManageMenu>}</div>
      {!manageActions && error ? <p className="text-sm text-[#b42318] lg:col-span-5" role="alert">{error}</p> : null}
      {!manageActions && notice ? <p className="text-sm text-[#257044] lg:col-span-5" role="status">{notice}</p> : null}
    </div>

  </>
}
