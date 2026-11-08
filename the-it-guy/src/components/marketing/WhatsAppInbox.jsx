import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import Button from '../ui/Button'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import useWhatsAppHistory from '../../hooks/useWhatsAppHistory'
import { WhatsAppCrmConversations } from './WhatsAppCrmLink'
import WhatsAppConversationReader from '../inbox/WhatsAppConversationReader'

const date=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):''

export default function WhatsAppInbox() {
  const workspace=useMetaWorkspace(),org=workspace.organisationId,scope=workspace.accessScope||org
  const [params,setParams]=useSearchParams(),[selected,setSelected]=useState({scope:'',id:''}),[query,setQuery]=useState(''),[search,setSearch]=useState('')
  const [revision,setRevision]=useState(0)
  const selectedId=selected.scope===scope?selected.id:''
  const list=useWhatsAppHistory({organisationId:org,accessScope:scope,search})
  const requestedOrg=params.get('organisationId'),requestedConversation=params.get('conversation')||'',crmKind=params.get('crmKind'),crmRecord=params.get('crmRecord')
  useEffect(()=>{setSelected({scope,id:''});setQuery('');setSearch('')},[scope])
  useEffect(()=>{if(requestedOrg===org&&requestedConversation)setSelected({scope,id:requestedConversation})},[scope,org,requestedOrg,requestedConversation])
  useEffect(()=>{const timer=window.setTimeout(()=>setSearch(query.trim()),300);return()=>window.clearTimeout(timer)},[query])
  function selectConversation(id){setSelected({scope,id});setParams(previous=>{const next=new URLSearchParams(previous);next.set('organisationId',org);next.set('conversation',id);return next},{replace:true})}
  async function refresh(){setRevision(value=>value+1);await list.refresh()}
  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold text-slate-900">WhatsApp inbox</h1><p className="mt-1 text-sm text-slate-600">{workspace.canManage?'Agency conversations and agent assignments.':'Conversations assigned to you, including your connected WhatsApp Business number.'}</p></div><Button variant="secondary" onClick={()=>void refresh()}><RefreshCw size={16}/>Refresh</Button></header>
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
      <WhatsAppConversationReader key={`${scope}:${selectedId}`} workspace={workspace} conversationId={selectedId} onChanged={list.refresh} revision={revision}/>
    </div>
  </section>
}
