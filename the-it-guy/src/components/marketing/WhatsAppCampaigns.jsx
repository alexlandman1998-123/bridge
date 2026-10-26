import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CircleAlert, Plus, Check, CheckCircle2, ChevronRight, Eye, MessageCircle, RefreshCw, Search, Send, UsersRound, Circle, Save, ShieldCheck, Smartphone } from 'lucide-react'
import WhatsAppAudiences, { CampaignAudiencePicker } from './WhatsAppAudiences'
import { useAuthSession } from '../../context/AuthSessionContext'
import { whatsappCampaignRequest } from '../../services/whatsappCampaignService'
import { buildTemplateMessage, MAX_CAMPAIGN_RECIPIENTS, previewTemplate, resolveValue, templateFields, templateIdentity } from '../../../../supabase/functions/_shared/whatsappCampaign.js'

import './WhatsAppCampaignLanding.css'
import './WhatsAppCampaignBuilder.css'

const STEPS = ['Campaign', 'Audience', 'Message', 'Review']
const EMPTY = { campaigns: [], contacts: [], senders: [] }
const fmt = (value) => Number(value || 0).toLocaleString()
const date = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const localDateInput = (value) => { const d = new Date(value); return Number.isFinite(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' }
const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const statusLabel = (value) => ({ needs_attention: 'Needs attention', partial: 'Partially sent', processing: 'Sending', unknown: 'Unconfirmed' }[value] || value)
function useOrg() {
  const { authState } = useAuthSession()
  return String(authState?.currentWorkspace?.id || authState?.currentMembership?.workspaceId || authState?.currentMembership?.workspace_id || '')
}
function useCampaignScope(org) {
  const { authState } = useAuthSession()
  const member = authState?.currentMembership || {}
  const roles = [member.role, member.workspaceRole, member.workspace_role, member.organisationRole, member.organisation_role, member.status, member.membershipStatus].filter(Boolean).join('|')
  return `${org}:${authState?.user?.id || ''}:${roles}`
}
function useWorkspace(org) {
  const scope = useCampaignScope(org)
  const [state, setState] = useState({ ...EMPTY, scope: '', loading: true, error: '' })
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    if (!org) { setState({ ...EMPTY, scope, loading: false, error: 'Choose an organisation workspace to use WhatsApp campaigns.' }); return }
    setState((s) => ({ ...(s.scope === scope ? s : EMPTY), scope, loading: true, error: '' }))
    try {
      const data = await whatsappCampaignRequest(org, 'workspace')
      if (generation.current === request) setState({ ...data, scope, loading: false, error: '' })
    } catch (error) {
      if (generation.current === request) setState({ ...EMPTY, scope, loading: false, error: error.message })
    }
  }, [org, scope])
  const invalidate = useCallback(() => { generation.current++ }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => { window.clearTimeout(timer); invalidate() }
  }, [refresh, invalidate])
  return { ...(state.scope === scope ? state : { ...EMPTY, loading: true, error: '' }), accessScope: scope, refresh }
}
function Status({ value }) { return <span className={`wa-status wa-status-${value} wa-status-${value === 'sent' || value === 'read' || value === 'delivered' ? 'sent' : 'draft'}`}>{statusLabel(value)}</span> }
function ErrorNotice({ children }) { return children ? <p className="wa-error" role="alert">{children}</p> : null }
function SenderNotice({ senders }) {
  return !senders.some((s) => s.connection_status === 'connected') ? <aside className="wa-notice"><strong>Connect a WhatsApp Business sender</strong><p>You can prepare and save drafts now. Connect your business account in integration settings before sending.</p><a href="/settings/integrations/whatsapp">Set up connection</a> · <a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noreferrer">Open WhatsApp Manager</a></aside> : null
}
const campaignRate = (count, total) => total > 0 ? `${(Number(count || 0) / total * 100).toFixed(1)}%` : '—'
const campaignTotals = (campaigns) => campaigns.reduce((totals, campaign) => {
  for (const key of ['recipients', 'delivered', 'read', 'failed', 'skipped']) totals[key] += Number(campaign[key] || 0)
  return totals
}, { recipients: 0, delivered: 0, read: 0, failed: 0, skipped: 0 })

function LandingStats({ campaigns, loading, error }) {
  const totals = campaignTotals(campaigns)
  const cards = [
    [Send, 'Campaigns sent', fmt(campaigns.filter((c) => ['sent', 'partial'].includes(c.display_status)).length), 'Completed and partially sent campaigns'],
    [CheckCircle2, 'Delivery rate', campaignRate(totals.delivered, totals.recipients), 'Delivered messages / recipients'],
    [Eye, 'Read rate', campaignRate(totals.read, totals.delivered), 'Read messages / delivered messages'],
    [UsersRound, 'Recipients', fmt(totals.recipients), 'Recipients across campaigns'],
    [CircleAlert, 'Failed messages', fmt(totals.failed), 'Messages with a confirmed failure'],
  ]
  return <section className="email-homepage-stats" aria-label="WhatsApp campaign performance">{cards.map(([Icon, label, value, note]) => <article className="email-homepage-stat" key={label}><div className="email-stat-heading"><span>{label}</span><span className="email-homepage-stat-icon"><Icon size={18} /></span></div><strong>{loading || error ? '—' : value}</strong><small>{loading ? 'Loading campaign results…' : error ? 'Results unavailable' : `${note} · all time`}</small></article>)}</section>
}

