import { WhatsAppCampaignReplyNotice } from './MetaCampaignRoutes'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, MessageCircle, RefreshCw } from 'lucide-react'
import Button from '../ui/Button'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import useWhatsAppHistory from '../../hooks/useWhatsAppHistory'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import WhatsAppCrmLink, { WhatsAppCrmConversations } from './WhatsAppCrmLink'
import WhatsAppMessageComposer from './WhatsAppMessageComposer'

const date=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):''
function ConversationAssignment({conversation,assignees,busy,onAssign}) {
  const [choice,setChoice]=useState(conversation.assigned_user_id||''),[version,setVersion]=useState(conversation.assignment_version)
  if(version!==conversation.assignment_version){setVersion(conversation.assignment_version);setChoice(conversation.assigned_user_id||'')}
  return <form className="flex flex-wrap items-end gap-3 border-b bg-blue-50/40 p-4" onSubmit={event=>{event.preventDefault();void onAssign(choice)}}>
    <label className="grid gap-1 text-sm font-semibold">Assign conversation<select className="rounded-lg border bg-white px-3 py-2 font-normal" value={choice} disabled={busy} onChange={event=>setChoice(event.target.value)}><option value="">Agency queue</option>{conversation.assigned_user_id&&!assignees.some(agent=>agent.id===conversation.assigned_user_id)&&<option value={conversation.assigned_user_id} disabled>Unavailable agent</option>}{assignees.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
    <Button size="sm" type="submit" disabled={busy||choice===(conversation.assigned_user_id||'')}>Save assignment</Button>
  </form>
}

export default function WhatsAppInbox() {
  const workspace=useMetaWorkspace(),org=workspace.organisationId,scope=workspace.accessScope||org
  const [params,setParams]=useSearchParams(),[selected,setSelected]=useState({scope:'',id:''}),[query,setQuery]=useState(''),[search,setSearch]=useState('')
  const [busy,setBusy]=useState(''),[error,setError]=useState('')
  const selectedId=selected.scope===scope?selected.id:''
  const selectionKey=`${scope}:${selectedId}`,active=useRef(selectionKey);active.current=selectionKey
  const list=useWhatsAppHistory({organisationId:org,accessScope:scope,search})
  const detail=useWhatsAppHistory({organisationId:org,accessScope:scope,conversationId:selectedId,thread:true})
  const requestedOrg=params.get('organisationId'),requestedConversation=params.get('conversation')||'',crmKind=params.get('crmKind'),crmRecord=params.get('crmRecord')
  useEffect(()=>{setSelected({scope,id:''});setQuery('');setSearch('');setError('');setBusy('')},[scope])
  useEffect(()=>{if(requestedOrg===org&&requestedConversation)setSelected({scope,id:requestedConversation})},[scope,org,requestedOrg,requestedConversation])
  useEffect(()=>{const timer=window.setTimeout(()=>setSearch(query.trim()),300);return()=>window.clearTimeout(timer)},[query])
  useEffect(()=>{setError('');setBusy('')},[selectionKey])
  function selectConversation(id){setSelected({scope,id});setParams(previous=>{const next=new URLSearchParams(previous);next.set('organisationId',org);next.set('conversation',id);return next},{replace:true})}
  async function refresh(){await Promise.all([list.refresh(),detail.refresh()])}
  async function update(action,fields) {
    const key=selectionKey;setBusy(action);setError('')
    try{await metaIntegrationRequest(org,action,{conversationId:selectedId,assignmentVersion:detail.conversation.assignment_version,...fields});if(key===active.current)await refresh()}
    catch(failure){if(key===active.current){setError(failure.message);await detail.refresh()}}finally{if(key===active.current)setBusy('')}
  }
  async function download(message) {
    const key=selectionKey;setBusy(message.id);setError('')
    try{
      const file=await metaIntegrationRequest(org,'media',{messageId:message.id});if(key!==active.current)return
      const bytes=Uint8Array.from(atob(file.base64),char=>char.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType})),anchor=document.createElement('a')
      anchor.href=url;anchor.download=(message.media_json?.filename||`whatsapp-${message.message_type}`).replace(/[^a-zA-Z0-9._-]/g,'_');anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(failure){if(key===active.current)setError(failure.message)}finally{if(key===active.current)setBusy('')}
  }
  const current=detail.conversation
  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold text-slate-900">WhatsApp inbox</h1><p className="mt-1 text-sm text-slate-600">{workspace.canManage?'Agency conversations and agent assignments.':'Conversations assigned to you, including your connected WhatsApp Business number.'}</p></div><Button variant="secondary" disabled={Boolean(busy)} onClick={()=>void refresh()}><RefreshCw size={16}/>Refresh</Button></header>
    <nav aria-label="WhatsApp" className="flex gap-5 text-sm font-semibold text-blue-800"><Link to="/marketing?section=whatsapp">Campaigns</Link><span aria-current="page">Inbox</span><Link to="/marketing?section=whatsapp&view=automations">Automations</Link><Link to="/settings/integrations/whatsapp">Connections</Link></nav>
    {(list.error||workspace.error)&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{list.error||workspace.error}</p>}
    {requestedOrg&&requestedOrg!==org&&<p role="alert" className="rounded-xl border bg-white p-4 text-sm">This WhatsApp link belongs to another workspace. Switch to that workspace before opening it.</p>}
    {requestedOrg===org&&crmKind&&crmRecord&&<WhatsAppCrmConversations key={`${scope}:${crmKind}:${crmRecord}`} organisationId={org} accessScope={scope} kind={crmKind} recordId={crmRecord} onSelect={selectConversation}/>}
    {!workspace.loading&&!list.rows.length&&!workspace.senders.some(sender=>sender.connection_status==='connected')&&<aside className="rounded-xl border bg-white p-5"><strong>Connect a WhatsApp business sender</strong><p className="mt-2 text-sm text-slate-600">Incoming messages will appear here after a number is connected and Meta delivers its webhooks.</p><Link className="mt-3 inline-block text-sm font-semibold text-blue-800" to="/settings/integrations/whatsapp">Connect WhatsApp</Link></aside>}
    <div className="grid overflow-hidden rounded-2xl border bg-white shadow-sm lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="border-b p-4 lg:border-b-0 lg:border-r"><label className="grid gap-2 text-sm font-semibold">Search conversations<input className="rounded-lg border px-3 py-2 font-normal" maxLength={120} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Name, number or latest message"/></label><p className="mt-2 text-xs text-slate-500">Updates every 15 seconds</p>
        <div className="mt-4 max-h-[65vh] space-y-2 overflow-auto">{list.loading?<p role="status">Loading conversations…</p>:list.rows.length?list.rows.map(row=><button key={row.id} className={`w-full rounded-xl border p-3 text-left ${selectedId===row.id?'border-blue-400 bg-blue-50':'border-transparent hover:bg-slate-50'}`} onClick={()=>selectConversation(row.id)} aria-pressed={selectedId===row.id}><span className="flex justify-between gap-2"><strong className="truncate text-sm">{row.contact_name||row.contact_phone}</strong>{row.unread_count>0&&<span className="rounded-full bg-green-700 px-2 text-xs text-white">{row.unread_count}</span>}</span><span className="mt-1 block truncate text-xs text-slate-600">{row.last_message_preview||'Attachment received'}</span><span className="mt-2 block text-xs text-slate-500">{date(row.last_message_at)} · {row.status}</span></button>):<p className="py-5 text-sm text-slate-600">No conversations found.</p>}
          {list.nextCursor&&<Button variant="secondary" disabled={list.loadingOlder} onClick={()=>void list.loadOlder()}>{list.loadingOlder?'Loading…':'Load older conversations'}</Button>}
        </div>
      </aside>
      <section className="flex min-h-[500px] min-w-0 flex-col">{!selectedId?<div className="m-auto p-10 text-center text-slate-500"><MessageCircle className="mx-auto mb-3"/><p>Select a conversation to read and reply.</p></div>:detail.loading?<p role="status" className="p-6">Loading messages…</p>:detail.error?<p role="alert" className="p-6 text-red-800">{detail.error}</p>:current?<>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">{current.contact_name||current.contact_phone}</h2><p className="text-xs text-slate-500">{current.contact_phone} · {current.status}</p></div><Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={()=>void update('conversation_status',{status:current.status==='closed'?'open':'closed'})}>{current.status==='closed'?'Reopen':'Close conversation'}</Button></header>
        {workspace.canManage?<ConversationAssignment key={selectedId} conversation={current} assignees={workspace.assignees||[]} busy={Boolean(busy)} onAssign={id=>update('assign_conversation',{assignedUserId:id||null})}/>:current.assigned_user_id&&<p className="border-b px-4 py-2 text-xs font-semibold text-blue-800">Assigned to you</p>}
        {detail.sender?.display_phone_number&&<p className="border-b px-4 py-2 text-xs text-slate-600">Replying from {detail.sender.display_phone_number}</p>}
        <WhatsAppCampaignReplyNotice key={`${selectionKey}:${current.last_message_at}:${current.assignment_version}`} organisationId={org} conversationId={current.id} accessScope={scope}/><WhatsAppCrmLink key={`crm:${selectionKey}:${current.assignment_version}`} organisationId={org} accessScope={scope} conversationId={selectedId} assignmentVersion={current.assignment_version}/>
        <div className="max-h-[55vh] flex-1 space-y-4 overflow-auto bg-slate-50 p-5" aria-label="Conversation messages">
          {detail.nextCursor&&<Button variant="secondary" disabled={detail.loadingOlder} onClick={()=>void detail.loadOlder()}>{detail.loadingOlder?'Loading…':'Load older messages'}</Button>}
          {[...detail.rows].reverse().map(message=><article key={message.id} className={`max-w-[90%] rounded-xl border p-3 sm:max-w-[80%] ${message.direction==='outbound'?'ml-auto border-green-200 bg-green-50':'border-slate-200 bg-white'}`}>
            <p className="mb-1 text-xs font-semibold text-slate-600">{message.direction==='outbound'?message.message_origin==='business_app'?'WhatsApp Business app':message.message_origin==='history'?'Imported history':message.created_by===workspace.currentUserId?'You':'Your team':current.contact_name||'Customer'}</p>
            {message.revoked_at?<p className="text-sm italic text-slate-500">Message deleted in WhatsApp</p>:<>
              {message.template_json&&<p className="mb-2 text-xs">Template: {message.template_json.name} · {message.template_json.language}</p>}
              {message.body_text?<p className="whitespace-pre-wrap break-words text-sm">{message.body_text}</p>:<p className="text-sm capitalize">{message.message_type==='media_placeholder'?'Media not supplied by Meta':message.message_type==='unsupported'?'Message not supplied by Meta. Check WhatsApp Business on your phone.':message.message_type}</p>}
              {message.media_json?.id&&<Button variant="ghost" size="sm" className="mt-2" disabled={Boolean(busy)} onClick={()=>void download(message)}><Download size={14}/>{message.media_json.filename||`Download ${message.message_type}`}</Button>}
            </>}
            {message.message_origin==='history'&&<p className="mt-2 text-[11px] text-slate-500">Imported WhatsApp history</p>}
            <p className="mt-2 text-[11px] text-slate-500">{date(message.event_at)} · {message.delivery_status==='unknown'?'Unconfirmed':message.delivery_status}{message.edited_at&&!message.revoked_at?' · Edited in WhatsApp':''}</p>
            {message.error_message&&<p className="mt-1 text-xs text-red-800">{message.error_message}</p>}
          </article>)}
        </div>
        {error&&<p role="alert" className="px-4 pt-3 text-sm text-red-800">{error}</p>}
        <WhatsAppMessageComposer key={`composer:${selectionKey}:${current.assignment_version}`} organisationId={org} conversation={current} onSent={refresh}/>
      </>:null}</section>
    </div>
  </section>
}
