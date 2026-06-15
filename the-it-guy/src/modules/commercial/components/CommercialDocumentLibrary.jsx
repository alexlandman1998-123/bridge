import { AlertTriangle, CheckCircle2, Download, Eye, FilePlus2, FileText, Trash2, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  COMMERCIAL_DOCUMENT_STATUSES,
  COMMERCIAL_HOT_DOCUMENT_FLOW,
  COMMERCIAL_LEASE_DOCUMENT_FLOW,
  buildCommercialDocumentCompliance,
  getCommercialDocumentCategories,
  getCommercialDocumentCategoryLabel,
  getCommercialDocumentVersionLabel,
} from '../commercialDocumentConstants'
import { formatDate, titleize } from '../commercialFormatters'
import {
  archiveCommercialDocument,
  createCommercialDocumentRequest,
  getCommercialDocumentDownloadUrl,
  getCommercialDocumentRequests,
  getCommercialDocuments,
  updateCommercialDocumentStatus,
  uploadCommercialDocument,
} from '../services/commercialApi'
import CommercialDocumentRequestModal from './CommercialDocumentRequestModal'
import CommercialDocumentStatusPill from './CommercialDocumentStatusPill'
import CommercialDocumentUploadModal from './CommercialDocumentUploadModal'

function getCategoryLabel(entityType, categoryValue) {
  const match = getCommercialDocumentCategories(entityType).find((category) => category.value === categoryValue)
  return match?.label || titleize(categoryValue)
}