function WhatsAppPerformance({ campaigns }) {
  const [metric, setMetric] = useState('delivered')
  const labels = { delivered: 'Delivered', read: 'Read', failed: 'Failed' }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const end = new Date(`${today}T00:00:00Z`)
  const days = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(end)
    day.setUTCDate(end.getUTCDate() - 29 + index)
    return { date: day.toISOString().slice(0, 10), label: day.toLocaleDateString('en-ZA', { timeZone: 'UTC', month: 'short', day: 'numeric' }), delivered: 0, read: 0, failed: 0 }
  })
  const byDate = Object.fromEntries(days.map((day) => [day.date, day]))
  const recent = campaigns.filter((campaign) => {
    if (!campaign.sent_at) return false
    const sent = new Date(campaign.sent_at)
    if (!Number.isFinite(sent.getTime())) return false
    const day = byDate[new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(sent)]
    if (!day) return false
    for (const key of Object.keys(labels)) day[key] += Number(campaign[key] || 0)
    return true
  })
  const totals = campaignTotals(recent)
  const ceiling = Math.max(1, ...days.map((day) => day[metric]))
  return <section className="email-performance-panel wa-landing-performance" aria-label="WhatsApp performance intelligence">
    <div className="email-list-heading"><div><span className="email-eyebrow">PERFORMANCE INTELLIGENCE</span><h2>See how your messages perform</h2><p>Delivery and engagement for campaigns sent in the last 30 days.</p></div><span className="wa-landing-period">Last 30 days</span></div>
    <dl className="wa-landing-metrics">{[['Recipients', totals.recipients], ['Delivered', totals.delivered], ['Read', totals.read], ['Failed', totals.failed]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{fmt(value)}</dd></div>)}</dl>
    <div className="wa-landing-chart-tabs" aria-label="Chart metric">{Object.entries(labels).map(([value, label]) => <button type="button" key={value} aria-pressed={metric === value} onClick={() => setMetric(value)}>{label}</button>)}</div>
    {recent.length ? <div className="wa-landing-chart"><svg viewBox="0 0 900 210" role="img" aria-label={`${labels[metric]} messages grouped by campaign send date over the last 30 days`}><text x="0" y="18">{fmt(ceiling)}</text><text x="0" y="185">0</text>{[25, 105, 185].map((y) => <line key={y} x1="48" x2="895" y1={y} y2={y} className="wa-chart-grid" />)}{days.map((day, index) => <rect key={day.date} x={54 + index * 28} y={185 - day[metric] / ceiling * 160} width="16" height={day[metric] / ceiling * 160} rx="3"><title>{day.label}: {fmt(day[metric])} {labels[metric].toLowerCase()} messages</title></rect>)}{[0, 7, 14, 21, 29].map((index) => <text key={index} x={54 + index * 28} y="208" textAnchor={index === 29 ? 'end' : 'start'}>{days[index].label}</text>)}</svg></div> : <div className="email-compact-empty"><span className="email-empty-icon"><MessageCircle size={24} /></span><div><strong>Your results start with your first send</strong><p>Delivery and read results will appear here once a campaign is sent.</p></div></div>}
    <small className="wa-landing-note">Results are grouped by the campaign’s send date, rather than the date each message was delivered or read.</small>
  </section>
}

function WhatsAppSendingSetup({ senders, loading, error }) {
  const connected = senders.filter((sender) => sender.connection_status === 'connected')
  return <section className="email-trust-panel"><span className="email-eyebrow">SENDING SETUP</span><h3>{connected.length ? 'WhatsApp Business connected' : 'Connect your business sender'}</h3>{loading ? <p>Loading sender information…</p> : error ? <p>Sender information is unavailable. Refresh to try again.</p> : <><p>{connected.length ? 'Your connected senders can use approved WhatsApp templates.' : 'An administrator can connect your WhatsApp Business sender. You can prepare drafts while setup is pending.'}</p>{senders.map((sender) => <div className="wa-landing-sender" key={sender.id}><div><strong>{sender.business_display_name || 'WhatsApp Business'}</strong><small>{sender.display_phone_number || 'Phone number pending'}</small></div><span className={`wa-status wa-status-${sender.connection_status === 'connected' ? 'sent' : 'draft'}`}>{sender.connection_status || 'Not connected'}</span></div>)}<a className="wa-secondary-button" href="https://business.facebook.com/wa/manage/" target="_blank" rel="noreferrer">Open WhatsApp Manager <ChevronRight size={15} /></a></>}</section>
}

