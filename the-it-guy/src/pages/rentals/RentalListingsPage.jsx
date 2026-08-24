import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  Home,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { listRentalListingsForAgent } from '../../services/rentals/rentalListingDraftService'
import {
  buildRentalListingIndexRows,
  filterRentalListingIndexRows,
  formatRentalIndexStatusLabel,
  RENTAL_LISTING_STATUS_TABS,
  summarizeRentalListingIndexRows,
} from '../../services/rentals/rentalListingIndexModel'
import {
  buildRentalListingQueryOptions,
  resolveRentalWorkspaceScope,
} from '../../services/rentals/rentalWorkspaceScope'

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Not captured'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return 'Not captured'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function StatusBadge({ children, tone = 'neutral' }) {
  const toneClass = {
    success: 'border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]',
    warning: 'border-[#f5dfb6] bg-[#fff9ec] text-[#8a5b14]',
    info: 'border-[#cfe1f8] bg-[#f3f8ff] text-[#315f96]',
    neutral: 'border-[#dbe6f2] bg-white text-[#42617f]',
  }[tone] || 'border-[#dbe6f2] bg-white text-[#42617f]'

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  )
}

function summaryCard(icon, label, value, detail) {
  return (
    <article className="rounded-[8px] border border-[#dbe6f2] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#607891]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#18324b]">{value}</p>
          <p className="mt-1 text-sm text-[#607891]">{detail}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-[#f8fafc] text-[#42617f]">
          {icon}
        </span>
      </div>
    </article>
  )
}

function RentalListingIndexCard({ row, onOpen }) {
  const property24Status = String(row.property24Status || '').toLowerCase()
  const statusTone = row.statusGroup === 'published'
    ? 'success'
    : row.statusGroup === 'ready'
      ? 'info'
      : row.statusGroup === 'mandate'
        ? 'warning'
        : 'neutral'

  return (
    <article className="rounded-[8px] border border-[#dbe6f2] bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[96px_minmax(0,1fr)_minmax(260px,0.45fr)]">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[8px] border border-[#dbe6f2] bg-[#f8fafc] text-[#607891]">
          {row.imageUrl ? (
            <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Home size={28} aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone}>{formatRentalIndexStatusLabel(row.statusGroup)}</StatusBadge>
            <StatusBadge tone={property24Status === 'published' ? 'success' : 'neutral'}>
              P24 {formatRentalIndexStatusLabel(row.property24Status)}
            </StatusBadge>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-[#18324b]">{row.title}</h2>
          <p className="mt-1 text-sm text-[#607891]">{row.address || 'Address pending'}</p>
          <div className="mt-4 grid gap-3 text-sm text-[#203a54] sm:grid-cols-3">
            <span><strong>{formatCurrency(row.monthlyRent)}</strong><br />Monthly rent</span>
            <span><strong>{formatDate(row.availableFrom)}</strong><br />Available</span>
            <span><strong>{row.landlordName || 'Not captured'}</strong><br />Landlord</span>
          </div>
        </div>

        <div className="grid content-between gap-4 rounded-[8px] border border-[#edf2f7] bg-[#fbfdff] p-4">
          <div className="grid gap-2 text-sm text-[#42617f]">
            <div className="flex items-center justify-between gap-3">
              <span>Mandate</span>
              <strong className="text-right text-[#18324b]">{formatRentalIndexStatusLabel(row.mandateStatus)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Marketing</span>
              <strong className="text-right text-[#18324b]">{formatRentalIndexStatusLabel(row.marketingApprovalStatus)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Applications</span>
              <strong className="text-right text-[#18324b]">{row.applicationCount}</strong>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-[#607891]">Next action</p>
            <p className="mt-1 text-sm font-semibold text-[#18324b]">{row.nextAction}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#edf2f7] pt-4 text-xs font-semibold text-[#607891]">
        <span>{row.propertyType || 'Property type pending'}</span>
        <span>{row.bedrooms ?? '0'} beds</span>
        <span>{row.bathrooms ?? '0'} baths</span>
        <span>{row.parkingBays ?? '0'} parking</span>
        <span>{row.location || 'Location pending'}</span>
        <button type="button" className="ui-pill-button ml-auto" onClick={onOpen}>
          <Eye size={14} aria-hidden="true" />
          Open
        </button>
      </div>
    </article>
  )
}

export default function RentalListingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const workspaceContext = useWorkspace()
  const rentalScope = useMemo(() => resolveRentalWorkspaceScope(workspaceContext), [workspaceContext])
  const organisationId = rentalScope.organisationId
  const assignedAgentId = rentalScope.assignedAgentId
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [query, setQuery] = useState('')
  const [statusTab, setStatusTab] = useState('all')

  const rentalRows = useMemo(() => buildRentalListingIndexRows(listings), [listings])
  const summary = useMemo(() => summarizeRentalListingIndexRows(rentalRows), [rentalRows])
  const filteredRows = useMemo(
    () => filterRentalListingIndexRows(rentalRows, { query, status: statusTab }),
    [query, rentalRows, statusTab],
  )

  const loadListings = useCallback(async () => {
    if (!assignedAgentId || !organisationId) {
      setListings([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const rows = await listRentalListingsForAgent(assignedAgentId, buildRentalListingQueryOptions(rentalScope))
      setListings(rows)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load rental listings.')
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [assignedAgentId, organisationId, rentalScope])

  useEffect(() => {
    void loadListings()
  }, [loadListings])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    if (params.get('create') === 'rental') {
      navigate('/agent/rentals/listings/new', { replace: true })
    }
  }, [location.search, navigate])

  useEffect(() => {
    const createdTitle = location.state?.rentalListingCreatedTitle
    if (createdTitle) {
      setSuccessMessage(`${createdTitle} was captured as a rental listing draft.`)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  return (
    <section className="page-content">
      <div className="ui-section-stack">
        <header className="ui-toolbar">
          <div className="ui-toolbar-group">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]">
              <Home size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-[#607891]">Rentals</p>
              <h1 className="text-2xl font-semibold text-[#18324b]">Listings</h1>
              <p className="status-message">
                Manage rental stock, landlord readiness, marketing approval, Property24 status, and tenant demand.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ui-pill-button" onClick={loadListings} disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
              Refresh
            </button>
            <button type="button" className="ui-pill-button ui-pill-button-active" onClick={() => navigate('/agent/rentals/listings/new')}>
              <Plus size={16} aria-hidden="true" />
              Create Rental Listing
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCard(<Home size={18} aria-hidden="true" />, 'Rental stock', summary.total, 'Listings in this rental workspace')}
          {summaryCard(<ClipboardList size={18} aria-hidden="true" />, 'Mandates', summary.mandate, 'Need signed rental authority')}
          {summaryCard(<BadgeCheck size={18} aria-hidden="true" />, 'Ready to publish', summary.ready, 'Mandate and marketing approved')}
          {summaryCard(<Users size={18} aria-hidden="true" />, 'Applications', summary.applications, 'Listings with tenant activity')}
        </div>

        <div className="ui-panel ui-panel-body grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="relative min-w-[260px] flex-1">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b5]" aria-hidden="true" />
              <input
                className="w-full rounded-[8px] border border-[#dbe6f2] bg-white py-3 pl-10 pr-3 text-sm text-[#18324b] outline-none transition focus:border-[#2f7d4e] focus:ring-2 focus:ring-[#cfe8dc]"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rental, landlord, suburb, next action..."
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {RENTAL_LISTING_STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`ui-pill-button ${statusTab === tab.key ? 'ui-pill-button-active' : ''}`}
                  onClick={() => setStatusTab(tab.key)}
                >
                  {tab.label}
                  <span className="rounded-full bg-white/75 px-2 py-0.5 text-xs">
                    {tab.key === 'all' ? summary.total : summary[tab.key] || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}
        {successMessage ? (
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#cfe8dc] bg-[#f2fbf5] px-4 py-3 text-sm font-semibold text-[#286b43]">
            <CheckCircle2 size={16} aria-hidden="true" />
            {successMessage}
          </p>
        ) : null}

        <div className="grid gap-4">
          {loading ? (
            <div className="ui-panel ui-panel-body flex items-center gap-3 text-sm font-semibold text-[#42617f]">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Loading rental listings
            </div>
          ) : filteredRows.length ? (
            filteredRows.map((row) => (
              <RentalListingIndexCard
                key={row.id}
                row={row}
                onOpen={() => navigate(`/agent/rentals/listings/${encodeURIComponent(row.id)}`)}
              />
            ))
          ) : (
            <div className="rounded-[8px] border border-dashed border-[#dbe6f2] bg-white p-8 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-[#f8fafc] text-[#42617f]">
                <CalendarDays size={22} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-[#18324b]">No rental listings found</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-[#607891]">
                Create a rental listing draft or adjust the search and status filters.
              </p>
              <button type="button" className="ui-pill-button ui-pill-button-active mx-auto mt-4" onClick={() => navigate('/agent/rentals/listings/new')}>
                <Plus size={16} aria-hidden="true" />
                Create Rental Listing
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
