import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { getProperty24ListingPerformance } from '../../services/marketingOverviewService'

const number = (value) => Number(value || 0).toLocaleString()

export default function Property24ListingPerformance({ organisationId = '', period }) {
  const [result, setResult] = useState({ rows: [], error: '' })
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    if (!organisationId || !period?.start || !period?.end) {
      setResult({ rows: [], error: '' })
      return undefined
    }
    setLoading(true)
    getProperty24ListingPerformance({
      organisationId,
      startDate: period.start.toISOString().slice(0, 10),
      endDate: period.end.toISOString().slice(0, 10),
    }).then((next) => {
      if (active) setResult(next)
    }).catch((error) => {
      if (active) setResult({ rows: [], error: error?.message || 'Property24 listing performance is unavailable.' })
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [organisationId, period?.start?.getTime(), period?.end?.getTime()])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return result.rows
    return result.rows.filter((row) => `${row.title} ${row.listingNumber} ${row.status}`.toLowerCase().includes(needle))
  }, [query, result.rows])

  return <section className="mo-card mo-property24-listing-performance" aria-labelledby="property24-listing-performance-title">
    <header>
      <div>
        <h2 id="property24-listing-performance-title">Listing performance</h2>
        <p>Views and portal contact types by listing for the selected period.</p>
      </div>
      <label className="mo-listing-search"><Search size={16} /><span className="sr-only">Search Property24 listings</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search listings" /></label>
    </header>
    {loading ? <div className="mo-empty">Loading listing performance…</div> : result.error ? <div className="mo-empty">{result.error}</div> : !rows.length ? <div className="mo-empty">No Property24 listing statistics are available for this period.</div> : <div className="mo-listing-table-wrap"><table className="mo-listing-table"><thead><tr><th>Listing</th><th>Views</th><th>Contact form</th><th>WhatsApp form</th><th>Phone / SMS</th><th>Contacts</th><th>Contact rate</th><th><span className="sr-only">Open listing</span></th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.listingId || 'p24'}-${row.listingNumber}`}><td><strong>{row.title}</strong><span>Property24 #{row.listingNumber}{row.status ? ` · ${row.status}` : ''}</span></td><td>{number(row.listingViews)}</td><td>{number(row.listingContactFormLeads)}</td><td>{number(row.whatsAppContactFormLeads)}</td><td>{number(row.telephoneLeads + row.smsLeads)}</td><td><strong>{number(row.totalContactLeads)}</strong></td><td>{row.contactRate === null ? '—' : `${row.contactRate}%`}</td><td>{row.listingId ? <a className="mo-listing-link" href={`/agent/listings/${encodeURIComponent(row.listingId)}`}>Open <ArrowRight size={14} /></a> : '—'}</td></tr>)}</tbody></table></div>}
  </section>
}
