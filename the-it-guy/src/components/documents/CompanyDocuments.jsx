import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '../ui/Button.jsx'
import Field from '../ui/Field.jsx'
import SectionHeader from '../ui/SectionHeader.jsx'
import DocumentAccessButton from './DocumentAccessButton.jsx'
import DocumentUploadProgress from './DocumentUploadProgress.jsx'
import { fetchOrganisationSettings } from '../../lib/settingsApi.js'
import { DOCUMENT_UPLOAD_ACCEPT, DOCUMENT_UPLOAD_HELP_TEXT, validateDocumentUploadFile } from '../../lib/documentUploadPolicy.js'
import { createDocumentUploadProgress, describeDocumentUploadFailure, refreshAfterSavedDocumentUpload } from '../../lib/documentUploadLifecycle.js'
import { fetchCompanyDocuments, uploadCompanyDocument, changeCompanyDocument, createCompanyDocumentSignedUrl, COMPANY_DOCUMENT_CHANGE_EVENT } from '../../domains/documents/companyDocumentsApi.js'
import { readLegacyCompanyDocuments, legacyCompanyDocumentFile, clearRecoveredCompanyDocument } from '../../domains/documents/companyDocumentLegacyRecovery.js'
const categories = ['Company Registration Documents','CIPC Documents','Tax Clearance / SARS Documents','VAT Registration','B-BBEE Certificate','Bank Confirmation Letter','Director IDs','Resolution Documents','Standard Company Profile','Standard Legal / Compliance Documents']
const emptyForm = () => ({ title: '', category: categories[0], status: 'uploaded', visibility: 'management', previous: null })

