import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Link2, Loader2, Search } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { getListingSellerLeadId, linkListingSellerLead, searchListingSellerLeads } from '../../services/listings/listingSellerLeadLinkService'

export default function ListingSellerLeadLinkPanel({ listing, onLinked, onOpenLead }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [linked, setLinked] = useState(null)
  const savingRef = useRef(false)
  const leadId = getListingSellerLeadId(listing) || linked?.sellerLeadId
  const organisationId = listing?.organisationId || listing?.organisation_id

  useEffect(() => {
    if (!open || search.trim().length < 2 || leadId) {
      setResults([])
      setLoading(false)
      return undefined
    }
    let active = true
    setLoading(true)
    setError('')
    const timer = setTimeout(async () => {
      try {
        const matches = await searchListingSellerLeads({ listing: { id: listing.id, organisationId }, search })
        if (active) setResults(matches)
      } catch (searchError) {
        if (active) {
          setResults([])
          setError(searchError?.message || 'Seller leads could not be loaded. Try searching again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [leadId, listing?.id, open, organisationId, search])

  async function linkSelectedLead() {
    if (!selected || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const receipt = await linkListingSellerLead({ listing, leadId: selected.leadId })
      setLinked({ ...receipt, name: selected.name })
      setOpen(false)
      onLinked?.(receipt)
    } catch (linkError) {
      setError(linkError?.message || 'The seller lead could not be linked. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (String(listing?.listingCategory || listing?.listing_category || '').toLowerCase().includes('rental')
      || String(listing?.sellerType || listing?.seller_type || '').toLowerCase() === 'developer') return null

  return (
    <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]" aria-labelledby="listing-seller-lead-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf8f2] text-[#157a4d]"><Link2 size={18} aria-hidden="true" /></span>
          <div>
            <h3 id="listing-seller-lead-heading" className="text-base font-semibold text-[#142132]">{leadId ? 'Seller lead' : 'Link to seller lead'}</h3>
            <p className="mt-1 text-sm text-[#607387]">{leadId ? linked?.name ? `Linked to ${linked.name}.` : 'This listing is connected to a seller lead.' : 'Connect this listing to an existing seller lead.'}</p>
          </div>
        </div>
        {leadId ? <Button type="button" size="sm" variant="secondary" onClick={() => onOpenLead?.(leadId)}>Open seller lead <ArrowUpRight size={15} /></Button>
          : !open ? <Button type="button" size="sm" variant="secondary" onClick={() => { setOpen(true); setError('') }}><Link2 size={15} />Link seller lead</Button> : null}
      </div>
      {open && !leadId ? (
        <div className="mt-5 space-y-4 border-t border-[#e5edf6] pt-4">
          <label className="grid gap-2 text-sm font-semibold text-[#243d56]">
            Search seller leads
            <div className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-[#7b8da2]" />
              <Field value={search} onChange={event => { setSearch(event.target.value); setSelected(null); setResults([]) }} disabled={saving} placeholder="Seller name, email or phone" className="pl-10" autoFocus />
            </div>
          </label>
          {loading ? <p role="status" className="flex items-center gap-2 text-sm text-[#607387]"><Loader2 size={15} className="animate-spin" />Searching seller leads…</p>
            : !error && search.trim().length >= 2 && !results.length ? <p role="status" className="text-sm text-[#607387]">No available seller leads match. Try another name, email or phone.</p>
              : search.trim().length < 2 ? <p className="text-sm text-[#607387]">Enter at least two characters to find a seller lead.</p> : null}
          {results.length ? <fieldset className="max-h-72 space-y-2 overflow-y-auto">
            <legend className="sr-only">Choose a seller lead</legend>
            {results.map(lead => <label key={lead.leadId} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selected?.leadId === lead.leadId ? 'border-[#96c6af] bg-[#f2fbf6]' : 'border-[#dce6f2] bg-white'}`}>
              <input type="radio" name="listing-seller-lead" checked={selected?.leadId === lead.leadId} onChange={() => setSelected(lead)} disabled={saving} className="mt-1 accent-[#157a4d]" />
              <span className="min-w-0 text-sm"><span className="block font-semibold text-[#243d56]">{lead.name}</span><span className="mt-1 block break-words text-xs text-[#607387]">{[lead.email, lead.phone].filter(Boolean).join(' · ') || 'Contact details pending'}</span>{lead.propertyAddress ? <span className="mt-1 block text-xs text-[#607387]">{lead.propertyAddress}</span> : null}</span>
            </label>)}
          </fieldset> : null}
          {results.length === 50 ? <p className="text-xs text-[#607387]">Showing up to 50 matches. Refine your search to find the seller.</p> : null}
          <p className="text-xs text-[#607387]">Linking keeps this listing’s saved seller details and documents.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void linkSelectedLead()} disabled={!selected || loading || saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}{saving ? 'Linking…' : 'Link seller lead'}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => { setOpen(false); setSearch(''); setSelected(null); setError('') }} disabled={saving}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-[#f0cfcb] bg-[#fff5f4] p-3 text-sm text-[#a43e36]">{error}</p> : null}
    </section>
  )
}
