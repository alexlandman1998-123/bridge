import InboxChannelIcon from './InboxChannelIcon'
import WhatsAppConversationAssignment from './WhatsAppConversationAssignment'
import ClientOrganiser from '../clients/ClientOrganiser'
import InboxCrmActions, { InboxCrmActionButtons } from './InboxCrmActions'
import { InboxContactActivity, InboxContactProfile } from './InboxContactPanels'
import InboxPanelDivider from '../InboxPanelDivider'
import { Link } from 'react-router-dom'
import useInboxContactContext from '../../hooks/useInboxContactContext'
import './WhatsAppConversationReader.css'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, MessageCircle, PanelRightOpen, X, CheckCircle2, Tag, House, Phone, Mail } from 'lucide-react'
import Button from '../ui/Button'
import useWhatsAppHistory from '../../hooks/useWhatsAppHistory'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import { WhatsAppCampaignReplyNotice } from '../marketing/MetaCampaignRoutes'
import WhatsAppCrmLink from '../marketing/WhatsAppCrmLink'
import WhatsAppConversationWork from './WhatsAppConversationWork'
import WhatsAppMessageMedia from './WhatsAppMessageMedia'

const date=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):''
// The same authorised reader is used by the combined Inbox and Marketing.
export default function WhatsAppConversationReader({ workspace, conversationId: selectedId, onChanged, onBack, revision, compact = false, acknowledge = !compact, detailsWidth = 24, onDetailsResize, onDetailsMove, onDetailsReset, initialReply = '', onReplyChange, className='flex min-h-[500px] min-w-0 flex-col' }) {
  const org=workspace.organisationId,scope=workspace.accessScope||org
  const selectionKey=`${scope}:${selectedId}`,active=useRef(selectionKey);active.current=selectionKey
  useEffect(()=>{active.current=selectionKey;return()=>{active.current=null}},[selectionKey])
  const [visible,setVisible]=useState(false)
  const detail=useWhatsAppHistory({organisationId:org,accessScope:scope,conversationId:selectedId,thread:true,enabled:!compact||(acknowledge&&visible)})
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[contactOpen,setContactOpen]=useState(false),[contactTab,setContactTab]=useState('overview'),[crmAction,setCrmAction]=useState('')
  const contactBody=useRef(null)
  useEffect(()=>{if(contactBody.current)contactBody.current.scrollTop=0},[contactOpen,contactTab,selectionKey])
  const history=useRef(null),reader=useRef(null),pinned=useRef(true),lastHeight=useRef(0),lastNewest=useRef(''),newestMessage=detail.rows[0]?.id
  const [atBottom,setAtBottom]=useState(true)
  useEffect(()=>{const node=reader.current;if(!node)return undefined;const update=()=>setVisible(!document.hidden&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0);const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting&&!document.hidden)):null;observer?.observe(node);update();document.addEventListener('visibilitychange',update);window.addEventListener('resize',update);return()=>{observer?.disconnect();document.removeEventListener('visibilitychange',update);window.removeEventListener('resize',update)}},[selectedId])
  useEffect(()=>{const node=history.current;if(!node)return;if(pinned.current)node.scrollTop=node.scrollHeight;else if(lastNewest.current===newestMessage)node.scrollTop+=Math.max(0,node.scrollHeight-lastHeight.current);lastHeight.current=node.scrollHeight;lastNewest.current=newestMessage},[newestMessage,detail.rows.length])
  const through=detail.rows.reduce((latest,message)=>String(message.created_at||'')>latest?message.created_at:latest,'')
  useEffect(()=>{if(!acknowledge||!visible||!atBottom||!through||detail.error)return undefined;let cancelled=false;metaIntegrationRequest(org,'inbox_work',{operation:'read',conversationId:selectedId,fields:{through}}).then(()=>{if(!cancelled)window.dispatchEvent(new Event('arch9:whatsapp-read'))}).catch(()=>{});return()=>{cancelled=true}},[acknowledge,visible,atBottom,through,detail.error,org,selectedId])
  const contactInfo=useInboxContactContext({organisationId:compact&&contactOpen?org:'',accessScope:scope,conversationId:compact?selectedId:''})
  const [pendingOrganiser,setPendingOrganiser]=useState(null)
  const [organiserRevision,setOrganiserRevision]=useState(0)
  const pendingSaving=useRef(false)
  function linkForOrganiser(action){setPendingOrganiser({key:selectionKey,action,ready:false});setCrmAction('link')}
  useEffect(()=>{
    if(!pendingOrganiser?.ready||pendingOrganiser.key!==selectionKey||!contactInfo.client||pendingSaving.current)return
    pendingSaving.current=true
    Promise.resolve().then(()=>pendingOrganiser.action(contactInfo.client)).then(()=>{if(active.current===selectionKey){setOrganiserRevision(value=>value+1);contactInfo.refresh()}}).catch(cause=>{if(active.current===selectionKey)setError(cause.message)}).finally(()=>{pendingSaving.current=false;setPendingOrganiser(old=>old===pendingOrganiser?null:old)})
  },[pendingOrganiser,contactInfo,selectionKey])
  useEffect(()=>{setBusy('');setError('');setContactOpen(false);setContactTab('overview');setCrmAction('')},[selectionKey])
  const refreshDetail=detail.refresh
  useEffect(()=>{if(revision!==undefined)void refreshDetail()},[revision,refreshDetail])
  async function update(action,fields) {
    const key=selectionKey;setBusy(action);setError('')
    try{await metaIntegrationRequest(org,action,{conversationId:selectedId,assignmentVersion:detail.conversation.assignment_version,...fields});if(key===active.current){await detail.refresh();void onChanged?.()}}
    catch(failure){if(key===active.current){setError(failure.message);await detail.refresh()}}finally{if(key===active.current)setBusy('')}
  }
  const current=detail.conversation
  const conversationTools=current ? <>
        {!compact&&<WhatsAppConversationAssignment workspace={workspace} conversation={current} busy={Boolean(busy)} onAssign={id=>void update('assign_conversation',{assignedUserId:id})}/>}
        <WhatsAppCampaignReplyNotice key={`${selectionKey}:${current.last_message_at}:${current.assignment_version}`} organisationId={org} conversationId={current.id} accessScope={scope}/>{!compact&&<WhatsAppCrmLink key={`crm:${selectionKey}:${current.assignment_version}`} organisationId={org} accessScope={scope} conversationId={selectedId} assignmentVersion={current.assignment_version} onChanged={contactInfo.refresh}/>}
  </> : null
  return (
      <section ref={reader} className={`${className} ${compact ? `wa-clean-reader ${contactOpen ? 'wa-contact-open' : ''}` : ''}`} style={compact ? {'--wa-contact-width': `clamp(240px, ${detailsWidth}cqw, 480px)`} : undefined} aria-label="WhatsApp conversation reader">{!selectedId||(compact&&!acknowledge)?<div className="m-auto p-10 text-center text-slate-500"><MessageCircle className="mx-auto mb-3"/><p>Select a conversation to read and reply.</p></div>:detail.loading?<p role="status" className="p-6">Loading messages…</p>:detail.error&&!detail.rows.length?<p role="alert" className="p-6 text-red-800">{detail.error}</p>:current?<>
        {compact ? <header className="wa-chat-header">
          {onBack&&<button type="button" className="revo-icon revo-mobile-back" aria-label="Back to conversations" onClick={onBack}><ArrowLeft size={18}/></button>}
          <button type="button" className="wa-contact-trigger" aria-label={`Open contact details for ${current.contact_name||current.contact_phone}`} aria-expanded={contactOpen} onClick={()=>{setContactTab('overview');setContactOpen(value=>!value)}}>
            <span className="inbox-channel-logo channel-whatsapp"><InboxChannelIcon channel="whatsapp"/></span><span className="wa-header-person"><strong>{current.contact_name||current.contact_phone}</strong><small>{current.contact_phone}{contactInfo.contact?.email ? ` · ${contactInfo.contact.email}` : ''}</small></span>
            <span className="wa-header-tag"><Tag size={12}/>{contactInfo.lead?.lead_category||contactInfo.context?.linked?.kind||'No tag'}</span>
            <span className="wa-header-listings"><House size={14}/>{contactInfo.listings?.length ? `${contactInfo.listings.length} enquired ${contactInfo.listings.length===1?'listing':'listings'}` : 'Enquired listings'}</span><PanelRightOpen size={17}/>
          </button>
          <WhatsAppConversationAssignment workspace={workspace} conversation={current} busy={Boolean(busy)} onAssign={id=>void update('assign_conversation',{assignedUserId:id})}/>
          <button type="button" className="revo-icon" aria-label={current.status==='closed'?'Reopen conversation':'Close conversation'} title={current.status==='closed'?'Reopen conversation':'Close conversation'} disabled={Boolean(busy)} onClick={()=>void update('conversation_status',{status:current.status==='closed'?'open':'closed'})}><CheckCircle2 size={18}/></button>
        </header> : <>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">{onBack&&<button type="button" className="revo-icon revo-mobile-back" aria-label="Back to conversations" onClick={onBack}><ArrowLeft size={18}/></button>}<div><h2 className="font-semibold">{current.contact_name||current.contact_phone}</h2><p className="text-xs text-slate-500">{current.contact_phone} · {current.status}</p></div><Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={()=>void update('conversation_status',{status:current.status==='closed'?'open':'closed'})}>{current.status==='closed'?'Reopen':'Close conversation'}</Button></header>
        {detail.sender?.display_phone_number&&<p className="border-b px-4 py-2 text-xs text-slate-600">Replying from {detail.sender.display_phone_number}</p>}
        {compact ? <details className="revo-whatsapp-tools"><summary>Conversation details</summary>{conversationTools}</details> : conversationTools}
        </>}
        <div className="wa-sending-identity"><strong>From {detail.sender?.display_phone_number||'Business number unavailable'}</strong><span>{current.canReply?(Number.isFinite(Date.parse(current.last_inbound_at))?`Reply window closes ${date(new Date(Date.parse(current.last_inbound_at)+86400000).toISOString())}`:'Reply window open'):'Approved template required'}</span></div>
        {detail.error&&<p role="alert" className="wa-connection-warning">Updates are unavailable. Sending is paused until this conversation refreshes. {detail.error}</p>}
        <div ref={history} onScroll={()=>{const node=history.current;pinned.current=node.scrollHeight-node.scrollTop-node.clientHeight<40;setAtBottom(pinned.current)}} className={compact ? "wa-chat-history" : "max-h-[55vh] flex-1 space-y-4 overflow-auto bg-slate-50 p-5"} aria-label="Conversation messages">
          {detail.nextCursor&&<Button variant="secondary" disabled={detail.loadingOlder} onClick={()=>void detail.loadOlder()}>{detail.loadingOlder?'Loading…':'Load older messages'}</Button>}
          {[...detail.rows].reverse().map(message=><article key={message.id} className={compact ? `wa-chat-bubble ${message.direction}` : `max-w-[90%] rounded-xl border p-3 sm:max-w-[80%] ${message.direction==='outbound'?'ml-auto border-green-200 bg-green-50':'border-slate-200 bg-white'}`} title={compact && message.message_origin==='history' ? (message.media_json?.manualImport ? 'Imported chat export' : 'Imported WhatsApp history') : undefined}>
            {<p className="wa-message-author mb-1 text-xs font-semibold text-slate-600">{message.direction==='outbound'?message.message_origin==='business_app'?'WhatsApp Business app':message.message_origin==='history'?'Imported history':message.created_by===workspace.currentUserId?'You':workspace.assignees?.find(person=>person.id===message.created_by)?.name||'Your team':current.contact_name||'Customer'}</p>}
            {message.revoked_at?<p className="text-sm italic text-slate-500">Message deleted in WhatsApp</p>:<>
              {message.template_json&&<p className="mb-2 text-xs">Template: {message.template_json.name} · {message.template_json.language}</p>}
              {message.media_json?.replyTo&&<small>Reply to an earlier message</small>}
              {message.media_json?.reaction&&<p>Reaction {message.media_json.reaction.emoji||'removed'} to an earlier message</p>}
              {message.media_json?.location&&<p>{message.media_json.location.name}<br/>{message.media_json.location.address}{message.media_json.location.latitude!=null&&message.media_json.location.longitude!=null&&<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${message.media_json.location.latitude},${message.media_json.location.longitude}`)}`} target="_blank" rel="noreferrer">Open shared location</a>}</p>}
              {message.media_json?.contacts?.map((contact,index)=><div key={index}><strong>{contact.name||'Shared contact'}</strong>{contact.phones.map(phone=><p key={phone}>{phone}</p>)}</div>)}
              {message.body_text?<p className="whitespace-pre-wrap break-words text-sm">{message.body_text}</p>:<p className="text-sm capitalize">{message.message_type==='media_placeholder'?'Media not supplied by Meta':['unsupported','errors'].includes(message.message_type)?'Message not supplied by Meta. Check WhatsApp Business on your phone.':message.message_type}</p>}
              {message.media_json?.id&&<WhatsAppMessageMedia organisationId={org} message={message}/>}
            </>}
            {!compact&&message.message_origin==='history'&&<p className="mt-2 text-[11px] text-slate-500">{message.media_json?.manualImport ? 'Imported chat export' : 'Imported WhatsApp history'}</p>}
            <p className={compact ? "wa-message-time" : "mt-2 text-[11px] text-slate-500"}>{date(message.event_at)} · {message.delivery_status==='unknown'?'Unconfirmed':message.delivery_status}{message.edited_at&&!message.revoked_at?' · Edited in WhatsApp':''}{message.reviewed_at?' · Delivery reviewed':''}</p>
            {message.error_message&&<p className="mt-1 text-xs text-red-800">{message.error_message}</p>}
          </article>)}
        </div>
        {error&&<p role="alert" className="px-4 pt-3 text-sm text-red-800">{error}</p>}
        <WhatsAppConversationWork key={`work:${selectionKey}:${current.assignment_version}`} workspace={workspace} conversation={current} canSend={detail.canSend??Boolean(workspace.canManage||current.assigned_user_id===workspace.currentUserId)} connectionReady={!detail.error&&!detail.sender?.last_error_message&&detail.sender?.connection_status!=='disconnected'&&detail.sender?.connection_status!=='pending'} unconfirmed={detail.rows.find(message=>message.direction==='outbound'&&['unknown','sending'].includes(message.delivery_status)&&!message.reviewed_at&&message.manual_send)} visible={visible&&acknowledge} compact={compact} initialReply={initialReply} onReplyChange={onReplyChange} onChanged={async()=>{await detail.refresh();void onChanged?.()}}/>
        {compact&&contactOpen&&onDetailsResize&&<div className="wa-contact-divider"><InboxPanelDivider panel="details" value={detailsWidth} onResize={onDetailsResize} onMove={onDetailsMove} onReset={onDetailsReset}/></div>}
        {compact&&contactOpen&&<aside className="wa-contact-panel" aria-label="Contact information" onKeyDown={event=>{if(event.key==='Escape')setContactOpen(false)}}>
          <header><h2>Contact details</h2><button type="button" className="revo-icon" aria-label="Close contact details" onClick={()=>setContactOpen(false)}><X size={18}/></button></header>
          <div className="wa-contact-identity"><h3>{current.contact_name||'WhatsApp contact'}</h3><span className="wa-contact-status" data-status={current.status}><i/>{current.status}</span><div className="wa-contact-channels"><a href={`tel:+${current.contact_phone.replace(/^\+/, '')}`}><Phone size={14}/><span>{current.contact_phone.replace(/^\+?27(\d{2})(\d{3})(\d{4})$/, '+27 $1 $2 $3')}</span></a>{contactInfo.contact?.email&&<a href={`mailto:${contactInfo.contact.email}`}><Mail size={14}/><span>{contactInfo.contact.email}</span></a>}</div></div>
          <div className="wa-contact-tabs" role="tablist" aria-label="Contact panel sections" onKeyDown={event=>{const tabs=['overview','profile','activity','manage'];if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=tabs.indexOf(contactTab),next=event.key==='Home'?'overview':event.key==='End'?'manage':tabs[(index+(event.key==='ArrowRight'?1:3))%4];setContactTab(next);event.currentTarget.querySelector(`#wa-contact-${next}-tab`)?.focus()}}}>{['overview','profile','activity','manage'].map(tab=><button id={`wa-contact-${tab}-tab`} type="button" role="tab" tabIndex={contactTab===tab?0:-1} aria-selected={contactTab===tab} aria-controls={`wa-contact-${tab}-content`} onClick={()=>setContactTab(tab)} key={tab}>{tab[0].toUpperCase()+tab.slice(1)}</button>)}</div>
          <div ref={contactBody} className="wa-contact-panel-body">
          {contactTab==='overview'?<div role="tabpanel" id="wa-contact-overview-content" aria-labelledby="wa-contact-overview-tab">
          <section className="wa-info-section"><h3>At a glance</h3><dl className="wa-contact-facts"><div><dt>Stage</dt><dd>{contactInfo.lead?.stage||'Not recorded'}</dd></div><div><dt>Next follow-up</dt><dd>{date(contactInfo.lead?.next_follow_up_at)||'Not scheduled'}</dd></div>{contactInfo.context?.linked&&<div><dt>CRM record</dt><dd><Link to={contactInfo.context.linked.path}>{contactInfo.context.linked.name||'Open record'}</Link></dd></div>}</dl><InboxCrmActionButtons onAction={setCrmAction} disabled={contactInfo.loading||Boolean(contactInfo.error)}/></section>
          <ClientOrganiser key={`tags:${selectionKey}:${contactInfo.client?.identityId||''}:${organiserRevision}`} client={contactInfo.client} section="tags" organisationId={org} onNeedLead={linkForOrganiser}/>
          <ClientOrganiser key={`enquiries:${selectionKey}:${contactInfo.client?.identityId||''}:${organiserRevision}`} client={contactInfo.client} section="enquiries" organisationId={org} existing={contactInfo.listings} onChanged={contactInfo.refresh} onNeedLead={linkForOrganiser}/>
          {contactInfo.lead?.notes&&<section className="wa-info-section"><h3>Notes</h3><p className="wa-contact-notes">{contactInfo.lead.notes}</p></section>}
          <section className="wa-info-section"><h3>Conversation</h3><dl className="wa-contact-facts"><div><dt>Channel</dt><dd>WhatsApp</dd></div><div><dt>Business number</dt><dd>{detail.sender?.display_phone_number||'—'}</dd></div><div><dt>Assigned to</dt><dd>{workspace.assignees?.find(agent=>agent.id===current.assigned_user_id)?.name||(current.assigned_user_id?'Assigned':'Unassigned')}</dd></div>{current.last_inbound_at&&<div><dt>Last received</dt><dd>{date(current.last_inbound_at)}</dd></div>}{contactInfo.lead?.lead_source&&<div><dt>Source</dt><dd>{contactInfo.lead.lead_source}</dd></div>}</dl></section>
          </div>:contactTab==='profile'?<div role="tabpanel" id="wa-contact-profile-content" aria-labelledby="wa-contact-profile-tab"><InboxContactProfile info={contactInfo} current={current} onManage={()=>setContactTab('manage')} actions={<InboxCrmActionButtons onAction={setCrmAction} allowMerge disabled={contactInfo.loading||Boolean(contactInfo.error)}/>}/></div>:contactTab==='activity'?<div role="tabpanel" id="wa-contact-activity-content" aria-labelledby="wa-contact-activity-tab"><InboxContactActivity info={contactInfo} messages={detail.rows} nextCursor={detail.nextCursor} loadingOlder={detail.loadingOlder} onLoadOlder={()=>void detail.loadOlder()} onManage={()=>setContactTab('manage')}/></div>:<div role="tabpanel" id="wa-contact-manage-content" aria-labelledby="wa-contact-manage-tab" className="wa-contact-management">{conversationTools}</div>}
          </div>
        </aside>}
      </>:null}{crmAction&&current&&<InboxCrmActions key={`${selectionKey}:${crmAction}`} mode={crmAction} onCreate={()=>setCrmAction('create')} info={contactInfo} current={current} workspace={workspace} onClose={()=>setCrmAction('')} onChanged={async()=>{setPendingOrganiser(old=>old?.key===selectionKey?{...old,ready:true}:null);contactInfo.refresh();await detail.refresh();void onChanged?.()}}/>}</section>
  )
}
