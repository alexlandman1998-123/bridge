import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, BarChart3, CalendarDays, ChevronDown, Clock3, ContactRound, Eye, Globe2, Info, Mail, MessageCircle, Megaphone, Plus, UsersRound } from 'lucide-react'
import { useMarketingNavigate as useNavigate } from './MarketingNavigation.jsx'
import { getLeadSourcePresentation } from '../mobile-shell/leadSourcePresentation.js'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getMarketingOverviewDashboard, MARKETING_DATE_RANGES } from '../../services/marketingOverviewService'

const metricIcons = { totalLeads: UsersRound, websiteVisits: Eye, campaignReach: BarChart3, activeCampaigns: Megaphone }
const metricLabels = { totalLeads: 'Total leads', websiteVisits: 'Website visits', campaignReach: 'Campaign reach', activeCampaigns: 'Active campaigns' }
const sourceColours = ['#2463d7', '#7854e8', '#13a875', '#70a8ef', '#b297f5', '#b77429', '#b5426c', '#427b8c']
const number = (value) => Number(value || 0).toLocaleString()
const dateLabel = (value) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—' }
const inputDate = (value) => new Date(value).toISOString().slice(0, 10)

function organisationIdFrom(workspace = {}, membership = {}) { return String(workspace?.organisationId || workspace?.organisation_id || workspace?.raw?.organisation_id || membership?.organisationId || membership?.organisation_id || workspace?.id || '').trim() }

function EmptyCard({ children }) { return <div className="mo-empty">{children}</div> }

function LineChart({ rows = [], first = 'totalLeads', second = 'qualifiedLeads', labels = ['Total leads', 'Qualified leads'], series, emptyCopy }) {
  const [hidden, setHidden] = useState([])
  const usable = rows.filter((row) => Number.isFinite(Number(row[first])))
  const hasSecondSeries = Boolean(second) && usable.some((row) => row[second] !== null && row[second] !== undefined)
  const chartSeries = series || [
    { key: first, label: labels[0], colour: '#2463d7', value: (row) => Number(row[first] || 0) },
    ...(hasSecondSeries ? [{ key: second, label: labels[1], colour: '#07975d', value: (row) => Number(row[second] || 0) }] : []),
  ]
  if (!usable.length || usable.every((row) => chartSeries.every((item) => !item.value(row)))) return <EmptyCard>{emptyCopy || 'No activity in this period.'}</EmptyCard>
  const visible = chartSeries.filter((item) => !hidden.includes(item.key))
  const max = Math.max(1, ...usable.flatMap((row) => visible.map((item) => item.value(row))))
  const points = (item) => {
    const y = (row) => 92 - ((item.value(row) / max) * 82)
    if (usable.length === 1) return `49.8,${y(usable[0])} 50.2,${y(usable[0])}`
    return usable.map((row, index) => `${(index / (usable.length - 1)) * 100},${y(row)}`).join(' ')
  }
  return <>
    <div className="mo-chart" role="img" aria-label={`${visible.map((item) => item.label).join(', ')} over time`}>
      <span className="mo-chart-scale">{max}</span><span className="mo-chart-scale mo-chart-scale-bottom">0</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">{visible.map((item) => <polyline key={item.key} points={points(item)} className="mo-line" style={{ stroke: item.colour, strokeWidth: item.key === 'totalLeads' ? 2.5 : 1.8, strokeDasharray: item.key === 'totalLeads' && series ? '5 4' : undefined }}><title>{item.label}: {usable.map((row) => `${dateLabel(row.date)}: ${item.value(row)}`).join('; ')}</title></polyline>)}</svg>
      <div className="mo-chart-labels">{usable.filter((_, index) => index === 0 || index === usable.length - 1 || index % Math.max(1, Math.floor(usable.length / 4)) === 0).map((row) => <span key={row.date}>{dateLabel(row.date)}</span>)}</div>
    </div>
    <div className="mo-legend" aria-label="Chart legend">{chartSeries.map((item) => item.toggleable ? <button key={item.key} type="button" aria-pressed={!hidden.includes(item.key)} onClick={() => setHidden((previous) => previous.includes(item.key) ? previous.filter((key) => key !== item.key) : [...previous, item.key])}><i style={{ background: item.colour }} />{item.label}</button> : <span key={item.key}><i style={{ background: item.colour }} />{item.label}</span>)}</div>
  </>
}

