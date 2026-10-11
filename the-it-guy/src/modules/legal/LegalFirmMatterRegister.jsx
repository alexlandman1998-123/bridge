import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLegalWorkspace } from './LegalWorkspaceContext';
import { DISCIPLINE_LABELS } from './legalWorkspaceModel';
import { useLegalFirmRead } from './useLegalFirmRead';
import { buttonClass, inputClass } from './LegalUi';
function SourceRegister({label,result,page,onPage,returnTo}) {
  const data=result?.data;
  return <section aria-label={`${label} register`} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{label}</h2>{data?<span className="text-sm text-slate-500">{data.total} matters{data.scope==='assigned'?' · Assigned access':''}</span>:null}</div>
    {result?.error?<p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm">{label} unavailable. Reload or open its workspace.</p>:!data?<p role="status" className="p-5 text-sm text-slate-500">Loading {label.toLowerCase()}…</p>:<>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{data.rows.length?data.rows.map(m=><Link key={m.key} to={m.source==='legal'?`${m.href}?return=${encodeURIComponent(returnTo)}`:m.href} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 last:border-0 hover:bg-slate-50"><div className="min-w-0"><span className="text-xs text-slate-500">{m.reference}</span><p className="truncate font-medium">{m.title}</p></div><span className="text-xs capitalize text-slate-500">{m.status}</span></Link>):<p className="p-8 text-center text-sm text-slate-500">No matters found.</p>}</div>
      <div className="flex items-center justify-end gap-4 text-sm"><button aria-label={`Previous ${label} page`} disabled={page<=1} className="disabled:opacity-30" onClick={()=>onPage(page-1)}>Previous</button><span>Page {page}</span><button aria-label={`Next ${label} page`} disabled={page*20>=data.total} className="disabled:opacity-30" onClick={()=>onPage(page+1)}>Next</button></div>
    </>}
  </section>;
}
export default function LegalFirmMatterRegister() {
  const legal=useLegalWorkspace(),[params,setParams]=useSearchParams(),[reload,setReload]=useState(0);
  const requested=params.get('discipline')||'',practice=requested==='conveyancing'||legal.disciplines.includes(requested)?requested:'';
  const search=params.get('search')||'',legalPage=Math.max(1,Number(params.get('page'))||1),conveyancingPage=Math.max(1,Number(params.get('conveyancing_page'))||1);
  const {legalResult,conveyancing}=useLegalFirmRead(legal,{practice,search,legalPage,conveyancingPage,reload});
  function filter(key,value){const next=new URLSearchParams(params);value?next.set(key,String(value)):next.delete(key);if(key==='search'||key==='discipline'){next.delete('page');next.delete('conveyancing_page');}setParams(next);}
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-tight">All Matters</h1>{legal.context.capabilities.can_create?<Link className={buttonClass} to={`/legal/new?discipline=${legal.disciplines.includes(practice)?practice:legal.activeDiscipline}`}>New Matter</Link>:null}</header>
    <div className="grid gap-3 sm:grid-cols-[1fr_240px]"><input className={inputClass} aria-label="Search matters" placeholder="Search matters" value={search} onChange={e=>filter('search',e.target.value)}/><select className={inputClass} aria-label="Practice" value={practice} onChange={e=>filter('discipline',e.target.value)}><option value="">All practices</option><option value="conveyancing">Conveyancing</option>{legal.disciplines.map(d=><option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}</select></div>
    {practice!=='conveyancing'?<SourceRegister label="Legal" result={legalResult} page={legalPage} onPage={p=>filter('page',p)} returnTo={'/legal/matters?'+params.toString()}/>:null}
    {!practice||practice==='conveyancing'?<SourceRegister label="Conveyancing" result={conveyancing} page={conveyancingPage} onPage={p=>filter('conveyancing_page',p)}/>:null}
    {legalResult?.error||conveyancing?.error?<div className="flex gap-4"><button className={buttonClass} onClick={()=>setReload(n=>n+1)}>Reload</button><Link className="self-center text-sm underline" to="/attorney/matters">Open Conveyancing</Link></div>:null}
  </div>;
}
