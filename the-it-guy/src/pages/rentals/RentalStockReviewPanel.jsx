import { useEffect, useMemo, useRef, useState } from 'react'
import { buildRentalStockReviewRow, loadRentalStockReview, loadRentalStockHistoryReview } from '../../services/rentals/rentalStockReviewService'

export default function RentalStockReviewPanel({ scope, onOpen }) {
  const [listings, setListings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const request = useRef(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current += 1 } }, [])
  const rows = useMemo(() => (listings || []).map(buildRentalStockReviewRow), [listings])
  const visible = rows.filter(row => `${row.title} ${row.reference} ${row.id}`.toLowerCase().includes(query.toLowerCase()))

  async function review() {
    const revision = ++request.current
    setLoading(true); setError(''); setListings(null); setSelected(null); setHistory(null); setHistoryError(''); setHistoryLoading(false)
    try {
      const result = await loadRentalStockReview(scope)
      if (mounted.current && revision === request.current) setListings(result)
    } catch (failure) {
      if (mounted.current && revision === request.current) setError(failure.message || 'Unable to review rental stock.')
    } finally {
      if (mounted.current && revision === request.current) setLoading(false)
    }
  }
  async function inspect(row) {
    const revision = ++request.current
    setSelected(row); setHistory(null); setHistoryError(''); setHistoryLoading(true)
    try {
      const result = await loadRentalStockHistoryReview(listings.find(listing => listing.id === row.id), scope)
      if (mounted.current && revision === request.current) setHistory(result)
    } catch (failure) {
      if (mounted.current && revision === request.current) setHistoryError(failure.message || 'History unavailable.')
    } finally {
      if (mounted.current && revision === request.current) setHistoryLoading(false)
    }
  }

  return <section aria-label="Rental stock review" className="rounded-[18px] border border-[#dde4ee] bg-white p-5">
    <h2 className="text-lg font-semibold">Review existing rental stock</h2>
    <p className="my-2 text-sm">Find archived and withdrawn rentals, and review incomplete saved portal details within your current workspace access. This review reads saved records only.</p>
    <button type="button" className="ui-pill-button" disabled={loading} onClick={review}>{loading ? 'Reviewing stock…' : listings ? 'Refresh stock review' : 'Review rental stock'}</button>
    {error ? <p role="alert">{error}</p> : null}
    {listings ? <>
      <p role="status" className="my-3">{rows.length} accessible rentals reviewed; {rows.filter(row => row.state !== 'Current').length} archived or withdrawn; {rows.filter(row => row.issues.length).length} need review.</p>
      <p className="text-sm">These are saved-record findings, not a live portal check. An absent optional video or tour is not proof of data loss. Recovery requires confirmation of the original record and the reason for removal.</p>
      <label className="my-3 block">Find a rental <input aria-label="Find a rental in stock review" className="ml-2 rounded border p-2" value={query} onChange={event => setQuery(event.target.value)} placeholder="Title or reference" /></label>
      {!visible.length ? <p>No matching accessible rentals.</p> : <ul className="space-y-3">
        {visible.map(row => <li key={row.id} className="rounded border p-3">
          <h3 className="font-semibold">{row.title || row.id} — {row.state}</h3>
          <p className="text-sm">Reference: {row.reference || 'Not saved'} · Record: {row.id} · Last saved: {row.updatedAt || 'Unknown'}</p>
          {row.channels.map(channel => <p key={channel.key} className="text-sm">{channel.label}: {channel.status} · Reference: {channel.reference || 'Not saved'} · Public link: {channel.publicUrl ? 'Saved' : 'Not saved or invalid'}</p>)}
          {row.issues.length ? <ul>{row.issues.map(issue => <li key={issue.code} className="my-2 text-sm"><strong>{issue.label}</strong><p>{issue.action}</p></li>)}</ul> : <p className="text-sm">No stock or portal metadata issue detected in saved records.</p>}
          <button type="button" className="ui-pill-button mt-2" disabled={historyLoading} onClick={() => inspect(row)}>Inspect history for {row.title || row.id}</button>
          {row.state === 'Current' ? <button type="button" className="ui-pill-button ml-2" onClick={() => onOpen(row.id)}>Open Marketing</button> : null}
        </li>)}
      </ul>}
      {selected ? <section aria-label="Selected rental history" className="mt-4 rounded border p-4">
        <h3 className="font-semibold">History: {selected.title || selected.id}</h3>
        {historyLoading ? <p role="status">Loading saved history…</p> : null}
        {historyError ? <p role="alert">{historyError} Historical evidence could not be assessed.</p> : null}
        {history ? <>
          <p className="text-sm">Historical differences may be intentional. Snapshot evidence does not establish that files still exist or approve restoration.</p>
          {history.evidence.length ? <ul>{history.evidence.map(item => <li key={item.id}>{item.label}: {item.count} historical item(s) differ from the saved listing · {item.recordedAt} · {item.source}</li>)}</ul> : <p>No recoverable media difference identified in available snapshots. Older saves may have no snapshot; originals or backups may be needed.</p>}
          {history.events.length ? <ul className="mt-3">{history.events.map(event => <li key={event.id}>{event.recordedAt} · {event.title}{event.description ? <p>{event.description}</p> : null}{event.reference ? <p>Historical {event.channel === 'property24' ? 'Property24' : 'Private Property'} reference: {event.reference}</p> : null}{event.publicUrl ? <a href={event.publicUrl} target="_blank" rel="noopener noreferrer">Inspect historical portal link</a> : null}</li>)}</ul> : <p>No saved activity history.</p>}
        </> : null}
      </section> : null}
    </> : null}
  </section>
}
