import { useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import { audienceDraft } from '../../../../supabase/functions/_shared/whatsappAudience.js'

const field='rounded-lg border bg-white p-2'
const empty=()=>({name:'',filters:{kind:'buyer',areas:[],stages:[],agentId:null,includeClosed:false}})
const split=value=>value.split(',').map(item=>item.trim()).filter(Boolean)
function AudienceFields({draft,onChange,agents}){
  const filters=draft.filters
  const [areaText,setAreaText]=useState(()=>filters.areas.join(', ')), [stageText,setStageText]=useState(()=>filters.stages.join(', '))
  const change=(key,value)=>onChange({...draft,filters:{...filters,[key]:value}})
  return <div className="grid gap-3 md:grid-cols-2">
    <label className="grid gap-1">Audience name<input required maxLength={100} className={field} value={draft.name} onChange={event=>onChange({...draft,name:event.target.value})}/></label>
    <label className="grid gap-1">Lead type<select className={field} value={filters.kind} onChange={event=>onChange({...draft,filters:{...filters,kind:event.target.value,agentId:null}})}><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="recruitment">Recruitment</option></select></label>
    <label className="grid gap-1">Areas (comma separated)<input className={field} value={areaText} onChange={event=>{setAreaText(event.target.value);change('areas',split(event.target.value))}}/><small>Matches saved CRM locations exactly, ignoring letter case. Buyer requirements, seller listing locations and recruitment areas are used.</small></label>
    <label className="grid gap-1">Stages (comma separated)<input className={field} value={stageText} onChange={event=>{setStageText(event.target.value);change('stages',split(event.target.value))}}/><small>Leave blank for any active stage.</small></label>
    {filters.kind!=='recruitment'&&<label className="grid gap-1">Assigned agent<select className={field} value={filters.agentId||''} onChange={event=>change('agentId',event.target.value||null)}><option value="">Any agent or agency queue</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>}
    <label className="flex items-center gap-2"><input type="checkbox" checked={filters.includeClosed} onChange={event=>change('includeClosed',event.target.checked)}/>Include closed or archived leads</label>
  </div>
}
function PreviewSummary({data}){
  return <p className="rounded-lg bg-slate-50 p-3 text-sm">{data.matched} CRM records · {data.eligiblePhones} phones with campaign permission · {data.invalidPhones} invalid phones · {data.ambiguousRecords} phones with multiple CRM records. One phone receives one message.</p>
}
function AudienceManagerBody({workspace}){
  const [audiences,setAudiences]=useState([]),[draft,setDraft]=useState(null),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
  const live=useRef(true),generation=useRef(0),org=workspace.organisationId
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
  useEffect(()=>{let cancelled=false;setLoading(true);metaIntegrationRequest(org,'audience_list').then(data=>{if(!cancelled)setAudiences(data.audiences||[])}).catch(failure=>{if(!cancelled){setAudiences([]);setError(failure.message)}}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[org,revision])
  async function run(operation){if(busy)return;setBusy(true);setError('');try{await operation()}catch(failure){if(live.current)setError(failure.message)}finally{if(live.current)setBusy(false)}}
  async function showPreview(filters){const request=++generation.current;setPreview(null);const data=await metaIntegrationRequest(org,'audience_preview',{filters,limit:50});if(live.current&&generation.current===request)setPreview(data)}
  async function save(event){event.preventDefault();await run(async()=>{const value=audienceDraft(draft);await metaIntegrationRequest(org,'audience_save',{audienceId:draft.id,version:draft.version,audience:value});if(live.current){setDraft(null);setPreview(null);setRevision(old=>old+1)}})}
  return <section className="space-y-4 rounded-xl border bg-white p-5"><header><h2 className="text-xl font-semibold">Saved CRM audiences</h2><p className="text-sm text-slate-600">Save lead filters, then review their current members in a campaign. Saving an audience does not record WhatsApp permission or send anything.</p></header>
    <Button size="sm" disabled={busy||loading} onClick={()=>{setDraft({...empty(),uiKey:++generation.current});setPreview(null)}}>New audience</Button>
    {error&&<p role="alert" className="text-red-800">{error}</p>}{loading&&<p role="status">Loading audiences…</p>}
    {draft&&<form onSubmit={save} className="space-y-4 rounded-lg border p-4"><fieldset disabled={busy}><AudienceFields key={draft.uiKey} draft={draft} agents={workspace.assignees} onChange={value=>{generation.current++;setDraft(value);setPreview(null)}}/></fieldset><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Save audience</Button><Button variant="secondary" disabled={busy} onClick={()=>void run(()=>showPreview(audienceDraft(draft).filters))}>Preview matches</Button><Button variant="secondary" disabled={busy} onClick={()=>{generation.current++;setDraft(null);setPreview(null)}}>Cancel</Button></div></form>}
    <div className="grid gap-3">{audiences.map(audience=><article className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" key={audience.id}><div><h3 className="font-semibold">{audience.name}</h3><p className="text-sm text-slate-600">{audience.filters.kind} · {audience.filters.areas.join(', ')||'Any area'} · {audience.filters.stages.join(', ')||'Any active stage'}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={()=>{setDraft({...audience,uiKey:++generation.current});setPreview(null)}}>Edit {audience.name}</Button><Button size="sm" variant="secondary" disabled={busy} onClick={()=>void run(()=>showPreview(audience.filters))}>Preview {audience.name}</Button><Button size="sm" variant="secondary" disabled={busy} onClick={()=>void run(async()=>{await metaIntegrationRequest(org,'audience_archive',{audienceId:audience.id,version:audience.version});if(live.current){setRevision(old=>old+1);setPreview(null)}})}>Archive {audience.name}</Button></div></article>)}</div>
    {preview&&<div className="space-y-2"><PreviewSummary data={preview}/><ul className="max-h-72 overflow-auto divide-y">{preview.rows.map(row=><li className="py-2 text-sm" key={`${row.kind}:${row.record_id}`}>{row.name||'Unnamed lead'} · {row.phone?`+${row.phone}`:'No valid phone'} · {row.eligible?'Campaign permission recorded':'No campaign permission'}</li>)}</ul>{preview.hasMore&&<p className="text-sm">Showing the first 50 records. The campaign builder lets you narrow and select the recipients to review.</p>}</div>}
    {!loading&&!audiences.length&&<p className="text-sm">No saved audiences yet.</p>}
  </section>
}
export default function WhatsAppAudiences(){
 const workspace=useMetaWorkspace()
 return workspace.loading?<p role="status">Loading audience access…</p>:workspace.error?<p role="alert">{workspace.error}</p>:workspace.canManage?<AudienceManagerBody key={workspace.accessScope} workspace={workspace}/>:<p className="text-sm">Agency management can create CRM audiences. WhatsApp contact permission remains separate.</p>
}

function AudiencePickerBody({workspace,value,onApply}){
 const [audiences,setAudiences]=useState([]),[choice,setChoice]=useState(value?.audienceId||''),[preview,setPreview]=useState(null),[selected,setSelected]=useState({}),[search,setSearch]=useState(''),[mode,setMode]=useState(value?.mode||(value?.audienceId?'record_owner':'agency_queue')),[agent,setAgent]=useState(value?.agentId||''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const org=workspace.organisationId,live=useRef(true),generation=useRef(0)
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 useEffect(()=>{let cancelled=false;metaIntegrationRequest(org,'audience_list').then(data=>{if(!cancelled)setAudiences(data.audiences||[])}).catch(failure=>{if(!cancelled)setError(failure.message)});return()=>{cancelled=true}},[org])
 const audience=audiences.find(item=>item.id===choice),recruitment=audience?.filters.kind==='recruitment',overLimit=Boolean(preview&&(preview.hasMore||preview.matched>500))
 async function load(){const request=++generation.current;setBusy(true);setError('');setPreview(null);setSelected({});try{const data=await metaIntegrationRequest(org,'audience_preview',{filters:audience.filters,search,limit:501});if(live.current&&generation.current===request){setPreview(data);setSelected(Object.fromEntries(data.rows.filter(row=>row.eligible&&row.phone_matches===1).slice(0,500).map(row=>[row.contact_id,row])));if(recruitment)setMode('agency_queue')}}catch(failure){if(live.current&&generation.current===request)setError(failure.message)}finally{if(live.current&&generation.current===request)setBusy(false)}}
 function reset(){generation.current++;setPreview(null);setSelected({});setBusy(false)}
 function apply(){
  if(choice&&overLimit){setError('Narrow the audience to 500 records or fewer before applying.');return}
  if(choice){const rows=Object.values(selected);onApply({contact_ids:rows.map(row=>row.contact_id),audience_plan:{audienceId:audience.id,version:audience.version,mode:recruitment?'agency_queue':mode,agentId:mode==='agent'?agent:null,targets:rows.map(row=>({contactId:row.contact_id,recordId:row.record_id,kind:row.kind,state:row.state}))}})}
  else onApply({audience_plan:{audienceId:null,version:null,mode:mode==='record_owner'?'agency_queue':mode,agentId:mode==='agent'?agent:null,targets:[]}})
 }
 return <section className="space-y-3 rounded-lg border bg-slate-50 p-4"><h3 className="font-semibold">Saved audience and campaign replies</h3>
  <label className="grid gap-1">Saved audience<select className={field} value={choice} onChange={event=>{reset();setChoice(event.target.value);setMode(event.target.value?'record_owner':'agency_queue')}}><option value="">Manual contact selection</option>{audiences.map(item=><option key={item.id} value={item.id}>{item.name} · {item.filters.kind}</option>)}</select></label>
  {choice&&<><label className="grid gap-1">Narrow by name or phone<input type="search" className={field} value={search} onChange={event=>{reset();setSearch(event.target.value)}}/></label><Button size="sm" variant="secondary" disabled={busy||!audience} onClick={()=>void load()}>{busy?'Loading…':'Preview saved audience'}</Button></>}
  {error&&<p role="alert" className="text-red-800">{error}</p>}
  {preview&&<><PreviewSummary data={preview}/><p className="text-sm">For shared phone numbers, choose the correct CRM record. Members without campaign permission cannot be selected.</p><div className="max-h-72 overflow-auto divide-y">{preview.rows.map(row=><label key={`${row.kind}:${row.record_id}`} className="flex items-start gap-3 py-2 text-sm"><input type="checkbox" checked={selected[row.contact_id]?.record_id===row.record_id} disabled={!row.eligible||!selected[row.contact_id]&&Object.keys(selected).length>=500} onChange={event=>setSelected(old=>{const next={...old};if(event.target.checked)next[row.contact_id]=row;else delete next[row.contact_id];return next})}/><span>{row.name||'Unnamed lead'} · {row.phone?`+${row.phone}`:'No valid phone'} · {row.stage||'No stage'} · {row.record_id.slice(-8)}<small className="block">{row.eligible?'Campaign permission recorded':'No campaign permission'}{row.phone_matches>1?' · Multiple CRM records: choose one':''}</small></span></label>)}</div>{overLimit&&<p role="alert">More than 500 records match. Narrow the search or audience filters before applying a selection.</p>}</>}
  <label className="grid gap-1">Assign exact campaign replies to<select className={field} value={recruitment?'agency_queue':mode} disabled={recruitment} onChange={event=>setMode(event.target.value)}>{choice&&<option value="record_owner">The selected CRM record’s agent</option>}<option value="agency_queue">Agency queue</option><option value="agent">A selected agent</option></select></label>
  {!recruitment&&mode==='agent'&&<label className="grid gap-1">Reply agent<select className={field} value={agent} onChange={event=>setAgent(event.target.value)}><option value="">Choose agent</option>{workspace.assignees.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
  <Button size="sm" disabled={busy||Boolean(choice)&&(!preview||overLimit||!Object.keys(selected).length)||!recruitment&&mode==='agent'&&!agent} onClick={apply}>{choice?`Use ${Object.keys(selected).length} selected recipients`:'Apply manual reply route'}</Button>
  {value&&<p className="text-sm">Draft route: {value.audienceId?'reviewed CRM audience':'manual recipients'} · {value.mode==='record_owner'?'record agent':value.mode==='agent'?'selected agent':'agency queue'}. Changes above apply only after you use the selection.</p>}
  <p className="text-xs text-slate-600">Replies need Meta’s exact message context. Existing manual assignments and CRM links are preserved. Ambiguous or changed routes need agency review. Contact selection and permission are checked again before sending.</p>
 </section>
}
export function CampaignAudiencePicker({value,onApply}){
 const workspace=useMetaWorkspace()
 return !workspace.loading&&workspace.canManage?<AudiencePickerBody key={workspace.accessScope} workspace={workspace} value={value} onApply={onApply}/>:null
}