function CommercialDocumentLibrary({ organisationId = '', entityType, entityId, compact = false, onActivityChange }) {
  const [documents, setDocuments] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [updatingId, setUpdatingId] = useState('')

  const canLoad = Boolean(entityType && entityId)

  const loadData = useCallback(async () => {
    if (!canLoad) return
    setLoading(true)
    setError('')
    try {
      const [nextDocuments, nextRequests] = await Promise.all([
        getCommercialDocuments(entityType, entityId, organisationId),
        getCommercialDocumentRequests(entityType, entityId, organisationId),
      ])
      setDocuments(nextDocuments || [])
      setRequests(nextRequests || [])
    } catch (loadError) {
      setError(loadError?.message || 'Commercial documents could not be loaded.')
      setDocuments([])
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [canLoad, entityId, entityType, organisationId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const outstandingRequests = useMemo(
    () => requests.filter((request) => !['approved', 'completed', 'archived'].includes(String(request.status || '').toLowerCase())),
    [requests],
  )
  const compliance = useMemo(
    () => buildCommercialDocumentCompliance({ entityType, documents, requests }),
    [documents, entityType, requests],
  )
  const documentFlow = entityType === 'commercial_heads_of_terms'
    ? COMMERCIAL_HOT_DOCUMENT_FLOW
    : entityType === 'commercial_lease'
      ? COMMERCIAL_LEASE_DOCUMENT_FLOW
      : []
  const receivedFlowCategories = useMemo(
    () => new Set(documents.filter((document) => !['archived', 'superseded'].includes(String(document.status || '').toLowerCase())).map((document) => document.category)),
    [documents],
  )

  async function handleUpload(form) {
    await uploadCommercialDocument({
      organisationId,
      entityType,
      entityId,
      file: form.file,
      documentName: form.documentName || form.file?.name,
      category: form.category,
      status: form.status,
      notes: form.notes,
      versionNumber: form.versionNumber,
      expiresAt: form.expiresAt,
    })
    await loadData()
    onActivityChange?.()
  }

  async function handleRequest(form) {
    await createCommercialDocumentRequest({
      organisationId,
      entityType,
      entityId,
      documentName: form.documentName,
      category: form.category,
      requestedFrom: form.requestedFrom,
      dueDate: form.dueDate,
      priority: form.priority,
      notes: form.notes,
      status: form.status,
    })
    await loadData()
    onActivityChange?.()
  }

  async function handleStatusChange(document, status) {
    if (!document?.id || document.status === status) return
    setUpdatingId(document.id)
    setError('')
    try {
      await updateCommercialDocumentStatus(document.id, status)
      await loadData()
      onActivityChange?.()
    } catch (statusError) {
      setError(statusError?.message || 'Document status could not be updated.')
    } finally {
      setUpdatingId('')
    }
  }

  async function handleArchive(document) {
    if (!document?.id) return
    const confirmed = window.confirm('Archive this commercial document?')
    if (!confirmed) return
    setUpdatingId(document.id)
    setError('')
    try {
      await archiveCommercialDocument(document.id)
      await loadData()
      onActivityChange?.()
    } catch (archiveError) {
      setError(archiveError?.message || 'Document could not be archived.')
    } finally {
      setUpdatingId('')
    }
  }

  async function handleView(document) {
    try {
      const url = await getCommercialDocumentDownloadUrl(document)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else setError('No document file is available yet.')
    } catch (viewError) {
      setError(viewError?.message || 'Document could not be opened.')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">Documents</h3>
          <p className="mt-1 text-sm text-slate-500">Commercial document uploads, requests, review status, and notes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRequestOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
          >
            <FilePlus2 size={16} />
            Request
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[#102b46] px-3 text-sm font-semibold text-white transition hover:bg-[#163a5b]"
          >
            <UploadCloud size={16} />
            Upload
          </button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Completion</p>
          <p className="mt-1 text-lg font-semibold text-[#102236]">{compliance.complete} of {compliance.total}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${compliance.completionPercent}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{compliance.completionPercent}% complete</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-amber-700">Outstanding</p>
          <p className="mt-1 text-lg font-semibold text-[#102236]">{compliance.outstanding.length + outstandingRequests.length}</p>
          <p className="mt-1 text-xs text-amber-800">Required items and open requests</p>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-rose-700">Rejected / Review</p>
          <p className="mt-1 text-lg font-semibold text-[#102236]">{compliance.rejected.length + compliance.pendingReview.length}</p>
          <p className="mt-1 text-xs text-rose-800">Needs broker attention</p>
        </div>
      </div>

      {documentFlow.length ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-[#102236]">{entityType === 'commercial_lease' ? 'Lease Document Progression' : 'Heads of Terms Document Progression'}</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {documentFlow.map((category) => {
              const received = receivedFlowCategories.has(category)
              return (
                <div key={category} className={`rounded-2xl border px-3 py-3 ${received ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-[#fbfcfe] text-slate-500'}`}>
                  <p className="text-xs font-semibold">{getCommercialDocumentCategoryLabel(entityType, category)}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em]">{received ? 'Received' : 'Pending'}</p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className={`mt-4 grid gap-4 ${compact ? '' : 'xl:grid-cols-[minmax(0,1fr)_320px]'}`}>
        <div className="grid gap-3">
          {loading ? (
            [0, 1].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-white" />)
          ) : documents.length ? (
            documents.map((document) => (
              <article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText size={16} className="text-[#1267a3]" />
                      <h4 className="font-semibold text-[#102236]">{document.document_name}</h4>
                      <CommercialDocumentStatusPill value={document.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {getCategoryLabel(entityType, document.category)} · {getCommercialDocumentVersionLabel(document) ? `${getCommercialDocumentVersionLabel(document)} · ` : ''}{document.file_name || 'No file name'} · {formatDate(document.uploaded_at || document.created_at)}
                    </p>
                    {document.expires_at ? <p className="mt-1 text-xs font-semibold text-amber-700">Expires {formatDate(document.expires_at)}</p> : null}
                    {document.notes ? <p className="mt-2 text-sm leading-6 text-slate-600">{document.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={document.status || 'uploaded'}
                      disabled={updatingId === document.id}
                      onChange={(event) => handleStatusChange(document, event.target.value)}
                      className="min-h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-[#102236]"
                    >
                      {COMMERCIAL_DOCUMENT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                    <button type="button" onClick={() => handleView(document)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="View document">
                      <Eye size={15} />
                    </button>
                    <button type="button" onClick={() => handleView(document)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Download document">
                      <Download size={15} />
                    </button>
                    <button type="button" onClick={() => handleArchive(document)} className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100" aria-label="Archive document">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              No commercial documents have been uploaded yet.
            </div>
          )}
        </div>

        {!compact ? (
          <aside className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-[#102236]">Required Documents</h4>
            <div className="mt-3 grid gap-2">
              {compliance.required.length ? compliance.required.map((item) => (
                <div key={item.category} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
                  <div>
                    <p className="text-sm font-semibold text-[#102236]">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.required === false ? 'Recommended' : 'Required'}</p>
                  </div>
                  {item.received || item.approved ? (
                    <CheckCircle2 size={17} className="text-emerald-600" />
                  ) : (
                    <AlertTriangle size={17} className="text-amber-600" />
                  )}
                </div>
              )) : (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-500">No requirement template for this record type.</p>
              )}
            </div>

            <h4 className="mt-5 text-sm font-semibold text-[#102236]">Document Requests</h4>
            <p className="mt-1 text-xs text-slate-500">{outstandingRequests.length} outstanding</p>
            <div className="mt-3 grid gap-2">
              {requests.length ? requests.slice(0, 5).map((request) => (
                <div key={request.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[#102236]">{request.document_name}</p>
                    <CommercialDocumentStatusPill value={request.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{getCategoryLabel(entityType, request.category)} · Due {formatDate(request.due_date)}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{titleize(request.priority || 'normal')} priority</p>
                </div>
              )) : (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-500">No internal document requests yet.</p>
              )}
            </div>
          </aside>
        ) : compliance.required.length ? (
          <aside className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-[#102236]">Required Documents</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {compliance.required.map((item) => (
                <div key={item.category} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
                  <span className="text-sm font-semibold text-[#102236]">{item.label}</span>
                  <span className={`text-xs font-semibold ${item.received || item.approved ? 'text-emerald-600' : 'text-amber-700'}`}>
                    {item.received || item.approved ? 'Received' : item.requested ? 'Requested' : 'Missing'}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        ) : null}
      </div>

      <CommercialDocumentUploadModal
        open={uploadOpen}
        entityType={entityType}
        onClose={() => setUploadOpen(false)}
        onSubmit={handleUpload}
      />
      <CommercialDocumentRequestModal
        open={requestOpen}
        entityType={entityType}
        onClose={() => setRequestOpen(false)}
        onSubmit={handleRequest}
      />
    </section>
  )
}

export default CommercialDocumentLibrary
