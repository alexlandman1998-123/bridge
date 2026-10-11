import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useOrganisation } from '../../context/OrganisationContext';
import { supabase } from '../../lib/supabaseClient';
import { createLegalMatterService } from './legalMatterService';
import { LegalWorkspaceContext } from './LegalWorkspaceContext';
import { firmCandidate, legalPilotAllowed, permittedDisciplines, preferenceKey } from './legalWorkspaceModel';

export default function LegalWorkspaceProvider({children}) {
  const {role,profile}=useWorkspace(); const {organisation,branding}=useOrganisation();
  const location=useLocation(), navigate=useNavigate();
  const userId=profile?.id, organisationId=organisation?.id;
  const enabled=legalPilotAllowed(import.meta.env,role,organisationId);
  const scope=`${userId || ''}:${organisationId || ''}:${enabled}`;
  const [loaded,setLoaded]=useState(null), [refresh,setRefresh]=useState(0);
  const [selection,setSelection]=useState('');
  const lastRoutes=useRef(new Map()), currentRoute=useRef(location.pathname+location.search);
  currentRoute.current=location.pathname+location.search;
  const forms=useRef(new Map()), dirty=useRef(null), previous=useRef(location.pathname+location.search);
  const service=useMemo(()=>supabase?createLegalMatterService(supabase):null,[]);
  useEffect(()=>{
    if(!enabled||!userId||!service) return;
    let active=true;
    async function load() {
      try {
        const allowed=String(import.meta.env.VITE_ARCH9_LEGAL_FIRM_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
        if(!allowed.length) {if(active)setLoaded({scope,context:null});return;}
        const {data,error}=await supabase.from('attorney_firms').select('id,organisation_id').eq('organisation_id',organisationId).in('id',allowed).eq('is_active',true);
        if(error) throw error;
        const firm=firmCandidate(data||[],organisationId,allowed);
        const context=firm?await service.context(firm.id):null;
        if(active) {
          if(!permittedDisciplines(context).length){forms.current.clear();dirty.current=null;}
          setLoaded({scope,firmId:firm?.id,context});
          try {setSelection(localStorage.getItem(preferenceKey(userId,firm?.id))||'');} catch {setSelection('');}
        }
      } catch(error) {if(active){if(error.code==='42501'){forms.current.clear();dirty.current=null;}setLoaded({scope,context:null,error});}}
    }
    load();
    return()=>{active=false;};
  },[enabled,userId,organisationId,service,scope,refresh]);
  const current=loaded?.scope===scope?loaded:null;
  const disciplines=useMemo(()=>permittedDisciplines(current?.context),[current?.context]);
  const activeDiscipline=disciplines.includes(selection)?selection:disciplines[0]||'';
  const clearDrafts=useCallback(()=>{dirty.current=null;forms.current.clear();},[]);
  useEffect(()=>{clearDrafts();},[scope,clearDrafts]);
  const recall=useCallback(key=>forms.current.get(`${scope}:${key}`),[scope]);
  const remember=useCallback((key,value)=>{forms.current.set(`${scope}:${key}`,value);dirty.current=key;},[scope]);
  const forget=useCallback(key=>{forms.current.delete(`${scope}:${key}`);if(dirty.current===key)dirty.current=forms.current.size?[...forms.current.keys()].at(-1):null;},[scope]);
  const revoke=useCallback(()=>{clearDrafts();setLoaded({scope,context:null});},[scope,clearDrafts]);
  const confirmLeave=useCallback(()=>{
    if(forms.current.has(`${scope}:pending-save`)){window.alert('Retry the pending save before leaving.');return false;}
    if(!dirty.current) return true;
    if(!window.confirm('Discard unsaved changes?')) return false;
    clearDrafts();return true;
  },[clearDrafts,scope]);
  useEffect(()=>{
    const before=e=>{if(dirty.current){e.preventDefault();e.returnValue='';}};
    const click=e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const link=e.target.closest?.('a[href]');if(link&&link.target!=='_blank'&&link.href!==window.location.href&&dirty.current&&!confirmLeave()){e.preventDefault();e.stopPropagation();}};
    window.addEventListener('beforeunload',before);document.addEventListener('click',click,true);
    return()=>{window.removeEventListener('beforeunload',before);document.removeEventListener('click',click,true);};
  },[confirmLeave]);
  useEffect(()=>{
    const path=location.pathname+location.search;
    if(previous.current.split('?')[0]!==location.pathname&&dirty.current&&!confirmLeave()){navigate(previous.current,{replace:true});return;}
    previous.current=path;
  },[location.pathname,location.search,navigate,confirmLeave]);
  useEffect(()=>{
    if(!location.pathname.startsWith('/legal'))return;
    const recheck=()=>setRefresh(n=>n+1);
    window.addEventListener('focus',recheck);
    return()=>window.removeEventListener('focus',recheck);
  },[location.pathname]);
  useEffect(()=>{
    const requested=new URLSearchParams(location.search).get('discipline');
    if(requested&&disciplines.includes(requested)) {setSelection(requested);try {localStorage.setItem(preferenceKey(userId,current.firmId),requested);} catch { /* optional */ }}
  },[location.search,disciplines,userId,current?.firmId]);
  const selectDiscipline=useCallback(discipline=>{
    if(!disciplines.includes(discipline))return;
    setSelection(discipline);
    lastRoutes.current.set(`${scope}:${current?.firmId}:${discipline}`,currentRoute.current);
    try {localStorage.setItem(preferenceKey(userId,current?.firmId),discipline);} catch { /* optional */ }
  },[disciplines,userId,current?.firmId,scope]);
  useEffect(()=>{
    const key=`${scope}:${current?.firmId}`;
    if(!disciplines.length)return;
    const route=location.pathname+location.search;
    if(location.pathname.startsWith('/attorney/'))lastRoutes.current.set(`${key}:conveyancing`,route);
    else if(location.pathname==='/legal/matters'){
      const requested=new URLSearchParams(location.search).get('discipline');
      lastRoutes.current.set(`${key}:${disciplines.includes(requested)?requested:activeDiscipline}`,route);
    } else if(location.pathname.startsWith('/legal/matters/')&&lastRoutes.current.get(`${key}:${activeDiscipline}`)?.split('?')[0]===location.pathname){
      lastRoutes.current.set(`${key}:${activeDiscipline}`,route);
    }
  },[scope,current?.firmId,disciplines,activeDiscipline,location.pathname,location.search]);
  function choose(discipline) {
    if(!confirmLeave())return;
    if(discipline==='conveyancing') {navigate(lastRoutes.current.get(`${scope}:${current.firmId}:conveyancing`)||'/attorney/dashboard');return;}
    if(!disciplines.includes(discipline))return;
    setSelection(discipline);
    try {localStorage.setItem(preferenceKey(userId,current.firmId),discipline);} catch { /* storage optional */ }
    navigate(lastRoutes.current.get(`${scope}:${current.firmId}:${discipline}`)||`/legal/matters?discipline=${discipline}`);
  }
  const value={service,firmId:current?.firmId,userId,branding,context:current?.context,
    accessVersion:refresh,ready:!enabled||Boolean(current),available:disciplines.length>0,disciplines,activeDiscipline,
    error:current?.error,choose,selectDiscipline,reload:()=>setRefresh(n=>n+1),
    revoke,remember,recall,forget,clearDrafts,confirmLeave};
  return <LegalWorkspaceContext.Provider value={value}>{children}</LegalWorkspaceContext.Provider>;
}
