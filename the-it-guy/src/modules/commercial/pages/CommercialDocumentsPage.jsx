import { AlertTriangle, Download, Eye, FileArchive, FileClock, Filter, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  COMMERCIAL_DOCUMENT_ENTITY_LABELS,
  COMMERCIAL_DOCUMENT_ENTITY_TYPES,
  getCommercialDocumentCategoryLabel,
} from '../commercialDocumentConstants'
import { formatDate, titleize } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialDocumentStatusPill from '../components/CommercialDocumentStatusPill'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialDocumentCentreData, getCommercialDocumentDownloadUrl } from '../services/commercialApi'

const VIEW_OPTIONS = [
  { value: 'all', label: 'All Documents' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'recent', label: 'Recently Uploaded' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expiring', label: 'Expiring' },
]

const OPEN_REQUEST_STATUSES = new Set(['requested', 'under_review', 'rejected', 'expired'])
const CLOSED_REQUEST_STATUSES = new Set(['approved', 'completed', 'archived'])

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function isOutstandingRequest(request = {}) {
  return OPEN_REQUEST_STATUSES.has(normalize(request.status)) || !CLOSED_REQUEST_STATUSES.has(normalize(request.status || 'requested'))
}

function isExpiring(document = {}) {
  const expiry = document.expires_at ? new Date(document.expires_at) : null
  if (!expiry || Number.isNaN(expiry.getTime())) return false
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + 60)
  return expiry <= horizon && normalize(document.status) !== 'archived'
}

function getOwnerId(row = {}) {
  return row.broker_id || row.uploaded_by || row.created_by || ''
}

function getLookupLabel(rows = [], id, fallback = 'Unassigned') {
  const match = rows.find((row) => String(row.userId || row.user_id || row.id) === String(id))
  return match?.fullName || match?.name || [match?.firstName || match?.first_name, match?.lastName || match?.last_name].filter(Boolean).join(' ') || match?.email || fallback
}

function filterRows({ documents, requests, view, filters, search }) {
  const query = normalize(search)
  const matchesFilters = (row) => {
    if (filters.entityType && row.entity_type !== filters.entityType) return false
    if (filters.status && normalize(row.status) !== filters.status) return false
    if (filters.category && normalize(row.category) !== filters.category) return false
    if (filters.brokerId && getOwnerId(row) !== filters.brokerId) return false
    if (filters.branchId && row.branch_id !== filters.branchId) return false
    if (filters.teamId && row.team_id !== filters.teamId) return false
    if (!query) return true
    return [
      row.document_name,
      row.file_name,
      row.category,
      row.entity_type,
      row.notes,
      row.requested_from,
    ].some((value) => normalize(value).includes(query))
  }

  if (view === 'outstanding') return requests.filter((row) => isOutstandingRequest(row) && matchesFilters(row))
  if (view === 'rejected') return documents.filter((row) => normalize(row.status) === 'rejected' && matchesFilters(row))
  if (view === 'expiring') return documents.filter((row) => isExpiring(row) && matchesFilters(row))
  const filteredDocuments = documents.filter(matchesFilters)
  if (view === 'recent') {
    return filteredDocuments
      .sort((left, right) => new Date(right.uploaded_at || right.created_at || 0) - new Date(left.uploaded_at || left.created_at || 0))
      .slice(0, 40)
  }
  return filteredDocuments
}

