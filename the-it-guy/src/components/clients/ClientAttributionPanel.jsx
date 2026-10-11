import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import { attributionSourceLabel, loadClientAttribution } from '../../services/clientAttributionService'

const formatTime = (value) => new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
function TouchDetails({ touch }) {
  return <dl className="mt-3 grid min-w-0 gap-2 text-sm sm:grid-cols-2">{[
    ['Medium', touch.utm_medium], ['UTM campaign', touch.utm_campaign], ['Campaign code', touch.campaign_code],
    ['Content', touch.utm_content], ['Search term', touch.utm_term], ['Landing website', touch.landing_host], ['Referring website', touch.referrer_host],
  ].filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-[#637890]">{label}</dt><dd className="break-words text-[#40586f]">{value}</dd></div>)}</dl>
}
function SourceCard({ label, touch }) {
  return <article className="min-w-0 rounded-xl border border-[#e1e9f2] p-3">
    <h5 className="text-xs font-semibold uppercase tracking-wide text-[#637890]">{label}</h5>
    {touch ? <><p className="mt-2 break-words font-semibold text-[#17334f]">{attributionSourceLabel(touch)}</p><time dateTime={touch.occurred_at} className="mt-1 block text-xs text-[#637890]">{formatTime(touch.occurred_at)}</time><TouchDetails touch={touch} /></> : <p className="mt-2 text-sm text-[#637890]">No source captured yet.</p>}
  </article>
}

export default function ClientAttributionPanel({ client, previewData }) {
  const [touches, setTouches] = useState([])
  const [summary, setSummary] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [available, setAvailable] = useState(Boolean(client.identityId))
  const [loading, setLoading] = useState(Boolean(client.identityId))
  const [error, setError] = useState('')
  const generation = useRef(0)
  const identityId = client.identityId
  const refresh = useCallback(async (nextCursor = null) => {
    const request = ++generation.current
    setLoading(true); setError('')
    try {
      const result = previewData || await loadClientAttribution({ identityId }, { cursor: nextCursor, includeSummary: !nextCursor })
      if (request !== generation.current) return
      setAvailable(result.available)
      setTouches(previous => nextCursor ? [...new Map([...previous, ...result.touches].map(touch => [touch.id, touch])).values()] : result.touches)
      if (!nextCursor) setSummary(result.summary)
      setCursor(result.nextCursor)
    } catch (cause) { if (request === generation.current) setError(cause.message || 'Unable to load client sources.') }
    finally { if (request === generation.current) setLoading(false) }
  }, [identityId, previewData])
  useEffect(() => {
    setTouches([]); setSummary(null); setCursor(null)
    void refresh()
    return () => { generation.current += 1 }
  }, [refresh, client.identityVersion, client.organisationId])

  return <section aria-label="Client source attribution" className="min-w-0 space-y-4 rounded-[18px] border border-[#e1e9f2] bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-semibold text-[#17334f]">Sources and campaigns</h4><p className="mt-1 text-sm text-[#637890]">How this client reached you across their enquiries.</p></div><Button variant="ghost" disabled={loading || (!identityId && !previewData)} onClick={() => void refresh()}>Refresh sources</Button></div>
    {!available ? <p className="rounded-xl bg-[#fff9ed] p-3 text-sm text-[#7f5b16]">Client attribution is awaiting database setup and a permanent client profile.</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p> : null}
    {loading && !touches.length ? <p role="status" className="text-sm text-[#637890]">Loading client sources…</p> : null}
    {available && summary ? <><div className="grid min-w-0 gap-3 md:grid-cols-2"><SourceCard label="First known source" touch={summary.firstTouch} /><SourceCard label="Latest known enquiry source" touch={summary.latestTouch} /></div><p className="text-xs leading-5 text-[#637890]">{summary.taggedEnquiryCount || 0} of {summary.enquiryCount || 0} linked enquiries have UTM tracking. First known source uses captured browser-session or enquiry evidence. Earlier unrecorded visits cannot be reconstructed.</p></> : null}
    {available && !loading && !error && !touches.length ? <p className="text-sm text-[#637890]">No enquiry sources recorded yet.</p> : null}
    {touches.length ? <div className="space-y-3"><h5 className="text-sm font-semibold text-[#17334f]">Enquiry source history</h5><ol className="space-y-3">{touches.map(touch => <li key={touch.id} className="min-w-0 rounded-xl border border-[#e1e9f2] p-3"><div className="flex flex-wrap justify-between gap-2"><p className="min-w-0 max-w-full break-words font-semibold text-[#17334f]">{attributionSourceLabel(touch)}</p><time dateTime={touch.occurred_at} className="text-xs text-[#637890]">{formatTime(touch.occurred_at)}</time></div><TouchDetails touch={touch} /><div className="mt-3 flex flex-wrap gap-3 text-xs text-[#637890]">{touch.historical ? <span>Historical enquiry record</span> : null}{!touch.utm_source && !touch.utm_medium && !touch.utm_campaign && !touch.utm_term && !touch.utm_content ? <span>No UTM tags captured</span> : null}{!previewData ? <Link className="text-[#1767b4] underline" to={`/pipeline/leads/${touch.lead_id}`}>Open enquiry</Link> : <span>Preview enquiry</span>}</div></li>)}</ol></div> : null}
    {cursor ? <div className="flex justify-center"><Button variant="secondary" disabled={loading} onClick={() => void refresh(cursor)}>{loading ? 'Loading…' : 'Load older enquiries'}</Button></div> : null}
  </section>
}
