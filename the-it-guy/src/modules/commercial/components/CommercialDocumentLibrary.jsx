import { Download, Eye, FilePlus2, FileText, Trash2, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { COMMERCIAL_DOCUMENT_STATUSES, getCommercialDocumentCategories } from '../commercialDocumentConstants'
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
                      {getCategoryLabel(entityType, document.category)} · {document.file_name || 'No file name'} · {formatDate(document.uploaded_at || document.created_at)}
                    </p>
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
            <h4 className="text-sm font-semibold text-[#102236]">Document Requests</h4>
            <p className="mt-1 text-xs text-slate-500">{outstandingRequests.length} outstanding</p>
            <div className="mt-3 grid gap-2">
              {requests.length ? requests.slice(0, 5).map((request) => (
                <div key={request.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[#102236]">{request.document_name}</p>
                    <CommercialDocumentStatusPill value={request.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{getCategoryLabel(entityType, request.category)} · Due {formatDate(request.due_date)}</p>
                </div>
              )) : (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-500">No internal document requests yet.</p>
              )}
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
