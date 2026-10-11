import { useState } from 'react';
import LegalTrustPilot from './LegalTrustPilot';
import { buttonClass, Field, inputClass } from './LegalUi';
const DATE_LABELS={instructions_on:'Instructions',review_on:'Review',execution_on:'Execution recorded',custody_on:'Custody recorded'};
const emptyTask=owner=>({title:'',owner_id:owner,due_on:'',status:'pending',note:''});
/** Manual tasks and SAST calendar dates; never imply valid execution or send reminders. */
export default function LegalMatterWork({legal,matter,data,members,team,canEdit,locked,save,onSaved}) {
  const key=`work:${matter.id}`,draft=legal.recall(key);
  const [form,setForm]=useState(draft?.form||emptyTask(matter.responsible_user_id));
  const [dates,setDates]=useState(draft?.dates||data.work?.dates||{});
  const [revision]=useState(draft?.revision??data.work?.revision??0);
  const trusts=matter.discipline==='trusts'&&import.meta.env.VITE_ARCH9_LEGAL_TRUSTS_PILOT_ENABLED==='true';
  const trustDates=matter.discipline==='trusts'&&(trusts||data.work?.template_version?.startsWith('trust_setup_')||Object.hasOwn(dates,'setup_on')||Object.hasOwn(dates,'handover_on'));
  const dateLabels=trustDates?{instructions_on:'Instructions',review_on:'Deed review',setup_on:'Setup outcome recorded',handover_on:'Handover recorded',...(dates.execution_on?{execution_on:'Execution (existing record)'}:{}),...(dates.custody_on?{custody_on:'Custody (existing record)'}:{})}:DATE_LABELS;
  const editable=canEdit&&!['closed','archived'].includes(matter.status);
  const owners=members.filter(p=>p.can_edit&&team.some(t=>t.user_id===p.user_id&&!t.removed_at));
  function remember(patch){legal.remember(key,{form,dates,revision,...patch});}
  function changeTask(patch){const next={...form,...patch};setForm(next);remember({form:next});}
  function submit(action,payload){
    const keep=action!=='save_task'&&(form.title||form.task_id)?form:null;
    const keepDates=['save_task','start_wills','start_trusts'].includes(action)&&JSON.stringify(dates)!==JSON.stringify(data.work?.dates||{})?dates:null;
    save.save('work:'+action,{matter_id:matter.id,expected_revision:revision,...payload},result=>{
      onSaved();
      if(keep||keepDates)legal.remember(key,{...(keep?{form:keep}:{}),...(keepDates?{dates:keepDates}:{}),revision:result.work.revision});
    });
  }
  if(!data.tasks_enabled)return <p className="text-sm text-slate-500">Tasks are paused for this firm.</p>;
  return <div className="space-y-8 border-t border-slate-100 pt-6">
    {trusts?<LegalTrustPilot legal={legal} matter={matter} work={data.work} editable={editable} locked={locked} save={save} onSaved={onSaved} onStart={version=>submit('start_trusts',{template_version:version})}/>:null}
    <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">Tasks</h2>{editable&&matter.discipline==='wills_estates'&&!data.work.template_version?<button className="text-sm font-medium underline" disabled={locked} onClick={()=>submit('start_wills',{})}>Start wills checklist</button>:null}</div>
    {matter.discipline==='wills_estates'?<p className="text-xs text-slate-500">Manual instructions, review, execution evidence and custody. Completion records work done; the firm verifies execution.</p>:null}
    <ul className="divide-y divide-slate-100">{data.tasks.map(t=><li key={t.id} className="flex items-start justify-between gap-4 py-3"><div className="min-w-0"><p className={`break-words text-sm font-medium ${t.status==='complete'?'text-slate-500 line-through':''}`}>{t.title}</p><p className="mt-1 text-xs text-slate-500">{members.find(p=>p.user_id===t.owner_id)?.name||'Unavailable member'}{t.due_on?` · ${new Intl.DateTimeFormat('en-ZA',{dateStyle:'medium',timeZone:'Africa/Johannesburg'}).format(new Date(t.due_on+'T00:00:00+02:00'))}`:''} · {t.status}</p>{t.note?<p className="mt-1 break-words text-xs text-slate-600">{t.note}</p>:null}</div>{editable?<button disabled={locked} className="shrink-0 text-sm underline" onClick={()=>{setForm({...t,due_on:t.due_on||'',task_id:t.id});remember({form:{title:t.title,owner_id:t.owner_id,due_on:t.due_on||'',status:t.status,note:t.note,task_id:t.id}});}}>Edit</button>:null}</li>)}</ul>
    {!data.tasks.length?<p className="text-sm text-slate-500">No tasks yet.</p>:null}
    {editable?<form onSubmit={e=>{e.preventDefault();const {task_id,title,owner_id,due_on,status,note}=form;submit('save_task',{...(task_id?{task_id}:{}),title,owner_id,due_on:due_on||null,status,note});}}><fieldset className="grid gap-4 sm:grid-cols-2" disabled={locked}>
    <Field label="Task"><input required maxLength={200} className={inputClass} value={form.title} onChange={e=>changeTask({title:e.target.value})}/></Field>
    <Field label="Owner"><select required className={inputClass} value={form.owner_id} onChange={e=>changeTask({owner_id:e.target.value})}><option value="">Select owner</option>{owners.map(p=><option key={p.user_id} value={p.user_id}>{p.name}</option>)}{form.owner_id&&!owners.some(p=>p.user_id===form.owner_id)?<option value={form.owner_id} disabled>Unavailable member</option>:null}</select></Field>
    <Field label="Due date (SAST)"><input type="date" className={inputClass} value={form.due_on} onChange={e=>changeTask({due_on:e.target.value})}/></Field>
    <Field label="Task status"><select className={inputClass} value={form.status} onChange={e=>changeTask({status:e.target.value})}><option value="pending">Pending</option><option value="complete">Complete</option></select></Field>
    <Field label="Completion / reopen note"><textarea maxLength={3000} className={inputClass} value={form.note} onChange={e=>changeTask({note:e.target.value})}/></Field>
    </fieldset><div className="mt-4 flex gap-4"><button className={buttonClass} disabled={save.busy||!form.title.trim()||!owners.some(p=>p.user_id===form.owner_id)}>{save.retrying?'Retry save':form.task_id?'Save Task':'Add Task'}</button>{form.task_id?<button type="button" disabled={locked} className="text-sm underline" onClick={()=>{const next=emptyTask(matter.responsible_user_id);setForm(next);remember({form:next});}}>New task</button>:null}</div></form>:null}</section>
    <section><h2 className="mb-4 font-medium">Matter dates <span className="text-xs font-normal text-slate-500">SAST</span></h2><form onSubmit={e=>{e.preventDefault();submit(trustDates?'save_trust_dates':'save_dates',{dates});}}><fieldset className="grid gap-4 sm:grid-cols-2" disabled={!editable||locked}>{Object.entries(dateLabels).map(([name,label])=><Field key={name} label={label}><input type="date" className={inputClass} value={dates[name]||''} onChange={e=>{const next={...dates,[name]:e.target.value||null};setDates(next);remember({dates:next});}}/></Field>)}</fieldset>{editable?<button className={`${buttonClass} mt-4`} disabled={save.busy}>Save Dates</button>:null}</form></section>
  </div>;
}
