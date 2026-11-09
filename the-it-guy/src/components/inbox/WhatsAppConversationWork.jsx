import {useCallback,useEffect,useRef,useState} from 'react'
import WhatsAppMessageComposer from '../marketing/WhatsAppMessageComposer'
import {metaIntegrationRequest} from '../../services/metaIntegrationService'

export default function WhatsAppConversationWork({workspace,conversation,canSend=true,connectionReady=true,unconfirmed=null,visible=false,initialReply='',onReplyChange,onChanged,compact}) {
 const org=workspace.organisationId,key=`${workspace.accessScope}:${conversation.id}:${conversation.assignment_version}`
 const [data,setData]=useState(null),[error,setError]=useState(''),[mode,setMode]=useState('reply'),[note,setNote]=useState(''),[mention,setMention]=useState(''),[busy,setBusy]=useState(false),[body,setBody]=useState(initialReply),[epoch,setEpoch]=useState(0),[saved,setSaved]=useState(''),[saveCycle,setSaveCycle]=useState(0),[olderNotes,setOlderNotes]=useState([]),[olderCursor,setOlderCursor]=useState(undefined)
 const startingReply=useRef(initialReply)
 const sequence=useRef(0)
 const active=useRef(true),dirty=useRef(false),draftVersion=useRef(0),loaded=useRef(false),saving=useRef(false),noteRequest=useRef(null),bodyRef=useRef(body),conflict=useRef(false),typedAt=useRef(0),presenceAt=useRef(0)
 bodyRef.current=body
 const request=useCallback((operation,fields={})=>metaIntegrationRequest(org,'inbox_work',{operation,conversationId:conversation.id,fields}),[org,conversation.id])
 const refresh=useCallback(async()=>{const token=++sequence.current;try{const next=await request('work',{includeNotes:mode==='note'});if(!active.current||token!==sequence.current)return;setData(next);if(!loaded.current){draftVersion.current=next.draft?.version||0;if(!dirty.current)setBody(next.draft?.body||startingReply.current);loaded.current=true}}catch(cause){if(active.current)setError(cause.message)}},[request,mode])
 const invalidate=useCallback(()=>{active.current=false;sequence.current++},[])
 useEffect(()=>{active.current=true;if(visible||!loaded.current)void refresh();const timer=setInterval(()=>{if(visible&&!document.hidden)void refresh()},15000);return()=>{invalidate();clearInterval(timer)}},[refresh,key,invalidate,visible])
 useEffect(()=>{
  if(!visible||!canSend)return undefined
  const heartbeat=()=>{if(!document.hidden)void request('presence',{composing:Boolean(bodyRef.current)&&Date.now()-typedAt.current<10000}).catch(()=>{})}
  heartbeat();const timer=setInterval(heartbeat,20000);return()=>clearInterval(timer)
 },[visible,canSend,request,key])
 useEffect(()=>{
  if(!dirty.current||!loaded.current||conflict.current||!canSend)return undefined
  const timer=setTimeout(async()=>{
   if(saving.current)return
   saving.current=true;const snapshot=body
   try{const next=await request('draft',{body:snapshot,version:draftVersion.current});if(active.current){draftVersion.current=next.draft.version;if(bodyRef.current===snapshot){dirty.current=false;setSaved('Draft saved')}else setSaved('Saving latest draft…')}}
   catch(cause){if(active.current){conflict.current=true;setError(cause.message)}}finally{saving.current=false;if(active.current)setSaveCycle(n=>n+1)}
  },800)
  return()=>clearTimeout(timer)
 },[body,canSend,request,saveCycle])
 const newestNoteAt=data?.notes?.[0]?.created_at
 useEffect(()=>{if(mode!=='note'||!visible||!newestNoteAt)return;void request('read',{notesThrough:newestNoteAt}).then(()=>window.dispatchEvent(new Event('arch9:whatsapp-read'))).catch(()=>{})},[mode,visible,newestNoteAt,request])
 async function change(operation,fields={}){if(busy)return;setBusy(true);setError('');try{await request(operation,fields);if(active.current){if(operation==='note'){setNote('');setMention('');noteRequest.current=null}await refresh();await onChanged?.();return true}}catch(cause){if(active.current)setError(cause.message);return false}finally{if(active.current)setBusy(false)}}
 function edit(value){typedAt.current=Date.now();if(visible&&canSend&&Date.now()-presenceAt.current>5000){presenceAt.current=Date.now();void request('presence',{composing:Boolean(value)}).catch(()=>{})}dirty.current=true;setSaved('Saving draft…');setBody(value);onReplyChange?.(value)}
 async function reloadDraft(){try{const next=await request('work',{includeNotes:mode==='note'});if(!active.current)return;draftVersion.current=next.draft?.version||0;conflict.current=false;dirty.current=false;setBody(next.draft?.body||'');setData(next);setEpoch(n=>n+1);setError('')}catch(cause){if(active.current)setError(cause.message)}}
 async function loadOlderNotes(){const cursor=olderCursor===undefined?data.notesNextCursor:olderCursor;if(!cursor||busy)return;setBusy(true);try{const next=await request('work',{includeNotes:true,beforeNotesAt:cursor.at,beforeNotesId:cursor.id});if(active.current){setOlderNotes(rows=>[...rows,...next.notes]);setOlderCursor(next.notesNextCursor)}}catch(cause){if(active.current)setError(cause.message)}finally{if(active.current)setBusy(false)}}
 const notes=[...new Map([...(data?.notes||[]),...olderNotes].map(item=>[item.id,item])).values()]
 const people=data?.presence||[]
 return <section className="wa-workspace-tools" aria-label="Conversation work">
  {people.length>0&&<p className="wa-collaboration" role="status">{people.map(person=>`${person.name||'A teammate'} is ${person.composing?'composing a reply':'viewing this chat'}`).join(' · ')}</p>}
  {!canSend&&<div className="wa-queue-claim"><span>Assign this shared conversation before replying.</span><button type="button" disabled={busy} onClick={()=>void change('take',{assignmentVersion:conversation.assignment_version})}>Assign to me</button></div>}
  {!connectionReady&&<p role="alert" className="wa-connection-warning">Sending is paused. Check this number’s connection and refresh the conversation.</p>}
  {unconfirmed&&<div className="wa-connection-warning" role="status"><p>A previous send has no confirmed result. Check its receipts and with the recipient before sending again. Reviewing it does not resend it or mark it delivered.</p>{canSend&&<button type="button" disabled={busy||Date.now()-Date.parse(unconfirmed.created_at)<90000} onClick={async()=>{if(await change('review_send',{messageId:unconfirmed.id,confirmed:true,assignmentVersion:conversation.assignment_version})){edit('');setEpoch(n=>n+1)}}}>Mark delivery as reviewed</button>}</div>}
  {error&&<p role="alert">{error}{conflict.current&&<button type="button" onClick={()=>void reloadDraft()}>Reload saved draft</button>}</p>}
  {canSend&&<div className="wa-work-toolbar">
   <div role="group" aria-label="WhatsApp composer mode"><button type="button" aria-pressed={mode==='reply'} onClick={()=>setMode('reply')}>Reply</button><button type="button" aria-pressed={mode==='note'} onClick={()=>setMode('note')}>Internal note{data?.notes?.length?` (${data.notes.length})`:''}</button></div>
   <select aria-label="Conversation follow-up" value={conversation.work_state||'active'} disabled={busy} onChange={event=>void change('state',{state:event.target.value,assignmentVersion:conversation.assignment_version,...(event.target.value==='snoozed'?{until:new Date(Date.now()+3600000).toISOString()}:{})})}><option value="active">Active</option><option value="waiting_on_client">Waiting on client</option><option value="snoozed">Snooze for one hour</option></select>
  </div>}
  {mode==='note'?<div className="wa-internal-work"><p>Internal notes are visible to authorised teammates and are never sent to WhatsApp.</p><div className="wa-notes-history">{notes.map(item=><article key={item.id}><strong>{workspace.assignees?.find(person=>person.id===item.created_by)?.name||'Teammate'}</strong><time>{new Date(item.created_at).toLocaleString()}</time><p>{item.body}</p>{item.mentions?.length>0&&<small>Mentions: {item.mentions.map(id=>workspace.assignees?.find(person=>person.id===id)?.name||'Teammate').join(', ')}</small>}</article>)}</div>{(olderCursor===undefined?data?.notesNextCursor:olderCursor)&&<button type="button" disabled={busy} onClick={()=>void loadOlderNotes()}>Load older internal notes</button>}<label>Internal note<textarea maxLength={4000} value={note} disabled={busy} onChange={event=>{setNote(event.target.value);noteRequest.current=null}}/></label><label>Mention a teammate<select value={mention} onChange={event=>{setMention(event.target.value);noteRequest.current=null}}><option value="">No mention</option>{workspace.assignees?.filter(person=>person.id!==workspace.currentUserId&&(person.canOversee||person.id===conversation.assigned_user_id)).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button type="button" disabled={busy||!note.trim()||!canSend} onClick={()=>{noteRequest.current ||= crypto.randomUUID();void change('note',{requestId:noteRequest.current,body:note,mentions:mention?[mention]:[]})}}>Save internal note</button></div>:data?<>
   {data.snippets?.length>0&&<label className="wa-saved-reply">Saved reply<select aria-label="Insert saved reply" value="" onChange={event=>{edit(`${body}${body?'\n':''}${data.snippets[Number(event.target.value)].body}`);setEpoch(n=>n+1)}}><option value="">Choose a saved reply</option>{data.snippets.map((snippet,index)=><option key={`${snippet.title}:${index}`} value={index}>{snippet.title}</option>)}</select></label>}
   <WhatsAppMessageComposer key={`${key}:${epoch}`} organisationId={org} conversation={{...conversation,canSend:canSend&&connectionReady&&!unconfirmed}} compact={compact} initialBody={body} onDraftChange={edit} onSent={onChanged}/>
   <small className="wa-draft-status" role="status">{saved||'Drafts are private to you and expire after 30 days.'}</small>
  </>:!error&&<p role="status">Loading saved work…</p>}
 </section>
}
