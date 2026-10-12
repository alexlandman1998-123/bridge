import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Building2, ChevronDown, ChevronRight, Compass, Globe, Mail, Search, Share2, RefreshCw, Fingerprint, Tag, Route, List, CircleHelp } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { loadClientAttribution } from '../../services/clientAttributionService'
import { filterSourceTouches, hasTrackingTags, SOURCE_CHANNELS, sourceChannel, sourceChannelCounts, sourceEvidence, sourceName } from '../../core/clients/clientSourceJourney'
import './clientSourceJourney.css'

const formatTime = value => new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
const channelIcons = { portal: Building2, social: Share2, search: Search, email: Mail, referral: ArrowUpRight, website: Globe, other: Compass, unknown: CircleHelp }

function TouchDetails({ touch, preview }) {
  return <div className="source-evidence-details">
    <div className="source-evidence-heading"><Fingerprint size={15} /><strong>{sourceEvidence(touch)}</strong>{touch.historical ? <span>Historical enquiry record</span> : null}</div>
    <dl>{[
      ['Source', touch.utm_source || touch.source_channel], ['Medium', touch.utm_medium], ['UTM campaign', touch.utm_campaign], ['Campaign code', touch.campaign_code],
      ['Content', touch.utm_content], ['Search term', touch.utm_term], ['Landing website', touch.landing_host], ['Referring website', touch.referrer_host],
    ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {!hasTrackingTags(touch) ? <p>No UTM tags captured. A source may still be recorded on the enquiry; missing tracking does not mean a direct visit.</p> : null}
    <div className="source-evidence-footer"><time dateTime={touch.occurred_at}>{formatTime(touch.occurred_at)}</time>{!preview && touch.lead_id ? <Link to={`/pipeline/leads/${touch.lead_id}`}>Open enquiry<ArrowRight size={13} /></Link> : <span>{preview ? 'Preview enquiry' : 'No linked enquiry available'}</span>}</div>
  </div>
}

function SourceMilestone({ label, caption, touch, open, onToggle, preview, id }) {
  return <article className="source-milestone">
    <span className="source-eyebrow">{caption}</span><h5>{label}</h5>
    {touch ? <><button type="button" className="source-milestone-button" onClick={onToggle} aria-expanded={open} aria-controls={`source-milestone-${id}`} aria-label={`Inspect ${label.toLowerCase()}`}>
      <span className={`source-channel-icon source-channel-${sourceChannel(touch)}`}>{createElement(channelIcons[sourceChannel(touch)], { size: 22 })}</span>
      <span><strong>{sourceName(touch)}</strong><time dateTime={touch.occurred_at}>{formatTime(touch.occurred_at)}</time></span>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
    </button><div className="source-milestone-context"><span>{SOURCE_CHANNELS.find(([key]) => key === sourceChannel(touch))?.[1]}</span><span>{sourceEvidence(touch)}</span></div>
      {open ? <div id={`source-milestone-${id}`}><TouchDetails touch={touch} preview={preview} /></div> : null}</> : <p className="source-no-evidence">No source captured yet.</p>}
  </article>
}

export default function ClientAttributionPanel({ client, previewData }) {
  const [touches, setTouches] = useState([])
  const [summary, setSummary] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [available, setAvailable] = useState(Boolean(client.identityId))
  const [loading, setLoading] = useState(Boolean(client.identityId))
  const [error, setError] = useState('')
  const [channel, setChannel] = useState('all')
  const [search, setSearch] = useState('')
  const [tracking, setTracking] = useState('all')
  const [order, setOrder] = useState('journey')
  const [expanded, setExpanded] = useState(new Set())
  const [milestone, setMilestone] = useState('')
  const generation = useRef(0)
  const identityId = client.identityId
  const refresh = useCallback(async (nextCursor = null, preserve = false) => {
    const request = ++generation.current
    setLoading(true); setError('')
    try {
      const result = previewData || await loadClientAttribution({ identityId }, { cursor: nextCursor, includeSummary: !nextCursor })
      if (request !== generation.current) return
      setAvailable(result.available)
      setTouches(previous => nextCursor || preserve ? [...new Map([...previous, ...result.touches].map(touch => [touch.id, touch])).values()] : result.touches)
      if (!nextCursor) setSummary(result.summary)
      setCursor(previous => preserve ? previous || result.nextCursor : result.nextCursor)
    } catch (cause) { if (request === generation.current) setError(cause.message || 'Unable to load client sources.') }
    finally { if (request === generation.current) setLoading(false) }
  }, [identityId, previewData])
  useEffect(() => {
    setTouches([]); setSummary(null); setCursor(null); setChannel('all'); setSearch(''); setTracking('all'); setExpanded(new Set()); setMilestone('')
    void refresh()
    return () => { generation.current += 1 }
  }, [refresh, client.identityVersion, client.organisationId])

  const channels = useMemo(() => sourceChannelCounts(touches), [touches])
  const filtered = useMemo(() => filterSourceTouches(touches, { channel, search, tracking, order }), [touches, channel, search, tracking, order])
  const totalLoaded = new Set(touches.map(touch => touch.lead_id || touch.id)).size
  const enquiries = summary?.enquiryCount || 0
  const tagged = summary?.taggedEnquiryCount || 0
  const coverage = enquiries ? Math.round(tagged / enquiries * 100) : 0
  function toggleTouch(id) {
    setExpanded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  function clearFilters() { setChannel('all'); setSearch(''); setTracking('all') }

  return <section aria-label="Client source attribution" className="client-source-workspace">
    <header className="source-workspace-heading"><div><span className="source-eyebrow">HOW THE RELATIONSHIP BEGAN</span><h4>Sources & discovery</h4><p>Where this client came from, and which sources led to their enquiries.</p></div><Button variant="ghost" disabled={loading || (!identityId && !previewData)} onClick={() => void refresh(null, true)}><RefreshCw size={16} />Refresh sources</Button></header>
    {!available ? <p className="rounded-xl bg-[#fff9ed] p-3 text-sm text-[#7f5b16]">Client attribution is awaiting database setup and a permanent client profile.</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p> : null}
    {loading && !touches.length ? <p role="status" className="text-sm text-[#637890]">Loading client sources…</p> : null}
    {available && summary && !error ? <>
      <div className="source-discovery-journey">
        <SourceMilestone label="First known source" caption="01 · FIRST RECORDED DISCOVERY" touch={summary.firstTouch} id="first" open={milestone === 'first'} onToggle={() => setMilestone(milestone === 'first' ? '' : 'first')} preview={Boolean(previewData)} />
        <span className="source-journey-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
        <SourceMilestone label="Latest known enquiry source" caption="02 · LATEST RECORDED SOURCE" touch={summary.latestTouch} id="latest" open={milestone === 'latest'} onToggle={() => setMilestone(milestone === 'latest' ? '' : 'latest')} preview={Boolean(previewData)} />
      </div>
      <div className="source-coverage-strip"><div className="source-coverage-ring" style={{ '--source-coverage': `${coverage}%` }} role="img" aria-label={enquiries ? `${coverage}% of linked enquiries have tracking tags` : 'No linked enquiries available'}><strong>{enquiries ? `${coverage}%` : '—'}</strong></div><div><strong>Tracking coverage</strong><p>{tagged} of {enquiries} linked enquiries have tracking tags.</p><small>Tracking tags identify a source or campaign; they do not prove it caused a sale.</small></div><button type="button" disabled={!enquiries} aria-pressed={tracking === 'untagged'} onClick={() => { setTracking(tracking === 'untagged' ? 'all' : 'untagged'); setChannel('all'); setSearch('') }}><CircleHelp size={14} />Review untagged enquiries<ArrowRight size={13} /></button></div>
    </> : null}
    {available && !error && touches.length ? <div className="source-explorer">
      <aside className="source-channel-sidebar"><div className="source-sidebar-heading"><h5>Discovery channels</h5><span>{totalLoaded} loaded enquiries</span></div>
        <button type="button" className="source-channel-filter" aria-pressed={channel === 'all'} onClick={() => setChannel('all')}><span><Compass size={15} />All sources</span><strong>{totalLoaded}</strong></button>
        {channels.map(item => <button key={item.key} type="button" className={`source-channel-filter source-channel-${item.key}`} aria-pressed={channel === item.key} onClick={() => setChannel(channel === item.key ? 'all' : item.key)}><span>{createElement(channelIcons[item.key], { size: 15 })}{item.label}</span><strong>{item.count}</strong><span className="source-channel-bar" aria-hidden="true"><span style={{ width: `${item.count / totalLoaded * 100}%` }} /></span></button>)}
        <div className="source-reading-guide"><Fingerprint size={18} /><h6>Recorded evidence</h6><p>This is recorded enquiry history. Earlier unrecorded visits cannot be reconstructed. Campaign delivery and replies live in Campaigns and Activity.</p></div>
      </aside>
      <div className="source-history">
        <div className="source-history-heading"><div><h5>Enquiry source history</h5><p>{order === 'journey' ? 'Follow loaded enquiries, from earliest to latest.' : 'See the most recent recorded enquiry first.'}</p></div><div className="source-view-switch" role="group" aria-label="Source history order"><button type="button" aria-pressed={order === 'journey'} onClick={() => setOrder('journey')}><Route size={14} />Journey</button><button type="button" aria-pressed={order === 'recent'} onClick={() => setOrder('recent')}><List size={14} />Recent</button></div></div>
        <div className="source-history-filters"><label className="source-history-search"><Search size={16} /><input aria-label="Search source history" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search sources, campaigns or websites…" /></label><label><span className="sr-only">Tracking filter</span><Field as="select" value={tracking} onChange={event => setTracking(event.target.value)}><option value="all">All evidence</option><option value="tagged">With tracking tags</option><option value="untagged">Without tracking tags</option></Field></label></div>
        <div className="source-result-count"><p>{filtered.length} of {touches.length} loaded source records{cursor ? ' · Earlier enquiries available below' : ''}</p>{channel !== 'all' || search || tracking !== 'all' ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}</div>
        {!filtered.length ? <div className="source-empty"><Search size={25} /><strong>No matching sources</strong><p>Change your filters or load older enquiries to look further back.</p><button type="button" onClick={clearFilters}>Show all sources</button></div> : null}
        <ol className={`source-touch-list source-touch-list-${order}`}>{filtered.map(touch => {
          const open = expanded.has(touch.id)
          const name = sourceName(touch)
          return <li key={touch.id} className={`source-touch source-channel-${sourceChannel(touch)}`}><span className="source-touch-marker" aria-hidden="true">{createElement(channelIcons[sourceChannel(touch)], { size: 18 })}</span><article>
            <div className="source-touch-meta"><span>{SOURCE_CHANNELS.find(([key]) => key === sourceChannel(touch))?.[1]}</span><time dateTime={touch.occurred_at}>{formatTime(touch.occurred_at)}</time></div>
            <button type="button" className="source-touch-toggle" aria-expanded={open} aria-controls={`source-details-${touch.id}`} onClick={() => toggleTouch(touch.id)}><h6>{name}</h6>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>
            <p className="source-touch-context">{touch.utm_campaign ? touch.utm_campaign.replace(/[-_]/g, ' ') : touch.landing_host || touch.referrer_host || 'No campaign or website recorded'}</p>
            <div className="source-touch-badges"><span className={hasTrackingTags(touch) ? 'source-tagged' : 'source-untagged'}><Tag size={11} />{hasTrackingTags(touch) ? 'Tracking tags captured' : 'No tracking tags'}</span><span>{sourceEvidence(touch)}</span>{touch.historical ? <span>Historical enquiry record</span> : null}{previewData ? <span>Preview enquiry</span> : touch.lead_id ? <Link to={`/pipeline/leads/${touch.lead_id}`}>Open enquiry<ArrowRight size={12} /></Link> : null}</div>
            {open ? <div id={`source-details-${touch.id}`}><TouchDetails touch={touch} preview={Boolean(previewData)} /></div> : null}
          </article></li>
        })}</ol>
        {cursor ? <div className="flex justify-center"><Button variant="secondary" disabled={loading} onClick={() => void refresh(cursor)}>{loading ? 'Loading…' : 'Load older enquiries'}</Button></div> : null}
      </div>
    </div> : null}
    {available && !loading && !error && !touches.length ? <div className="source-empty"><Compass size={28} /><strong>No enquiry sources recorded yet.</strong><p>Captured enquiry sources will build this client’s discovery journey.</p></div> : null}
  </section>
}