export function WhatsAppCampaignOverview({ onCreateCampaign, onOpenCampaign, selectedView, onViewChange }) {
  const org = useOrg()
  const { campaigns, contacts, senders, loading, error, refresh } = useWorkspace(org)
  const [localView, setLocalView] = useState('overview')
  const view = ['overview', 'past', 'audiences', 'settings'].includes(selectedView || localView) ? selectedView || localView : 'overview'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [days, setDays] = useState('all')
  const [page, setPage] = useState(1)
  useEffect(() => { setSearch(''); setStatus('all'); setPage(1) }, [view, org])
  const selectView = (next) => { setLocalView(next); onViewChange?.(next) }
  const terminal = ['sent', 'partial', 'failed', 'needs_attention', 'cancelled']
  const listed = view === 'past' ? campaigns.filter((c) => terminal.includes(c.display_status)) : campaigns
  const filtered = listed.filter((c) => String(c.name || '').toLowerCase().includes(search.trim().toLowerCase()) && (status === 'all' || c.display_status === status) && (days === 'all' || new Date(c.sent_at || c.created_at).getTime() >= Date.now() - Number(days) * 86400000))
  const pages = Math.max(1, Math.ceil(filtered.length / 10))
  const currentPage = Math.min(page, pages)
  const statuses = view === 'past' ? ['all', ...terminal] : ['all', 'draft', 'scheduled', 'sending', 'paused', 'sent', 'partial', 'failed', 'needs_attention', 'cancelled']
  const unavailable = loading || error
  return <div className="wa-page wa-live email-page email-landing whatsapp-landing">
    <header className="email-landing-heading"><h1>WhatsApp campaigns</h1><button type="button" className="wa-primary-button" disabled={!org} onClick={() => onCreateCampaign()}><Plus size={17} />Create campaign</button></header>
    <LandingStats campaigns={campaigns} loading={loading} error={error} />
    <nav className="email-workspace-nav" aria-label="WhatsApp workspace">{[['overview', 'Overview'], ['past', 'Past campaigns'], ['audiences', 'Audiences'], ['settings', 'Settings']].map(([value, label]) => <button type="button" key={value} aria-current={view === value ? 'page' : undefined} onClick={() => selectView(value)}>{label}</button>)}</nav>
    <ErrorNotice>{error}</ErrorNotice>
    {view === 'audiences' ? loading ? <p role="status">Loading contacts…</p> : !error && <><WhatsAppAudiences/><ContactManager key={org} org={org} contacts={contacts} onSaved={refresh} /></> : view === 'settings' ? <div className="email-support-grid"><WhatsAppSendingSetup senders={senders} loading={loading} error={error} /><section className="email-usage-panel"><span className="email-eyebrow">MESSAGE TEMPLATES</span><h3>Approved messages, ready to send</h3><p>Manage your templates in WhatsApp Manager, then choose an approved template and language when creating a campaign.</p><p>Your sender, template, recipient permission and message values are checked before sending.</p></section></div> : <>
      <section className="email-campaigns-panel" aria-label="Campaigns">
        <div className="email-list-heading"><div><h2>{view === 'past' ? 'Past campaigns' : 'Your campaigns'} <span>{unavailable ? '—' : fmt(listed.length)}</span></h2><p>{view === 'past' ? 'Review completed campaigns and sends that need attention.' : 'Pick up a draft or see how your latest message performed.'}</p></div><button className="wa-refresh" type="button" disabled={loading} onClick={refresh}><RefreshCw size={14} />{loading ? 'Refreshing…' : 'Refresh results'}</button></div>
        <div className="wa-tabs email-campaign-tabs" aria-label="Campaign status">{statuses.map((value) => <button type="button" className={status === value ? 'wa-tab-active' : ''} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1) }} key={value}>{value === 'all' ? 'All campaigns' : statusLabel(value)}<span aria-hidden="true">{unavailable ? '—' : listed.filter((c) => value === 'all' || c.display_status === value).length}</span></button>)}</div>
        <div className="email-list-toolbar"><label className="email-campaign-search"><Search size={16} /><input aria-label="Search campaigns" type="search" placeholder="Search campaigns…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label><select className="wa-filter-control" aria-label="Campaign period" value={days} onChange={(event) => { setDays(event.target.value); setPage(1) }}><option value="all">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></div>
        <div className="email-campaign-table-wrap">
          {loading ? <p className="email-compact-empty" role="status">Loading campaigns…</p> : error ? <p className="email-compact-empty">Campaigns could not be loaded. Refresh to try again.</p> : filtered.length ? <div className="email-campaign-table"><div className="email-campaign-row email-campaign-header"><span>Campaign</span><span>Audience</span><span>Status</span><span>Activity</span><span>Results</span><span aria-label="Open" /></div>{filtered.slice((currentPage - 1) * 10, currentPage * 10).map((campaign) => {
            const draft = campaign.status === 'draft'
            const header = campaign.template?.components?.find((component) => component.type === 'HEADER')
            const preview = header?.example?.header_handle?.[0]
            return <button type="button" className="email-campaign-row" key={campaign.id} onClick={() => draft ? onCreateCampaign(campaign.id) : onOpenCampaign(campaign.id)}>
              <span className="email-campaign-name"><span className="email-campaign-cover wa-landing-cover">{header?.format === 'IMAGE' && /^https:\/\//i.test(preview || '') ? <img src={preview} alt="" loading="lazy" /> : <MessageCircle size={28} />}<span className="wa-landing-cover-label">WhatsApp</span></span><span><strong>{campaign.name || 'Untitled campaign'}</strong><small>{campaign.template?.name || 'Choose an approved template'}</small><small className="email-resume-draft">{draft ? 'Continue editing' : 'View results'} <ChevronRight size={12} /></small></span></span>
              <span className="email-table-audience"><strong>{fmt(draft ? campaign.contact_ids?.length : campaign.recipients)} recipients</strong><small>{campaign.template?.language || 'Language not selected'}</small></span>
              <Status value={campaign.display_status} />
              <span className="email-table-activity"><small>{draft ? 'Draft updated' : campaign.display_status === 'scheduled' ? 'Scheduled for' : 'Sending started'}</small><strong>{date(draft ? campaign.updated_at || campaign.created_at : campaign.display_status === 'scheduled' ? campaign.scheduled_at : campaign.sent_at)}</strong></span>
              <span className="email-table-results">{draft ? <small>Not sent yet</small> : <><strong>{fmt(campaign.delivered)} delivered</strong><small>{fmt(campaign.read)} read · {fmt(campaign.failed)} failed</small><small>{fmt(campaign.skipped)} skipped{campaign.uncertain > 0 ? ` · ${fmt(campaign.uncertain)} unconfirmed` : ''}</small></>}</span><ChevronRight size={17} />
            </button>
          })}</div> : <div className="email-compact-empty"><span className="email-empty-icon"><MessageCircle size={24} /></span><div><strong>{search || status !== 'all' || days !== 'all' ? 'No matching campaigns' : view === 'past' ? 'No past campaigns yet' : 'Your first campaign starts here'}</strong><p>{search || status !== 'all' || days !== 'all' ? 'Try another search or filter.' : view === 'past' ? 'Completed campaigns and sends needing attention will appear here.' : 'Add your contacts, choose an approved template and save your first draft.'}</p></div></div>}
        </div>
        <footer className="wa-list-footer wa-landing-pagination"><span>{unavailable ? 'Results unavailable' : filtered.length ? `Showing ${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, filtered.length)} of ${filtered.length}` : '0 campaigns'}</span><div className="wa-inline-actions"><button className="wa-secondary-button" disabled={loading || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pages}</span><button className="wa-secondary-button" disabled={loading || currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>
      </section>
      {view === 'overview' && !loading && !error ? <WhatsAppPerformance campaigns={campaigns} /> : null}
      {view === 'overview' ? <aside className="email-support-grid" aria-label="WhatsApp sending setup and audience"><WhatsAppSendingSetup senders={senders} loading={loading} error={error} /><section className="email-usage-panel"><span className="email-eyebrow">AUDIENCE & PERMISSION</span><h3>Reach people who want to hear from you</h3><dl className="wa-landing-metrics"><div><dt>Contacts</dt><dd>{unavailable ? '—' : fmt(contacts.length)}</dd></div><div><dt>Opted in</dt><dd>{unavailable ? '—' : fmt(contacts.filter((contact) => contact.consent_status === 'opted_in').length)}</dd></div></dl><p>WhatsApp permission is recorded separately from email subscriptions.</p><button className="wa-secondary-button" type="button" onClick={() => selectView('audiences')}><UsersRound size={16} />Manage contacts</button></section></aside> : null}
    </>}
  </div>
}

