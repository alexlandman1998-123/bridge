/* eslint-disable react-refresh/only-export-components -- module-local UI helpers */
import { useRef, useState } from 'react';
import { legalError } from './legalWorkspaceModel';
export const inputClass='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100';
export const buttonClass='rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40';
export function Field({label,children}) {return <label className="grid gap-1.5 text-sm font-medium text-slate-700">{label}{children}</label>;}
export function ErrorMessage({error}) {return error?<p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{legalError(error)}</p>:null;}
/** Freeze payload and request identity after an uncertain save; editing is locked until recovery. */
export function useLegalSave(legal) {
  const [pending,setPending]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  const completion=useRef(null);
  async function save(action,payload,onSaved) {
    if(busy)return;
    // Recovery belongs to the original form as well as its frozen command.
    if(!pending)completion.current=onSaved;
    const attempt=pending||{requestId:crypto.randomUUID(),action,payload:structuredClone(payload)};
    legal.remember('pending-save',attempt);
    setPending(attempt);setBusy(true);setError(null);
    try {
      const result=attempt.action.startsWith('work:')?await legal.service.workCommand({firmId:legal.firmId,...attempt,action:attempt.action.slice(5)}):attempt.action==='workspace_party'?await legal.service.party({firmId:legal.firmId,...attempt}):attempt.action==='workspace_overview'?await legal.service.overview({firmId:legal.firmId,...attempt}):attempt.action==='workspace_create'?await legal.service.create({firmId:legal.firmId,...attempt}):await legal.service.command({firmId:legal.firmId,...attempt});
      setPending(null);legal.clearDrafts();(completion.current||onSaved)(result);completion.current=null;
    } catch(e) {
      setError(e);
      // A returned Postgres error confirms the entire command rolled back; a network failure is uncertain.
      if(/^[0-9A-Z]{5}$/.test(e.code||'')){setPending(null);completion.current=null;legal.forget?.('pending-save');}
      if(e.code==='42501')legal.revoke();
    } finally {setBusy(false);}
  }
  return {save,busy,error,locked:Boolean(pending),retrying:Boolean(pending)};
}
