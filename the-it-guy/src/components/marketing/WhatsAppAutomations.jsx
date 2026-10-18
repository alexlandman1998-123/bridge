import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import { automationDraft, automationTemplate } from '../../../../supabase/functions/_shared/whatsappAutomation.js'
import { templateFields } from '../../../../supabase/functions/_shared/whatsappCampaign.js'
import { getAgencyLeadColumns } from '../../pages/agency/agencyLeadListModel'

const triggers={new_lead:'New lead',no_response:'No response after a sent message',stage_changed:'Lead stage changes'}
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const fresh=()=>({name:'',kind:'buyer',trigger:'new_lead',action:'message',stage:'',delayMinutes:0,startMinute:540,endMinute:1020,days:[1,2,3,4,5],timezone:'Africa/Johannesburg',assignAgentId:null,senderId:'',template:null,values:{},taskTitle:''})
const clock=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`
const minutes=value=>{const [hour,minute]=value.split(':').map(Number);return hour*60+minute}
const fieldClass='rounded-lg border bg-white p-2 font-normal'

function RuleEditor({ workspace, rule, onSaved, onCancel }) {
  const [draft,setDraft]=useState(()=>rule?.config||fresh()),[templates,setTemplates]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('')
  const live=useRef(true)
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
  const org=workspace.organisationId,sender=draft.senderId
  useEffect(()=>{
    let cancelled=false
    if(!sender||draft.action!=='message'){setTemplates([]);return undefined}
    setLoading(true);setTemplates([]);setError('')
    metaIntegrationRequest(org,'automation_templates',{senderId:sender}).then(data=>{if(!cancelled)setTemplates(data.templates||[])}).catch(failure=>{if(!cancelled)setError(failure.message)}).finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[org,sender,draft.action])
  function change(key,value){setDraft(old=>({...old,[key]:value}));setError('')}
  const template=draft.template,definition=templateFields(template)
  let preview=''
  try { if(template)preview=automationTemplate(template,draft.values).preview } catch { /* Incomplete variables are explained on save. */ }
  const stageOptions=draft.kind==='recruitment'?['new','contacted','interview','onboarding','joined','closed_lost']:getAgencyLeadColumns(draft.kind).map(column=>column.stageValue)
  async function save(event){
    event.preventDefault();setBusy(true);setError('')
    try {
      const config=automationDraft(draft)
      await metaIntegrationRequest(org,'automation_save',{ruleId:rule?.id,version:rule?.version,rule:config})
      if(live.current)onSaved()
    }catch(failure){if(live.current)setError(failure.message)}finally{if(live.current)setBusy(false)}
  }
  return <form onSubmit={save} className="space-y-5 rounded-xl border bg-white p-5">
    <h2 className="text-xl font-semibold">{rule?'Edit automation':'New automation'}</h2>
    <p className="text-sm text-slate-600">Saving leaves this rule switched off. Enable it separately after reviewing the settings. Enabling applies to future events.</p>
    <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1 font-medium">Rule name<input required maxLength={100} className={fieldClass} value={draft.name} onChange={event=>change('name',event.target.value)}/></label>
      <label className="grid gap-1 font-medium">Lead type<select className={fieldClass} value={draft.kind} onChange={event=>setDraft(old=>({...old,kind:event.target.value,stage:'',assignAgentId:null}))}><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="recruitment">Recruitment</option></select></label>
      <label className="grid gap-1 font-medium">When<select className={fieldClass} value={draft.trigger} onChange={event=>setDraft(old=>({...old,trigger:event.target.value,assignAgentId:null,delayMinutes:event.target.value==='no_response'?60:0}))}>{Object.entries(triggers).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      {draft.trigger==='stage_changed'&&<label className="grid gap-1 font-medium">Trigger stage<input required list="whatsapp-automation-stages" className={fieldClass} value={draft.stage} onChange={event=>change('stage',event.target.value)}/><datalist id="whatsapp-automation-stages">{stageOptions.map(stage=><option key={stage} value={stage}/>)}</datalist><span className="text-xs font-normal text-slate-600">Matches the saved lead stage, ignoring letter case.</span></label>}
      <label className="grid gap-1 font-medium">Delay in minutes<input required type="number" min={draft.trigger==='no_response'?1:0} max={10080} className={fieldClass} value={draft.delayMinutes} onChange={event=>change('delayMinutes',Number(event.target.value))}/></label>
      {draft.trigger==='new_lead'&&draft.kind!=='recruitment'&&<label className="grid gap-1 font-medium">Assign unassigned leads to<select className={fieldClass} value={draft.assignAgentId||''} onChange={event=>change('assignAgentId',event.target.value||null)}><option value="">Keep existing assignment or agency queue</option>{workspace.assignees.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>}
      <label className="grid gap-1 font-medium">Action<select className={fieldClass} value={draft.action} onChange={event=>change('action',event.target.value)}><option value="message">Send WhatsApp template</option><option value="task">Create follow-up task</option></select></label>
      {draft.action==='task'?<label className="grid gap-1 font-medium">Task title<input required maxLength={200} className={fieldClass} value={draft.taskTitle} onChange={event=>change('taskTitle',event.target.value)}/></label>:<>
        <label className="grid gap-1 font-medium">Sender<select required className={fieldClass} value={draft.senderId||''} onChange={event=>setDraft(old=>({...old,senderId:event.target.value,template:null,values:{}}))}><option value="">Choose connected number</option>{workspace.senders.filter(number=>number.connection_status==='connected'&&(draft.kind!=='recruitment'||!number.owner_user_id)).map(number=><option key={number.id} value={number.id}>{number.display_phone_number||number.business_display_name||'WhatsApp number'}{number.owner_user_id?' · agent number':' · agency number'}</option>)}</select></label>
        <label className="grid gap-1 font-medium">Approved template<select required disabled={loading||!sender} className={fieldClass} value={template?.id||''} onChange={event=>setDraft(old=>({...old,template:templates.find(item=>item.id===event.target.value)||null,values:{}}))}><option value="">{loading?'Loading templates…':'Choose text template'}</option>{templates.filter(item=>{try{const fields=templateFields(item);return !fields.unsupported.length&&fields.fields.every(field=>field.kind==='text')}catch{return false}}).map(item=><option key={item.id} value={item.id}>{item.name} · {item.language}</option>)}</select></label>
        {template&&definition.fields.map(field=><label key={field.key} className="grid gap-1 font-medium">{field.label}<select className={fieldClass} value={draft.values[field.key]?.source||'text'} onChange={event=>change('values',{...draft.values,[field.key]:{source:event.target.value,text:''}})}><option value="text">Fixed text</option><option value="first_name">Contact first name</option><option value="full_name">Contact full name</option></select>{(!draft.values[field.key]?.source||draft.values[field.key].source==='text')&&<input required aria-label={`${field.label} fixed text`} className={fieldClass} value={draft.values[field.key]?.text||''} onChange={event=>change('values',{...draft.values,[field.key]:{source:'text',text:event.target.value}})}/>}</label>)}
      </>}
    </fieldset>
    {preview&&draft.action==='message'&&<div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold">Example message</p><p className="mt-1 whitespace-pre-wrap">{preview}</p></div>}
    <fieldset disabled={busy} className="space-y-3 rounded-lg border p-4"><legend className="px-1 font-semibold">Allowed hours</legend>
      <div className="flex flex-wrap gap-4">{weekdays.map((day,index)=><label key={day} className="flex gap-2 text-sm"><input type="checkbox" checked={draft.days.includes(index+1)} onChange={event=>change('days',event.target.checked?[...draft.days,index+1]:draft.days.filter(item=>item!==index+1))}/>{day}</label>)}</div>
      <div className="grid gap-3 md:grid-cols-3"><label className="grid gap-1">From<input required type="time" className={fieldClass} value={clock(draft.startMinute)} onChange={event=>change('startMinute',minutes(event.target.value))}/></label><label className="grid gap-1">Until<input required type="time" className={fieldClass} value={draft.endMinute===1440?'23:59':clock(draft.endMinute)} onChange={event=>change('endMinute',minutes(event.target.value))}/></label><label className="grid gap-1">Time zone<input required className={fieldClass} value={draft.timezone} onChange={event=>change('timezone',event.target.value)}/></label></div>
    </fieldset>
    <p className="text-sm text-slate-600">Messages need recorded one-to-one WhatsApp permission for the selected number. A lead enquiry alone does not record permission. Agent numbers can message only their assigned leads. Follow-ups start after a sent message in a linked conversation, once per lead stage. Replies, opt-outs, lead changes and switching the rule off stop pending actions.</p>
    {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex gap-3"><Button type="submit" disabled={busy||loading}>{busy?'Saving…':'Save switched off'}</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>
}

function AutomationWorkspace({ workspace }) {
  const [rules,setRules]=useState([]),[runs,setRuns]=useState([]),[editor,setEditor]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[approved,setApproved]=useState({}),[revision,setRevision]=useState(0)
  const live=useRef(true),lock=useRef(false)
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
  const org=workspace.organisationId
  useEffect(()=>{
    let cancelled=false;setLoading(true);setError('')
    Promise.all([metaIntegrationRequest(org,'automation_list'),metaIntegrationRequest(org,'automation_runs')]).then(([config,activity])=>{if(!cancelled){setRules(config.rules||[]);setRuns(activity.runs||[])}}).catch(failure=>{if(!cancelled){setRules([]);setRuns([]);setError(failure.message)}}).finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[org,revision])
  async function toggle(rule){
    if(lock.current)return
    lock.current=true;setBusy(rule.id);setError('')
    try {await metaIntegrationRequest(org,rule.enabled?'automation_disable':'automation_enable',{ruleId:rule.id,version:rule.version,confirmed:approved[rule.id]===true});if(live.current){setApproved({});setRevision(old=>old+1)}}catch(failure){if(live.current)setError(failure.message)}finally{lock.current=false;if(live.current)setBusy('')}
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-3"><Button disabled={loading||Boolean(busy)} onClick={()=>setEditor({id:'new'})}>New rule</Button><Button variant="secondary" disabled={loading||Boolean(busy)} onClick={()=>setRevision(old=>old+1)}>Refresh activity</Button></div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {editor&&<RuleEditor key={editor.id} workspace={workspace} rule={editor.id==='new'?null:editor} onCancel={()=>setEditor(null)} onSaved={()=>{setEditor(null);setApproved({});setRevision(old=>old+1)}}/>}
    {loading?<p role="status">Loading automations…</p>:<div className="grid gap-4">{rules.map(rule=><article key={rule.id} className="space-y-3 rounded-xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{rule.config.name} · {rule.enabled?'On':'Off'}</h2><p className="text-sm text-slate-600">{rule.config.kind} · {triggers[rule.config.trigger]}{rule.config.stage?`: ${rule.config.stage}`:''} · {rule.config.action==='task'?'Create task':'Send template'} · {rule.config.delayMinutes} minute delay</p><p className="text-xs text-slate-600">{rule.config.days.map(day=>weekdays[day-1].slice(0,3)).join(', ')} · {clock(rule.config.startMinute)}–{clock(rule.config.endMinute)} · {rule.config.timezone}</p></div><Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={()=>setEditor(rule)}>Edit</Button></div>
      {!rule.enabled&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={approved[rule.id]===true} onChange={event=>setApproved(old=>({...old,[rule.id]:event.target.checked}))}/>Allow this rule to act on future leads and messages.</label>}
      <Button size="sm" variant={rule.enabled?'secondary':'primary'} disabled={Boolean(busy)||!rule.enabled&&!approved[rule.id]} onClick={()=>void toggle(rule)}>{busy===rule.id?'Saving…':rule.enabled?'Switch off and stop pending actions':'Enable rule'}</Button>
    </article>)}{!rules.length&&<p>No rules yet. Create one, review its settings, then enable it.</p>}</div>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Recent activity</h2><p className="text-sm text-slate-600">Latest 100 actions. Sent means submitted to Meta; delivery receipts appear in the inbox. Unconfirmed sends are never automatically repeated.</p><div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Rule</th><th className="p-3">Lead</th><th className="p-3">Result</th><th className="p-3">Details</th><th className="p-3">Due</th></tr></thead><tbody>{runs.map(run=><tr key={run.id} className="border-t"><td className="p-3">{rules.find(rule=>rule.id===run.rule_id)?.config.name||'Automation'}</td><td className="p-3">{run.record_id?<Link className="text-blue-800 underline" to={run.kind==='recruitment'?`/agency/recruitment/${run.record_id}`:`/pipeline/leads/${run.record_id}`}>{run.contact_name||`${run.kind} lead`}</Link>:'Lead'}</td><td className="p-3">{run.status.replaceAll('_',' ')}</td><td className="p-3">{run.reason||'Waiting for processing'}</td><td className="p-3">{new Date(run.due_at).toLocaleString()}</td></tr>)}</tbody></table></div>{!loading&&!runs.length&&<p className="text-sm">No automation activity yet.</p>}</section>
  </div>
}

export default function WhatsAppAutomations(){
  const workspace=useMetaWorkspace()
  return <section className="space-y-5"><header><h1 className="text-2xl font-semibold">WhatsApp automations</h1><p className="mt-1 text-sm text-slate-600">Lead acknowledgements, follow-ups and stage actions.</p></header><nav aria-label="WhatsApp" className="flex flex-wrap gap-5 text-sm font-semibold text-blue-800"><Link to="/marketing?section=whatsapp">Campaigns</Link><Link to="/marketing?section=whatsapp&view=inbox">Inbox</Link><span aria-current="page">Automations</span><Link to="/settings/integrations/whatsapp">Connections</Link></nav>{workspace.error?<p role="alert">{workspace.error}</p>:workspace.loading?<p role="status">Loading workspace…</p>:workspace.canManage?<AutomationWorkspace key={workspace.accessScope} workspace={workspace}/>:<p>Agency management can configure WhatsApp automations.</p>}</section>
}
