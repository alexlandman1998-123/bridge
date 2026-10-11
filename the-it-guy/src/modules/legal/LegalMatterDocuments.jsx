import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { buttonClass, ErrorMessage, Field, inputClass } from './LegalUi';
import { legalFileMetadata } from './legalDocumentService';
const LegalPdfPreview=lazy(()=>import('./LegalPdfPreview'));
export default function LegalMatterDocuments({legal,matter,data,canEdit,onSaved}) {
  const draftKey=`documents:${matter.id}`,remembered=legal.recall(draftKey);
  const [title,setTitle]=useState(remembered?.title||''),[file,setFile]=useState(remembered?.file||null),[replace,setReplace]=useState(remembered?.replace||null);
  const [attempt,setAttempt]=useState(remembered?.attempt||null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[preview,setPreview]=useState(null);
  const previewRef=useRef(null),active=useRef(true),processing=useRef(false);
  const editable=canEdit&&!['closed','archived'].includes(matter.status);
  useEffect(()=>{active.current=true;return()=>{active.current=false;if(previewRef.current)URL.revokeObjectURL(previewRef.current);};},[]);
  function closePreview(){if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current=null;setPreview(null);}
  function remember(patch){legal.remember(draftKey,{title,file,replace,attempt,...patch});}
  async function upload(resume=null,cancel=false) {
    if(processing.current)return;processing.current=true;setBusy(true);setError(null);
    let current=attempt;
    // Guard even hashing/reservation: another workspace must not be selected mid-flight.
    legal.remember('pending-save',{action:'document-upload'});
    try {
      if(!current){
        if(resume)current={version:resume,file:null,cancelId:crypto.randomUUID()};
        else current={requestId:crypto.randomUUID(),cancelId:crypto.randomUUID(),file,payload:{matter_id:matter.id,...(replace?{document_id:replace.id}:{}),expected_version:replace?.current_version||0,title:title.trim()||file.name,...await legalFileMetadata(file)}};
        setAttempt(current);remember({attempt:current});
      }
      if(!current.version){const result=await legal.service.reserveDocument({firmId:legal.firmId,requestId:current.requestId,payload:current.payload});current={...current,version:result.version};setAttempt(current);remember({attempt:current});}
      if(cancel)await legal.service.cancelDocument({firmId:legal.firmId,requestId:current.cancelId,matterId:matter.id,version:current.version});
      else await legal.service.finishDocument({firmId:legal.firmId,matterId:matter.id,version:current.version,file:current.file});
      legal.forget(draftKey);legal.forget('pending-save');setAttempt(null);setFile(null);setTitle('');setReplace(null);onSaved();
    } catch(e){
      if(active.current)setError(e);
      if(e.code==='42501'){closePreview();legal.revoke();}
      // Reservation rollback is certain; keep the selected file editable. All later failures retain the exact version.
      else if(!current?.version&&/^[0-9A-Z]{5}$/.test(e.code||'')){setAttempt(null);remember({attempt:null});legal.forget('pending-save');}
      else if(!current){legal.forget('pending-save');}
    } finally {processing.current=false;if(active.current)setBusy(false);}
  }
  async function view(version,download=false){
    if(processing.current)return;setError(null);setBusy(true);processing.current=true;
    try {
      const {blob}=await legal.service.downloadVersion(legal.firmId,matter.id,version.id);
      if(!active.current)return;
      closePreview();const url=URL.createObjectURL(new Blob([blob],{type:version.mime_type}));previewRef.current=url;
      if(download){const a=document.createElement('a');a.href=url;a.download=version.filename;a.click();closePreview();}
      else setPreview({url,version,blob});
    }catch(e){setError(e);if(e.code==='42501'){closePreview();legal.revoke();}}finally{processing.current=false;if(active.current)setBusy(false);}
  }
  if(!data.documents_enabled)return <p className="text-sm text-slate-500">Documents are paused for this firm.</p>;
  return <div className="space-y-6"><ErrorMessage error={error}/>
    {preview?<section className="space-y-3"><div className="flex items-center justify-between gap-3"><p className="min-w-0 break-words text-sm font-medium">{preview.version.filename}</p><button className="text-sm underline" onClick={closePreview}>Close preview</button></div>{preview.version.mime_type==='application/pdf'?<Suspense fallback={<p role="status">Loading preview…</p>}><LegalPdfPreview key={preview.version.id} blob={preview.blob}/></Suspense>:<img alt={preview.version.filename} src={preview.url} className="max-h-[65vh] max-w-full rounded-lg object-contain"/>}</section>:null}
    <ul className="space-y-5">{data.documents.map(d=><li key={d.id}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="min-w-0 break-words text-sm font-medium">{d.title}</h2>{editable?<button disabled={busy||Boolean(attempt)} className="text-sm underline" onClick={()=>{setReplace(d);setTitle(d.title);setFile(null);remember({replace:d,title:d.title,file:null});}}>Replace</button>:null}</div><ol className="mt-2 divide-y divide-slate-100">{d.versions.map(v=><li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><p className="min-w-0 break-words text-xs text-slate-500">v{v.version_no} · {v.filename} · {new Intl.DateTimeFormat('en-ZA',{dateStyle:'medium',timeZone:'Africa/Johannesburg'}).format(new Date(v.committed_at))}</p><div className="flex gap-4">{['application/pdf','image/png','image/jpeg'].includes(v.mime_type)?<button className="text-sm underline" disabled={busy} onClick={()=>view(v)}>Preview</button>:null}<button className="text-sm underline" disabled={busy} onClick={()=>view(v,true)}>Download</button></div></li>)}</ol></li>)}</ul>
    {!data.documents.length?<p className="text-sm text-slate-500">No documents yet.</p>:null}
    {editable?<form className="space-y-4 border-t border-slate-100 pt-5" onSubmit={e=>{e.preventDefault();upload();}}><fieldset disabled={busy||Boolean(attempt)} className="grid gap-4 sm:grid-cols-2"><Field label={replace?'Replacement for':'Document title'}><input className={inputClass} maxLength={200} value={title} disabled={Boolean(replace)} onChange={e=>{setTitle(e.target.value);remember({title:e.target.value});}}/></Field><Field label="File"><input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" className={`${inputClass} max-w-full`} onChange={e=>{const next=e.target.files[0]||null;setFile(next);remember({file:next});}}/></Field></fieldset>{attempt?.version&&!attempt.file?<Field label="Original file to resume"><input type="file" disabled={busy} accept=".pdf,.docx,.png,.jpg,.jpeg" className="w-full max-w-full text-sm" onChange={e=>{const next={...attempt,file:e.target.files[0]||null};setAttempt(next);remember({attempt:next});}}/></Field>:null}<p className="text-xs text-slate-500">PDF, DOCX, PNG or JPEG · up to 6 MB · earlier versions are retained</p><div className="flex flex-wrap gap-4"><button className={buttonClass} disabled={busy||(!file&&!attempt)}>{busy?'Saving…':attempt?'Retry Upload':'Upload'}</button>{attempt?<button type="button" className="text-sm underline" disabled={busy} onClick={()=>upload(null,true)}>Cancel Upload</button>:replace?<button type="button" className="text-sm underline" onClick={()=>{setReplace(null);setTitle('');remember({replace:null,title:''});}}>New document</button>:null}</div></form>:null}
    {editable&&data.pending_uploads.length?<section className="border-t border-slate-100 pt-5"><h2 className="text-sm font-medium">Pending uploads</h2><p className="mt-1 text-xs text-slate-500">Finish an uploaded file, or select its original file to resume. Cancel a stale replacement before starting again.</p><ul className="mt-3 space-y-4">{data.pending_uploads.map(v=><li key={v.id} className="space-y-3"><p className="break-words text-sm">{v.filename}</p><input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" disabled={busy||Boolean(attempt)} aria-label={`Resume ${v.filename}`} className="block w-full max-w-full text-sm" onChange={e=>{const current={version:v,file:e.target.files[0]||null,cancelId:crypto.randomUUID()};setAttempt(current);remember({attempt:current});}}/><div className="flex gap-4"><button disabled={busy||Boolean(attempt)} className="text-sm underline" onClick={()=>upload(v)}>Finish uploaded file</button><button disabled={busy||Boolean(attempt)} className="text-sm underline" onClick={()=>upload(v,true)}>Cancel pending upload</button></div></li>)}</ul></section>:null}
  </div>;
}
