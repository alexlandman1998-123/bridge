import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, CircleDashed, Mail, MessageCircle, PauseCircle, Plus, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthSession } from '../../context/AuthSessionContext'
import { useOrganisation } from '../../context/OrganisationContext'
import {
  REVO_INBOX_CHANNEL_PROVIDERS,
  createRevoInboxChannel,
  isSharedInboxSchemaUnavailable,
  loadRevoInboxChannels,
  setRevoInboxDefaultChannel,
  updateRevoInboxChannel,
} from '../../modules/revo/sharedInbox/revoSharedInboxService'
import {
  loadRevoInboxProviderConnections,
  manageRevoInboxProviderConnection,
  syncRevoInboxProviderConnection,
  startRevoGoogleWorkspaceInboxAuthorization,
  startRevoMicrosoftInboxAuthorization,
} from '../../modules/revo/sharedInbox/connectionCore'
import './RevoSharedInboxSettingsPage.css'

const EMPTY_FORM = Object.freeze({ channel: 'email', providerKey: 'google_workspace', address: '', displayName: '' })

function text(value = '') { return String(value ?? '').trim() }
function ChannelIcon({ channel }) { return channel === 'whatsapp' ? <MessageCircle size={20} /> : <Mail size={20} /> }
function statusMeta(status) {
  if (status === 'paused') return { label: 'Paused', Icon: PauseCircle, className: 'paused' }
  if (status === 'connected') return { label: 'Connected', Icon: CheckCircle2, className: 'connected' }
  if (status === 'disconnected') return { label: 'Needs attention', Icon: CircleDashed, className: 'disconnected' }
  return { label: 'Not connected', Icon: CircleDashed, className: 'draft' }
}

