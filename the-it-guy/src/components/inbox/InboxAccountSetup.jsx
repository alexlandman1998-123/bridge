import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Facebook, Instagram, Mail, MessageCircle, ShieldCheck } from 'lucide-react'
import Modal from '../ui/Modal'
import { launchWhatsAppSignup, metaIntegrationRequest, prepareFacebookSdk } from '../../services/metaIntegrationService'
import { configureImapMailbox, createMailbox, loadEmailMailboxSettings } from '../../modules/sharedInbox/mailboxService'
import { configureSmtpMailbox } from '../../modules/sharedInbox/outgoingMailService'
import { startRevoGoogleWorkspaceInboxAuthorization, startRevoMicrosoftInboxAuthorization } from '../../modules/revo/sharedInbox/connectionCore'
import './InboxAccountSetup.css'

function Intro({ title, children }) { return <div className="inbox-setup-intro"><h2>{title}</h2><p>{children}</p></div> }
function Steps({ current, labels }) { return <ol className="inbox-setup-steps" aria-label="Connection steps">{labels.map((label,index)=><li key={label} aria-current={index===current?'step':undefined} className={index<current?'is-complete':index===current?'is-current':''}><span className="inbox-setup-step-number" aria-hidden="true">{index<current?<Check size={15}/>:index+1}</span><span className="inbox-setup-step-label">{label}</span></li>)}</ol> }
function Result({ title, children, onDone }) { return <div className="inbox-setup-result"><span><Check size={24}/></span><h2>{title}</h2><p>{children}</p><button type="button" className="inbox-setup-primary" onClick={onDone}>Back to Inbox<ArrowRight size={15}/></button></div> }