function CommercialDocumentsPage() {
  const [actionError, setActionError] = useState('')
  const [view, setView] = useState('all')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ entityType: '', status: '', category: '', brokerId: '', branchId: '', teamId: '' })
  const { data, loading, error } = useCommercialData(getCommercialDocumentCentreData, [])
  const documents = Array.isArray(data?.documents) ? data.documents : []
  const requests = Array.isArray(data?.documentRequests) ? data.documentRequests : []
  const lookups = data?.lookups || {}

  const rows = useMemo(
    () => filterRows({ documents, requests, view, filters, search }),
    [documents, filters, requests, search, view],
  )
  const categories = useMemo(() => {
    const values = new Map()
    documents.concat(requests).forEach((row) => {
      if (!row.category) return
      values.set(row.category, getCommercialDocumentCategoryLabel(row.entity_type, row.category))
    })
    return Array.from(values.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [documents, requests])
  const summary = {
    all: documents.length,
    outstanding: requests.filter(isOutstandingRequest).length,
    recent: documents.filter((row) => normalize(row.status) !== 'archived').length,
    rejected: documents.filter((row) => normalize(row.status) === 'rejected').length,
    expiring: documents.filter(isExpiring).length,
  }

  async function handleOpen(document) {
    setActionError('')
    try {
      const url = await getCommercialDocumentDownloadUrl(document)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else setActionError('No document file is available yet.')
    } catch (viewError) {
      setActionError(viewError?.message || 'Document could not be opened.')
    }
  }

  function updateFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Document Centre</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Commercial documents, requests, compliance exceptions, and broker follow-up work across the portfolio.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
          <FileArchive size={14} /> Compliance workflow
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setView(option.value)}
            className={`rounded-2xl border p-4 text-left transition ${view === option.value ? 'border-[#9fb9d1] bg-[#eef5fb]' : 'border-slate-200 bg-[#fbfcfe] hover:bg-white'}`}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{option.label}</span>
            <span className="mt-2 block text-2xl font-semibold text-[#102236]">{summary[option.value]}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 lg:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,0.6fr))] xl:grid-cols-[minmax(240px,1fr)_repeat(6,minmax(130px,0.55fr))]">
        <label className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search documents..."
            className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
          />
        </label>
        <select value={filters.entityType} onChange={(event) => updateFilter('entityType', event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]">
          <option value="">Record Type</option>
          {COMMERCIAL_DOCUMENT_ENTITY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]">
          <option value="">Category</option>
          {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
        </select>
        <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]">
          <option value="">Status</option>
          {['draft', 'requested', 'uploaded', 'under_review', 'approved', 'rejected', 'expired', 'superseded', 'archived'].map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
        </select>
        <select value={filters.brokerId} onChange={(event) => updateFilter('brokerId', event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]">
          <option value="">Broker</option>
          {(lookups.brokers || []).map((broker) => <option key={broker.userId || broker.id} value={broker.userId || broker.id}>{getLookupLabel([broker], broker.userId || broker.id, 'Broker')}</option>)}
        </select>
        <select value={filters.branchId} onChange={(event) => updateFilter('branchId', event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]">
          <option value="">Branch</option>
          {(lookups.branches || []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name || 'Branch'}</option>)}
        </select>
        <select value={filters.teamId} onChange={(event) => updateFilter('teamId', event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]">
          <option value="">Team</option>
          {(lookups.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name || 'Team'}</option>)}
        </select>
      </div>

      <div className="mt-5 grid gap-3">
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ) : error ? (
          <CommercialEmptyState title="Documents could not be loaded" description={error} />
        ) : rows.length ? rows.map((row) => {
          const isRequest = !row.file_path && view === 'outstanding'
          return (
            <article key={`${isRequest ? 'request' : 'document'}-${row.id}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.75fr)_150px_140px] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {isRequest ? <FileClock size={16} className="text-amber-600" /> : <FileArchive size={16} className="text-[#1267a3]" />}
                  <p className="truncate text-sm font-semibold text-[#102236]">{row.document_name || 'Commercial document'}</p>
                  {normalize(row.priority) === 'urgent' ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"><AlertTriangle size={12} /> Urgent</span> : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{COMMERCIAL_DOCUMENT_ENTITY_LABELS[row.entity_type] || titleize(row.entity_type)} · {getCommercialDocumentCategoryLabel(row.entity_type, row.category)} · Linked record {String(row.entity_id || '').slice(0, 8) || '-'}</p>
              </div>
              <div className="text-sm text-slate-600">
                <p className="font-semibold text-[#102236]">{isRequest ? row.requested_from || 'Internal request' : row.file_name || 'No file attached'}</p>
                <p className="text-xs text-slate-500">{isRequest ? `Due ${formatDate(row.due_date)}` : `Uploaded ${formatDate(row.uploaded_at || row.created_at)}`}</p>
                {row.expires_at ? <p className="text-xs font-semibold text-amber-700">Expires {formatDate(row.expires_at)}</p> : null}
              </div>
              <CommercialDocumentStatusPill value={row.status} />
              <div className="flex items-center gap-2">
                {!isRequest ? (
                  <>
                    <button type="button" onClick={() => handleOpen(row)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-white" aria-label="View document">
                      <Eye size={15} />
                    </button>
                    <button type="button" onClick={() => handleOpen(row)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-white" aria-label="Download document">
                      <Download size={15} />
                    </button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    <Filter size={14} /> Follow up
                  </span>
                )}
              </div>
            </article>
          )
        }) : (
          <CommercialEmptyState
            title="No matching commercial documents"
            description="No documents match the current view or filters."
          />
        )}
        {actionError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionError}</div> : null}
      </div>
    </section>
  )
}

export default CommercialDocumentsPage
