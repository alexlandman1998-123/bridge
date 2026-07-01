import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  Home,
  Link2,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import { useWorkspace } from '../context/WorkspaceContext'
import { csvEscape, mapCsvRowsToImportRows, parseCsvText, pickImportValue } from '../lib/csvImport'
import { leadCategoryLabel, normalizeLeadCategory } from '../lib/leadCategory'
import { processManualImportPayload } from '../services/leadSourceConnectorService'
import {
  linkLogToContact,
  linkLogToLead,
  linkLogToListing,
  listLeadIngestionLogs,
  listReviewPrivateListings,
  markLogDuplicate,
  markLogResolved,
  markLogReviewed,
  retryLeadIngestionLog,
} from '../services/leadIngestionReviewService'
import {
  assignLeadToAgent,
  assignLeadToQueue,
  autoAssignLead,
  LEAD_ASSIGNMENT_QUEUES,
} from '../services/leadAssignmentService'

const pageShell = 'mx-auto flex w-full max-w-[1480px] flex-col gap-5'
const panelClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm'

const SOURCE_OPTIONS = [
  'Property24',
  'Private Property',
  'Website',
  'WhatsApp',
  'Referral',
  'Facebook',
  'Google',
  'Walk-In',
  'Manual Import',
  'Other',
]

