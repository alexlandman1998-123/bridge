import { DOCUMENT_UPLOAD_HELP_TEXT } from '../../lib/documentUploadPolicy.js'
import { FileText, FolderClock, LockKeyhole, RefreshCw, Upload, ArrowUpRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDeveloperLeadDocuments, uploadDeveloperLeadDocument, createDeveloperLeadDocumentSignedUrl } from '../../services/documents/developerLeadDocumentsService.js'
import DocumentAccessButton from './DocumentAccessButton.jsx'
import useTransactionLiveRefresh from '../../hooks/useTransactionLiveRefresh.js'
import { DOCUMENT_UPLOAD_ACCEPT } from '../../lib/documentUploadPolicy.js'
import './developer-lead-documents.css'

const labels = { pending: 'Required', requested: 'Required', uploaded: 'Awaiting review', under_review: 'Awaiting review', approved: 'Approved', completed: 'Complete', waived: 'Waived', not_applicable: 'Not applicable', rejected: 'Needs replacement' }
export default function DeveloperLeadDocuments({ developerOrgId, developerLeadId }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState('')
  const [file, setFile] = useState(null)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const active = useRef(false)
  const request = useRef(0)
  const upload = useRef(null)
  const fileInput = useRef(null)
  const load = useCallback(async () => {
    const read = ++request.current
    try {
      const model = await fetchDeveloperLeadDocuments({ developerOrgId, developerLeadId })
      if (!active.current || read !== request.current) return false
      setResult(model); setError('')
      return true
    } catch (failure) {
      if (!active.current || read !== request.current) return false
      if (failure.code === 'lead_documents_access_denied' || failure.code === '42501' || failure.status === 403) setResult(null)
      setError(failure.message || 'Documents could not be loaded. Please retry.')
      return false
    }
  }, [developerOrgId, developerLeadId])
  useEffect(() => {
    active.current = true
    void load()
    return () => { active.current = false; request.current += 1; upload.current = null }
  }, [load])
  const live = useTransactionLiveRefresh({ transactionId: result?.transactionId, scopeKey: developerOrgId,
    enabled: Boolean(result?.transactionId), includeNotifications: false, refreshOnMount: false, pollingIntervalMs: 15_000,
    onRefresh: () => upload.current ? false : load(),
  })
  useEffect(() => {
    if (result?.transactionId) return undefined
    const recover = () => { if (document.visibilityState !== 'hidden' && navigator.onLine !== false) void load() }
    window.addEventListener('focus', recover)
    window.addEventListener('online', recover)
    window.addEventListener('itg:developer-leads-changed', recover)
    document.addEventListener('visibilitychange', recover)
    return () => {
      window.removeEventListener('focus', recover); window.removeEventListener('online', recover)
      window.removeEventListener('itg:developer-leads-changed', recover); document.removeEventListener('visibilitychange', recover)
    }
  }, [load, result?.transactionId])

  async function submit(event) {
    event.preventDefault()
    if (!file || !target || result?.state !== 'ready' || upload.current) return
    const token = {}
    upload.current = token
    request.current += 1
    setBusy(true); setError(''); setReceipt(''); setProgress('Preparing upload…')
    try {
      const document = await uploadDeveloperLeadDocument({ developerOrgId, developerLeadId, transactionId: result.transactionId,
        requirementId: target === 'other' ? '' : target, file,
        onProgress: (update) => { if (active.current && upload.current === token) setProgress(update.message || 'Uploading…') },
      })
      if (!active.current || upload.current !== token) return
      setResult((previous) => ({ ...previous, documents: [document, ...previous.documents.filter((row) => row.id !== document.id)] }))
      setFile(null); setTarget(''); if (fileInput.current) fileInput.current.value = ''
      setReceipt('Document saved to the linked transaction. Awaiting review.')
      const refreshed = await load()
      if (!refreshed && active.current) setError('Your document was saved, but the latest checklist could not be refreshed. Retry the refresh below.')
    } catch (failure) {
      if (active.current && upload.current === token) setError(failure.message || 'The document could not be saved. Please retry.')
    } finally {
      if (upload.current === token) { upload.current = null; if (active.current) { setBusy(false); setProgress('') } }
    }
  }

  return <section className="developer-lead-documents" aria-label="Lead documents">
    <header><span><FileText size={19} aria-hidden="true" /><h2>Documents</h2></span><button type="button" onClick={() => void load()} disabled={busy} aria-label="Refresh documents"><RefreshCw size={16} aria-hidden="true" /></button></header>
    {error && <p className="developer-lead-documents-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => void load()}>Retry refresh</button></p>}
    {live.lastErrorMessage && !error && <p className="developer-lead-documents-error">Showing the last loaded documents. Updates will retry automatically.</p>}
    {!result && !error && <p role="status">Loading saved documents…</p>}
    {result?.state === 'protected' && <div className="developer-lead-documents-empty"><LockKeyhole size={24} aria-hidden="true" /><h3>Awaiting agency handover</h3><p>Buyer documents become available when the agency releases this lead.</p></div>}
    {result?.state === 'awaiting_onboarding' && <div className="developer-lead-documents-empty"><FolderClock size={26} aria-hidden="true" /><h3>Awaiting onboarding</h3><p>Once the buyer submits onboarding, you can view and upload their documents here.</p></div>}
    {result?.state === 'ready' && <>
      <p>Buyer documents shared with the linked transaction.</p>
      {result.requirements.length > 0 && <ul className="developer-lead-document-requirements">{result.requirements.map((row) => <li key={row.id}><span><strong>{row.title}</strong>{row.rejectionReason && <small>{row.rejectionReason}</small>}</span><span className={`developer-lead-document-status is-${row.status}`}>{labels[row.status] || 'Status not recorded'}</span></li>)}</ul>}
      <form onSubmit={submit} aria-label="Upload buyer document">
        <label>Document type<select value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy} required><option value="">Choose document type</option>{result.requirements.filter((row) => row.canUpload).map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}<option value="other">Other buyer document</option></select></label>
        <label className="developer-lead-document-picker"><Upload size={17} aria-hidden="true" /><span>{file?.name || 'Choose a file'}</span><input ref={fileInput} aria-label="Choose buyer document file" type="file" title={DOCUMENT_UPLOAD_HELP_TEXT} accept={DOCUMENT_UPLOAD_ACCEPT} disabled={busy} onChange={(event) => setFile(event.target.files?.[0] || null)} /><span className="block text-xs font-normal text-slate-500">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
        </label>
        
        <small>PDF, Word, JPG or PNG · up to 35 MB</small>
        <button className="developer-lead-document-submit" type="submit" disabled={!file || !target || busy}>{busy ? 'Uploading…' : 'Upload document'}</button>
        {busy && <p role="status">{progress} Keep this page open.</p>}
      </form>
      {receipt && <p className="developer-lead-document-receipt" role="status">{receipt}</p>}
      <h3>Saved files</h3>
      {result.documents.length ? <ul className="developer-lead-document-files">{result.documents.map((document) => {
        const name = document.name || document.file_name || 'Buyer document'
        return <li key={`${developerOrgId}/${developerLeadId}/${result.transactionId}/${document.id}`}><FileText size={17} aria-hidden="true" /><span><strong>{name}</strong><small>{labels[document.review_status || document.status] || 'Received · awaiting review'}</small></span><DocumentAccessButton document={document} aria-label={`Open ${name}`} resolveUrl={() => createDeveloperLeadDocumentSignedUrl({ developerOrgId, developerLeadId, transactionId: result.transactionId, documentId: document.id })}><ArrowUpRight size={18} aria-hidden="true" /></DocumentAccessButton></li>
      })}</ul> : <p>No documents uploaded yet.</p>}
    </>}
  </section>
}
