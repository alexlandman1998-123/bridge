import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLegalWorkspace } from './LegalWorkspaceContext';
import { DISCIPLINE_LABELS } from './legalWorkspaceModel';
import { useLegalFirmRead } from './useLegalFirmRead';
import { buttonClass,inputClass } from './LegalUi';
export default function LegalFirmOverview() {
  const legal=useLegalWorkspace(),[params,setParams]=useSearchParams(),[reload,setReload]=useState(0);
  const requested=params.get('discipline'),practice=legal.disciplines.includes(requested)?requested:'';
  const {legalResult,conveyancing}=useLegalFirmRead(legal,{kind:'overview',practice,reload});
  const data=legalResult?.data;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-tight">Firm Overview</h1><Link className={buttonClass} to="/legal/matters">All Matters</Link></header>
    <select className={`${inputClass} sm:max-w-xs`} aria-label="Legal practice" value={practice} onChange={e=>setParams(e.target.value?{discipline:e.target.value}:{})}><option value="">All Legal practices</option>{legal.disciplines.map(d=><option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}</select>
    {!data&&!legalResult?.error?<p role="status">Loading Legal overview…</p>:null}
    {legalResult?.error?<p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm">Legal overview unavailable.</p>:null}
    {data?<>
      <section aria-label="Legal summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[['Legal matters',data.total],['Active',data.active],['Intake pending',data.intake],['On hold',data.on_hold],['Overdue',data.overdue]].map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</section>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Legal workload</h2><p className="mb-3 text-xs text-slate-500">Active matters by responsible attorney</p>{data.workload.length?data.workload.map(w=><div key={w.user_id} className="flex justify-between gap-3 py-2 text-sm"><span>{w.name||'Attorney'}</span><span>{w.matters}</span></div>):<p className="text-sm text-slate-500">No active matters.</p>}</section>
        <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-semibold">Legal practices</h2>{data.practices.map(p=><Link key={p.discipline} className="flex justify-between gap-3 py-2 text-sm hover:underline" to={`/legal/matters?discipline=${p.discipline}`}><span>{DISCIPLINE_LABELS[p.discipline]}</span><span>{p.active} active · {p.total} total</span></Link>)}</section>
        <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-semibold">Upcoming · 14 days</h2>{data.upcoming.length?data.upcoming.map((d,i)=><Link key={`${d.id}:${d.label}:${i}`} className="block border-b border-slate-100 py-3 text-sm last:border-0" to={`/legal/matters/${d.id}`}><p className="font-medium">{d.title}</p><p className="text-xs text-slate-500">{d.due_on} · {d.label}</p></Link>):<p className="text-sm text-slate-500">No upcoming Legal dates.</p>}</section>
        <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-semibold">Needs attention</h2>{data.interventions.length?data.interventions.map(m=><Link key={m.id} className="block border-b border-slate-100 py-3 text-sm last:border-0" to={`/legal/matters/${m.id}`}><p className="font-medium">{m.title}</p><p className="text-xs text-slate-500">{m.due_on?'Overdue · '+m.due_on:m.status==='on_hold'?'On hold':'Intake pending'}</p></Link>):<p className="text-sm text-slate-500">No Legal interventions.</p>}</section>
      </div><p className="text-xs text-slate-500">Only matters you can access · Updated {new Date(data.as_of).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})}</p>
    </>:null}
    {!practice?<section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5" aria-label="Conveyancing summary"><div><h2 className="font-semibold">Conveyancing</h2><p className="mt-1 text-sm text-slate-500">{conveyancing?.error?'Summary unavailable':conveyancing?.data?`${conveyancing.data.total} matters · ${conveyancing.data.scope==='firm'?'Firm access':'Assigned access'}`:'Loading conveyancing…'}</p></div><Link className="text-sm underline" to="/attorney/dashboard">Open Conveyancing</Link></section>:null}
    <button className={buttonClass} onClick={()=>setReload(n=>n+1)}>Refresh</button>
  </div>;
}