function ContactManager({ org, contacts, onSaved }) {
  const [form, setForm] = useState({ full_name: '', phone: '', consent_status: 'unknown', consent_source: '', consent_at: '', confirmed: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [crm, setCrm] = useState(null)
  const loadCrm = async () => { setBusy(true); setError(''); try { const data = await whatsappCampaignRequest(org, 'crm_contacts'); setCrm(data.contacts) } catch (err) { setError(err.message) } finally { setBusy(false) } }
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const { contact } = await whatsappCampaignRequest(org, 'save_contact', { contact: { ...form, consent_at: form.consent_at ? new Date(form.consent_at).toISOString() : '' } })
      await onSaved(contact); setNotice('Contact saved.'); setForm({ full_name: '', phone: '', consent_status: 'unknown', consent_source: '', consent_at: '', confirmed: false })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const optOut = async (id) => {
    setBusy(true); setError('')
    try { await whatsappCampaignRequest(org, 'opt_out', { contactId: id }); await onSaved(); setNotice('Contact opted out. Queued messages will be skipped.') } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section className="wa-form-card wa-contact-manager"><h2>WhatsApp contacts & permission</h2><p>Record permission given by the recipient. An email subscription alone does not count as WhatsApp permission.</p><div className="wa-inline-actions"><button className="wa-secondary-button" disabled={busy} onClick={loadCrm}>Choose from CRM contacts</button>{crm && <label className="wa-field-label"><span>Copy contact details</span><select defaultValue="" onChange={(e) => { const c = crm.find((row) => row.contact_id === e.target.value); if (c) setForm({ full_name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), phone: c.phone || '', consent_status: 'unknown', consent_source: '', consent_at: '', confirmed: false }); e.target.value = '' }}><option value="">Select a CRM contact</option>{crm.filter((c) => c.phone).map((c) => <option value={c.contact_id} key={c.contact_id}>{c.first_name} {c.last_name} · {c.phone}</option>)}</select><small>Only name and phone are copied. Record WhatsApp permission separately.</small></label>}</div><form onSubmit={save}><fieldset disabled={busy} className="wa-fieldset"><div className="wa-field-grid"><label className="wa-field-label"><span>Full name</span><input required maxLength={200} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></label><label className="wa-field-label"><span>Mobile number</span><input required type="tel" placeholder="+27 82 123 4567" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label><label className="wa-field-label"><span>WhatsApp permission</span><select value={form.consent_status} onChange={(e) => set('consent_status', e.target.value)}><option value="unknown">Not recorded — cannot receive campaigns</option><option value="opted_in">Recipient opted in</option></select></label></div>{form.consent_status === 'opted_in' && <><div className="wa-field-grid"><label className="wa-field-label"><span>How was permission given?</span><input required maxLength={1000} placeholder="e.g. Buyer registration form, reference 123" value={form.consent_source} onChange={(e) => set('consent_source', e.target.value)} /></label><label className="wa-field-label"><span>When was permission given? (local time)</span><input required type="datetime-local" value={form.consent_at} onChange={(e) => set('consent_at', e.target.value)} /></label></div><label className="wa-checkbox"><input type="checkbox" required checked={form.confirmed} onChange={(e) => set('confirmed', e.target.checked)} />The recipient agreed to receive WhatsApp messages from this business, including the campaigns I will send.</label></>}<button className="wa-primary-button" type="submit">{busy ? 'Saving…' : 'Save contact'}</button></fieldset></form><ErrorNotice>{error}</ErrorNotice>{notice && <p role="status">{notice}</p>}<label className="wa-field-label"><span>Find a contact</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label><div className="wa-contact-list">{contacts.filter((c) => `${c.full_name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())).map((c) => <div className="wa-contact-row" key={c.id}><span><strong>{c.full_name}</strong><small>+{c.phone} · {c.consent_status.replaceAll('_', ' ')}{c.consent_at ? ` · ${date(c.consent_at)}` : ''}</small></span>{c.consent_status === 'opted_in' && <button className="wa-secondary-button" disabled={busy} onClick={() => optOut(c.id)}>Record opt-out</button>}</div>)}</div></section>
}

export function CreateWhatsAppCampaign({ campaignId, onBack, onDraftCreated, developmentContext }) {
  const org = useOrg()
  const workspace = useWorkspace(org)
  const initial = campaignId ? workspace.campaigns.find((c) => c.id === campaignId) : null
  if (!org || (workspace.loading && !workspace.campaigns.length && !workspace.senders.length && !workspace.contacts.length)) return <div className="wa-page wa-live"><ErrorNotice>{workspace.error}</ErrorNotice><p>{org ? 'Loading campaign workspace…' : 'Choose an organisation workspace.'}</p><button onClick={onBack}>Back</button></div>
  if (workspace.error || (campaignId && !initial)) return <div className="wa-page wa-live"><ErrorNotice>{workspace.error || 'Campaign not found in this organisation.'}</ErrorNotice><button onClick={workspace.refresh}>Try again</button><button onClick={onBack}>Back</button></div>
  if (initial && initial.status !== 'draft') return <div className="wa-page wa-live"><p>This campaign has already started and can no longer be edited.</p><button onClick={onBack}>Back to campaigns</button></div>
  return <CampaignEditor key={`${workspace.accessScope}:${campaignId || 'new'}`} org={org} initial={initial} workspace={workspace} onBack={onBack} onDraftCreated={onDraftCreated} developmentContext={developmentContext} />
}
function CampaignEditor({ org, initial, workspace, onBack, onDraftCreated, developmentContext }) {
  const [draft, setDraft] = useState(() => initial || { client_id: crypto.randomUUID(), name: developmentContext ? `${developmentContext.development_name} campaign` : '', sender_id: '', template: {}, parameter_values: developmentContext ? { __arch9_context: developmentContext } : {}, contact_ids: [] })
  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState([])
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [templateRefresh, setTemplateRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [manage, setManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [sendLater, setSendLater] = useState(Boolean(initial?.scheduled_at))
  const [preflight, setPreflight] = useState(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true
    setTemplates([]); setTemplateError('')
    if (!draft.sender_id) { setTemplateLoading(false); return () => { active = false } }
    setTemplateLoading(true)
    whatsappCampaignRequest(org, 'templates', { senderId: draft.sender_id }).then((data) => { if (active) setTemplates(data.templates) }).catch((err) => { if (active) setTemplateError(err.message) }).finally(() => { if (active) setTemplateLoading(false) })
    return () => { active = false }
  }, [org, draft.sender_id, templateRefresh])
  const update = (fields) => { setDraft((d) => ({ ...d, ...fields })); setPreflight(null); setConfirmed(false); setNotice('') }
  const selected = workspace.contacts.filter((c) => draft.contact_ids.includes(c.id))
  const eligible = workspace.contacts.filter((c) => c.consent_status === 'opted_in' && !c.opted_out_at)
  const { fields, unsupported } = templateFields(draft.template)
  const validation = () => {
    if (!draft.name.trim()) return 'Add a campaign name.'
    if (sendLater && (!draft.scheduled_at || new Date(draft.scheduled_at).getTime() <= Date.now())) return 'Choose a future sending time.'
    if (!draft.sender_id) return 'Choose a connected sender.'
    if (!selected.length || selected.length !== draft.contact_ids.length) return 'Choose your recipients.'
    if (selected.some((c) => c.consent_status !== 'opted_in' || c.opted_out_at)) return 'Remove recipients without current WhatsApp permission.'
    try { selected.forEach((c) => buildTemplateMessage(draft.template, draft.parameter_values, c)); return '' } catch (err) { return err.message }
  }
  const save = async () => {
    const { campaign } = await whatsappCampaignRequest(org, 'save', { campaign: draft })
    if (alive.current) setDraft(campaign)
    return campaign
  }
  const saveOnly = async () => {
    setBusy(true); setError(''); setPreflight(null); setConfirmed(false)
    try { const row = await save(); setNotice('Draft saved.'); onDraftCreated?.(row.id) } catch (err) { setError(err.message) } finally { if (alive.current) setBusy(false) }
  }
  const check = async () => {
    const invalid = validation(); if (invalid) { setError(invalid); return }
    setBusy(true); setError(''); setPreflight(null); setConfirmed(false)
    try { const row = await save(); const checked = await whatsappCampaignRequest(org, 'preflight', { campaignId: row.id, revision: row.revision }); if (alive.current) setPreflight(checked) } catch (err) { setError(err.message) } finally { if (alive.current) setBusy(false) }
  }
  const send = async () => {
    if (!confirmed || !preflight || busy) return
    setBusy(true); setError('')
    try {
      await whatsappCampaignRequest(org, 'prepare', { campaignId: draft.id, revision: preflight.revision })
      if (alive.current) { setPreflight(null); onBack() }
    } catch (err) { if (alive.current) { setError(`${err.message} Reopen campaign results to check whether it was queued.`); setPreflight(null) } } finally { if (alive.current) setBusy(false) }
  }
  const toggle = (id) => { const ids=draft.contact_ids.includes(id)?draft.contact_ids.filter(c=>c!==id):[...draft.contact_ids,id]; const plan=draft.audience_plan;update({contact_ids:ids,...(plan?.audienceId?{audience_plan:plan.targets.some(row=>row.contactId===id)?{...plan,targets:plan.targets.filter(row=>ids.includes(row.contactId))}:null}:{})}) }
  const sender = workspace.senders.find((item) => item.id === draft.sender_id)
  const connected = sender?.connection_status === 'connected'
  const permissionReady = selected.length > 0 && selected.length === draft.contact_ids.length && selected.every((contact) => contact.consent_status === 'opted_in' && !contact.opted_out_at)
  const approved = draft.template?.status === 'APPROVED' && templates.some((item) => item.id === draft.template.id && item.status === 'APPROVED' && templateIdentity(item) === templateIdentity(draft.template)) && !unsupported.length
  let valuesReady = false
  if (approved && permissionReady) {
    try { selected.forEach((contact) => buildTemplateMessage(draft.template, draft.parameter_values, contact)); valuesReady = true } catch { /* Incomplete values are checked again before sending. */ }
  }
  const requirements = [['Business sender', connected], ['Recipient permission', permissionReady], ['Approved template', approved], ['Personalised values', valuesReady], ['Final readiness check', Boolean(preflight)]]
  const stepDescriptions = ['Name & business sender', 'Recipients & permission', 'Template & personalisation', 'Readiness & delivery']
  const stepTitles = ['Set up your campaign', 'Choose your audience', 'Build your message', 'Review before sending']
  const stepNotes = ['Give this campaign a name and choose the business number your recipients will see.', 'Choose people who have agreed to receive WhatsApp messages from your business.', 'Start with a Meta-approved template, then fill its variables and media.', 'Check every recipient and message before confirming delivery.']
  const nextReady = step === 1 ? Boolean(draft.name.trim()) : step === 2 ? permissionReady : step === 3 ? connected && valuesReady : false
  return <div className="wa-page wa-live wa-create-page wa-builder">
    <header className="wa-create-header">
      <div className="wa-builder-heading"><button className="wa-back-link" disabled={busy} onClick={onBack}><ArrowLeft size={16} /> WhatsApp campaigns</button><div className="wa-builder-title"><span className="wa-builder-channel"><MessageCircle size={20} /></span><h1>{draft.name || 'Untitled WhatsApp campaign'}</h1></div></div>
      <div className="wa-builder-header-actions"><span className="wa-builder-save-status" role="status">{busy ? 'Working…' : notice || (draft.id ? 'Saved draft' : 'New draft')}</span><button className="wa-secondary-button" disabled={busy || !draft.name.trim()} onClick={saveOnly}><Save size={16} />Save draft</button></div>
    </header>
    <div key={step} className="wa-builder-content" role="region" aria-label="Campaign form" tabIndex={0}>
    <nav className="wa-builder-steps" aria-label="Campaign steps"><ol className="wa-step-header">{STEPS.map((label, i) => <li key={label} className={step === i + 1 ? 'wa-step-active' : ''}><button type="button" disabled={busy || i + 1 > step} aria-current={step === i + 1 ? 'step' : undefined} onClick={() => { setStep(i + 1); setError(''); setPreflight(null); setConfirmed(false) }}><span className="wa-step-number">{i + 1}</span><span className="wa-step-copy"><strong>{label}</strong><small>{stepDescriptions[i]}</small></span></button></li>)}</ol></nav><ErrorNotice>{error}</ErrorNotice>
    <div className="wa-create-grid"><section className="wa-form-card"><div className="wa-card-heading"><span>Step {step} of 4</span><h2>{stepTitles[step - 1]}</h2><p>{stepNotes[step - 1]}</p></div><fieldset disabled={busy} className="wa-editor-fields">
      {step === 1 && <><label className="wa-field-label"><span>Campaign name</span><input maxLength={100} value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. New listings in Pretoria East" /></label><label className="wa-field-label"><span>WhatsApp sender</span><select value={draft.sender_id || ''} onChange={(e) => update({ sender_id: e.target.value, template: {}, parameter_values: {} })}><option value="">Select a sender</option>{workspace.senders.map((s) => <option key={s.id} value={s.id} disabled={s.connection_status !== 'connected'}>{s.business_display_name || 'WhatsApp Business'} · {s.display_phone_number || s.phone_number_id} ({s.connection_status})</option>)}</select></label><p>Category and language come from your approved template. Choose immediate or scheduled delivery in the final review step. Nothing is sent until you confirm.</p><SenderNotice senders={workspace.senders} /></>}
      {step === 2 && <><CampaignAudiencePicker value={draft.audience_plan} onApply={update}/><p>Select up to {MAX_CAMPAIGN_RECIPIENTS} recipients with recorded WhatsApp permission. Each phone number receives one message.</p><div className="wa-inline-actions"><strong>{draft.contact_ids.length} selected</strong><button type="button" className="wa-secondary-button" onClick={() => setManage(!manage)}>{manage ? 'Close contact form' : 'Add / manage contacts'}</button><button className="wa-secondary-button" onClick={() => update({ contact_ids: [] })}>Clear selection</button></div><input aria-label="Find recipients" placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} /><div className="wa-contact-list">{workspace.contacts.filter((c) => `${c.full_name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())).map((c) => { const allowed = eligible.some((x) => x.id === c.id); const checked = draft.contact_ids.includes(c.id); return <label className="wa-contact-row" key={c.id}><input type="checkbox" checked={checked} disabled={!checked && (!allowed || draft.contact_ids.length >= MAX_CAMPAIGN_RECIPIENTS)} onChange={() => toggle(c.id)} /><span><strong>{c.full_name}</strong><small>+{c.phone} · {allowed ? 'Opted in' : 'No current permission'}</small></span></label> })}</div>{!workspace.contacts.length && <p>No contacts yet. Add a contact and record their permission to get started.</p>}</>}
      {step === 3 && <><p>Templates are loaded from your sender’s WhatsApp Business Account. Create or edit templates in <a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noreferrer">WhatsApp Manager</a>, then refresh here.</p><div className="wa-inline-actions"><button className="wa-secondary-button" disabled={templateLoading || !draft.sender_id} onClick={() => setTemplateRefresh((n) => n + 1)}><RefreshCw size={15} /> Refresh templates</button>{templateLoading && <span role="status">Loading from Meta…</span>}</div><ErrorNotice>{templateError}</ErrorNotice><label className="wa-field-label"><span>Approved template & language</span><select value={draft.template?.id || ''} onChange={(e) => update({ template: templates.find((t) => t.id === e.target.value) || {}, parameter_values: {} })}><option value="">Choose a template</option>{draft.template?.id && !templates.some((t) => t.id === draft.template.id) && <option value={draft.template.id}>{draft.template.name} · saved selection (refresh to verify)</option>}{templates.map((t) => <option key={t.id} value={t.id} disabled={t.status !== 'APPROVED' || templateFields(t).unsupported.length > 0}>{t.name} · {t.language} · {t.category} · {t.status}{templateFields(t).unsupported.length ? ' · unsupported format' : ''}</option>)}</select></label>{!templateLoading && !templateError && draft.sender_id && !templates.length && <p>No templates found. Create a marketing or utility template in WhatsApp Manager and wait for approval.</p>}{draft.template?.id && <><dl className="wa-builder-template-meta">{[['Template name', draft.template.name], ['Category', draft.template.category], ['Language', draft.template.language], ['Meta status', draft.template.status]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{unsupported.length > 0 && <ErrorNotice>{unsupported.join(' ')}</ErrorNotice>}{fields.map((field) => <div className="wa-field-label" key={field.key}><label htmlFor={`wa-${field.key}`}>{field.label}</label>{field.kind === 'text' && field.section !== 'button' && <select aria-label={`${field.label} value source`} value={draft.parameter_values[field.key]?.source || 'text'} onChange={(e) => update({ parameter_values: { ...draft.parameter_values, [field.key]: { source: e.target.value, text: draft.parameter_values[field.key]?.text || '' } } })}><option value="text">Same value for everyone</option><option value="first_name">Recipient first name</option><option value="full_name">Recipient full name</option></select>}{(!draft.parameter_values[field.key]?.source || draft.parameter_values[field.key]?.source === 'text') && <input id={`wa-${field.key}`} type={field.kind === 'text' ? 'text' : 'url'} maxLength={1024} placeholder={field.kind === 'text' ? 'Enter value' : 'https://…'} value={draft.parameter_values[field.key]?.text || ''} onChange={(e) => update({ parameter_values: { ...draft.parameter_values, [field.key]: { source: 'text', text: e.target.value } } })} />}{field.kind !== 'text' && <small>Use a public HTTPS {field.kind} link that Meta can download. The media must match this template’s header format.</small>}</div>)}</>}</>}
      {step === 4 && <><dl className="wa-review"><dt>Campaign</dt><dd>{draft.name}</dd><dt>Sender</dt><dd>{workspace.senders.find((s) => s.id === draft.sender_id)?.display_phone_number || 'Not selected'}</dd><dt>Audience</dt><dd>{selected.length} recipients</dd><dt>Template</dt><dd>{draft.template?.name || 'Not selected'} · {draft.template?.language}</dd></dl><p>Check readiness to verify current Meta approval, recipient permission and every personalised value. Sending may incur Meta charges. Delivery and read results update from WhatsApp callbacks. Arch9 sends in the background, even after you close this page. Scheduled campaigns begin on or shortly after the chosen time; large campaigns send in batches.</p><label className="wa-field-label"><span>Delivery timing</span><select value={sendLater ? 'later' : 'now'} onChange={(e) => { const later = e.target.value === 'later'; setSendLater(later); update({ scheduled_at: later ? new Date(Date.now() + 3600000).toISOString() : null }) }}><option value="now">Send now</option><option value="later">Schedule for later</option></select></label>{sendLater && <label className="wa-field-label"><span>Scheduled sending time</span><input type="datetime-local" value={draft.scheduled_at ? localDateInput(draft.scheduled_at) : ''} onChange={(e) => { const selectedTime = new Date(e.target.value); update({ scheduled_at: Number.isFinite(selectedTime.getTime()) ? selectedTime.toISOString() : null }) }} /><small>Time zone: {localTimeZone}. Permission and Meta approval are checked again when sending begins.</small></label>}<button className="wa-secondary-button" onClick={check}>Check readiness</button>{preflight && <><p className="wa-notice" role="status">Ready to send to {preflight.recipients} recipients{sendLater ? ` on ${date(draft.scheduled_at)} (${localTimeZone})` : ''}.</p><label className="wa-checkbox"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I have reviewed the message, audience and {sendLater ? 'scheduled time' : 'sending time'}, and want to {sendLater ? 'schedule' : 'send'} this campaign.</label><button className="wa-primary-button" disabled={!confirmed} onClick={send}><Send size={16} /> {sendLater ? 'Schedule for' : 'Send to'} {preflight.recipients} recipients</button></>}</>}
    </fieldset></section>
      <div className="wa-builder-sidebar"><section className="wa-builder-readiness"><div className="wa-info-heading"><ShieldCheck size={18} /><h2>Campaign readiness</h2></div><p>Ready when all five checks are complete.</p><ul>{requirements.map(([label, ready]) => <li key={label} className={ready ? 'is-ready' : ''}>{ready ? <CheckCircle2 size={17} /> : <Circle size={17} />}<span>{label}</span><small>{ready ? 'Ready' : 'Pending'}</small></li>)}</ul></section><aside className="wa-info-panel"><div className="wa-info-heading"><MessageCircle size={18} /><strong>Message preview</strong></div><p>{selected[0] ? `Preview for ${selected[0].full_name}` : 'Choose a recipient to preview personalisation.'}</p>{draft.template?.components?.some((c) => c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)) && <div className="wa-media-preview">{draft.template.components.find((c) => c.type === 'HEADER')?.format} header<br /><small>{resolveValue(draft.parameter_values['header.media'], selected[0]) || 'Add a media URL'}</small></div>}<div className="wa-builder-phone-heading"><Smartphone size={16} /><span>{sender?.business_display_name || 'Your business'}</span><small>WhatsApp</small></div><div className="wa-message-preview">{previewTemplate(draft.template, draft.parameter_values, selected[0]) || 'Your approved template will appear here.'}</div>{draft.template?.components?.find((c) => c.type === 'BUTTONS')?.buttons?.map((b, i) => <div className="wa-preview-button" key={i}>{b.text}{b.type === 'URL' && <small>{String(b.url).replace(/\{\{.*?\}\}/g, resolveValue(draft.parameter_values[`button.${i}`], selected[0]) || '{{value}}')}</small>}</div>)}<small>Preview uses the first selected recipient. Readiness checks every recipient.</small></aside></div>
    </div>{step === 2 && manage && <ContactManager org={org} contacts={workspace.contacts} onSaved={workspace.refresh} />}
    </div>
    <footer className="wa-builder-footer"><div><span>Step {step} of 4</span><p>{step === 4 ? 'Nothing is sent until you confirm.' : 'Your draft can be saved at any step.'}</p></div><div>{step > 1 && <button className="wa-secondary-button" disabled={busy} onClick={() => { setStep(step - 1); setPreflight(null); setConfirmed(false) }}><ArrowLeft size={16} />Back</button>}{step < 4 && <button className="wa-primary-button" aria-label="Next" disabled={busy || !nextReady} onClick={() => { setStep(step + 1); setError('') }}>Continue to {STEPS[step].toLowerCase()}<ChevronRight size={16} /></button>}</div></footer>
  </div>
}

export function WhatsAppCampaignDetail({ campaignId, onBack }) {
  const org = useOrg()
  const scope = useCampaignScope(org)
  return <CampaignDetail key={`${scope}:${campaignId}`} org={org} campaignId={campaignId} onBack={onBack} />
}
function CampaignDetail({ org, campaignId, onBack }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const alive = useRef(true)
  const refreshInFlight = useRef(false)
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    if (alive.current) setRefreshing(true)
    try {
      const data = await whatsappCampaignRequest(org, 'detail', { campaignId })
      if (alive.current) { setDetail(data); setError('') }
    } catch (err) { if (alive.current) setError(err.message) }
    finally { refreshInFlight.current = false; if (alive.current) setRefreshing(false) }
  }, [org, campaignId])
  useEffect(() => { alive.current = true; void refresh(); const timer = setInterval(() => { void refresh() }, 10000); return () => { alive.current = false; clearInterval(timer) } }, [refresh])
  const control = async (action) => {
    setBusy(true); setError('')
    try { await whatsappCampaignRequest(org, action, { campaignId }); await refresh() } catch (err) { if (alive.current) setError(err.message) } finally { if (alive.current) setBusy(false) }
  }
  const recipients = (detail?.recipients || []).map((recipient) => ({
    ...recipient,
    displayStatus: recipient.status === 'processing' && Date.now() - new Date(recipient.attempted_at).getTime() > 120000 ? 'unknown' : recipient.status,
  }))
  const queued = recipients.filter((recipient) => recipient.status === 'queued').length
  const pending = recipients.filter((recipient) => ['queued', 'processing'].includes(recipient.displayStatus)).length
  const uncertain = recipients.filter((recipient) => recipient.displayStatus === 'unknown').length
  const failed = recipients.filter((recipient) => recipient.status === 'failed').length
  const skipped = recipients.filter((recipient) => recipient.status === 'skipped').length
  const delivered = recipients.filter((recipient) => recipient.delivered_at || recipient.read_at).length
  const read = recipients.filter((recipient) => recipient.read_at).length
  // Use the same receipt-based status as the campaign overview.
  const campaignStatus = ['scheduled', 'paused', 'cancelled'].includes(detail?.campaign.display_status) ? detail.campaign.display_status : detail?.campaign.status === 'draft' ? 'draft'
    : pending || !recipients.length ? 'sending'
      : uncertain ? 'needs_attention'
        : failed + skipped === recipients.length ? 'failed'
          : failed + skipped ? 'partial' : 'sent'
  const summary = [
    [<UsersRound size={18} aria-hidden="true" />, 'Recipients', recipients.length, 'Included in this send'],
    [<CheckCircle2 size={18} aria-hidden="true" />, 'Delivered', delivered, 'Confirmed delivery receipts'],
    [<Eye size={18} aria-hidden="true" />, 'Read', read, 'Confirmed read receipts'],
    [<CircleAlert size={18} aria-hidden="true" />, 'Failed', failed, 'Confirmed sending failures'],
  ]
  return <div className="wa-page wa-live wa-detail">
    <header className="wa-detail-header">
      <button type="button" className="wa-back-link" onClick={onBack}><ArrowLeft size={16} /> WhatsApp campaigns</button>
      <div className="wa-detail-heading">
        <div className="wa-detail-title"><h1>{detail?.campaign.name || 'Campaign results'}</h1>{detail ? <Status value={campaignStatus} /> : null}</div>
        <button type="button" className="wa-secondary-button" disabled={refreshing || busy} onClick={() => void refresh()}><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh results'}</button>
      </div>
      {detail ? <dl className="wa-detail-meta">
        <div><dt>Template</dt><dd>{detail.campaign.template?.name || 'Not selected'}</dd></div>
        <div><dt>Language</dt><dd>{detail.campaign.template?.language || 'Not selected'}</dd></div>
        <div><dt>Sending started</dt><dd>{detail.campaign.sent_at ? date(detail.campaign.sent_at) : 'Not started'}</dd></div>
      </dl> : null}
    </header>
    <ErrorNotice>{error}</ErrorNotice>
    {!detail && !error ? <p className="wa-detail-empty" role="status">Loading campaign results…</p> : null}
    {detail ? <>
      <section className="wa-detail-summary" aria-label="Campaign results summary">
        {summary.map(([icon, label, value, note]) => <article key={label}><div><span>{label}</span>{icon}</div><strong>{fmt(value)}</strong><small>{note}</small></article>)}
      </section>
      {detail.campaign.display_status === 'scheduled' ? <aside className="wa-notice wa-detail-pending"><p>Scheduled for {date(detail.campaign.scheduled_at)} ({localTimeZone}). Arch9 will send in the background.</p></aside> : detail.campaign.delivery_state === 'cancelled' ? <aside className="wa-notice wa-detail-pending"><p>Remaining messages were cancelled.</p></aside> : queued > 0 ? <aside className="wa-notice wa-detail-pending"><div><strong>{queued} {queued === 1 ? 'recipient is' : 'recipients are'} waiting</strong><p>{detail.campaign.delivery_state === 'paused' ? 'Delivery is paused.' : detail.campaign.delivery_state ? 'Sending continues in the background. You can close this page.' : 'Resume to send the remaining recipients in the background.'}</p>{detail.campaign.delivery_error ? <p role="alert">{detail.campaign.delivery_error}</p> : null}</div>{!['cancelled', 'completed'].includes(detail.campaign.delivery_state) ? <div className="wa-inline-actions"><button type="button" className="wa-primary-button" disabled={busy} onClick={() => void control(!detail.campaign.delivery_state || detail.campaign.delivery_state === 'paused' ? 'resume' : 'pause')}>{!detail.campaign.delivery_state || detail.campaign.delivery_state === 'paused' ? 'Resume sending' : 'Pause sending'}</button>{detail.campaign.delivery_state ? <button type="button" className="wa-secondary-button" disabled={busy} onClick={() => void control('cancel')}>Cancel remaining messages</button> : null}</div> : null}{detail.campaign.delivery_state ? <small>Messages already in progress may finish after pausing or cancelling.</small> : null}</aside> : null}
      <section className="wa-campaigns-panel wa-results wa-detail-results" aria-labelledby="wa-recipient-results-title">
        <div className="wa-detail-results-heading"><h2 id="wa-recipient-results-title">Recipient results</h2><span>{fmt(recipients.length)} {recipients.length === 1 ? 'recipient' : 'recipients'}</span></div>
        {recipients.length ? <div className="wa-table-scroll"><table aria-label="Recipient results"><thead><tr><th scope="col">Recipient</th><th scope="col">Status</th><th scope="col">Delivered</th><th scope="col">Read</th><th scope="col">Details</th></tr></thead><tbody>{recipients.map((recipient) => <tr key={recipient.id}>
          <td><strong className="wa-detail-recipient">{recipient.full_name || 'Unnamed recipient'}</strong><span className="wa-detail-phone">+{recipient.phone}</span></td>
          <td><Status value={recipient.displayStatus} /></td>
          <td>{recipient.delivered_at ? date(recipient.delivered_at) : recipient.read_at ? 'Confirmed by read receipt' : 'Not reported'}</td>
          <td>{recipient.read_at ? date(recipient.read_at) : 'Not reported'}</td>
          <td className="wa-detail-reason">{recipient.error_message || (recipient.displayStatus === 'unknown' ? 'Delivery unconfirmed. Check Meta before sending again.' : '—')}</td>
        </tr>)}</tbody></table></div> : <p className="wa-detail-empty">Recipient results will appear after this campaign starts sending.</p>}
        <p className="wa-detail-guidance">Sent means WhatsApp accepted the message. Delivery and read receipts are reported separately; a missing read receipt does not mean the message was unread.</p>
      </section>
    </> : null}
  </div>

}
