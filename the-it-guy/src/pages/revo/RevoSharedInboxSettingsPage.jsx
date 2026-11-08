import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Mail, MessageCircle, PenLine, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthSession } from '../../context/AuthSessionContext'
import { useOrganisation } from '../../context/OrganisationContext'
import { isOrganisationAdminMembershipRole } from '../../lib/organisationAccess'
import { REVO_INBOX_CHANNEL_PROVIDERS, createRevoInboxChannel, loadRevoInboxChannels, setRevoInboxDefaultChannel, updateRevoInboxChannel } from '../../modules/revo/sharedInbox/revoSharedInboxService'
import EmailMailboxSettings from '../../components/inbox/EmailMailboxSettings.jsx'
import './RevoSharedInboxSettingsPage.css'

const EMPTY_FORM = { channel: 'whatsapp', providerKey: 'meta_cloud_api', address: '', displayName: '' }
function WhatsAppChannels({ organisationId, userId, canManage }) {
  const [channels, setChannels] = useState([]), [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const active = useRef(true), lock = useRef(false), sequence = useRef(0)
  const load = useCallback(async () => {
    if (!organisationId) return setLoading(false)
    const request = ++sequence.current
    setLoading(true); setError('')
    try { const rows = await loadRevoInboxChannels(organisationId); if (active.current && request === sequence.current) setChannels(rows.filter(channel => channel.channel === 'whatsapp')) }
    catch (cause) { if (active.current && request === sequence.current) setError(cause.message || 'WhatsApp channels could not be loaded.') }
    finally { if (active.current && request === sequence.current) setLoading(false) }
  }, [organisationId])
  useEffect(() => { active.current = true; void load(); return () => { active.current = false } }, [load])
  const run = async action => {
    if (lock.current || !canManage || loading || !organisationId) return
    lock.current = true; setBusy(true); setNotice(''); setError('')
    try { const message = await action(); if (active.current) { await load(); if (active.current) setNotice(message) } }
    catch (cause) { if (active.current) setError(cause.message || 'WhatsApp channel settings could not be saved.') }
    finally { lock.current = false; if (active.current) setBusy(false) }
  }
  return <section className="revo-whatsapp-settings" aria-label="WhatsApp channels">
    <div className="inbox-settings-heading"><div><h2>WhatsApp numbers</h2><p>Connect a business number and manage your team's conversations.</p></div><Link className="inbox-settings-link" to="/settings/integrations/whatsapp">Manage WhatsApp <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
    {error && <p role="alert" className="inbox-settings-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Loading WhatsApp channels…</p> : <div className="revo-channel-grid">{!channels.length && <div className="revo-channel-empty"><MessageCircle size={28} aria-hidden="true" /><h3>Your next conversation starts here</h3><p>Connect a WhatsApp Business number to bring customer messages into Inbox.</p><Link className="inbox-settings-link" to="/settings/integrations/whatsapp">Connect WhatsApp <ArrowUpRight size={15} aria-hidden="true" /></Link></div>}{channels.map(channel => <article key={channel.id}>
      <h3>{channel.displayName || channel.address}</h3><p>{channel.address}</p><p>{channel.connectionStatus === 'draft' ? 'Not connected' : channel.connectionStatus}</p>
      {canManage && <footer><button type="button" disabled={busy || channel.isDefault} onClick={() => void run(async () => { await setRevoInboxDefaultChannel(channel.id); return 'Default WhatsApp channel updated.' })}>{channel.isDefault ? 'Default channel' : 'Make default'}</button>
      <button type="button" disabled={busy} onClick={() => void run(async () => { await updateRevoInboxChannel({ organisationId, channelId: channel.id, connectionStatus: channel.connectionStatus === 'paused' ? 'draft' : 'paused' }); return channel.connectionStatus === 'paused' ? 'Channel returned to setup mode.' : 'Channel setup paused.' })}>{channel.connectionStatus === 'paused' ? 'Resume setup' : 'Pause'}</button></footer>}
    </article>)}</div>}
    {canManage && <details className="revo-add-channel"><summary>Add a WhatsApp channel</summary><form onSubmit={event => { event.preventDefault(); void run(async () => { await createRevoInboxChannel({ ...form, organisationId, actorUserId: userId }); if (active.current) setForm(EMPTY_FORM); return 'WhatsApp channel details saved. No message was sent.' }) }}>
      <label>Provider<select value={form.providerKey} disabled={busy} onChange={event => setForm(current => ({ ...current, providerKey: event.target.value }))}>{REVO_INBOX_CHANNEL_PROVIDERS.whatsapp.map(provider => <option key={provider.key} value={provider.key}>{provider.label}</option>)}</select></label>
      <label>WhatsApp business number<input required value={form.address} disabled={busy} placeholder="+27 11 555 0100" onChange={event => setForm(current => ({ ...current, address: event.target.value }))} /></label>
      <label>Internal label<input value={form.displayName} disabled={busy} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} /></label>
      <button type="submit" disabled={busy || loading || Boolean(error)}>Save WhatsApp channel</button>
    </form></details>}
  </section>
}
export default function RevoSharedInboxSettingsPage() {
  const { organisation, membershipRole } = useOrganisation()
  const { user } = useAuthSession()
  const [tab, setTab] = useState('mailboxes')
  const [emailTab, setEmailTab] = useState('mailboxes')
  const activateTab = value => { setTab(value); if (value !== 'whatsapp') setEmailTab(value) }
  const tabs = [['mailboxes', 'Email accounts', <Mail size={17} aria-hidden="true" />], ['signatures', 'Signatures', <PenLine size={17} aria-hidden="true" />], ['whatsapp', 'WhatsApp', <MessageCircle size={17} aria-hidden="true" />]]
  const selectTab = (event, index) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    activateTab(tabs[next][0])
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
  }
  return <main className="revo-channel-settings">
    <Link className="inbox-settings-back" to="/inbox"><ArrowLeft size={15} aria-hidden="true" /> Back to inbox</Link>
    <header className="inbox-settings-page-heading"><div><span className="inbox-settings-eyebrow">WORKSPACE SETTINGS</span><h1>Inbox settings</h1><p>Your accounts, your team, one connected inbox.</p></div><span className="inbox-settings-page-icon"><Settings2 size={23} aria-hidden="true" /></span></header>
    <div className="inbox-page-tabs" role="tablist" aria-label="Inbox settings sections">{tabs.map(([value, label, icon], index) => <button key={value} id={`inbox-tab-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls={`inbox-panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => activateTab(value)} onKeyDown={event => selectTab(event, index)}>{icon}{label}</button>)}</div>
    <section id={`inbox-panel-${emailTab}`} role="tabpanel" aria-labelledby={`inbox-tab-${emailTab}`} hidden={tab === 'whatsapp'}>
      <EmailMailboxSettings organisationId={organisation?.id} userId={user?.id} tab={emailTab} showTabs={false} />
    </section>
    {tab === 'whatsapp' && <section id="inbox-panel-whatsapp" role="tabpanel" aria-labelledby="inbox-tab-whatsapp"><WhatsAppChannels key={`${organisation?.id}:${user?.id}`} organisationId={organisation?.id} userId={user?.id} canManage={isOrganisationAdminMembershipRole(membershipRole)} /></section>}
  </main>
}
