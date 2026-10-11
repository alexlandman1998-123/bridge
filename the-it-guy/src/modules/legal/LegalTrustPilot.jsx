import {useEffect,useState} from 'react';
import {buttonClass,ErrorMessage,Field,inputClass} from './LegalUi';
export default function LegalTrustPilot({legal,matter,work,editable,locked,save,onSaved,onStart}) {
 const key=`trust-pilot:${legal.firmId}`,draft=legal.recall(key);
 const [loaded,setLoaded]=useState(null),[reload,setReload]=useState(0),[reviewing,setReviewing]=useState(Boolean(draft)),[note,setNote]=useState(draft?.note||''),[approval,setApproval]=useState(draft?.approval||null);
 const {service,firmId,accessVersion}=legal;
 const requestKey=`${firmId}:${accessVersion}:${reload}`,current=loaded?.key===requestKey?loaded:null,pilot=current?.pilot,error=current?.error;
 const pending=legal.recall('pending-save'),retryStart=pending?.action==='work:start_trusts',retryConfigure=pending?.action==='work:configure_trusts';
 useEffect(()=>{let active=true;service.trustPilot(firmId).then(pilot=>{if(active)setLoaded({key:requestKey,pilot});}).catch(error=>{if(active)setLoaded({key:requestKey,error});});return()=>{active=false;};},[service,firmId,requestKey]);
 function configure(){
  const workDraft=legal.recall(`work:${matter.id}`);
  save.save('work:configure_trusts',{...(approval||{enabled:!pilot.settings?.enabled,template_version:pilot.template_version,expected_revision:pilot.settings?.revision||0}),review_note:note},()=>{
   if(workDraft)legal.remember(`work:${matter.id}`,workDraft);
   setReviewing(false);setApproval(null);setNote('');setReload(n=>n+1);onSaved();
  });
 }
 return <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="Trusts setup pilot">
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-medium">Trusts setup</h3>{work.template_version?<span className="text-xs text-slate-500">{work.template_version==='trust_setup_manual_v1'?'Setup checklist · v1':'Saved checklist'}</span>:pilot?.settings?.enabled&&editable?<button className="text-sm underline" disabled={save.busy||(locked&&!retryStart)} onClick={()=>onStart(pilot.template_version)}>{retryStart?'Retry save':'Start Trusts checklist'}</button>:<span className="text-xs text-slate-500">{pilot?'Awaiting firm approval':'Loading pilot…'}</span>}</div>
  <p className="text-xs text-slate-500">Manual instructions, deed review and handover. The firm records approvals and verifies the outcome.</p>
  <ErrorMessage error={error}/>{error?<button className="text-sm underline" onClick={()=>setReload(n=>n+1)}>Reload pilot</button>:null}
  {pilot?.can_configure?<><button className="text-sm underline" disabled={locked} onClick={()=>{if(!reviewing){const next={enabled:!pilot.settings?.enabled,expected_revision:pilot.settings?.revision||0,template_version:pilot.template_version};setApproval(next);legal.remember(key,{note,approval:next});}setReviewing(v=>!v);}}>{reviewing?'Hide review':pilot.settings?.enabled?'Pause checklist starts':'Review pilot checklist'}</button>
   {reviewing?<form className="space-y-3" onSubmit={e=>{e.preventDefault();configure();}}><ol className="list-inside list-decimal space-y-1 text-sm">{pilot.tasks.map(t=><li key={t}>{t}</li>)}</ol><Field label={approval?.enabled===false?'Pause reason':'Firm approval note'}><textarea className={inputClass} required maxLength={3000} disabled={locked} value={note} onChange={e=>{setNote(e.target.value);legal.remember(key,{note:e.target.value,approval});}}/></Field><button className={buttonClass} disabled={save.busy||(locked&&!retryConfigure)||!note.trim()}>{save.retrying?'Retry save':approval?.enabled===false?'Pause new starts':'Approve checklist'}</button></form>:null}
  </>:null}
 </section>;
}
