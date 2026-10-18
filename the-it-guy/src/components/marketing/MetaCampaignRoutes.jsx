import { useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'

const inputClass='rounded-lg border bg-white p-2'
function RoutesBody({workspace}){
 const [data,setData]=useState({routes:[],forms:[]}),[draft,setDraft]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const alive=useRef(true),org=workspace.organisationId
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');metaIntegrationRequest(org,'meta_routes_list').then(value=>{if(!cancelled)setData(value)}).catch(failure=>{if(!cancelled){setData({routes:[],forms:[]});setError(failure.message)}}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[org,revision])
 async function changeRoute(action,route){if(busy)return;setBusy(true);setError('');try{await metaIntegrationRequest(org,action,{routeId:route.id||null,version:route.version||null,route:action==='meta_routes_save'?{formMappingId:route.formMappingId,campaignId:route.campaignId.trim(),campaignName:route.campaignName.trim(),leadType:route.leadType,agentId:route.leadType==='recruitment'?null:route.agentId||null,branchId:null}:null});if(alive.current){setDraft(null);setRevision(old=>old+1)}}catch(failure){if(alive.current)setError(failure.message)}finally{if(alive.current)setBusy(false)}}
 return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-lg font-semibold">Meta campaign routing</h3><p className="text-sm text-slate-600">Override a selected form’s lead type and agent for an exact Meta campaign ID. Other campaigns keep the form’s default route. Arch9 uses the campaign ID returned by Meta; campaign names do not determine routing. Existing leads keep their original destination.</p>
  {loading?<p role="status">Loading campaign routes…</p>:<Button size="sm" disabled={busy||!data.forms.length} onClick={()=>setDraft({formMappingId:data.forms[0]?.id||'',campaignId:'',campaignName:'',leadType:'buyer',agentId:null})}>Add campaign route</Button>}
  {!loading&&!data.forms.length&&<p className="text-sm">Enable a form on a connected Page first.</p>}{error&&<p role="alert" className="text-red-800">{error}</p>}
  {draft&&<form className="space-y-3 rounded-lg border p-4" onSubmit={event=>{event.preventDefault();void changeRoute('meta_routes_save',draft)}}><fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
   <label className="grid gap-1">Enabled form<select required className={inputClass} value={draft.formMappingId} onChange={event=>setDraft(old=>({...old,formMappingId:event.target.value}))}>{data.forms.map(form=><option key={form.id} value={form.id}>{form.name} · {form.formId} · default {form.leadType}</option>)}</select></label>
   <label className="grid gap-1">Meta campaign ID<input required inputMode="numeric" pattern="[0-9]{1,30}" maxLength={30} className={inputClass} value={draft.campaignId} onChange={event=>setDraft(old=>({...old,campaignId:event.target.value}))}/><small>Copy the numeric ID from Meta Ads Manager.</small></label>
   <label className="grid gap-1">Campaign label (optional)<input maxLength={200} className={inputClass} value={draft.campaignName} onChange={event=>setDraft(old=>({...old,campaignName:event.target.value}))}/></label>
   <label className="grid gap-1">Lead destination<select className={inputClass} value={draft.leadType} onChange={event=>setDraft(old=>({...old,leadType:event.target.value,...(event.target.value==='recruitment'?{agentId:null}:{})}))}><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="recruitment">Recruitment</option></select></label>
   {draft.leadType!=='recruitment'?<label className="grid gap-1">Route new leads to<select className={inputClass} value={draft.agentId||''} onChange={event=>setDraft(old=>({...old,agentId:event.target.value||null}))}><option value="">Agency queue</option>{workspace.assignees.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>:<p className="text-sm">Recruitment goes to its management pipeline. Agent assignment does not apply.</p>}
  </fieldset><div className="flex gap-2"><Button size="sm" type="submit" disabled={busy}>Save campaign route</Button><Button size="sm" variant="secondary" disabled={busy} onClick={()=>setDraft(null)}>Cancel</Button></div></form>}
  <div className="space-y-3">{data.routes.map(route=><article key={route.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><h4 className="font-semibold">{route.campaign_name||route.campaign_id} · {route.enabled?'On':'Off'}</h4><p className="text-sm">Campaign {route.campaign_id} · {data.forms.find(form=>form.id===route.form_mapping_id)?.name||'Form unavailable'} → {route.lead_type} · {route.assigned_agent_id?workspace.assignees.find(agent=>agent.id===route.assigned_agent_id)?.name||'Agent unavailable':'Agency queue'}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={()=>setDraft({id:route.id,version:route.version,formMappingId:route.form_mapping_id,campaignId:route.campaign_id,campaignName:route.campaign_name,leadType:route.lead_type,agentId:route.assigned_agent_id})}>Edit {route.campaign_name||route.campaign_id}</Button>{route.enabled&&<Button size="sm" variant="secondary" disabled={busy} onClick={()=>void changeRoute('meta_routes_disable',route)}>Disable {route.campaign_name||route.campaign_id}</Button>}</div></article>)}</div>
  <p className="text-xs text-slate-600">Finish any active historical import before changing its campaign routes. Historical imports apply the same routes and keep messaging and new-lead notifications suppressed.</p>
 </section>
}
export default function MetaCampaignRoutes({organisationId}){
 const workspace=useMetaWorkspace()
 return !workspace.loading&&workspace.canManage&&workspace.organisationId===organisationId?<RoutesBody key={workspace.accessScope} workspace={workspace}/>:null
}
export function WhatsAppCampaignReplyNotice({organisationId,conversationId,accessScope}){
 const [state,setState]=useState({key:'',routes:[]}),key=`${accessScope}:${conversationId}`
 useEffect(()=>{let cancelled=false;metaIntegrationRequest(organisationId,'campaign_reply_status',{conversationId}).then(data=>{if(!cancelled)setState({key,routes:data.routes||[]})}).catch(()=>{if(!cancelled)setState({key,routes:[]})});return()=>{cancelled=true}},[organisationId,conversationId,key])
 const routes=state.key===key?state.routes:[]
 return routes.length?<aside className="rounded-lg border bg-blue-50 p-3 text-sm" aria-label="Campaign reply routing">{routes.slice(0,1).map(route=><p key={route.created_at}>{route.reason}</p>)}</aside>:null
}
