import { configureSmtpMailbox, loadSendingMailboxes } from '../../modules/sharedInbox/outgoingMailService.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mail, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { configureImapMailbox, requestMailboxHistory, createMailbox, loadEmailMailboxSettings, loadMailboxPeople, removeMailboxMember, setMailboxMember, updateMailboxAccess } from '../../modules/sharedInbox/mailboxService.js'
import { manageRevoInboxProviderConnection, syncRevoInboxProviderConnection, startRevoGoogleWorkspaceInboxAuthorization, startRevoMicrosoftInboxAuthorization } from '../../modules/revo/sharedInbox/connectionCore.js'
import { setRevoInboxDefaultChannel } from '../../modules/revo/sharedInbox/revoSharedInboxService.js'
import Modal from '../ui/Modal.jsx'
import MailboxSignatureEditor from './MailboxSignatureEditor.jsx'
import './email-mailbox-settings.css'

const PROVIDERS = { google_workspace: 'Google Workspace', microsoft_365: 'Microsoft 365', other_email: 'Other email provider (IMAP)' }
const SCOPES = { private: 'Mailbox owner only', selected: 'Selected team members', workspace: 'Everyone in this workspace' }
const EMPTY = { providerKey: 'google_workspace', address: '', displayName: '', accessScope: 'private', confirmWorkspaceSharing: false }
function connectionProblem(code) {
  const messages = {
    imap_auth_failed: 'The IMAP username or password was rejected. Check the account or use an app password.',
    imap_host_blocked: 'Use a public IMAP server with a valid TLS certificate on port 993.',
    imap_dns_failed: 'The IMAP server could not be found. Check its hostname.',
    imap_connection_failed: 'The secure IMAP connection failed. Check the server and try again.',
    oauth_access_revoked: 'Provider access has expired or was revoked. Reconnect this mailbox.',
    mailbox_identity_mismatch: 'The signed-in provider account does not match this mailbox address. Reconnect with the correct account.',
    provider_rate_limited: 'The provider has temporarily limited requests. This mailbox will retry automatically.',
    google_delegation_unsupported: 'Connect this Google mailbox with its own account, then share access in Inbox settings.',
  }
  return messages[code] || 'This mailbox could not finish receiving messages. It will retry automatically while connected; check or reconnect it if the error continues.'
}
function date(value) { return value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : 'Not yet' }
function connectionLabel(connection) {
  if (connection?.lastErrorCode || connection?.status === 'error') return 'Needs attention'
  if (connection?.syncRunning) return 'Syncing'
  if (connection?.status === 'connected') return connection.lastSyncAt ? 'Synced' : 'Account authorized'
  return connection?.status === 'authorizing' ? 'Awaiting authorization' : 'Not connected'
}
function Sharing({ organisationId, mailbox, busy, run, confirmConnectionSharing, setConfirmConnectionSharing }) {
  const [scope, setScope] = useState(mailbox.accessScope), [confirmSharing, setConfirmSharing] = useState(false), [people, setPeople] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(mailbox.accessScope !== 'private')
  useEffect(() => {
    let active = true
    if (scope === 'private') { setPeople([]); setLoading(false); return () => { active = false } }
    setLoading(true)
    loadMailboxPeople({ organisationId, channelId: mailbox.id }).then(rows => { if (active) setPeople(rows) })
      .catch(cause => { if (active) setError(cause.message || 'Team members could not be loaded.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [organisationId, mailbox.id, scope])
  return <section className="inbox-sharing" aria-label="Mailbox access"><h4>Who can access this mailbox?</h4>
    <form onSubmit={event => { event.preventDefault(); void run(async () => { await updateMailboxAccess({ organisationId, channelId: mailbox.id, accessScope: scope, ...(scope === 'workspace' ? { confirmWorkspaceSharing: confirmSharing } : {}) }); return 'Mailbox access updated. Previous member permissions were cleared.' }) }}>
      <label>Mailbox visibility<select value={scope} disabled={busy} onChange={event => { setScope(event.target.value); setConfirmSharing(false); setConfirmConnectionSharing(false) }}>{Object.entries(SCOPES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {scope === 'workspace' && mailbox.connection?.status !== 'connected' && <label className="inbox-sharing-confirmation"><input type="checkbox" checked={confirmConnectionSharing} onChange={event => setConfirmConnectionSharing(event.target.checked)} />I understand connecting or reconnecting {mailbox.address} makes imported messages accessible to everyone in this organisation.</label>}
      {scope !== mailbox.accessScope && <p>Changing visibility clears the existing member permissions. Add the selected members after saving.</p>}
      {scope === 'workspace' && scope !== mailbox.accessScope && <label className="inbox-sharing-confirmation"><input type="checkbox" checked={confirmSharing} onChange={event => setConfirmSharing(event.target.checked)} />I understand {mailbox.address} and all existing messages will be accessible to everyone in this organisation.</label>}
      <button type="submit" disabled={busy || scope === mailbox.accessScope || (scope === 'workspace' && !confirmSharing)}>Save access</button>
    </form>
    {scope !== 'private' && <><h4 className="inbox-team-permissions-heading">Team permissions</h4><p>{scope === 'workspace' ? 'Everyone can read and work in this mailbox. Explicit roles control sending and management; a viewer role restricts changes.' : 'Choose which team members can access this mailbox.'}</p>
      {scope === 'selected' && scope !== mailbox.accessScope && <p>Save the visibility change before selecting team members.</p>}
      <div className="inbox-team-permissions-scroll" aria-label="Team member permissions" tabIndex={0}>
      {loading && <p role="status">Loading team members…</p>}{error && <p role="alert" className="inbox-settings-error">{error}</p>}
      {people.filter(person => person.user_id !== mailbox.ownerUserId).map(person => scope === 'selected' ? <label className="inbox-member-checkbox" key={person.user_id}><input type="checkbox" aria-label={`Allow ${person.label} to access this mailbox`} checked={Boolean(person.access_role)} disabled={busy || loading || Boolean(error) || scope !== mailbox.accessScope} onChange={event => {
        const input = { organisationId, channelId: mailbox.id, userId: person.user_id }
        const checked = event.target.checked
        void run(async () => {
          if (checked) await setMailboxMember({ ...input, accessRole: 'responder' }); else await removeMailboxMember(input)
          return 'Mailbox member access updated.'
        })
      }} /><span>{person.label}</span></label> : <label className="inbox-member" key={person.user_id}><span>{person.label}</span><select aria-label={`Access for ${person.label}`} value={person.access_role || ''} disabled={busy || loading || Boolean(error)} onChange={event => {
        const role = event.target.value
        void run(async () => {
          const input = { organisationId, channelId: mailbox.id, userId: person.user_id }
          if (role) await setMailboxMember({ ...input, accessRole: role }); else await removeMailboxMember(input)
          return 'Mailbox member permissions updated.'
        })
      }}><option value="">Workspace access</option><option value="viewer">Viewer</option><option value="responder">Responder</option><option value="manager">Manager</option></select></label>)}
      {scope === 'workspace' && <small>Viewers can read. Responders can work with conversations and are permitted to send when sending is available. Managers can also change settings and access.</small>}
      </div>
    </>}
  </section>
}
function ImapSetup({ organisationId, mailbox, busy, run, confirmSharing = true }) {
  const [host, setHost] = useState(''), [username, setUsername] = useState(mailbox.address), [password, setPassword] = useState('')
  return <form aria-label="Secure IMAP connection" onSubmit={event => {
    event.preventDefault()
    const credential = { organisationId, channelId: mailbox.id, host, username, password }
    setPassword('')
    if (!confirmSharing) return
    void run(async () => { await configureImapMailbox(credential); return 'IMAP connection test queued. Refresh mailboxes to see the result.' })
  }}><p>Use your provider’s IMAP server and an app password if required. Receiving uses encrypted IMAP on port 993.</p>
    <div className="inbox-form-grid"><label>IMAP server<input required maxLength={253} value={host} disabled={busy} placeholder="imap.example.com" onChange={event => setHost(event.target.value)} /></label>
    <label>IMAP username<input required autoComplete="off" value={username} maxLength={500} disabled={busy} onChange={event => setUsername(event.target.value)} /></label>
    <label>IMAP password<input required type="password" autoComplete="new-password" maxLength={2000} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label></div>
    <button type="submit" disabled={busy || !confirmSharing}>{mailbox.connection ? 'Save IMAP connection again' : 'Connect IMAP mailbox'}</button>
  </form>
}
function SmtpSetup({ organisationId, mailbox, busy, run }) {
  const [host,setHost]=useState(''),[port,setPort]=useState('465'),[username,setUsername]=useState(mailbox.address),[password,setPassword]=useState('')
  const [configured,setConfigured]=useState(null)
  useEffect(()=>{let active=true;loadSendingMailboxes(organisationId).then(rows=>{if(active)setConfigured(rows.find(box=>box.id===mailbox.id)?.smtpConfigured===true)}).catch(()=>{});return()=>{active=false}},[organisationId,mailbox.id])
  return <form aria-label="Secure SMTP sending" onSubmit={event=>{event.preventDefault();const input={organisationId,channelId:mailbox.id,host,port:Number(port),username,password};setPassword('');void run(async()=>{await configureSmtpMailbox(input);return 'SMTP settings saved. Authentication is checked when sending an email.'})}}>
    <h4>Outgoing email (SMTP)</h4><p>{configured===true?'SMTP sending is configured. Authentication is checked when sending.':'Save your provider’s SMTP settings to send from this mailbox.'}</p>
    <div className="inbox-form-grid"><label>SMTP server<input required maxLength={253} placeholder="smtp.example.com" disabled={busy} value={host} onChange={event=>setHost(event.target.value)}/></label>
    <label>SMTP port<select value={port} disabled={busy} onChange={event=>setPort(event.target.value)}><option value="465">465 · encrypted TLS</option><option value="587">587 · required STARTTLS</option></select></label>
    <label>SMTP username<input required maxLength={500} autoComplete="off" value={username} disabled={busy} onChange={event=>setUsername(event.target.value)}/></label>
    <label>SMTP password<input required type="password" autoComplete="new-password" maxLength={2000} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)}/></label></div>
    <button type="submit" disabled={busy}>Save SMTP settings</button>
  </form>
}
function MailboxDetails({ organisationId, userId, mailbox, busy, run, alive, canSetDefault, confirmConnectionSharing, setConfirmConnectionSharing }) {
  const [kind, setKind] = useState(mailbox.providerKey === 'google_workspace' ? 'individual_mailbox' : mailbox.connection?.connectionKind || 'individual_mailbox')
  const connection = mailbox.connection
  const connectionAccessConfirmed = mailbox.accessScope !== 'workspace' || confirmConnectionSharing
  const [historyDays, setHistoryDays] = useState(String(connection?.initialHistoryDays ?? 30))
  const manage = mailbox.permissions.manage === true
  const connect = () => run(async () => {
    if (!connectionAccessConfirmed) throw new Error('Confirm sharing imported messages with the organisation.')
    const start = mailbox.providerKey === 'microsoft_365' ? startRevoMicrosoftInboxAuthorization : startRevoGoogleWorkspaceInboxAuthorization
    const authorizationUrl = await start({ organisationId, channelId: mailbox.id, connectionKind: kind, mailboxAddress: mailbox.address, actorUserId: userId,
      returnUrl: new URL('/inbox/settings', window.location.origin).href })
    if (alive.current) window.location.assign(authorizationUrl)
    return 'Opening mailbox authorisation…'
  })
  return <section aria-label={`Settings for ${mailbox.address}`}>
    <div className="inbox-settings-heading inbox-account-heading"><div className="inbox-account-identity"><span className="inbox-provider-icon"><Mail size={21} aria-hidden="true" /></span><div><h3>{mailbox.displayName || mailbox.address}</h3><p>{mailbox.address}</p><small>{PROVIDERS[mailbox.providerKey] || mailbox.providerKey}</small></div></div><div className="inbox-account-header-actions">{manage && mailbox.providerKey !== 'other_email' && connection?.status !== 'connected' && <button className="inbox-connect-account-action" type="button" disabled={busy || !connectionAccessConfirmed} onClick={() => void connect()}>{connection ? 'Reconnect' : 'Connect'} {PROVIDERS[mailbox.providerKey]}</button>}<span className={`inbox-connection-status ${connection?.status === 'connected' && connection.lastSyncAt && !connection.lastErrorCode ? 'is-connected' : ''}`}><span aria-hidden="true" />{connectionLabel(connection)}</span>{manage && mailbox.accessScope === 'workspace' && canSetDefault && <button className="inbox-default-mailbox-action" type="button" disabled={busy || mailbox.isDefault} onClick={() => void run(async () => { await setRevoInboxDefaultChannel(mailbox.id); return 'Default email mailbox updated.' })}>{mailbox.isDefault ? 'Default email mailbox' : 'Make default email mailbox'}</button>}</div></div>
    <dl className="inbox-mailbox-facts"><div><dt>Access</dt><dd>{SCOPES[mailbox.accessScope]}</dd></div><div><dt>Last sync (SAST)</dt><dd>{date(connection?.lastSyncAt)}</dd></div><div><dt>Connection checked (SAST)</dt><dd>{date(connection?.lastVerifiedAt)}</dd></div></dl>
    {connection?.lastErrorCode && <p className="inbox-settings-error" role="status">{connectionProblem(connection.lastErrorCode)}</p>}
    {connection?.syncRunning ? <p className="inbox-sync-state" role="status">Receiving messages…</p> : connection?.syncPending ? <p className="inbox-sync-state" role="status">{connection.lastSyncAt ? 'Sync requested. Waiting for email processing.' : 'Account authorized. Waiting for the first inbox sync.'} Refresh to check progress.</p> : connection?.status === 'connected' && !connection.lastSyncAt ? <p className="inbox-sync-state" role="status">Account authorized. Email sync has not completed yet.</p> : null}
    {manage ? <>
      {mailbox.providerKey === 'other_email' && <><ImapSetup organisationId={organisationId} mailbox={mailbox} busy={busy} run={run} confirmSharing={connectionAccessConfirmed} />{connection?.status==='connected' ? <SmtpSetup organisationId={organisationId} mailbox={mailbox} busy={busy} run={run} /> : <p>Connect receiving first, then configure SMTP to send email.</p>}</>}
      <div className="inbox-connection-actions">
        {mailbox.providerKey === 'microsoft_365' && connection?.status !== 'connected' && <label>Microsoft mailbox type<select value={kind} disabled={busy} onChange={event => setKind(event.target.value)}><option value="individual_mailbox">Individual mailbox</option><option value="delegated_shared_mailbox">Delegated shared mailbox</option></select></label>}
        {connection?.status === 'connected' && <button type="button" disabled={busy} onClick={() => void run(async () => { const result = await syncRevoInboxProviderConnection({ organisationId, connectionId: connection.id }); return result.status === 'queued' ? 'Inbox sync queued. Refresh mailboxes to see its progress.' : `Inbox sync complete: ${result.imported} imported, ${result.skipped} already present or skipped.` })}>Sync inbox</button>}
        {connection?.status === 'connected' && <button type="button" disabled={busy} onClick={() => void run(async () => { const status = await manageRevoInboxProviderConnection({ organisationId, connectionId: connection.id, action: 'health_check' }); return status === 'queued' ? 'Mailbox connection check queued.' : 'Mailbox connection checked.' })}>Check connection</button>}
      </div>
      <Sharing organisationId={organisationId} mailbox={mailbox} busy={busy} run={run} confirmConnectionSharing={confirmConnectionSharing} setConfirmConnectionSharing={setConfirmConnectionSharing} />
      {connection && <details className="inbox-account-advanced"><summary>Advanced account settings<span>Import history & connection</span></summary>
      {connection?.status === 'connected' && <form className="inbox-history-form" onSubmit={event => { event.preventDefault(); void run(async () => {
        await requestMailboxHistory({ organisationId, connectionId: connection.id, historyDays: Number(historyDays) })
        return 'History import queued. Existing messages are kept and duplicates are checked.'
      }) }}><label>Initial inbox history<select value={historyDays} disabled={busy} onChange={event => setHistoryDays(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="0">All available inbox history</option></select></label><button type="submit" disabled={busy}>Apply history window</button></form>}
      <div className="inbox-disconnect-row"><div><h4>Disconnect account</h4><p>Stop syncing this mailbox and remove its saved connection.</p></div><button className="inbox-disconnect-button" type="button" disabled={busy} onClick={() => void run(async () => { await manageRevoInboxProviderConnection({ organisationId, connectionId: connection.id, action: 'disconnect' }); return 'Mailbox disconnected. Its stored credential was cleared.' })}>Disconnect mailbox</button></div>
      </details>}
    </> : <p>Only the mailbox owner or a mailbox manager can change its settings.</p>}
  </section>
}
function EmailMailboxWorkspace({ organisationId, userId, tab, showTabs = true }) {
  const [localTab, setLocalTab] = useState('mailboxes'), [data, setData] = useState({ mailboxes: [], canCreatePrivate: false, canCreateShared: false })
  const [selectedId, setSelectedId] = useState(''), [form, setForm] = useState(EMPTY), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [version, setVersion] = useState(0)
  const [addMailboxOpen, setAddMailboxOpen] = useState(false)
  const [confirmConnectionSharing, setConfirmConnectionSharing] = useState(false)
  const alive = useRef(true), sequence = useRef(0), lock = useRef(false)
  const activeTab = tab || localTab
  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true); setError('')
    try {
      const next = await loadEmailMailboxSettings(organisationId)
      if (!alive.current || request !== sequence.current) return
      setData(next); setSelectedId(current => next.mailboxes.some(box => box.id === current) ? current : next.mailboxes[0]?.id || ''); setVersion(current => current + 1)
    } catch (cause) { if (alive.current && request === sequence.current) { setData({ mailboxes: [], canCreatePrivate: false, canCreateShared: false }); setSelectedId(''); setError(/schema|does not exist|could not find|not configured/i.test(cause.message || '') ? 'Mailbox settings need the workspace update before they can be used.' : cause.message || 'Mailboxes could not be loaded.') } }
    finally { if (alive.current && request === sequence.current) setLoading(false) }
  }, [organisationId])
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false } }, [load])
  const run = async action => {
    if (lock.current || loading) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { const message = await action(); if (alive.current) { await load(); if (alive.current) setNotice(message) } }
    catch (cause) { if (alive.current) setError(cause.message || 'Mailbox settings could not be saved.') }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  const selected = data.mailboxes.find(mailbox => mailbox.id === selectedId)
  return <section className="inbox-email-settings" aria-label="Mailbox email settings">
    {showTabs && <div className="inbox-settings-tabs" role="tablist" aria-label="Email settings sections">{[['mailboxes','Mailboxes'],['signatures','Signatures']].map(([value,label]) => <button key={value} type="button" role="tab" aria-selected={activeTab === value} disabled={busy} onClick={() => setLocalTab(value)}>{label}</button>)}</div>}
    <div className="inbox-settings-heading inbox-section-heading"><div><h2>{activeTab === 'signatures' ? 'Email signatures' : 'Email accounts'}</h2><p>{activeTab === 'signatures' ? 'A consistent sign-off for every conversation.' : 'Connect your email and choose who can access it.'}</p></div><button type="button" disabled={busy || loading} onClick={() => void load()} aria-label="Refresh mailboxes"><RefreshCw size={14} aria-hidden="true" /> Refresh</button></div>
    {error && <p className="inbox-settings-error" role="alert">{error}</p>}
    {notice && <p className="inbox-settings-notice" role="status">{notice}</p>}
    {loading ? <p role="status">Loading mailboxes…</p> : <>
      {data.mailboxes.length ? <div className={`inbox-settings-layout ${data.mailboxes.length === 1 ? 'inbox-settings-single' : ''}`}><nav aria-label="Choose a mailbox" className="inbox-mailbox-list">{data.mailboxes.map(mailbox => <button key={mailbox.id} type="button" disabled={busy} aria-current={selectedId === mailbox.id ? 'true' : undefined} onClick={() => { setSelectedId(mailbox.id); setError(''); setNotice(''); setConfirmConnectionSharing(false) }}><strong>{mailbox.displayName || mailbox.address}</strong><span>{mailbox.address}</span><small><ShieldCheck size={12} aria-hidden="true" />{SCOPES[mailbox.accessScope]}</small></button>)}{activeTab === 'mailboxes' && data.canCreatePrivate && <button className="inbox-add-new-action" type="button" disabled={busy} onClick={() => { setForm(EMPTY); setError(''); setAddMailboxOpen(true) }}><Plus size={15} aria-hidden="true" />Add new inbox</button>}</nav><div className="inbox-mailbox-detail">{selected && (activeTab === 'signatures' ? <MailboxSignatureEditor key={`${selected.id}:${version}`} organisationId={organisationId} mailbox={selected} /> : <MailboxDetails key={`${selected.id}:${version}`} organisationId={organisationId} userId={userId} mailbox={selected} busy={busy} run={run} alive={alive} canSetDefault={data.canCreateShared} confirmConnectionSharing={confirmConnectionSharing} setConfirmConnectionSharing={setConfirmConnectionSharing} />)}</div></div> : !error && <div className="inbox-settings-empty"><p>No email accounts yet. Add your first account to get started.</p>{activeTab === 'mailboxes' && data.canCreatePrivate && <button type="button" onClick={() => { setForm(EMPTY); setAddMailboxOpen(true) }}><Plus size={15} aria-hidden="true" />Add new inbox</button>}</div>}
      {activeTab === 'mailboxes' && data.canCreatePrivate && <Modal open={addMailboxOpen} onClose={() => { if (!busy) setAddMailboxOpen(false) }} title="Add new inbox" subtitle="Add an email account and choose who can access it." className="inbox-add-mailbox-modal"><form onSubmit={event => { event.preventDefault(); void run(async () => { const saved = await createMailbox({ ...form, organisationId, actorUserId: userId }); if (alive.current) { setForm(EMPTY); setSelectedId(saved.id); setAddMailboxOpen(false) } return 'Mailbox saved. You can now configure its access and signature.' }) }}>
        <div className="inbox-form-grid"><label>Email provider<select value={form.providerKey} disabled={busy} onChange={event => setForm(current => ({ ...current, providerKey: event.target.value }))}>{Object.entries(PROVIDERS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Mailbox email address<input type="email" required value={form.address} disabled={busy} onChange={event => setForm(current => ({ ...current, address: event.target.value, confirmWorkspaceSharing: false }))} /></label>
        <label>Mailbox label<input value={form.displayName} disabled={busy} maxLength={200} placeholder="e.g. Sales enquiries" onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} /></label>
        <label>Who can access it?<select value={form.accessScope} disabled={busy} onChange={event => setForm(current => ({ ...current, accessScope: event.target.value, confirmWorkspaceSharing: false }))}><option value="private">Mailbox owner only</option>{data.canCreateShared && <><option value="selected">Selected team members</option><option value="workspace">Everyone in this workspace</option></>}</select></label></div>
        {form.accessScope === 'workspace' && <label className="inbox-sharing-confirmation"><input type="checkbox" checked={form.confirmWorkspaceSharing} onChange={event => setForm(current => ({ ...current, confirmWorkspaceSharing: event.target.checked }))} />I understand {form.address || 'this mailbox'} and imported messages will be accessible to everyone in this organisation.</label>}
        {form.accessScope === 'selected' && <p>Add team members after saving this mailbox.</p>}
        <button type="submit" className="inbox-primary" disabled={busy || (form.accessScope === 'workspace' && !form.confirmWorkspaceSharing)}>{busy ? 'Saving mailbox…' : 'Save mailbox'}</button>
      </form></Modal>}
    </>}
  </section>
}
export default function EmailMailboxSettings(props) {
  if (!props.organisationId || !props.userId) return <p>Choose an organisation workspace to manage mailboxes.</p>
  return <EmailMailboxWorkspace key={`${props.organisationId}:${props.userId}`} {...props} />
}
