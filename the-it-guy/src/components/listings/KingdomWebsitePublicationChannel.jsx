import './listing-channel-table.css'
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Globe2, Loader2, RefreshCw, SlidersHorizontal } from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { getKingdomWebsitePublicationStatus, setKingdomWebsitePublication } from '../../services/kingdomWebsitePublicationService'
import { normalizeListingChannelPublicUrl } from '../../services/listings/listingMarketingChannelPresentation'

function publicSlug(title, reference, listingId) {
  const code = String(reference || '').trim().toUpperCase()
  if (/^A9-[A-Z0-9]{2,12}-[0-9]{6,}$/.test(code)) return code
  const slug = String(title || 'property').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'property'
  return `${slug}-${listingId}`
}

export default function KingdomWebsitePublicationChannel({ listingId, listingTitle, listingReference, onPrepare, onStatusChange, savedAt = '' }) {
  const [publication, setPublication] = useState(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!listingId) return
    setLoading(true)
    setError('')
    try {
      setPublication(await getKingdomWebsitePublicationStatus(listingId))
    } catch (loadError) {
      setError(loadError?.message || 'Kingdom website status could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { onStatusChange?.(publication) }, [onStatusChange, publication])

  if (!publication?.available) return null

  const published = publication.status === 'published'
  const live = published && publication.websiteStatus === 'published'
  const blockers = Array.isArray(publication.blockers) ? publication.blockers : []
  const link = live && publication.hostname
    ? normalizeListingChannelPublicUrl(`https://${publication.hostname}/properties/${publicSlug(listingTitle, listingReference, listingId)}`)
    : ''
  const statusLabel = live ? publication.stale ? 'Update available' : 'Live' : blockers.length ? 'Needs attention' : 'Not published'
  const statusColor = live && !publication.stale ? 'text-[#18713e]' : blockers.length || publication.stale ? 'text-[#9a5b13]' : 'text-[#526a82]'
  const infrastructureBlocked = blockers.some((blocker) => /Kingdom website|Kingdom website domain/.test(String(blocker)))

  const run = async (nextAction) => {
    if (action) return
    setAction(nextAction)
    setError('')
    setNotice('')
    try {
      if (nextAction !== 'unpublish') {
        const prepared = await onPrepare?.()
        if (prepared?.ok === false || prepared?.localOnly) throw prepared?.error || new Error('Save this listing to Arch9 before publishing it to Kingdom.')
      }
      const next = await setKingdomWebsitePublication(listingId, nextAction)
      setPublication(next)
      setNotice(nextAction === 'unpublish' ? 'Listing removed from the Kingdom website.'
        : nextAction === 'update' ? 'Kingdom website listing updated.' : 'Listing published to the Kingdom website.')
    } catch (actionError) {
      await load()
      setError(actionError?.message || 'Kingdom website publication failed.')
    } finally {
      setAction('')
    }
  }

  return <>
    <div className="listing-channel-columns border-t border-[#edf2f7]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[#cfe4d8] bg-[#f2faf5] text-[#18713e]"><Globe2 size={21} /></span>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#142132]">Kingdom Website</p><p className="truncate text-xs text-[#607387]">Kingdom Real Estate property website</p></div>
      </div>
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#243d56]">{listingReference || 'Not assigned'}</p>{link ? <a href={link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78] hover:underline">View listing <ExternalLink size={12} /></a> : <p className="mt-1 text-xs text-[#8a98a8]">Listing link unavailable</p>}</div>
      <div className="min-w-0"><p className={`inline-flex items-center gap-2 text-sm font-semibold ${statusColor}`}><span className={`h-2 w-2 rounded-full ${live && !publication.stale ? 'bg-[#1f9d64]' : blockers.length || publication.stale ? 'bg-[#d99321]' : 'border border-[#aebdca] bg-white'}`} />{statusLabel}</p>{blockers.length ? <p className="mt-1 text-xs text-[#8a641d]">{blockers[0]}</p> : null}</div>
      <div className="listing-channel-activity">{savedAt ? <p><span >Arch9 saved</span> · {savedAt}</p> : null}{publication.lastSyncedAt ? <p><span >Kingdom updated</span> · {new Date(publication.lastSyncedAt).toLocaleString()}</p> : null}</div>
      <div className="flex justify-start lg:justify-end"><Button type="button" size="sm" variant="secondary" onClick={() => setManageOpen(true)}><SlidersHorizontal size={15} />Manage</Button></div>
      {error ? <p className="text-sm text-[#b42318] lg:col-span-5" role="alert">{error}</p> : null}
      {notice ? <p className="text-sm text-[#257044] lg:col-span-5" role="status">{notice}</p> : null}
    </div>
    <Modal open={manageOpen} onClose={() => setManageOpen(false)} title="Manage Kingdom Website" subtitle="Publish, update, or remove this I Sell listing from Kingdom's property website." className="max-w-2xl" footer={<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setManageOpen(false)}>Close</Button><Button type="button" variant="secondary" onClick={() => void load()} disabled={loading || Boolean(action)}><RefreshCw size={15} />Refresh status</Button>{published ? <><Button type="button" variant="secondary" onClick={() => void run('unpublish')} disabled={Boolean(action)}>Unpublish</Button><Button type="button" onClick={() => void run('update')} disabled={Boolean(action) || infrastructureBlocked}>{action === 'update' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}Update website</Button></> : <Button type="button" onClick={() => void run('publish')} disabled={Boolean(action) || loading || infrastructureBlocked}>{action === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <Globe2 size={15} />}Publish to Kingdom</Button>}</div>}>
      <div className="space-y-4 text-sm text-[#35546c]"><p>Publish saves the latest listing details in Arch9, then sends them to Kingdom. Publishing on Arch9's website is optional. Saved changes appear on Kingdom after you select Update.</p>{blockers.length ? <div className="rounded-[12px] border border-[#f0d9ad] bg-[#fff9ec] p-3"><strong className="text-[#825514]">Before publishing</strong><ul className="mt-2 list-disc space-y-1 pl-5 text-[#825514]">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}{error ? <p className="text-[#b42318]" role="alert">{error}</p> : null}{notice ? <p className="text-[#257044]" role="status">{notice}</p> : null}{link ? <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#1f4f78] hover:underline">Open Kingdom listing <ExternalLink size={14} /></a> : null}</div>
    </Modal>
  </>
}
