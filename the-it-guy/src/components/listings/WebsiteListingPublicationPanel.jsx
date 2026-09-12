import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Globe2, Loader2, MoreVertical, RefreshCw, Send, X } from 'lucide-react'
import Button from '../ui/Button'
import { getWebsiteListingPublicationStatus, setWebsiteListingPublication } from '../../services/websiteListingPublicationService'

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

function formatRelativeTime(value) {
  const timestamp = new Date(String(value || '')).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function WebsiteListingPublicationPanel({ listingId, listingTitle, preparationBlockers = [], onPrepare }) {
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
      setPublication(await getWebsiteListingPublicationStatus(listingId))
    } catch (loadError) {
      setError(loadError?.message || 'Website publication status could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { void load() }, [load])

  const published = publication?.status === 'published'
  const effectivelyLive = published && publication?.websiteStatus === 'published' && publication?.projectionStatus === 'Published'
  const stale = effectivelyLive && Boolean(publication?.stale)
  const publicUrl = publication?.hostname && effectivelyLive
    ? `https://${publication.hostname}/properties/${propertySlug(listingTitle, listingId)}`
    : ''
  const readinessBlockers = useMemo(
    () => [...new Set([...(Array.isArray(preparationBlockers) ? preparationBlockers : []), ...(Array.isArray(publication?.blockers) ? publication.blockers : [])])],
    [preparationBlockers, publication?.blockers],
  )
  const infrastructureBlocked = readinessBlockers.some((blocker) => INFRASTRUCTURE_BLOCKERS.some((prefix) => String(blocker).startsWith(prefix)))
  const status = loading ? 'Checking' : effectivelyLive ? stale ? 'Update available' : 'Published' : published ? 'Needs attention' : 'Not published'
  const statusClass = effectivelyLive && !stale
    ? 'text-[#18713e]'
    : stale || published
      ? 'text-[#9a5b13]'
      : 'text-[#526a82]'
  const statusDotClass = effectivelyLive && !stale
    ? 'bg-[#1f9d64]'
    : stale || published
      ? 'bg-[#d99321]'
      : loading
        ? 'bg-[#2f6fb3]'
        : 'border border-[#aebdca] bg-white'
  const contextTitle = effectivelyLive && !stale
    ? 'Published and up to date'
    : stale
      ? 'Listing changes need publishing'
      : readinessBlockers[0] || 'Ready to publish'
  const menuActionClass = 'flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-semibold text-[#243d56] transition hover:bg-[#f7fbff] disabled:cursor-not-allowed disabled:opacity-50'

  const run = async (nextAction) => {
    if (!listingId || action) return
    setAction(nextAction)
    setError('')
    setNotice('')
    try {
      if (nextAction !== 'unpublish') {
        const prepared = await onPrepare?.()
        if (prepared?.ok === false || prepared?.localOnly) throw prepared?.error || new Error('Save this listing to Supabase before publishing it to the website.')
      }
      const nextPublication = await setWebsiteListingPublication(listingId, nextAction)
      setPublication(nextPublication)
      setNotice(nextAction === 'unpublish'
        ? 'Listing removed from the agency website.'
        : nextAction === 'update'
          ? 'Agency website listing updated from the current CRM details.'
          : 'Listing published to the agency website.')
    } catch (actionError) {
      setError(actionError?.message || 'The agency website publication could not be changed.')
    } finally {
      setAction('')
    }
  }

  return (
    <section className="border-b border-[#edf2f7] last:border-b-0">
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(230px,0.9fr)_minmax(150px,190px)_minmax(260px,1fr)_minmax(130px,170px)_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-[#dbe6f2] bg-white text-[#1f4f78]"><Globe2 size={18} /></span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold leading-5 text-[#142132]">Agency Website</p><p className="truncate text-xs leading-5 text-[#607387]">Your organisation website</p></div>
        </div>
        <div className="min-w-0 md:justify-self-start"><p className={`inline-flex items-center gap-2 text-sm font-semibold ${statusClass}`}><span className={`h-2 w-2 rounded-full ${statusDotClass}`} />{status}</p></div>
        <div className="min-w-0"><p className="text-sm font-semibold leading-5 text-[#243d56]">{contextTitle}</p>{readinessBlockers.length ? <p className="mt-0.5 truncate text-xs leading-5 text-[#9a5b13]">{readinessBlockers[0]}</p> : null}</div>
        <div className="min-w-0">{publication?.lastSyncedAt ? <><p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8294aa]">Last synced</p><p className="mt-0.5 text-xs font-semibold text-[#607387]">{formatRelativeTime(publication.lastSyncedAt)}</p></> : null}</div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {effectivelyLive && publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#35546c] hover:bg-[#f7fbff]"><ExternalLink size={15} />View listing</a> : <Button type="button" size="sm" onClick={() => void run('publish')} disabled={Boolean(action) || loading || infrastructureBlocked}>{action === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Publish</Button>}
          <details className="relative"><summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-lg border border-[#dbe6f2] bg-white text-[#35546c] transition hover:border-[#b7c8db] hover:bg-[#f7fbff] [&::-webkit-details-marker]:hidden" aria-label="Website actions"><MoreVertical size={15} /></summary><div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-[16px] border border-[#dbe6f2] bg-white p-1.5 shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
            <button type="button" onClick={() => void run(published ? 'update' : 'publish')} disabled={Boolean(action) || loading || infrastructureBlocked} className={menuActionClass}>{action === 'update' || action === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}{published ? 'Update website' : 'Publish website'}</button>
            <button type="button" onClick={() => void load()} disabled={Boolean(action) || loading} className={menuActionClass}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh status</button>
            {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" className={menuActionClass}><ExternalLink size={15} />View listing</a> : null}
            {published ? <button type="button" onClick={() => void run('unpublish')} disabled={Boolean(action)} className={`${menuActionClass} text-[#b42318] hover:bg-[#fff5f5]`}>{action === 'unpublish' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}Unpublish</button> : null}
          </div></details>
        </div>
      </div>
      {error ? <p className="mx-4 mb-4 rounded-[12px] border border-[#f4d4d4] bg-[#fff5f5] px-3 py-2 text-sm text-[#b42318]" role="alert">{error}</p> : null}
      {notice ? <p className="mx-4 mb-4 rounded-[12px] border border-[#cfe7d7] bg-[#eef9f2] px-3 py-2 text-sm text-[#257044]" role="status">{notice}</p> : null}
      {publication?.mediaCleanupPending > 0 ? <p className="mx-4 mb-4 rounded-[12px] border border-[#efc4c4] bg-[#fff5f5] px-3 py-2 text-xs leading-5 text-[#8a3030]">{publication.mediaCleanupPending} public media object{publication.mediaCleanupPending === 1 ? '' : 's'} could not be removed yet. Retry Unpublish before closing this listing.</p> : null}
    </section>
  )
}
