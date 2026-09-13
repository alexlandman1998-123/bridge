import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Eye, MessageCircle, RefreshCw, Search, Send, UsersRound } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { whatsappCampaignRequest } from '../../services/whatsappCampaignService'
import { buildTemplateMessage, MAX_CAMPAIGN_RECIPIENTS, previewTemplate, resolveValue, templateFields } from '../../../../supabase/functions/_shared/whatsappCampaign.js'

const STEPS = ['Campaign', 'Audience', 'Message', 'Review']
const EMPTY = { campaigns: [], contacts: [], senders: [] }
const fmt = (value) => Number(value || 0).toLocaleString()
const date = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const statusLabel = (value) => ({ needs_attention: 'Needs attention', partial: 'Partially sent', processing: 'Sending', unknown: 'Unconfirmed' }[value] || value)
function useOrg() {
  const { authState } = useAuthSession()
  return String(authState?.currentWorkspace?.id || authState?.currentMembership?.workspaceId || authState?.currentMembership?.workspace_id || '')
}
function useWorkspace(org) {
  const [state, setState] = useState({ ...EMPTY, org: '', loading: true, error: '' })
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    if (!org) { setState({ ...EMPTY, org, loading: false, error: 'Choose an organisation workspace to use WhatsApp campaigns.' }); return }
    setState((s) => ({ ...(s.org === org ? s : { ...EMPTY, org }), loading: true, error: '' }))
    try {
      const data = await whatsappCampaignRequest(org, 'workspace')
      if (generation.current === request) setState({ ...data, org, loading: false, error: '' })
    } catch (error) {
      if (generation.current === request) setState((s) => ({ ...s, org, loading: false, error: error.message }))
    }
  }, [org])
  useEffect(() => { void refresh(); return () => { generation.current++ } }, [refresh])
  return { ...(state.org === org ? state : { ...EMPTY, loading: true, error: '' }), refresh }
}
function Status({ value }) { return <span className={`wa-status wa-status-${value === 'sent' || value === 'read' || value === 'delivered' ? 'sent' : 'draft'}`}>{statusLabel(value)}</span> }
function ErrorNotice({ children }) { return children ? <p className="wa-error" role="alert">{children}</p> : null }
function SenderNotice({ senders }) {
  return !senders.some((s) => s.connection_status === 'connected') ? <aside className="wa-notice"><strong>Connect a WhatsApp Business sender</strong><p>An administrator needs to configure your WhatsApp Business Account ID, Phone Number ID and server-side access token. You can save drafts while setup is pending.</p><a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noreferrer">Open WhatsApp Manager</a></aside> : null
}
function Stats({ campaigns }) {
  const totals = campaigns.reduce((acc, c) => ({ recipients: acc.recipients + c.recipients, delivered: acc.delivered + c.delivered, read: acc.read + c.read }), { recipients: 0, delivered: 0, read: 0 })
  return <section className="wa-stats" aria-label="Campaign performance">{[[Send, campaigns.length, 'Campaigns'], [UsersRound, totals.recipients, 'Recipients'], [CheckCircle2, totals.delivered, 'Delivered'], [Eye, totals.read, 'Read']].map(([Icon, value, label]) => <article className="wa-stat" key={label}><span className="wa-stat-icon"><Icon size={20} /></span><span className="wa-stat-copy"><strong>{fmt(value)}</strong><span>{label}</span><small>For the selected filters</small></span></article>)}</section>
}