function MarketingSourceBrand({ source }) {
  const { logo } = getLeadSourcePresentation(source.key)
  const [failedLogo, setFailedLogo] = useState('')
  const Icon = { website: Globe2, email_campaign: Mail, whatsapp_campaign: MessageCircle, facebook_lead_ad: Megaphone, digital_business_card: ContactRound }[source.key] || UsersRound
  return <span className="mo-source-brand">{logo && failedLogo !== logo ? <img src={logo} alt={`${source.label} logo`} loading="lazy" onError={() => setFailedLogo(logo)} /> : <Icon size={21} aria-hidden="true" />}</span>
}

function ChannelPerformance({ channels = [], periodLabel, loading }) {
  const [selectedKey, setSelectedKey] = useState(null)
  const detailRef = useRef(null)
  const ranked = [...channels].sort((a, b) => Number(b.leads || 0) - Number(a.leads || 0))
  const selected = ranked.find((channel) => channel.key === selectedKey) || ranked[0]
  const maximum = Math.max(1, ...ranked.map((channel) => Number(channel.leads || 0)))
  const sourceKey = (key) => ({ email: 'email_campaign', whatsapp: 'whatsapp_campaign', 'private-property': 'private_property', 'digital-business-cards': 'digital_business_card' }[key] || key)
  return <article className="mo-card mo-channel-card">
    <header><div><h2>Channel performance</h2><p>Compare lead volume, then explore each channel.</p></div><span className="mo-channel-period">{periodLabel || 'Selected period'}</span></header>
    {loading ? <EmptyCard>Loading channel performance…</EmptyCard> : !selected ? <EmptyCard>Channel performance will appear as activity is recorded.</EmptyCard> : <div className="mo-channel-workspace">
      <div className="mo-channel-comparison" role="group" aria-label="Compare channel leads">
        <div className="mo-channel-axis"><span>Channel</span><span>Leads</span></div>
        {ranked.map((channel, index) => <button type="button" key={channel.key} className="mo-channel-choice" aria-label={`View ${channel.label} performance`} aria-pressed={channel.key === selected.key} aria-controls="marketing-channel-detail" onClick={() => { setSelectedKey(channel.key); if (window.innerWidth <= 700) detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }) }}>
          <MarketingSourceBrand source={{ key: sourceKey(channel.key), label: channel.label }} />
          <span className="mo-channel-choice-content"><span className="mo-channel-choice-title"><span>{channel.label}</span><strong>{channel.leads == null ? '—' : number(channel.leads)}</strong></span><span className="mo-channel-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Number(channel.leads || 0)) / maximum * 100}%`, background: sourceColours[index % sourceColours.length] }} /></span></span>
          <ArrowRight size={15} aria-hidden="true" />
        </button>)}
      </div>
      <section ref={detailRef} id="marketing-channel-detail" className="mo-channel-detail" aria-label={`${selected.label} performance`}>
        <div className="mo-channel-detail-heading"><MarketingSourceBrand source={{ key: sourceKey(selected.key), label: selected.label }} /><div><small>CHANNEL BREAKDOWN</small><h3>{selected.label}</h3></div></div>
        <div className="mo-channel-lead-count"><strong>{selected.leads == null ? '—' : number(selected.leads)}</strong><span>leads in this period</span></div>
        <dl className="mo-channel-statistics"><div><dt>{selected.volumeLabel || 'Activity'}</dt><dd>{selected.volume == null ? 'Not reported' : number(selected.volume)}</dd></div><div><dt>Engagement</dt><dd>{!selected.engagement || selected.engagement === '—' ? 'Not reported' : selected.engagement}</dd></div></dl>
        {selected.note ? <p className="mo-channel-note"><Info size={15} aria-hidden="true" /><span>{selected.note}</span></p> : null}
      </section>
    </div>}
  </article>
}

