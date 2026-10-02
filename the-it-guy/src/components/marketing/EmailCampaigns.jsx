import ClientAudiences from '../clients/ClientAudiences'
import EmailCampaignSettings from './EmailCampaignSettings'
import EmailCampaignBuilder from './EmailCampaignBuilder'
import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowLeft, CalendarClock, Check, ChevronRight, Copy, FileUp, LayoutTemplate, Mail, MailOpen, MousePointerClick, Plus, Save, Search, Send, ShieldCheck, SlidersHorizontal, UsersRound } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { archiveEmailCampaign, cancelEmailCampaign, duplicateEmailCampaign, getEmailCampaignAnalytics, getEmailCampaignWorkspace, preflightEmailCampaign, refreshEmailSenderVerification, saveEmailAudience } from '../../services/emailCampaignService'

const fmt = (v) => new Intl.NumberFormat().format(Number(v || 0))
const rate = (v, total) => total ? `${Math.round(Number(v || 0) * 100 / total)}%` : '—'
const getOrg = (a) => String(a?.currentWorkspace?.id || a?.currentMembership?.workspaceId || a?.currentMembership?.workspace_id || '').trim()

function useCampaigns() {
  const { authState } = useAuthSession(); const organisationId = getOrg(authState)
  const [state, setState] = useState({ loading: true, error: '', campaigns: [], performance: [], identities: [], domains: [], contacts: [], subscriptionTypes: [], deliverability: [], templates: [], savedAudiences: [], usage: [], billingProfile: null, dailyPerformance: [], categoryPerformance: [] })
  const refresh = async () => { if (!organisationId) return setState((s) => ({ ...s, loading: false, error: 'Choose an organisation workspace to use Email Campaigns.' })); setState((s) => ({ ...s, loading: true, error: '' })); try { setState({ loading: false, error: '', ...(await getEmailCampaignWorkspace(organisationId)) }) } catch (e) { setState((s) => ({ ...s, loading: false, error: e.message || 'Campaign data could not be loaded.' })) } }
  useEffect(() => { void refresh() }, [organisationId])
  return { ...state, refresh, organisationId, userId: authState?.user?.id || '' }
}
function Status({ value }) { const status = String(value || 'draft').toLowerCase(); const tone = status === 'sent' ? 'sent' : status === 'scheduled' ? 'scheduled' : status === 'sending' ? 'sending' : status.includes('failed') ? 'failed' : 'draft'; return <span className={`email-campaign-status email-campaign-status-${tone}`}><i />{status.replaceAll('_', ' ')}</span> }
function CampaignThumbnail({ campaign }) {
  const blocks = Array.isArray(campaign.content_json?.blocks) ? campaign.content_json.blocks : []
  const images = blocks.flatMap((block) => block.type === 'image' ? [block.src] : block.type === 'property' && Array.isArray(block.listings) ? block.listings.map((listing) => listing.image) : [])
  const source = images.find((url) => typeof url === 'string' && /^https?:\/\//i.test(url.trim()))?.trim()
  const [failedSource, setFailedSource] = useState('')
  return <span className="email-campaign-cover" aria-hidden="true">
    {source && source !== failedSource ? <img src={source} alt="" loading="lazy" onError={() => setFailedSource(source)} /> : <span className="email-mini-document"><span className="email-mini-header"><Mail size={13} /><span /></span><span className="email-mini-image" /><span className="email-mini-line" /><span className="email-mini-line email-mini-line-short" /><span className="email-mini-cta" /></span>}
  </span>
}
function Stats({ campaigns, performance }) { const t = performance.reduce((a, x) => ({ recipients: a.recipients + Number(x.recipients || 0), delivered: a.delivered + Number(x.delivered || 0), opened: a.opened + Number(x.opened || 0), clicked: a.clicked + Number(x.clicked || 0) }), { recipients: 0, delivered: 0, opened: 0, clicked: 0 }); const items = [[Send, campaigns.filter((c) => c.status === 'sent').length, 'Sent this month', 'Completed campaigns'], [UsersRound, fmt(t.recipients), 'Recipients', 'Unique send records'], [MailOpen, rate(t.opened, t.delivered), 'Open rate', 'Indicative, privacy affected'], [MousePointerClick, rate(t.clicked, t.delivered), 'Click rate', 'Delivered recipients']]; return <section className="wa-stats">{items.map(([Icon, value, label, detail]) => <article className="wa-stat email-stat" key={label}><span className="wa-stat-icon"><Icon size={19} /></span><span className="wa-stat-copy"><strong>{value}</strong><span>{label}</span><small>{detail}</small></span></article>)}</section> }
function HomepageStats({ campaigns, performance, loading, error }) {
  const totals = performance.reduce((sum, item) => ({
    recipients: sum.recipients + Number(item.recipients || 0),
    delivered: sum.delivered + Number(item.delivered || 0),
    opened: sum.opened + Number(item.opened || 0),
    clicked: sum.clicked + Number(item.clicked || 0),
  }), { recipients: 0, delivered: 0, opened: 0, clicked: 0 })
  const items = [
    [Send, 'Campaigns sent', fmt(campaigns.filter((campaign) => campaign.status === 'sent').length), 'Completed campaigns'],
    [MailOpen, 'Open rate', rate(totals.opened, totals.delivered), 'Indicative · privacy affected'],
    [UsersRound, 'Recipients', fmt(totals.recipients), 'Across all campaigns'],
    [ShieldCheck, 'Delivery rate', rate(totals.delivered, totals.recipients), 'Of campaign recipients'],
    [MousePointerClick, 'Click rate', rate(totals.clicked, totals.delivered), 'Of delivered emails'],
  ]
  return <section className="email-homepage-stats" aria-label="All-time campaign statistics" aria-busy={loading}>
    {items.map(([Icon, label, value, detail]) => <article className="email-homepage-stat" key={label}>
      <div className="email-stat-heading"><span>{label}</span><span className="email-homepage-stat-icon"><Icon size={17} aria-hidden="true" /></span></div>
      <strong>{loading ? '…' : error ? '—' : value}</strong>
      <small>{error ? 'Data unavailable' : detail}</small>
    </article>)}
  </section>
}
function TrustPanel({ identities, organisationId, onRefresh }) { const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const verified = identities.filter((identity) => identity.verification_status === 'verified').length; const refresh = async () => { setBusy(true); try { const result = await refreshEmailSenderVerification(organisationId); setNotice(`${result.verified} of ${result.checked} sender domains verified.`); await onRefresh() } catch (error) { setNotice(error.message || 'Unable to refresh sender status.') } finally { setBusy(false) } }; return <section className="email-trust-panel" id="deliverability"><div><span className="email-eyebrow">DELIVERABILITY CONTROL</span><h3>{verified ? 'Sender verified' : 'No verified sender'}</h3><p>{verified ? 'Your verified sender is ready for campaign delivery.' : 'Verify your sender domain to improve deliverability and ensure emails reach the inbox.'}</p></div><div className="email-trust-actions"><button type="button" className="wa-primary-button" disabled={busy || !identities.length} onClick={() => void refresh()}>{busy ? 'Checking…' : verified ? 'Recheck sender' : 'Check verification'}</button><details className="email-sender-help"><summary>About sender verification</summary><p>Sender domains must be configured and verified before sending. This check refreshes the verification status of your existing senders.</p></details>{!identities.length && <small>No sender configured yet. Add a sender in campaign setup.</small>}{notice && <small>{notice}</small>}</div></section> }
function UsagePanel({ usage, billingProfile }) {
  const now = new Date()
  const monthlyUsage = usage.filter((record) => {
    const date = new Date(record.created_at || record.sent_at || 0)
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  })
  const emails = monthlyUsage.reduce((sum, record) => sum + Number(record.recipient_count || 0), 0)
  const charged = monthlyUsage.reduce((sum, record) => sum + Number(record.wallet_charge || 0), 0)
  const currency = billingProfile?.currency || usage[0]?.pricing_snapshot?.currency || 'ZAR'
  const money = (amount) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(amount)
  const wallet = billingProfile?.wallet_balance ?? billingProfile?.walletBalance
  return <section className="email-usage-panel">
    <div className="email-usage-copy"><span className="email-eyebrow">USAGE & BILLING</span><h3>Wallet & usage</h3><p>This month’s email activity.</p></div>
    <div className="email-wallet-balance"><small>Wallet balance</small><strong>{wallet == null ? '—' : money(Number(wallet))}</strong>{wallet == null && <small>Balance unavailable</small>}</div>
    <div className="email-usage-metrics"><div><small>Emails sent</small><strong>{fmt(emails)}</strong></div><div><small>Campaign spend</small><strong>{money(charged)}</strong></div></div>
    <div className="email-usage-actions"><span className="email-coming-soon">Wallet top-ups & billing details coming soon</span>{!charged && <small>No charges have been applied yet.</small>}</div>
  </section>
}
function PerformanceOverview({ campaigns, performance, dailyPerformance, onOpenCampaign }) {
  const [metric, setMetric] = useState('delivered')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const end = new Date(`${today}T00:00:00Z`)
  const byDate = Object.fromEntries(dailyPerformance.map((day) => [String(day.metric_date || '').slice(0, 10), day]))
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - 29 + index)
    const key = date.toISOString().slice(0, 10)
    return { ...byDate[key], date: key, label: date.toLocaleDateString('en-ZA', { timeZone: 'UTC', day: 'numeric', month: 'short' }) }
  })
  const totals = performance.reduce((sum, item) => ({ recipients: sum.recipients + Number(item.recipients || 0), bounced: sum.bounced + Number(item.bounced || 0), unsubscribed: sum.unsubscribed + Number(item.unsubscribed || 0) }), { recipients: 0, bounced: 0, unsubscribed: 0 })
  const healthRate = (value) => totals.recipients ? `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 }).format(Number(value || 0) * 100 / totals.recipients)}%` : '—'
  const hasActivity = totals.recipients > 0 || dailyPerformance.some((day) => Number(day.recipients || day.sent || day.delivered || day.opened || day.clicked || 0) > 0)
  const labels = { delivered: 'Delivered', opened: 'Opens', clicked: 'Clicks' }
  const values = days.map((day) => Number(day[metric] || 0))
  const volume = values.reduce((sum, value) => sum + value, 0)
  const rawStep = Math.max(1, Math.max(...values) / 4)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = Math.ceil(rawStep / magnitude) * magnitude
  const ceiling = step * 4
  const selected = days.find((day) => day.date === selectedDate) || days[29]
  const top = campaigns
    .filter((campaign) => ['sent', 'sending', 'partially_failed'].includes(campaign.status))
    .map((campaign) => ({ campaign, metrics: performance.find((item) => item.campaign_id === campaign.id) || {} }))
    .filter(({ metrics }) => Number(metrics.delivered || 0) > 0)
    .sort((a, b) => Number(b.metrics.clicked || 0) / Number(b.metrics.delivered) - Number(a.metrics.clicked || 0) / Number(a.metrics.delivered))
    .slice(0, 3)
  return <section className="email-intelligence" aria-label="Performance intelligence">
    <div className="email-intelligence-heading"><div><span className="email-eyebrow">PERFORMANCE INTELLIGENCE</span><h3>See what connects with your audience</h3><p>Track delivery and engagement, then learn from your strongest campaigns.</p></div><span className="email-period">Last 30 days</span></div>
    {!hasActivity ? <div className="email-first-send"><span><MailOpen size={24} /></span><div><strong>Your first send starts the story</strong><p>Delivery, opens and clicks will appear here after your first campaign. For now, finish your draft and check your sender.</p></div></div> : <div className="email-performance-grid">
      <article className="email-trend-card" role="region" aria-label="Campaign trend">
        <div className="email-trend-toolbar"><div><small>{labels[metric]} · last 30 days</small><strong>{fmt(volume)}</strong></div><div className="email-metric-picker" aria-label="Graph metric">{Object.entries(labels).map(([value, label]) => <button type="button" aria-pressed={metric === value} onClick={() => setMetric(value)} key={value}>{label}</button>)}</div></div>
        {volume > 0 ? <div className="email-trend-plot"><span className="email-axis-caption">Number of recipients</span><svg viewBox="0 0 800 260" role="img" aria-label={`${labels[metric]} by send date over the last 30 days`}>
          {[0, 1, 2, 3, 4].map((tick) => { const y = 215 - tick * 46; return <g key={tick}><line x1="54" x2="780" y1={y} y2={y} className="email-chart-gridline" /><text x="43" y={y + 4} textAnchor="end" className="email-chart-tick">{fmt(tick * step)}</text></g> })}
          {days.map((day, index) => { const value = values[index]; const height = value / ceiling * 184; return <rect key={day.date} x={60 + index * 24} y={215 - height} width="14" height={height} rx="3" className={day.date === selected.date ? 'email-chart-bar email-chart-bar-selected' : 'email-chart-bar'}><title>{day.label}: {fmt(value)} {labels[metric].toLowerCase()}</title></rect> })}
          {[0, 7, 14, 21, 29].map((index) => <text key={index} x={67 + index * 24} y="244" textAnchor={index === 29 ? 'end' : 'middle'} className={`email-chart-tick ${[7, 21].includes(index) ? 'email-chart-tick-secondary' : ''}`}>{days[index].label}</text>)}
        </svg></div> : <div className="email-trend-empty"><MailOpen size={26} /><strong>No {labels[metric].toLowerCase()} in this period</strong><p>Choose another metric or check back after your next send.</p></div>}
        <div className="email-day-inspector"><label>Inspect send date<select aria-label="Inspect send date" value={selected.date} onChange={(event) => setSelectedDate(event.target.value)}>{days.map((day) => <option key={day.date} value={day.date}>{day.label}</option>)}</select></label><div aria-live="polite"><span><b>{fmt(selected.delivered)}</b> delivered</span><span><b>{fmt(selected.opened)}</b> opens</span><span><b>{fmt(selected.clicked)}</b> clicks</span></div></div>
        <small className="email-cohort-note">Results are grouped by the original send date. Opens and clicks can increase after that date.</small>
      </article>
      <article className="email-ranking-card"><span className="email-eyebrow">TOP PERFORMING CAMPAIGNS</span><h3>Campaigns by click rate</h3><p className="email-ranking-description">Your strongest campaigns across all sends.</p>{top.length ? <ol>{top.map(({ campaign, metrics }, index) => <li key={campaign.id}><button type="button" onClick={() => onOpenCampaign(campaign.id)}><CampaignThumbnail campaign={campaign} /><span className="email-ranking-copy"><small>#{index + 1} campaign</small><strong>{campaign.name || 'Untitled campaign'}</strong><span>{campaign.subject || campaign.preview_text || 'View campaign results'}</span><span className="email-ranking-result"><b>{rate(metrics.clicked, metrics.delivered)}</b> click rate · {fmt(metrics.clicked)} clicked</span></span><ChevronRight size={16} /></button></li>)}</ol> : <div className="email-ranking-empty">Rankings appear once a campaign has recorded deliveries.</div>}</article>
    </div>}
    <div className="email-health-strip" role="region" aria-label="All-time audience health"><div><span className="email-health-icon"><ShieldCheck size={18} /></span><span><small>Bounce rate · all time</small><strong>{healthRate(totals.bounced)}</strong><small>{fmt(totals.bounced)} bounced · of all recipients</small></span></div><div><span className="email-health-icon"><UsersRound size={18} /></span><span><small>Unsubscribes · all time</small><strong>{fmt(totals.unsubscribed)}</strong><small>{healthRate(totals.unsubscribed)} of all recipients</small></span></div></div>
    <small className="email-insight-note">Open rates are indicative, as privacy tools can affect open tracking.</small>
  </section>
}
function AudienceStudio({ audienceFilter, onChange, contacts, savedAudiences, organisationId, userId, onRefresh, setNotice, setError }) { const [audienceName, setAudienceName] = useState(''); const [saving, setSaving] = useState(false); const set = (key, value) => onChange({ ...audienceFilter, [key]: value }); const apply = (id) => { const audience = savedAudiences.find((item) => item.id === id); if (audience) { onChange(audience.filter_json || {}); setNotice(`Applied “${audience.name}”.`); } }; const save = async () => { setSaving(true); setError(''); try { await saveEmailAudience({ organisationId, userId, audience: { name: audienceName || 'Untitled audience', filterJson: audienceFilter } }); setAudienceName(''); setNotice('Audience saved for your agency. Consent and suppression remain live checks.'); await onRefresh() } catch (error) { setError(error.message || 'Unable to save this audience.') } finally { setSaving(false) } }; return <section className="email-audience-studio"><div className="email-template-heading"><span className="email-eyebrow"><SlidersHorizontal size={13} /> AUDIENCE BUILDER</span><p>Build a reusable CRM segment or choose individual contacts. Saved audiences never bypass consent, suppression or deduplication.</p></div><div className="email-template-actions"><select defaultValue="" onChange={(event) => { apply(event.target.value); event.target.value = '' }}><option value="">Apply a saved audience…</option>{savedAudiences.map((audience) => <option value={audience.id} key={audience.id}>{audience.name}</option>)}</select><input value={audienceName} onChange={(event) => setAudienceName(event.target.value)} placeholder="Save these filters as…" aria-label="Audience name" /><button type="button" className="wa-secondary-button" disabled={saving} onClick={() => void save()}><Save size={15} /> {saving ? 'Saving…' : 'Save audience'}</button></div><div className="email-audience-filters"><label className="wa-field-label"><span>Contact type</span><select value={audienceFilter.role_type || ''} onChange={(event) => set('role_type', event.target.value)}><option value="">Any contact type</option>{['lead', 'buyer', 'seller', 'landlord', 'tenant'].map((value) => <option value={value} key={value}>{value}s</option>)}</select></label><label className="wa-field-label"><span>Area</span><input value={audienceFilter.area || ''} onChange={(event) => set('area', event.target.value)} placeholder="e.g. Sandton" /></label><label className="wa-field-label"><span>Tag</span><input value={audienceFilter.tag || ''} onChange={(event) => set('tag', event.target.value)} placeholder="e.g. investor" /></label><label className="wa-field-label email-contact-picker"><span>Specific contacts <small>Optional</small></span><select multiple value={audienceFilter.contact_ids || []} onChange={(event) => set('contact_ids', [...event.target.selectedOptions].map((option) => option.value))}>{contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.full_name || contact.email} · {contact.email}</option>)}</select><small>Hold ⌘/Ctrl to select more than one.</small></label></div></section> }

