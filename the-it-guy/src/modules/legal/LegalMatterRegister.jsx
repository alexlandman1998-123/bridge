import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLegalWorkspace } from './LegalWorkspaceContext';
import { DISCIPLINE_LABELS } from './legalWorkspaceModel';
import { buttonClass, ErrorMessage, inputClass } from './LegalUi';
export default function LegalMatterRegister() {
  const legal=useLegalWorkspace(),[params,setParams]=useSearchParams();
  const [result,setResult]=useState(null),[error,setError]=useState(null),[reload,setReload]=useState(0);
  const manager=legal.context.capabilities.can_manage&&legal.context.grants?.length>0;
  const discipline=legal.disciplines.includes(params.get('discipline'))?params.get('discipline'):legal.activeDiscipline;
  const search=params.get('search')||'',status=params.get('status')||'',page=Math.max(1,Number(params.get('page'))||1);
  const scope=manager&&params.get('scope')!=='mine'?'all':'mine';
  const {revoke}=legal;
  const scrollKey=`${legal.userId}:${legal.firmId}:${params.toString()}`;

  useEffect(()=>{
    let active=true;
    legal.service.register(legal.firmId,{discipline,search,status,page,page_size:20,scope}).then(data=>{if(active){setResult(data);setError(null);}}).catch(e=>{if(active){setResult(null);setError(e);if(e.code==='42501')revoke();}});
    return()=>{active=false;};
  },[legal.service,legal.firmId,discipline,search,status,page,scope,reload,revoke]); // permission is rechecked in the RPC
  useEffect(()=>{try{window.scrollTo(0,Number(sessionStorage.getItem(`arch9:legal-scroll:${scrollKey}`))||0);}catch{/* optional */}return()=>{try{sessionStorage.setItem(`arch9:legal-scroll:${scrollKey}`,String(window.scrollY));}catch{/* optional */}};},[scrollKey]);
  function filter(key,value){const next=new URLSearchParams(params);value?next.set(key,value):next.delete(key);if(key!=='page')next.delete('page');setResult(null);setParams(next);}
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-tight">{manager?'All Matters':'My Matters'}</h1>
      {legal.context.capabilities.can_create?<Link className={buttonClass} to={`/legal/new?discipline=${discipline}`}>New Matter</Link>:null}</header>
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
      <input className={inputClass} aria-label="Search matters" placeholder="Search matters" value={search} onChange={e=>filter('search',e.target.value)}/>
      <select className={inputClass} aria-label="Matter status" value={status} onChange={e=>filter('status',e.target.value)}><option value="">All statuses</option>{['draft','open','on_hold','closed','archived'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}</select>
      {manager?<select className={inputClass} aria-label="Matter scope" value={scope} onChange={e=>filter('scope',e.target.value)}><option value="all">All Matters</option><option value="mine">My Matters</option></select>:<span className="self-center text-sm text-slate-500">{DISCIPLINE_LABELS[discipline]}</span>}
    </div>
    <ErrorMessage error={error}/>
    {error?<button className={buttonClass} onClick={()=>setReload(n=>n+1)}>Reload</button>:null}
    {!result&&!error?<p role="status" className="py-12 text-center text-sm text-slate-500">Loading matters…</p>:null}
    {result?<><div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {result.rows.length?result.rows.map(m=><Link key={m.id} to={`/legal/matters/${m.id}?return=${encodeURIComponent('/legal/matters?'+params.toString())}`} className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 last:border-0 hover:bg-slate-50">
        <div className="min-w-0"><span className="text-xs text-slate-500">{m.reference}</span><p className="truncate font-medium text-slate-900">{m.title}</p></div>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs capitalize text-slate-600">{m.status.replace('_',' ')}{m.restricted?' · Restricted':''}</span>
      </Link>):<p className="px-5 py-16 text-center text-sm text-slate-500">No matters found.</p>}
    </div><div className="flex items-center justify-between text-sm text-slate-500"><span>{result.total} matters</span><div className="flex items-center gap-4"><button disabled={page<=1} onClick={()=>filter('page',String(page-1))} className="disabled:opacity-30">Previous</button><span>{page}</span><button disabled={page*20>=result.total} onClick={()=>filter('page',String(page+1))} className="disabled:opacity-30">Next</button></div></div></>:null}
  </div>;
}
