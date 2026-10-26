import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Settings2 } from 'lucide-react'
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
  return <section className="revo-whatsapp-settings" aria-label="WhatsApp channels"><h2>WhatsApp channels</h2>
    {error && <p role="alert" className="inbox-settings-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Loading WhatsApp channels…</p> : <div className="revo-channel-grid">{!channels.length && <p className="revo-channel-empty">No WhatsApp channels have been prepared yet.</p>}{channels.map(channel => <article key={channel.id}>
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
  return <main className="revo-channel-settings">
    <header><div><Link to="/inbox"><ArrowLeft size={16} /> Inbox</Link><h1>Inbox settings</h1><p>Manage email mailboxes, signatures and WhatsApp channels.</p></div><Settings2 size={30} aria-hidden="true" /></header>
    <EmailMailboxSettings organisationId={organisation?.id} userId={user?.id} />
    <WhatsAppChannels key={`${organisation?.id}:${user?.id}`} organisationId={organisation?.id} userId={user?.id} canManage={isOrganisationAdminMembershipRole(membershipRole)} />
  </main>
}