export default function CompanyDocuments({ organisationId: requestedOrganisationId = '', organisationName = '', actorId }) {
  const [organisationId,setOrganisationId] = useState(requestedOrganisationId)
  const [documents,setDocuments] = useState([])
  const [canManageAll,setCanManageAll] = useState(false)
  const [includeHistory,setIncludeHistory] = useState(false)
  const [form,setForm] = useState(emptyForm)
  const [file,setFile] = useState(null)
  const [legacy,setLegacy] = useState([])
  const [legacyError,setLegacyError] = useState('')
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [loading,setLoading] = useState(true)
  const [ready,setReady] = useState(false)
  const [resolvedName,setResolvedName] = useState(organisationName)
  const [busy,setBusy] = useState(false)
  const [progress,setProgress] = useState(null)
  const alive = useRef(true), locked = useRef(false), generation = useRef(0), fileInput = useRef(null)
  const invalidate=useCallback(()=>{generation.current++},[])
  useEffect(() => { alive.current=true; return () => { alive.current=false; invalidate() } },[invalidate])
  useEffect(() => {
    let active=true
    if (requestedOrganisationId) { setOrganisationId(requestedOrganisationId); return () => { active=false } }
    fetchOrganisationSettings().then(settings => {
      if (!active) return
      const id=settings?.organisation?.id
      if (!id) throw new Error('Choose an organisation before opening Company Documents.')
      setOrganisationId(id)
      setResolvedName(settings.organisation.name||'Selected organisation')
    }).catch(failure=>{if(active){setError(failure.message);setLoading(false)}})
    return ()=>{active=false}
  },[requestedOrganisationId])
  useEffect(()=>{
    try { setLegacy(readLegacyCompanyDocuments(actorId));setLegacyError('') }
    catch(failure){setLegacyError(failure.message)}
  },[actorId])
  const refresh=useCallback(async()=>{
    if (!organisationId || !actorId) return
    const request=++generation.current
    try {
      const data=await fetchCompanyDocuments({organisationId,actorId,includeHistory})
      if (!alive.current || request!==generation.current) return
      setDocuments(data.documents);setCanManageAll(data.canManageAll===true);setReady(true)
    } catch(failure) {
      if(alive.current&&request===generation.current){setDocuments([]);setCanManageAll(false);setReady(false)}
      throw failure
    }
  },[organisationId,actorId,includeHistory])
  useEffect(()=>{
    let active=true
    if(!organisationId)return undefined
    setLoading(true)
    refresh().catch(failure=>{if(active)setError(failure.message)}).finally(()=>{if(active)setLoading(false)})
    const changed=event=>{
      if (locked.current || document.visibilityState==='hidden' || (event?.detail?.organisationId && event.detail.organisationId!==organisationId)) return
      void refresh().catch(failure=>{if(active)setError(failure.message)})
    }
    const stored=event=>{if(event.key===COMPANY_DOCUMENT_CHANGE_EVENT)changed()}
    window.addEventListener('focus',changed);window.addEventListener(COMPANY_DOCUMENT_CHANGE_EVENT,changed);window.addEventListener('storage',stored)
    return ()=>{active=false;invalidate();window.removeEventListener('focus',changed);window.removeEventListener(COMPANY_DOCUMENT_CHANGE_EVENT,changed);window.removeEventListener('storage',stored)}
  },[organisationId,refresh,invalidate])
  const start=()=>{if(locked.current)return false;locked.current=true;setBusy(true);setError('');setNotice('');return true}
  const finish=()=>{locked.current=false;if(alive.current)setBusy(false)}
  const reset=()=>{setForm(emptyForm());setFile(null);if(fileInput.current)fileInput.current.value=''}
  async function save(event){
    event.preventDefault();if(!start())return
    try{
      if(!file)throw new Error('Choose the new document file before saving.')
      setProgress(createDocumentUploadProgress('preparing','',{fileName:file.name}))
      const saved=await uploadCompanyDocument({organisationId,actorId,file,...form,onProgress:update=>{if(alive.current)setProgress(update)}})
      if(!alive.current)return
      reset();setNotice('Company document saved securely. Authorised colleagues can see it on their devices.')
      await refreshAfterSavedDocumentUpload(saved,refresh,setNotice)
    }catch(failure){if(alive.current){setError(describeDocumentUploadFailure(failure));setProgress(createDocumentUploadProgress('failed',describeDocumentUploadFailure(failure),{fileName:file?.name}))}}finally{finish()}
  }
  async function change(row,action,visibility=null,status=null){
    if(!start())return
    try{
      const saved=await changeCompanyDocument({organisationId,actorId,document:row,action,visibility,status})
      if(!alive.current)return
      setNotice(action==='archive'?'Document removed from normal views. Its file remains in protected history.':action==='status'?'Document status updated.':'Document sharing updated.')
      await refreshAfterSavedDocumentUpload(saved,refresh,()=>setNotice('The change was saved. Reopen Company Documents to refresh the list.'))
    }catch(failure){if(alive.current)setError(failure.message)}finally{finish()}
  }
  async function recover(){
    if(!start())return
    const failures=[]
    try{
      for(const row of legacy){
        if(!alive.current)break
        let saved
        try{
          const original=legacyCompanyDocumentFile(row)
          saved=await uploadCompanyDocument({organisationId,actorId,file:original,title:row.title||row.fileName,category:row.category||categories[0],status:'pending_review',visibility:'management',legacyId:row.id,onProgress:update=>{if(alive.current)setProgress(update)}})
          if(!alive.current)break
          setLegacy(clearRecoveredCompanyDocument({actorId,legacy:row,receipt:saved}))
        }catch(failure){
          failures.push(`${row.title||row.fileName}: ${saved?.saved?'Saved securely; the browser copy could not be cleared. Retry recovery safely.':describeDocumentUploadFailure(failure)}`)
        }
      }
      if(alive.current){
        if(failures.length)setError(failures.join(' '))
        else setNotice('Browser-saved documents recovered securely into this organisation. They are restricted to their uploader and admins/managers.')
        await refreshAfterSavedDocumentUpload({saved:true},refresh,()=>setNotice('Recovered files are saved securely. Reopen Company Documents to refresh the list.'))
      }
    }finally{finish()}
  }
  return <section className="grid gap-5 xl:grid-cols-2" aria-label="Company document workspace">
    <div className="space-y-4 rounded-[22px] border border-[#dde4ee] bg-white p-6">
      <SectionHeader title="Company Documents" copy="Saved securely for this organisation across devices. Access is restricted to the uploader and admins/managers unless a manager shares a file with staff." />
      {organisationId?<p className="text-xs text-slate-600">Organisation: {resolvedName || 'Selected organisation'}</p>:null}
      {error?<p role="alert" className="text-sm text-red-800">{error}</p>:null}
      {notice?<p role="status" className="text-sm text-green-800">{notice}</p>:null}
      <Button type="button" disabled={busy||loading||!organisationId} onClick={()=>{setLoading(true);setError('');void refresh().catch(failure=>{if(alive.current)setError(failure.message)}).finally(()=>{if(alive.current)setLoading(false)})}}>Refresh documents</Button>
      <DocumentUploadProgress progress={progress} />
      {legacyError?<p role="alert">{legacyError}</p>:null}
      {legacy.length?<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p>{legacy.length} company document(s) were saved only in this browser. Recover them into the organisation shown above. Files stay in this browser until each secure save is confirmed.</p><Button type="button" disabled={busy||loading||!ready||!organisationId} onClick={()=>void recover()}>Recover browser documents to this organisation</Button></div>:null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeHistory} disabled={busy} onChange={event=>setIncludeHistory(event.target.checked)} />Show protected history</label>
      {loading?<p role="status">Loading company documents…</p>:documents.length?<ul className="space-y-3">{documents.map(row=><li key={row.id} className="rounded-lg border border-slate-200 p-3"><strong>{row.title}</strong><p className="text-xs text-slate-600">{row.status.replaceAll('_',' ')}</p><p className="text-sm text-slate-600">{row.category} · {row.fileName} · Version {row.version}{row.archivedAt?' · Protected history':''}</p><p className="text-xs text-slate-600">{row.visibility==='organisation'?'Shared with staff':'Uploader and admins/managers'}</p><div className="mt-2 flex flex-wrap items-center gap-2">
        <DocumentAccessButton document={{file_path:row.storagePath,file_bucket:row.storageBucket}} aria-label={`Open ${row.title}`} resolveUrl={()=>createCompanyDocumentSignedUrl({organisationId,actorId,document:row})}>Open file</DocumentAccessButton>
        {!row.archivedAt&&(canManageAll||row.uploaded_by===actorId)?<><Button type="button" disabled={busy} onClick={()=>{reset();setForm({title:row.title,category:row.category,status:'pending_review',visibility:canManageAll?row.visibility:'management',previous:row})}}>Replace</Button><Button type="button" disabled={busy} onClick={()=>void change(row,'archive')}>Remove</Button></>:null}
        {!row.archivedAt&&canManageAll?<label className="text-sm">Status for {row.title}<select value={row.status} disabled={busy} onChange={event=>void change(row,'status',null,event.target.value)}>{['uploaded','pending_review','approved','rejected'].map(status=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label>:null}
        {!row.archivedAt&&canManageAll?<Button type="button" disabled={busy} onClick={()=>void change(row,'visibility',row.visibility==='organisation'?'management':'organisation')}>{row.visibility==='organisation'?'Restrict to managers':'Share with staff'}</Button>:null}
      </div></li>)}</ul>:!error?<p>No company documents uploaded yet.</p>:null}
    </div>
    <form className="space-y-4 rounded-[22px] border border-[#dde4ee] bg-white p-6" onSubmit={save}>
      <SectionHeader title={form.previous?'Replace Company Document':'Upload Company Document'} />
      <label className="block text-sm">Document category<Field as="select" value={form.category} disabled={busy} onChange={event=>setForm(current=>({...current,category:event.target.value}))}>{categories.map(category=><option key={category}>{category}</option>)}</Field></label>
      <label className="block text-sm">Title<Field value={form.title} disabled={busy} required maxLength={300} placeholder="e.g. CIPC Registration" onChange={event=>setForm(current=>({...current,title:event.target.value}))} /></label>
      <label className="block text-sm">Access<Field as="select" value={form.visibility} disabled={busy||!canManageAll} onChange={event=>setForm(current=>({...current,visibility:event.target.value}))}><option value="management">Uploader and admins/managers</option><option value="organisation">All active staff in this organisation</option></Field></label>
      <label className="block text-sm">Document file<input ref={fileInput} type="file" accept={DOCUMENT_UPLOAD_ACCEPT} disabled={busy||loading||!ready} onChange={event=>{const selected=event.target.files?.[0];if(!selected)return;try{validateDocumentUploadFile(selected,{surface:'company_document'});setFile(selected);setError('')}catch(failure){setError(failure.message);event.target.value=''}}} /></label>
      <p className="text-xs text-slate-600">{DOCUMENT_UPLOAD_HELP_TEXT}</p>
      {form.previous?<p className="text-sm text-slate-600">Choose a new file. The previous version remains in protected history; the replacement awaits review.</p>:null}
      <Button type="submit" disabled={busy||loading||!ready||!organisationId||!file}>{busy?'Saving…':form.previous?'Save Replacement':'Upload Document'}</Button>
      {form.previous?<Button type="button" variant="ghost" disabled={busy} onClick={reset}>Cancel replacement</Button>:null}
    </form>
  </section>
}
