import { Check, ChevronDown, Home, Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { getPrivateListingCoverImageUrls } from '../../services/privateListingService'

function ListingPhoto({ src }) {
  const [failedSrc, setFailedSrc] = useState('')
  return <span className="transaction-listing-photo" aria-hidden="true">{src && src !== failedSrc ? <img src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)} /> : <Home size={22} />}</span>
}

function ListingContent({ listing, covers }) {
  return <>
    <ListingPhoto src={covers[listing.id] || listing.imageUrl} />
    <span className="transaction-listing-copy">
      <strong>{listing.title}</strong>
      <span>{listing.address}</span>
      <small>{[listing.price, listing.reference].filter(Boolean).join(' · ')}</small>
    </span>
  </>
}

export default function TransactionListingPicker({ listings, value, onChange, loading = false, error = false }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [covers, setCovers] = useState({})
  const root = useRef(null)
  const trigger = useRef(null)
  const searchInput = useRef(null)
  const loadedPhotoIds = useRef(new Set())
  const popupId = useId()
  const selected = listings.find((listing) => String(listing.id) === String(value))
  const matching = useMemo(() => listings.filter((listing) => [listing.title, listing.address, listing.reference, listing.price, listing.seller].join(' ').toLowerCase().includes(search.trim().toLowerCase())), [listings, search])
  const visible = matching.slice(0, 50)
  const photoIds = JSON.stringify(open ? visible.map((listing) => listing.id) : selected ? [selected.id] : [])

  useEffect(() => {
    if (!open) return undefined
    searchInput.current?.focus()
    function outside(event) {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  useEffect(() => {
    if (photoIds === '[]' || !isSupabaseConfigured) return undefined
    const ids = JSON.parse(photoIds).filter((id) => !loadedPhotoIds.current.has(id))
    if (!ids.length) return undefined
    let active = true
    getPrivateListingCoverImageUrls(ids).then((urls) => {
      if (active) {
        ids.forEach((id) => loadedPhotoIds.current.add(id))
        setCovers((previous) => ({ ...previous, ...urls }))
      }
    }).catch(() => { /* Selection remains available when a photo cannot load. */ })
    return () => { active = false }
  }, [photoIds])

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  return <div className="transaction-listing-picker" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={(event) => {
    if (!open && event.target === trigger.current && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      setSearch('')
      setOpen(true)
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      if (event.target === searchInput.current && ['Home', 'End'].includes(event.key)) return
      const options = [...root.current.querySelectorAll('[role="option"]')]
      if (!options.length) return
      event.preventDefault()
      const current = options.indexOf(document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? (current + 1) % options.length : current <= 0 ? options.length - 1 : current - 1
      options[next].focus()
    }
  }}>
    <button ref={trigger} type="button" className="transaction-listing-trigger" aria-label="Active Listing" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined} aria-invalid={error || undefined} disabled={loading && !listings.length} onClick={() => { setOpen(!open); setSearch('') }}>
      {selected ? <ListingContent listing={selected} covers={covers} /> : <><span className="transaction-listing-photo"><Home size={22} /></span><span className="transaction-listing-copy"><strong>{loading ? 'Loading properties…' : 'Choose an active listing'}</strong><span>Search by address, property or reference</span></span></>}
      <ChevronDown size={18} className="shrink-0" />
    </button>
    {open ? <div id={popupId} role="dialog" aria-label="Choose active listing" className="transaction-listing-dropdown">
      <div className="transaction-listing-search"><Search size={17} /><input ref={searchInput} type="search" aria-label="Search active listings" placeholder="Search properties…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div role="listbox" aria-label="Active listings" className="transaction-listing-options">
        {visible.map((listing) => <button key={listing.id} type="button" role="option" aria-selected={String(listing.id) === String(value)} className="transaction-listing-option" onClick={() => { onChange(listing.id); close() }}>
          <ListingContent listing={listing} covers={covers} />
          {String(listing.id) === String(value) ? <Check size={18} className="shrink-0 text-emerald-700" /> : null}
        </button>)}
        {!visible.length ? <p className="transaction-listing-empty">{error ? 'Properties could not be loaded. Close this picker and retry.' : search ? 'No properties match your search.' : 'No eligible properties found.'}</p> : null}
      </div>
      {matching.length > 50 ? <p className="transaction-listing-empty">Showing 50 of {matching.length}. Search to narrow the list.</p> : null}
    </div> : null}
  </div>
}
