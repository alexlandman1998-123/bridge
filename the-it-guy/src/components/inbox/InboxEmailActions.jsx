import { useCallback,useEffect,useRef,useState } from 'react'
import { createPortal } from 'react-dom'
import { changeOutgoingEmail,loadOutgoingEmails,loadReplyContext,loadSendingMailboxes,queueOutgoingEmail,uploadOutgoingAttachment } from '../../modules/sharedInbox/outgoingMailService.js'
import { normalizeOutgoing,outgoingBody,OUTGOING_FILE_LIMIT,OUTGOING_TOTAL_LIMIT,OUTGOING_STATES } from '../../../../supabase/functions/_shared/inboxOutgoing.js'
import './inbox-outgoing.css'
function Dialog({title,children,onClose,busy=false}){
 const panel=useRef(null),previous=useRef(null)
 useEffect(()=>{previous.current=document.activeElement;panel.current?.focus();return()=>previous.current?.focus?.()},[])
 return createPortal(<div className="inbox-send-overlay" onKeyDown={event=>{
  if(event.key==='Escape'&&!busy)onClose()
  if(event.key==='Tab'){
   const elements=[...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')],first=elements[0],last=elements.at(-1)
   if(!elements.length){event.preventDefault();return}
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last.focus()}
   if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
 }}><section className="inbox-send-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}><header><h2>{title}</h2><button type="button" disabled={busy} aria-label={`Close ${title}`} onClick={onClose}>Close</button></header>{children}</section></div>,document.body)
}
function EmailComposer({organisationId,mailboxes,reply,initialBody,onClose,onQueued,initialChannelId}){
 const [channelId,setChannelId]=useState(reply?.channelId||initialChannelId||mailboxes.find(box=>box.connected)?.id||mailboxes[0]?.id||'')
 const mailbox=mailboxes.find(box=>box.id===channelId)
 const [to,setTo]=useState(reply?.address||''),[cc,setCc]=useState(''),[bcc,setBcc]=useState('')
 const [subject,setSubject]=useState(reply?(/^re:/i.test(reply.subject||'')?reply.subject:`Re: ${reply.subject||'Your enquiry'}`):''),[body,setBody]=useState(initialBody||'')
 const [signature,setSignature]=useState(reply?mailbox?.useForReplies:mailbox?.useForNew),[files,setFiles]=useState([])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(false)
 const [replyLoading,setReplyLoading]=useState(Boolean(reply)),[replyMessageId,setReplyMessageId]=useState(null),[replyError,setReplyError]=useState('')
 const live=useRef(true),lock=useRef(false),requestId=useRef(crypto.randomUUID()),intent=useRef(null),uploads=useRef(new Map())
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 useEffect(()=>{
  if(!reply?.id)return
  let active=true
  loadReplyContext({organisationId,conversationId:reply.id}).then(context=>{if(!active)return;if(context){setTo(context.to.join(', '));setSubject(/^re:/i.test(context.subject||'')?context.subject:`Re: ${context.subject||'Your enquiry'}`);setReplyMessageId(context.messageId)}}).catch(()=>{if(active)setReplyError('Reply details could not be loaded. Close and reopen the composer to try again.')}).finally(()=>{if(active)setReplyLoading(false)})
  return()=>{active=false}
 },[organisationId,reply?.id])
 const ready=Boolean(!replyLoading&&!replyError&&mailbox?.connected&&(mailbox.providerKey!=='other_email'||mailbox.smtpConfigured))
 const payload={to,cc,bcc,subject,body,useSignature:signature===true,signatureRevision:mailbox?.signatureRevision||0,conversationId:reply?.id||null,replyMessageId,attachmentIds:[]}
 const preview=outgoingBody({...payload,body:body||'Your message'},mailbox?.signature||{})
 const confirmQueued=result=>{if(!live.current)return;if(reply&&initialBody)onQueued(result,{conversationId:reply.id,body:initialBody});else onQueued(result);onClose()}
 const send=async()=>{
  if(lock.current||!ready)return
  lock.current=true;setBusy(true);setError('')
  try{
   let email=intent.current
   if(!email){
    email=normalizeOutgoing(payload)
    const ids=[]
    for(const file of files){if(!live.current)return;let uploaded=uploads.current.get(file);if(!uploaded){uploaded=await uploadOutgoingAttachment({organisationId,channelId,file});uploads.current.set(file,uploaded)}ids.push(uploaded.id)}
    if(!live.current)return
    email={...email,attachmentIds:ids};intent.current=email;setPending(true)
   }
   const result=await queueOutgoingEmail({organisationId,channelId,requestId:requestId.current,email})
   confirmQueued(result)
  }catch(cause){if(live.current)setError(intent.current?'The queue request could not be confirmed. Check its status or retry this same request; the request ID prevents a duplicate.':cause.message||'The email could not be prepared.')}
  finally{lock.current=false;if(live.current)setBusy(false)}
 }
 const check=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('')
  try{const rows=await loadOutgoingEmails(organisationId,requestId.current);if(!live.current)return;if(rows[0])confirmQueued({id:rows[0].id,status:rows[0].status,conversationId:rows[0].conversationId});else setError('This request is not in the queue yet. Retry the same request to submit it safely.')}
  catch{if(live.current)setError('Queue status could not be checked. Keep this request unchanged and try again.')}
  finally{lock.current=false;if(live.current)setBusy(false)}
 }
 return <Dialog title={reply?'Reply by email':'New email'} onClose={onClose} busy={busy}><form onSubmit={event=>{event.preventDefault();void send()}}>
  <label>From mailbox<select value={channelId} disabled={busy||pending||Boolean(reply)} onChange={event=>{
   const next=mailboxes.find(box=>box.id===event.target.value);setChannelId(event.target.value);setSignature(reply?next?.useForReplies:next?.useForNew);setFiles([]);uploads.current.clear();setError('')
  }}>{mailboxes.map(box=><option key={box.id} value={box.id}>{box.displayName?`${box.displayName} · `:''}{box.address}{!box.connected?' (not connected)':box.providerKey==='other_email'&&!box.smtpConfigured?' (SMTP required)':''}</option>)}</select></label>
  {replyLoading&&<p role="status">Loading reply details…</p>}{replyError&&<p role="alert">{replyError}</p>}
  {!replyLoading&&!replyError&&!ready&&<p role="status">Connect this mailbox{mailbox?.providerKey==='other_email'?' and configure SMTP':''} in email settings before sending.</p>}
  <label>To<input type="text" required value={to} disabled={busy||pending||replyLoading} onChange={event=>setTo(event.target.value)} placeholder="client@example.com"/></label>
  <div className="inbox-send-columns"><label>Cc<input value={cc} disabled={busy||pending} onChange={event=>setCc(event.target.value)}/></label><label>Bcc<input value={bcc} disabled={busy||pending} onChange={event=>setBcc(event.target.value)}/></label></div>
  <label>Subject<input required maxLength={500} value={subject} disabled={busy||pending||replyLoading} onChange={event=>setSubject(event.target.value)}/></label>
  <label>Message<textarea required rows={7} value={body} disabled={busy||pending} onChange={event=>setBody(event.target.value)}/></label>
  <label className="inbox-send-signature"><input type="checkbox" checked={signature===true} disabled={busy||pending} onChange={event=>setSignature(event.target.checked)}/>Include this mailbox’s signature</label>
  <details><summary>Preview email and signature</summary><iframe title="Outgoing email preview" sandbox="" referrerPolicy="no-referrer" srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; form-action 'none'"></head><body>${preview.html}</body></html>`}/></details>
  <label>Attachments<input type="file" multiple disabled={busy||pending} onChange={event=>{
   const next=[...files,...event.target.files],maximum=mailbox?.providerKey==='microsoft_365'?2097152:OUTGOING_TOTAL_LIMIT
   if(next.length>10||next.some(file=>file.size>OUTGOING_FILE_LIMIT)||next.reduce((sum,file)=>sum+file.size,0)>maximum)setError('Choose up to 10 files, 10 MiB each, with no more than '+(mailbox?.providerKey==='microsoft_365'?'2 MiB':'20 MiB')+' in total.')
   else{setFiles(next);setError('')}
   event.target.value=''
  }}/></label>
  <small>{mailbox?.providerKey==='microsoft_365'?'Microsoft direct sending: up to 2 MiB total attachments.':'Up to 10 files, 10 MiB each and 20 MiB total.'}</small>
  {files.length>0&&<ul aria-label="Selected attachments">{files.map((file,index)=><li key={index}>{file.name} <button type="button" disabled={busy||pending} aria-label={`Remove ${file.name}`} onClick={()=>setFiles(rows=>rows.filter((_,position)=>position!==index))}>Remove</button></li>)}</ul>}
  {error&&<p className="inbox-settings-error" role="alert">{error}</p>}
  <footer><small>Queued email is sent by the server. Provider acceptance does not confirm recipient delivery.</small>{pending&&<button type="button" disabled={busy} onClick={()=>void check()}>Check queue status</button>}<button type="submit" disabled={busy||!ready}>{busy?'Preparing email…':pending?'Retry same email request':'Send email'}</button></footer>
 </form></Dialog>
}
function OutgoingQueue({organisationId,onClose,onRefresh}){
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const live=useRef(true),lock=useRef(false)
 const load=useCallback(async()=>{setBusy(true);setError('');try{const next=await loadOutgoingEmails(organisationId);if(live.current)setRows(next)}catch{if(live.current)setError('Outgoing email could not be loaded. Try refreshing.')}finally{if(live.current)setBusy(false)}},[organisationId])
 useEffect(()=>{live.current=true;void load();return()=>{live.current=false}},[load])
 const act=async(row,action)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await changeOutgoingEmail({organisationId,jobId:row.id,action});if(live.current){await load();onRefresh?.()}}catch{if(live.current)setError('The email state or your mailbox access changed. Refresh before trying again.')}finally{lock.current=false;if(live.current)setBusy(false)}}
 return <Dialog title="Outgoing email" onClose={onClose}><p>Latest 50 requests from your accessible mailboxes. Refresh to check provider acceptance.</p><button type="button" disabled={busy} onClick={()=>void load()}>Refresh outgoing email</button>{error&&<p role="alert">{error}</p>}{!rows.length&&!busy&&!error&&<p>No outgoing email yet.</p>}<ul className="inbox-outgoing-list">{rows.map(row=><li key={row.id}><strong>{row.subject}</strong><span>{OUTGOING_STATES[row.status]||row.status}</span>{row.rejectedCount>0&&<p>Some recipients were rejected{row.rejectedAddresses?.length?`: ${row.rejectedAddresses.join(', ')}`:'. Check the provider before contacting them again.'}</p>}{row.status==='uncertain'&&<p>The email may have been accepted. Automatic resend is blocked to avoid duplicates.</p>}{row.errorCode&&row.status==='failed'&&<p>{row.errorCode==='provider_message_too_large'?'Reduce the email size and compose a new email.':row.errorCode==='mailbox_send_access_changed'?'Check mailbox access and reconnect before trying again.':'Check the mailbox connection, sending permissions and recipient addresses before retrying.'}</p>}<small>{new Date(row.createdAt).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}</small>{row.status==='queued'&&<button type="button" disabled={busy} onClick={()=>void act(row,'cancel')}>Cancel queued email</button>}{row.status==='failed'&&<button type="button" disabled={busy} onClick={()=>void act(row,'retry')}>Retry unchanged email</button>}</li>)}</ul></Dialog>
}
export default function InboxEmailActions({organisationId,userId,selected,replyDraft='',initialChannelId,onQueued}){
 const [mailboxes,setMailboxes]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[mode,setMode]=useState('')
 const live=useRef(true)
 const [replySelection,setReplySelection]=useState(null)
 useEffect(()=>{live.current=true;loadSendingMailboxes(organisationId).then(rows=>{if(live.current)setMailboxes(rows)}).catch(()=>{if(live.current)setError('Email sending needs the workspace update or mailbox access.')}).finally(()=>{if(live.current)setLoading(false)});return()=>{live.current=false}},[organisationId,userId])
 const reply=selected?.channel==='email'&&mailboxes.some(box=>box.id===selected.channelId)?selected:null
 const openComposer=async type=>{
  const target=type==='reply'?reply:null,copiedBody=type==='reply'?replyDraft:''
  setLoading(true);setError('')
  try{
   const fresh=await loadSendingMailboxes(organisationId)
   if(!live.current)return
   setMailboxes(fresh)
   if(!fresh.length||(target&&!fresh.some(box=>box.id===target.channelId))){setError('Mailbox send access changed. Refresh your inbox before composing.');return}
   if(target)setReplySelection({...target,initialBody:copiedBody})
   setMode(type)
  }catch{if(live.current)setError('Mailbox settings could not be refreshed. Try opening the composer again.')}
  finally{if(live.current)setLoading(false)}
 }

 return <span className="inbox-email-actions"><button type="button" disabled={loading||!mailboxes.length} title={error||undefined} onClick={()=>void openComposer('new')}>New email</button>{reply&&<button type="button" disabled={loading} onClick={()=>void openComposer('reply')}>Reply by email</button>}<button type="button" disabled={loading} onClick={()=>setMode('outbox')}>Outgoing email</button>{error&&<small role="status">{error}</small>}{mode==='outbox'?<OutgoingQueue organisationId={organisationId} onClose={()=>setMode('')} onRefresh={()=>onQueued?.(null)}/>:mode&&<EmailComposer key={`${organisationId}:${userId}:${mode}:${mode==='reply'?replySelection?.id:'new'}`} organisationId={organisationId} mailboxes={mode==='reply'?mailboxes.filter(box=>box.id===replySelection?.channelId):mailboxes} reply={mode==='reply'?replySelection:null} initialBody={mode==='reply'?replySelection?.initialBody:''} initialChannelId={mailboxes.some(box=>box.id===initialChannelId)?initialChannelId:undefined} onClose={()=>setMode('')} onQueued={(result,copiedDraft)=>{if(copiedDraft)onQueued?.(result,copiedDraft);else onQueued?.(result)}}/>}</span>
}
