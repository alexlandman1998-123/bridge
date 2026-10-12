import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../ui/Button'
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Mail, MailOpen, MessageSquare, MousePointerClick, RefreshCw, Search, Send, ShieldCheck } from 'lucide-react'
import { CAMPAIGN_FILTERS, filterClientCampaigns, matchesCampaignFilter } from '../../core/clients/clientCampaignCards'
import './clientCampaignCards.css'
import { campaignResponseLabel, CLIENT_CAMPAIGN_RESPONSE_TYPES, loadClientCampaigns, logClientCampaignResponse } from '../../services/clientCampaignService'

const formatTime = value => new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
const localTime = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
function ResponseForm({ client, campaign, onSaved, onCancel }) {
  const [kind, setKind] = useState('email_reply')
  const [detail, setDetail] = useState('')
  const [time, setTime] = useState(localTime)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const command = useRef(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function save(event) {
    event.preventDefault()
    const date = new Date(time)
    if (!Number.isFinite(date.getTime())) { setError('Enter a valid response time.'); return }
    const entry = { recipientId: campaign.id, kind, detail, occurredAt: date.toISOString() }
    const fingerprint = JSON.stringify(entry)
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, requestId: crypto.randomUUID() }
    setSaving(true); setError('')
    try {
      await logClientCampaignResponse(client, { ...entry, requestId: command.current.requestId })
      if (mounted.current) await onSaved()
    } catch (cause) { if (mounted.current) setError(cause.message || 'Unable to save this response. You can retry the same entry.') }
    finally { if (mounted.current) setSaving(false) }
  }
  return <form aria-label={`Record response for ${campaign.campaign_name}`} onSubmit={save} className="mt-4 min-w-0 space-y-3 rounded-xl bg-[#f8fafc] p-3">
    <p className="text-sm text-[#40586f]">Record a response you have confirmed belongs to this campaign. Add how you verified it.</p>
    <label className="block text-sm text-[#40586f]">Response type<select value={kind} onChange={event => setKind(event.target.value)} disabled={saving} className="mt-1 block w-full rounded-lg border border-[#d7e3ef] p-2">{CLIENT_CAMPAIGN_RESPONSE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label className="block text-sm text-[#40586f]">Response time<input type="datetime-local" value={time} onChange={event => setTime(event.target.value)} required disabled={saving} className="mt-1 block w-full min-w-0 rounded-lg border border-[#d7e3ef] p-2" /></label>
    <label className="block text-sm text-[#40586f]">Response details<textarea value={detail} onChange={event => setDetail(event.target.value)} required maxLength={4000} rows={3} disabled={saving} className="mt-1 block w-full rounded-lg border border-[#d7e3ef] p-2" /></label>
    {error ? <p role="alert" className="break-words text-sm text-[#b42318]">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="submit" className="max-w-full whitespace-normal" disabled={saving || !detail.trim()}>{saving ? 'Saving…' : 'Save confirmed response'}</Button><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button></div>
  </form>
}
function CampaignCover({ campaign }) {
  const [failedSource, setFailedSource] = useState('')
  const source = typeof campaign.artwork_url === 'string' && /^(https:\/\/|\/(?!\/))/i.test(campaign.artwork_url) ? campaign.artwork_url : ''
  const hasArtwork = source && source !== failedSource
  return <div className={`client-campaign-cover ${hasArtwork ? 'client-campaign-cover-image' : ''}`}>
    {hasArtwork ? <img src={source} alt={`Artwork for ${campaign.campaign_name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSource(source)} /> : <div className="client-campaign-cover-copy"><Mail size={22} /><strong>{campaign.subject || campaign.campaign_name}</strong></div>}
    <span className="client-campaign-cover-label"><Mail size={12} />{hasArtwork ? 'Campaign artwork' : 'Email campaign'}</span>
  </div>
}

export default function ClientCampaignPanel({ client, onChanged, previewData }) {
  const [campaigns, setCampaigns] = useState([])
  const [summary, setSummary] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [available, setAvailable] = useState(Boolean(client.identityId))
  const [loading, setLoading] = useState(Boolean(client.identityId))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [order, setOrder] = useState('recent')
  const [expanded, setExpanded] = useState(new Set())
  const [artworkUnavailable, setArtworkUnavailable] = useState(false)
  const generation = useRef(0)
  const identityId = client.identityId
  const organisationId = client.organisationId
  const scope = useRef('')
  scope.current = `${organisationId}:${identityId}`
  const refresh = useCallback(async (nextCursor = null, preserve = false) => {
    const request = ++generation.current
    setLoading(true); setError('')
    try {
      const result = previewData || await loadClientCampaigns({ identityId, organisationId }, { cursor: nextCursor, includeSummary: !nextCursor })
      if (request !== generation.current) return
      setAvailable(result.available)
      setCampaigns(previous => nextCursor || preserve ? [...new Map([...previous, ...result.campaigns].map(row => [row.id, row])).values()] : result.campaigns)
      if (!nextCursor) setSummary(result.summary)
      setCursor(previous => preserve ? previous || result.nextCursor : result.nextCursor)
      setArtworkUnavailable(Boolean(result.artworkUnavailable))
    } catch (cause) { if (request === generation.current) { setError(cause.message || 'Unable to load campaign history.'); setCampaigns([]); setSummary(null); setCursor(null) } }
    finally { if (request === generation.current) setLoading(false) }
  }, [identityId, organisationId, previewData])
  useEffect(() => {
    setCampaigns([]); setSummary(null); setCursor(null); setEditing(null); setNotice(''); setFilter('all'); setSearch(''); setOrder('recent'); setExpanded(new Set()); setArtworkUnavailable(false)
    void refresh()
    return () => { generation.current += 1 }
  }, [refresh, client.identityVersion])
  async function saved() {
    const savedScope = scope.current
    setEditing(null); setNotice('Confirmed response saved to campaign history and client activity.')
    await refresh(null, true)
    if (scope.current !== savedScope) return
    try { await onChanged?.(identityId) } catch { if (scope.current === savedScope) setNotice('Response saved. Reload the directory to refresh its latest activity.') }
  }
  const filtered = useMemo(() => filterClientCampaigns(campaigns, { filter, search, order }), [campaigns, filter, search, order])
  function toggleDetails(id) { setExpanded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  function clearFilters() { setFilter('all'); setSearch('') }
  return <section aria-label="Client campaign history" className="client-campaign-workspace">
    <header className="client-campaign-heading"><div><span className="client-campaign-eyebrow">THE CONVERSATION WE STARTED</span><h4>Campaigns & engagement</h4><p>Email campaigns addressed to this client’s known email addresses.</p></div><Button variant="ghost" disabled={loading || (!identityId && !previewData) || Boolean(editing)} onClick={() => void refresh(null, true)}><RefreshCw size={15} />Refresh campaigns</Button></header>
    {!available ? <p className="client-campaign-notice">Campaign history is awaiting database setup and a permanent client profile.</p> : null}
    {error ? <p role="alert" className="client-campaign-error">{error}</p> : null}
    {notice ? <p role="status" className="client-campaign-notice">{notice}</p> : null}
    {artworkUnavailable ? <p role="status" className="client-campaign-notice">Campaign artwork could not be loaded. Delivery history remains available.</p> : null}
    {loading && !campaigns.length ? <p role="status">Loading campaign history…</p> : null}
    {available && summary ? <dl className="client-campaign-stats">{[[Mail, 'Campaigns', summary.campaignCount], [Send, 'Emails sent', summary.sentCount], [Check, 'Delivered', summary.deliveredCount], [MailOpen, 'Opened', summary.openedCount], [MousePointerClick, 'Clicked', summary.clickedCount], [MessageSquare, 'Campaigns with a confirmed response', summary.respondedCount]].map(([Icon, label, count]) => <div key={label}><span className="client-campaign-stat-icon">{createElement(Icon, { size: 16 })}</span><dt>{label}</dt><dd>{count || 0}</dd></div>)}</dl> : null}
    {available ? <details className="client-campaign-reading-guide"><summary><ShieldCheck size={15} />Understanding engagement</summary><p>Opens and clicks are tracking signals and may include automated activity. They do not confirm a reply. Responses below are recorded by staff; mailbox replies are not automatically imported. History follows retained email aliases and reviewed client merges. Only campaigns you have permission to view are shown. Artwork comes from the saved campaign design; it is not an exact rendering of the delivered email.</p></details> : null}
    {available && !loading && !error && !campaigns.length ? <div className="client-campaign-empty"><Mail size={28} /><strong>No matching campaigns visible yet.</strong><p>Campaigns addressed to this client will appear here once recorded.</p></div> : null}
    {available && campaigns.length ? <>
      <div className="client-campaign-library-heading"><div><h5>This client’s campaign collection</h5><p>Explore each addressed email and the response it received.</p></div><span>{new Set(campaigns.map(row => row.campaign_id)).size} loaded campaigns · {campaigns.length} addressed emails</span></div>
      <div className="client-campaign-filters" role="group" aria-label="Filter client campaigns">{CAMPAIGN_FILTERS.map(([key, label]) => <button type="button" key={key} disabled={Boolean(editing)} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span>{campaigns.filter(row => matchesCampaignFilter(row, key)).length}</span></button>)}</div>
      <div className="client-campaign-toolbar"><label><Search size={16} /><input type="search" aria-label="Search client campaigns" disabled={Boolean(editing)} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search campaigns, subjects or responses…" /></label><select aria-label="Campaign order" disabled={Boolean(editing)} value={order} onChange={event => setOrder(event.target.value)}><option value="recent">Newest added</option><option value="activity">Latest activity</option></select></div>
      <div className="client-campaign-result-count"><span aria-live="polite">{filtered.length} of {campaigns.length} loaded addressed emails</span>{filter !== 'all' || search ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}</div>
      {!filtered.length ? <div className="client-campaign-empty"><Search size={25} /><strong>No campaigns match these filters.</strong><p>Clear your filters or load older campaigns to look further back.</p><button type="button" onClick={clearFilters}>Show all campaigns</button></div> : null}
      <ol className="client-campaign-grid">{filtered.map(campaign => {
        const open = expanded.has(campaign.id)
        const responded = Number(campaign.response_count) > 0
        const latestResponse = campaign.responses?.[0]
        return <li key={campaign.id}><article className={`client-campaign-card ${responded ? 'client-campaign-card-responded' : ''}`}>
          <CampaignCover campaign={campaign} />
          <div className="client-campaign-card-body">
            <div className="client-campaign-card-meta"><span><Mail size={12} />EMAIL</span><span className={`client-campaign-status ${matchesCampaignFilter(campaign, 'issues') ? 'client-campaign-status-issue' : ''}`}>{String(campaign.status || 'Not recorded').replaceAll('_', ' ')}</span></div>
            <h5>{campaign.campaign_name}</h5><p className="client-campaign-subject">{campaign.subject}</p>{campaign.preview_text ? <p className="client-campaign-preview-text">{campaign.preview_text}</p> : null}<p className="client-campaign-recipient">To {campaign.email}</p>
            <ol className="client-campaign-progress" aria-label={`Recorded milestones for ${campaign.campaign_name}`}>{[['Sent', campaign.sent_at], ['Delivered', campaign.delivered_at], ['Opened', campaign.opened_at], ['Clicked', campaign.clicked_at]].map(([label, time]) => <li key={label} className={time ? 'is-recorded' : ''} title={time ? `${label}: ${formatTime(time)}` : `${label}: Not recorded`}><span>{time ? <Check size={12} /> : <span />}</span><small>{label}</small><span className="sr-only">{time ? ` recorded ${formatTime(time)}` : ' not recorded'}</span></li>)}</ol>
            <p className="client-campaign-signals"><MailOpen size={13} />{campaign.open_count || 0} recorded opens · {campaign.click_count || 0} recorded clicks</p>
            <div className={`client-campaign-response ${responded ? 'has-response' : ''}`}><MessageSquare size={16} /><div><strong>{responded ? `${campaign.response_count} confirmed response${campaign.response_count === 1 ? '' : 's'}` : 'No confirmed response recorded'}</strong>{latestResponse ? <><span>{campaignResponseLabel(latestResponse.response_kind)} · Staff confirmed</span><p>{latestResponse.detail}</p></> : <span>{campaign.sent_at ? 'Record a verified reply, enquiry or RSVP.' : 'A response can be recorded after sending.'}</span>}</div></div>
            <div className="client-campaign-card-actions"><button type="button" aria-expanded={open} aria-controls={`campaign-evidence-${campaign.id}`} aria-label={`Delivery details for ${campaign.campaign_name}`} onClick={() => toggleDetails(campaign.id)}>Delivery details{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>{!previewData && campaign.campaign_id ? <a href={`/marketing?section=email&view=detail&id=${encodeURIComponent(campaign.campaign_id)}`}>Open campaign<ArrowUpRight size={13} /></a> : <span>Preview campaign</span>}</div>
            {open ? <div id={`campaign-evidence-${campaign.id}`} className="client-campaign-evidence"><h6>Delivery evidence</h6><dl>{[['Sent', campaign.sent_at], ['Delivered', campaign.delivered_at], ['First recorded open', campaign.opened_at], ['First recorded click', campaign.clicked_at]].map(([label, time]) => <div key={label}><dt>{label}</dt><dd>{time ? <time dateTime={time}>{formatTime(time)}</time> : 'Not recorded'}</dd></div>)}</dl>{campaign.responses?.length ? <ul>{campaign.responses.map(response => <li key={response.id}><strong>{campaignResponseLabel(response.response_kind)} · Staff confirmed</strong><time dateTime={response.occurred_at}>{formatTime(response.occurred_at)}</time><p>{response.detail}</p></li>)}</ul> : null}{campaign.response_count > (campaign.responses?.length || 0) ? <p>Showing the 20 most recent responses. Earlier responses remain in client Activity.</p> : null}</div> : null}
            {campaign.sent_at ? <Button className="client-campaign-record-button" variant="secondary" disabled={Boolean(editing) || loading || Boolean(previewData)} title={previewData ? 'Mock preview is read-only' : undefined} onClick={() => { setEditing(campaign.id); setNotice('') }} aria-label={`Record response for ${campaign.campaign_name}`}>Record confirmed response</Button> : null}
            {!previewData && editing === campaign.id ? <ResponseForm key={`${organisationId}:${identityId}:${campaign.id}`} client={client} campaign={campaign} onSaved={saved} onCancel={() => setEditing(null)} /> : null}
          </div>
        </article></li>
      })}</ol>
    </> : null}
    {cursor ? <div className="flex justify-center"><Button variant="secondary" disabled={loading || Boolean(editing)} onClick={() => void refresh(cursor)}>{loading ? 'Loading…' : 'Load older campaigns'}</Button></div> : null}
  </section>
}
