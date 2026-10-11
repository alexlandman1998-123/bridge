import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLegalWorkspace } from './LegalWorkspaceContext';
import { DISCIPLINE_LABELS } from './legalWorkspaceModel';
import { buttonClass, ErrorMessage, Field, inputClass, useLegalSave } from './LegalUi';
import LegalMatterWork from './LegalMatterWork';
import LegalMatterDocuments from './LegalMatterDocuments';
const TABS=['Overview','Work','Parties','Documents','Activity'];
function overview(m,team){return {title:m.title,restricted:m.restricted,responsible_user_id:m.responsible_user_id,user_ids:team.filter(t=>!t.removed_at).map(t=>t.user_id)};}
export default function LegalMatterDetail({matterId}) {
  const legal=useLegalWorkspace(),[params,setParams]=useSearchParams();
  const [snapshot,setSnapshot]=useState(null),[loadError,setLoadError]=useState(null),[reload,setReload]=useState(0);
  const [editRevision,setEditRevision]=useState(null);
  const [workLoad,setWorkLoad]=useState(null),[workReload,setWorkReload]=useState(0);
  const [members,setMembers]=useState([]),[form,setForm]=useState(null),[intake,setIntake]=useState(null),[status,setStatus]=useState(''),[reason,setReason]=useState('');
  const [clients,setClients]=useState([]),[clientSearch,setClientSearch]=useState(''),[party,setParty]=useState({client_id:'',role:'beneficiary',newIdentity:false,name:''});
  const save=useLegalSave(legal),draftKey=`matter:${matterId}`;
  const {recall,revoke,selectDiscipline,accessVersion}=legal;
  const tab=TABS.includes(params.get('tab'))?params.get('tab'):'Overview';
  const returnUrl=params.get('return'); const back=returnUrl?.startsWith('/legal/matters?')?returnUrl:`/legal/matters?discipline=${snapshot?.matter.discipline||legal.activeDiscipline}`;
  useEffect(()=>{
    let active=true;
    legal.service.matter(legal.firmId,matterId).then(async data=>{
      if(!active)return;
      setSnapshot(data);setLoadError(null);selectDiscipline?.(data.matter.discipline);
      const remembered=recall(draftKey);
      setEditRevision(remembered?.revision??data.matter.revision);
      setForm(remembered?.form||overview(data.matter,data.team));
      setIntake(remembered?.intake||{conflict_decision:data.matter.conflict_decision,engagement_decision:data.matter.engagement_decision,conflict_note:data.matter.conflict_note,engagement_note:data.matter.engagement_note});
      setStatus(remembered?.status||data.matter.status);setReason(remembered?.reason||'');setParty(remembered?.party||{client_id:'',role:'beneficiary',newIdentity:false,name:''});
      try {const directory=await legal.service.directory(legal.firmId,data.matter.discipline);if(active)setMembers(directory);} catch(e){if(active)setLoadError(e);}
    }).catch(e=>{if(active){setSnapshot(null);setLoadError(e);if(e.code==='42501')revoke();}});
    return()=>{active=false;};
  },[legal.service,legal.firmId,matterId,reload,draftKey,recall,revoke,selectDiscipline,accessVersion]);
  useEffect(()=>{
    if(tab!=='Parties')return;
    let active=true;
    const timer=setTimeout(()=>legal.service.clients(legal.firmId,{search:clientSearch,page_size:100}).then(r=>{if(active)setClients(r.rows);}).catch(e=>{if(active)setLoadError(e);}),200);
    return()=>{active=false;clearTimeout(timer);};
  },[legal.service,legal.firmId,tab,clientSearch]);
  const workKey=[matterId,tab,workReload,accessVersion,snapshot?.matter.revision].join(':');
  const workData=workLoad?.key===workKey?workLoad.data:null,workError=workLoad?.key===workKey?workLoad.error:null;
  const loadWork=Boolean(snapshot&&['Work','Documents'].includes(tab));
  useEffect(()=>{
    if(!loadWork)return;
    let active=true;
    legal.service.work(legal.firmId,matterId).then(data=>{if(active)setWorkLoad({key:workKey,data});}).catch(e=>{if(active){setWorkLoad({key:workKey,error:e});if(e.code==='42501')revoke();}});
    return()=>{active=false;};
  },[legal.service,legal.firmId,matterId,workKey,loadWork,revoke]);
  function remember(values){legal.remember(draftKey,{form,intake,status,reason,party,revision:editRevision,...values});}
  function changedForm(patch){const next={...form,...patch};setForm(next);remember({form:next});}
  function changedIntake(patch){const next={...intake,...patch};setIntake(next);remember({intake:next});}
  function refreshed(){setSnapshot(null);setReload(n=>n+1);}
  function command(action,payload){
    const m=snapshot.matter;
    const workDraft=legal.recall(`work:${matterId}`),documentsDraft=legal.recall(`documents:${matterId}`);
    const keep={};
    if(action!=='workspace_overview'&&JSON.stringify(form)!==JSON.stringify(overview(m,snapshot.team)))keep.form=form;
    const originalIntake={conflict_decision:m.conflict_decision,engagement_decision:m.engagement_decision,conflict_note:m.conflict_note,engagement_note:m.engagement_note};
    if(!['review_intake','add_party','remove_party','workspace_party'].includes(action)&&JSON.stringify(intake)!==JSON.stringify(originalIntake))keep.intake=intake;
    if(action!=='update_matter'&&(status!==m.status||reason)){keep.status=status;keep.reason=reason;}
    if(!['add_party','workspace_party'].includes(action)&&(party.client_id||party.name))keep.party=party;
    save.save(action,{matter_id:matterId,expected_revision:editRevision,...payload},result=>{if(workDraft)legal.remember(`work:${matterId}`,workDraft);if(documentsDraft)legal.remember(`documents:${matterId}`,documentsDraft);if(Object.keys(keep).length)legal.remember(draftKey,{...keep,revision:result.matter.revision});refreshed();});
  }
  function workSaved(){
    setWorkReload(n=>n+1);
    legal.service.matter(legal.firmId,matterId).then(data=>{setSnapshot(data);}).catch(e=>{setLoadError(e);if(e.code==='42501')revoke();});
  }
  const workSave={...save,save:(action,payload,done)=>{const draft=legal.recall(draftKey);const docs=legal.recall(`documents:${matterId}`);const pilot=legal.recall(`trust-pilot:${legal.firmId}`);save.save(action,payload,result=>{if(draft)legal.remember(draftKey,draft);if(docs)legal.remember(`documents:${matterId}`,docs);if(pilot&&action!=='work:configure_trusts')legal.remember(`trust-pilot:${legal.firmId}`,pilot);done(result);});}};
  function reloadMatter(){if(legal.confirmLeave()){legal.clearDrafts();refreshed();}}
  if(!snapshot||!form||!intake)return <div className="space-y-4"><ErrorMessage error={loadError}/>{loadError?<button className={buttonClass} onClick={reloadMatter}>Reload</button>:<p role="status">Loading matter…</p>}<Link className="block text-sm underline" to={back}>Back to matters</Link></div>;
  const m=snapshot.matter,manager=legal.context.capabilities.can_manage&&legal.context.grants?.length;
  const canEdit=snapshot.can_edit&&legal.context.capabilities.can_edit;
  const canReview=canEdit&&snapshot.can_review&&legal.context.capabilities.can_review;
  const canLead=canEdit&&(m.responsible_user_id===legal.userId||manager);
  const mutable=!['closed','archived'].includes(m.status);
  const transitions={draft:['open','closed'],open:['on_hold','closed'],on_hold:['open','closed'],closed:['open','archived'],archived:['closed']};
  const locked=save.busy||save.locked;
  return <div className="space-y-5">
    <header><Link className="text-sm text-slate-500" to={back}>← Matters</Link><div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{m.reference} · {DISCIPLINE_LABELS[m.discipline]}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{m.title}</h1></div><div className="flex items-center gap-3"><button className="text-sm text-slate-500 underline" disabled={save.busy||save.locked} onClick={reloadMatter}>Reload</button><span className="rounded-full bg-slate-100 px-3 py-1 text-xs capitalize text-slate-600">{m.status.replace('_',' ')}{m.restricted?' · Restricted':''}</span></div></div></header>
    <nav className="flex gap-5 overflow-x-auto border-b border-slate-200" aria-label="Matter sections">{TABS.map(t=><button key={t} className={`whitespace-nowrap border-b-2 pb-3 text-sm ${tab===t?'border-slate-900 font-medium text-slate-900':'border-transparent text-slate-500'}`} aria-current={tab===t?'page':undefined} onClick={()=>{if(legal.recall('pending-save')){window.alert('Retry or cancel the pending save before leaving.');return;}const p=new URLSearchParams(params);p.set('tab',t);setParams(p);}}>{t}</button>)}</nav>
    <ErrorMessage error={loadError||save.error}/>
    <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    {tab==='Documents'?(workError?<ErrorMessage error={workError}/>:workData?<LegalMatterDocuments key={matterId} legal={legal} matter={m} data={workData} canEdit={canEdit} onSaved={workSaved}/>:<p role="status">Loading documents…</p>):tab==='Overview'?<div className="grid gap-6 sm:grid-cols-2"><section className="space-y-5"><Field label="Title"><input className={inputClass} maxLength={200} disabled={!canEdit||locked} value={form.title} onChange={e=>changedForm({title:e.target.value})}/></Field><label className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={!canLead||locked} checked={form.restricted} onChange={e=>changedForm({restricted:e.target.checked})}/>Restricted matter</label>
      {canEdit?<button className={buttonClass} disabled={save.busy||!form.title.trim()} onClick={()=>command('workspace_overview',{title:form.title,...(canLead?{restricted:form.restricted,responsible_user_id:form.responsible_user_id,user_ids:form.user_ids}:{})})}>{save.busy?'Saving…':save.retrying?'Retry save':'Save Overview'}</button>:null}

    </section><section className="space-y-5"><Field label="Responsible attorney"><select className={inputClass} disabled={!canLead||!mutable||locked} value={form.responsible_user_id} onChange={e=>changedForm({responsible_user_id:e.target.value,user_ids:[...new Set([...form.user_ids,e.target.value])]})}>{members.filter(p=>p.can_edit||p.user_id===m.responsible_user_id).map(p=><option key={p.user_id} value={p.user_id}>{p.name}</option>)}{!members.some(p=>p.user_id===m.responsible_user_id)?<option value={m.responsible_user_id}>Unavailable member</option>:null}</select></Field>
      <fieldset className="space-y-3" disabled={!canLead||!mutable||locked}><legend className="mb-3 text-sm font-medium">Team</legend>{members.map(p=><label className="flex items-center gap-3 text-sm" key={p.user_id}><input type="checkbox" checked={form.user_ids.includes(p.user_id)} disabled={p.user_id===form.responsible_user_id} onChange={e=>changedForm({user_ids:e.target.checked?[...form.user_ids,p.user_id]:form.user_ids.filter(id=>id!==p.user_id)})}/>{p.name}</label>)}{form.user_ids.filter(id=>!members.some(p=>p.user_id===id)).map(id=><label key={id} className="flex items-center gap-3 text-sm text-slate-500"><input type="checkbox" checked disabled={id===form.responsible_user_id} onChange={()=>changedForm({user_ids:form.user_ids.filter(user=>user!==id)})}/>Unavailable member</label>)}</fieldset>

    </section></div>:tab==='Work'?<div className="grid gap-8 sm:grid-cols-2">
      <section className="space-y-4"><h2 className="font-medium">Intake</h2><fieldset className="space-y-4" disabled={!canReview||!mutable||locked}>
      <Field label="Conflict review"><select className={inputClass} value={intake.conflict_decision} onChange={e=>changedIntake({conflict_decision:e.target.value})}><option value="pending">Pending</option><option value="clear">Clear</option><option value="declined">Declined</option></select></Field><Field label="Conflict note"><textarea className={inputClass} maxLength={3000} value={intake.conflict_note} onChange={e=>changedIntake({conflict_note:e.target.value})}/></Field>
      <Field label="Engagement"><select className={inputClass} value={intake.engagement_decision} onChange={e=>changedIntake({engagement_decision:e.target.value})}><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></Field><Field label="Engagement note"><textarea className={inputClass} maxLength={3000} value={intake.engagement_note} onChange={e=>changedIntake({engagement_note:e.target.value})}/></Field></fieldset>
      {canReview&&mutable?<button className={buttonClass} disabled={save.busy||!intake.conflict_note.trim()||!intake.engagement_note.trim()} onClick={()=>command('review_intake',intake)}>Save Intake</button>:null}
      </section><section className="space-y-4"><h2 className="font-medium">Matter status</h2><fieldset className="space-y-4" disabled={!canEdit||locked}><Field label="Status"><select className={inputClass} value={status} onChange={e=>{setStatus(e.target.value);remember({status:e.target.value});}}><option value={m.status}>{m.status.replace('_',' ')}</option>{transitions[m.status].map(s=><option key={s} value={s} disabled={s==='open'&&(m.conflict_decision!=='clear'||m.engagement_decision!=='accepted')}>{s.replace('_',' ')}</option>)}</select></Field><Field label="Reason"><textarea className={inputClass} maxLength={3000} value={reason} onChange={e=>{setReason(e.target.value);remember({reason:e.target.value});}}/></Field></fieldset>
      {canEdit?<button className={buttonClass} disabled={save.busy||status===m.status||!reason.trim()} onClick={()=>command('update_matter',{status,reason})}>Update Status</button>:null}</section>
      <div className="sm:col-span-2">{workError?<ErrorMessage error={workError}/>:workData?<LegalMatterWork key={`${matterId}:${workData.work?.revision}`} legal={legal} matter={m} data={workData} members={members} team={snapshot.team} canEdit={canEdit} locked={locked} save={workSave} onSaved={workSaved}/>:<p role="status">Loading tasks…</p>}</div>
    </div>:tab==='Parties'?<div className="space-y-6"><ul className="divide-y divide-slate-100">{snapshot.parties.filter(p=>!p.removed_at).map(p=><li key={p.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{p.identity.name}</p><span className="text-xs capitalize text-slate-500">{p.role}</span></div>{canEdit&&mutable?<button className="text-sm text-slate-500 underline" disabled={save.busy||p.role==='client'} onClick={()=>{if(window.confirm(`Remove ${p.identity.name}?`))command('remove_party',{party_id:p.id});}}>Remove</button>:null}</li>)}</ul>
      {canEdit&&mutable?<form className="grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();party.newIdentity?command('workspace_party',{role:party.role,client:{kind:'individual',name:party.name}}):command('add_party',{role:party.role,client_id:party.client_id});}}>{legal.context.capabilities.can_create?<label className="flex items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" disabled={locked} checked={party.newIdentity} onChange={e=>{const next={...party,newIdentity:e.target.checked};setParty(next);remember({party:next});}}/>New identity</label>:null}
      {party.newIdentity?<Field label="Party name"><input required maxLength={200} disabled={locked} className={inputClass} value={party.name} onChange={e=>{const next={...party,name:e.target.value};setParty(next);remember({party:next});}}/></Field>:<><Field label="Find party"><input className={inputClass} value={clientSearch} onChange={e=>setClientSearch(e.target.value)}/></Field><Field label="Existing client identity"><select required disabled={locked} className={inputClass} value={party.client_id} onChange={e=>{const next={...party,client_id:e.target.value};setParty(next);remember({party:next});}}><option value="">Select identity</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></>}<Field label="Role"><select disabled={locked} className={inputClass} value={party.role} onChange={e=>{const next={...party,role:e.target.value};setParty(next);remember({party:next});}}>{['client','opponent','beneficiary','trustee','witness','representative','other'].map(r=><option key={r} value={r}>{r}</option>)}</select></Field><button className={`${buttonClass} self-end`} disabled={save.busy||!(party.newIdentity?party.name.trim():party.client_id)}>Add Party</button></form>:null}
    </div>:<ol className="space-y-5">{snapshot.activity.map(e=><li key={e.id} className="border-l-2 border-slate-200 pl-4"><p className="text-sm font-medium capitalize">{e.action.replaceAll('_',' ')}</p><p className="mt-1 text-xs text-slate-500">{new Date(e.created_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})} · {members.find(p=>p.user_id===e.actor_id)?.name||'Firm member'}</p>{e.action==='work_save_task'?<p className="mt-1 break-words text-sm text-slate-600">{e.details.result.task.title} · {e.details.before?.status||'new'} → {e.details.result.task.status}{e.details.result.task.due_on?` · Due ${e.details.result.task.due_on} SAST`:''}{e.details.result.task.note?` · ${e.details.result.task.note}`:''}</p>:e.action==='work_save_dates'?<p className="mt-1 break-words text-sm text-slate-600">{Object.entries(e.details.result.work.dates).map(([k,v])=>`${k.replaceAll('_',' ')}: ${v||'cleared'}`).join(' · ')}</p>:null}{e.details.reason?<p className="mt-2 text-sm text-slate-600">{e.details.reason}</p>:null}</li>)}</ol>}
    </div>
  </div>;
}