function CampaignPreview({ campaign }) {
  const [failedUrl, setFailedUrl] = useState('')
  const image = campaign.thumbnailUrl
  return <span className="mo-campaign-preview" aria-hidden="true">{image && image !== failedUrl ? <img src={image} alt="" loading="lazy" onError={() => setFailedUrl(image)} /> : <span className="mo-campaign-document"><Mail size={16} /><span className="mo-campaign-document-image" /><span className="mo-campaign-document-line" /><span className="mo-campaign-document-line" /></span>}</span>
}

function Metric({ id, item }) {
  const Icon = metricIcons[id]
  const change = item?.change
  const hasComparison = typeof change === 'number' && Number.isFinite(change)
  const note = [
    'Website tracking is not connected.',
    'Email delivery only; WhatsApp delivery is not connected.',
  ].includes(item?.note) ? '' : item?.note || ''
  const tone = hasComparison && change > 0 ? 'is-positive' : hasComparison && change < 0 ? 'is-negative' : ''
  const StatusIcon = hasComparison ? null : note ? Info : Clock3
  return <article className="mo-metric">
    <header className="mo-metric-heading"><span className="mo-metric-icon" aria-hidden="true"><Icon size={18} /></span><span>{metricLabels[id]}</span></header>
    <strong>{item?.available ? number(item.value) : '—'}</strong>
    <footer className="mo-metric-footer">
      <span className={`mo-metric-status ${tone}`}>{StatusIcon ? <StatusIcon size={13} aria-hidden="true" /> : null}{hasComparison ? `${change > 0 ? '↑' : change < 0 ? '↓' : '—'} ${Math.abs(change)}%` : note ? 'Coverage details' : 'No comparison yet'}</span>
      {hasComparison ? <small>vs previous period</small> : note ? <small>{note}</small> : null}
    </footer>
  </article>
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
    <header className="mo-header"><div className="mo-header-copy"><h1>Marketing overview</h1></div><div className="mo-header-actions"><label className="mo-period"><CalendarDays size={15} /><span className="sr-only">Date range</span><select value={range} onChange={(event) => setRange(event.target.value)}>{MARKETING_DATE_RANGES.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select><ChevronDown size={14} /></label>{range === 'custom' ? <div className="mo-custom-range"><label>From<input type="date" value={customRange.start} max={customRange.end} onChange={(event) => setCustomRange((value) => ({ ...value, start: event.target.value }))} /></label><label>To<input type="date" value={customRange.end} min={customRange.start} max={inputDate(new Date())} onChange={(event) => setCustomRange((value) => ({ ...value, end: event.target.value }))} /></label></div> : null}<button className="mo-create" type="button" onClick={createCampaign}><Plus size={17} />Create campaign</button></div></header>
    {error ? <section className="mo-error">{error}<button type="button" onClick={() => setReloadKey((value) => value + 1)}>Retry</button></section> : null}
    {!organisationId && !loading ? <section className="mo-error">Choose an agency workspace to see marketing reporting.</section> : null}
    <section className="mo-metrics" aria-label="Marketing summary">{Object.keys(metricLabels).map((id) => <Metric id={id} item={metrics[id]} key={id} />)}</section>
    <section className="mo-grid mo-grid-primary"><article className="mo-card mo-leads-card"><header><h2>Leads over time</h2><p>New leads created during {data?.period?.label?.toLowerCase() || 'this period'}.</p></header>{loading ? <EmptyCard>Loading lead activity…</EmptyCard> : <><LineChart rows={data?.leadsOverTime} series={[
      { key: 'totalLeads', label: 'Total leads', colour: '#0e2145', value: (row) => row.totalLeads || 0 },
      ...(data?.leadSources || []).map((source, index) => ({ key: source.key, label: source.label, colour: sourceColours[index % sourceColours.length], value: (row) => row.sources?.[source.key] || 0, toggleable: true })),
    ]} emptyCopy="No leads were created in this period." /></>}</article><article className="mo-card mo-source-card"><header><h2>Lead sources</h2><span className="mo-source-total"><strong>{number(sourceTotal)}</strong><small>total leads</small></span></header>{loading ? <EmptyCard>Loading sources…</EmptyCard> : data?.leadSources?.length ? <ul className="mo-source-list">{data.leadSources.map((source, index) => <li className="mo-source-row" key={source.key}>
      <MarketingSourceBrand source={source} />
      <div className="mo-source-detail"><div className="mo-source-label"><span>{source.label}</span><strong>{number(source.count)}<span className="sr-only"> leads</span></strong></div>
        <div className="mo-source-share"><span className="mo-source-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, Number(source.percentage) || 0))}%`, background: sourceColours[index % sourceColours.length] }} /></span><small>{source.percentage}%</small></div>
      </div>
    </li>)}</ul> : <EmptyCard>Lead sources will appear when new leads are captured.</EmptyCard>}</article></section>
    <section className="mo-grid mo-channel-section"><ChannelPerformance channels={data?.channelPerformance} periodLabel={data?.period?.label} loading={loading} /><article className="mo-card"><header><div><h2>Website performance</h2>{!data?.websitePerformance?.connected && <p>Website analytics unavailable</p>}</div><strong className="mo-header-metric">{data?.websitePerformance?.connected ? `${number(data.websitePerformance.websiteLeads)} leads` : '—'}</strong></header>{data?.websitePerformance?.connected ? <><LineChart rows={data.websitePerformance.series.map((row) => ({ ...row, totalLeads: row.visits, qualifiedLeads: row.pageViews }))} labels={['Website visits', 'Page views']} /><ol className="mo-top-pages">{data.websitePerformance.topPages.map((page, index) => <li key={`${page.label}-${index}`}><span>{index + 1}</span><strong>{page.label}</strong><small>{number(page.views)} views</small></li>)}</ol></> : <EmptyCard>{data?.websitePerformance?.error || 'Connect website tracking to see visits and top pages.'}</EmptyCard>}</article></section>
    <article className="mo-card mo-recent-campaigns"><header><h2>Recent campaigns</h2><button className="mo-link" type="button" onClick={() => onNavigate('email')}>View campaigns <ArrowRight size={14} /></button></header>
      {loading ? <EmptyCard>Loading campaigns…</EmptyCard> : data?.recentCampaigns?.length ? <ul className="mo-campaign-list">{data.recentCampaigns.map((campaign) => {
        const performance = campaign.performance || {}
        const recipients = Number(performance.recipients || 0)
        const delivery = recipients > 0 ? `${Math.round(Number(performance.delivered || 0) / recipients * 100)}%` : '—'
        const status = String(campaign.status || 'draft').toLowerCase()
        const date = campaign.sent_at || (status === 'scheduled' ? campaign.scheduled_for : null) || campaign.updated_at || campaign.created_at
        const datePrefix = campaign.sent_at ? 'Sent' : status === 'scheduled' ? 'Scheduled' : 'Updated'
        const isWhatsApp = campaign.channel?.toLowerCase().includes('whatsapp')
        const ChannelIcon = isWhatsApp ? MessageCircle : Mail
        return <li key={campaign.id}><button className="mo-campaign-row" type="button" aria-label={`Open campaign ${campaign.name}`} onClick={() => navigate(`/marketing?section=${isWhatsApp ? 'whatsapp' : 'email'}&view=detail&id=${encodeURIComponent(campaign.id)}`)}>
          <CampaignPreview campaign={campaign} />
          <span className="mo-campaign-copy"><span className="mo-campaign-title"><strong>{campaign.name}</strong><span className="mo-campaign-state" data-status={status}><i />{status.replaceAll('_', ' ')}</span></span>
            {campaign.preview_text || campaign.subject ? <span className="mo-campaign-subject">{campaign.preview_text || campaign.subject}</span> : null}
            <span className="mo-campaign-meta"><span className="mo-campaign-channel"><ChannelIcon size={13} />{campaign.channel || 'Email'}</span><span><UsersRound size={13} />{campaign.audience}</span>{date ? <time dateTime={date}>{datePrefix} {dateLabel(date)}</time> : null}</span>
          </span>
          <span className="mo-campaign-delivery"><strong>{delivery}</strong><small>Delivery rate</small>{recipients > 0 ? <small>{number(recipients)} recipients</small> : null}</span><ArrowRight className="mo-campaign-open" size={16} aria-hidden="true" />
        </button></li>
      })}</ul> : <EmptyCard>No campaigns yet. <button type="button" onClick={createCampaign}>Create a campaign</button></EmptyCard>}
    </article>
  </div>
}
