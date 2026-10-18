import { useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import { previewTemplate } from '../../../../supabase/functions/_shared/whatsappCampaign.js'
import { inboxTemplateFields } from '../../../../supabase/functions/_shared/whatsappInboxMessaging.js'

function readFile(file) {
  return new Promise((resolve,reject) => { const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('The file could not be read.'));reader.readAsDataURL(file) })
}
function MessagePermission({ organisationId, conversation, permission, onSaved }) {
  const [source,setSource]=useState(''),[at,setAt]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function save() {
    setBusy(true);setError('')
    try { const data=await metaIntegrationRequest(organisationId,'message_permission',{conversationId:conversation.id,operation:'save',assignmentVersion:conversation.assignment_version,version:permission?.version||0,source,consentAt:new Date(at).toISOString(),confirmed});onSaved(data.permission);setConfirmed(false) }
    catch(failure){setError(failure.message)}finally{setBusy(false)}
  }
  return <fieldset className="space-y-2 rounded-lg border p-3 text-sm"><legend className="px-1 font-semibold">One-to-one WhatsApp permission</legend>
    {permission?.status==='opted_in' && <p>Recorded {new Date(permission.consent_at).toLocaleString()} · {permission.source}</p>}
    <p className="text-xs text-slate-600">Record the recipient’s agreement to messages from this number. Bulk-campaign permission is managed separately.</p>
    <label className="grid gap-1">How did they agree?<input className="rounded border p-2" maxLength={1000} value={source} onChange={event=>setSource(event.target.value)} /></label>
    <label className="grid gap-1">When did they agree?<input className="rounded border p-2" type="datetime-local" value={at} onChange={event=>setAt(event.target.value)} /></label>
    <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} />The recipient agreed to receive these WhatsApp messages.</label>
    <Button size="sm" disabled={busy||!source.trim()||!at||!confirmed} onClick={()=>void save()}>Record message permission</Button>
    {error&&<p role="alert" className="text-red-800">{error}</p>}
  </fieldset>
}

