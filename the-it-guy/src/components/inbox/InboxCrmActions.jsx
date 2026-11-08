import InboxPropertyPicker from './InboxPropertyPicker'
import { useEffect, useRef, useState } from 'react'
import { Plus, ArrowRight } from 'lucide-react'
import Modal from '../ui/Modal'
import '../clients/ClientOrganiser.css'
import { createInboxLead, linkInboxLead, searchInboxClients, searchInboxLeads, searchClientProperties, saveInboxLeadProperty, routeInboxLead } from '../../services/inboxClientService'
import { mergeClientIdentities } from '../../services/clientIdentityService'

export function InboxCrmActionButtons({ onAction, allowMerge=false, disabled=false }) {
 return <div className="inbox-crm-actions"><button type="button" disabled={disabled} onClick={()=>onAction('link')}>Link existing lead</button><button type="button" disabled={disabled} onClick={()=>onAction('create')}>Create lead</button>{allowMerge&&<button type="button" disabled={disabled} onClick={()=>onAction('merge')}>Merge with client</button>}</div>
}
export default function InboxCrmActions({ mode, info, current, workspace, onClose, onChanged, onCreate }) {
 const [choice,setChoice]=useState(''),[search,setSearch]=useState(''),[clients,setClients]=useState([]),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [leadOptions,setLeadOptions]=useState([])
 const [created,setCreated]=useState(null),[mergeSaved,setMergeSaved]=useState(false)
 const parts=String(current.contact_name||'').includes('@')?[]:String(current.contact_name||'').trim().split(/\s+/),[form,setForm]=useState({firstName:parts[0]||'',lastName:parts.slice(1).join(' '),email:info.contact?.email||'',phone:current.contact_phone||'',category:'buyer'})
 const [routing,setRouting]=useState('')
 const [propertyKind,setPropertyKind]=useState('listing'),[propertyId,setPropertyId]=useState(''),[properties,setProperties]=useState([]),[propertyLoading,setPropertyLoading]=useState(false),[propertyError,setPropertyError]=useState('')
 const alive=useRef(true),lock=useRef(false),org=workspace.organisationId
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{
  if(mode!=='merge'||!info.client)return
  let active=true;setSearching(true);setChoice('');setError('')
  const timer=setTimeout(()=>{searchInboxClients(org,search).then(rows=>{if(active)setClients(rows.filter(row=>row.identityId!==info.client.identityId))}).catch(cause=>{if(active)setError(cause.message)}).finally(()=>{if(active)setSearching(false)})},250)
  return()=>{active=false;clearTimeout(timer)}
 },[mode,org,search,info.client])
 useEffect(()=>{
  if(mode!=='link')return
  let active=true;setSearching(true);setError('');setChoice('')
  const timer=setTimeout(()=>{searchInboxLeads(org,search).then(rows=>{if(active)setLeadOptions(rows)}).catch(cause=>{if(active){setLeadOptions([]);setError(cause.message)}}).finally(()=>{if(active)setSearching(false)})},250)
  return()=>{active=false;clearTimeout(timer)}
 },[mode,org,search])
 useEffect(()=>{
  if(mode!=='create'||form.category!=='buyer'||created)return
  let active=true
  const timer=setTimeout(()=>{setPropertyLoading(true);setPropertyError('');searchClientProperties(org,propertyKind).then(rows=>{if(active)setProperties(rows)}).catch(cause=>{if(active){setProperties([]);setPropertyError(cause.message)}}).finally(()=>{if(active)setPropertyLoading(false)})},200)
  return()=>{active=false;clearTimeout(timer)}
 },[mode,form.category,created,org,propertyKind])
 const selectedProperty=properties.find(p=>p.id===propertyId)
 async function save(event){
  event.preventDefault();if(lock.current||mergeSaved)return;lock.current=true;setBusy(true);setError('')
  try{
   if(mode==='merge'){
    const target=clients.find(row=>row.identityId===choice);if(!target||!confirmed||!reason.trim())throw Error('Choose the client to keep and confirm the merge.');if(!workspace.canManage)throw Error('An organisation principal must merge client profiles.')
    await mergeClientIdentities(target,info.client,reason);const { invalidateAgentClientDirectoryCache }=await import('../../core/clients/agentClientDirectory');invalidateAgentClientDirectoryCache();if(alive.current){setMergeSaved(true);setNotice('Client profiles merged. Original enquiries and transactions have been kept.')}
   }else{
    let record=mode==='create'?created:candidates.find(row=>`${row.kind}:${row.recordId}`===choice)
    if(mode==='create'&&!record){if(form.category==='buyer'&&!properties.some(p=>p.id===propertyId))throw Error('Choose a property or development for this buyer.');if(form.category==='buyer'&&selectedProperty?.kind==='listing'&&selectedProperty.assignedAgentId!==workspace.currentUserId&&(!selectedProperty.assignedAgentId||!routing))throw Error('Choose Refer or Share for the listing’s assigned agent.');record=await createInboxLead({organisationId:org,current,actor:{id:workspace.currentUserId,name:workspace.assignees?.find(row=>row.id===workspace.currentUserId)?.name||'You'},...form,property:properties.find(p=>p.id===propertyId)});record={...record,routing,property:form.category==='buyer'?properties.find(p=>p.id===propertyId):null};if(alive.current){setCreated(record);setNotice('Lead saved. Linking it to this chat…')}}
    if(!alive.current)return;if(record?.property)await saveInboxLeadProperty({organisationId:org,recordId:record.recordId,property:record.property});if(!record)throw Error('Choose a matching lead.');await linkInboxLead({organisationId:org,conversationId:current.id,kind:record.kind,recordId:record.recordId,channel:current.channel,actorId:workspace.currentUserId});if(mode==='create'&&record.property?.kind==='listing'&&record.property.assignedAgentId!==workspace.currentUserId)await routeInboxLead({organisationId:org,recordId:record.recordId,listingId:record.property.id,expectedAgentId:record.property.assignedAgentId,mode:record.routing,actor:{id:workspace.currentUserId}})
   }
   if(alive.current){await onChanged?.();onClose()}
  }catch(cause){if(alive.current)setError(mode==='create'&&created?`The lead is saved, but linking needs another attempt: ${cause.message}`:cause.message)}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 const candidates=[...new Map([...(search?[]:info.context?.candidates||[]),...leadOptions].filter(row=>row.kind!=='recruitment').map(row=>[`${row.kind}:${row.recordId}`,row])).values()],target=clients.find(row=>row.identityId===choice)
 return <Modal open title={mode==='create'?'Create lead from inbox':mode==='merge'?'Merge with existing client':'Link existing lead'} subtitle={mode==='merge'?'Choose the client profile to keep. Both profiles’ history is retained.':''} className="inbox-crm-dialog" onClose={busy?undefined:onClose}>
  <form onSubmit={event=>void save(event)}>
   {mode==='create'?created?<p role="status">The {created.kind} lead has been created. Retry linking it to this chat without creating another lead.</p>:<><div className="inbox-lead-choices" role="group" aria-label="Lead type">{["buyer","seller"].map(type=><button key={type} type="button" aria-pressed={form.category===type} onClick={()=>setForm(old=>({...old,category:type}))}>{type==='buyer'?'Buyer':'Seller'}</button>)}</div><div className="inbox-lead-names"><label>First name<input required value={form.firstName} onChange={event=>setForm(old=>({...old,firstName:event.target.value}))}/></label><label>Last name<input value={form.lastName} onChange={event=>setForm(old=>({...old,lastName:event.target.value}))}/></label></div><label>Phone number<input value={form.phone} onChange={event=>setForm(old=>({...old,phone:event.target.value}))}/></label><label>Email (optional)<input type="email" value={form.email} onChange={event=>setForm(old=>({...old,email:event.target.value}))}/></label>{form.category==='buyer'&&<fieldset><legend>Interested in</legend><div className="inbox-lead-choices" role="tablist" aria-label="Properties and developments">{['listing','development'].map(kind=><button key={kind} type="button" role="tab" aria-selected={propertyKind===kind} onClick={()=>{setPropertyKind(kind);setPropertyId('');setProperties([]);setRouting('')}}>{kind==='listing'?'Listings':'Developments'}</button>)}</div><InboxPropertyPicker kind={propertyKind} options={properties} value={propertyId} loading={propertyLoading} onChange={value=>{setPropertyId(value);setRouting('')}}/>{selectedProperty?.kind==='listing'&&selectedProperty.assignedAgentId!==workspace.currentUserId&&<div className="inbox-lead-routing"><strong>Who will handle this lead?</strong>{!selectedProperty.assignedAgentId?<p role="alert">This listing has no assigned agent. Assign an agent to the listing before referring or sharing.</p>:<div className="inbox-lead-choices" role="group" aria-label="Lead handover">{['refer','share'].map(mode=><button key={mode} type="button" aria-pressed={routing===mode} onClick={()=>setRouting(mode)}><strong>{mode==='refer'?'Refer':'Share'}</strong><small>{mode==='refer'?'Move to the listing agent':'Keep together with the listing agent'}</small></button>)}</div>}{routing&&<p>{routing==='refer'?'The listing’s assigned agent will own this lead.':'You and the listing agent will work on the same lead. Changes stay in sync.'}</p>}</div>}{selectedProperty?.kind==='listing'&&selectedProperty.assignedAgentId===workspace.currentUserId&&<p>This listing is assigned to you.</p>}{propertyError&&<p role="alert">{propertyError}</p>}</fieldset>}<p>If this person already has a lead, use “Link existing lead” to avoid a duplicate.</p></>:mode==='link'?<><label>Find a lead<input placeholder="Search by name or phone" value={search} disabled={busy} onChange={event=>{setSearch(event.target.value);setChoice('')}}/></label><label>Existing lead<select value={choice} required disabled={busy||info.loading||searching} onChange={event=>setChoice(event.target.value)}><option value="">{searching?'Finding leads…':'Choose a lead'}</option>{candidates.map(row=><option key={`${row.kind}:${row.recordId}`} value={`${row.kind}:${row.recordId}`}>{row.name||'Unnamed lead'} · {row.kind} · {row.phone||'No phone'}</option>)}</select></label>{!searching&&!candidates.length&&<p>No leads found. Try another name or phone number.</p>}</>:!info.client?<p>Link or create a lead first. This gives the chat a client profile that can be reviewed and merged with another client.</p>:!workspace.canManage?<p>An organisation principal must merge client profiles.</p>:<><label>Find existing client<input placeholder="Name, email or phone" value={search} disabled={busy} onChange={event=>{setSearch(event.target.value);setConfirmed(false)}}/></label><label>Client to keep<select required value={choice} disabled={busy||searching||mergeSaved} onChange={event=>{setChoice(event.target.value);setConfirmed(false)}}><option value="">{searching?'Finding clients…':'Choose existing client'}</option>{clients.map(client=><option key={client.identityId} value={client.identityId}>{client.name} · {client.email||client.phone}</option>)}</select></label>{target&&<div className="inbox-merge-summary"><strong>Keep: {target.name}</strong><small>{target.email||target.phone}</small><strong>Merge: {info.client.name}</strong><small>{info.client.email||info.client.phone}</small></div>}<label>Why are these the same client?<textarea required maxLength={2000} value={reason} disabled={busy||mergeSaved} onChange={event=>setReason(event.target.value)}/></label><label className="inbox-merge-confirm"><input type="checkbox" checked={confirmed} disabled={busy||mergeSaved} onChange={event=>setConfirmed(event.target.checked)}/>I reviewed both profiles and confirm they are the same person.</label></>}
   {mode!=='create'&&onCreate&&<button className="inbox-create-alternative" type="button" disabled={busy} onClick={onCreate}><span className="inbox-create-icon"><Plus size={18}/></span><span><strong>Create a new lead</strong><small>Add this person to your CRM</small></span><ArrowRight size={16}/></button>}
   {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
   {mergeSaved?<button type="button" onClick={()=>{void onChanged?.();onClose()}}>Close and refresh</button>:<button type="submit" disabled={busy||info.loading||Boolean(info.error)||(mode==='link'&&(!choice||searching))||(mode==='merge'&&(!info.client||!workspace.canManage||!choice||!confirmed||!reason.trim()||searching))}>{busy?'Saving…':mode==='create'?created?'Retry linking saved lead':'Create and link lead':mode==='merge'?'Confirm merge':'Link lead'}</button>}
  </form>
 </Modal>
}
