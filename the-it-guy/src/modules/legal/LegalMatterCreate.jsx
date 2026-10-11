import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLegalWorkspace } from './LegalWorkspaceContext';
import { DISCIPLINE_LABELS } from './legalWorkspaceModel';
import { buttonClass, ErrorMessage, Field, inputClass, useLegalSave } from './LegalUi';
export default function LegalMatterCreate() {
  const legal=useLegalWorkspace(), navigate=useNavigate(),[params]=useSearchParams();
  const initialDiscipline=legal.disciplines.includes(params.get('discipline'))?params.get('discipline'):legal.activeDiscipline;
  const [form,setForm]=useState(()=>legal.recall('create')||{title:'',discipline:initialDiscipline,client_id:'',newClient:true,name:'',kind:'individual',email:'',phone:'',responsible_user_id:legal.userId,user_ids:[legal.userId],restricted:false,conflict_decision:'pending',engagement_decision:'pending',conflict_note:'',engagement_note:''});
  const [step,setStep]=useState(0),[clients,setClients]=useState([]),[members,setMembers]=useState([]),[loadError,setLoadError]=useState(null),[search,setSearch]=useState('');
  const save=useLegalSave(legal); const manager=legal.context.capabilities.can_manage&&legal.context.grants?.length;
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(()=>legal.service.clients(legal.firmId,{search,page_size:100}).then(r=>{if(active)setClients(r.rows);}).catch(e=>{if(active)setLoadError(e);}),200);
    return()=>{active=false;clearTimeout(timer);};
  },[legal.service,legal.firmId,search]);
  useEffect(()=>{
    let active=true;legal.service.directory(legal.firmId,form.discipline).then(r=>{if(active){setMembers(r);setLoadError(null);}}).catch(e=>{if(active){setMembers([]);setLoadError(e);}});return()=>{active=false;};
  },[legal.service,legal.firmId,form.discipline]);
  function patch(change){setForm(previous=>{const next={...previous,...change};legal.remember('create',next);return next;});}
  if(!legal.context.capabilities.can_create)return <p role="alert">You do not have permission to create matters.</p>;
  const valid=step===0?form.title.trim()&&(form.newClient?form.name.trim():form.client_id):step===1?
    ((!legal.context.capabilities.can_review||(form.conflict_decision==='pending'&&form.engagement_decision==='pending'))||form.conflict_note.trim()&&form.engagement_note.trim()):true;
  function submit(e){e.preventDefault();if(step<2){setStep(step+1);return;}
    const payload={title:form.title.trim(),discipline:form.discipline,responsible_user_id:form.responsible_user_id,user_ids:form.user_ids,restricted:form.restricted,
      ...(form.newClient?{client:{kind:form.kind,name:form.name.trim(),email:form.email,phone:form.phone}}:{client_id:form.client_id})};
    if(legal.context.capabilities.can_review&&(form.conflict_decision!=='pending'||form.engagement_decision!=='pending'))payload.intake={conflict_decision:form.conflict_decision,engagement_decision:form.engagement_decision,conflict_note:form.conflict_note,engagement_note:form.engagement_note};
    save.save('workspace_create',payload,r=>navigate(`/legal/matters/${r.matter.id}`,{replace:true}));
  }
  return <div className="mx-auto max-w-2xl space-y-5"><header className="flex items-center justify-between"><h1 className="text-2xl font-semibold tracking-tight">New Matter</h1><Link className="text-sm text-slate-500" to={`/legal/matters?discipline=${form.discipline}`}>Cancel</Link></header>
    <ol className="flex gap-6 text-sm" aria-label="Creation steps">{['Details','Intake','Team'].map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={step===i?'font-semibold text-slate-900':'text-slate-400'}>{i+1}. {label}</li>)}</ol>
    <ErrorMessage error={loadError||save.error}/>
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><fieldset disabled={save.busy||save.locked} className="grid gap-5">
      {step===0?<><Field label="Matter title"><input autoFocus required maxLength={200} className={inputClass} value={form.title} onChange={e=>patch({title:e.target.value})}/></Field>
        <Field label="Practice area"><select className={inputClass} value={form.discipline} onChange={e=>patch({discipline:e.target.value,responsible_user_id:legal.userId,user_ids:[legal.userId]})}>{legal.disciplines.map(d=><option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}</select></Field>
        <div className="flex gap-5 text-sm"><label><input type="radio" checked={form.newClient} onChange={()=>patch({newClient:true})}/> New client</label><label><input type="radio" checked={!form.newClient} onChange={()=>patch({newClient:false})}/> Existing client</label></div>
        {form.newClient?<><Field label="Client name"><input required maxLength={200} className={inputClass} value={form.name} onChange={e=>patch({name:e.target.value})}/></Field>
          <Field label="Client type"><select className={inputClass} value={form.kind} onChange={e=>patch({kind:e.target.value})}><option value="individual">Individual</option><option value="organisation">Organisation</option></select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Email"><input type="email" maxLength={254} className={inputClass} value={form.email} onChange={e=>patch({email:e.target.value})}/></Field><Field label="Phone"><input maxLength={50} className={inputClass} value={form.phone} onChange={e=>patch({phone:e.target.value})}/></Field></div></>:
          <><Field label="Find client"><input className={inputClass} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients"/></Field><Field label="Client"><select required className={inputClass} value={form.client_id} onChange={e=>patch({client_id:e.target.value})}><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></>}
      </>:step===1?<>{legal.context.capabilities.can_review?<><Field label="Conflict review"><select className={inputClass} value={form.conflict_decision} onChange={e=>patch({conflict_decision:e.target.value})}><option value="pending">Pending</option><option value="clear">Clear</option><option value="declined">Declined</option></select></Field><Field label="Conflict review note"><textarea maxLength={3000} className={inputClass} value={form.conflict_note} onChange={e=>patch({conflict_note:e.target.value})}/></Field>
        <Field label="Engagement"><select className={inputClass} value={form.engagement_decision} onChange={e=>patch({engagement_decision:e.target.value})}><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></Field><Field label="Engagement note"><textarea maxLength={3000} className={inputClass} value={form.engagement_note} onChange={e=>patch({engagement_note:e.target.value})}/></Field></>:<p className="text-sm text-slate-500">An authorised reviewer can complete intake after creation.</p>}<p className="text-sm text-slate-500">The matter will be saved as a draft.</p></>:
        <><Field label="Responsible attorney"><select className={inputClass} value={form.responsible_user_id} disabled={!manager} onChange={e=>patch({responsible_user_id:e.target.value,user_ids:[...new Set([...form.user_ids,e.target.value])]})}>{members.filter(m=>m.can_edit).map(m=><option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></Field>
        <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">Matter team</legend>{members.map(m=><label key={m.user_id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.user_ids.includes(m.user_id)} disabled={m.user_id===form.responsible_user_id} onChange={e=>patch({user_ids:e.target.checked?[...form.user_ids,m.user_id]:form.user_ids.filter(u=>u!==m.user_id)})}/>{m.name}</label>)}</fieldset>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.restricted} onChange={e=>patch({restricted:e.target.checked})}/>Restricted matter</label></>}
    </fieldset><footer className="flex items-center justify-between border-t border-slate-100 pt-5"><button type="button" className="text-sm disabled:opacity-30" disabled={step===0||save.busy||save.locked} onClick={()=>setStep(step-1)}>Back</button><button className={buttonClass} disabled={!valid||save.busy||Boolean(loadError)||!members.length}>{save.busy?'Saving…':save.retrying?'Retry save':step<2?'Continue':'Create Matter'}</button></footer></form>
  </div>;
}