export function WhatsAppCampaignOverview({ onCreateCampaign, onOpenCampaign }) {
  const org = useOrg()
  const { campaigns, contacts, senders, loading, error, refresh } = useWorkspace(org)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [days, setDays] = useState('all')
  const [page, setPage] = useState(1)
  const [manage, setManage] = useState(false)
  const filtered = campaigns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || c.display_status === status) && (days === 'all' || new Date(c.sent_at || c.created_at).getTime() >= Date.now() - Number(days) * 86400000))
  const pages = Math.max(1, Math.ceil(filtered.length / 10))
  const currentPage = Math.min(page, pages)
  return <div className="wa-page wa-live">
    <header className="wa-create-header"><div><h1>WhatsApp campaigns</h1><p>Send approved messages to people who want to hear from your business.</p></div><button className="wa-secondary-button" onClick={() => setManage(!manage)}>{manage ? 'Close contacts' : 'Manage contacts'}</button></header>
    <ErrorNotice>{error}</ErrorNotice>
    {!error && <SenderNotice senders={senders} />}
    {manage && <ContactManager key={org} org={org} contacts={contacts} onSaved={refresh} />}
    <Stats campaigns={filtered} />
    <section className="wa-campaigns-panel">
      <div className="wa-panel-toolbar"><div className="wa-tabs" aria-label="Campaign status">{['all', 'draft', 'sending', 'sent', 'partial', 'failed', 'needs_attention'].map((s) => <button type="button" className={status === s ? 'wa-tab-active' : ''} aria-pressed={status === s} onClick={() => { setStatus(s); setPage(1) }} key={s}>{s === 'all' ? 'All campaigns' : statusLabel(s)}</button>)}</div><button className="wa-primary-button" disabled={!org} onClick={() => onCreateCampaign()}>Create campaign <ChevronRight size={16} /></button></div>
      <div className="wa-campaigns-content"><div className="wa-filter-row"><label className="wa-search"><Search size={17} /><input aria-label="Search campaigns" type="search" placeholder="Search campaigns…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} /></label><select className="wa-filter-control" aria-label="Campaign period" value={days} onChange={(e) => { setDays(e.target.value); setPage(1) }}><option value="all">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button className="wa-secondary-button" disabled={loading} onClick={refresh}><RefreshCw size={16} /> Refresh</button></div>
        {loading && <p role="status">Loading campaigns…</p>}
        {!loading && !error && !filtered.length && <div className="wa-empty"><MessageCircle size={28} /><h2>{campaigns.length ? 'No matching campaigns' : 'Your first campaign starts here'}</h2><p>{campaigns.length ? 'Try another search or filter.' : 'Add your contacts, choose an approved template and save your first draft.'}</p></div>}
        <div className="wa-campaign-list">{filtered.slice((currentPage - 1) * 10, currentPage * 10).map((c) => <article className="wa-campaign-card" key={c.id}><div className="wa-campaign-main"><div className="wa-campaign-heading"><div><h3>{c.name}</h3><p>{c.template?.name || 'No template selected'} · {c.template?.language || 'Language not selected'}</p></div><Status value={c.display_status} /></div><p className="wa-sent-time">{c.status === 'draft' ? 'Draft updated' : 'Sending started'} {date(c.status === 'draft' ? c.updated_at : c.sent_at)}</p><dl className="wa-metrics"><div><dt>Recipients</dt><dd>{fmt(c.status === 'draft' ? c.contact_ids.length : c.recipients)}</dd></div><div><dt>Delivered</dt><dd>{fmt(c.delivered)}</dd></div><div><dt>Read</dt><dd>{fmt(c.read)}</dd></div><div><dt>Failed / skipped</dt><dd>{fmt(c.failed + c.skipped)}</dd></div></dl>{c.uncertain > 0 && <p className="wa-notice">{c.uncertain} delivery result(s) need review.</p>}</div><button className="wa-secondary-button" onClick={() => c.status === 'draft' ? onCreateCampaign(c.id) : onOpenCampaign(c.id)}>{c.status === 'draft' ? 'Continue' : 'View results'}</button></article>)}</div>
        <footer className="wa-list-footer"><span>{filtered.length ? `Showing ${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, filtered.length)} of ${filtered.length}` : '0 campaigns'}</span><div className="wa-inline-actions"><button className="wa-secondary-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pages}</span><button className="wa-secondary-button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>
      </div>
    </section>
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

