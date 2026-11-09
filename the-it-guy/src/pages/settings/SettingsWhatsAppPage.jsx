import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ExternalLink, Inbox, Megaphone, MessageCircle, Plus, RefreshCw } from 'lucide-react'
import WhatsAppBusinessAppSync from '../../components/marketing/WhatsAppBusinessAppSync'
import WhatsAppInboxOperations from '../../components/inbox/WhatsAppInboxOperations'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import { launchWhatsAppSignup, metaIntegrationRequest, prepareFacebookSdk } from '../../services/metaIntegrationService'
import { settingsPageClass } from './settingsUi'
import './SettingsWhatsAppPage.css'


function InlineDialog({open,title,subtitle,onClose,footer,children}) {
  const panel=useRef(null)
  useEffect(()=>{if(!open)return undefined;const timer=setTimeout(()=>{panel.current?.scrollIntoView?.({block:'nearest'});panel.current?.querySelector('input,select,button')?.focus()},0);return()=>clearTimeout(timer)},[open])
  return open?<section ref={panel} className="whatsapp-inline-setup" aria-label={title}><header><h2>{title}</h2>{onClose&&<button type="button" onClick={onClose} aria-label={`Close ${title}`}>Close</button>}</header>{subtitle&&<p>{subtitle}</p>}{children}<footer>{footer}</footer></section>:null
}