export default function RevoSharedInboxSettingsPage() {
  const { organisation } = useOrganisation()
  const { user } = useAuthSession()
  const [channels, setChannels] = useState([])
  const [connections, setConnections] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('loading')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!organisation?.id) return
    setMode('loading')
    try {
      const nextChannels = await loadRevoInboxChannels(organisation.id)
      setChannels(nextChannels)
      try {
        setConnections(await loadRevoInboxProviderConnections(organisation.id))
      } catch (connectionError) {
        if (!isSharedInboxSchemaUnavailable(connectionError)) throw connectionError
        setConnections([])
      }
      setMode('live')
    } catch (error) {
      if (isSharedInboxSchemaUnavailable(error) || /not configured/i.test(text(error?.message))) {
        setMode('preview')
        return
      }
      setMode('error')
      setNotice(text(error?.message) || 'Unable to load Revo channel setup.')
    }
  }, [organisation?.id])

  useEffect(() => { void load() }, [load])

  const connectionByChannelId = useMemo(() => new Map(connections.map((connection) => [connection.channelId, connection])), [connections])

  const changeChannelType = (channel) => {
    setForm({ ...EMPTY_FORM, channel, providerKey: REVO_INBOX_CHANNEL_PROVIDERS[channel][0].key })
  }
  const addChannel = async (event) => {
    event.preventDefault()
    if (mode !== 'live') { setNotice('Channel setup becomes live once the Revo inbox migrations are applied.'); return }
    setSaving(true)
    try {
      await createRevoInboxChannel({ organisationId: organisation.id, actorUserId: user?.id, ...form })
      setForm(EMPTY_FORM)
      await load()
      setNotice('Channel saved as not connected. No provider access has been requested.')
    } catch (error) { setNotice(text(error?.message) || 'The channel could not be saved.') } finally { setSaving(false) }
  }
  const setDefault = async (channelId) => {
    if (mode !== 'live') { setNotice('Channel setup becomes live once the Revo inbox migrations are applied.'); return }
    setSaving(true)
    try {
      await setRevoInboxDefaultChannel(channelId)
      await load()
      setNotice('Default channel updated.')
    } catch (error) { setNotice(text(error?.message) || 'The default channel could not be updated.') } finally { setSaving(false) }
  }
  const togglePause = async (channel) => {
    if (mode !== 'live') { setNotice('Channel setup becomes live once the Revo inbox migrations are applied.'); return }
    setSaving(true)
    try {
      await updateRevoInboxChannel({ organisationId: organisation.id, channelId: channel.id, connectionStatus: channel.connectionStatus === 'paused' ? 'draft' : 'paused' })
      await load()
      setNotice(channel.connectionStatus === 'paused' ? 'Channel returned to setup mode.' : 'Channel paused. No provider traffic is affected because no connector exists.')
    } catch (error) { setNotice(text(error?.message) || 'The channel could not be updated.') } finally { setSaving(false) }
  }
  const connectMicrosoft = async (channel) => {
    if (mode !== 'live') { setNotice('Channel setup becomes live once the Revo inbox migrations are applied.'); return }
    setSaving(true)
    try {
      const authorizationUrl = await startRevoMicrosoftInboxAuthorization({
        organisationId: organisation.id,
        channelId: channel.id,
        connectionKind: 'delegated_shared_mailbox',
        mailboxAddress: channel.address,
        actorUserId: user?.id,
        returnUrl: window.location.href,
      })
      window.location.assign(authorizationUrl)
    } catch (error) { setNotice(text(error?.message) || 'The Microsoft connection could not be started.') } finally { setSaving(false) }
  }
  const connectGoogleWorkspace = async (channel) => {
    if (mode !== 'live') { setNotice('Channel setup becomes live once the Revo inbox migrations are applied.'); return }
    setSaving(true)
    try {
      const authorizationUrl = await startRevoGoogleWorkspaceInboxAuthorization({
        organisationId: organisation.id,
        channelId: channel.id,
        connectionKind: 'delegated_shared_mailbox',
        mailboxAddress: channel.address,
        actorUserId: user?.id,
        returnUrl: window.location.href,
      })
      window.location.assign(authorizationUrl)
    } catch (error) { setNotice(text(error?.message) || 'The Google Workspace connection could not be started.') } finally { setSaving(false) }
  }
  const manageConnection = async (connection, action) => {
    if (mode !== 'live') { setNotice('Channel setup becomes live once the Revo inbox migrations are applied.'); return }
    setSaving(true)
    try {
      const status = await manageRevoInboxProviderConnection({ organisationId: organisation.id, connectionId: connection.id, action })
      await load()
      setNotice(action === 'disconnect' ? 'Mailbox disconnected and Arch9’s stored credential was cleared.' : status === 'connected' ? 'Mailbox connection checked and its credential was refreshed.' : 'Mailbox connection needs attention.')
    } catch (error) { setNotice(text(error?.message) || 'The mailbox connection could not be updated.') } finally { setSaving(false) }
  }
  const syncConnection = async (connection) => {
    if (mode !== 'live') { setNotice('Channel setup becomes live once the Revo inbox migrations are applied.'); return }
    setSaving(true)
    try {
      const result = await syncRevoInboxProviderConnection({ organisationId: organisation.id, connectionId: connection.id })
      await load()
      setNotice(`Inbox sync complete: ${result.imported} imported, ${result.skipped} already present or skipped.`)
    } catch (error) { setNotice(text(error?.message) || 'The inbox could not be synced.') } finally { setSaving(false) }
  }

  return <main className="revo-channel-settings">
    <header><div><Link to="/revo/inbox"><ArrowLeft size={16} /> Shared inbox</Link><h1>Channel setup</h1><p>Prepare Revo Email and WhatsApp channels without connecting a provider yet.</p></div><Settings2 size={30} aria-hidden="true" /></header>
    <section className="revo-channel-guidance"><strong>Safe by default</strong><p>This page stores channel labels and addresses only. Provider credentials, OAuth approvals, webhooks, sending, and message import are not available in this phase.</p></section>
    <section className="revo-channel-grid" aria-label="Configured Revo inbox channels">
      {mode === 'loading' ? <p className="revo-channel-empty">Loading channel setup…</p> : null}
      {mode !== 'loading' && !channels.length ? <p className="revo-channel-empty">No channels have been prepared yet. Add Email or WhatsApp below.</p> : null}
      {channels.map((channel) => {
        const providerConnection = connectionByChannelId.get(channel.id)
        const status = statusMeta(channel.connectionStatus)
        return <article key={channel.id}><div className={`revo-channel-icon ${channel.channel}`}><ChannelIcon channel={channel.channel} /></div><div className="revo-channel-card-head"><div><h2>{channel.displayName || channel.address}</h2><p>{channel.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} · {REVO_INBOX_CHANNEL_PROVIDERS[channel.channel]?.find((item) => item.key === channel.providerKey)?.label || channel.providerKey}</p></div><span className={`revo-channel-status ${status.className}`}><status.Icon size={14} /> {status.label}</span></div><p className="revo-channel-address">{channel.address}</p><p className="revo-channel-connection">{providerConnection ? `Provider connection: ${providerConnection.status.replace('_', ' ')}` : channel.providerKey === 'microsoft_365' ? 'Ready for Microsoft authorisation.' : channel.providerKey === 'google_workspace' ? 'Ready for Google Workspace authorisation.' : 'No OAuth connector is planned for this provider.'}</p><footer>{channel.providerKey === 'microsoft_365' ? <button type="button" disabled={saving || providerConnection?.status === 'connected'} onClick={() => void connectMicrosoft(channel)}>{providerConnection?.status === 'connected' ? 'Microsoft connected' : 'Connect Microsoft 365'}</button> : null}{channel.providerKey === 'google_workspace' ? <button type="button" disabled={saving || providerConnection?.status === 'connected'} onClick={() => void connectGoogleWorkspace(channel)}>{providerConnection?.status === 'connected' ? 'Google Workspace connected' : 'Connect Google Workspace'}</button> : null}{providerConnection?.status === 'connected' ? <button type="button" disabled={saving} onClick={() => void syncConnection(providerConnection)}>Sync inbox</button> : null}{providerConnection?.status === 'connected' ? <button type="button" disabled={saving} onClick={() => void manageConnection(providerConnection, 'health_check')}>Check connection</button> : null}{providerConnection ? <button type="button" disabled={saving || providerConnection.status === 'authorizing'} onClick={() => void manageConnection(providerConnection, 'disconnect')}>Disconnect</button> : null}<button type="button" disabled={saving || channel.isDefault} onClick={() => void setDefault(channel.id)}>{channel.isDefault ? 'Default channel' : 'Make default'}</button><button type="button" disabled={saving} onClick={() => void togglePause(channel)}>{channel.connectionStatus === 'paused' ? 'Resume setup' : 'Pause'}</button></footer></article>
      })}
    </section>
    <section className="revo-add-channel"><div><span><Plus size={18} /> Add a channel</span><p>Save its details now. Provider connection happens in the next implementation phase.</p></div><form onSubmit={(event) => void addChannel(event)}><label>Channel type<div className="revo-channel-type"><button type="button" className={form.channel === 'email' ? 'active' : ''} onClick={() => changeChannelType('email')}><Mail size={16} /> Email</button><button type="button" className={form.channel === 'whatsapp' ? 'active' : ''} onClick={() => changeChannelType('whatsapp')}><MessageCircle size={16} /> WhatsApp</button></div></label><label>Provider<select value={form.providerKey} onChange={(event) => setForm({ ...form, providerKey: event.target.value })}>{REVO_INBOX_CHANNEL_PROVIDERS[form.channel].map((provider) => <option key={provider.key} value={provider.key}>{provider.label}</option>)}</select></label><label>{form.channel === 'email' ? 'Inbox email address' : 'WhatsApp business number'}<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder={form.channel === 'email' ? 'inbox@revopropertysite.com' : '+27 11 555 0100'} required /></label><label>Internal label <small>Optional</small><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="e.g. New property enquiries" /></label><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save channel setup'}</button></form>{notice ? <p className="revo-channel-notice" role="status">{notice}</p> : null}</section>
  </main>
}