function WhatsAppSetup({ workspace, onConnected }) {
  const [session, setSession] = useState(null)
  const [selectedPhone, setSelectedPhone] = useState('')
  const [sender, setSender] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const alive = useRef(true), lock = useRef(false), controller = useRef(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort() } }, [])
  // The active Meta endpoint permits administrators to manage connections.
  const allowed = workspace.canManage
  async function prepare() {
    if (lock.current || !allowed) return
    lock.current = true; setBusy(true); setError('')
    try {
      const intent = await metaIntegrationRequest(workspace.organisationId, 'begin_whatsapp', { coexistence: true })
      const sdk = await prepareFacebookSdk(intent.appId, intent.graphVersion)
      if (alive.current) { setSession({ intent, sdk, coexistence: true }); setSelectedPhone('') }
    } catch (cause) { if (alive.current) setError(cause.message) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function connect() {
    if (lock.current || !session || (session.phones && !session.phones.some(phone => phone.id === selectedPhone))) return
    lock.current = true; setBusy(true); setError(''); controller.current = new AbortController()
    try {
      const result = session.phones
        ? await metaIntegrationRequest(workspace.organisationId, 'finish_whatsapp', { state: session.intent.state, wabaId: session.wabaId, phoneNumberId: selectedPhone })
        : await launchWhatsAppSignup({ ...session, organisationId: workspace.organisationId, signal: controller.current.signal })
      if (!alive.current) return
      if (result.requiresPhoneSelection) {
        if (!Array.isArray(result.phones) || !result.phones.length) throw new Error('No eligible WhatsApp Business numbers were returned. Check the account selected in Meta, then try again.')
        setSession(old => ({ ...old, phones: result.phones, wabaId: result.wabaId })); return
      }
      if (!result.sender?.id) throw new Error('Meta did not confirm a number. Check your connection before trying again.')
      setSender(result.sender); setNotice(result.syncWarning || '')
      void Promise.resolve().then(() => workspace.refresh()).catch(() => { if (alive.current) setNotice('Number linked. Refresh the Inbox to load its latest status.') })
    } catch (cause) { if (alive.current) { setError(cause.message); setSession(null) } }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function checkConnection() {
    if (lock.current || !sender) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await metaIntegrationRequest(workspace.organisationId, 'health_sender', { senderId: sender.id })
      if (!result.sender?.id) throw new Error('The connection status could not be confirmed. Try checking again.')
      if (alive.current) setSender(result.sender)
    } catch (cause) { if (alive.current) setError(cause.message) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  const connected = sender?.connection_status === 'connected'
  return <>
    <Steps current={sender ? 2 : session ? 1 : 0} labels={['Your number', 'Connect with Meta', 'Confirm connection']} />
    {!allowed ? <p role="alert">An organisation administrator must connect a WhatsApp number.</p>
      : connected ? <Result title="WhatsApp connected" onDone={onConnected}>{sender.display_phone_number} is connected to this organisation. Keep WhatsApp Business open on your phone while contacts and shared history sync.{notice && ` ${notice}`}</Result>
      : sender ? <>
        <div className="inbox-setup-account"><MessageCircle size={20}/><div><strong>{sender.display_phone_number || 'WhatsApp Business'}</strong><small>Waiting for Meta confirmation</small></div></div>
        <p className="inbox-setup-hint">Finish any verification requested in Meta. Your number will appear as connected once Meta confirms it.</p>
        <button type="button" className="inbox-setup-primary" disabled={busy} onClick={() => void checkConnection()}>{busy ? 'Checking…' : 'Check connection'}</button>
      </> : session ? <>
        <div className="inbox-setup-note"><ShieldCheck size={18}/><p>Choose your business account and existing number in Meta. Keep your phone nearby and choose Share chats when prompted.</p></div>
        {session.phones && <label>WhatsApp number<select value={selectedPhone} disabled={busy} onChange={event => setSelectedPhone(event.target.value)}><option value="">Choose number</option>{session.phones.map(phone => <option key={phone.id} value={phone.id}>{phone.displayPhoneNumber || phone.display_phone_number || phone.id}</option>)}</select></label>}
        <button type="button" className="inbox-setup-primary" disabled={busy || Boolean(session.phones && !selectedPhone)} onClick={() => void connect()}>{busy ? 'Waiting for Meta…' : session.phones ? 'Connect selected number' : 'Continue with Meta'}<ArrowRight size={15}/></button>
      </> : <>
        <div className="inbox-setup-account"><MessageCircle size={22}/><div><strong>Connect your WhatsApp Business number</strong><small>Keep using the WhatsApp Business app on your phone.</small></div></div>
        <p className="inbox-setup-hint">Have your phone ready. You’ll choose your existing business number securely in Meta and connect it to this organisation.</p>
        <button type="button" className="inbox-setup-primary" disabled={busy || workspace.loading} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Continue'}<ArrowRight size={15}/></button>
      </>}
    {error && <p role="alert" className="inbox-setup-error">{error}</p>}
  </>
}

function EmailSetup({ organisationId, userId, onConnected }) {
  const [data,setData]=useState(null),[provider,setProvider]=useState('google_workspace'),[address,setAddress]=useState(''),[label,setLabel]=useState(''),[access,setAccess]=useState('private'),[mailbox,setMailbox]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [imap,setImap]=useState({host:'',username:'',password:''}),[smtp,setSmtp]=useState({host:'',port:'465',username:'',password:''}),[sendingReady,setSendingReady]=useState(false)
  const alive=useRef(true),lock=useRef(false),popup=useRef(null)
  const refresh=useCallback(async(id)=>{const next=await loadEmailMailboxSettings(organisationId);if(alive.current){setData(next);if(id)setMailbox(previous=>next.mailboxes.find(box=>box.id===id)||previous)}return next},[organisationId])
  useEffect(()=>{alive.current=true;void refresh().catch(cause=>{if(alive.current)setError(cause.message)});return()=>{alive.current=false;popup.current?.close()}},[refresh])
  async function run(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action()}catch(cause){if(alive.current)setError(cause.message)}finally{lock.current=false;if(alive.current)setBusy(false)}}
  async function save(event){event.preventDefault();void run(async()=>{const saved=await createMailbox({organisationId,actorUserId:userId,providerKey:provider,address,displayName:label,accessScope:access});if(!alive.current)return;setMailbox(saved);setImap(value=>({...value,username:saved.address}));setSmtp(value=>({...value,username:saved.address}));await refresh(saved.id)})}
  function authorize(){if(lock.current)return;const child=window.open('about:blank',`arch9-mailbox-${mailbox.id}`,'popup,width=620,height=760');if(!child){setError('Allow pop-ups to connect your email account.');return}child.opener=null;popup.current=child;void run(async()=>{try{const start=mailbox.providerKey==='microsoft_365'?startRevoMicrosoftInboxAuthorization:startRevoGoogleWorkspaceInboxAuthorization;const url=await start({organisationId,channelId:mailbox.id,mailboxAddress:mailbox.address,actorUserId:userId,connectionKind:'individual_mailbox',returnUrl:new URL('/inbox',window.location.origin).href});if(!alive.current){child.close();return}child.location.href=url;setNotice('Finish signing in in the provider window, then check the connection below.')}catch(cause){child.close();throw cause}})}
  const connected=mailbox?.connection?.status==='connected'
  if(connected&&(mailbox.providerKey!=='other_email'||sendingReady))return <><Steps current={2} labels={['Account','Connect','Confirm']}/><Result title="Email connected" onDone={onConnected}>{mailbox.address} is connected. Arch9 will show messages as the mailbox sync runs.{mailbox.providerKey==='other_email'&&' Sending credentials are saved and will be verified on the first send.'}</Result></>
  return <><Steps current={mailbox?1:0} labels={['Account','Connect','Confirm']}/>
    {!mailbox?<form onSubmit={save}><label>Email provider<select value={provider} onChange={event=>setProvider(event.target.value)}><option value="google_workspace">Google Workspace / Gmail</option><option value="microsoft_365">Microsoft 365 / Outlook</option><option value="other_email">Other provider — IMAP & SMTP</option></select></label><label>Email address<input required type="email" autoComplete="email" placeholder="you@company.com" value={address} onChange={event=>setAddress(event.target.value)}/></label><label>Inbox name<input value={label} placeholder="e.g. Sales enquiries" maxLength={200} onChange={event=>setLabel(event.target.value)}/></label><label>Who can access this inbox?<select value={access} onChange={event=>setAccess(event.target.value)}><option value="private">Only me</option>{data?.canCreateShared&&<option value="workspace">Everyone in this organisation</option>}</select></label><button className="inbox-setup-primary" disabled={busy||!data?.canCreatePrivate}>{busy?'Saving…':'Continue'}<ArrowRight size={15}/></button>{data&&!data.canCreatePrivate&&<p role="alert">Your workspace role cannot add a mailbox.</p>}{data?.mailboxes.some(box=>box.permissions?.manage&&box.connection?.status!=='connected')&&<label>Or finish an existing setup<select value="" onChange={event=>{const box=data.mailboxes.find(item=>item.id===event.target.value);if(box){setMailbox(box);setImap(value=>({...value,username:box.address}));setSmtp(value=>({...value,username:box.address}))}}}><option value="">Choose a mailbox</option>{data.mailboxes.filter(box=>box.permissions?.manage&&box.connection?.status!=='connected').map(box=><option key={box.id} value={box.id}>{box.address}</option>)}</select></label>}</form>:<><div className="inbox-setup-account"><Mail size={20}/><div><strong>{mailbox.displayName||mailbox.address}</strong><small>{mailbox.address}</small></div><span>{connected?'Receiving connected':'Not connected'}</span></div>{mailbox.providerKey!=='other_email'?<button type="button" className="inbox-setup-primary" disabled={busy} onClick={authorize}>Sign in with {mailbox.providerKey==='microsoft_365'?'Microsoft':'Google'}<ArrowRight size={15}/></button>:connected?<form onSubmit={event=>{event.preventDefault();const values={...smtp};setSmtp(old=>({...old,password:''}));void run(async()=>{await configureSmtpMailbox({organisationId,channelId:mailbox.id,host:values.host,port:Number(values.port),username:values.username,password:values.password});if(alive.current)setSendingReady(true)})}}><h3>Set up sending</h3><label>SMTP server<input required value={smtp.host} onChange={event=>setSmtp(old=>({...old,host:event.target.value}))}/></label><label>Secure port<select value={smtp.port} onChange={event=>setSmtp(old=>({...old,port:event.target.value}))}><option value="465">465 — TLS</option><option value="587">587 — STARTTLS</option></select></label><label>Username<input required value={smtp.username} onChange={event=>setSmtp(old=>({...old,username:event.target.value}))}/></label><label>App password<input required type="password" autoComplete="new-password" value={smtp.password} onChange={event=>setSmtp(old=>({...old,password:event.target.value}))}/></label><button className="inbox-setup-primary" disabled={busy}>Save sending connection</button><small>Sending credentials are verified when an email is sent.</small></form>:<form onSubmit={event=>{event.preventDefault();const values={...imap};setImap(old=>({...old,password:''}));void run(async()=>{await configureImapMailbox({organisationId,channelId:mailbox.id,...values});if(alive.current)setNotice('The receiving connection is being tested. Check the connection below.');await refresh(mailbox.id)})}}><label>IMAP server<input required placeholder="imap.company.com" value={imap.host} onChange={event=>setImap(old=>({...old,host:event.target.value}))}/></label><label>Username<input required value={imap.username} onChange={event=>setImap(old=>({...old,username:event.target.value}))}/></label><label>App password<input required type="password" autoComplete="new-password" value={imap.password} onChange={event=>setImap(old=>({...old,password:event.target.value}))}/></label><small>Receiving uses encrypted IMAP on port 993.</small><button className="inbox-setup-primary" disabled={busy}>Connect receiving</button></form>}<button type="button" className="inbox-setup-secondary" disabled={busy} onClick={()=>void run(()=>refresh(mailbox.id))}>Check connection</button></>}
    {notice&&<p role="status" className="inbox-setup-note">{notice}</p>}{error&&<p role="alert" className="inbox-setup-error">{error}</p>}
  </>
}

function MetaSetup({ workspace }) {
  const [platform,setPlatform]=useState('facebook')
  return <><Intro title="Connect Meta messaging">Bring Facebook Messenger or Instagram direct messages into your Inbox.</Intro>
    <div className="inbox-setup-options"><button type="button" aria-pressed={platform==='facebook'} onClick={()=>setPlatform('facebook')}><Facebook size={22}/><strong>Messenger</strong><small>Messages sent to your Facebook Page</small></button><button type="button" aria-pressed={platform==='instagram'} onClick={()=>setPlatform('instagram')}><Instagram size={22}/><strong>Instagram</strong><small>Direct messages to a professional account</small></button></div>
    {!workspace.canManage?<p role="alert">An organisation administrator must connect Meta messaging.</p>:<div className="inbox-setup-note"><ShieldCheck size={19}/><div><strong>Messaging setup needs activation</strong><p>Messenger and Instagram messaging are not yet available in Arch9.</p></div></div>}
    <p className="inbox-setup-hint">{platform==='facebook'?'You’ll need a Facebook Page you manage.':'You’ll need an Instagram professional account.'} This is separate from your existing lead forms and publishing connection. Your existing lead forms and publishing connection does not enable direct messages.</p>
  </>
}

function InboxAccountSetupDialog({ open, onClose, workspace, userId, onConnected }) {
  const [channel,setChannel]=useState('')
  const choices=[{id:'whatsapp',name:'WhatsApp',icon:<MessageCircle size={25}/>,description:'Connect your business number and conversations.',hint:'Your existing WhatsApp Business number'},{id:'email',name:'Email',icon:<Mail size={25}/>,description:'Bring your mailbox and replies into one place.',hint:'Google, Microsoft or IMAP'},{id:'meta',name:'Meta',icon:<Facebook size={25}/>,description:'Connect Messenger and Instagram direct messages.',hint:'Messenger & Instagram · not yet available'}]
  function done(){onConnected?.();onClose()}
  return <Modal open={open} onClose={onClose} title={channel?`Add ${choices.find(item=>item.id===channel)?.name} inbox`:'Add an inbox'} subtitle={channel?'':'Choose where your conversations come from.'} className="inbox-account-setup">
    {open && (channel?<><button type="button" className="inbox-setup-back" onClick={()=>setChannel('')}><ArrowLeft size={14}/>All channels</button>{channel==='whatsapp'?<WhatsAppSetup key={workspace.organisationId} workspace={workspace} onConnected={done}/>:channel==='email'?<EmailSetup key={workspace.organisationId} organisationId={workspace.organisationId} userId={userId} onConnected={done}/>:<MetaSetup workspace={workspace} onConnected={done}/>}</>:<><div className="inbox-setup-choices">{choices.map(({id,name,icon,description,hint})=><button type="button" key={id} onClick={()=>setChannel(id)}><span className={`inbox-setup-channel channel-${id}`}>{icon}</span><strong>{name}</strong><p>{description}</p><small>{hint}</small><ArrowRight className="inbox-setup-choice-arrow" size={16}/></button>)}</div><p className="inbox-setup-footer"><ShieldCheck size={14}/>Accounts are connected to your current organisation. You choose who has access.</p></>)}
  </Modal>
}

export default function InboxAccountSetup(props) {
  return props.open ? <InboxAccountSetupDialog key={`${props.workspace.organisationId}:${props.userId}`} {...props} /> : null
}