const STATUS_OPTIONS = ['new', 'assigned', 'processed', 'duplicate', 'failed']
const LEAD_IMPORT_TEMPLATE_COLUMNS = [
  'Name',
  'Phone',
  'Email',
  'Lead Category',
  'Source',
  'Listing Reference',
  'Area',
  'Property Type',
  'Budget Min',
  'Budget Max',
  'Bedrooms',
  'Bathrooms',
  'Message',
  'External Reference',
]
const LEAD_IMPORT_TEMPLATE_ROWS = [
  ['Nomsa Dlamini', '082 555 0101', 'nomsa@example.com', 'buyer', 'Manual Import', 'P24-12345', 'Sandton', 'Apartment', '1200000', '1800000', '2', '2', 'Interested in viewing this week', 'IMPORT-001'],
  ['Pieter Botha', '083 555 0102', 'pieter@example.com', 'seller', 'Manual Import', '', 'Boksburg', 'House', '', '', '', '', 'Wants a valuation and sale estimate', 'IMPORT-002'],
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getLockedImportCategory(value = '') {
  const category = normalizeLeadCategory(value, '')
  return category === 'buyer' || category === 'seller' ? category : ''
}

function buildLeadImportTemplateCsv(defaultLeadCategory = '') {
  const lockedCategory = getLockedImportCategory(defaultLeadCategory)
  const categoryIndex = LEAD_IMPORT_TEMPLATE_COLUMNS.indexOf('Lead Category')
  const rows = lockedCategory
    ? LEAD_IMPORT_TEMPLATE_ROWS.filter((row) => normalizeLeadCategory(row[categoryIndex], '') === lockedCategory)
    : LEAD_IMPORT_TEMPLATE_ROWS
  return [LEAD_IMPORT_TEMPLATE_COLUMNS, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n')
}

function downloadTextFile(fileName, text) {
  if (typeof document === 'undefined') return
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

function lockImportRowCategory(row = {}, defaultLeadCategory = '') {
  const lockedCategory = getLockedImportCategory(defaultLeadCategory)
  if (!lockedCategory) return row
  return {
    ...row,
    'Lead Category': lockedCategory,
    leadCategory: lockedCategory,
  }
}

function getOrganisationId(workspaceContext = {}) {
  return normalizeText(
    workspaceContext.currentWorkspace?.organisation_id ||
    workspaceContext.currentWorkspace?.organisationId ||
    workspaceContext.workspace?.organisation_id ||
    workspaceContext.workspace?.organisationId ||
    workspaceContext.currentMembership?.organisation_id ||
    workspaceContext.currentMembership?.organisationId ||
    workspaceContext.profile?.organisation_id ||
    workspaceContext.profile?.organisationId ||
    workspaceContext.workspace?.id,
  )
}

function getActor(workspaceContext = {}) {
  return {
    ...(workspaceContext.profile || {}),
    workspaceRole: workspaceContext.currentMembership?.workspace_role || workspaceContext.currentMembership?.organisation_role || workspaceContext.currentMembership?.role || workspaceContext.profile?.role,
  }
}

function formatDateTime(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function statusClasses(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'processed' || normalized === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (normalized === 'assigned' || normalized === 'reviewed') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (normalized === 'duplicate') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (normalized === 'failed' || normalized === 'needs_review') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function StatusBadge({ children }) {
  if (!children) return null
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold capitalize ${statusClasses(children)}`}>
      {String(children).replace(/_/g, ' ')}
    </span>
  )
}

function SummaryCard({ label, value, icon: Icon, tone = 'slate' }) {
  const SummaryIcon = Icon
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${tones[tone] || tones.slate}`}>
          <SummaryIcon size={18} />
        </span>
      </div>
    </section>
  )
}

function EmptyState({ title, copy }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <ClipboardList className="mx-auto text-slate-300" size={28} />
      <h3 className="mt-3 text-sm font-semibold text-slate-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{copy}</p>
    </section>
  )
}

function EnquiryFilters({ filters, setFilters, onRefresh, loading }) {
  return (
    <section className={`${panelClass} p-4`}>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_150px_180px_170px_150px_150px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={filters.search}
            onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-300"
            placeholder="Search name, phone, email, reference, listing"
          />
        </label>
        <select value={filters.source} onChange={(event) => setFilters((previous) => ({ ...previous, source: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All sources</option>
          {SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{source}</option>)}
        </select>
        <select value={filters.status} onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filters.issue} onChange={(event) => setFilters((previous) => ({ ...previous, issue: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All review states</option>
          <option value="needs_review">Needs review</option>
          <option value="failed">Failed</option>
          <option value="duplicate">Duplicate</option>
          <option value="unresolved_listing">Unresolved listing</option>
          <option value="has_error">Has error</option>
        </select>
        <input type="date" value={filters.createdFrom} onChange={(event) => setFilters((previous) => ({ ...previous, createdFrom: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
        <input type="date" value={filters.createdTo} onChange={(event) => setFilters((previous) => ({ ...previous, createdTo: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[
          ['hasLead', true, 'Has lead'],
          ['hasLead', false, 'No lead'],
          ['hasContact', true, 'Has contact'],
          ['hasContact', false, 'No contact'],
          ['hasError', true, 'Has error'],
        ].map(([key, value, label]) => {
          const active = filters[key] === value
          return (
            <button
              key={`${key}-${value}`}
              type="button"
              onClick={() => setFilters((previous) => ({ ...previous, [key]: active ? 'all' : value }))}
              className={`inline-flex min-h-9 items-center rounded-xl border px-3 text-sm font-semibold ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          )
        })}
        <button type="button" onClick={onRefresh} disabled={loading} className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
    </section>
  )
}

function EnquiryTable({ rows, loading, selectedId, onSelect }) {
  if (loading) return <LoadingSkeleton lines={6} className="rounded-2xl border border-slate-200 bg-white" />
  if (!rows.length) return <EmptyState title="No enquiries found" copy="Try a broader source, status, date, or text search." />
  return (
    <section className={`${panelClass} overflow-hidden`}>
      <div className="hidden grid-cols-[150px_150px_1.4fr_1fr_1fr_150px_110px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 lg:grid">
        <span>Source</span>
        <span>Status</span>
        <span>Contact</span>
        <span>Reference</span>
        <span>Links</span>
        <span>Created</span>
        <span>Action</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <article key={row.logId} className={`grid gap-3 px-4 py-4 lg:grid-cols-[150px_150px_1.4fr_1fr_1fr_150px_110px] lg:items-center ${selectedId === row.logId ? 'bg-blue-50/60' : 'bg-white'}`}>
            <div>
              <p className="text-sm font-semibold text-slate-950">{row.source}</p>
              {row.payloadSummary?.listingReference ? <p className="mt-1 text-xs text-slate-500">Listing {row.payloadSummary.listingReference}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge>{row.status}</StatusBadge>
              <StatusBadge>{row.reviewStatus}</StatusBadge>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{row.payloadSummary?.name || 'Unknown contact'}</p>
              <p className="mt-1 truncate text-sm text-slate-500">{[row.payloadSummary?.phone, row.payloadSummary?.email].filter(Boolean).join(' · ') || 'No contact details captured'}</p>
              {row.error ? <p className="mt-1 truncate text-xs font-semibold text-rose-600">{row.error}</p> : null}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-700">{row.externalReference || 'No external reference'}</p>
              <p className="mt-1 text-xs text-slate-500">Processed {formatDateTime(row.processedAt)}</p>
            </div>
            <div className="space-y-1 text-sm text-slate-600">
              <p>Lead: {row.leadId ? 'Linked' : '—'}</p>
              <p>Contact: {row.contactId ? 'Linked' : '—'}</p>
              <p>Listing: {row.listingId ? 'Linked' : row.hasUnresolvedListing ? 'Unresolved' : '—'}</p>
            </div>
            <p className="text-sm text-slate-500">{formatDateTime(row.createdAt)}</p>
            <button type="button" onClick={() => onSelect(row)} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
              Review
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-800">{value || '—'}</p>
    </div>
  )
}

function EnquiryDetailDrawer({ enquiry, organisationId, actor, onClose, onUpdated }) {
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [linkDraft, setLinkDraft] = useState({ leadId: '', contactId: '', listingId: '' })
  const [assignmentDraft, setAssignmentDraft] = useState({ agentId: '', queueId: 'unassigned' })
  const [retryDraft, setRetryDraft] = useState({ name: '', email: '', phone: '', listingId: '', source: '', externalReference: '', message: '' })
  const [listingQuery, setListingQuery] = useState('')
  const [listingRows, setListingRows] = useState([])
  const [listingLoading, setListingLoading] = useState(false)

  useEffect(() => {
    if (!enquiry) return
    setError('')
    setLinkDraft({ leadId: enquiry.leadId || '', contactId: enquiry.contactId || '', listingId: enquiry.listingId || '' })
    setAssignmentDraft({ agentId: enquiry.assignedAgentId || '', queueId: 'unassigned' })
    setRetryDraft({
      name: enquiry.payloadSummary?.name === 'Unknown contact' ? '' : enquiry.payloadSummary?.name || '',
      email: enquiry.payloadSummary?.email || '',
      phone: enquiry.payloadSummary?.phone || '',
      listingId: enquiry.listingId || '',
      source: enquiry.source || '',
      externalReference: enquiry.externalReference || '',
      message: enquiry.payloadSummary?.message || '',
    })
    setListingQuery(enquiry.payloadSummary?.listingReference || '')
  }, [enquiry])

  useEffect(() => {
    if (!enquiry || !organisationId) return
    let cancelled = false
    async function loadListings() {
      try {
        setListingLoading(true)
        const rows = await listReviewPrivateListings({ organisationId, search: listingQuery, status: 'all' })
        if (!cancelled) setListingRows(rows.slice(0, 8))
      } catch {
        if (!cancelled) setListingRows([])
      } finally {
        if (!cancelled) setListingLoading(false)
      }
    }
    void loadListings()
    return () => {
      cancelled = true
    }
  }, [enquiry, listingQuery, organisationId])

  if (!enquiry) return null

  async function runAction(label, action) {
    try {
      setWorking(label)
      setError('')
      const result = await action()
      onUpdated(result?.log || (result?.logId ? result : enquiry))
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update enquiry log.')
    } finally {
      setWorking('')
    }
  }

  async function copyReference() {
    if (!enquiry.externalReference) return
    await navigator.clipboard?.writeText(enquiry.externalReference)
  }

  const rawPayload = JSON.stringify(enquiry.payload || {}, null, 2)

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Enquiry Review</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">{enquiry.source} enquiry</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge>{enquiry.status}</StatusBadge>
            <StatusBadge>{enquiry.reviewStatus}</StatusBadge>
          </div>
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close enquiry drawer">
          <X size={18} />
        </button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <DetailField label="External Reference" value={enquiry.externalReference} />
          <DetailField label="Listing Reference" value={enquiry.payloadSummary?.listingReference} />
          <DetailField label="Created" value={formatDateTime(enquiry.createdAt)} />
          <DetailField label="Processed" value={formatDateTime(enquiry.processedAt)} />
          <DetailField label="Contact" value={[enquiry.payloadSummary?.name, enquiry.payloadSummary?.phone, enquiry.payloadSummary?.email].filter(Boolean).join(' · ')} />
          <DetailField label="Message" value={enquiry.payloadSummary?.message} />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-950">Open Linked Records</h3>
          <div className="flex flex-wrap gap-2">
            {enquiry.leadId ? <Link to={`/pipeline/leads/${enquiry.leadId}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">Open lead <ExternalLink size={14} /></Link> : <span className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-3 text-sm text-slate-500">No lead linked</span>}
            {enquiry.listingId ? <Link to={`/agent/listings/${enquiry.listingId}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">Open listing <ExternalLink size={14} /></Link> : null}
            <button type="button" onClick={copyReference} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">
              <Copy size={14} />
              Copy reference
            </button>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Review Actions</h3>
          {enquiry.error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{enquiry.error}</p> : null}
          {enquiry.hasUnresolvedListing ? <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">Listing could not be matched.</p> : null}
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" disabled={Boolean(working)} onClick={() => runAction('reviewed', () => markLogReviewed(enquiry.logId, { actor }))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
              <CheckCircle2 size={15} />
              Mark reviewed
            </button>
            <button type="button" disabled={Boolean(working)} onClick={() => runAction('duplicate', () => markLogDuplicate(enquiry.logId, { actor }))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 disabled:opacity-60">
              <ClipboardList size={15} />
              Mark duplicate
            </button>
            <button type="button" disabled={Boolean(working)} onClick={() => runAction('resolved', () => markLogResolved(enquiry.logId, { actor }))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 disabled:opacity-60">
              <CheckCircle2 size={15} />
              Mark resolved
            </button>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Link Existing Records</h3>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input value={linkDraft.leadId} onChange={(event) => setLinkDraft((previous) => ({ ...previous, leadId: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Existing lead id" />
            <button type="button" onClick={() => runAction('lead', () => linkLogToLead({ logId: enquiry.logId, leadId: linkDraft.leadId }))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
              <Link2 size={14} />
              Link lead
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input value={linkDraft.contactId} onChange={(event) => setLinkDraft((previous) => ({ ...previous, contactId: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Existing contact id" />
            <button type="button" onClick={() => runAction('contact', () => linkLogToContact({ logId: enquiry.logId, contactId: linkDraft.contactId }))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
              <UserRound size={14} />
              Link contact
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input value={linkDraft.listingId} onChange={(event) => setLinkDraft((previous) => ({ ...previous, listingId: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Existing listing id" />
            <button type="button" onClick={() => runAction('listing', () => linkLogToListing({ logId: enquiry.logId, listingId: linkDraft.listingId }, { actor }))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
              <Home size={14} />
              Link listing
            </button>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input value={listingQuery} onChange={(event) => setListingQuery(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm" placeholder="Search existing listings" />
            </label>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {listingLoading ? <p className="text-sm text-slate-500">Searching listings...</p> : null}
              {!listingLoading && listingRows.map((listing) => (
                <article key={listing.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{listing.title}</p>
                    <p className="truncate text-xs text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                  </div>
                  <button type="button" onClick={() => runAction(`listing-${listing.id}`, () => linkLogToListing({ logId: enquiry.logId, listingId: listing.id }, { actor }))} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">
                    Link
                  </button>
                </article>
              ))}
              {!listingLoading && !listingRows.length ? <p className="text-sm text-slate-500">No listings found.</p> : null}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Assignment Review</h3>
          {enquiry.leadId ? (
            <>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input value={assignmentDraft.agentId} onChange={(event) => setAssignmentDraft((previous) => ({ ...previous, agentId: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Agent user id" />
                <button type="button" disabled={!assignmentDraft.agentId || Boolean(working)} onClick={() => runAction('assign-agent', () => assignLeadToAgent({ organisationId, leadId: enquiry.leadId, agentId: assignmentDraft.agentId, reason: 'Assigned from Enquiry Inbox' }, { actor }))} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">
                  Assign Agent
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <select value={assignmentDraft.queueId} onChange={(event) => setAssignmentDraft((previous) => ({ ...previous, queueId: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm">
                  {LEAD_ASSIGNMENT_QUEUES.map((queue) => <option key={queue} value={queue}>{queue.replace(/_/g, ' ')}</option>)}
                </select>
                <button type="button" disabled={Boolean(working)} onClick={() => runAction('assign-queue', () => assignLeadToQueue({ organisationId, leadId: enquiry.leadId, queueId: assignmentDraft.queueId, reason: 'Assigned to queue from Enquiry Inbox' }, { actor }))} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
                  Assign Queue
                </button>
                <button type="button" disabled={Boolean(working)} onClick={() => runAction('auto-assign', () => autoAssignLead({ organisationId, leadId: enquiry.leadId }, { actor }))} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 disabled:opacity-60">
                  Auto-Assign
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Link a lead before assigning ownership.</p>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Retry Ingestion</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={retryDraft.name} onChange={(event) => setRetryDraft((previous) => ({ ...previous, name: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Name" />
            <input value={retryDraft.phone} onChange={(event) => setRetryDraft((previous) => ({ ...previous, phone: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Phone" />
            <input value={retryDraft.email} onChange={(event) => setRetryDraft((previous) => ({ ...previous, email: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Email" />
            <input value={retryDraft.listingId} onChange={(event) => setRetryDraft((previous) => ({ ...previous, listingId: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Listing id" />
            <input value={retryDraft.source} onChange={(event) => setRetryDraft((previous) => ({ ...previous, source: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Source" />
            <input value={retryDraft.externalReference} onChange={(event) => setRetryDraft((previous) => ({ ...previous, externalReference: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="External reference" />
          </div>
          <textarea value={retryDraft.message} onChange={(event) => setRetryDraft((previous) => ({ ...previous, message: event.target.value }))} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Message" />
          <button type="button" disabled={Boolean(working)} onClick={() => runAction('retry', () => retryLeadIngestionLog({ logId: enquiry.logId, overrides: retryDraft }, { actor }))} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-60">
            <RotateCcw size={15} />
            Retry safely
          </button>
          <p className="text-xs text-slate-500">Retry count: {enquiry.retryCount || 0}. Original payload is preserved.</p>
        </section>

        <section className="space-y-3">
          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-950">Raw payload</summary>
            <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{rawPayload}</pre>
          </details>
        </section>
      </div>
    </aside>
  )
}

function LeadImportModal({ open, organisationId, actor, defaultLeadCategory = '', onClose, onImported }) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const lockedLeadCategory = getLockedImportCategory(defaultLeadCategory)
  const lockedLeadCategoryLabel = lockedLeadCategory ? leadCategoryLabel(lockedLeadCategory) : ''

  useEffect(() => {
    if (!open) {
      setFileName('')
      setRows([])
      setError('')
      setImporting(false)
      setResult(null)
    }
  }, [open])

  if (!open) return null

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setError('')
      setResult(null)
      const text = await file.text()
      const parsedRows = mapCsvRowsToImportRows(parseCsvText(text))
      if (!parsedRows.length) throw new Error('No lead rows found in this CSV.')
      setFileName(file.name)
      setRows(parsedRows.map((row) => lockImportRowCategory(row, lockedLeadCategory)))
    } catch (fileError) {
      setFileName(file.name || '')
      setRows([])
      setError(fileError?.message || 'Could not read this CSV.')
    }
  }

  async function handleImportRows() {
    if (!organisationId) {
      setError('Select an agency workspace before importing leads.')
      return
    }
    if (!rows.length) {
      setError('Choose a CSV file before importing.')
      return
    }

    try {
      setImporting(true)
      setError('')
      const importResult = await processManualImportPayload(rows, { organisationId, actor })
      setResult(importResult)
      await onImported?.()
    } catch (importError) {
      setError(importError?.message || 'Lead import failed.')
    } finally {
      setImporting(false)
    }
  }

  const previewRows = rows.slice(0, 5)
  const failedRows = result?.results
    ?.map((entry, index) => ({ entry, row: rows[index] }))
    .filter(({ entry }) => entry.ok === false) || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Bulk Upload</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{lockedLeadCategoryLabel ? `Import ${lockedLeadCategoryLabel} Leads` : 'Import Leads'}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              {lockedLeadCategoryLabel
                ? `Upload a CSV of ${lockedLeadCategoryLabel.toLowerCase()} leads. Rows in this upload will be imported as ${lockedLeadCategoryLabel.toLowerCase()} leads.`
                : 'Upload a CSV of buyer or seller leads. Imported rows appear in this enquiry review queue and create linked lead records where possible.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close import modal">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {result ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">{result.processed || 0} imported · {result.failed || 0} failed</p>
              {failedRows.length ? <p className="mt-1 text-emerald-700">Failed rows can be corrected and uploaded again.</p> : null}
            </div>
          ) : null}

          <section className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-950">{fileName || 'No CSV selected'}</p>
              <p className="mt-1 text-xs text-slate-500">
                {rows.length
                  ? `${rows.length} ${lockedLeadCategoryLabel ? `${lockedLeadCategoryLabel.toLowerCase()} ` : ''}rows ready to import`
                  : 'Use the template columns for the cleanest import.'}
              </p>
            </div>
            <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <FileUp size={16} />
              Choose CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void handleFileChange(event)} />
            </label>
            <button type="button" onClick={() => downloadTextFile('arch9-lead-import-template.csv', buildLeadImportTemplateCsv(lockedLeadCategory))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <Download size={16} />
              Template
            </button>
          </section>

          {previewRows.length ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">Preview</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white text-xs uppercase tracking-[0.08em] text-slate-400">
                    <tr>
                      {['Row', 'Name', 'Phone', 'Email', 'Lead Category', 'Source', 'Area'].map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row) => (
                      <tr key={row.__rowNumber}>
                        <td className="px-4 py-3 text-slate-500">{row.__rowNumber}</td>
                        <td className="px-4 py-3 font-semibold text-slate-950">{pickImportValue(row, ['Name', 'name', 'Full Name', 'fullName']) || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Phone', 'phone', 'Mobile', 'mobile']) || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Email', 'email']) || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Lead Category', 'leadCategory', 'category']) || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Source', 'source']) || 'Manual Import'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Area', 'area', 'Suburb', 'suburb']) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {failedRows.length ? (
            <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">Failed rows</p>
              <div className="mt-2 max-h-36 overflow-auto text-xs text-amber-700">
                {failedRows.slice(0, 8).map(({ entry, row }, index) => <p key={`${entry.error}-${index}`}>Row {row?.__rowNumber || index + 2}: {entry.error || 'Import failed'}</p>)}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{rows.length ? `${rows.length} rows loaded` : 'CSV format only'}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={handleImportRows} disabled={!rows.length || importing || !organisationId} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
              <FileUp size={16} />
              {importing ? 'Importing...' : 'Import Leads'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

export default function AgentEnquiriesPage() {
  const workspaceContext = useWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const organisationId = getOrganisationId(workspaceContext)
  const actor = getActor(workspaceContext)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importLeadCategory, setImportLeadCategory] = useState('')
  const [filters, setFilters] = useState({
    search: '',
    source: 'all',
    status: 'all',
    issue: 'all',
    createdFrom: '',
    createdTo: '',
    hasLead: 'all',
    hasContact: 'all',
    hasError: 'all',
  })

  const serviceFilters = useMemo(() => ({
    ...filters,
    organisationId,
    hasLead: filters.hasLead === 'all' ? undefined : filters.hasLead,
    hasContact: filters.hasContact === 'all' ? undefined : filters.hasContact,
    hasError: filters.hasError === 'all' ? undefined : filters.hasError,
  }), [filters, organisationId])

  const loadRows = useCallback(async () => {
    if (!organisationId) {
      setRows([])
      setLoading(false)
      setError('Select an agency workspace before loading enquiries.')
      return
    }
    try {
      setLoading(true)
      setError('')
      const result = await listLeadIngestionLogs(serviceFilters)
      setRows(result)
    } catch (loadError) {
      setRows([])
      setError(loadError?.message || 'Unable to load enquiries right now.')
    } finally {
      setLoading(false)
    }
  }, [organisationId, serviceFilters])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    if (searchParams.get('import') !== '1') return
    setImportLeadCategory(getLockedImportCategory(searchParams.get('leadCategory') || searchParams.get('category')))
    setImportOpen(true)
  }, [searchParams])

  const summary = useMemo(() => ({
    newCount: rows.filter((row) => row.status === 'new' || row.status === 'assigned').length,
    processed: rows.filter((row) => row.status === 'processed').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    needsReview: rows.filter((row) => row.reviewStatus === 'needs_review').length,
    duplicates: rows.filter((row) => row.status === 'duplicate' || row.reviewStatus === 'duplicate').length,
  }), [rows])

  function handleUpdated(updated) {
    if (updated?.logId) setSelected(updated)
    void loadRows()
  }

  function closeLeadImport() {
    setImportOpen(false)
    setImportLeadCategory('')
    if (searchParams.get('import') === '1') {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('import')
      nextParams.delete('leadCategory')
      nextParams.delete('category')
      setSearchParams(nextParams, { replace: true })
    }
  }

  return (
    <main className={pageShell}>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Agent Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.045em] text-slate-950">Enquiries</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">Operational review for external lead ingestion logs, duplicates, failures, unresolved listings, and safe retries.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setImportLeadCategory(''); setImportOpen(true) }} disabled={!organisationId} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-300">
            <FileUp size={15} />
            Import Leads
          </button>
          <button type="button" onClick={loadRows} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="New" value={summary.newCount} icon={ClipboardList} tone="blue" />
        <SummaryCard label="Processed" value={summary.processed} icon={CheckCircle2} tone="emerald" />
        <SummaryCard label="Failed" value={summary.failed} icon={AlertTriangle} tone="rose" />
        <SummaryCard label="Needs Review" value={summary.needsReview} icon={AlertTriangle} tone="amber" />
        <SummaryCard label="Duplicates" value={summary.duplicates} icon={Copy} tone="slate" />
      </section>

      {error ? <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      <EnquiryFilters filters={filters} setFilters={setFilters} onRefresh={loadRows} loading={loading} />
      <EnquiryTable rows={rows} loading={loading} selectedId={selected?.logId} onSelect={setSelected} />

      <EnquiryDetailDrawer
        enquiry={selected}
        organisationId={organisationId}
        actor={actor}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
      <LeadImportModal
        open={importOpen}
        organisationId={organisationId}
        actor={actor}
        defaultLeadCategory={importLeadCategory}
        onClose={closeLeadImport}
        onImported={loadRows}
      />
    </main>
  )
}