export default function SettingsWhatsAppPage({embedded=false,onConnected}) {
  const workspace = useMetaWorkspace()
  const { organisationId, senders, loading, refresh, canManage, currentUserId, canConnectOwn } = workspace
  const accessScope = workspace.accessScope || organisationId
  const assignees = workspace.assignees || []
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState('')
  const [connection, setConnection] = useState(null), [coexistence, setCoexistence] = useState(true)
  const [adding, setAdding] = useState(false)
  const [expandedSender,setExpandedSender] = useState('')
  const [disconnect,setDisconnect] = useState(null)
  const [connectOwner, setConnectOwner] = useState(''), [ownership, setOwnership] = useState(null), [ownerChoice, setOwnerChoice] = useState('')
  const ownerName = (id) => !id ? 'Shared organisation inbox' : id === currentUserId ? 'My inbox' : assignees.find(agent => agent.id === id)?.name || 'Unavailable agent'
  const [registration, setRegistration] = useState(null), [pin, setPin] = useState('')
  const controller = useRef(null), generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort() }, [])
  useEffect(() => {
    invalidate()
    setDisconnect(null);setExpandedSender('');
    setAdding(false); setConnection(null); setOwnership(null); setConnectOwner(''); setOwnerChoice(''); setRegistration(null); setPin(''); setCoexistence(true); setError(''); setNotice(''); setBusy('')
    return invalidate
  }, [accessScope, invalidate])
  async function prepare() {
    invalidate(); const current = generation.current
    setAdding(false); setError(''); setConnection({ loading: true, accessScope, coexistence })
    try {
      const ownerUserId = canManage ? connectOwner || null : currentUserId
      const intent = await metaIntegrationRequest(organisationId, 'begin_whatsapp', { ownerUserId, coexistence })
      const sdk = await prepareFacebookSdk(intent.appId, intent.graphVersion)
      if (current === generation.current) setConnection({ intent, sdk, ownerUserId, coexistence, loading: false, accessScope })
    } catch (failure) { if (current === generation.current) { setConnection(null); setError(failure.message) } }
  }
  async function connect() {
    const current = generation.current
    controller.current = new AbortController()
    setBusy('connect'); setError('')
    try {
      const data = connection.phones ? await metaIntegrationRequest(organisationId, 'finish_whatsapp', { state: connection.intent.state, wabaId: connection.wabaId, phoneNumberId: connection.selectedPhone }) : await launchWhatsAppSignup({ ...connection, organisationId, coexistence: connection.coexistence, signal: controller.current.signal })
      if (current !== generation.current) return
      if (data.requiresPhoneSelection) { setConnection(old => ({ ...old, phones: data.phones, wabaId: data.wabaId, selectedPhone: '' })); return }
      setConnection(null)
      setNotice(data.syncWarning || (data.sender.onboarding_mode === 'coexistence' ? 'Phone app connected. Keep WhatsApp Business open while initial sync finishes.' : data.sender.connection_status === 'connected' ? data.sender.owner_user_id ? 'WhatsApp connected. New conversations will be assigned to its owner.' : 'WhatsApp connected. This agency number is available to the inbox and campaigns.' : 'Account linked. Activate the number below to complete its WhatsApp registration.'))
      await refresh()
    } catch (failure) { if (current === generation.current) { setConnection(null); setError(failure.message) } }
    finally { if (current === generation.current) setBusy('') }
  }
  async function manage(sender, action) {
    const current = generation.current
    setBusy(sender.id); setError(''); setNotice('')
    try { await metaIntegrationRequest(organisationId, action, { senderId: sender.id }); if (current === generation.current) { if (action === 'disconnect_sender') setNotice(sender.onboarding_mode === 'coexistence' ? 'Arch9 disconnected. To remove the phone app’s platform link, open WhatsApp Business → Settings → Account → Business Platform → Disconnect Account.' : 'WhatsApp disconnected from Arch9.'); await refresh() } }
    catch (failure) { if (current === generation.current) setError(failure.message) }
    finally { if (current === generation.current) setBusy('') }
  }
  function closeConnection() { invalidate(); setConnection(null); setBusy('') }
  async function register() {
    const current = generation.current
    setBusy('register'); setError('')
    try {
      const data = await metaIntegrationRequest(organisationId, 'register_sender', { senderId: registration.id, pin })
      if (current !== generation.current) return
      setRegistration(null); setPin('')
      setNotice(data.sender.connection_status === 'connected' ? data.sender.owner_user_id ? 'Number activated. Incoming conversations will be assigned to its owner.' : 'Number activated. The inbox and campaigns can use this sender.' : 'Registration submitted. Check the connection after Meta completes activation.')
      await refresh()
    } catch (failure) { if (current === generation.current) { setError(failure.message); setPin('') } }
    finally { if (current === generation.current) setBusy('') }
  }
  async function saveOwner() {
    const current = generation.current
    setBusy('owner'); setError(''); setNotice('')
    try {
      await metaIntegrationRequest(organisationId, 'set_sender_owner', { senderId: ownership.id, ownerUserId: ownerChoice || null, ownershipVersion: ownership.ownership_version })
      if (current !== generation.current) return
      setOwnership(null); setNotice('Number ownership saved. Its conversations now follow the selected owner.'); await refresh()
    } catch (failure) {
      if (current === generation.current) { setError(failure.message); if (/ownership changed/i.test(failure.message)) { setOwnership(null); await refresh() } }
    } finally { if (current === generation.current) setBusy('') }
  }
  const Dialog=embedded?InlineDialog:Modal
  return <section className={settingsPageClass}>
    {embedded && <Button variant="secondary" onClick={onConnected}>Back to Inbox</Button>}
    <header className="whatsapp-settings-header">
      <h1><MessageCircle size={24} aria-hidden="true" />WhatsApp Business</h1>
      <Button variant="secondary" disabled={loading || Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</Button>
    </header>
    {(error || workspace.error) ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error || workspace.error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">{notice}</p> : null}
    <section className="overflow-hidden rounded-2xl border border-[#e1e8ef] bg-white shadow-sm" aria-labelledby="whatsapp-numbers-heading">
      <div className="whatsapp-numbers-header">
        <h2 id="whatsapp-numbers-heading">Business numbers{!loading && <span>{senders.length}</span>}</h2>
        {(canManage || canConnectOwn) && <Button size="sm" disabled={Boolean(busy) || loading || Boolean(connection)} onClick={() => { setAdding(true); setError('') }}><Plus size={16} />Add number</Button>}
      </div>
      {loading ? <p role="status" className="px-5 py-10 text-center text-sm text-[#6b7d93]">Loading WhatsApp connections…</p> : senders.length ? <div className="whatsapp-number-list">{senders.map(sender => <article key={sender.id} className="whatsapp-number-row">
        <div className="whatsapp-number-identity"><span className="whatsapp-number-icon"><MessageCircle size={22} aria-hidden="true" /></span><div><h3>{sender.business_display_name || 'WhatsApp Business'}</h3><p>{sender.display_phone_number || 'Number not available'}</p></div></div>
        <div className="whatsapp-number-owner">
          <label htmlFor={`whatsapp-owner-${sender.id}`}>Inbox owner</label>
          {canManage ? <select id={`whatsapp-owner-${sender.id}`} value={sender.owner_user_id || ''} disabled={Boolean(busy)} onChange={event => { setOwnership({ ...sender, accessScope }); setOwnerChoice(event.target.value); setError('') }}>
            <option value="">Shared organisation inbox</option>
            {currentUserId && <option value={currentUserId}>My inbox</option>}
            {sender.owner_user_id && sender.owner_user_id !== currentUserId && !assignees.some(agent => agent.id === sender.owner_user_id) && <option value={sender.owner_user_id} disabled>Unavailable agent</option>}
            {assignees.filter(agent => agent.id !== currentUserId).map(agent => <option key={agent.id} value={agent.id}>{agent.name || agent.email}</option>)}
          </select> : <strong>{ownerName(sender.owner_user_id)}</strong>}
          <small>{sender.owner_user_id ? 'Personal inbox · Campaigns disabled' : 'Shared inbox · Campaigns available'}</small>
        </div>
        <div className="whatsapp-number-status"><span className={sender.connection_status === 'connected' ? 'is-connected' : ''}>{sender.last_error_message?'Needs attention':(({ connected: 'Connected', pending: 'Activation needed', disconnected: 'Disconnected' })[sender.connection_status] || String(sender.connection_status || 'Unknown').replace(/_/g, ' '))}</span></div>
        {canManage || (canConnectOwn && sender.owner_user_id === currentUserId) ? <div className="whatsapp-number-actions">{sender.connection_status === 'pending' && sender.onboarding_mode !== 'coexistence' ? <Button size="sm" disabled={Boolean(busy)} onClick={() => { setRegistration({ ...sender, accessScope }); setPin(''); setError('') }}>Activate number</Button> : null}<Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => void manage(sender, 'health_sender')}>Check connection</Button><Button variant="ghost" size="sm" disabled={Boolean(busy) || sender.connection_status === 'disconnected'} onClick={() => setDisconnect(sender)}>Disconnect</Button></div> : null}
        <div className="w-full text-xs text-slate-600">{sender.last_checked_at ? `Last connection check: ${new Date(sender.last_checked_at).toLocaleString()}` : 'Connection has not been checked yet.'} <button type="button" className="font-semibold underline" aria-expanded={expandedSender===sender.id} onClick={()=>setExpandedSender(old=>old===sender.id?'':sender.id)}>Connection and sync details</button></div>
        {expandedSender===sender.id && sender.onboarding_mode==='coexistence' && <WhatsAppBusinessAppSync organisationId={organisationId} sender={sender}/>}
        {sender.last_error_message && <p role="alert" className="whatsapp-number-error">{sender.last_error_message}</p>}
      </article>)}</div> : <div className="whatsapp-numbers-empty"><MessageCircle size={30} aria-hidden="true" /><h3>No numbers connected</h3><p>Add a business number to start receiving conversations.</p></div>}
      {!canManage && !canConnectOwn && !loading && <p className="px-5 pb-5 text-sm text-slate-600">Ask an organisation administrator to connect a number.</p>}
    </section>
    <WhatsAppInboxOperations key={accessScope} workspace={workspace}/>
    {!embedded && <div className="grid gap-4 md:grid-cols-3">
      <Link to="/inbox?channel=whatsapp" className="group flex min-w-0 items-start gap-3 rounded-2xl border border-[#e1e8ef] bg-white p-5 transition-colors hover:border-[#6ba78f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#248568]"><Inbox size={20} className="mt-0.5 shrink-0 text-[#17634d]" /><div className="min-w-0 flex-1"><span className="text-sm font-semibold text-[#162334]">Open inbox</span><p className="mt-1 text-xs leading-5 text-[#6b7d93]">Read and reply to customer messages.</p></div><ArrowUpRight size={16} className="shrink-0 text-[#8293a5]" /></Link>
      <Link to="/marketing?section=whatsapp" className="group flex min-w-0 items-start gap-3 rounded-2xl border border-[#e1e8ef] bg-white p-5 transition-colors hover:border-[#6ba78f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#248568]"><Megaphone size={20} className="mt-0.5 shrink-0 text-[#17634d]" /><div className="min-w-0 flex-1"><span className="text-sm font-semibold text-[#162334]">Bulk campaigns</span><p className="mt-1 text-xs leading-5 text-[#6b7d93]">Create and manage template campaigns.</p></div><ArrowUpRight size={16} className="shrink-0 text-[#8293a5]" /></Link>
      <a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noreferrer" className="group flex min-w-0 items-start gap-3 rounded-2xl border border-[#e1e8ef] bg-white p-5 transition-colors hover:border-[#6ba78f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#248568]"><MessageCircle size={20} className="mt-0.5 shrink-0 text-[#17634d]" /><div className="min-w-0 flex-1"><span className="text-sm font-semibold text-[#162334]">WhatsApp Manager</span><p className="mt-1 text-xs leading-5 text-[#6b7d93]">Manage your account and numbers in Meta.</p></div><ExternalLink size={16} className="shrink-0 text-[#8293a5]" /></a>
    </div>}
    <Dialog open={Boolean(disconnect)} title="Disconnect WhatsApp" subtitle={disconnect?.display_phone_number} onClose={busy?undefined:()=>setDisconnect(null)} footer={<Button disabled={Boolean(busy)} onClick={async()=>{await manage(disconnect,'disconnect_sender');setDisconnect(null)}}>Disconnect from Arch9</Button>}><p>Arch9 will stop sending and receiving on this number. Existing conversations are preserved. For a phone-app number, the partner link can also be removed in WhatsApp Business settings.</p></Dialog>
    <Dialog open={adding} title="Add WhatsApp number" subtitle="Choose the inbox and how you use the number." onClose={() => setAdding(false)} className="whatsapp-connect-modal" footer={<Button onClick={() => void prepare()}>Continue<ArrowUpRight size={15} /></Button>}>
      <div className="whatsapp-connect-fields">
        <label>Inbox{canManage ? <select aria-label="Inbox" value={connectOwner} onChange={event => setConnectOwner(event.target.value)}><option value="">Shared organisation inbox</option>{currentUserId && <option value={currentUserId}>My inbox</option>}{assignees.filter(agent => agent.id !== currentUserId).map(agent => <option key={agent.id} value={agent.id}>{agent.name || agent.email}</option>)}</select> : <strong>My inbox</strong>}<small>{canManage && !connectOwner ? 'Shared customer conversations. This number can also send campaigns.' : 'Conversations belong to this person. Campaigns are disabled.'}</small></label>
        <label>Number setup<select aria-label="Number setup" value={coexistence ? 'phone' : 'platform'} onChange={event => setCoexistence(event.target.value === 'phone')}><option value="phone">I use WhatsApp Business on my phone</option><option value="platform">Set up a platform-only number</option></select><small>{coexistence ? 'Keep using the phone app alongside Arch9. Have your phone ready for Meta’s connection steps.' : 'Connect a number through Meta without linking the WhatsApp Business phone app.'}</small></label>
      </div>
    </Dialog>
    <Dialog open={Boolean(connection) && connection.accessScope === accessScope} title="Connect WhatsApp" onClose={closeConnection} footer={<Button disabled={connection?.loading || busy === 'connect' || Boolean(connection?.phones && !connection.selectedPhone)} onClick={() => void connect()}>{busy === 'connect' ? 'Waiting for Meta…' : connection?.phones ? 'Connect selected number' : 'Continue with Meta'}</Button>}>
      <p className="text-sm leading-6">Meta will ask you to select a business account and phone number, and confirm the access Arch9 needs.</p>{!connection?.loading ? <p className="mt-3 text-sm font-semibold">Connecting for: {ownerName(connection?.ownerUserId)}. {connection?.ownerUserId ? "Agent numbers are for inbox conversations and cannot send bulk campaigns. Agency management can oversee and reassign conversations received by Arch9." : "Replies to campaign messages enter the agency queue for assignment."}</p> : null}
      {connection?.coexistence && <p className="mt-4 text-sm">Keep the phone app open, complete Meta’s verification, and choose whether to share history. Arch9 will request the available contact names and history once. Your phone-app replies remain available on the phone.</p>}
      {connection?.phones && (connection.phones.length ? <label className="mt-4 grid gap-2 text-sm font-semibold">WhatsApp number<select className="rounded border p-3" value={connection.selectedPhone} disabled={busy === 'connect'} onChange={event => setConnection(old => ({ ...old, selectedPhone: event.target.value }))}><option value="">Choose the number to connect</option>{connection.phones.map(phone => <option key={phone.id} value={phone.id}>{phone.displayPhoneNumber || phone.id}</option>)}</select></label> : <p role="alert" className="mt-4 text-sm text-red-800">Meta returned no eligible phone number. Complete the number setup in WhatsApp Manager, then restart this connection.</p>)}
      {connection?.loading ? <p role="status" className="mt-4 text-sm">Preparing secure Meta login…</p> : null}
    </Dialog>
    <Dialog open={Boolean(ownership) && ownership.accessScope === accessScope} title="Change WhatsApp number owner" subtitle={ownership?.display_phone_number} onClose={busy === 'owner' ? undefined : () => setOwnership(null)} footer={<Button disabled={Boolean(busy) || ownerChoice === (ownership?.owner_user_id || '')} onClick={() => void saveOwner()}>Save ownership</Button>}>
      <label className="grid gap-2 text-sm font-semibold">Number owner<select className="rounded-lg border bg-white p-3 font-normal" value={ownerChoice} disabled={Boolean(busy)} onChange={event => setOwnerChoice(event.target.value)}><option value="">Shared organisation inbox</option>{ownership?.owner_user_id && !assignees.some(agent => agent.id === ownership.owner_user_id) ? <option value={ownership.owner_user_id} disabled>Unavailable agent</option> : null}{assignees.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
      <p className="mt-4 text-sm leading-6">Changing ownership moves all conversations on this number to the selected agent, or returns them to the agency queue. Agency management retains oversight.</p>
      <p className="mt-3 text-sm leading-6">Agent numbers cannot send bulk campaigns. Complete or cancel any active campaign before assigning an agency number to an agent.</p>
      {error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : null}
    </Dialog>
    <Dialog open={Boolean(registration) && registration.accessScope === accessScope} title="Activate WhatsApp number" subtitle={registration?.display_phone_number} onClose={busy === 'register' ? undefined : () => { setRegistration(null); setPin('') }} footer={<Button disabled={Boolean(busy) || !/^\d{6}$/.test(pin)} onClick={() => void register()}>{busy === 'register' ? 'Activating…' : 'Activate number'}</Button>}>
      <p className="text-sm leading-6">Enter the six-digit two-step verification PIN for this business number. For a new number, choose a PIN and keep it securely. Arch9 sends it to Meta for registration without saving it.</p>
      <label className="mt-4 grid gap-2 text-sm font-semibold">Registration PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} disabled={Boolean(busy)} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} className="rounded-lg border border-[#dce6ed] p-3 outline-none focus:border-[#6ba78f] focus:ring-2 focus:ring-[#edf7f3]" /></label>
      {error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : null}
    </Dialog>
  </section>
}
