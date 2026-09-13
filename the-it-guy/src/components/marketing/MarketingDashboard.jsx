import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BarChart3, CalendarDays, ChevronDown, Eye, Mail, Megaphone, Plus, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getMarketingOverviewDashboard, MARKETING_DATE_RANGES } from '../../services/marketingOverviewService'
import Property24ListingPerformance from './Property24ListingPerformance'
import Property24PerformanceInsights from './Property24PerformanceInsights'

const metricIcons = { totalLeads: UsersRound, qualifiedLeads: UsersRound, websiteVisits: Eye, campaignReach: BarChart3, activeCampaigns: Megaphone }
const metricLabels = { totalLeads: 'Total leads', qualifiedLeads: 'Qualified leads', websiteVisits: 'Website visits', campaignReach: 'Campaign reach', activeCampaigns: 'Active campaigns' }
const sourceColours = ['#2463d7', '#7854e8', '#13a875', '#70a8ef', '#b297f5', '#e7994d']
const number = (value) => Number(value || 0).toLocaleString()
const dateLabel = (value) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—' }
const relativeTime = (value) => { const hours = Math.floor(Math.max(0, Date.now() - new Date(value || 0).getTime()) / 3600000); return hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago` }
const inputDate = (value) => new Date(value).toISOString().slice(0, 10)
const dateTimeLabel = (value) => { const date = new Date(value || ''); if (!Number.isFinite(date.getTime())) return 'Awaiting first sync'; const label = date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); return Date.now() - date.getTime() > 36 * 3600000 ? `${label} · data may be stale` : label }

function organisationIdFrom(workspace = {}, membership = {}) { return String(workspace?.organisationId || workspace?.organisation_id || workspace?.raw?.organisation_id || membership?.organisationId || membership?.organisation_id || workspace?.id || '').trim() }

function EmptyCard({ children }) { return <div className="mo-empty">{children}</div> }

function LineChart({ rows = [], first = 'totalLeads', second = 'qualifiedLeads', labels = ['Total leads', 'Qualified leads'], emptyCopy }) {
  const usable = rows.filter((row) => Number.isFinite(Number(row[first])))
  if (!usable.length || usable.every((row) => !Number(row[first]) && !Number(row[second]))) return <EmptyCard>{emptyCopy || 'No activity in this period.'}</EmptyCard>
  const hasSecondSeries = Boolean(second) && usable.some((row) => row[second] !== null && row[second] !== undefined)
  const max = Math.max(1, ...usable.flatMap((row) => hasSecondSeries ? [Number(row[first] || 0), Number(row[second] || 0)] : [Number(row[first] || 0)]))
  const points = (key) => usable.map((row, index) => `${usable.length === 1 ? 0 : (index / (usable.length - 1)) * 100},${92 - ((Number(row[key] || 0) / max) * 82)}`).join(' ')
  return <><div className="mo-chart" role="img" aria-label={`${labels[0]}${hasSecondSeries ? ` and ${labels[1]}` : ''} over time`}><span className="mo-chart-scale">{max}</span><span className="mo-chart-scale mo-chart-scale-bottom">0</span><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points(first)} className="mo-line mo-line-primary" />{hasSecondSeries ? <polyline points={points(second)} className="mo-line mo-line-secondary" /> : null}</svg><div className="mo-chart-labels">{usable.filter((_, index) => index === 0 || index === usable.length - 1 || index % Math.max(1, Math.floor(usable.length / 4)) === 0).map((row) => <span key={row.date}>{dateLabel(row.date)}</span>)}</div></div><div className="mo-legend"><span><i className="mo-dot-primary" />{labels[0]}</span>{hasSecondSeries ? <span><i className="mo-dot-secondary" />{labels[1]}</span> : null}</div></>
}

function Metric({ id, item }) {
  const Icon = metricIcons[id]
  const change = item?.change
  const detail = change === null || change === undefined ? (item?.note || 'No comparison available') : `${change > 0 ? '↑' : change < 0 ? '↓' : '—'} ${Math.abs(change)}% vs previous period`
  return <article className="mo-metric"><span className="mo-metric-icon"><Icon size={19} /></span><div><span>{metricLabels[id]}</span><strong>{item?.available ? number(item.value) : '—'}</strong><small className={change > 0 ? 'is-positive' : change < 0 ? 'is-negative' : ''}>{detail}</small></div></article>
}

function Property24Metric({ label, value, change, detail = '' }) {
  const changeLabel = detail || (change === null || change === undefined ? 'No prior-period comparison' : `${change > 0 ? '↑' : change < 0 ? '↓' : '—'} ${Math.abs(change)}% vs previous period`)
  return <article className="mo-property24-metric"><span>{label}</span><strong>{number(value)}</strong><small className={change > 0 ? 'is-positive' : change < 0 ? 'is-negative' : ''}>{changeLabel}</small></article>
}

export default function MarketingDashboard({ onNavigate }) {
  const navigate = useNavigate()
  const { currentWorkspace, currentMembership } = useWorkspace()
  const organisationId = organisationIdFrom(currentWorkspace, currentMembership)
  const [range, setRange] = useState('30d')
  const [customRange, setCustomRange] = useState(() => ({ start: inputDate(Date.now() - (29 * 86400000)), end: inputDate(new Date()) }))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let active = true
    void (async () => {
      await Promise.resolve()
      if (!active) return
      setLoading(true)
      setError('')
      try {
        const next = await getMarketingOverviewDashboard({ organisationId, range, customStart: customRange.start, customEnd: customRange.end })
        if (active) setData(next)
      } catch (reason) {
        if (active) setError(reason?.message || 'Marketing analytics could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [organisationId, range, customRange.end, customRange.start, reloadKey])
  const sourceTotal = useMemo(() => (data?.leadSources || []).reduce((sum, row) => sum + row.count, 0), [data])
  const metrics = data?.summary || {}
  const createCampaign = () => onNavigate('email')
  return <div className="wa-page marketing-dashboard mo-dashboard">
    <header className="mo-header"><div className="mo-header-actions"><label className="mo-period"><CalendarDays size={15} /><span className="sr-only">Date range</span><select value={range} onChange={(event) => setRange(event.target.value)}>{MARKETING_DATE_RANGES.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select><ChevronDown size={14} /></label>{range === 'custom' ? <div className="mo-custom-range"><label>From<input type="date" value={customRange.start} max={customRange.end} onChange={(event) => setCustomRange((value) => ({ ...value, start: event.target.value }))} /></label><label>To<input type="date" value={customRange.end} min={customRange.start} max={inputDate(new Date())} onChange={(event) => setCustomRange((value) => ({ ...value, end: event.target.value }))} /></label></div> : null}<button className="mo-create" type="button" onClick={createCampaign}><Plus size={17} />Create campaign</button></div></header>
    {error ? <section className="mo-error">{error}<button type="button" onClick={() => setReloadKey((value) => value + 1)}>Retry</button></section> : null}
    {!organisationId && !loading ? <section className="mo-error">Choose an agency workspace to see marketing reporting.</section> : null}
    <section className="mo-metrics" aria-label="Marketing summary">{Object.keys(metricLabels).map((id) => <Metric id={id} item={metrics[id]} key={id} />)}</section>
    <section className="mo-grid mo-grid-primary"><article className="mo-card"><header><h2>Leads over time</h2><p>New leads created during {data?.period?.label?.toLowerCase() || 'this period'}.</p></header>{loading ? <EmptyCard>Loading lead activity…</EmptyCard> : <><LineChart rows={data?.leadsOverTime} emptyCopy="No leads were created in this period." /><p className="mo-unavailable">Qualified-lead timing is not recorded yet.</p></>}</article><article className="mo-card"><header><div><h2>Lead sources</h2><p>{number(sourceTotal)} total leads</p></div></header>{loading ? <EmptyCard>Loading sources…</EmptyCard> : data?.leadSources?.length ? <div className="mo-source-list">{data.leadSources.map((source, index) => <div className="mo-source-row" key={source.key}><i style={{ backgroundColor: sourceColours[index % sourceColours.length] }} /><span>{source.label}</span><strong>{number(source.count)}</strong><small>{source.percentage}%</small></div>)}</div> : <EmptyCard>Lead sources will appear when new leads are captured.</EmptyCard>}</article></section>
    <section className="mo-grid mo-grid-secondary"><article className="mo-card"><header><h2>Channel performance</h2><p>Comparable results from connected channels.</p></header><div className="mo-table-wrap"><table className="mo-table"><thead><tr><th>Channel</th><th>Visits / reach</th><th>Engagement</th><th>Leads</th><th>Cost per lead</th></tr></thead><tbody>{(data?.channelPerformance || []).map((channel) => <tr key={channel.key}><td><strong>{channel.label}</strong>{!channel.connected ? <small>{channel.note}</small> : null}</td><td>{channel.volume === null ? '—' : `${number(channel.volume)} ${channel.volumeLabel.toLowerCase()}`}</td><td>{channel.engagement}</td><td>{number(channel.leads)}</td><td>—</td></tr>)}</tbody></table></div></article><article className="mo-card"><header><div><h2>Website performance</h2><p>{data?.websitePerformance?.connected ? 'First-party, privacy-safe analytics' : 'Website analytics unavailable'}</p></div><strong className="mo-header-metric">{data?.websitePerformance?.connected ? `${number(data.websitePerformance.websiteLeads)} leads` : '—'}</strong></header>{data?.websitePerformance?.connected ? <><LineChart rows={data.websitePerformance.series.map((row) => ({ ...row, totalLeads: row.visits, qualifiedLeads: row.pageViews }))} labels={['Website visits', 'Page views']} /><ol className="mo-top-pages">{data.websitePerformance.topPages.map((page, index) => <li key={`${page.label}-${index}`}><span>{index + 1}</span><strong>{page.label}</strong><small>{number(page.views)} views</small></li>)}</ol></> : <EmptyCard>{data?.websitePerformance?.error || 'Connect website tracking to see visits and top pages.'}</EmptyCard>}</article></section>
    <section className="mo-card mo-property24-card"><header><div><h2>Property24 portal performance</h2><p>{data?.property24Performance?.connected ? `Last refreshed ${dateTimeLabel(data.property24Performance.lastSyncedAt)}` : 'Portal statistics are unavailable'}</p></div><strong className="mo-header-metric">{data?.property24Performance?.contactRate === null || data?.property24Performance?.contactRate === undefined ? '—' : `${data.property24Performance.contactRate}% contact rate`}</strong></header>{loading ? <EmptyCard>Loading Property24 performance…</EmptyCard> : data?.property24Performance?.connected && !data.property24Performance?.error ? <><div className="mo-property24-metrics"><Property24Metric label="Listing contact forms" value={data.property24Performance.listingContactFormLeads} change={data.property24Performance.comparison?.listingContactFormLeads} /><Property24Metric label="WhatsApp contact forms" value={data.property24Performance.whatsAppContactFormLeads} change={data.property24Performance.comparison?.whatsAppContactFormLeads} /><Property24Metric label="Total portal contacts" value={data.property24Performance.totalContactLeads} change={data.property24Performance.comparison?.totalContactLeads} /><Property24Metric label="Imported into Arch9" value={data.property24Performance.importedProperty24Leads} /></div><LineChart rows={data.property24Performance.daily.map((row) => ({ ...row, totalLeads: row.listingContactFormLeads, qualifiedLeads: row.whatsAppContactFormLeads }))} labels={['Listing contact forms', 'WhatsApp contact forms']} emptyCopy="No Property24 contact activity in this period." /><p className="mo-unavailable">Phone and SMS contacts: {number(data.property24Performance.telephoneLeads)} phone · {number(data.property24Performance.smsLeads)} SMS. Imported leads remain a separate CRM measure.</p></> : <EmptyCard>{data?.property24Performance?.error || 'Connect Property24 and run the first statistics sync to see portal performance.'}</EmptyCard>}</section>
    <section className="mo-grid mo-grid-secondary"><article className="mo-card"><header><div><h2>Recent campaigns</h2><p>Latest email and WhatsApp campaigns.</p></div><button className="mo-link" type="button" onClick={() => onNavigate('email')}>View campaigns <ArrowRight size={14} /></button></header>{data?.recentCampaigns?.length ? <div className="mo-table-wrap"><table className="mo-table"><thead><tr><th>Campaign</th><th>Channel</th><th>Audience</th><th>Sent</th><th>Delivery / engagement</th></tr></thead><tbody>{data.recentCampaigns.map((campaign) => { const performance = campaign.performance || {}; const delivery = Number(performance.recipients) ? `${Math.round((Number(performance.delivered) / Number(performance.recipients)) * 100)}% delivered` : 'Not sent'; return <tr key={campaign.id}><td><strong>{campaign.name}</strong><small>{campaign.preview_text || campaign.subject}</small></td><td><span className="mo-badge"><Mail size={13} />Email</span></td><td>{campaign.audience}</td><td>{dateLabel(campaign.sent_at || campaign.scheduled_for || campaign.created_at)}</td><td>{delivery}</td></tr> })}</tbody></table></div> : <EmptyCard>No campaigns yet. <button type="button" onClick={createCampaign}>Create a campaign</button></EmptyCard>}</article><article className="mo-card"><header><div><h2>New leads</h2><p>Most recent leads in this period.</p></div><button className="mo-link" type="button" onClick={() => navigate('/pipeline/leads')}>View all leads <ArrowRight size={14} /></button></header>{data?.recentLeads?.length ? <div className="mo-lead-list">{data.recentLeads.map((lead) => <button type="button" onClick={() => navigate(`/pipeline/leads?lead=${encodeURIComponent(lead.id)}`)} key={lead.id}><div><strong>{lead.name}</strong><span className="mo-badge">{lead.source.label}</span><small>{lead.enquiry}</small></div><time>{relativeTime(lead.createdAt)}</time></button>)}</div> : <EmptyCard>No new leads in this period.</EmptyCard>}</article></section>
    <Property24PerformanceInsights insights={data?.property24Performance?.insights || []} performance={data?.property24Performance} period={data?.period} />
    <Property24ListingPerformance organisationId={organisationId} period={data?.period} />
  </div>
}