export default function WhatsAppMessageComposer({ organisationId, conversation, onSent }) {
  const [kind,setKind]=useState(conversation.canReply?'text':'template'),[body,setBody]=useState(''),[upload,setUpload]=useState(null)
  const [templates,setTemplates]=useState([]),[selected,setSelected]=useState(''),[values,setValues]=useState({}),[permission,setPermission]=useState(null),[editingPermission,setEditingPermission]=useState(false)
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState(false)
  const [attempt,setAttempt]=useState(null),[missing,setMissing]=useState(false),[reload,setReload]=useState(0),[draftRequestId,setDraftRequestId]=useState(null)
  const alive=useRef(true),lock=useRef(false)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{
    if(kind!=='template')return undefined
    let cancelled=false;setLoading(true);setError('')
    Promise.all([metaIntegrationRequest(organisationId,'inbox_templates',{conversationId:conversation.id}),metaIntegrationRequest(organisationId,'message_permission',{conversationId:conversation.id})])
      .then(([data,permissionData])=>{if(!cancelled){setTemplates(data.templates||[]);setPermission(permissionData.permission)}})
      .catch(failure=>{if(!cancelled){setTemplates([]);setPermission(null);setError(failure.message)}})
      .finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[organisationId,conversation.id,kind,reload])
  const template=templates.find(row=>row.id===selected)
  const definition=inboxTemplateFields(template),mediaField=definition.fields.find(field=>field.kind!=='text')
  function changeKind(value){setKind(value);setUpload(null);setError('');setNotice('');setConfirmed(false);setEditingPermission(false)}
  async function chooseFile(file) {
    if(!file||lock.current)return
    setBusy(true);setError('');setUpload(null);lock.current=true
    try {
      if(!['image/jpeg','image/png','application/pdf'].includes(file.type)||file.size>(file.type==='application/pdf'?8:5)*1024*1024)throw Error('Choose a JPEG/PNG up to 5 MB or PDF up to 8 MB.')
      const base64=await readFile(file)
      const data=await metaIntegrationRequest(organisationId,'upload_attachment',{conversationId:conversation.id,assignmentVersion:conversation.assignment_version,requestId:crypto.randomUUID(),file:{base64,mimeType:file.type,filename:file.name}})
      if(!alive.current)return
      if(data.upload?.status!=='ready')throw Error('The upload is not confirmed. Choose the file again.')
      setUpload(data.upload)
      if(kind!=='template')setKind(file.type==='application/pdf'?'document':'image')
    } catch(failure){if(alive.current)setError(failure.message)}finally{lock.current=false;if(alive.current)setBusy(false)}
  }
  function finish(message) {
    setAttempt(null);setDraftRequestId(null);setMissing(false);setBody('');setUpload(null);setConfirmed(false)
    if(['unknown','sending'].includes(message.delivery_status))setError('The send result is unconfirmed. Check the conversation before sending a new message.')
    else if(message.delivery_status==='failed')setError(message.error_message||'Meta did not send this message.')
    else setNotice('Message sent.')
    void onSent()
  }
  async function send(retry=false) {
    if(lock.current)return
    const current=retry?attempt:{conversationId:conversation.id,assignmentVersion:conversation.assignment_version,requestId:draftRequestId||crypto.randomUUID(),kind,message:body,uploadId:upload?.id||null,...(kind==='template'?{template,values}:{})}
    setDraftRequestId(current.requestId)
    lock.current=true;setBusy(true);setError('');setNotice('');setAttempt(current)
    try {const data=await metaIntegrationRequest(organisationId,'send_message',current);if(alive.current)finish(data.message)}
    catch(failure){if(alive.current)setError(`${failure.message} Check this message attempt before trying again.`)}
    finally{lock.current=false;if(alive.current)setBusy(false)}
  }
  async function check() {
    if(!attempt||lock.current)return
    lock.current=true;setBusy(true);setError('')
    try {const data=await metaIntegrationRequest(organisationId,'message_receipt',{conversationId:conversation.id,requestId:attempt.requestId});if(!alive.current)return;if(data.message)finish(data.message);else{setMissing(true);setNotice('No receipt yet. Check again or retry this same message attempt.')}}
    catch(failure){if(alive.current)setError(failure.message)}finally{lock.current=false;if(alive.current)setBusy(false)}
  }
  const ready=kind==='template'?template&&template.status==='APPROVED'&&!definition.unsupported.length&&permission?.status==='opted_in'&&!editingPermission&&confirmed&&(!mediaField||upload):conversation.canReply&&(kind==='text'?body.trim():upload)
  return <div className="space-y-3 border-t p-4">
    {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}
    <label className="grid gap-1 text-sm font-semibold">Message format<select className="rounded-lg border p-2 font-normal" disabled={busy||Boolean(attempt)} value={kind==='image'||kind==='document'?'attachment':kind} onChange={event=>changeKind(event.target.value)}><option value="text">Text reply</option><option value="attachment">Photo or PDF</option><option value="template">Approved template</option></select></label>
    {!conversation.canReply&&kind!=='template'&&<p className="text-sm">The 24-hour reply window has closed. Choose an approved template.</p>}
    {kind==='template'?<>
      <Button size="sm" variant="ghost" disabled={loading||busy||Boolean(attempt)} onClick={()=>{setConfirmed(false);setReload(value=>value+1)}}>Refresh templates and permission</Button>
      {loading?<p role="status">Loading templates…</p>:<label className="grid gap-1 text-sm font-semibold">Approved template and language<select className="rounded-lg border p-2 font-normal" value={selected} disabled={busy||Boolean(attempt)} onChange={event=>{setSelected(event.target.value);setValues({});setUpload(null);setConfirmed(false)}}><option value="">Choose a template</option>{templates.map(row=><option key={row.id} value={row.id} disabled={row.status!=='APPROVED'||inboxTemplateFields(row).unsupported.length>0}>{row.name} · {row.language} · {row.status}{inboxTemplateFields(row).unsupported.length?' · unsupported format':''}</option>)}</select></label>}
      {template&&definition.fields.filter(field=>field.kind==='text').map(field=><label key={field.key} className="grid gap-1 text-sm">{field.label}<input className="rounded border p-2" maxLength={1024} disabled={busy||Boolean(attempt)} value={values[field.key]?.text||''} onChange={event=>{setValues(old=>({...old,[field.key]:{source:'text',text:event.target.value}}));setConfirmed(false)}} /></label>)}
      {template&&<div className="whitespace-pre-wrap rounded-xl border bg-green-50 p-3 text-sm" aria-label="Template preview">{previewTemplate(template,values,{full_name:conversation.contact_name})}</div>}
      {!permission||permission.status!=='opted_in'||editingPermission?<MessagePermission key={permission?.version||0} organisationId={organisationId} conversation={conversation} permission={permission} onSaved={value=>{setPermission(value);setEditingPermission(false);setConfirmed(false)}}/>:<div className="space-y-1"><p className="text-xs text-slate-600">WhatsApp message permission recorded · {new Date(permission.consent_at).toLocaleString()}</p><Button size="sm" variant="ghost" disabled={busy||Boolean(attempt)} onClick={()=>{setEditingPermission(true);setConfirmed(false)}}>Update message permission</Button></div>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy||Boolean(attempt)} onChange={event=>setConfirmed(event.target.checked)}/>I reviewed this template and recipient and want to send it. Meta charges may apply.</label>
    </>:<label className="grid gap-2 text-sm font-semibold">{kind==='text'?'Reply':'Attachment caption'}<textarea className="min-h-24 rounded-xl border p-3 font-normal" maxLength={kind==='text'?4096:1024} disabled={busy||Boolean(attempt)} value={body} onChange={event=>setBody(event.target.value)}/></label>}
    {(kind==='attachment'||kind==='image'||kind==='document'||(kind==='template'&&mediaField))&&<label className="grid gap-1 text-sm font-semibold">{mediaField?'Template header attachment':'Photo or PDF'}<input aria-label="Upload photo or PDF" type="file" accept={mediaField?.kind==='image'?'image/jpeg,image/png':mediaField?.kind==='document'?'application/pdf':'image/jpeg,image/png,application/pdf'} disabled={busy||Boolean(attempt)} onChange={event=>{void chooseFile(event.target.files?.[0]);event.target.value=''}}/><small className="font-normal text-slate-600">JPEG/PNG: 5 MB · PDF: 8 MB</small></label>}
    {upload&&<p className="text-sm">Ready: {upload.filename}</p>}
    {attempt?<div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void check()}>Check message</Button>{missing&&<><Button disabled={busy} onClick={()=>void send(true)}>Retry same message</Button><Button variant="secondary" disabled={busy} onClick={()=>{setAttempt(null);setMissing(false);setError('')}}>Edit this attempt</Button></>}</div>:<Button disabled={busy||loading||!ready} onClick={()=>void send()}>Send message</Button>}
  </div>
}