export function EmailCampaignOverview({ onCreateCampaign, onOpenCampaign, selectedView, onViewChange }) {
  const [localView, setLocalView] = useState('overview')
  const requestedView = selectedView || localView
  const view = ['overview', 'past', 'audiences', 'settings'].includes(requestedView) ? requestedView : 'overview'
  const { loading, error, campaigns, performance, identities, usage, billingProfile, dailyPerformance, domains, userId, refresh, organisationId } = useCampaigns()
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  useEffect(() => { setTab('all'); setQuery('') }, [view])
  const selectView = (next) => { setLocalView(next); setTab('all'); setQuery(''); onViewChange?.(next) }
  const listCampaigns = view === 'past' ? campaigns.filter((campaign) => ['sent', 'failed', 'partially_failed', 'cancelled'].includes(campaign.status)) : campaigns
  const statuses = view === 'past' ? ['all', 'sent', 'failed', 'cancelled'] : ['all', 'draft', 'scheduled', 'sending', 'sent', 'failed']
  const metrics = useMemo(() => Object.fromEntries(performance.map((item) => [item.campaign_id, item])), [performance])
  const audience = (campaign) => campaign.audience_filter?.tag || campaign.audience_filter?.role_type || campaign.subscription_types?.name || 'All consented contacts'
  const matchesTab = (campaign, value) => value === 'all' || campaign.status === value || (value === 'failed' && campaign.status === 'partially_failed')
  const rows = listCampaigns.filter((campaign) => matchesTab(campaign, tab) && `${campaign.name} ${campaign.subject || ''} ${campaign.preview_text || ''} ${audience(campaign)}`.toLowerCase().includes(query.trim().toLowerCase()))
  const activity = (campaign) => {
    const label = campaign.sent_at ? 'Sent' : campaign.status === 'scheduled' && campaign.scheduled_for ? 'Scheduled' : 'Updated'
    const value = label === 'Sent' ? campaign.sent_at : label === 'Scheduled' ? campaign.scheduled_for : campaign.updated_at || campaign.created_at
    return { label, date: value ? new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No activity yet', time: value ? new Date(value).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '' }
  }
  return <div className="wa-page email-page email-landing">
    <header className="email-landing-heading">
      <div><h1>Email campaigns</h1></div>
      <button className="wa-primary-button" type="button" onClick={() => onCreateCampaign()}><Plus size={17} /> Create campaign</button>
    </header>
    <HomepageStats campaigns={campaigns} performance={performance} loading={loading} error={error} />
    <nav className="email-workspace-nav" aria-label="Email workspace">{[['overview', 'Overview'], ['past', 'Past campaigns'], ['audiences', 'Audiences'], ['settings', 'Settings']].map(([value, label]) => <button type="button" key={value} aria-current={view === value ? 'page' : undefined} onClick={() => selectView(value)}>{label}</button>)}</nav>
    {error && <p className="wa-error" role="alert">{error}</p>}
    {view === 'audiences' ? organisationId ? <div className="email-audiences-workspace"><ClientAudiences key={organisationId} organisationId={organisationId} userId={userId} /></div> : <p className="email-settings-empty">Choose an organisation to manage audiences.</p> : view === 'settings' ? <EmailCampaignSettings key={organisationId} organisationId={organisationId} userId={userId} domains={domains} identities={identities} loading={loading} error={error} onRefresh={refresh} /> : <div className="email-workspace-grid">
      <div className="email-workspace-main">
      <section className="email-campaigns-panel" aria-label="Campaigns">
        <div className="email-list-heading"><div><h2>{view === 'past' ? 'Past campaigns' : 'Your campaigns'} <span>{loading ? '…' : fmt(listCampaigns.length)}</span></h2><p>{view === 'past' ? 'Review completed campaigns and follow up on failed or cancelled sends.' : 'Pick up a draft or see how your latest send performed.'}</p></div><button className="wa-refresh" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh results'}</button></div>
        <div className="wa-tabs email-campaign-tabs" aria-label="Filter campaigns by status">{statuses.map((value) => <button type="button" aria-pressed={tab === value} className={tab === value ? 'wa-tab-active' : ''} onClick={() => setTab(value)} key={value}>{value === 'all' ? 'All campaigns' : value}<span>{loading ? '—' : listCampaigns.filter((campaign) => matchesTab(campaign, value)).length}</span></button>)}</div>
        <div className="email-list-toolbar"><label className="email-campaign-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns…" aria-label="Search campaigns" /></label><small aria-live="polite">{loading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'campaign' : 'campaigns'}`}</small></div>
        <div className="email-campaign-table-wrap">{loading ? <p className="wa-empty" role="status">Loading campaigns…</p> : error ? <p className="email-compact-empty">Campaigns could not be loaded. Refresh to try again.</p> : rows.length ? <div className="email-campaign-table">
          <div className="email-campaign-row email-campaign-header"><span>Campaign</span><span>Audience</span><span>Status</span><span>Activity</span><span>Results</span><span aria-label="Open" /></div>
          {rows.map((campaign) => {
            const metric = metrics[campaign.id] || {}
            const recent = activity(campaign)
            const draft = campaign.status === 'draft'
            return <button type="button" className="email-campaign-row" onClick={() => draft ? onCreateCampaign(campaign.id) : onOpenCampaign(campaign.id)} key={campaign.id}>
              <span className="email-campaign-name"><CampaignThumbnail campaign={campaign} /><span><strong>{campaign.name || 'Untitled campaign'}</strong><small>{campaign.preview_text || campaign.subject || 'Add a subject and preview text'}</small><small className="email-resume-draft">{draft ? 'Continue editing' : 'View campaign'} <ChevronRight size={12} /></small></span></span>
              <span className="email-table-audience"><strong>{audience(campaign)}</strong><small>{campaign.audience_filter?.area || 'All areas'}</small></span>
              <Status value={campaign.status} />
              <span className="email-table-activity"><small>{recent.label}</small><strong>{recent.date}</strong><small>{recent.time}</small></span>
              <span className="email-table-results">{draft ? <small>Not sent yet</small> : <><strong>{fmt(metric.recipients)} recipients</strong><small>{rate(metric.delivered, metric.recipients)} delivered</small><small>{rate(metric.opened, metric.delivered)} opens · {rate(metric.clicked, metric.delivered)} clicks</small></>}</span>
              <ChevronRight size={17} />
            </button>
          })}
        </div> : <div className="email-compact-empty"><span className="email-empty-icon"><Mail size={24} /></span><div><strong>{query.trim() ? 'No matching campaigns' : `No ${tab === 'all' ? view === 'past' ? 'past ' : '' : `${tab} `}campaigns yet`}</strong><p>{query.trim() ? 'Try a different search or choose another status.' : tab === 'all' ? view === 'past' ? 'Completed, failed and cancelled campaigns will appear here.' : 'Create your first campaign and turn your contacts into conversations.' : 'Campaigns with this status will appear here.'}</p></div>{(query.trim() || tab !== 'all') && <button className="email-text-button" type="button" onClick={() => { setQuery(''); setTab('all') }}>Clear filters</button>}</div>}</div>
      </section>
      {view === 'overview' && !loading && !error && <PerformanceOverview campaigns={campaigns} performance={performance} dailyPerformance={dailyPerformance} onOpenCampaign={onOpenCampaign} />}
      </div>
      {view === 'overview' && <aside className="email-support-grid" aria-label="Sending setup and usage">
        {loading ? <section className="email-sidebar-loading" role="status">Loading sender and wallet…</section> : error ? <section className="email-sidebar-loading">Sender and wallet information unavailable. Refresh to try again.</section> : <><TrustPanel identities={identities} organisationId={organisationId} onRefresh={refresh} /><UsagePanel usage={usage} billingProfile={billingProfile} /></>}
      </aside>}
    </div>}
  </div>
}

export function CreateEmailCampaign({ onBack, campaignId, onDraftCreated }) {
  const workspace = useCampaigns()
  return <EmailCampaignBuilder workspace={workspace} AudienceStudio={AudienceStudio} onBack={onBack} campaignId={campaignId} onDraftCreated={onDraftCreated} />
}

export function EmailCampaignDetail({ campaignId, onBack, onEdit }) { const { campaigns, performance, refresh } = useCampaigns(); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [operationBusy, setOperationBusy] = useState(false); const [report, setReport] = useState({ loading: true, recipients: [], events: [], links: [], audit: [] }); const [query, setQuery] = useState(''); const c = campaigns.find((x) => x.id === campaignId); const m = performance.find((x) => x.campaign_id === campaignId) || {}; const loadReport = async () => { const data = await getEmailCampaignAnalytics(campaignId); setReport({ loading: false, ...data }) }; useEffect(() => { let active = true; void getEmailCampaignAnalytics(campaignId).then((data) => { if (active) setReport({ loading: false, ...data }) }).catch((cause) => { if (active) { setError(cause.message || 'Unable to load campaign activity.'); setReport((current) => ({ ...current, loading: false })) } }); return () => { active = false } }, [campaignId]); const run = async (action) => { setOperationBusy(true); setError(''); try { const message = await action(); setNotice(message); await refresh(); await loadReport() } catch (e) { setError(e.message || 'Campaign operation failed.') } finally { setOperationBusy(false) } }; const cancel = () => run(async () => { await cancelEmailCampaign(campaignId); return 'Scheduled campaign cancelled.' }); const duplicate = () => run(async () => { await duplicateEmailCampaign(campaignId); return 'A draft copy was created.' }); const archive = () => run(async () => { await archiveEmailCampaign(campaignId); return 'Campaign archived.' }); const preflight = () => run(async () => { const result = await preflightEmailCampaign(campaignId); return result.ready ? `Preflight passed for ${fmt(result.eligible_recipients)} eligible recipients.` : 'Preflight found a blocking issue. Review sender, consent category, policy and audience.' }); const rows = report.recipients.filter((recipient) => `${recipient.email} ${recipient.recipient_snapshot?.full_name || ''} ${recipient.status}`.toLowerCase().includes(query.toLowerCase())); if (!c) return <div className="wa-page email-page"><button className="wa-back-link" type="button" onClick={onBack}><ArrowLeft size={15} /> Email Campaigns</button><p className="wa-empty">Loading campaign…</p></div>; return <div className="wa-page email-page"><button className="wa-back-link" type="button" onClick={onBack}><ArrowLeft size={15} /> Email Campaigns</button><section className="wa-form-card"><div className="wa-card-heading"><span>CAMPAIGN PERFORMANCE</span><h2>{c.name}</h2><p>{c.subject}</p><Status value={c.status} /></div><Stats campaigns={[c]} performance={[m]} /><div className="email-operations">{c.status === 'draft' && <button type="button" className="wa-primary-button" onClick={() => onEdit(c.id)}>Continue editing</button>}<button type="button" className="wa-secondary-button" disabled={operationBusy} onClick={() => void preflight()}><ShieldCheck size={15} /> Run preflight</button><button type="button" className="wa-secondary-button" disabled={operationBusy} onClick={() => void duplicate()}><Copy size={15} /> Duplicate</button>{['draft', 'sent', 'partially_failed', 'failed', 'cancelled'].includes(c.status) && <button type="button" className="wa-secondary-button" disabled={operationBusy} onClick={() => void archive()}><Archive size={15} /> Archive</button>}</div><div className="email-review"><div><span>Recipients</span><strong>{fmt(m.recipients)}</strong></div><div><span>Bounced</span><strong>{fmt(m.bounced)}</strong></div><div><span>Unsubscribed</span><strong>{fmt(m.unsubscribed)}</strong></div><div><span>Failed</span><strong>{fmt(m.failed)}</strong></div></div>{report.links.length > 0 && <section className="email-report-section"><div className="email-report-heading"><div><span className="email-eyebrow">LINK PERFORMANCE</span><h3>What recipients clicked</h3></div><small>Unique clickers are deduplicated by recipient.</small></div><div className="email-link-list">{report.links.map((link) => <article key={link.target_url}><a href={link.target_url} target="_blank" rel="noreferrer">{link.target_url}</a><strong>{fmt(link.unique_clickers)} unique · {fmt(link.clicks)} clicks</strong></article>)}</div></section>}<section className="email-report-section"><div className="email-report-heading"><div><span className="email-eyebrow">RECIPIENT ACTIVITY</span><h3>Delivery-level evidence</h3></div><label className="email-activity-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or status" /></label></div>{report.loading ? <p className="wa-empty">Loading recipient activity…</p> : <div className="email-activity-table"><div className="email-activity-row email-activity-head"><span>Recipient</span><span>Status</span><span>Latest activity</span><span>Detail</span></div>{rows.map((recipient) => { const event = report.events.find((item) => item.recipient_id === recipient.id); return <div className="email-activity-row" key={recipient.id}><span><strong>{recipient.recipient_snapshot?.full_name || recipient.email}</strong><small>{recipient.email}</small></span><Status value={recipient.status} /><span>{event ? `${event.event_type} · ${new Date(event.occurred_at).toLocaleString()}` : 'No provider event yet'}</span><span>{recipient.error_reason || (event?.url ? 'Tracked link activity' : '—')}</span></div> })}{!rows.length && <p className="wa-empty">No recipients match that search.</p>}</div>}</section>{report.audit.length > 0 && <section className="email-report-section"><div className="email-report-heading"><div><span className="email-eyebrow">CAMPAIGN LOG</span><h3>Operational audit trail</h3></div></div><div className="email-audit-list">{report.audit.map((event) => <p key={event.id}><strong>{event.event_type.replace('_', ' ')}</strong><span>{new Date(event.created_at).toLocaleString()}</span></p>)}</div></section>}{error && <p className="wa-error">{error}</p>}{notice && <p className="wa-notice">{notice}</p>}{c.status === 'scheduled' && <div className="wa-form-footer"><button type="button" className="wa-secondary-button" disabled={operationBusy} onClick={() => void cancel()}>Cancel scheduled campaign</button></div>}</section></div> }
