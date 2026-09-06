import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Globe2, Loader2, RefreshCw, Send, X } from 'lucide-react'
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
        {publicUrl ? <a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#c9d9cf] bg-white px-3 text-sm font-semibold text-[#2f6346]" href={publicUrl} target="_blank" rel="noreferrer">View listing <ExternalLink size={14} /></a> : null}
      </div>
    </section>
  )
}