export function CreateWhatsAppCampaign({ campaignId, onBack, onDraftCreated }) {
  const org = useOrg()
  const workspace = useWorkspace(org)
  const initial = campaignId ? workspace.campaigns.find((c) => c.id === campaignId) : null
  if (!org || (workspace.loading && !workspace.campaigns.length && !workspace.senders.length && !workspace.contacts.length)) return <div className="wa-page wa-live"><ErrorNotice>{workspace.error}</ErrorNotice><p>{org ? 'Loading campaign workspace…' : 'Choose an organisation workspace.'}</p><button onClick={onBack}>Back</button></div>
  if (workspace.error || (campaignId && !initial)) return <div className="wa-page wa-live"><ErrorNotice>{workspace.error || 'Campaign not found in this organisation.'}</ErrorNotice><button onClick={workspace.refresh}>Try again</button><button onClick={onBack}>Back</button></div>
  if (initial && initial.status !== 'draft') return <div className="wa-page wa-live"><p>This campaign has already started and can no longer be edited.</p><button onClick={onBack}>Back to campaigns</button></div>
  return <CampaignEditor key={`${org}:${campaignId || 'new'}`} org={org} initial={initial} workspace={workspace} onBack={onBack} onDraftCreated={onDraftCreated} />
}
function CampaignEditor({ org, initial, workspace, onBack, onDraftCreated }) {
  const [draft, setDraft] = useState(() => initial || { client_id: crypto.randomUUID(), name: '', sender_id: '', template: {}, parameter_values: {}, contact_ids: [] })
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
    setBusy(true); setError('')
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
      setPreflight(null)
      let more = true
      while (more && alive.current) {
        const { campaign } = await whatsappCampaignRequest(org, 'dispatch', { campaignId: draft.id })
        more = campaign.queued > 0
        if (alive.current) setNotice(`${campaign.recipients - campaign.queued} of ${campaign.recipients} recipients processed. ${campaign.accepted} accepted by Meta.`)
      }
      if (alive.current) onBack()
    } catch (err) { if (alive.current) { setError(`${err.message} If sending has started, open the campaign results to resume remaining recipients.`); setPreflight(null) } } finally { if (alive.current) setBusy(false) }
  }
  const toggle = (id) => update({ contact_ids: draft.contact_ids.includes(id) ? draft.contact_ids.filter((c) => c !== id) : [...draft.contact_ids, id] })
  return <div className="wa-page wa-live wa-create-page"><button className="wa-back-link" disabled={busy} onClick={onBack}><ArrowLeft size={16} /> WhatsApp campaigns</button><header className="wa-create-header"><div><span>{draft.id ? 'Saved draft' : 'New campaign'}</span><h1>Create WhatsApp campaign</h1><p>Choose an approved message and make it personal.</p></div><button className="wa-secondary-button" disabled={busy || !draft.name.trim()} onClick={saveOnly}>{busy ? 'Working…' : 'Save draft'}</button></header><ol className="wa-step-header">{STEPS.map((label, i) => <li key={label} className={step === i + 1 ? 'wa-step-active' : step > i + 1 ? 'wa-step-complete' : ''}><span className="wa-step-number">{step > i + 1 ? <Check size={14} /> : i + 1}</span><strong>{label}</strong></li>)}</ol><ErrorNotice>{error}</ErrorNotice>{notice && <p role="status">{notice}</p>}<SenderNotice senders={workspace.senders} />
    <div className="wa-create-grid"><section className="wa-form-card"><div className="wa-card-heading"><span>Step {step} of 4</span><h2>{STEPS[step - 1]}</h2></div><fieldset disabled={busy} className="wa-editor-fields">
      {step === 1 && <><label className="wa-field-label"><span>Campaign name</span><input maxLength={100} value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. New listings in Pretoria East" /></label><label className="wa-field-label"><span>WhatsApp sender</span><select value={draft.sender_id || ''} onChange={(e) => update({ sender_id: e.target.value, template: {}, parameter_values: {} })}><option value="">Select a sender</option>{workspace.senders.map((s) => <option key={s.id} value={s.id} disabled={s.connection_status !== 'connected'}>{s.business_display_name || 'WhatsApp Business'} · {s.display_phone_number || s.phone_number_id} ({s.connection_status})</option>)}</select></label><p>Campaign category and language come from your Meta-approved template. This version sends when you confirm; scheduling is not available yet.</p></>}
      {step === 2 && <><p>Select up to {MAX_CAMPAIGN_RECIPIENTS} recipients with recorded WhatsApp permission. Each phone number receives one message.</p><div className="wa-inline-actions"><strong>{draft.contact_ids.length} selected</strong><button type="button" className="wa-secondary-button" onClick={() => setManage(!manage)}>{manage ? 'Close contact form' : 'Add / manage contacts'}</button><button className="wa-secondary-button" onClick={() => update({ contact_ids: [] })}>Clear selection</button></div><input aria-label="Find recipients" placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} /><div className="wa-contact-list">{workspace.contacts.filter((c) => `${c.full_name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())).map((c) => { const allowed = eligible.some((x) => x.id === c.id); const checked = draft.contact_ids.includes(c.id); return <label className="wa-contact-row" key={c.id}><input type="checkbox" checked={checked} disabled={!checked && (!allowed || draft.contact_ids.length >= MAX_CAMPAIGN_RECIPIENTS)} onChange={() => toggle(c.id)} /><span><strong>{c.full_name}</strong><small>+{c.phone} · {allowed ? 'Opted in' : 'No current permission'}</small></span></label> })}</div>{!workspace.contacts.length && <p>No contacts yet. Add a contact and record their permission to get started.</p>}</>}
      {step === 3 && <><p>Templates are loaded from your sender’s WhatsApp Business Account. Create or edit templates in <a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noreferrer">WhatsApp Manager</a>, then refresh here.</p><div className="wa-inline-actions"><button className="wa-secondary-button" disabled={templateLoading || !draft.sender_id} onClick={() => setTemplateRefresh((n) => n + 1)}><RefreshCw size={15} /> Refresh templates</button>{templateLoading && <span role="status">Loading from Meta…</span>}</div><ErrorNotice>{templateError}</ErrorNotice><label className="wa-field-label"><span>Approved template & language</span><select value={draft.template?.id || ''} onChange={(e) => update({ template: templates.find((t) => t.id === e.target.value) || {}, parameter_values: {} })}><option value="">Choose a template</option>{draft.template?.id && !templates.some((t) => t.id === draft.template.id) && <option value={draft.template.id}>{draft.template.name} · saved selection (refresh to verify)</option>}{templates.map((t) => <option key={t.id} value={t.id} disabled={t.status !== 'APPROVED' || templateFields(t).unsupported.length > 0}>{t.name} · {t.language} · {t.category} · {t.status}{templateFields(t).unsupported.length ? ' · unsupported format' : ''}</option>)}</select></label>{!templateLoading && !templateError && draft.sender_id && !templates.length && <p>No templates found. Create a marketing or utility template in WhatsApp Manager and wait for approval.</p>}{draft.template?.id && <><p><strong>{draft.template.category}</strong> · {draft.template.language} · {draft.template.status}</p>{unsupported.length > 0 && <ErrorNotice>{unsupported.join(' ')}</ErrorNotice>}{fields.map((field) => <div className="wa-field-label" key={field.key}><label htmlFor={`wa-${field.key}`}>{field.label}</label>{field.kind === 'text' && field.section !== 'button' && <select aria-label={`${field.label} value source`} value={draft.parameter_values[field.key]?.source || 'text'} onChange={(e) => update({ parameter_values: { ...draft.parameter_values, [field.key]: { source: e.target.value, text: draft.parameter_values[field.key]?.text || '' } } })}><option value="text">Same value for everyone</option><option value="first_name">Recipient first name</option><option value="full_name">Recipient full name</option></select>}{(!draft.parameter_values[field.key]?.source || draft.parameter_values[field.key]?.source === 'text') && <input id={`wa-${field.key}`} type={field.kind === 'text' ? 'text' : 'url'} maxLength={1024} placeholder={field.kind === 'text' ? 'Enter value' : 'https://…'} value={draft.parameter_values[field.key]?.text || ''} onChange={(e) => update({ parameter_values: { ...draft.parameter_values, [field.key]: { source: 'text', text: e.target.value } } })} />}{field.kind !== 'text' && <small>Use a public HTTPS {field.kind} link that Meta can download. The media must match this template’s header format.</small>}</div>)}</>}</>}
      {step === 4 && <><dl className="wa-review"><dt>Campaign</dt><dd>{draft.name}</dd><dt>Sender</dt><dd>{workspace.senders.find((s) => s.id === draft.sender_id)?.display_phone_number || 'Not selected'}</dd><dt>Audience</dt><dd>{selected.length} recipients</dd><dt>Template</dt><dd>{draft.template?.name || 'Not selected'} · {draft.template?.language}</dd></dl><p>Check readiness to verify current Meta approval, recipient permission and every personalised value. Sending may incur Meta charges. Delivery and read results update from WhatsApp callbacks. Keep this page open while sending; if you leave, resume unsent recipients from campaign results.</p><button className="wa-secondary-button" onClick={check}>Check readiness</button>{preflight && <><p className="wa-notice" role="status">Ready to send to {preflight.recipients} recipients.</p><label className="wa-checkbox"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I have reviewed the message and audience, and want to send this campaign now.</label><button className="wa-primary-button" disabled={!confirmed} onClick={send}><Send size={16} /> Send to {preflight.recipients} recipients</button></>}</>}
    </fieldset><div className="wa-form-footer wa-inline-actions">{step > 1 && <button className="wa-secondary-button" disabled={busy} onClick={() => { setStep(step - 1); setPreflight(null); setConfirmed(false) }}>Back</button>}{step < 4 && <button className="wa-primary-button" disabled={busy || (step === 1 && !draft.name.trim())} onClick={() => { setStep(step + 1); setError('') }}>Next <ChevronRight size={16} /></button>}</div></section>
      <aside className="wa-info-panel"><div className="wa-info-heading"><MessageCircle size={18} /><strong>Message preview</strong></div><p>{selected[0] ? `Preview for ${selected[0].full_name}` : 'Choose a recipient to preview personalisation.'}</p>{draft.template?.components?.some((c) => c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)) && <div className="wa-media-preview">{draft.template.components.find((c) => c.type === 'HEADER')?.format} header<br /><small>{resolveValue(draft.parameter_values['header.media'], selected[0]) || 'Add a media URL'}</small></div>}<div className="wa-message-preview">{previewTemplate(draft.template, draft.parameter_values, selected[0]) || 'Your approved template will appear here.'}</div>{draft.template?.components?.find((c) => c.type === 'BUTTONS')?.buttons?.map((b, i) => <div className="wa-preview-button" key={i}>{b.text}{b.type === 'URL' && <small>{String(b.url).replace(/\{\{.*?\}\}/g, resolveValue(draft.parameter_values[`button.${i}`], selected[0]) || '{{value}}')}</small>}</div>)}<small>Preview uses the first selected recipient. Readiness checks every recipient.</small></aside>
    </div>{step === 2 && manage && <ContactManager org={org} contacts={workspace.contacts} onSaved={workspace.refresh} />}
  </div>
}

export function WhatsAppCampaignDetail({ campaignId, onBack }) {
  const org = useOrg()
  return <CampaignDetail key={`${org}:${campaignId}`} org={org} campaignId={campaignId} onBack={onBack} />
}
function CampaignDetail({ org, campaignId, onBack }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const refresh = useCallback(async () => {
    try { const data = await whatsappCampaignRequest(org, 'detail', { campaignId }); if (alive.current) { setDetail(data) } } catch (err) { if (alive.current) setError(err.message) }
  }, [org, campaignId])
  useEffect(() => { alive.current = true; void refresh(); const timer = setInterval(() => { void refresh() }, 10000); return () => { alive.current = false; clearInterval(timer) } }, [refresh])
  const resume = async () => {
    setBusy(true); setError('')
    try { let more = true; while (more && alive.current) { const { campaign } = await whatsappCampaignRequest(org, 'dispatch', { campaignId }); more = campaign.queued > 0; await refresh() } } catch (err) { if (alive.current) setError(err.message) } finally { if (alive.current) setBusy(false) }
  }
  const queued = detail?.recipients.filter((r) => r.status === 'queued').length || 0
  return <div className="wa-page wa-live"><button className="wa-back-link" onClick={onBack}><ArrowLeft size={16} /> WhatsApp campaigns</button><header className="wa-create-header"><div><h1>{detail?.campaign.name || 'Campaign results'}</h1><p>Accepted messages are not necessarily delivered. Read receipts may be unavailable.</p></div><button className="wa-secondary-button" onClick={refresh}>Refresh results</button></header><ErrorNotice>{error}</ErrorNotice>{queued > 0 && <aside className="wa-notice"><p>{queued} recipients are waiting. Sending can be resumed here if the page was closed.</p><button className="wa-primary-button" disabled={busy} onClick={resume}>{busy ? 'Sending…' : `Send remaining ${queued}`}</button></aside>}<section className="wa-campaigns-panel wa-results"><div className="wa-table-scroll"><table><thead><tr><th>Recipient</th><th>Phone</th><th>Status</th><th>Delivered</th><th>Read</th><th>Details</th></tr></thead><tbody>{detail?.recipients.map((r) => { const stale = r.status === 'processing' && Date.now() - new Date(r.attempted_at).getTime() > 120000; return <tr key={r.id}><td>{r.full_name}</td><td>+{r.phone}</td><td><Status value={stale ? 'unknown' : r.status} /></td><td>{date(r.delivered_at)}</td><td>{date(r.read_at)}</td><td>{r.error_message || (stale ? 'Delivery unconfirmed. Check Meta before sending again.' : '—')}</td></tr> })}</tbody></table></div>{!detail && !error && <p role="status">Loading results…</p>}</section></div>
}
